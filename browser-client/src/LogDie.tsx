import { useLayoutEffect, useRef } from 'react';
import { BlockMark, PipMark } from './DiceFace.tsx';
import { blockFaceLabel } from './dice-presentation.ts';
import type { PolygonDieProps } from './PolygonDie.tsx';

/** Flat numeric faces keep the full result legible in a line of log text. */
export function LogDie(props: PolygonDieProps) {
  const text = useRef<SVGTextElement>(null);
  useLayoutEffect(() => {
    const element = text.current;
    if (!element) return;
    const center = () => {
      if (!element.isConnected) return;
      const bounds = element.getBBox();
      // Center actual glyph bounds on the triangle's centroid, including MUTP's bearings.
      element.setAttribute('transform', `translate(${-bounds.x - bounds.width / 2} ${8 - bounds.y - bounds.height / 2})`);
    };
    center();
    void document.fonts.ready.then(center);
    const resize = new ResizeObserver(center);
    resize.observe(element.ownerSVGElement!);
    return () => resize.disconnect();
  }, [props.face, props.kind]);
  if (props.kind !== 'd8' && props.kind !== 'd16') {
    const block = props.kind === 'block';
    const face = props.face ?? '';
    const valid = block ? ['SKULL', 'BOTH DOWN', 'PUSHBACK', 'POW/PUSH', 'POW'].includes(face) : /^[1-6]$/.test(face);
    return <span className={`match-die polygon-die log-flat-die ${block ? 'block-die' : 'numeric-die'} ${props.kind}${props.selected ? ' selected' : ''}${props.selected && props.chosenBy ? ` ${props.chosenBy}-selected` : ''}${props.selected && props.uphill ? ' uphill-selected' : ''}`}
      hidden={!valid} data-die-kind={props.kind} data-face={face} role="img"
      aria-label={`Ivory and cyan die: ${block ? blockFaceLabel(face) : `D6 ${face}`}`}>
      <svg viewBox="-3 -3 22 22" aria-hidden="true">{block ? <BlockMark face={face}/> : <PipMark face={face}/>}</svg>
    </span>;
  }
  const sides = props.kind === 'd8' ? 8 : 16;
  const value = Number(props.face);
  const valid = Number.isInteger(value) && value >= 1 && value <= sides;
  return <span className={`match-die polygon-die numeric-die log-triangle-die ${props.kind}`} hidden={!valid}
    data-die-kind={props.kind} data-face={props.face} role="img" aria-label={`Ivory and cyan die: D${sides} ${props.face}`}>
    <svg viewBox="-26 -26 52 50" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><polygon points="0,-24 -26,24 26,24"/>
      <text ref={text} x="0" y="0">{props.face}</text></svg>
  </span>;
}
