// All gameplay + presentation tunables live here. No logic.

/** Length of a freshly spawned dachshund (dog-house spawns after a freeze). */
export const SPAWN_DOG_LENGTH = 3;

/** Snap-to-tile movement tween duration (ms). Presentational only. */
export const MOVE_TWEEN_MS = 80;

/** Minimum swipe travel (px) before a pan gesture counts as a move. */
export const SWIPE_MIN_DISTANCE = 24;

/** Master switch for haptic feedback. */
export const HAPTICS_ENABLED = true;

/** Spec: free hint button behind a config flag (later: rewarded ad). */
export const SHOW_HINT_BUTTON = true;

/** How many optimal moves a hint reveals. */
export const HINT_MOVES = 3;

/** State cap for the in-app hint solve (keeps worst-case hint time bounded). */
export const HINT_MAX_STATES = 250_000;

/** Stars: 3 at par, 2 within par + STARS_PAR_WINDOW, 1 for clearing. */
export const STARS_PAR_WINDOW = 3;

/** Levels per pack (100 levels = 5 packs of 20). */
export const PACK_SIZE = 20;

/** Pack names + accent colors (palette swap per pack, same tiles). */
export const PACKS = [
  { name: 'Backyard', color: '#5FBF4A' },
  { name: 'Garden', color: '#E8973D' },
  { name: 'Rooftop', color: '#8E9AA6' },
  { name: 'Park at Night', color: '#5C6BC0' },
  { name: 'Snow', color: '#7FC8E8' },
] as const;

/** Outer margin around the board inside the canvas (px). */
export const BOARD_MARGIN = 10;

/** Corner radius of tiles/segments as a fraction of tile size. */
export const CORNER_RADIUS_FRAC = 0.24;

/** Placeholder-art palette (bright, saturated, thick-outline cartoon look). */
export const COLORS = {
  sky: '#8ED1F4',
  boardLine: '#7CC0E4',
  wall: '#8B5A2B',
  wallTop: '#5FBF4A',
  spike: '#8E9AA6',
  spikeTip: '#5C6670',
  snack: '#F6E7B2',
  snackOutline: '#C9A86A',
  exitClosed: '#6B4F3F',
  exitOpen: '#FFE066',
  exitFrame: '#4A362A',
  freezeTile: '#B39DDB',
  freezeTileMark: '#6D5BA3',
  doghouse: '#D9534F',
  doghouseRoof: '#A93A32',
  statue: '#9AA0A6',
  statueShade: '#6F767D',
  dogBody: '#B5773A',
  dogBodyAlt: '#C68A4B',
  dogInactive: '#A98B63',
  dogOutline: '#3B2A1A',
  eyeWhite: '#FFFFFF',
  eyePupil: '#1E1410',
  nose: '#2B1B12',
} as const;
