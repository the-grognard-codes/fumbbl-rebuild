/** Transparent sprites extracted from the approved unlabeled MUTP artwork.
 * Source rectangles exclude neighboring sprites and center each subject in its tile. */
export const actionSpriteFrames = {
  move: [89, 83, 161, 160],
  block: [335, 83, 129, 160],
  blitz: [560, 75, 178, 177],
  foul: [799, 79, 168, 170],
  handOff: [1036, 97, 197, 128],
  pass: [1297, 84, 166, 145],
  chainsaw: [73, 321, 194, 141],
  stab: [324, 297, 151, 176],
  vomit: [551, 313, 188, 166],
  fire: [806, 311, 181, 156],
  chomp: [1064, 302, 153, 175],
  gaze: [1291, 303, 183, 182],
  bomb: [88, 533, 150, 177],
  throwMate: [309, 529, 178, 181],
  kickMate: [539, 533, 206, 173],
  multipleBlock: [785, 557, 208, 149],
  secure: [1033, 564, 208, 125],
  punt: [1291, 544, 182, 158],
  jump: [80, 765, 153, 178],
  recover: [320, 765, 175, 176],
  forgo: [548, 775, 202, 149],
  star: [806, 772, 162, 164],
  end: [1043, 788, 184, 141],
  confirm: [1301, 788, 162, 135],
} as const;

export type ActionGlyphKind = keyof typeof actionSpriteFrames | 'other' | 'hailMaryPass' | 'hailMaryBomb';
export const actionSpriteAtlas = { width: 1536, height: 1024, file: 'ui/player-action-icons-v1.png' } as const;
