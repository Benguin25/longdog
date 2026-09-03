// Pure geometry for the board art. Builds batched SVG path strings from
// game state + layout so the whole terrain renders as a handful of Skia
// paths instead of hundreds of components. No React / Skia imports: the
// headless profiler (scripts/profile.ts) runs these directly via tsx.
//
// Everything here is deterministic: decoration jitter comes from a cell
// hash, never Math.random, so the board is stable across re-renders.

import type { Cell, FallEats, FallRows, GameState } from '../game/rules';
import { cellKey } from '../game/rules';
import {
  FALL_MAX_MS,
  FALL_MIN_MS,
  FALL_MS_PER_ROW,
  MOVE_TWEEN_MS,
  type SkyDecor,
} from '../game/config';

export interface Layout {
  readonly tile: number;
  readonly ox: number;
  readonly oy: number;
}

export const px = (l: Layout, gx: number) => l.ox + gx * l.tile;
export const py = (l: Layout, gy: number) => l.oy + gy * l.tile;

// ---------------------------------------------------------------------------
// Path-string helpers
// ---------------------------------------------------------------------------

const f = (v: number) => (Math.round(v * 100) / 100).toString();

/** Rounded rect as an SVG path. */
export function rrect(x: number, y: number, w: number, h: number, r: number): string {
  const cr = Math.min(r, w / 2, h / 2);
  return (
    `M${f(x + cr)} ${f(y)}H${f(x + w - cr)}A${f(cr)} ${f(cr)} 0 0 1 ${f(x + w)} ${f(y + cr)}` +
    `V${f(y + h - cr)}A${f(cr)} ${f(cr)} 0 0 1 ${f(x + w - cr)} ${f(y + h)}` +
    `H${f(x + cr)}A${f(cr)} ${f(cr)} 0 0 1 ${f(x)} ${f(y + h - cr)}` +
    `V${f(y + cr)}A${f(cr)} ${f(cr)} 0 0 1 ${f(x + cr)} ${f(y)}Z`
  );
}

/** Circle as an SVG path (two arcs). */
export function circ(cx: number, cy: number, r: number): string {
  return (
    `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}` +
    `A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`
  );
}

/** Deterministic per-cell jitter in [0, 1). */
export function hash01(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

const parseKeys = (keys: ReadonlySet<string>): Cell[] =>
  [...keys].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });

// ---------------------------------------------------------------------------
// Walls: dirt blocks, speckles, grass caps, thick cluster outline
// ---------------------------------------------------------------------------

export interface WallPaths {
  dirt: string;
  speckles: string;
  grass: string;
  blades: string;
  /** Boundary edges of wall clusters, to be stroked thick. */
  outline: string;
}

export function buildWallPaths(walls: ReadonlySet<string>, l: Layout): WallPaths {
  const t = l.tile;
  let dirt = '';
  let speckles = '';
  let grass = '';
  let blades = '';
  let outline = '';

  for (const { x, y } of parseKeys(walls)) {
    const x0 = px(l, x);
    const y0 = py(l, y);
    dirt += `M${f(x0)} ${f(y0)}H${f(x0 + t)}V${f(y0 + t)}H${f(x0)}Z`;

    // Dirt speckles: 3 pebbles per tile at hashed offsets, kept low so they
    // sit in dirt even when a grass cap covers the top third.
    for (let i = 0; i < 3; i++) {
      const sx = x0 + t * (0.15 + 0.7 * hash01(x, y, i * 3 + 1));
      const sy = y0 + t * (0.45 + 0.42 * hash01(x, y, i * 3 + 2));
      const sr = t * (0.035 + 0.03 * hash01(x, y, i * 3 + 3));
      speckles += circ(sx, sy, sr);
    }

    const exposedTop = !walls.has(cellKey(x, y - 1));
    if (exposedTop) {
      grass += `M${f(x0)} ${f(y0)}H${f(x0 + t)}V${f(y0 + t * 0.3)}` +
        `Q${f(x0 + t * 0.75)} ${f(y0 + t * 0.38)} ${f(x0 + t * 0.5)} ${f(y0 + t * 0.3)}` +
        `Q${f(x0 + t * 0.25)} ${f(y0 + t * 0.22)} ${f(x0)} ${f(y0 + t * 0.3)}Z`;
      // A couple of grass blades poking above the cap.
      for (let i = 0; i < 2; i++) {
        const bx = x0 + t * (0.2 + 0.55 * hash01(x, y, 20 + i));
        const bh = t * (0.1 + 0.08 * hash01(x, y, 30 + i));
        blades += `M${f(bx - t * 0.035)} ${f(y0 + t * 0.02)}L${f(bx)} ${f(y0 - bh)}L${f(bx + t * 0.035)} ${f(y0 + t * 0.02)}Z`;
      }
    }

    // Thick outline only on edges facing non-wall cells → one contour per
    // cluster instead of a grid of boxes.
    if (exposedTop) outline += `M${f(x0)} ${f(y0)}H${f(x0 + t)}`;
    if (!walls.has(cellKey(x, y + 1))) outline += `M${f(x0)} ${f(y0 + t)}H${f(x0 + t)}`;
    if (!walls.has(cellKey(x - 1, y))) outline += `M${f(x0)} ${f(y0)}V${f(y0 + t)}`;
    if (!walls.has(cellKey(x + 1, y))) outline += `M${f(x0 + t)} ${f(y0)}V${f(y0 + t)}`;
  }

  return { dirt, speckles, grass, blades, outline };
}

// ---------------------------------------------------------------------------
// Spikes: cartoon garden rakes (teeth up, short handle)
// ---------------------------------------------------------------------------

export interface RakePaths {
  metal: string;
  wood: string;
  /** Same shapes re-stroked for the thick outline. */
  outline: string;
}

export function buildRakePaths(spikes: ReadonlySet<string>, l: Layout): RakePaths {
  const t = l.tile;
  let metal = '';
  let wood = '';

  for (const { x, y } of parseKeys(spikes)) {
    const x0 = px(l, x);
    const y0 = py(l, y);
    // Head bar near the bottom of the tile.
    const barY = y0 + t * 0.68;
    const bar = rrect(x0 + t * 0.06, barY, t * 0.88, t * 0.16, t * 0.06);
    // Four teeth pointing up from the bar.
    let teeth = '';
    for (let i = 0; i < 4; i++) {
      const cx = x0 + t * (0.16 + 0.226 * i);
      teeth +=
        `M${f(cx - t * 0.055)} ${f(barY + t * 0.02)}` +
        `L${f(cx)} ${f(y0 + t * 0.12)}` +
        `L${f(cx + t * 0.055)} ${f(barY + t * 0.02)}Z`;
    }
    metal += bar + teeth;
    // Stubby handle poking down-right from the bar.
    wood += rrect(x0 + t * 0.42, barY + t * 0.1, t * 0.16, t * 0.24, t * 0.05);
  }

  return { metal, wood, outline: metal + wood };
}

// ---------------------------------------------------------------------------
// Statues: petrified dog segments as cracked stone blocks
// ---------------------------------------------------------------------------

export interface StatuePaths {
  fill: string;
  shade: string;
  cracks: string;
  outline: string;
}

export function buildStatuePaths(statues: ReadonlySet<string>, l: Layout): StatuePaths {
  const t = l.tile;
  let fill = '';
  let shade = '';
  let cracks = '';

  for (const { x, y } of parseKeys(statues)) {
    const x0 = px(l, x);
    const y0 = py(l, y);
    const body = rrect(x0 + t * 0.05, y0 + t * 0.05, t * 0.9, t * 0.9, t * 0.22);
    fill += body;
    shade += rrect(x0 + t * 0.05, y0 + t * 0.62, t * 0.9, t * 0.33, t * 0.14);

    // 1-2 deterministic zig-zag cracks per block.
    const n = 1 + Math.floor(hash01(x, y, 7) * 2);
    for (let i = 0; i < n; i++) {
      const cx = x0 + t * (0.25 + 0.5 * hash01(x, y, 40 + i));
      const cy = y0 + t * (0.15 + 0.25 * hash01(x, y, 50 + i));
      const d = t * 0.13;
      cracks +=
        `M${f(cx)} ${f(cy)}L${f(cx - d * 0.5)} ${f(cy + d)}L${f(cx + d * 0.4)} ${f(cy + d * 1.9)}` +
        `L${f(cx - d * 0.2)} ${f(cy + d * 2.8)}`;
    }
  }

  return { fill, shade, cracks, outline: fill };
}

// ---------------------------------------------------------------------------
// Play-dead (freeze) tiles: a purple mat with a paw print
// ---------------------------------------------------------------------------

export interface FreezePaths {
  mat: string;
  band: string;
  paw: string;
  outline: string;
}

export function buildFreezePaths(freezeTiles: ReadonlySet<string>, l: Layout): FreezePaths {
  const t = l.tile;
  let mat = '';
  let band = '';
  let paw = '';

  for (const { x, y } of parseKeys(freezeTiles)) {
    const x0 = px(l, x);
    const y0 = py(l, y);
    const m = rrect(x0 + t * 0.08, y0 + t * 0.08, t * 0.84, t * 0.84, t * 0.2);
    mat += m;
    band += rrect(x0 + t * 0.08, y0 + t * 0.66, t * 0.84, t * 0.26, t * 0.13);
    // Paw print: big pad + three toes.
    const cx = x0 + t * 0.5;
    const cy = y0 + t * 0.52;
    paw +=
      rrect(cx - t * 0.14, cy - t * 0.04, t * 0.28, t * 0.2, t * 0.1) +
      circ(cx - t * 0.15, cy - t * 0.14, t * 0.065) +
      circ(cx, cy - 0.19 * t, t * 0.07) +
      circ(cx + t * 0.15, cy - t * 0.14, t * 0.065);
  }

  return { mat, band, paw, outline: mat };
}

// ---------------------------------------------------------------------------
// Snacks: bones (all snacks are bones)
// ---------------------------------------------------------------------------

export interface SnackPaths {
  bone: string;
  boneOutline: string;
}

export function buildSnackPaths(snacks: readonly Cell[], l: Layout): SnackPaths {
  const t = l.tile;
  let bone = '';

  for (const s of snacks) {
    const cx = px(l, s.x) + t / 2;
    const cy = py(l, s.y) + t / 2;
    // Bone: bar + four knobs.
    bone += rrect(cx - t * 0.24, cy - t * 0.09, t * 0.48, t * 0.18, t * 0.09);
    for (const side of [-1, 1]) {
      bone += circ(cx + side * t * 0.24, cy - t * 0.09, t * 0.115);
      bone += circ(cx + side * t * 0.24, cy + t * 0.09, t * 0.115);
    }
  }

  return { bone, boneOutline: bone };
}

// ---------------------------------------------------------------------------
// Sky decoration: clouds / stars+moon / snowfall (per-pack, static)
// ---------------------------------------------------------------------------

export interface SkyPaths {
  /** Clouds, stars or snow dots. */
  main: string;
  /** Sun or moon disc ('' for snow). */
  alt: string;
  /** Moon crescent bite, drawn in sky color ('' unless stars). */
  altBite: string;
}

export function buildSkyPaths(width: number, height: number, decor: SkyDecor): SkyPaths {
  let main = '';
  let alt = '';
  let altBite = '';

  if (decor === 'clouds') {
    for (let i = 0; i < 4; i++) {
      const cx = width * (0.12 + 0.26 * i + 0.08 * hash01(i, 1));
      const cy = height * (0.06 + 0.1 * hash01(i, 2));
      const r = width * (0.045 + 0.02 * hash01(i, 3));
      main += circ(cx - r * 1.1, cy + r * 0.35, r * 0.8);
      main += circ(cx, cy, r);
      main += circ(cx + r * 1.15, cy + r * 0.3, r * 0.85);
      main += rrect(cx - r * 1.6, cy + r * 0.35, r * 3.3, r * 0.85, r * 0.4);
    }
    alt = circ(width * 0.88, height * 0.07, width * 0.055);
  } else if (decor === 'stars') {
    for (let i = 0; i < 14; i++) {
      const sx = width * hash01(i, 11);
      const sy = height * 0.3 * hash01(i, 12);
      const r = width * (0.006 + 0.006 * hash01(i, 13));
      main += `M${f(sx)} ${f(sy - r * 2)}L${f(sx + r)} ${f(sy)}L${f(sx)} ${f(sy + r * 2)}L${f(sx - r)} ${f(sy)}Z`;
    }
    const mr = width * 0.05;
    alt = circ(width * 0.85, height * 0.08, mr);
    altBite = circ(width * 0.85 + mr * 0.55, height * 0.08 - mr * 0.3, mr * 0.82);
  } else {
    for (let i = 0; i < 22; i++) {
      const sx = width * hash01(i, 21);
      const sy = height * 0.9 * hash01(i, 22);
      main += circ(sx, sy, width * (0.004 + 0.004 * hash01(i, 23)));
    }
  }

  return { main, alt, altBite };
}

// ---------------------------------------------------------------------------
// Per-segment presentation facts (pure reads of state)
// ---------------------------------------------------------------------------

/** Duration of the single continuous fall tween for a fall of `rows` cells. */
export function fallDurationMs(rows: number): number {
  if (rows <= 0) return 0;
  return Math.min(FALL_MAX_MS, Math.max(FALL_MIN_MS, rows * FALL_MS_PER_ROW));
}

// ---------------------------------------------------------------------------
// Per-dog action timeline (pure; consumed by the dog view and the SFX cues)
// ---------------------------------------------------------------------------

/** One leg of a segment's tween, in grid units. `fall` legs ease in. */
export interface Keyframe {
  readonly x: number;
  readonly y: number;
  readonly ms: number;
  readonly kind: 'step' | 'fall' | 'hold';
}

export interface DogTimeline {
  /** Where each final segment starts (seeded before the first frame). */
  readonly from: readonly Cell[];
  /** Per final segment: legs from `from` to its final cell, in order. */
  readonly tracks: readonly (readonly Keyframe[])[];
  /**
   * Per final segment: ms at which it inflates into existence, or null if it
   * existed before this action. 0 = grown by the move itself.
   */
  readonly popAt: readonly (number | null)[];
  /** ms at which the head eats (a move-eat is at 0; fall-eats later). */
  readonly eatAt: readonly number[];
  /** ms at which the dog comes to rest after falling (0 if it did not fall). */
  readonly landAt: number;
  readonly totalMs: number;
}

type Phase =
  | { readonly kind: 'fall'; readonly rows: number }
  /** Head advanced onto a snack; body stayed. `cells` = shape after it. */
  | { readonly kind: 'eat'; readonly cells: readonly Cell[] };

/**
 * Rebuild what happened to one dog this action from the rules' report and
 * lay it out as per-segment keyframes: the move step, then alternating
 * falls and mid-fall eats. Never re-derives gravity: it only unwinds the
 * documented shape changes (a fall shifts every cell down one row per row;
 * a fall-eat prepends a head cell one row down and leaves the body put).
 */
export function buildDogTimeline(
  prevCells: readonly Cell[] | null,
  cells: readonly Cell[],
  fallRows: number,
  eatRows: readonly number[],
): DogTimeline {
  // Unwind the fall from the final shape back to the shape right after the
  // move step, collecting phases in forward order.
  const phases: Phase[] = [];
  let cur: readonly Cell[] = cells;
  let rowsAfter = fallRows - (eatRows.length > 0 ? eatRows[eatRows.length - 1] : 0);
  for (let j = eatRows.length - 1; j >= 0; j--) {
    if (rowsAfter > 0) phases.unshift({ kind: 'fall', rows: rowsAfter });
    cur = cur.map((c) => ({ x: c.x, y: c.y - rowsAfter }));
    phases.unshift({ kind: 'eat', cells: cur });
    cur = cur.slice(1);
    rowsAfter = eatRows[j] - (j > 0 ? eatRows[j - 1] : 0) - 1;
  }
  if (rowsAfter > 0) phases.unshift({ kind: 'fall', rows: rowsAfter });
  const afterMove = cur.map((c) => ({ x: c.x, y: c.y - rowsAfter }));

  const n = cells.length;
  const from: Cell[] = [];
  const tracks: Keyframe[][] = [];
  const popAt: (number | null)[] = [];
  const eatAt: number[] = [];

  const grewByMove = prevCells !== null && afterMove.length > prevCells.length;
  if (grewByMove) eatAt.push(0);

  for (let i = 0; i < n; i++) {
    const track: Keyframe[] = [];
    let t = 0;
    // Segments that exist after the move step start at the pre-move cell of
    // the same index (each slides one tile forward; a move-grown tail starts
    // on, and stays at, the old tail cell). Segments born mid-fall wait at
    // their birth cell (scale 0) until their eat.
    let exists = i < afterMove.length;
    let pos: Cell;
    if (!exists) {
      const birth = phases.find(
        (ph): ph is Extract<Phase, { kind: 'eat' }> => ph.kind === 'eat' && ph.cells.length > i,
      );
      pos = birth ? birth.cells[i] : cells[i];
      track.push({ ...pos, ms: MOVE_TWEEN_MS, kind: 'hold' });
    } else if (prevCells === null) {
      pos = afterMove[i];
      track.push({ ...pos, ms: MOVE_TWEEN_MS, kind: 'hold' });
    } else {
      pos = prevCells[Math.min(i, prevCells.length - 1)];
      track.push({ ...afterMove[i], ms: MOVE_TWEEN_MS, kind: 'step' });
    }
    from.push(pos);
    t += MOVE_TWEEN_MS;
    popAt.push(exists ? (grewByMove && i === n - 1 ? 0 : null) : null);

    for (const ph of phases) {
      const last = track[track.length - 1];
      if (ph.kind === 'fall') {
        const ms = fallDurationMs(ph.rows);
        track.push(
          exists
            ? { x: last.x, y: last.y + ph.rows, ms, kind: 'fall' }
            : { x: last.x, y: last.y, ms, kind: 'hold' },
        );
        t += ms;
      } else {
        // Eat step: head drops onto the snack, body slides one tile forward,
        // the new tail pops in on the old tail cell.
        const born = !exists && i === ph.cells.length - 1;
        if (born) {
          exists = true;
          popAt[i] = t;
          track.push({ x: last.x, y: last.y, ms: MOVE_TWEEN_MS, kind: 'hold' });
        } else {
          track.push(
            exists
              ? { ...ph.cells[i], ms: MOVE_TWEEN_MS, kind: 'step' }
              : { x: last.x, y: last.y, ms: MOVE_TWEEN_MS, kind: 'hold' },
          );
        }
        if (i === 0) eatAt.push(t);
        t += MOVE_TWEEN_MS;
      }
    }
    tracks.push(track);
  }

  const totalMs = tracks.length > 0 ? tracks[0].reduce((a, k) => a + k.ms, 0) : 0;
  const landAt = fallRows > 0 ? totalMs : 0;
  return { from, tracks, popAt, eatAt, landAt, totalMs };
}

/** Timeline for every dog in `state`, keyed by dog id. */
export function buildActionTimelines(
  state: GameState,
  prevState: GameState | null,
  fallRows: FallRows,
  fallEats: FallEats,
): ReadonlyMap<number, DogTimeline> {
  const out = new Map<number, DogTimeline>();
  for (const dog of state.dogs) {
    const prev = prevState?.dogs.find((d) => d.id === dog.id);
    out.set(
      dog.id,
      buildDogTimeline(prev ? prev.cells : null, dog.cells, fallRows[dog.id] ?? 0, fallEats[dog.id] ?? []),
    );
  }
  return out;
}

/** Whether a dog segment stands on terrain (draws stubby legs). */
export function segmentGrounded(state: GameState, c: Cell): boolean {
  const below = cellKey(c.x, c.y + 1);
  return state.walls.has(below) || state.statues.has(below);
}

/** Statue cells present in `state` but not in `prev` (freeze transition). */
export function newStatueCells(state: GameState, prev: GameState | null): Cell[] {
  if (!prev || state.statues === prev.statues) return [];
  const fresh: Cell[] = [];
  for (const k of state.statues) {
    if (!prev.statues.has(k)) {
      const [x, y] = k.split(',').map(Number);
      fresh.push({ x, y });
    }
  }
  return fresh;
}
