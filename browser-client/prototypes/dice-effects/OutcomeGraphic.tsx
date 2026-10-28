// Review-only extensions of the existing injury-icons-v1.svg vocabulary.
import { memo } from 'react';

export const outcomes = [
  { id: 'armor', label: 'Armor broken', stage: 'Armor', faces: ['5', '6'], color: '#82d6ff' },
  { id: 'stun', label: 'Stunned', stage: 'Injury', faces: ['2', '3'], color: '#ffe17b' },
  { id: 'ko', label: 'Knocked out', stage: 'Injury', faces: ['4', '4'], color: '#eeae69' },
  { id: 'casualty', label: 'Casualty', stage: 'Injury', faces: ['5', '6'], color: '#a9d9ca' },
  { id: 'bh', label: 'Badly hurt', stage: 'Casualty', faces: ['2'], color: '#b2dfaa' },
  { id: 'mng', label: 'Miss next game', stage: 'Casualty', faces: ['3'], color: '#f2cd78' },
  { id: 'ni', label: 'Niggling injury', stage: 'Serious injury', faces: ['2'], color: '#eba86c' },
  { id: 'stat', label: 'Stat reduction', stage: 'Serious injury', faces: ['4'], color: '#e6a5b3' },
  { id: 'dead', label: 'Dead', stage: 'Casualty', faces: ['6'], color: '#ee9295' },
] as const;
export type Outcome = typeof outcomes[number]['id'];

const star = 'm0-4 1.2 2.6L4 0 1.2 1.2 0 4-1.2 1.2-4 0-1.2-1.4Z';

export const OutcomeGraphic = memo(function OutcomeGraphic({ kind }: { kind: Outcome }) {
  return <svg className={`outcome-art outcome-${kind}`} viewBox="0 0 48 48" role="img"
    aria-label={outcomes.find(value => value.id === kind)!.label}>
    <g strokeLinejoin="round" strokeLinecap="round">
      {kind === 'armor' && <>
        <g className="armor-left"><path d="m23 7-8 2-6 7 5 5 3-4-1 22h9l-4-9 5-7-6-6Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.5"/>
          <path d="m14 13 5-2m-2 14 3-3" stroke="var(--effect-light)" strokeWidth="2"/></g>
        <g className="armor-right"><path d="m25 7 8 2 6 7-5 5-3-4 1 22h-7l-4-9 5-7-6-6Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.5"/>
          <path d="m29 12 4 3m-5 16 1 4" stroke="var(--effect-light)" strokeWidth="2"/></g>
        <path className="impact-flare" d="m24 10 2 9 7-4-5 8 7 2-8 3 1 8-5-7-6 4 3-8-6-3 8-2Z" fill="var(--effect-accent)"/>
      </>}
      {(kind === 'stun' || kind === 'ko') && <>
        <g className={kind === 'ko' ? 'bonked-player' : ''}>
          <path d="m12 43 3-10 9-4 9 4 3 10" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.5"/>
          <path d="M14 24v-5a10 10 0 0 1 20 0v5l-5 8H19Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.5"/>
          <path d="M16 20h16v5H16Z" fill="var(--effect-dark)"/>
          <path d="m19 21 3 3m0-3-3 3m7-3 3 3m0-3-3 3" stroke="var(--effect-light)" strokeWidth="1.2"/>
          <path d="M24 11v7" stroke="var(--effect-light)" strokeWidth="2"/>
        </g>
        {kind === 'stun' ? <g className="star-orbit" fill="var(--effect-accent)">
          <path d={star} transform="translate(11 12)"/><path d={star} transform="translate(35 10) scale(.8)"/>
          <path d={star} transform="translate(25 5) scale(.65)"/>
          <path d="M8 13q16-12 32 0" fill="none" stroke="var(--effect-accent)" opacity=".4"/>
        </g> : <>
          <g className="bonk"><path d="m25 3 3 17" stroke="var(--effect-edge)" strokeWidth="4"/>
            <path d="m20 2 14-2 2 7-14 2Z" fill="var(--effect-accent)" stroke="var(--effect-edge)"/></g>
          <path className="impact-flare" d="m25 9 2 5 6-3-3 5 5 3-6 1-2 6-2-6-6 2 3-5-4-4 6 1Z" fill="var(--effect-accent)"/>
        </>}
      </>}
      {kind === 'casualty' && <>
        <g className="stretcher-player"><path d="M12 23h19l7 5H9Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.4"/>
          <circle cx="13" cy="21" r="4" fill="var(--effect-light)" stroke="var(--effect-edge)"/>
          <path d="m20 21 8 1 6 4H19Z" fill="var(--effect-fill)" stroke="var(--effect-edge)"/>
          <path d="M26 23v5m-2.5-2.5h5" stroke="var(--effect-accent)" strokeWidth="1.7"/>
        </g>
        <g className="stretcher"><path d="M5 32h38M9 29v8m30-8v8" stroke="var(--effect-edge)" strokeWidth="2.5"/>
          <path d="M9 30h30v5H9Z" fill="var(--effect-fill)" stroke="var(--effect-light)"/>
          <circle cx="13" cy="39" r="2" fill="var(--effect-accent)"/><circle cx="35" cy="39" r="2" fill="var(--effect-accent)"/>
        </g>
      </>}
      {['bh', 'mng', 'ni', 'stat'].includes(kind) && <g className="result-pulse">
        <path d="M5 11h38v26H5Z" fill="var(--effect-dark)" stroke="var(--effect-edge)" strokeWidth="1.5"/>
        <path d="M8 16v-2h5m22 0h5v2M8 32v2h5m22 0h5v-2" stroke="var(--effect-accent)" fill="none" strokeWidth="1.5"/>
        <text x="24" y="29" textAnchor="middle" fontSize={kind === 'mng' ? 15 : 20} fill="var(--effect-accent)"
          fontFamily="MUTP,sans-serif" fontWeight="700">{({ bh: 'BH', mng: 'MNG', ni: 'NI', stat: '−1' } as Record<string, string>)[kind]}</text>
      </g>}
      {kind === 'dead' && <g className="result-pulse">
        <path d="M13 23v-7a11 11 0 0 1 22 0v7l-5 6v8H18v-8Z" fill="var(--effect-light)" stroke="var(--effect-edge)" strokeWidth="1.5"/>
        <path d="m16 18 7 2-1 5-6-1Zm16 0-7 2 1 5 6-1ZM24 25l-3 4h6Z" fill="var(--effect-dark)"/>
        <path d="M21 32v5m6-5v5M11 39l26-4m-26 0 26 4" stroke="var(--effect-accent)" strokeWidth="2"/>
      </g>}
    </g>
  </svg>;
});
