import type { SetupPlayer } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';

export type MatchLogLine = { key: string; revision: number; at: number; text: string };

const readable = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
const playerName = (id: unknown, players: SetupPlayer[]) =>
  typeof id === 'string' ? players.find(player => player.id === id)?.name ?? id : '';
const valueText = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(valueText).join(', ')}]`;
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${readable(key)} ${valueText(item)}`).join(', ');
  return String(value);
};

function reportLine(report: Record<string, unknown>, players: SetupPlayer[]): string {
  const id = typeof report.reportId === 'string' ? report.reportId : 'native report';
  const subject = playerName(report.playerId ?? report.defenderId, players);
  const defender = report.playerId && report.defenderId ? playerName(report.defenderId, players) : '';
  const title = `${readable(id)}${subject ? ` · ${subject}` : ''}${defender ? ` → ${defender}` : ''}`;
  if (id === 'blockRoll' && Array.isArray(report.blockRoll))
    return `${title}: dice ${valueText(report.blockRoll)}${report.choosingTeamId ? ` · choosing team ${valueText(report.choosingTeamId)}` : ''}`;
  if (id === 'blockChoice' && Array.isArray(report.blockRoll))
    return `${title}: rolled ${valueText(report.blockRoll)} · selected die ${Number(report.diceIndex) + 1}: ${valueText(report.blockResult)}`;
  if (typeof report.roll === 'number' && typeof report.minimumRoll === 'number') {
    const player = players.find(candidate => candidate.id === report.playerId);
    const base = id === 'goForItRoll' ? 2 : id === 'passRoll' ? player?.pa : player?.ag;
    const net = typeof base === 'number' ? base - report.minimumRoll : null;
    const modifier = net === null || net === 0 ? '' : ` · ${net > 0 ? '+' : ''}${net} net modifier`;
    const named = Array.isArray(report.rollModifiers) && report.rollModifiers.length
      ? ` · ${report.rollModifiers.map(valueText).join(', ')}` : '';
    const reroll = report.reRolled === true ? ' · rerolled' : '';
    const result = typeof report.successful === 'boolean' ? ` · ${report.successful ? 'success' : 'failure'}` : '';
    return `${title}: ${report.roll} vs ${report.minimumRoll}+${typeof base === 'number' ? ` (base ${base}+${modifier})` : ''}${named}${reroll}${result}`;
  }
  const details = Object.entries(report).filter(([key]) => !['reportId', 'playerId', 'defenderId'].includes(key))
    .map(([key, value]) => `${readable(key)} ${valueText(value)}`);
  return details.length ? `${title}: ${details.join(' · ')}` : title;
}

function decisionLine(record: TranscriptRecord): string {
  if (record.index === 0) return 'Match started';
  const decision = record.decision ?? {};
  const operation = typeof decision.operation === 'string' ? decision.operation : record.kind;
  if (operation === 'action') return `${record.actor} chose ${valueText(decision.actionId)}`;
  if (operation === 'choice') return `${record.actor} chose ${valueText(decision.optionId)}`;
  if (operation === 'place') return `${record.actor} placed ${playerName(decision.playerId, record.state.players)} at ${valueText(decision.to)}`;
  return `${record.actor} chose ${readable(operation)}`;
}

export function appendMatchLogLines(lines: MatchLogLine[], record: TranscriptRecord, prior?: TranscriptRecord): void {
    let ordinal = 0;
    const add = (text: string) => lines.push({ key: `${record.index}:${ordinal++}`, revision: record.revision, at: record.at, text });
    add(decisionLine(record));
    for (const sync of record.native) {
      const reports = (sync.reportList as { reports?: unknown[] } | undefined)?.reports;
      if (Array.isArray(reports)) for (const report of reports) if (report && typeof report === 'object' && !Array.isArray(report))
        add(reportLine(report as Record<string, unknown>, record.state.players));
    }
    if (prior) {
      const before = new Map(prior.state.players.map(player => [player.id, player]));
      for (const player of record.state.players) {
        const prior = before.get(player.id);
        if (!prior || prior.x === player.x && prior.y === player.y) continue;
        const square = (x: number | null, y: number | null) => x === null || y === null ? 'off pitch' : `(${x}, ${y})`;
        add(`${player.name}: ${square(prior.x, prior.y)} → ${square(player.x, player.y)}`);
      }
    }
}

export function matchLogLines(records: TranscriptRecord[]): MatchLogLine[] {
  const lines: MatchLogLine[] = [];
  records.forEach((record, index) => appendMatchLogLines(lines, record, records[index - 1]));
  return lines;
}
