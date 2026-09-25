import type { SetupState } from './setup-protocol.ts';

/** Text and native-button route through the same current server targets as the visual board. */
export function PitchCompanion({ view, x, y, selectedPlayerId, focusedPlayerId, onFocusSquare, onActivateSquare }: {
  view: SetupState; x: number; y: number; selectedPlayerId: string; focusedPlayerId: string | null;
  onFocusSquare: (x: number, y: number) => void; onActivateSquare: (x: number, y: number) => void;
}) {
  const focused = focusedPlayerId ? view.players.find(player => player.id === focusedPlayerId) : null;
  const selected = view.players.find(player => player.id === selectedPlayerId);
  const occupant = view.players.find(player => player.x === x && player.y === y);
  const ball = view.ball?.x === x && view.ball.y === y;
  const targets = view.actions.filter(action => action.target && ('playerId' in action.target
    ? action.target.playerId === occupant?.id : action.target.x === x && action.target.y === y));
  const squareSummary = `Square ${x}, ${y}: ${occupant ? `${occupant.role} ${occupant.name} number ${occupant.slot}, ${occupant.state}` : 'empty'}${ball ? ', ball here' : ''}${targets.length ? `, ${targets.length} server-issued target${targets.length === 1 ? '' : 's'}` : ''}.`;
  return <section className="pitch-companion" aria-label="Pitch text companion">
    <h3>Pitch text companion</h3>
    <p role="status" aria-live="polite" aria-atomic="true">{focused ? `Focused player: ${focused.role} ${focused.name} number ${focused.slot}, ${focused.state}. ` : ''}{squareSummary}{selected ? ` Selected: ${selected.role} ${selected.name} number ${selected.slot}, ${selected.state}.` : ''}</p>
    <p>Home squares 0–12; away squares 13–25. The current server action menu names each available decision. A dashed outline marks a server-issued target; no success percentage is available yet.</p>
    <details><summary>Explore pitch squares with keyboard</summary>
      <p>Tab to the current square, use arrow keys to move, and press Enter or Space to select a player or square. Escape clears the current selection. Tab leaves the grid.</p>
      <div className="setup-grid" role="group" aria-label="Pitch grid">
        {Array.from({ length: 15 }, (_, row) => Array.from({ length: 26 }, (_, column) => {
          const player = view.players.find(item => item.x === column && item.y === row);
          const squareBall = view.ball?.x === column && view.ball.y === row;
          const target = view.actions.some(action => action.target && ('playerId' in action.target
            ? action.target.playerId === player?.id : action.target.x === column && action.target.y === row));
          const focusedSquare = column === x && row === y;
          return <button key={`${column},${row}`} type="button" tabIndex={focusedSquare ? 0 : -1}
            className={`${player?.role ?? ''}${target ? ' legal' : ''}`}
            aria-label={`Square ${column}, ${row}, ${column <= 12 ? 'home half' : 'away half'}${player ? `, ${player.role} ${player.name} number ${player.slot}, ${player.state}` : ', empty'}${squareBall ? ', ball here' : ''}${target ? ', server-issued target' : ''}`}
            onFocus={() => onFocusSquare(column, row)}
            onClick={() => onActivateSquare(column, row)}
            onKeyDown={event => {
              const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
              if (!direction) return;
              event.preventDefault();
              const nextX = Math.max(0, Math.min(25, column + direction[0]));
              const nextY = Math.max(0, Math.min(14, row + direction[1]));
              (event.currentTarget.parentElement?.children[nextY * 26 + nextX] as HTMLButtonElement)?.focus();
            }}>
            {player ? `${player.role === 'home' ? 'H' : 'A'}${player.slot}` : '·'}{squareBall ? ' ●' : ''}
          </button>;
        }))}
      </div>
    </details>
  </section>;
}
