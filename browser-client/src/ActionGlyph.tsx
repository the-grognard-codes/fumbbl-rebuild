import { actionSpriteAtlas, actionSpriteFrames } from './action-icon-art.ts';
import type { ActionGlyphKind } from './action-icon-art.ts';

export type { ActionGlyphKind } from './action-icon-art.ts';

export function ActionGlyph({ kind }: { kind: ActionGlyphKind }) {
  if (kind === 'other') return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path d="M5 5h4v4H5zM12 5h16v4H12zM5 14h4v4H5zM12 14h16v4H12zM5 23h4v4H5zM12 23h16v4H12z" fill="currentColor"/>
  </svg>;
  if (kind === 'jumpUp') {
    const [x, y, width, height] = actionSpriteFrames.block;
    return <svg className="action-glyph" data-action-icon={kind} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <svg x="12" y="8" width="20" height="24" viewBox={`${x - 4} ${y - 4} ${width + 8} ${height + 8}`} style={{ overflow: 'hidden', imageRendering: 'pixelated' }}>
        <image href={`${import.meta.env.BASE_URL}assets/game/${actionSpriteAtlas.file}`} width={actionSpriteAtlas.width} height={actionSpriteAtlas.height}/>
      </svg>
      <path d="M7 29V5M2 11L7 5L12 11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="miter"/>
    </svg>;
  }
  if (kind === 'puntTarget') {
    const [x, y, width, height] = actionSpriteFrames.punt;
    return <svg className="action-glyph" data-action-icon={kind} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <svg x="0" y="8" width="25" height="24" viewBox={`${x - 4} ${y - 4} ${width + 8} ${height + 8}`} style={{ overflow: 'hidden', imageRendering: 'pixelated' }}>
        <image href={`${import.meta.env.BASE_URL}assets/game/${actionSpriteAtlas.file}`} width={actionSpriteAtlas.width} height={actionSpriteAtlas.height}/>
      </svg>
      <circle cx="23" cy="9" r="5" fill="#091726" stroke="currentColor" strokeWidth="2"/>
      <path d="M23 1V6M23 12V17M15 9H20M26 9H31" stroke="currentColor" strokeWidth="2"/>
    </svg>;
  }
  const hailMary = kind === 'hailMaryPass' || kind === 'hailMaryBomb';
  const sprite = kind === 'hailMaryPass' ? 'pass' : kind === 'hailMaryBomb' ? 'bomb' : kind;
  const [x, y, width, height] = actionSpriteFrames[sprite];
  if (hailMary) return <svg className="action-glyph" data-action-icon={kind} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <svg x="7" y="12" width="24" height="20" viewBox={`${x - 4} ${y - 4} ${width + 8} ${height + 8}`} style={{ overflow: 'hidden', imageRendering: 'pixelated' }}>
      <image href={`${import.meta.env.BASE_URL}assets/game/${actionSpriteAtlas.file}`} width={actionSpriteAtlas.width} height={actionSpriteAtlas.height}/>
    </svg>
    <path d="M3 23V12L7 5H19L25 11M19 11H25V5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="miter"/>
  </svg>;
  return <svg className="action-glyph" data-action-icon={kind} viewBox={`${x - 4} ${y - 4} ${width + 8} ${height + 8}`}
    aria-hidden="true" focusable="false" style={{ overflow: 'hidden', imageRendering: 'pixelated' }}>
    <image href={`${import.meta.env.BASE_URL}assets/game/${actionSpriteAtlas.file}`}
      width={actionSpriteAtlas.width} height={actionSpriteAtlas.height}/>
  </svg>;
}
