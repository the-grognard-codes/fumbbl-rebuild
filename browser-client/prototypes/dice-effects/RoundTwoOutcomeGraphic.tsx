// Round two: fantasy-football equipment; round-one motion classes stay intact.
import { memo, useId, useLayoutEffect, useRef } from 'react';
import { outcomes, type Outcome } from './OutcomeGraphic.tsx';

const star = 'm0-4 1.2 2.6L4 0 1.2 1.2 0 4-1.2 1.2-4 0-1.2-1.4Z';
const leftMail = 'M22 6 16 8 8 14 6 23 12 27 16 20 15 41H24L21 33 26 26 21 20 25 14Z';
const rightMail = 'M26 6 32 8 40 14 42 23 36 27 32 20 33 41H24L21 33 26 26 21 20 25 14Z';

function CenteredResult({ label, size }: { label: string; size: number }) {
  const text = useRef<SVGTextElement>(null);
  useLayoutEffect(() => {
    let active = true;
    const center = () => {
      if (!active || !text.current) return;
      const box = text.current.getBBox();
      // Center actual font bounds, rather than estimating a baseline from font size.
      text.current.setAttribute('transform', `translate(${24 - box.x - box.width / 2},${24 - box.y - box.height / 2})`);
    };
    center();
    void document.fonts.ready.then(center);
    document.fonts.addEventListener('loadingdone', center);
    return () => { active = false; document.fonts.removeEventListener('loadingdone', center); };
  }, [label, size]);
  return <text ref={text} x="0" y="0" fontSize={size} fill="var(--effect-accent)"
    fontFamily="MUTP,sans-serif" fontWeight="700" data-result-label="">{label}</text>;
}

/** Rounded gridiron shell, ear protection, open face cage, laced jersey and studded pads. */
function FootballPlayer() {
  return <g data-equipment="football-kit">
    <path d="m12 43 1-9 7-4h8l7 4 1 9" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.4"/>
    <path d="m13 32-5 3 1 6 7-1 2-6m17-2 5 3-1 6-7-1-2-6" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.4"/>
    <path d="m10 34 1-3 2 2m23 0 1-2 1 3" fill="var(--effect-light)" stroke="var(--effect-edge)"/>
    <path d="M24 33v8m-2-6h4m-4 3h4" stroke="var(--effect-accent)" strokeWidth="1.1"/>
    <g data-equipment="football-helmet">
      <path d="M12 21v-4C12 9 17 6 24 6s12 3 12 11v6l-5 7H17Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.5"/>
      <path d="M22 7v9h4V7" fill="var(--effect-accent)"/>
      <path d="M15 17q9-3 18 0l-2 9H17Z" fill="var(--effect-dark)" stroke="var(--effect-edge)" strokeWidth="1"/>
      <path d="m18 19 4 3m0-3-4 3m8-3 4 3m0-3-4 3" stroke="var(--effect-light)" strokeWidth="1.1"/>
      <path d="M14 22h20v5l-5 4H19l-5-4Zm0 4h20m-14-4v8m8-8v8" fill="none" stroke="var(--effect-light)" strokeWidth="1.35"/>
      <path d="M11 18h3v7h-3Zm23 0h3v7h-3Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.1"/>
      <circle cx="12.5" cy="21.5" r=".8" fill="var(--effect-accent)"/><circle cx="35.5" cy="21.5" r=".8" fill="var(--effect-accent)"/>
    </g>
  </g>;
}

export const RoundTwoOutcomeGraphic = memo(function RoundTwoOutcomeGraphic({ kind }: { kind: Outcome }) {
  const id = useId().replace(/:/g, '');
  return <svg className={`outcome-art outcome-${kind}`} viewBox="0 0 48 48" role="img"
    aria-label={outcomes.find(value => value.id === kind)!.label} data-art-round="2">
    <g strokeLinejoin="round" strokeLinecap="round">
      {kind === 'armor' && <>
        <defs>
          <pattern id={`${id}-rings`} width="4" height="3.5" patternUnits="userSpaceOnUse">
            <path d="M.2 1.6a1.5 1 0 0 0 3 0 1.5 1 0 0 0-3 0m2-1.7a1.5 1 0 0 0 3 0" fill="none" stroke="var(--effect-light)" strokeWidth=".55" opacity=".85"/>
          </pattern>
        </defs>
        <g className="armor-left" data-equipment="chainmail">
          <path d={leftMail} fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.4"/>
          <path d={leftMail} fill={`url(#${id}-rings)`}/>
          <path d="m16 8 5 2-1 4-7-1-3 5-2-4Z" fill="var(--effect-dark)" stroke="var(--effect-edge)"/>
          <path d="M16 9h3m-8 5 1-1m5 25h4" stroke="var(--effect-accent)" strokeWidth="1.2"/>
          <path d="m22 6 3 8-4 6 5 6-5 7 3 8" fill="none" stroke="var(--effect-light)" strokeWidth="1.2"/>
        </g>
        <g className="armor-right">
          <path d={rightMail} fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.4"/>
          <path d={rightMail} fill={`url(#${id}-rings)`}/>
          <path d="m32 8-5 2 1 4 7-1 3 5 2-4Z" fill="var(--effect-dark)" stroke="var(--effect-edge)"/>
          <path d="M29 9h3m4 5 1 1m-10 23h4" stroke="var(--effect-accent)" strokeWidth="1.2"/>
        </g>
        <path className="impact-flare" d="m24 10 2 9 7-4-5 8 7 2-8 3 1 8-5-7-6 4 3-8-6-3 8-2Z" fill="var(--effect-accent)"/>
      </>}
      {(kind === 'stun' || kind === 'ko') && <>
        <g className={kind === 'ko' ? 'bonked-player' : ''}><FootballPlayer/></g>
        {kind === 'stun' ? <g className="star-orbit" fill="var(--effect-accent)">
          <path d={star} transform="translate(8 12) scale(.8)"/><path d={star} transform="translate(39 10) scale(.8)"/>
          <path d={star} transform="translate(25 3) scale(.65)"/>
          <path d="M5 13Q24-4 43 12" fill="none" stroke="var(--effect-accent)" opacity=".4"/>
        </g> : <>
          <g className="bonk"><path d="m25 3 3 17" stroke="var(--effect-edge)" strokeWidth="4"/>
            <path d="m20 2 14-2 2 7-14 2Z" fill="var(--effect-accent)" stroke="var(--effect-edge)"/>
            <path d="m23 3 1 4m7-5 1 4" stroke="var(--effect-light)" strokeWidth="1"/>
          </g>
          <path className="impact-flare" d="m25 9 2 5 6-3-3 5 5 3-6 1-2 6-2-6-6 2 3-5-4-4 6 1Z" fill="var(--effect-accent)"/>
        </>}
      </>}
      {kind === 'casualty' && <>
        <g className="stretcher-player" data-equipment="football-kit">
          <path d="M11 24h20l9 5H9Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.3"/>
          <path d="m18 21 8 1 8 4-1 3H18Z" fill="var(--effect-fill)" stroke="var(--effect-edge)"/>
          <path d="m18 21 3-2 3 2-1 5-4-1Z" fill="var(--effect-light)" stroke="var(--effect-edge)"/>
          <path d="m31 25 5 1 5 3-1 2h-5l-3-3" fill="var(--effect-dark)" stroke="var(--effect-edge)"/>
          <path d="m35 30 1 2m3-2 1 2" stroke="var(--effect-light)" strokeWidth="1"/>
          <g data-equipment="football-helmet"><path d="M7 22v-3a5 5 0 0 1 10 0v5H9Z" fill="var(--effect-fill)" stroke="var(--effect-edge)"/>
            <path d="M10 15v4m5 1h4v4h-5m1-2h4" fill="none" stroke="var(--effect-light)" strokeWidth="1.1"/>
          </g>
          <path d="M26 22v5m-2.5-2.5h5" stroke="var(--effect-accent)" strokeWidth="1.5"/>
        </g>
        <g className="stretcher"><path d="M5 32h38M9 29v8m30-8v8" stroke="var(--effect-edge)" strokeWidth="2.5"/>
          <path d="M9 30h30v5H9Z" fill="var(--effect-fill)" stroke="var(--effect-light)"/>
          <circle cx="13" cy="39" r="2" fill="var(--effect-accent)"/><circle cx="35" cy="39" r="2" fill="var(--effect-accent)"/>
        </g>
      </>}
      {['bh', 'mng', 'ni', 'stat'].includes(kind) && <g className="result-pulse">
        <rect x="5" y="11" width="38" height="26" fill="var(--effect-dark)" stroke="var(--effect-edge)" strokeWidth="1.5" data-result-box=""/>
        <path d="M8 16v-2h5m22 0h5v2M8 32v2h5m22 0h5v-2" stroke="var(--effect-accent)" fill="none" strokeWidth="1.5"/>
        <CenteredResult label={({ bh: 'BH', mng: 'MNG', ni: 'NI', stat: '−1' } as Record<string, string>)[kind]} size={kind === 'mng' ? 15 : 20}/>
      </g>}
      {kind === 'dead' && <g className="result-pulse">
        <path d="M13 23v-7a11 11 0 0 1 22 0v7l-5 6v8H18v-8Z" fill="var(--effect-light)" stroke="var(--effect-edge)" strokeWidth="1.5"/>
        <path d="M11 17V14C11 5 17 3 24 3s13 2 13 11v3l-6-3H17Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.5" data-equipment="football-helmet"/>
        <path d="M22 4v8h4V4m-13 9h22" fill="var(--effect-accent)" stroke="var(--effect-edge)" strokeWidth="1"/>
        <path d="m16 18 7 2-1 5-6-1Zm16 0-7 2 1 5 6-1ZM24 25l-3 4h6Z" fill="var(--effect-dark)"/>
        <path d="M21 32v5m6-5v5M11 40l26-5m-26 0 26 5" stroke="var(--effect-accent)" strokeWidth="2"/>
        <path d="m10 38-1 3 3 1m24-8 2-1 1 3m-29-3-1 3 3 1m24 1 2 1 1-3" fill="none" stroke="var(--effect-accent)" strokeWidth="1.3"/>
      </g>}
    </g>
  </svg>;
});
