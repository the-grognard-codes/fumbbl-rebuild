import type { NegativeCondition } from './negative-condition-presentation.ts';

/** Scalable silhouettes keep the six conditions distinct at native pitch sizes. */
export function ConditionGlyph({ kind }: { kind: NegativeCondition }) {
  return <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false" data-condition-icon={kind}>
    <g fill="#ef5365" stroke="#ff969c" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'distracted' && <>
        <path d="M15 13c0-7 12-7 12 0 0 4-6 4-6 8h-4c0-7 6-6 6-9 0-2-4-2-4 1z"/>
        <circle cx="19" cy="27" r="2.3"/>
        <path d="M7 19c0-4 7-4 7 0 0 2-3 3-3 5H9c0-4 3-4 3-5 0-1-3-1-3 0z" strokeWidth=".5"/>
        <circle cx="10" cy="27" r="1.2"/>
        <path d="M28 17c0-3 5-3 5 0 0 2-2 2-2 4h-2c0-3 2-3 2-4 0-1-1-1-1 0z" strokeWidth=".5"/>
        <circle cx="30" cy="24" r="1"/>
      </>}
      {kind === 'chomped' && <>
        <path d="M8 13q12-9 24 0l-2 6H10zM9 25h22l-2 5q-9 6-18 0z" fill="#a72b40"/>
        <path d="m10 14 4 7 3-7 4 7 3-7 4 7 3-7M11 27l4-5 4 5 4-5 4 5" fill="#ff969c"/>
        <path d="m7 21 4 1m18 0 4-1" fill="none"/>
      </>}
      {kind === 'rooted' && <>
        <path d="m17 8 6 0-1 12 5 4 5 1-1 4-7-3-3-3v6l4 4h-5l-3-5-4 4H8l7-8 3-4z"/>
        <path d="m10 20 7 2m7-1 6-3M20 10v9" fill="none" stroke="#9b2339" strokeWidth="2"/>
      </>}
      {kind === 'dodgySnack' && <>
        <path d="M9 16q0-8 11-8 0 6 6 5-1 6 6 6l-1 9H9z" fill="#c33a4f"/>
        <path d="M9 22h22v8H9z"/>
        <path d="m13 17 3 2m-2 7h2m9-3 3 2" stroke="#ff969c" strokeWidth="2"/>
        <path d="m27 7 5 4m0-4-5 4" stroke="#ff969c" strokeWidth="1.8"/>
      </>}
      {kind === 'greasyCleats' && <>
        <path d="M9 9h12v12l9 3 2 6H9z" fill="#c33a4f"/>
        <path d="M10 30h22m-19 0v3m7-3v3m7-3v3m-13-20h6m-6 4h6" fill="none" strokeWidth="2"/>
        <path d="M29 8c0 4-4 6-4 9a4 4 0 0 0 8 0c0-3-4-5-4-9z"/>
      </>}
      {kind === 'eyeGouged' && <>
        <path d="M6 19q14-18 28 0-14 18-28 0z" fill="#a72b40"/>
        <circle cx="20" cy="19" r="6" fill="#ff969c"/>
        <circle cx="20" cy="19" r="3" fill="#60162b" stroke="none"/>
        <path d="m28 8-16 23" fill="none" stroke="#09131f" strokeWidth="5"/>
        <path d="m28 8-16 23" fill="none" stroke="#ff6375" strokeWidth="2.8"/>
      </>}
    </g>
  </svg>;
}
