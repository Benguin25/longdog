// Skia board renderer with placeholder art. Purely presentational: it draws
// the GameState it is given and never touches game logic. Movement uses a
// single snap-to-tile tween (prevState -> state) driven by one progress
// value; animations never affect state.

import React, { useEffect, useMemo } from 'react';
import { Canvas, Circle, Group, Path, Rect, RoundedRect } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { BOARD_MARGIN, COLORS, CORNER_RADIUS_FRAC, MOVE_TWEEN_MS } from '../game/config';
import { cellKey, isExitOpen, type Cell, type Dir, type GameState } from '../game/rules';

interface Layout {
  tile: number;
  ox: number;
  oy: number;
}

const px = (layout: Layout, gx: number) => layout.ox + gx * layout.tile;
const py = (layout: Layout, gy: number) => layout.oy + gy * layout.tile;

// ---------------------------------------------------------------------------
// Animated dog pieces
// ---------------------------------------------------------------------------

interface SegProps {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  progress: SharedValue<number>;
  tile: number;
  color: string;
}

function BodySegment({ fx, fy, tx, ty, progress, tile, color }: SegProps) {
  const pad = tile * 0.06;
  const x = useDerivedValue(() => fx + (tx - fx) * progress.value + pad);
  const y = useDerivedValue(() => fy + (ty - fy) * progress.value + pad);
  const size = tile - pad * 2;
  return (
    <Group>
      <RoundedRect x={x} y={y} width={size} height={size} r={tile * CORNER_RADIUS_FRAC} color={COLORS.dogOutline} />
      <RoundedRect
        x={useDerivedValue(() => x.value + tile * 0.05)}
        y={useDerivedValue(() => y.value + tile * 0.05)}
        width={size - tile * 0.1}
        height={size - tile * 0.1}
        r={tile * CORNER_RADIUS_FRAC * 0.8}
        color={color}
      />
    </Group>
  );
}

function DogHead({ facing, ...seg }: SegProps & { facing: Dir }) {
  const { fx, fy, tx, ty, progress, tile, color } = seg;
  const transform = useDerivedValue(() => [
    { translateX: fx + (tx - fx) * progress.value },
    { translateY: fy + (ty - fy) * progress.value },
  ]);

  // Local coords inside one tile; snout sticks out toward `facing`, eyes sit
  // perpendicular to it. Placeholder cartoon: big outline square + eyes.
  const t = tile;
  const eyeR = t * 0.11;
  const pupilR = eyeR * 0.5;
  const centers: Record<Dir, { eyes: [Cell, Cell]; snout: { x: number; y: number; w: number; h: number } }> = {
    right: {
      eyes: [
        { x: t * 0.58, y: t * 0.3 },
        { x: t * 0.58, y: t * 0.62 },
      ],
      snout: { x: t * 0.82, y: t * 0.36, w: t * 0.24, h: t * 0.28 },
    },
    left: {
      eyes: [
        { x: t * 0.42, y: t * 0.3 },
        { x: t * 0.42, y: t * 0.62 },
      ],
      snout: { x: -t * 0.06, y: t * 0.36, w: t * 0.24, h: t * 0.28 },
    },
    up: {
      eyes: [
        { x: t * 0.3, y: t * 0.42 },
        { x: t * 0.7, y: t * 0.42 },
      ],
      snout: { x: t * 0.36, y: -t * 0.06, w: t * 0.28, h: t * 0.24 },
    },
    down: {
      eyes: [
        { x: t * 0.3, y: t * 0.58 },
        { x: t * 0.7, y: t * 0.58 },
      ],
      snout: { x: t * 0.36, y: t * 0.82, w: t * 0.28, h: t * 0.24 },
    },
  };
  const look = centers[facing];
  const pad = t * 0.03;

  return (
    <Group transform={transform}>
      <RoundedRect x={pad} y={pad} width={t - pad * 2} height={t - pad * 2} r={t * CORNER_RADIUS_FRAC} color={COLORS.dogOutline} />
      <RoundedRect
        x={pad + t * 0.05}
        y={pad + t * 0.05}
        width={t - pad * 2 - t * 0.1}
        height={t - pad * 2 - t * 0.1}
        r={t * CORNER_RADIUS_FRAC * 0.8}
        color={color}
      />
      <RoundedRect x={look.snout.x} y={look.snout.y} width={look.snout.w} height={look.snout.h} r={t * 0.08} color={COLORS.dogOutline} />
      <Circle cx={look.snout.x + look.snout.w / 2} cy={look.snout.y + look.snout.h / 2} r={t * 0.06} color={COLORS.nose} />
      {look.eyes.map((e, i) => (
        <Group key={i}>
          <Circle cx={e.x} cy={e.y} r={eyeR} color={COLORS.eyeWhite} />
          <Circle cx={e.x} cy={e.y} r={pupilR} color={COLORS.eyePupil} />
        </Group>
      ))}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Static tiles
// ---------------------------------------------------------------------------

function Walls({ state, layout }: { state: GameState; layout: Layout }) {
  const t = layout.tile;
  return (
    <Group>
      {[...state.walls].map((k) => {
        const [x, y] = k.split(',').map(Number);
        const grassTop = !state.walls.has(cellKey(x, y - 1));
        return (
          <Group key={k}>
            <Rect x={px(layout, x)} y={py(layout, y)} width={t} height={t} color={COLORS.wall} />
            {grassTop && (
              <Rect x={px(layout, x)} y={py(layout, y)} width={t} height={t * 0.22} color={COLORS.wallTop} />
            )}
          </Group>
        );
      })}
    </Group>
  );
}

function Spikes({ state, layout }: { state: GameState; layout: Layout }) {
  const t = layout.tile;
  return (
    <Group>
      {[...state.spikes].map((k) => {
        const [x, y] = k.split(',').map(Number);
        const x0 = px(layout, x);
        const y0 = py(layout, y);
        const base = y0 + t;
        const spikes = `M ${x0} ${base} L ${x0 + t * 0.17} ${y0 + t * 0.15} L ${x0 + t * 0.34} ${base} L ${x0 + t * 0.5} ${y0 + t * 0.15} L ${x0 + t * 0.66} ${base} L ${x0 + t * 0.83} ${y0 + t * 0.15} L ${x0 + t} ${base} Z`;
        return <Path key={k} path={spikes} color={COLORS.spike} />;
      })}
    </Group>
  );
}

function Statues({ state, layout }: { state: GameState; layout: Layout }) {
  const t = layout.tile;
  return (
    <Group>
      {[...state.statues].map((k) => {
        const [x, y] = k.split(',').map(Number);
        return (
          <Group key={k}>
            <RoundedRect x={px(layout, x) + t * 0.04} y={py(layout, y) + t * 0.04} width={t * 0.92} height={t * 0.92} r={t * CORNER_RADIUS_FRAC} color={COLORS.statueShade} />
            <RoundedRect x={px(layout, x) + t * 0.1} y={py(layout, y) + t * 0.1} width={t * 0.8} height={t * 0.8} r={t * CORNER_RADIUS_FRAC * 0.8} color={COLORS.statue} />
          </Group>
        );
      })}
    </Group>
  );
}

function ExitDoor({ state, layout }: { state: GameState; layout: Layout }) {
  const t = layout.tile;
  const open = isExitOpen(state);
  const x0 = px(layout, state.exit.x);
  const y0 = py(layout, state.exit.y);
  return (
    <Group>
      {open && <Circle cx={x0 + t / 2} cy={y0 + t / 2} r={t * 0.62} color="#FFF7CC" opacity={0.55} />}
      <RoundedRect x={x0 + t * 0.08} y={y0 + t * 0.04} width={t * 0.84} height={t * 0.94} r={t * 0.3} color={COLORS.exitFrame} />
      <RoundedRect
        x={x0 + t * 0.18}
        y={y0 + t * 0.14}
        width={t * 0.64}
        height={t * 0.82}
        r={t * 0.26}
        color={open ? COLORS.exitOpen : COLORS.exitClosed}
      />
    </Group>
  );
}

function FreezeTiles({ state, layout }: { state: GameState; layout: Layout }) {
  const t = layout.tile;
  return (
    <Group>
      {[...state.freezeTiles].map((k) => {
        const [x, y] = k.split(',').map(Number);
        const cx = px(layout, x) + t / 2;
        const cy = py(layout, y) + t / 2;
        const diamond = `M ${cx} ${cy - t * 0.22} L ${cx + t * 0.22} ${cy} L ${cx} ${cy + t * 0.22} L ${cx - t * 0.22} ${cy} Z`;
        return (
          <Group key={k}>
            <RoundedRect x={px(layout, x) + t * 0.08} y={py(layout, y) + t * 0.08} width={t * 0.84} height={t * 0.84} r={t * 0.2} color={COLORS.freezeTile} opacity={0.85} />
            <Path path={diamond} color={COLORS.freezeTileMark} />
          </Group>
        );
      })}
    </Group>
  );
}

function DogHouse({ state, layout }: { state: GameState; layout: Layout }) {
  if (!state.doghouse) return null;
  const t = layout.tile;
  const x0 = px(layout, state.doghouse.x);
  const y0 = py(layout, state.doghouse.y);
  const roof = `M ${x0} ${y0 + t * 0.38} L ${x0 + t / 2} ${y0 + t * 0.02} L ${x0 + t} ${y0 + t * 0.38} Z`;
  return (
    <Group>
      <Rect x={x0 + t * 0.1} y={y0 + t * 0.38} width={t * 0.8} height={t * 0.6} color={COLORS.doghouse} />
      <Path path={roof} color={COLORS.doghouseRoof} />
      <Circle cx={x0 + t / 2} cy={y0 + t * 0.72} r={t * 0.18} color={COLORS.exitFrame} />
    </Group>
  );
}

function Snacks({ state, layout }: { state: GameState; layout: Layout }) {
  const t = layout.tile;
  return (
    <Group>
      {state.snacks.map((s) => {
        const cx = px(layout, s.x) + t / 2;
        const cy = py(layout, s.y) + t / 2;
        // Placeholder bone: bar with two knobs at each end.
        return (
          <Group key={cellKey(s.x, s.y)}>
            <RoundedRect x={cx - t * 0.24} y={cy - t * 0.09} width={t * 0.48} height={t * 0.18} r={t * 0.09} color={COLORS.snackOutline} />
            {[-1, 1].map((side) => (
              <Group key={side}>
                <Circle cx={cx + side * t * 0.24} cy={cy - t * 0.08} r={t * 0.11} color={COLORS.snackOutline} />
                <Circle cx={cx + side * t * 0.24} cy={cy + t * 0.08} r={t * 0.11} color={COLORS.snackOutline} />
              </Group>
            ))}
            <RoundedRect x={cx - t * 0.22} y={cy - t * 0.06} width={t * 0.44} height={t * 0.12} r={t * 0.06} color={COLORS.snack} />
          </Group>
        );
      })}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Dogs
// ---------------------------------------------------------------------------

function headFacing(cells: readonly Cell[]): Dir {
  if (cells.length < 2) return 'right';
  const [head, neck] = cells;
  if (head.x > neck.x) return 'right';
  if (head.x < neck.x) return 'left';
  if (head.y < neck.y) return 'up';
  return 'down';
}

function Dogs({
  state,
  prevState,
  layout,
  progress,
}: {
  state: GameState;
  prevState: GameState | null;
  layout: Layout;
  progress: SharedValue<number>;
}) {
  return (
    <Group>
      {state.dogs.map((dog, di) => {
        const prevDog = prevState?.dogs.find((d) => d.id === dog.id);
        const shift = prevDog ? dog.cells.length - prevDog.cells.length : 0;
        const fromCell = (i: number): Cell => {
          if (!prevDog) return dog.cells[i];
          const j = Math.min(Math.max(i - shift, 0), prevDog.cells.length - 1);
          return prevDog.cells[j];
        };
        const active = di === state.activeDog;
        const facing = headFacing(dog.cells);
        return (
          <Group key={dog.id} opacity={active ? 1 : 0.82}>
            {dog.cells
              .map((cell, i) => ({ cell, i }))
              .slice(1)
              .reverse()
              .map(({ cell, i }) => (
                <BodySegment
                  key={`${dog.id}:${i}`}
                  fx={px(layout, fromCell(i).x)}
                  fy={py(layout, fromCell(i).y)}
                  tx={px(layout, cell.x)}
                  ty={py(layout, cell.y)}
                  progress={progress}
                  tile={layout.tile}
                  color={active ? (i % 2 === 0 ? COLORS.dogBody : COLORS.dogBodyAlt) : COLORS.dogInactive}
                />
              ))}
            <DogHead
              key={`${dog.id}:head`}
              fx={px(layout, fromCell(0).x)}
              fy={py(layout, fromCell(0).y)}
              tx={px(layout, dog.cells[0].x)}
              ty={py(layout, dog.cells[0].y)}
              progress={progress}
              tile={layout.tile}
              color={active ? COLORS.dogBody : COLORS.dogInactive}
              facing={facing}
            />
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
  width,
  height,
}: {
  state: GameState;
  prevState: GameState | null;
  width: number;
  height: number;
}) {
  const progress = useSharedValue(1);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: MOVE_TWEEN_MS });
  }, [state, progress]);

  const layout = useMemo<Layout>(() => {
    const tile = Math.floor(
      Math.min((width - BOARD_MARGIN * 2) / state.width, (height - BOARD_MARGIN * 2) / state.height),
    );
    const ox = Math.floor((width - tile * state.width) / 2);
    const oy = Math.floor((height - tile * state.height) / 2);
    return { tile, ox, oy };
  }, [width, height, state.width, state.height]);

  if (width <= 0 || height <= 0) return null;

  return (
    <Canvas style={{ width, height }}>
      <Rect x={0} y={0} width={width} height={height} color={COLORS.sky} />
      <RoundedRect
        x={layout.ox - 3}
        y={layout.oy - 3}
        width={layout.tile * state.width + 6}
        height={layout.tile * state.height + 6}
        r={8}
        color={COLORS.boardLine}
      />
      <Rect
        x={layout.ox}
        y={layout.oy}
        width={layout.tile * state.width}
        height={layout.tile * state.height}
        color={COLORS.sky}
      />
      <ExitDoor state={state} layout={layout} />
      <DogHouse state={state} layout={layout} />
      <FreezeTiles state={state} layout={layout} />
      <Walls state={state} layout={layout} />
      <Spikes state={state} layout={layout} />
      <Statues state={state} layout={layout} />
      <Snacks state={state} layout={layout} />
      <Dogs state={state} prevState={prevState} layout={layout} progress={progress} />
    </Canvas>
  );
}
