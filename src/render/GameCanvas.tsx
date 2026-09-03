// Skia board renderer — full cartoon art pass. Purely presentational: it
// draws the GameState it is given and never touches game logic. Animations
// never affect state.
//
// Animation architecture (see also src/render/pictures.ts):
// - Game state is discrete: React re-renders this tree once per applied
//   move, never per animation frame. All interpolation runs on the UI
//   thread through Reanimated shared values feeding Skia; the JS thread is
//   idle during a tween.
// - Each dog segment owns an animated pixel position that is retargeted
//   once per move DURING RENDER (not in an effect — an effect restart
//   would commit one frame at the final pose first, a visible flash).
//   A dog that ate remounts (hook counts depend on length) and animations
//   started during a mount render can be dropped, freezing the dog
//   mid-tween — so a mount-only effect re-kicks the same targets after
//   commit (idempotent; withTiming retargets from the current value).
//   Each segment's tween is a withSequence built from the dog's action
//   timeline (scene.ts buildDogTimeline): a MOVE_TWEEN_MS linear step,
//   then a gravity fall as ONE continuous ease-in tween over the fall
//   distance (duration scaled by rows, squash on landing). A snack eaten
//   mid-fall splits the fall: the head steps down onto it while the body
//   slides one tile forward and the new tail pops in, then the fall
//   resumes. The timeline is unwound from the per-dog fall rows and eat
//   rows reported by the rules — the renderer never re-derives gravity.
//   Because withTiming retargets from the current animated value, rapid
//   inputs and interrupted falls catch up smoothly instead of snapping.
// - Static layers (sky, board frame, terrain, snacks) are baked into
//   SkPictures rebuilt only on discrete changes, so an animated frame
//   replays two pictures instead of re-walking dozens of Path nodes.
// - Burst effects (dust, confetti, statue wash) mount only while active.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Canvas,
  Circle,
  Group,
  Line,
  Path,
  Picture,
  Rect,
  RoundedRect,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  BOARD_MARGIN,
  COLORS,
  CONFETTI_COUNT,
  CORNER_RADIUS_FRAC,
  DEATH_FX_MS,
  DEFAULT_COAT,
  DOOR_OPEN_MS,
  DUST_COUNT,
  EAR_FLAP_RADIANS,
  EXIT_BURST_MS,
  EXIT_PULSE_MS,
  EXIT_STEP_MS,
  GROW_TWEEN_MS,
  MOVE_TWEEN_MS,
  MUNCH_MS,
  MUNCH_SCALE,
  OUTLINE_FRAC,
  PACK_PALETTES,
  SQUASH_MS,
  SQUASH_SCALE,
  STATUE_WASH_MS,
  WAG_CYCLE_MS,
  WAG_RADIANS,
  WIN_FX_MS,
  type AccessoryId,
  type CoatColors,
  type PackPalette,
} from '../game/config';
import {
  isExitOpen,
  type Cell,
  type Dir,
  type Dog,
  type FallEats,
  type FallRows,
  type GameState,
} from '../game/rules';
import type { Feedback } from '../store/gameStore';
import {
  buildSkyPicture,
  buildBoardPicture,
} from './pictures';
import {
  buildActionTimelines,
  buildExitTimeline,
  exitDurationMs,
  hash01,
  newStatueCells,
  segmentGrounded,
  type DogTimeline,
  type Keyframe,
  type Layout,
} from './scene';

const px = (l: Layout, gx: number) => l.ox + gx * l.tile;
const py = (l: Layout, gy: number) => l.oy + gy * l.tile;

// Dog blob proportions (fractions of a tile). Fill passes are drawn after
// all outline passes so adjacent segments merge into one thick-outlined
// blob with a slight sausage-link waist at each joint.
const SEG_OUT = 0.94;
const SEG_FILL = 0.8;
const BRIDGE_OUT = 0.86;
const BRIDGE_FILL = 0.66;

// ---------------------------------------------------------------------------
// Exit dog door (open/closed states, glow pulse, flap swing)
// ---------------------------------------------------------------------------

function ExitDoor({
  state,
  layout,
  pulse,
  bump,
}: {
  state: GameState;
  layout: Layout;
  pulse: SharedValue<number>;
  bump: SharedValue<number>;
}) {
  const t = layout.tile;
  const open = isExitOpen(state);
  const x0 = px(layout, state.exit.x);
  const y0 = py(layout, state.exit.y);

  const openSv = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    openSv.value = withTiming(open ? 1 : 0, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [open, openSv]);

  // Bump scale around the door center (idle at 1) on exit burst.
  const cx = x0 + t / 2;
  const cy = y0 + t / 2;
  const bumpTf = useDerivedValue(() => [
    { translateX: cx },
    { translateY: cy },
    { scale: bump.value },
    { translateX: -cx },
    { translateY: -cy },
  ]);

  const glowR = useDerivedValue(() => t * (0.58 + 0.12 * pulse.value) * openSv.value);
  const glowR2 = useDerivedValue(() => t * (0.85 + 0.18 * pulse.value) * openSv.value);
  const glowO = useDerivedValue(() => 0.5 * openSv.value);
  const glowO2 = useDerivedValue(() => 0.18 * openSv.value);

  // Flap hinged at the top: swings up/away as the door opens.
  const hinge = y0 + t * 0.12;
  const flapTf = useDerivedValue(() => [
    { translateY: hinge },
    { scaleY: 1 - 0.8 * openSv.value },
    { translateY: -hinge },
  ]);

  return (
    <Group transform={bumpTf}>
      <Circle cx={x0 + t / 2} cy={y0 + t / 2} r={glowR2} color={COLORS.exitGlow} opacity={glowO2} />
      <Circle cx={x0 + t / 2} cy={y0 + t / 2} r={glowR} color={COLORS.exitGlow} opacity={glowO} />
      <RoundedRect
        x={x0 + t * 0.06} y={y0 + t * 0.02} width={t * 0.88} height={t * 0.96} r={t * 0.3}
        color={COLORS.outline} style="stroke" strokeWidth={t * OUTLINE_FRAC}
      />
      <RoundedRect
        x={x0 + t * 0.06} y={y0 + t * 0.02} width={t * 0.88} height={t * 0.96} r={t * 0.3}
        color={COLORS.exitFrame}
      />
      {/* Doorway: warm light when open, dark when shut. */}
      <RoundedRect
        x={x0 + t * 0.16} y={y0 + t * 0.12} width={t * 0.68} height={t * 0.84} r={t * 0.26}
        color={open ? COLORS.exitLight : '#2E2018'}
      />
      <Group transform={flapTf}>
        <RoundedRect
          x={x0 + t * 0.16} y={y0 + t * 0.12} width={t * 0.68} height={t * 0.84} r={t * 0.26}
          color={COLORS.exitFlap}
        />
        {/* Paw print on the flap. */}
        <RoundedRect
          x={x0 + t * 0.38} y={y0 + t * 0.5} width={t * 0.24} height={t * 0.17} r={t * 0.085}
          color={COLORS.exitFrame}
        />
        <Circle cx={x0 + t * 0.38} cy={y0 + t * 0.44} r={t * 0.055} color={COLORS.exitFrame} />
        <Circle cx={x0 + t * 0.5} cy={y0 + t * 0.4} r={t * 0.06} color={COLORS.exitFrame} />
        <Circle cx={x0 + t * 0.62} cy={y0 + t * 0.44} r={t * 0.055} color={COLORS.exitFrame} />
      </Group>
    </Group>
  );
}

/** Door light burst: a growing/fading glow circle timed to the head's
 *  arrival at the doorway (EXIT_STEP_MS into the exit walk). */
function DoorBurst({ layout, exit }: { layout: Layout; exit: Cell }) {
  const t = layout.tile;
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(
      EXIT_STEP_MS,
      withTiming(1, { duration: EXIT_BURST_MS, easing: Easing.out(Easing.quad) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cx = px(layout, exit.x) + t / 2;
  const cy = py(layout, exit.y) + t / 2;
  const r = useDerivedValue(() => t * (0.4 + 1.3 * v.value));
  const o = useDerivedValue(() => 0.75 * (1 - v.value));
  return <Circle cx={cx} cy={cy} r={r} color={COLORS.exitGlow} opacity={o} />;
}

// ---------------------------------------------------------------------------
// Dog house (door swings open when a new dog spawns)
// ---------------------------------------------------------------------------

function DogHouse({
  state,
  layout,
  door,
}: {
  state: GameState;
  layout: Layout;
  door: SharedValue<number>;
}) {
  const t = layout.tile;
  const house = state.doghouse;
  const hingeX = (house ? px(layout, house.x) : 0) + t * 0.32;
  const doorTf = useDerivedValue(() => [
    { translateX: hingeX },
    { scaleX: 1 - 0.88 * door.value },
    { translateX: -hingeX },
  ]);
  if (!house) return null;

  const x0 = px(layout, house.x);
  const y0 = py(layout, house.y);
  const roof = `M${x0 - t * 0.04} ${y0 + t * 0.42}L${x0 + t * 0.5} ${y0 - t * 0.02}L${x0 + t * 1.04} ${y0 + t * 0.42}Z`;

  return (
    <Group>
      <RoundedRect
        x={x0 + t * 0.06} y={y0 + t * 0.34} width={t * 0.88} height={t * 0.64} r={t * 0.08}
        color={COLORS.outline} style="stroke" strokeWidth={t * OUTLINE_FRAC * 0.9}
      />
      <RoundedRect
        x={x0 + t * 0.06} y={y0 + t * 0.34} width={t * 0.88} height={t * 0.64} r={t * 0.08}
        color={COLORS.doghouse}
      />
      {/* Dark doorway behind the swinging flap. */}
      <RoundedRect
        x={x0 + t * 0.32} y={y0 + t * 0.54} width={t * 0.36} height={t * 0.44} r={t * 0.17}
        color={COLORS.doghouseDoor}
      />
      <Group transform={doorTf}>
        <RoundedRect
          x={x0 + t * 0.32} y={y0 + t * 0.54} width={t * 0.36} height={t * 0.44} r={t * 0.17}
          color={COLORS.doghouseFlap}
        />
      </Group>
      <Path path={roof} color={COLORS.outline} style="stroke" strokeWidth={t * OUTLINE_FRAC * 0.9} strokeJoin="round" />
      <Path path={roof} color={COLORS.doghouseRoof} />
      {/* Little bone sign under the eave. */}
      <RoundedRect x={x0 + t * 0.4} y={y0 + t * 0.44} width={t * 0.2} height={t * 0.07} r={t * 0.035} color={COLORS.bone} />
      <Circle cx={x0 + t * 0.4} cy={y0 + t * 0.455} r={t * 0.045} color={COLORS.bone} />
      <Circle cx={x0 + t * 0.4} cy={y0 + t * 0.5} r={t * 0.045} color={COLORS.bone} />
      <Circle cx={x0 + t * 0.6} cy={y0 + t * 0.455} r={t * 0.045} color={COLORS.bone} />
      <Circle cx={x0 + t * 0.6} cy={y0 + t * 0.5} r={t * 0.045} color={COLORS.bone} />
    </Group>
  );
}

// ---------------------------------------------------------------------------
// The dachshund
// ---------------------------------------------------------------------------

function headFacing(cells: readonly Cell[]): Dir {
  if (cells.length < 2) return 'right';
  const [head, neck] = cells;
  if (head.x > neck.x) return 'right';
  if (head.x < neck.x) return 'left';
  if (head.y < neck.y) return 'up';
  return 'down';
}

function tailAngleFor(cells: readonly Cell[]): number {
  if (cells.length < 2) return Math.PI;
  const tail = cells[cells.length - 1];
  const before = cells[cells.length - 2];
  if (tail.x > before.x) return 0;
  if (tail.x < before.x) return Math.PI;
  if (tail.y < before.y) return -Math.PI / 2;
  return Math.PI / 2;
}

interface DogViewProps {
  cells: readonly Cell[];
  grounded: readonly boolean[];
  /** What happened to this dog this action, as per-segment keyframes. */
  timeline: DogTimeline;
  active: boolean;
  exitOpen: boolean;
  layout: Layout;
  /** Identity of the current GameState — keys the once-per-move retarget. */
  stateRef: GameState;
  moveClock: SharedValue<number>;
  wag: SharedValue<number>;
  /** Equipped cosmetics (only visible on the active dog). */
  coat: CoatColors;
  accessory: AccessoryId | null;
}

/** Keyframe → the withTiming leg that plays it (fall legs ease in). */
function legAnim(k: Keyframe, target: number) {
  return withTiming(target, {
    duration: k.ms,
    easing: k.kind === 'fall' ? Easing.in(Easing.quad) : Easing.linear,
  });
}

/**
 * One live dog. Hook count depends on cells.length, so the parent keys this
 * component by `${dog.id}:${cells.length}` — any length change remounts.
 */
function DogView({
  cells, grounded, timeline, active, exitOpen, layout, stateRef, moveClock, wag, coat, accessory,
}: DogViewProps) {
  const t = layout.tile;
  const n = cells.length;
  const half = t / 2;
  const body = active ? coat.body : COLORS.dogInactive;
  const earColor = active ? coat.ear : COLORS.dogInactiveEar;
  const bellyColor = active ? coat.belly : COLORS.dogBelly;

  // Per-segment animated pixel origin (top-left), seeded at the timeline's
  // start position on mount. All interpolation below happens on the UI thread.
  const xs = cells.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSharedValue(px(layout, timeline.from[i].x)),
  );
  const ys = cells.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSharedValue(py(layout, timeline.from[i].y)),
  );
  const squash = useSharedValue(1);

  // Grow pop per segment: a segment born this action (move-eat tail, or a
  // tail added by a mid-fall eat) sits at scale 0 on its birth cell and
  // inflates into place at its pop time — no sequenced multi-phase movement.
  const pops = cells.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSharedValue(timeline.popAt[i] === null ? 1 : 0),
  );

  // Munch pulse (head scale + jaw), one pulse per eat at its timeline time.
  const munch = useSharedValue(1);

  // Retarget every segment along its track. Runs during render for
  // in-place updates (see the header note), and once more after commit for
  // the remount that follows a grow, whose render-phase animation starts
  // can be dropped. Both runs aim at the same targets, so the double start
  // is harmless.
  const retarget = () => {
    for (let i = 0; i < n; i++) {
      const track = timeline.tracks[i];
      const [x0, ...xr] = track.map((k) => legAnim(k, px(layout, k.x)));
      const [y0, ...yr] = track.map((k) => legAnim(k, py(layout, k.y)));
      xs[i].value = withSequence(x0, ...xr);
      ys[i].value = withSequence(y0, ...yr);
      const pop = timeline.popAt[i];
      if (pop !== null) {
        pops[i].value = 0;
        pops[i].value = withDelay(
          pop,
          withTiming(1, { duration: GROW_TWEEN_MS, easing: Easing.out(Easing.quad) }),
        );
      }
      const vanish = timeline.vanishAt[i];
      if (vanish !== null) {
        pops[i].value = withDelay(
          vanish,
          withTiming(0, { duration: GROW_TWEEN_MS, easing: Easing.in(Easing.quad) }),
        );
      }
    }
    squash.value = 1;
    if (timeline.landAt > 0) {
      squash.value = withDelay(
        timeline.landAt,
        withSequence(
          withTiming(SQUASH_SCALE, { duration: SQUASH_MS, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 9, stiffness: 420 }),
        ),
      );
    }
    if (timeline.eatAt.length > 0) {
      // Hold at 0 (no pulse) until each eat, then sweep 0→1 over MUNCH_MS.
      munch.value = 0;
      const legs: number[] = [];
      let at = 0;
      for (const e of timeline.eatAt) {
        legs.push(
          withTiming(0, { duration: Math.max(0, e - at) }) as unknown as number,
          withTiming(1, { duration: MUNCH_MS, easing: Easing.linear }) as unknown as number,
        );
        at = Math.max(e, at) + MUNCH_MS;
      }
      const [m0, ...mr] = legs;
      munch.value = withSequence(m0, ...mr);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(retarget, [stateRef, layout]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(retarget, []);

  // One derived transform per segment; reused by every pass that draws it.
  // Each segment carries its grow pop scale (1 except while inflating).
  const segTfs = cells.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const p = pops[i].value;
      return [
        { translateX: xs[i].value + half },
        { translateY: ys[i].value + half },
        { scale: p },
        { translateX: -half },
        { translateY: -half },
      ];
    }),
  );

  // One shared center point per segment for the joint bridges.
  const centers = cells.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => ({ x: xs[i].value + half, y: ys[i].value + half })),
  );

  // Landing squash: whole-dog scale pivoted at the dog's ground line.
  const pivotPx = px(layout, (Math.min(...cells.map((c) => c.x)) + Math.max(...cells.map((c) => c.x)) + 1) / 2);
  const bottomPy = py(layout, Math.max(...cells.map((c) => c.y)) + 1);
  const dogTf = useDerivedValue(() => {
    const s = squash.value;
    return [
      { translateX: pivotPx },
      { translateY: bottomPy },
      { scaleX: 1 + (1 - s) * 0.9 },
      { scaleY: s },
      { translateX: -pivotPx },
      { translateY: -bottomPy },
    ];
  });

  // Head details: munch pulse + facing orientation, all around tile center.
  const facing = headFacing(cells);
  const headFlip = facing === 'left' ? -1 : 1;
  const headRot = facing === 'up' ? -Math.PI / 2 : facing === 'down' ? Math.PI / 2 : 0;
  const headTf = useDerivedValue(() => {
    const pulse = 1 + MUNCH_SCALE * Math.sin(Math.min(munch.value, 1) * Math.PI);
    return [
      { translateX: xs[0].value + half },
      { translateY: ys[0].value + half },
      { scale: pulse },
      { scaleX: headFlip },
      { rotate: headRot },
      { translateX: -half },
      { translateY: -half },
    ];
  });

  // Floppy ear flaps while moving (and settles when still).
  const earTf = useDerivedValue(() => {
    const a = EAR_FLAP_RADIANS * Math.sin(moveClock.value * Math.PI);
    return [
      { translateX: t * 0.36 },
      { translateY: t * 0.16 },
      { rotate: a },
      { translateX: -t * 0.36 },
      { translateY: -t * 0.16 },
    ];
  });

  // Jaw opens with the munch pulse.
  const jawTf = useDerivedValue(() => {
    const open = Math.sin(Math.min(munch.value, 1) * Math.PI);
    return [{ translateY: t * 0.68 }, { scaleY: 0.15 + 0.85 * open }, { translateY: -t * 0.68 }];
  });

  // Tail wag when idle at an open exit (amplitude gated, loop always runs).
  const baseTailAngle = tailAngleFor(cells);
  const wagOn = active && exitOpen;
  const tailTf = useDerivedValue(() => {
    const a = baseTailAngle + (wagOn ? WAG_RADIANS * Math.sin(wag.value * Math.PI * 2) : 0);
    return [
      { translateX: xs[n - 1].value + half },
      { translateY: ys[n - 1].value + half },
      { scale: pops[n - 1].value },
      { rotate: a },
      { translateX: -half },
      { translateY: -half },
    ];
  });

  const ow = t * OUTLINE_FRAC;
  const segPad = (1 - SEG_OUT) / 2;
  const fillPad = (1 - SEG_FILL) / 2;
  const tail = `M${t * 0.52} ${t * 0.4}Q${t * 0.95} ${t * 0.28} ${t * 1.16} ${t * 0.38}Q${t * 1.23} ${t * 0.5} ${t * 1.16} ${t * 0.62}Q${t * 0.95} ${t * 0.72} ${t * 0.52} ${t * 0.6}Z`;
  const ear = `M${t * 0.14} ${t * 0.12}Q${t * 0.42} ${t * 0.04} ${t * 0.44} ${t * 0.3}Q${t * 0.46} ${t * 0.56} ${t * 0.3} ${t * 0.62}Q${t * 0.12} ${t * 0.6} ${t * 0.12} ${t * 0.36}Z`;

  return (
    <Group transform={dogTf} opacity={active ? 1 : 0.88}>
      {/* Tail (behind the body). */}
      <Group transform={tailTf}>
        <Path path={tail} color={COLORS.outline} style="stroke" strokeWidth={ow} strokeJoin="round" />
        <Path path={tail} color={body} />
      </Group>

      {/* Stubby legs under grounded segments. */}
      {cells.map((_, i) =>
        grounded[i] ? (
          <Group key={`leg${i}`} transform={segTfs[i]}>
            {[t * 0.16, t * 0.6].map((lx) => (
              <Group key={lx}>
                <RoundedRect
                  x={lx - t * 0.02} y={t * 0.78} width={t * 0.2} height={t * 0.34} r={t * 0.08}
                  color={COLORS.outline}
                />
                <RoundedRect
                  x={lx + t * 0.01} y={t * 0.8} width={t * 0.14} height={t * 0.28} r={t * 0.06}
                  color={body}
                />
              </Group>
            ))}
          </Group>
        ) : null,
      )}

      {/* Outline pass: segments + joint bridges (drawn before every fill). */}
      {cells.map((_, i) => (
        <Group key={`o${i}`} transform={segTfs[i]}>
          <RoundedRect
            x={t * segPad} y={t * segPad} width={t * SEG_OUT} height={t * SEG_OUT}
            r={t * SEG_OUT * CORNER_RADIUS_FRAC} color={COLORS.outline}
          />
        </Group>
      ))}
      {cells.slice(1).map((_, i) => (
        <Line
          key={`ob${i}`} p1={centers[i]} p2={centers[i + 1]}
          color={COLORS.outline} style="stroke" strokeWidth={t * BRIDGE_OUT} strokeCap="round"
        />
      ))}

      {/* Fill pass. */}
      {cells.slice(1).map((_, i) => (
        <Line
          key={`fb${i}`} p1={centers[i]} p2={centers[i + 1]}
          color={body} style="stroke" strokeWidth={t * BRIDGE_FILL} strokeCap="round"
        />
      ))}
      {cells.map((_, i) => (
        <Group key={`f${i}`} transform={segTfs[i]}>
          <RoundedRect
            x={t * fillPad} y={t * fillPad} width={t * SEG_FILL} height={t * SEG_FILL}
            r={t * SEG_FILL * CORNER_RADIUS_FRAC} color={body}
          />
          {/* Belly highlight. */}
          <RoundedRect
            x={t * 0.28} y={t * 0.56} width={t * 0.44} height={t * 0.2} r={t * 0.1}
            color={bellyColor} opacity={0.55}
          />
        </Group>
      ))}

      {/* Head details: ear, snout, big eyes (local space faces right). */}
      <Group transform={headTf}>
        <Group transform={earTf}>
          <Path path={ear} color={COLORS.outline} style="stroke" strokeWidth={ow * 0.7} strokeJoin="round" />
          <Path path={ear} color={earColor} />
        </Group>

        {/* Snout + nose + mouth. */}
        <RoundedRect
          x={t * 0.62} y={t * 0.42} width={t * 0.48} height={t * 0.28} r={t * 0.13}
          color={COLORS.outline} style="stroke" strokeWidth={ow * 0.7}
        />
        <RoundedRect
          x={t * 0.62} y={t * 0.42} width={t * 0.48} height={t * 0.28} r={t * 0.13}
          color={bellyColor}
        />
        <Group transform={jawTf}>
          <RoundedRect x={t * 0.72} y={t * 0.66} width={t * 0.26} height={t * 0.16} r={t * 0.07} color={COLORS.outline} />
          <RoundedRect x={t * 0.75} y={t * 0.68} width={t * 0.2} height={t * 0.11} r={t * 0.05} color={COLORS.tongue} />
        </Group>
        <Circle cx={t * 1.02} cy={t * 0.5} r={t * 0.08} color={COLORS.nose} />

        {/* Big expressive eyes with highlights (lidded when inactive). */}
        {[
          { cx: t * 0.3, cy: t * 0.34, r: t * 0.135 },
          { cx: t * 0.58, cy: t * 0.34, r: t * 0.15 },
        ].map((e, i) => (
          <Group key={`eye${i}`}>
            <Circle cx={e.cx} cy={e.cy} r={e.r} color={COLORS.outline} style="stroke" strokeWidth={ow * 0.5} />
            <Circle cx={e.cx} cy={e.cy} r={e.r} color={COLORS.eyeWhite} />
            <Circle cx={e.cx + t * 0.045} cy={e.cy + t * 0.015} r={t * 0.065} color={COLORS.eyePupil} />
            <Circle cx={e.cx + t * 0.02} cy={e.cy - t * 0.02} r={t * 0.026} color={COLORS.eyeWhite} />
            {!active && (
              <RoundedRect
                x={e.cx - e.r} y={e.cy - e.r} width={e.r * 2} height={e.r * 1.05} r={e.r * 0.5}
                color={COLORS.dogInactive}
              />
            )}
          </Group>
        ))}
        <Circle cx={t * 0.3} cy={t * 0.56} r={t * 0.05} color={COLORS.blush} opacity={0.55} />

        {active && renderAccessory(accessory, t, ow)}
      </Group>
    </Group>
  );
}

/** One head-local accessory drawing, drawn after the eyes (local space
 *  faces right, t = tile). Returns null for no accessory. */
function renderAccessory(accessory: AccessoryId | null, t: number, ow: number) {
  if (!accessory) return null;
  switch (accessory) {
    case 'bandana': {
      const path = `M${t * 0.02} ${t * 0.5}L${t * 0.34} ${t * 0.5}L${t * 0.16} ${t * 0.9}Z`;
      return (
        <Group key="acc">
          <Path path={path} color={COLORS.outline} style="stroke" strokeWidth={ow * 0.6} strokeJoin="round" />
          <Path path={path} color="#D9534F" />
        </Group>
      );
    }
    case 'bow': {
      const cx = t * 0.3;
      const cy = t * 0.06;
      const ew = t * 0.2;
      const eh = t * 0.14;
      return (
        <Group key="acc">
          {[-1, 1].map((side) => (
            <Group key={side}>
              <RoundedRect
                x={cx + side * ew * 0.55 - ew / 2} y={cy - eh / 2} width={ew} height={eh} r={eh * 0.45}
                color={COLORS.outline} style="stroke" strokeWidth={ow * 0.5}
              />
              <RoundedRect
                x={cx + side * ew * 0.55 - ew / 2} y={cy - eh / 2} width={ew} height={eh} r={eh * 0.45}
                color="#F27D93"
              />
            </Group>
          ))}
          <Circle cx={cx} cy={cy} r={t * 0.05} color={COLORS.outline} style="stroke" strokeWidth={ow * 0.5} />
          <Circle cx={cx} cy={cy} r={t * 0.05} color="#F27D93" />
        </Group>
      );
    }
    case 'party-hat': {
      const apex = { x: t * 0.42, y: -t * 0.38 };
      const baseL = { x: t * 0.18, y: t * 0.14 };
      const baseR = { x: t * 0.66, y: t * 0.14 };
      const path = `M${apex.x} ${apex.y}L${baseR.x} ${baseR.y}L${baseL.x} ${baseL.y}Z`;
      return (
        <Group key="acc">
          <Path path={path} color={COLORS.outline} style="stroke" strokeWidth={ow * 0.6} strokeJoin="round" />
          <Path path={path} color="#5AA9FF" />
          <Line
            p1={{ x: apex.x - t * 0.04, y: apex.y + t * 0.18 }}
            p2={{ x: baseL.x + t * 0.08, y: baseL.y - t * 0.02 }}
            color="#FFD542" style="stroke" strokeWidth={t * 0.06}
          />
          <Line
            p1={{ x: apex.x + t * 0.04, y: apex.y + t * 0.18 }}
            p2={{ x: baseR.x - t * 0.08, y: baseR.y - t * 0.02 }}
            color="#FFD542" style="stroke" strokeWidth={t * 0.06}
          />
          <Circle cx={apex.x} cy={apex.y} r={t * 0.07} color={COLORS.outline} style="stroke" strokeWidth={ow * 0.5} />
          <Circle cx={apex.x} cy={apex.y} r={t * 0.07} color="#FFFFFF" />
        </Group>
      );
    }
    case 'sunglasses': {
      const lw = t * 0.3;
      const lh = t * 0.2;
      const c1 = { x: t * 0.3, y: t * 0.34 };
      const c2 = { x: t * 0.58, y: t * 0.34 };
      return (
        <Group key="acc">
          <Line
            p1={{ x: c1.x + lw / 2, y: c1.y }} p2={{ x: c2.x - lw / 2, y: c2.y }}
            color="#231512" style="stroke" strokeWidth={t * 0.03}
          />
          {[c1, c2].map((c, i) => (
            <Group key={i}>
              <RoundedRect
                x={c.x - lw / 2} y={c.y - lh / 2} width={lw} height={lh} r={lh * 0.35}
                color={COLORS.outline} style="stroke" strokeWidth={ow * 0.5}
              />
              <RoundedRect x={c.x - lw / 2} y={c.y - lh / 2} width={lw} height={lh} r={lh * 0.35} color="#231512" />
              <RoundedRect
                x={c.x - lw * 0.28} y={c.y - lh * 0.28} width={lw * 0.22} height={lh * 0.22} r={lh * 0.08}
                color="#FFFFFF" opacity={0.55}
              />
            </Group>
          ))}
        </Group>
      );
    }
    case 'crown': {
      const y0 = t * 0.02;
      const yTop = -t * 0.24;
      const yBand = y0 + t * 0.1;
      const x0c = t * 0.12;
      const x1c = t * 0.72;
      const w = x1c - x0c;
      const path =
        `M${x0c} ${yBand}L${x0c} ${y0}L${x0c + w * 0.17} ${yTop}L${x0c + w * 0.33} ${y0}` +
        `L${x0c + w * 0.5} ${yTop}L${x0c + w * 0.67} ${y0}L${x0c + w * 0.83} ${yTop}` +
        `L${x1c} ${y0}L${x1c} ${yBand}Z`;
      return (
        <Group key="acc">
          <Path path={path} color={COLORS.outline} style="stroke" strokeWidth={ow * 0.6} strokeJoin="round" />
          <Path path={path} color="#FFD542" />
          <Circle cx={x0c + w * 0.5} cy={yTop + t * 0.06} r={t * 0.045} color={COLORS.outline} style="stroke" strokeWidth={ow * 0.4} />
          <Circle cx={x0c + w * 0.5} cy={yTop + t * 0.06} r={t * 0.045} color="#D9534F" />
        </Group>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Burst FX (mounted only while active)
// ---------------------------------------------------------------------------

/** Grey wash fading IN over freshly petrified cells (dog color fades out). */
function StatueWash({
  cells, layout, color,
}: {
  cells: readonly Cell[]; layout: Layout; color: string;
}) {
  const t = layout.tile;
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(1, { duration: STATUE_WASH_MS, easing: Easing.out(Easing.quad) });
  }, [v]);
  const opacity = useDerivedValue(() => 1 - v.value);
  return (
    <Group opacity={opacity}>
      {cells.map((c) => (
        <RoundedRect
          key={`${c.x},${c.y}`}
          x={px(layout, c.x) + t * 0.05} y={py(layout, c.y) + t * 0.05}
          width={t * 0.9} height={t * 0.9} r={t * 0.22} color={color}
        />
      ))}
    </Group>
  );
}

/** Dust puff + fast-rewind chevrons + white flash on death-undo. */
function DeathFx({
  cx, cy, layout, boardW, boardH,
}: {
  cx: number; cy: number; layout: Layout; boardW: number; boardH: number;
}) {
  const t = layout.tile;
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(1, { duration: DEATH_FX_MS, easing: Easing.out(Easing.quad) });
  }, [v]);

  const flashO = useDerivedValue(() => 0.35 * Math.max(0, 1 - v.value * 2.4));
  const chevTf = useDerivedValue(() => [{ translateX: (0.5 - v.value) * boardW * 0.28 }]);
  const chevO = useDerivedValue(() => (v.value < 0.12 ? v.value / 0.12 : Math.max(0, 1 - v.value)));

  const chevron = (x: number) =>
    `M${x} ${cy}L${x + t * 0.55} ${cy - t * 0.42}V${cy + t * 0.42}Z` +
    `M${x + t * 0.62} ${cy}L${x + t * 1.17} ${cy - t * 0.42}V${cy + t * 0.42}Z`;

  return (
    <Group>
      <Rect x={layout.ox - BOARD_MARGIN} y={layout.oy - BOARD_MARGIN} width={boardW} height={boardH} color="#FFFFFF" opacity={flashO} />
      {Array.from({ length: DUST_COUNT }, (_, i) => {
        const ang = (i / DUST_COUNT) * Math.PI * 2 + hash01(i, 91) * 0.8;
        const speed = 0.55 + 0.55 * hash01(i, 92);
        const sizeK = 0.7 + 0.6 * hash01(i, 93);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const dcx = useDerivedValue(() => cx + Math.cos(ang) * t * speed * v.value);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const dcy = useDerivedValue(() => cy + Math.sin(ang) * t * speed * v.value - t * 0.25 * v.value);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const dr = useDerivedValue(() => t * (0.2 - 0.14 * v.value) * sizeK);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const dop = useDerivedValue(() => 0.9 * (1 - v.value));
        return <Circle key={i} cx={dcx} cy={dcy} r={dr} color={COLORS.dust} opacity={dop} />;
      })}
      <Group transform={chevTf} opacity={chevO}>
        <Path path={chevron(cx - t * 1.9)} color={COLORS.rewind} />
      </Group>
    </Group>
  );
}

/** Confetti burst on level clear. `delayMs` holds it invisible (e.g. while
 *  the winning dog is still walking into the door). */
function Confetti({ width, height, delayMs = 0 }: { width: number; height: number; delayMs?: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delayMs, withTiming(1, { duration: WIN_FX_MS, easing: Easing.linear }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const groupOpacity = useDerivedValue(() => (v.value === 0 ? 0 : 1));

  return (
    <Group opacity={groupOpacity}>
      {Array.from({ length: CONFETTI_COUNT }, (_, i) => {
        const x0 = width * hash01(i, 71);
        const fall = 0.75 + 0.6 * hash01(i, 72);
        const wobble = 2 + 3 * hash01(i, 73);
        const phase = Math.PI * 2 * hash01(i, 74);
        const spin = (hash01(i, 75) - 0.5) * 14;
        const size = width * (0.012 + 0.012 * hash01(i, 76));
        const color = COLORS.confetti[i % COLORS.confetti.length];
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const tf = useDerivedValue(() => [
          { translateX: x0 + Math.sin(v.value * wobble * Math.PI + phase) * width * 0.04 },
          { translateY: -height * 0.08 + v.value * fall * height * 1.15 },
          { rotate: v.value * spin },
        ]);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const op = useDerivedValue(() => (v.value < 0.82 ? 1 : Math.max(0, (1 - v.value) / 0.18)));
        return (
          <Group key={i} transform={tf} opacity={op}>
            <RoundedRect x={-size} y={-size * 0.6} width={size * 2} height={size * 1.2} r={size * 0.3} color={color} />
          </Group>
        );
      })}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export function GameCanvas({
  state,
  prevState,
  fallRows,
  fallEats,
  width,
  height,
  pack,
  feedback,
  feedbackTick,
  won,
  exited = null,
  highlight = [],
  coat = DEFAULT_COAT,
  accessory = null,
  palette,
}: {
  state: GameState;
  prevState: GameState | null;
  fallRows: FallRows;
  fallEats: FallEats;
  width: number;
  height: number;
  pack: number;
  feedback: Feedback;
  feedbackTick: number;
  won: boolean;
  /** The dog that just walked out the exit this action, if any. */
  exited?: Dog | null;
  /** Cells to draw a pulsing highlight ring on (used by the tutorial). */
  highlight?: readonly Cell[];
  coat?: CoatColors;
  accessory?: AccessoryId | null;
  /** Overrides PACK_PALETTES[pack] when present (equipped theme). */
  palette?: PackPalette;
}) {
  const pal = palette ?? PACK_PALETTES[((pack % PACK_PALETTES.length) + PACK_PALETTES.length) % PACK_PALETTES.length];

  const moveClock = useSharedValue(1);
  const pulse = useSharedValue(0);
  const wag = useSharedValue(0);
  const door = useSharedValue(0);
  const shake = useSharedValue(1);
  const bump = useSharedValue(1);

  // Cosmetic per-move clock (ear flap). Restarted during render for the
  // same no-flash reason as the segment retarget in DogView.
  useMemo(() => {
    moveClock.value = 0;
    moveClock.value = withTiming(1, { duration: MOVE_TWEEN_MS, easing: Easing.linear });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Ambient loops (glow pulse, wag clock) — started once.
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: EXIT_PULSE_MS / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: EXIT_PULSE_MS / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    wag.value = withRepeat(withTiming(1, { duration: WAG_CYCLE_MS, easing: Easing.linear }), -1);
  }, [pulse, wag]);

  // Event-driven juice triggers (landing squash and munch live in DogView,
  // timed to each dog's own action timeline).
  useEffect(() => {
    if (feedbackTick === 0) return;
    if (feedback.kind === 'dead') {
      shake.value = 0;
      shake.value = withTiming(1, { duration: DEATH_FX_MS, easing: Easing.out(Easing.quad) });
      return;
    }
    if (feedback.kind !== 'events') return;
    const ev = feedback.events;
    if (ev.includes('spawned')) {
      door.value = 0;
      door.value = withSequence(
        withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
        withDelay(DOOR_OPEN_MS - 550, withTiming(0, { duration: 330, easing: Easing.in(Easing.quad) })),
      );
    }
    if (ev.includes('dogExited')) {
      bump.value = 1;
      bump.value = withDelay(
        EXIT_STEP_MS,
        withSequence(
          withTiming(1.12, { duration: EXIT_BURST_MS / 2, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: EXIT_BURST_MS / 2, easing: Easing.in(Easing.quad) }),
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackTick]);

  // Dogs currently walking into the exit (in-flight; may include one whose
  // move also won the level). Each entry is removed once its walk finishes,
  // and never rendered if the player has since undone the exit.
  const [exits, setExits] = useState<{ id: number; cells: readonly Cell[]; tick: number }[]>([]);
  const exitTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (!exited) return;
    const tick = feedbackTick;
    setExits((xs) => [...xs, { id: exited.id, cells: exited.cells, tick }]);
    const timer = setTimeout(() => {
      setExits((xs) => xs.filter((x) => x.tick !== tick));
      exitTimers.current.delete(tick);
    }, exitDurationMs(exited.cells.length));
    exitTimers.current.set(tick, timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exited, feedbackTick]);
  useEffect(
    () => () => {
      exitTimers.current.forEach(clearTimeout);
    },
    [],
  );
  // A player undo brings the dog back onto the board — stop drawing its
  // in-flight exit view immediately rather than waiting out the timer.
  const liveDogIds = useMemo(() => new Set(state.dogs.map((d) => d.id)), [state.dogs]);
  const visibleExits = exits.filter((e) => !liveDogIds.has(e.id));

  // Board shake on death (identity when idle: shake rests at 1).
  const rootTf = useDerivedValue(() => [
    { translateX: Math.sin(shake.value * Math.PI * 7) * 7 * (1 - shake.value) },
  ]);

  const layout = useMemo<Layout>(() => {
    const tile = Math.floor(
      Math.min((width - BOARD_MARGIN * 2) / state.width, (height - BOARD_MARGIN * 2) / state.height),
    );
    const ox = Math.floor((width - tile * state.width) / 2);
    const oy = Math.floor((height - tile * state.height) / 2);
    return { tile, ox, oy };
  }, [width, height, state.width, state.height]);

  // Static layers as recorded pictures — replayed, not re-walked, on every
  // animated frame. Rebuilt only when the sets they draw change identity
  // (the rules keep unchanged sets referentially stable across moves).
  const skyPicture = useMemo(() => buildSkyPicture(width, height, pal), [width, height, pal]);
  const boardPicture = useMemo(
    () => buildBoardPicture(state, layout, pal, width, height),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.walls, state.spikes, state.freezeTiles, state.statues, state.snacks,
     state.width, state.height, layout, pal, width, height],
  );

  const washCells = useMemo(() => newStatueCells(state, prevState), [state, prevState]);
  // Per-dog action timelines (step, falls, mid-fall eats) for this state.
  const timelines = useMemo(
    () => buildActionTimelines(state, prevState, fallRows, fallEats),
    [state, prevState, fallRows, fallEats],
  );
  const exitOpen = isExitOpen(state);

  if (width <= 0 || height <= 0 || layout.tile <= 0) return null;

  const boardW = layout.tile * state.width + BOARD_MARGIN * 2;
  const boardH = layout.tile * state.height + BOARD_MARGIN * 2;
  const deadDog = feedback.kind === 'dead' ? state.dogs[state.activeDog] : undefined;
  // Confetti waits out the exit walk on the winning move.
  const winDelay = won && exited ? exitDurationMs(exited.cells.length) : 0;

  return (
    <Canvas style={{ width, height }}>
      {/* Sky: vertical gradient + per-pack decoration (static picture). */}
      <Picture picture={skyPicture} />

      <Group transform={rootTf}>
        <ExitDoor state={state} layout={layout} pulse={pulse} bump={bump} />
        <DogHouse state={state} layout={layout} door={door} />

        {/* Board frame + terrain + snacks (static picture, occludes doors). */}
        <Picture picture={boardPicture} />

        {washCells.length > 0 && (
          <StatueWash key={`wash${feedbackTick}`} cells={washCells} layout={layout} color={coat.body} />
        )}

        {visibleExits.map((ex) => <DoorBurst key={`burst${ex.tick}`} layout={layout} exit={state.exit} />)}

        {state.dogs.map((dog, di) => {
          const grounded = dog.cells.map((c) => segmentGrounded(state, c));
          const timeline = timelines.get(dog.id);
          if (!timeline) return null;
          return (
            <DogView
              key={`${dog.id}:${dog.cells.length}`}
              cells={dog.cells}
              grounded={grounded}
              timeline={timeline}
              active={di === state.activeDog}
              exitOpen={exitOpen}
              layout={layout}
              stateRef={state}
              moveClock={moveClock}
              wag={wag}
              coat={coat}
              accessory={accessory}
            />
          );
        })}

        {/* Dogs walking whole into the exit door — drawn last so they sit on
         *  top of everything else while they disappear inside. */}
        {visibleExits.map((ex) => (
          <DogView
            key={`exit-${ex.tick}`}
            cells={ex.cells}
            grounded={ex.cells.map(() => false)}
            timeline={buildExitTimeline(ex.cells, state.exit)}
            active={true}
            exitOpen={false}
            layout={layout}
            stateRef={state}
            moveClock={moveClock}
            wag={wag}
            coat={coat}
            accessory={accessory}
          />
        ))}

        {deadDog && (
          <DeathFx
            key={`death${feedbackTick}`}
            cx={px(layout, deadDog.cells[0].x) + layout.tile / 2}
            cy={py(layout, deadDog.cells[0].y) + layout.tile / 2}
            layout={layout}
            boardW={boardW}
            boardH={boardH}
          />
        )}

        <HighlightRing cells={highlight} layout={layout} pulse={pulse} />
      </Group>

      {won && <Confetti key="confetti" width={width} height={height} delayMs={winDelay} />}
    </Canvas>
  );
}

/** Pulsing ring drawn over cells the tutorial wants to point at. */
function HighlightRing({
  cells,
  layout,
  pulse,
}: {
  cells: readonly Cell[];
  layout: Layout;
  pulse: SharedValue<number>;
}) {
  return (
    <>
      {cells.map((c) => (
        <HighlightCell key={`${c.x},${c.y}`} cell={c} layout={layout} pulse={pulse} />
      ))}
    </>
  );
}

function HighlightCell({
  cell,
  layout,
  pulse,
}: {
  cell: Cell;
  layout: Layout;
  pulse: SharedValue<number>;
}) {
  const t = layout.tile;
  const cx = px(layout, cell.x) + t / 2;
  const cy = py(layout, cell.y) + t / 2;
  const tf = useDerivedValue(() => {
    const s = 1.02 + 0.08 * pulse.value;
    return [
      { translateX: cx },
      { translateY: cy },
      { scale: s },
      { translateX: -t / 2 },
      { translateY: -t / 2 },
    ];
  });
  return (
    <Group transform={tf}>
      <RoundedRect
        x={0} y={0} width={t} height={t} r={t * CORNER_RADIUS_FRAC}
        color="#FFFFFF" style="stroke" strokeWidth={t * 0.09} opacity={0.9}
      />
    </Group>
  );
}
