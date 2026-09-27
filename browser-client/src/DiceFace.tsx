const pip: Record<string, [number, number][]> = {
  '1': [[32, 32]], '2': [[20, 20], [44, 44]], '3': [[20, 20], [32, 32], [44, 44]],
  '4': [[20, 20], [44, 20], [20, 44], [44, 44]],
  '5': [[20, 20], [44, 20], [32, 32], [20, 44], [44, 44]],
  '6': [[20, 18], [44, 18], [20, 32], [44, 32], [20, 46], [44, 46]]
};

/** Reusable vector die art for recorded rolls and exact server-offered block choices. */
export function DiceFace({ face, selected = false }: { face: string; selected?: boolean }) {
  return <svg className={`match-die${selected ? ' selected' : ''}`} viewBox="0 0 64 64" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="8" fill="#e8dfc9" stroke={selected ? '#8ac8fb' : '#a68859'} strokeWidth="4"/>
    {pip[face]?.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="5" fill="#263c4a"/>)}
    {face === 'SKULL' && <g fill="#293b43"><circle cx="32" cy="27" r="15"/><rect x="24" y="38" width="16" height="9" rx="2"/></g>}
    {face === 'SKULL' && <g fill="#e8dfc9"><circle cx="26" cy="27" r="3"/><circle cx="38" cy="27" r="3"/><path d="M32 32l-3 5h6z"/></g>}
    {face === 'BOTH DOWN' && <><path d="M19 16v27m26-27v27M12 36l7 9 7-9m12 0l7 9 7-9" fill="none" stroke="#8c3c31" strokeWidth="5" strokeLinejoin="round"/><text x="32" y="57" textAnchor="middle" fontSize="8" fill="#293b43">BOTH DOWN</text></>}
    {face === 'PUSHBACK' && <><path d="M13 31h30m-11-12l13 12-13 12" fill="none" stroke="#405c8a" strokeWidth="7" strokeLinejoin="round"/><text x="32" y="56" textAnchor="middle" fontSize="8" fill="#293b43">PUSH</text></>}
    {(face === 'POW' || face === 'POW/PUSH') && <><path d="M32 10l6 11 12-3-4 12 9 8-13 2-4 12-8-9-12 6 2-13-10-7 13-3z" fill="#bd6b36" stroke="#594333" strokeWidth="2"/><text x="32" y="37" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#fff4d6">POW</text>{face === 'POW/PUSH' && <text x="32" y="57" textAnchor="middle" fontSize="8" fill="#293b43">PUSH</text>}</>}
  </svg>;
}
