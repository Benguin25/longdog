// Pure geometry for the board art. Builds batched SVG path strings from
// game state + layout so the whole terrain renders as a handful of Skia
// paths instead of hundreds of components. No React / Skia imports: the
// headless profiler (scripts/profile.ts) runs these directly via tsx.
//
// Everything here is deterministic: decoration jitter comes from a cell
// hash, never Math.random, so the board is stable across re-renders.

import type { Cell, GameState } from '../game/rules';
import { cellKey } from '../game/rules';
import type { SkyDecor } from '../game/config';

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
// Snacks: bones + sausages (alternating deterministically per cell)
// ---------------------------------------------------------------------------

export interface SnackPaths {
  bone: string;
  boneOutline: string;
  sausage: string;
  sausageShine: string;
  sausageTie: string;
}

export function buildSnackPaths(snacks: readonly Cell[], l: Layout): SnackPaths {
  const t = l.tile;
  let bone = '';
  let sausage = '';
  let sausageShine = '';
  let sausageTie = '';

  for (const s of snacks) {
    const cx = px(l, s.x) + t / 2;
    const cy = py(l, s.y) + t / 2;
    if ((s.x + s.y) % 2 === 0) {
      // Bone: bar + four knobs.
      bone += rrect(cx - t * 0.24, cy - t * 0.09, t * 0.48, t * 0.18, t * 0.09);
      for (const side of [-1, 1]) {
        bone += circ(cx + side * t * 0.24, cy - t * 0.09, t * 0.115);
        bone += circ(cx + side * t * 0.24, cy + t * 0.09, t * 0.115);
      }
    } else {
      // Sausage link: two plump capsules with a tie in the middle.
      sausage += rrect(cx - t * 0.34, cy - t * 0.13, t * 0.32, t * 0.27, t * 0.135);
      sausage += rrect(cx + t * 0.02, cy - t * 0.13, t * 0.32, t * 0.27, t * 0.135);
      sausageShine += rrect(cx - t * 0.28, cy - t * 0.08, t * 0.16, t * 0.07, t * 0.035);
      sausageShine += rrect(cx + t * 0.08, cy - t * 0.08, t * 0.16, t * 0.07, t * 0.035);
      sausageTie += circ(cx, cy, t * 0.05);
    }
  }

  return { bone, boneOutline: bone, sausage, sausageShine, sausageTie };
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
