import { createRoot } from 'react-dom/client';
import { FormationManager } from '../src/FormationManager.tsx';
import type { TeamDraft } from '../src/team-protocol.ts';
import type { TeamFormations } from '../src/team-formations.ts';

declare global {
  interface Window {
    formationDraft: TeamDraft;
    formationSaves: TeamFormations[];
  }
}
const root = createRoot(document.getElementById('app')!);
function closed() { root.render(<button type="button" onClick={open}>Open formations</button>); }
function open() {
  root.render(<FormationManager draft={window.formationDraft} close={closed} save={formations => {
    window.formationSaves.push(formations);
    window.formationDraft = { ...window.formationDraft, formations };
    closed();
  }}/>);
}
closed();
