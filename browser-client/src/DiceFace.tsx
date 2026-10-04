import { useEffect, useRef } from 'react';
import './DiceFace.css';

const ink = '#14283e';
const faceColor = '#f4e2bd';
const bodyUrl = `${import.meta.env.BASE_URL}assets/game/ui/dice/ivory-cyan-v1.png`;
const pips: Record<string, [number, number][]> = {
  '1': [[8, 8]],
  '2': [[4, 4], [12, 12]],
  '3': [[4, 4], [8, 8], [12, 12]],
  '4': [[4, 4], [12, 4], [4, 12], [12, 12]],
  '5': [[4, 4], [12, 4], [8, 8], [4, 12], [12, 12]],
  '6': [[4, 3], [12, 3], [4, 8], [12, 8], [4, 13], [12, 13]]
};
const skull = 'M5 2H11V3H13V5H14V10H12V12H11V15H5V12H4V10H2V5H3V3H5Z M4 6V9H7V6Z M9 6V9H12V6Z M7 10V12H9V10Z M6 13V15H7V13Z M9 13V15H10V13Z';
const burst = 'M7 0H10L11 4L15 2L13 6L16 8L12 10L14 14L10 12L8 16L6 12L2 14L4 10L0 8L4 6L2 2L6 4Z';

function BlockMark({ face }: { face: string }) {
  if (face === 'SKULL') return <path d={skull} fillRule="evenodd"/>;
  if (face === 'BOTH DOWN') return <>
    <path d={burst}/>
    <path d={skull} fill={faceColor} fillRule="evenodd" transform="translate(2 2) scale(.75)"/>
  </>;
  if (face === 'PUSHBACK') return <path d="M1 6H9V2L16 8L9 14V10H1Z"/>;
  if (face === 'POW/PUSH') return <>
    <path d={burst}/>
    <path d="M4 7H8V4L12 8L8 12V9H4Z" fill={faceColor}/>
  </>;
  if (face === 'POW') return <path d={burst}/>;
  return null;
}

/** Approved ivory-cyan die art with exact native outcomes drawn as crisp vector marks. */
export function DiceFace({ face, selected = false, rollKey }: { face: string; selected?: boolean; rollKey?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (rollKey === undefined || selected) return;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (preference?.matches) return;
    const animation = svg.current?.animate([
      { transform: 'translate(0,0) rotate(0deg)' },
      { transform: 'translate(-2px,-3px) rotate(150deg)', offset: .4 },
      { transform: 'translate(0,-1px) rotate(300deg)', offset: .8 },
      { transform: 'translate(0,0) rotate(360deg)' }
    ], { duration: 440, easing: 'cubic-bezier(.2,.6,.35,1)' });
    const reduce = () => { if (preference?.matches) animation?.cancel(); };
    preference?.addEventListener('change', reduce);
    return () => { animation?.cancel(); preference?.removeEventListener('change', reduce); };
  }, [rollKey, selected]);

  const pipSet = Object.hasOwn(pips, face) ? pips[face] : undefined;
  const blockLabels: Record<string,string> = { SKULL: 'Skull', 'BOTH DOWN': 'Both down', PUSHBACK: 'Push', 'POW/PUSH': 'Stumble', POW: 'Pow' };
  const label = pipSet ? `D6 ${face}` : Object.hasOwn(blockLabels, face) ? blockLabels[face] : undefined;
  return <svg ref={svg} className={`match-die${selected ? ' selected' : ''}`} data-face={face} viewBox="18 18 88 88" role="img"
    aria-label={label ? `Ivory and cyan die: ${label}` : 'Unknown die face'}>
    <image href={bodyUrl} width="128" height="128"/>
    <g transform="translate(38 52) scale(2.25)" fill={ink} shapeRendering="crispEdges">
      {pipSet?.map(([x, y], index) => <path key={index} d={`M${x - 1},${y - 1.5}h2l.5,.5v2l-.5,.5h-2l-.5,-.5v-2z`} data-pip=""/>)}
      {!pipSet && label && <BlockMark face={face}/>}
    </g>
  </svg>;
}
