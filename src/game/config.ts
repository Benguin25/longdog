// All gameplay + presentation tunables live here. No logic.

/** Length of a freshly spawned dachshund (dog-house spawns after a freeze). */
export const SPAWN_DOG_LENGTH = 3;

/** Snap-to-tile movement tween duration (ms). Presentational only. */
export const MOVE_TWEEN_MS = 80;

/** Eating move: how long the new tail segment takes to inflate into place
 *  while the body takes its normal step (ms). Presentational only. */
export const GROW_TWEEN_MS = 100;

/** Gravity fall tween: ms per row fallen, clamped to [min, max]. */
export const FALL_MS_PER_ROW = 70;
export const FALL_MIN_MS = 90;
export const FALL_MAX_MS = 450;

/** Dev-only FPS overlay on the game screen (never shown outside __DEV__). */
export const SHOW_FPS_OVERLAY = true;

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

/** Pack names + accent colors (used on menu screens). */
export const PACKS = [
  { name: 'Backyard', color: '#5FBF4A' },
  { name: 'Garden', color: '#E8973D' },
  { name: 'Rooftop', color: '#8E9AA6' },
  { name: 'Park at Night', color: '#5C6BC0' },
  { name: 'Snow', color: '#7FC8E8' },
] as const;

// ---------------------------------------------------------------------------
// Juice tunables (all presentational; none affect game state)
// ---------------------------------------------------------------------------

/** Landing squash after a fall: dip duration and depth (scaleY at the dip). */
export const SQUASH_MS = 110;
export const SQUASH_SCALE = 0.82;

/** Munch pulse on the head when a snack is eaten. */
export const MUNCH_MS = 240;
export const MUNCH_SCALE = 0.22;

/** Grey-wash duration of the statue (freeze) transition. */
export const STATUE_WASH_MS = 520;

/** Dog-house door swing when a new dog spawns (open + close). */
export const DOOR_OPEN_MS = 750;

/** Death feedback: dust puff + rewind chevrons + board shake. */
export const DEATH_FX_MS = 750;
export const DUST_COUNT = 8;

/** Confetti burst on level clear. */
export const WIN_FX_MS = 1600;
export const CONFETTI_COUNT = 36;

/** Delay after the exit walk finishes before leaving the game screen
 *  (lets confetti play). */
export const WIN_NAVIGATE_MS = 1250;

/** Exit walk: ms per segment step into the door. */
export const EXIT_STEP_MS = 110;

/** Exit walk: door light burst + bump duration. */
export const EXIT_BURST_MS = 420;

/** Tail-wag cycle when idle at an open exit / ear-flap sizes. */
export const WAG_CYCLE_MS = 360;
export const WAG_RADIANS = 0.38;
export const EAR_FLAP_RADIANS = 0.5;

/** Open-exit glow pulse cycle. */
export const EXIT_PULSE_MS = 900;

// ---------------------------------------------------------------------------
// Look & layout
// ---------------------------------------------------------------------------

/** Outer margin around the board inside the canvas (px). */
export const BOARD_MARGIN = 10;

/** Corner radius of tiles/segments as a fraction of tile size. */
export const CORNER_RADIUS_FRAC = 0.24;

/** Thick cartoon outline width as a fraction of tile size. */
export const OUTLINE_FRAC = 0.07;

/** Sky decoration styles (palette swap per pack, same tiles). */
export type SkyDecor = 'clouds' | 'stars' | 'snow';

export interface PackPalette {
  /** Vertical sky gradient. */
  readonly skyTop: string;
  readonly skyBottom: string;
  /** Cloud / star / snowflake color + secondary (sun or moon). */
  readonly decor: SkyDecor;
  readonly decorColor: string;
  readonly decorAlt: string;
  /** Block tile: dirt body, dirt speckles, top cap ("grass"), cap shade. */
  readonly dirt: string;
  readonly dirtDark: string;
  readonly grass: string;
  readonly grassDark: string;
  /** Board frame. */
  readonly frame: string;
}

/** One palette per pack, indexed like PACKS. Same tiles, swapped colors. */
export const PACK_PALETTES: readonly PackPalette[] = [
  {
    // Backyard: classic bright day.
    skyTop: '#5BBEF2', skyBottom: '#B5E6FF',
    decor: 'clouds', decorColor: '#FFFFFF', decorAlt: '#FFDE59',
    dirt: '#B06A2C', dirtDark: '#8F5322', grass: '#57C24E', grassDark: '#2F8F2E',
    frame: '#3F7FB0',
  },
  {
    // Garden: golden afternoon.
    skyTop: '#6FC3E8', skyBottom: '#FFE7A8',
    decor: 'clouds', decorColor: '#FFF6E0', decorAlt: '#FFB13D',
    dirt: '#B5722F', dirtDark: '#935A24', grass: '#8FCE45', grassDark: '#4E9427',
    frame: '#C98B3A',
  },
  {
    // Rooftop: cool concrete + brick ledges.
    skyTop: '#7FA6CC', skyBottom: '#D9E6F2',
    decor: 'clouds', decorColor: '#F2F6FA', decorAlt: '#FFD98A',
    dirt: '#9A6B54', dirtDark: '#7C5442', grass: '#AEB9C4', grassDark: '#7A8794',
    frame: '#5C7690',
  },
  {
    // Park at Night: deep blue, moon + stars.
    skyTop: '#1C2A56', skyBottom: '#44549A',
    decor: 'stars', decorColor: '#FFE9A8', decorAlt: '#F4F0DC',
    dirt: '#6E4B2E', dirtDark: '#553922', grass: '#2E7D51', grassDark: '#1C5637',
    frame: '#101B3D',
  },
  {
    // Snow: icy sky, white caps.
    skyTop: '#8FCBEA', skyBottom: '#EAF7FF',
    decor: 'snow', decorColor: '#FFFFFF', decorAlt: '#CFEFFF',
    dirt: '#7E5F49', dirtDark: '#64493A', grass: '#FFFFFF', grassDark: '#BCD9E8',
    frame: '#6FA8C9',
  },
];

/** A cosmetic dog coat: the three colors that make up a dachshund's skin. */
export interface CoatColors {
  readonly body: string;
  readonly belly: string;
  readonly ear: string;
}

/** Head accessory cosmetics (one equipped at a time, or none). */
export type AccessoryId = 'bandana' | 'bow' | 'party-hat' | 'sunglasses' | 'crown';

/** Shared palette (bright, saturated, thick-outline cartoon look). */
export const COLORS = {
  outline: '#2B1B10',

  // Dachshund.
  dogBody: '#C1793C',
  dogBelly: '#E8B778',
  dogEar: '#7A4A22',
  dogInactive: '#A5906F',
  dogInactiveEar: '#7E7060',
  nose: '#2B1B12',
  eyeWhite: '#FFFFFF',
  eyePupil: '#231512',
  tongue: '#F27D93',
  blush: '#E8935F',

  // Snacks: bones.
  bone: '#F9EFC8',

  // Garden rake spikes.
  rakeMetal: '#97A4B0',
  rakeMetalDark: '#6E7B87',
  rakeWood: '#B0803F',

  // Exit dog door.
  exitFrame: '#4A362A',
  exitFlap: '#6B4F3F',
  exitLight: '#FFE066',
  exitGlow: '#FFF7CC',

  // Play-dead (freeze) tile.
  freezeMat: '#A88BD4',
  freezeMatDark: '#7A5FB0',
  freezePaw: '#F2ECFF',

  // Dog house.
  doghouse: '#D9534F',
  doghouseRoof: '#A93A32',
  doghouseDoor: '#3A241A',
  doghouseFlap: '#E9B45C',

  // Stone statues.
  statue: '#A8AFB6',
  statueDark: '#7E868E',
  statueCrack: '#5C646C',

  // FX.
  dust: '#E8DCC8',
  rewind: '#FFFFFF',
  confetti: ['#FF5A5A', '#FFD542', '#5FBF4A', '#5AA9FF', '#C77DFF', '#FF9A3D'],
} as const;

/** The default (free, always-owned) coat — today's colors. */
export const DEFAULT_COAT: CoatColors = {
  body: COLORS.dogBody,
  belly: COLORS.dogBelly,
  ear: COLORS.dogEar,
};

// ---------------------------------------------------------------------------
// Cosmetics shop (earned currency, cosmetics only — no monetization)
// ---------------------------------------------------------------------------

/** Biscuits awarded the first time a level is cleared. */
export const BISCUITS_FIRST_CLEAR = 10;

/** Biscuits awarded per star newly reached on a level (a first clear at 3★
 *  earns FIRST_CLEAR + 3 * PER_STAR; later improving 1★ -> 3★ earns
 *  2 * PER_STAR more). */
export const BISCUITS_PER_STAR = 5;

/** Biscuits awarded once, the first time the tutorial (all 5 lessons) is
 *  finished. */
export const BISCUITS_TUTORIAL = 20;

export interface ShopItem {
  readonly id: string;
  readonly slot: 'coat' | 'accessory' | 'theme';
  readonly name: string;
  readonly price: number;
  readonly blurb: string;
}

/** Coat catalog by id. `classic` is owned and equipped by default and is
 *  not sold (not listed in SHOP_ITEMS). */
export const COATS: Record<string, CoatColors> = {
  classic: DEFAULT_COAT,
  'black-tan': { body: '#2F2622', belly: '#C98A4A', ear: '#1A1412' },
  cream: { body: '#EFD7A3', belly: '#FFF4DE', ear: '#D6B07A' },
  chocolate: { body: '#6E3F25', belly: '#C08A5E', ear: '#4A2A18' },
  red: { body: '#B34A2A', belly: '#E8A47A', ear: '#7F2F18' },
  blueberry: { body: '#5A8FE0', belly: '#BFD8FF', ear: '#3A62A8' },
};

/** Board theme catalog by id — a PackPalette that overrides the pack's own
 *  palette on every level while equipped. `null`/absent = pack default. */
export const THEMES: Record<string, PackPalette> = {
  sunset: {
    skyTop: '#FF9A76', skyBottom: '#FFD6A5',
    decor: 'clouds', decorColor: '#FFF1E6', decorAlt: '#FF6B6B',
    dirt: '#8E5A6B', dirtDark: '#6B4152', grass: '#F28CA8', grassDark: '#C5607D',
    frame: '#7A3E5C',
  },
  candy: {
    skyTop: '#A5F3FC', skyBottom: '#FDE2FF',
    decor: 'clouds', decorColor: '#FFFFFF', decorAlt: '#FFB6F5',
    dirt: '#C77DFF', dirtDark: '#9B5DE5', grass: '#FF8FB1', grassDark: '#E05C8A',
    frame: '#7B2CBF',
  },
  'neon-night': {
    skyTop: '#0B0F2B', skyBottom: '#23214F',
    decor: 'stars', decorColor: '#7CF9FF', decorAlt: '#E0E0FF',
    dirt: '#2E2E4A', dirtDark: '#1D1D33', grass: '#39FF9C', grassDark: '#1FB870',
    frame: '#5CE1E6',
  },
};

/** Purchasable catalog (excludes the free default coat/theme). Total price
 *  2170; with BISCUITS_TUTORIAL a completionist can earn all of it. */
export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'black-tan', slot: 'coat', name: 'Black & Tan', price: 80, blurb: 'A classic saddle-black coat with tan points.' },
  { id: 'cream', slot: 'coat', name: 'Cream', price: 80, blurb: 'Soft and pale, nose to tail.' },
  { id: 'chocolate', slot: 'coat', name: 'Chocolate', price: 100, blurb: 'Rich, deep brown.' },
  { id: 'red', slot: 'coat', name: 'Red', price: 100, blurb: 'A warm, fiery red coat.' },
  { id: 'blueberry', slot: 'coat', name: 'Blueberry', price: 150, blurb: 'A dachshund in an unlikely blue.' },
  { id: 'bandana', slot: 'accessory', name: 'Red Bandana', price: 60, blurb: 'A jaunty little bandana.' },
  { id: 'bow', slot: 'accessory', name: 'Pink Bow', price: 80, blurb: 'For a touch of glamour.' },
  { id: 'party-hat', slot: 'accessory', name: 'Party Hat', price: 120, blurb: 'Every day is a celebration.' },
  { id: 'sunglasses', slot: 'accessory', name: 'Sunglasses', price: 150, blurb: 'Too cool for the garden.' },
  { id: 'crown', slot: 'accessory', name: 'Crown', price: 250, blurb: 'Royalty has arrived.' },
  { id: 'sunset', slot: 'theme', name: 'Sunset', price: 300, blurb: 'Warm pinks and an orange sky.' },
  { id: 'candy', slot: 'theme', name: 'Candy', price: 300, blurb: 'A sugary pastel wonderland.' },
  { id: 'neon-night', slot: 'theme', name: 'Neon Night', price: 400, blurb: 'Electric greens under a glowing sky.' },
];
