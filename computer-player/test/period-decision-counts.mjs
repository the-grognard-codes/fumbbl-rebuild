// Acceptance-run accounting uses the pre-decision period, including its ending action.
export class PeriodDecisionCounts {
  turns = new Map();
  kickoffs = new Map();

  accept(state) {
    if (state.phase !== 'PLAY') return;
    const kickoff = state.kickoff;
    const periods = kickoff ? this.kickoffs : this.turns;
    const key = `${state.half}:${state.drive}:${kickoff ? kickoff.event : `${state.homeTurn}:${state.awayTurn}`}`;
    periods.set(key, (periods.get(key) ?? 0) + 1);
  }

  summary() {
    return { maximumTurn: Math.max(0, ...this.turns.values()), maximumKickoff: Math.max(0, ...this.kickoffs.values()),
      turns: Object.fromEntries(this.turns), kickoffs: Object.fromEntries(this.kickoffs) };
  }
}
