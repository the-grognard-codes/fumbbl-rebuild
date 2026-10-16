import { createRoot } from 'react-dom/client';
import { PolygonDie } from '../src/PolygonDie.tsx';
import '../src/match-log.css';

const samples = [
  { name: 'Block POW', kind: 'block' as const, face: 'POW', grouped: true, selected: true, chosenBy: 'home' as const },
  { name: 'Block PUSH', kind: 'block' as const, face: 'PUSHBACK', grouped: true, selected: false },
  { name: 'Block SKULL', kind: 'block' as const, face: 'SKULL', grouped: true, selected: false },
  { name: 'D6 pips', kind: 'd6' as const, face: '6', selected: false },
  { name: 'D8 number', kind: 'd8' as const, face: '4', selected: false },
  { name: 'D16 number', kind: 'd16' as const, face: '9', selected: false }
];

createRoot(document.getElementById('app')!).render(<main className="match-event-scroll" data-die-mark-probe>
  {samples.map(sample => <p key={sample.name}>{sample.name}: {sample.grouped
    ? <span className="match-log-dice"><PolygonDie kind={sample.kind} face={sample.face} selected={sample.selected} chosenBy={sample.chosenBy}/></span>
    : <PolygonDie kind={sample.kind} face={sample.face} selected={sample.selected}/>}</p>)}
</main>);
