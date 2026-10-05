import type { PassingRanges } from './setup-protocol.ts';

const ranges: Record<string, { name: string; level: number }> = {
  Q: { name: 'Quick Pass', level: 0 }, S: { name: 'Short Pass', level: 1 },
  L: { name: 'Long Pass', level: 2 }, B: { name: 'Long Bomb', level: 3 }, R: { name: 'Pass to Partner', level: 0 },
};
const colors = ['#43bc6580', '#eed24b80', '#ee8a3280', '#db3d4280', '#7d192a99'];

/** Interpret native range codes; distance and eligibility are never calculated here. */
export function passingSquare(passing: PassingRanges, x: number, y: number) {
  const range = ranges[passing.ranges[x]?.[y] ?? '-'];
  if (!range) return { code: '-', color: '#10172388', description: `Square ${x}, ${y}: unavailable passing distance${passing.rangeLimited ? '; weather limits passes to Quick or Short' : ''}` };
  return { code: passing.ranges[x][y], color: colors[range.level + passing.weatherPenalty],
    description: `Square ${x}, ${y}: ${range.name}${passing.weatherPenalty ? `; weather +${passing.weatherPenalty} passing penalty` : ''}` };
}

export function passingLegend(passing: PassingRanges) {
  const names = ['green', 'yellow', 'orange', 'red', 'dark red'];
  return ['Quick Pass', 'Short Pass', 'Long Pass', 'Long Bomb'].map((name, level) => passing.rangeLimited && level >= 2
    ? { name, color: '#10172388', text: `${name}: unavailable (weather)` }
    : { name, color: colors[level + passing.weatherPenalty], text: `${name}: ${names[level + passing.weatherPenalty]}` });
}
