// Round three: reference-inspired shoulder pads and a cloth-and-poles stretcher.
import { memo, useLayoutEffect, useRef } from 'react';
import { outcomes, type Outcome } from './OutcomeGraphic.tsx';

const star = 'm0-4 1.2 2.6L4 0 1.2 1.2 0 4-1.2 1.2-4 0-1.2-1.4Z';

/** One side of the reference's front-laced pads; the other side is mirrored. */
function ShoulderPadHalf() {
  return <>
    <path d="M17 7c0 5 2 8 6 10v24l-10-3-3-14 1-11Z" fill="var(--effect-dark)" stroke="var(--effect-edge)" strokeWidth="1.3"/>
    <path d="m14 9 3-2c0 6 2 9 6 11v4l-2 2 2 3-2 3 2 3v5l-8-2-2-12-2-6Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.3"/>
    <path d="M4 20C2 16 5 9 10 8c4-1 7 0 10 3l-2 10-5 4-7-2Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.5"/>
    <path d="M5 15q4-6 12-3m-11 9 6 2 4-3" fill="none" stroke="var(--effect-light)" strokeWidth="1.2"/>
    <path d="m13 25 8 1v3l-7-1m1 5 6 1v3l-6-1" fill="var(--effect-dark)" stroke="var(--effect-edge)" strokeWidth=".8"/>
    <path d="m16 26 3 .4v1.8l-3-.4Zm1 8 3 .4v1.8l-3-.4Z" fill="none" stroke="var(--effect-accent)" strokeWidth=".9"/>
    <path d="m21 20 2 1m-2 4 2 1m-2 4 2 1m-2 4 2 1" stroke="var(--effect-accent)" strokeWidth="1.1"/>
    <circle cx="10" cy="10.5" r=".65" fill="var(--effect-accent)"/><circle cx="16" cy="12" r=".65" fill="var(--effect-accent)"/>
  </>;
}

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

export const RoundThreeOutcomeGraphic = memo(function RoundThreeOutcomeGraphic({ kind }: { kind: Outcome }) {
  return <svg className={`outcome-art outcome-${kind}`} viewBox="0 0 48 48" role="img"
    aria-label={outcomes.find(value => value.id === kind)!.label} data-art-round="3">
    <g strokeLinejoin="round" strokeLinecap="round">
      {kind === 'armor' && <>
        <g className="armor-left" data-equipment="football-shoulder-pads"><ShoulderPadHalf/></g>
        <g className="armor-right"><g transform="translate(48 0) scale(-1 1)"><ShoulderPadHalf/></g></g>
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
          <path d="m15 23 7-2 9 4 4 4H15Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.2"/>
          <path d="m18 22 3-2 4 2-2 6-5-1Z" fill="var(--effect-fill)" stroke="var(--effect-light)" strokeWidth="1"/>
          <path d="m25 24 6 1 4 3-2 2-7-3" fill="var(--effect-dark)" stroke="var(--effect-edge)" strokeWidth="1"/>
          <g data-equipment="cleats">
            <path d="m32 26 4 1 2-1 6 3-1 2h-7l-4-2Z" fill="var(--effect-dark)" stroke="var(--effect-edge)" strokeWidth="1.1"/>
            <path d="m35 31 .5 2h1.5v-2m3 0 .5 2H42v-2" fill="var(--effect-accent)"/>
            <path d="m37 27 2 2m0-2 2 2" stroke="var(--effect-light)" strokeWidth=".8"/>
          </g>
          <g data-equipment="football-helmet"><path d="M6 22v-3a5.5 5.5 0 0 1 11 0v5H8Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.2"/>
            <path d="M10 14v4m5 2h5v5h-5m1-2h4m-2-3v5" fill="none" stroke="var(--effect-light)" strokeWidth="1.1"/>
            <circle cx="10" cy="21" r="1" fill="var(--effect-accent)"/>
          </g>
          <path d="m23 23 3 3m-3-2 2-1" stroke="var(--effect-accent)" strokeWidth="1.1"/>
        </g>
        <g className="stretcher" data-equipment="cloth-and-poles">
          <path d="M9 30h30l-2 7q-13 5-26 0Z" fill="var(--effect-fill)" stroke="var(--effect-edge)" strokeWidth="1.1"/>
          <path d="M3 30h42M3 37h42" stroke="var(--effect-accent)" strokeWidth="2"/>
          <path d="m12 31 3 5m20-5-3 5m-15-2q7 3 14 0" fill="none" stroke="var(--effect-dark)" strokeWidth="1"/>
          <path d="M15 38q9 3 18 0" fill="none" stroke="var(--effect-light)" strokeWidth=".8"/>
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
