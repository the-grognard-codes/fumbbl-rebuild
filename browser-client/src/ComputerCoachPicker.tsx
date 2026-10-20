import { computerCoaches } from './computer-coaches.ts';

export function ComputerCoachPicker({ selectedId, onSelect }: {
  selectedId: string; onSelect: (id: string) => void;
}) {
  return <ul className="ai-coaches" aria-label="AI coaches">{computerCoaches.map(coach => {
    const selected = coach.id === selectedId;
    return <li key={coach.key}><button type="button" className="ai-coach-card" aria-label={coach.name}
      aria-pressed={selected} aria-describedby={`${coach.key}-description ${coach.key}-availability`}
      disabled={coach.id === null} onClick={() => { if (coach.id !== null) onSelect(coach.id); }}>
      <img src={coach.avatar} width="96" height="96" alt="" />
      <strong className="ai-coach-name">{coach.name}</strong>
      <span className="ai-coach-difficulty">Skill level: {coach.difficulty}</span>
      <span className="ai-coach-description" id={`${coach.key}-description`}>{coach.description}</span>
      <span className="ai-coach-availability" id={`${coach.key}-availability`}>{coach.id === null ? 'Coming soon!' : selected ? '✓ Selected' : 'Choose coach'}</span>
    </button></li>;
  })}</ul>;
}
