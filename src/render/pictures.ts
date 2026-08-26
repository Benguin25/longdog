// Static board layers baked into SkPictures.
//
// The canvas is animating whenever a tween or ambient loop runs, and every
// animated frame replays the whole Skia node tree. Baking the layers that
// never change during a tween (sky, board frame, terrain, snacks) into two
// recorded pictures makes their per-frame cost a single playback call
// instead of re-walking dozens of Path nodes. Pictures are rebuilt only on
// discrete state changes (snack eaten, statue added, layout/palette change)
// — never per animation frame.
//
// Draw order matches the old component tree: the board picture is drawn
// after the exit door / dog house (terrain occludes them) and before dogs.

import {
  createPicture,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  type SkCanvas,
  type SkPicture,
} from '@shopify/react-native-skia';

import { BOARD_MARGIN, COLORS, OUTLINE_FRAC, type PackPalette } from '../game/config';
import type { GameState } from '../game/rules';
import {
  buildFreezePaths,
  buildRakePaths,
  buildSkyPaths,
  buildSnackPaths,
  buildStatuePaths,
  buildWallPaths,
  type Layout,
} from './scene';

interface DrawOp {
  readonly d: string;
  readonly color: string;
  readonly opacity?: number;
  readonly stroke?: number;
}

function drawOps(canvas: SkCanvas, ops: readonly DrawOp[]): void {
  for (const op of ops) {
    if (!op.d) continue;
    const path = Skia.Path.MakeFromSVGString(op.d);
    if (!path) continue;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(op.color));
    if (op.opacity !== undefined) paint.setAlphaf(op.opacity);
    if (op.stroke !== undefined) {
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeWidth(op.stroke);
      paint.setStrokeCap(StrokeCap.Round);
      paint.setStrokeJoin(StrokeJoin.Round);
    }
    canvas.drawPath(path, paint);
  }
}

/** Sky gradient + per-pack decoration. Depends only on size + palette. */
export function buildSkyPicture(width: number, height: number, pal: PackPalette): SkPicture {
  const sky = buildSkyPaths(width, height, pal.decor);
  return createPicture(
    (canvas) => {
      const paint = Skia.Paint();
      paint.setShader(
        Skia.Shader.MakeLinearGradient(
          { x: 0, y: 0 },
          { x: 0, y: height },
          [Skia.Color(pal.skyTop), Skia.Color(pal.skyBottom)],
          null,
          TileMode.Clamp,
        ),
      );
      canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);
      drawOps(canvas, [
        { d: sky.alt, color: pal.decorAlt },
        { d: sky.altBite, color: pal.skyTop },
        { d: sky.main, color: pal.decorColor, opacity: 0.92 },
      ]);
    },
    { width, height },
  );
}

/** Board frame + all terrain and props (walls, rakes, mats, statues, snacks). */
export function buildBoardPicture(
  state: GameState,
  layout: Layout,
  pal: PackPalette,
  width: number,
  height: number,
): SkPicture {
  const t = layout.tile;
  const ow = t * OUTLINE_FRAC;
  const boardW = t * state.width + BOARD_MARGIN * 2;
  const boardH = t * state.height + BOARD_MARGIN * 2;

  const walls = buildWallPaths(state.walls, layout);
  const rakes = buildRakePaths(state.spikes, layout);
  const mats = buildFreezePaths(state.freezeTiles, layout);
  const statues = buildStatuePaths(state.statues, layout);
  const snacks = buildSnackPaths(state.snacks, layout);

  return createPicture(
    (canvas) => {
      const frame = Skia.Paint();
      frame.setAntiAlias(true);
      frame.setColor(Skia.Color(pal.frame));
      frame.setStyle(PaintStyle.Stroke);
      frame.setStrokeWidth(5);
      canvas.drawRRect(
        Skia.RRectXY(
          Skia.XYWHRect(
            layout.ox - BOARD_MARGIN + 2,
            layout.oy - BOARD_MARGIN + 2,
            boardW - 4,
            boardH - 4,
          ),
          12,
          12,
        ),
        frame,
      );

      drawOps(canvas, [
        // Play-dead mats sit behind everything that can pass over them.
        { d: mats.outline, color: COLORS.outline, stroke: ow * 0.9 },
        { d: mats.mat, color: COLORS.freezeMat },
        { d: mats.band, color: COLORS.freezeMatDark },
        { d: mats.paw, color: COLORS.freezePaw },

        // Dirt blocks with grass caps and one thick contour per cluster.
        { d: walls.dirt, color: pal.dirt },
        { d: walls.speckles, color: pal.dirtDark },
        { d: walls.blades, color: pal.grassDark },
        { d: walls.grass, color: pal.grass },
        { d: walls.outline, color: COLORS.outline, stroke: ow * 1.15 },

        // Garden rakes (spikes).
        { d: rakes.outline, color: COLORS.outline, stroke: ow * 0.8 },
        { d: rakes.wood, color: COLORS.rakeWood },
        { d: rakes.metal, color: COLORS.rakeMetal },

        // Petrified dogs.
        { d: statues.outline, color: COLORS.outline, stroke: ow },
        { d: statues.fill, color: COLORS.statue },
        { d: statues.shade, color: COLORS.statueDark },
        { d: statues.cracks, color: COLORS.statueCrack, stroke: ow * 0.4 },

        // Bones + sausages.
        { d: snacks.boneOutline, color: COLORS.outline, stroke: ow * 0.8 },
        { d: snacks.bone, color: COLORS.bone },
        { d: snacks.sausage, color: COLORS.outline, stroke: ow * 0.8 },
        { d: snacks.sausage, color: COLORS.sausage },
        { d: snacks.sausageShine, color: COLORS.sausageShine },
        { d: snacks.sausageTie, color: COLORS.sausageTie },
      ]);
    },
    { width, height },
  );
}
