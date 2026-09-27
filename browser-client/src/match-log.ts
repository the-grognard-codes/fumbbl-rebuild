import type { SetupPlayer } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';

export type MatchLogLine = { key: string; revision: number; at: number; text: string };

const readable = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
const playerName = (id: unknown, players: SetupPlayer[]) =>
  typeof id === 'string' ? players.find(player => player.id === id)?.name ?? id : '';
const named = (value: unknown) => typeof value === 'string' ? readable(value) : valueText(value);
const sourceName = (value: unknown) => named(value).replace(/^\w/, letter => letter.toUpperCase());
const twoDiceTotal = (value: unknown) => Array.isArray(value) && value.length === 2 && value.every(die => typeof die === 'number')
  ? `${value[0]} + ${value[1]} = ${value[0] + value[1]}` : valueText(value);
const casualtyDice = (value: unknown) => Array.isArray(value) ? `${valueText(value[0])}${value.length > 1 ? ` · serious injury die ${valueText(value[1])}` : ''}` : valueText(value);
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
  if (id === 'blockReRoll' && Array.isArray(report.blockRoll))
    return `${title}: rerolled ${valueText(report.blockRoll)} · source ${sourceName(report.reRollSource)}`;
  if (id === 'reRoll')
    return `${title}: source ${sourceName(report.reRollSource)}${typeof report.roll === 'number' && report.roll > 0 ? ` · roll ${report.roll}` : ''}${typeof report.successful === 'boolean' ? ` · ${report.successful ? 'success' : 'failure'}` : ''}`;
  if (id === 'bribesRoll' && typeof report.roll === 'number')
    return `${title}: ${report.roll} vs 2+ · ${report.successful ? 'success' : 'failure'}`;
  if (id === 'argueTheCall' && typeof report.roll === 'number') {
    const modifier = (typeof report.biasedRefs === 'number' ? report.biasedRefs : 0) + (report.friendsWithRef === true ? 1 : 0);
    return `${title}: ${report.roll} vs ${6 - modifier}+${modifier ? ` (${modifier > 0 ? '+' : ''}${modifier} modifier)` : ''} · ${report.successful ? 'success' : 'failure'}${report.coachBanned ? ' · coach banned' : ''}${report.staysOnPitch ? ' · stays on pitch' : ''}`;
  }
  if (id === 'briberyAndCorruptionReRoll')
    return `${title}: ${named(report.briberyAncCorruptionAction)} · team ${valueText(report.teamId)}`;
  if (id === 'referee')
    return `${title}: ${report.foulingPlayerBanned ? 'fouling player sent off' : 'fouling player remains'}${report.underScrutiny ? ' · under scrutiny' : ''}`;
  if (id === 'turnEnd' && Array.isArray(report.knockoutRecoveryArray))
    return `${title}: ${report.knockoutRecoveryArray.length} KO recovery roll${report.knockoutRecoveryArray.length === 1 ? '' : 's'}`;
  if (id === 'secretWeaponBan' && Array.isArray(report.playerIds))
    return `${title}: ${report.playerIds.length} player${report.playerIds.length === 1 ? '' : 's'} checked`;
  if (id === 'apothecaryRoll' || id === 'apothecaryChoice') {
    const parts = [Array.isArray(report.casualtyRoll) ? `casualty ${casualtyDice(report.casualtyRoll)}` : null,
      report.seriousInjury ? `injury ${named(report.seriousInjury)}` : null,
      report.playerState ? `state ${named(report.playerState)}` : null,
      Array.isArray(report.casualtyModifiers) && report.casualtyModifiers.length ? `modifiers ${valueText(report.casualtyModifiers)}` : null];
    return `${title}: ${parts.filter(Boolean).join(' · ')}`;
  }
  if (id === 'injury') {
    const defenderPlayer = players.find(player => player.id === report.defenderId);
    const parts = [Array.isArray(report.armorRoll) ? `armor ${twoDiceTotal(report.armorRoll)}${defenderPlayer?.av ? ` vs base AV ${defenderPlayer.av}+` : ''} · ${report.armorBroken ? 'broken' : 'held'}` : null,
      Array.isArray(report.armorModifiers) && report.armorModifiers.length ? `armor modifiers ${valueText(report.armorModifiers)}` : null,
      Array.isArray(report.injuryRoll) ? `injury ${twoDiceTotal(report.injuryRoll)}${report.injury ? ` · ${named(report.injury)}` : ''}` : null,
      Array.isArray(report.injuryModifiers) && report.injuryModifiers.length ? `injury modifiers ${valueText(report.injuryModifiers)}` : null,
      Array.isArray(report.casualtyRoll) ? `casualty ${casualtyDice(report.casualtyRoll)}${report.seriousInjury ? ` · ${named(report.seriousInjury)}` : ''}` : null,
      Array.isArray(report.casualtyModifiers) && report.casualtyModifiers.length ? `casualty modifiers ${valueText(report.casualtyModifiers)}` : null,
      Array.isArray(report.casualtyRollDecay) ? `decay casualty ${casualtyDice(report.casualtyRollDecay)}${report.seriousInjuryDecay ? ` · ${named(report.seriousInjuryDecay)}` : ''}` : null];
    return `${title}: ${parts.filter(Boolean).join(' · ') || named(report.injuryType)}`;
  }
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

function reportLines(report: Record<string, unknown>, players: SetupPlayer[]): string[] {
  const lines = [reportLine(report, players)];
  if (report.reportId === 'secretWeaponBan' && Array.isArray(report.playerIds)
    && Array.isArray(report.rolls) && Array.isArray(report.banArray)) {
    for (let index = 0; index < report.playerIds.length; index++)
      lines.push(`Secret weapon · ${playerName(report.playerIds[index], players)}: roll ${valueText(report.rolls[index])} · ${report.banArray[index] ? 'sent off' : 'remains'}`);
  }
  if (report.reportId === 'turnEnd' && Array.isArray(report.knockoutRecoveryArray)) {
    for (const item of report.knockoutRecoveryArray) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const recovery = item as Record<string, unknown>;
      const modifier = (typeof recovery.bloodweiserBabes === 'number' ? recovery.bloodweiserBabes : 0)
        + (typeof recovery.bugmansXXXXXXModifier === 'number' ? recovery.bugmansXXXXXXModifier : 0);
      lines.push(`KO recovery · ${playerName(recovery.playerId, players)}: ${valueText(recovery.roll)}${modifier ? ` · +${modifier} modifier` : ''} · ${recovery.recovering ? 'recovered' : 'remains KO'}${recovery.reason ? ` · ${named(recovery.reason)}` : ''}`);
    }
  }
  return lines;
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
        for (const line of reportLines(report as Record<string, unknown>, record.state.players)) add(line);
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
