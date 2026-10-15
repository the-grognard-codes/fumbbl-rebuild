import { actionSpriteAtlas, actionSpriteFrames } from './action-icon-art.ts';
import type { ActionGlyphKind } from './action-icon-art.ts';

export type { ActionGlyphKind } from './action-icon-art.ts';

export function ActionGlyph({ kind }: { kind: ActionGlyphKind }) {
  if (kind === 'other') return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path d="M5 5h4v4H5zM12 5h16v4H12zM5 14h4v4H5zM12 14h16v4H12zM5 23h4v4H5zM12 23h16v4H12z" fill="currentColor"/>
  </svg>;
  const [x, y, width, height] = actionSpriteFrames[kind];
  return <svg className="action-glyph" data-action-icon={kind} viewBox={`${x - 4} ${y - 4} ${width + 8} ${height + 8}`}
    aria-hidden="true" focusable="false" style={{ overflow: 'hidden', imageRendering: 'pixelated' }}>
    <image href={`${import.meta.env.BASE_URL}assets/game/${actionSpriteAtlas.file}`}
      width={actionSpriteAtlas.width} height={actionSpriteAtlas.height}/>
  </svg>;
}
