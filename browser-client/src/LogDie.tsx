import { useLayoutEffect, useRef } from 'react';
import { PolygonDie } from './PolygonDie.tsx';
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
  if (props.kind !== 'd8' && props.kind !== 'd16') return <PolygonDie {...props}/>;
  const sides = props.kind === 'd8' ? 8 : 16;
  const value = Number(props.face);
  const valid = Number.isInteger(value) && value >= 1 && value <= sides;
  return <span className={`match-die polygon-die numeric-die log-triangle-die ${props.kind}`} hidden={!valid}
    data-die-kind={props.kind} data-face={props.face} role="img" aria-label={`Ivory and cyan die: D${sides} ${props.face}`}>
    <svg viewBox="-26 -26 52 50" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><polygon points="0,-24 -26,24 26,24"/>
      <text ref={text} x="0" y="0">{props.face}</text></svg>
  </span>;
}
