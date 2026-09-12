/**
 * Design tokens for Qurie Supplier. Same white ground and ink as the shop
 * app; the difference is which green leads. The shop app leads with lime
 * and uses forest for its mark. The supplier app leads with forest: the
 * tiles, the field, the buttons and the owner's bubbles are forest, and
 * lime is the light that sits on them. Red and green keep their one
 * meaning: money due, money paid.
 */

export const colors = {
  paper: '#FAFAF7',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4EF',
  ink: '#151A17',
  muted: '#6A726E',
  border: '#E5E8E2',

  lime: '#D9F36A',
  limeSoft: '#EEF8C6',
  /** Text that sits on lime. */
  limeInk: '#1B3A2C',
  onLime: '#151A17',
  forest: '#1E4A3B',
  forestSoft: '#E3EFE6',
  /** Text that sits on forest. */
  onForest: '#FFFFFF',
  onForestMuted: '#CFE3D6',

  green: '#1F7A4D',
  greenSoft: '#E6F3EB',
  red: '#C43B2E',
  redSoft: '#FCEBE8',
  amber: '#B7791F',
  amberSoft: '#FBF3E3',
  blue: '#2F5BEA',
  blueSoft: '#EAEFFD',

  /** Qurie's sheet: a forest tint instead of the shop app's lime tint. */
  sheet: '#E3EFE6',
  handle: '#9FB8A8',

  /** Composer: lime plus with a forest icon, forest field with lime placeholder, dark mic. */
  plusBg: '#D9F36A',
  plusIcon: '#1E4A3B',
  fieldBg: '#1E4A3B',
  fieldText: '#FFFFFF',
  fieldPlaceholder: '#9FBCAC',   // a hint on the forest field, not a label
  fieldIcon: '#9FBCAC',
  mic: '#151A17',
  micIcon: '#D9F36A',

  /** Primary buttons: forest with lime text. */
  button: '#1E4A3B',
  onButton: '#D9F36A',

  /** The lead tile: forest with lime figure. */
  tile: '#1E4A3B',
  onTile: '#CFE3D6',
  onTileStrong: '#D9F36A',

  /** The owner's chat bubbles. */
  bubbleMine: '#1E4A3B',
  onBubbleMine: '#FFFFFF',

  /** Browser preview frame ground. */
  frame: '#E9EBE6',
} as const;

/** Pastel circle + ink pairs for initial-letter avatars. Picked by name hash. */
export const avatarTones = [
  { bg: '#E8E4F7', ink: '#5B47B5' },
  { bg: '#E0F2E8', ink: '#1F7A4D' },
  { bg: '#FDEBD9', ink: '#B7791F' },
  { bg: '#E3EEFB', ink: '#2F5BEA' },
  { bg: '#FBE3E8', ink: '#C43B2E' },
  { bg: '#EEF7D8', ink: '#5E7A1F' },
  { bg: '#FFF2CC', ink: '#8A6D00' },
] as const;

export const font = {
  regular: 'NotoSans_400Regular',
  medium: 'NotoSans_500Medium',
  semibold: 'NotoSans_600SemiBold',
  bold: 'NotoSans_700Bold',
} as const;

/** Type scale from the design brief. Nothing under 13. */
export const type = {
  display: 32,
  title: 22,
  heading: 18,
  body: 17,
  secondary: 15,
  caption: 13,
} as const;

export const radius = { card: 12, tile: 16, pill: 24, sheet: 20 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Minimum touch target from the brief. */
export const tap = 48;
