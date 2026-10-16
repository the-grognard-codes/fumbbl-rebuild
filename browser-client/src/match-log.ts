import type { SetupPlayer, SetupState } from './setup-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import { matchTeamName } from './match-team-name.ts';
import { defaultMatchLogPreferences } from './match-log-preferences.ts';
import type { MatchLogPreferences } from './match-log-preferences.ts';
import type { LogActors, LogBlock, LogOutcome, LogPresentation, LogRoll } from './log-presentation.ts';
import { reportedDice } from './dice-presentation.ts';
import type { DieKind } from './die-geometry.ts';

export type MatchLogLine = { key: string; revision: number; at: number; text: string; debug?: string;
  dice?: { faces: string[]; kinds: DieKind[]; selected: number | null; uphill?: boolean; chooser?: 'home' | 'away'; inline?: boolean } };

const readable = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
const playerName = (id: unknown, players: SetupPlayer[]) =>
  typeof id === 'string' ? players.find(player => player.id === id)?.name ?? 'Player' : '';
const named = (value: unknown) => typeof value === 'string' ? readable(value) : valueText(value);
const sourceName = (value: unknown) => {
  const name = named(value);
  return /^pro(?: (?:mascot|trr))*$/.test(name) ? 'Pro' : name.replace(/^\w/, letter => letter.toUpperCase());
};
const twoDiceTotal = (value: unknown) => Array.isArray(value) && value.length === 2 && value.every(die => typeof die === 'number')
  ? `${value[0]} + ${value[1]} = ${value[0] + value[1]}` : valueText(value);
const casualtyDice = (value: unknown) => Array.isArray(value) ? `${valueText(value[0])}${value.length > 1 ? ` · serious injury die ${valueText(value[1])}` : ''}` : valueText(value);
const valueText = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(valueText).join(', ')}]`;
  if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => !/(?:id|ids)$/i.test(key))
    .map(([key, item]) => `${readable(key)} ${valueText(item)}`).join(', ');
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i.test(value) ? 'Match' : String(value);
};

function reportLine(report: Record<string, unknown>, state: SetupState, preferences: MatchLogPreferences, presentation?: LogPresentation): string {
  const players = state.players;
  const id = typeof report.reportId === 'string' ? report.reportId : 'native report';
  const actors = report.logActors as LogActors | undefined;
  const subject = playerName(actors?.actorId ?? report.playerId ?? report.defenderId, players);
  const defender = report.playerId && report.defenderId ? playerName(report.defenderId, players) : '';
  const teamId = report.teamId ?? report.choosingTeamId;
  // Native team IDs are the frozen team prefix of every projected player ID.
  const teamRole = teamId === 'home' || teamId === 'away' ? teamId : typeof teamId === 'string'
    ? players.find(player => player.id.startsWith(`${teamId}:`))?.role : undefined;
  const team = teamRole ? matchTeamName(state, teamRole) : '';
  if (id === 'fanFactor') {
    const fans = Number(report.dedicatedFans ?? 0), roll = Number(report.dedicatedFansRoll ?? 0);
    const total = Number(report.dedicatedFansResult ?? fans + roll);
    return `${team || 'Team'}${teamRole ? ` (${teamRole === 'home' ? 'Home' : 'Away'})` : ''}: Fan factor · dedicated fans ${fans} + roll ${roll} · Fan factor is ${total}.`;
  }
  if (id === 'weather') {
    const weatherCode = String(report.weather ?? report.weatherType ?? 'Weather');
    const weatherNames: Record<string, string> = { NICE: 'Nice Weather', NICE_WEATHER: 'Nice Weather', VERY_SUNNY: 'Very Sunny', SWELTERING_HEAT: 'Sweltering Heat',
      POURING_RAIN: 'Pouring Rain', BLIZZARD: 'Blizzard' };
    const weather = weatherNames[weatherCode] ?? named(weatherCode).replace(/^./, letter => letter.toUpperCase());
    const dice = Array.isArray(report.weatherRoll) ? report.weatherRoll : [];
    const total = dice.length && dice.every(value => typeof value === 'number') ? ` = ${dice.reduce((sum, value) => sum + Number(value), 0)}` : '';
    return `Weather: ${weather}${dice.length ? ` · [${dice.join(' + ')}${total}]` : ''}.`;
  }
  if (['pettyCash', 'freePettyCash'].includes(id)) return `Petty cash · ${team || 'Team'}: ${valueText(report.gold ?? report.amount ?? report.pettyCash)}gp.`;
  const title = `${readable(id)}${team ? ` · ${team}` : ''}${subject ? ` · ${subject}` : ''}${defender ? ` → ${defender}` : ''}`;
  const block = report.logBlock as LogBlock | undefined;
  const attacker = playerName(block?.attackerId ?? presentation?.action?.playerId ?? report.playerId, players) || 'Player';
  const target = playerName(block?.defenderId ?? report.defenderId, players) || 'opponent';
  if (id === 'block') return `${attacker} blocks ${target}.`;
  if (id === 'pushback') {
    const pushed = playerName(report.defenderId, players) || 'Player';
    if (report.pushbackMode === 'grab') return `${actors?.actorId ? playerName(actors.actorId, players) : attacker} uses Grab to push ${pushed}.`;
    if (report.pushbackMode === 'sideStep') return `${pushed} uses Side Step for the push.`;
    return `${pushed} is the push target.`;
  }
  if (id === 'skillUse') {
    const owner = subject || 'Player', skill = typeof report.skill === 'string' ? report.skill : 'skill';
    const opponent = actors?.targetId ? playerName(actors.targetId, players) : 'the opponent';
    const effects: Record<string, string> = { cancelDodge: `to cancel ${opponent}'s Dodge`, cancelTackle: `to cancel ${opponent}'s Tackle`,
      cancelWrestle: `to cancel ${opponent}'s Wrestle`, cancelFend: `to cancel ${opponent}'s Fend`, cancelStandFirm: `to cancel ${opponent}'s Stand Firm`,
      bringDownOppponent: `to bring ${opponent} down`, pushBackOpponent: `to push ${opponent}`, avoidFalling: 'to avoid falling',
      avoidPush: 'to avoid being pushed', stopOpponent: `to stop ${opponent}`, stayAwayFromOpponent: `to stay away from ${opponent}` };
    const reason = report.skillUse === 'noTackleZone' ? ' · no tackle zone' : report.skillUse === 'wouldNotHelp' ? ' · would not help' : '';
    if (report.used !== true) return `${report.playerId ? owner : 'Player'} does not use ${skill}${reason}.`;
    return `${owner} uses ${skill}${effects[String(report.skillUse)] ? ` ${effects[String(report.skillUse)]}` : report.skillUse ? ` · ${named(report.skillUse)}` : ''}.`;
  }
  if (id === 'playerAction') {
    const actions: Record<string, string> = { blitzMove: 'blitz', standUpBlitz: 'blitz', passMove: 'pass', handOverMove: 'hand-over',
      foulMove: 'foul action', throwTeamMateMove: 'throw team-mate', kickTeamMateMove: 'kick team-mate', gazeMove: 'hypnotic gaze', puntMove: 'punt',
      secureTheBall: 'Secure the Ball action' };
    const action = typeof report.playerAction === 'string' ? actions[report.playerAction] ?? readable(report.playerAction) : 'player action';
    return `${playerName(report.actingPlayerId, players) || 'Player'} declares a ${action}.`;
  }
  if (id === 'mascotUsed')
    return `${title}: conditional Mascot attempt ${report.roll} vs ${report.minimumRoll}+ · ${report.successful ? 'success' : 'failure'}${report.reRollUsed ? ' · continued with a guaranteed team source' : ''}`;
  if (id === 'bribesRoll' && typeof report.roll === 'number')
    return `${title}: ${report.roll} vs 2+ · ${report.successful ? 'success' : 'failure'}`;
  if (id === 'argueTheCall' && typeof report.roll === 'number') {
    const modifier = (typeof report.biasedRefs === 'number' ? report.biasedRefs : 0) + (report.friendsWithRef === true ? 1 : 0);
    return `${title}: ${report.roll} vs ${6 - modifier}+${preferences.rollModifiers && modifier ? ` (${modifier > 0 ? '+' : ''}${modifier} modifier)` : ''} · ${report.successful ? 'success' : 'failure'}${report.coachBanned ? ' · coach banned' : ''}${report.staysOnPitch ? ' · stays on pitch' : ''}`;
  }
  if (id === 'briberyAndCorruptionReRoll')
    return `${title}: ${named(report.briberyAncCorruptionAction)}`;
  if (id === 'referee') return `${report.foulingPlayerBanned === true ? 'Referee has spotted the foul!' : 'Referee did not spot the foul!'}${report.underScrutiny ? ' The referee was under scrutiny.' : ''}`;
  if (id === 'turnEnd') return report.playerIdTouchdown ? `${playerName(report.playerIdTouchdown, players)} scores a touchdown.` : 'Turn ends.';
  if (id === 'handOver') return `${presentation?.action?.playerId ? playerName(presentation.action.playerId, players) : 'Player'} hands the ball to ${playerName(report.catcherId, players)}.`;
  if (id === 'animalSavagery') return report.defenderId
    ? `${playerName(report.attackerId, players)} lashes out at ${playerName(report.defenderId, players)}.`
    : `${playerName(report.attackerId, players)} resolves Animal Savagery.`;
  if (id === 'secretWeaponBan' && Array.isArray(report.playerIds))
    return `${title}: ${report.playerIds.length} player${report.playerIds.length === 1 ? '' : 's'} checked`;
  if (id === 'apothecaryRoll' || id === 'apothecaryChoice') {
    const parts = [Array.isArray(report.casualtyRoll) ? `casualty ${casualtyDice(report.casualtyRoll)}` : null,
      report.seriousInjury ? `injury ${named(report.seriousInjury)}` : null,
      report.playerState ? `state ${named(report.playerState)}` : null,
      preferences.rollModifiers && Array.isArray(report.casualtyModifiers) && report.casualtyModifiers.length ? `modifiers ${valueText(report.casualtyModifiers)}` : null];
    return `${title}: ${parts.filter(Boolean).join(' · ')}`;
  }
  if (typeof report.roll === 'number' && (typeof report.minimumRoll === 'number' || report.logRoll)) {
    const player = players.find(candidate => candidate.id === report.playerId);
    const facts = report.logRoll as LogRoll | undefined;
    // Legacy reports use only their documented primary stat. Other families have no assumed AG base.
    const legacyBase = id === 'goForItRoll' || id === 'pickUpRoll' && report.secureTheBallUsed === true
      || id === 'passRoll' && report.hailMaryPass === true ? 2 : id === 'passRoll' ? player?.pa
      : ['dodgeRoll', 'pickUpRoll', 'pickupRoll', 'catchRoll', 'leapRoll'].includes(id) ? player?.ag : undefined;
    const base = facts?.base ?? legacyBase, target = facts?.target ?? Math.max(2, Math.min(6, Number(report.minimumRoll)));
    const net = facts?.modifier ?? (typeof base === 'number' ? base - Number(report.minimumRoll) : null);
    const modifier = !preferences.rollModifiers || net === null || net === 0 ? '' : ` · ${net > 0 ? '+' : ''}${net} net modifier`;
    const modifiers = preferences.rollModifiers && Array.isArray(report.rollModifiers) && report.rollModifiers.length
      ? ` · ${report.rollModifiers.map(value => named(value)).join(', ')}` : '';
    const result = ['passRoll', 'throwTeamMateRoll'].includes(id) && typeof report.passResult === 'string' ? ` · ${readable(report.passResult)}`
      : typeof report.successful === 'boolean' ? ` · ${report.successful ? 'success' : 'failure'}` : '';
    const verbs: Record<string, string> = { dodgeRoll: 'dodges', goForItRoll: 'rushes', pickUpRoll: report.secureTheBallUsed === true ? 'secures the ball' : 'picks up the ball',
      pickupRoll: 'picks up the ball', passRoll: 'passes', catchRoll: 'catches', leapRoll: 'jumps', standUpRoll: 'stands up',
      rightStuffRoll: 'lands', throwTeamMateRoll: `${report.kicked ? 'kicks' : 'throws'} ${playerName(report.thrownPlayerId, players)}` };
    const check = id === 'confusionRoll' ? sourceName(report.confusionSkill) : id === 'tentaclesShadowingRoll'
      ? sourceName(report.skill) : sourceName(id.replace(/Roll$/, ''));
    let where = facts?.square ? ` at (${facts.square.x}, ${facts.square.y})` : '';
    if (id === 'passRoll' && presentation?.action?.target) {
      const destination = presentation.action.target;
      where = 'playerId' in destination ? ` to ${playerName(destination.playerId, players)}` : ` to (${destination.x}, ${destination.y})`;
    }
    if (actors?.targetId) where += ` against ${playerName(actors.targetId, players)}`;
    const heading = verbs[id] ? `${subject || 'Player'} ${verbs[id]}${where}` : `${subject || 'Player'} tests ${check}${where}`;
    return `${heading}: ${report.roll} vs ${target}+${typeof base === 'number' ? ` (base ${base}+${modifier})` : ''}${modifiers}${report.reRolled === true ? ' · rerolled' : ''}${result}`;
  }
  const details = Object.entries(report).filter(([key]) => !['reportId', 'playerId', 'defenderId', 'logRoll', 'logActors', 'logTest', 'logBlock'].includes(key) && !/(?:id|ids)$/i.test(key) && (preferences.rollModifiers || !/modifier/i.test(key)))
    .map(([key, value]) => `${readable(key)} ${valueText(value)}`);
  return details.length ? `${title}: ${details.join(' · ')}` : title;
}

function reportLines(report: Record<string, unknown>, state: SetupState, preferences: MatchLogPreferences, presentation?: LogPresentation): string[] {
  if (report.reportId === 'receiveChoice' || report.reportId === 'startHalf') return [];
  if (report.reportId === 'skillUse' && report.playerId == null && report.used !== true) return [];
  const players = state.players;
  if (report.reportId === 'argueTheCall' && typeof report.roll === 'number') {
    const player = playerName(report.playerId, players) || 'Player';
    const playerRole = players.find(candidate => candidate.id === report.playerId)?.role;
    const coach = playerRole ? matchTeamName(state, playerRole) : 'Coach';
    const modifier = (typeof report.biasedRefs === 'number' ? report.biasedRefs : 0) + (report.friendsWithRef === true ? 1 : 0);
    const target = 6 - modifier;
    return [`${coach}: Argues the call for ${player}.`,
      `Argue the call ${report.roll} vs ${target}+ · ${report.successful ? 'success' : 'failure'} · ${player} ${report.staysOnPitch ? 'stays on pitch' : 'is sent off'}!`];
  }
  if (report.reportId === 'injury') {
    const target = players.find(player => player.id === report.defenderId)?.name ?? 'Player';
    const av = players.find(player => player.id === report.defenderId)?.av;
    const skippedParts = String(report.skipInjuryParts ?? 'NONE');
    const skipArmor = ['ARMOUR', 'ARMOUR_AND_CAS', 'ARMOUR_AND_INJURY', 'EVERYTHING_BUT_CAS'].includes(skippedParts);
    const skipInjury = ['ARMOUR_AND_INJURY', 'EVERYTHING_BUT_CAS', 'INJURY'].includes(skippedParts);
    const skipCasualty = ['ARMOUR_AND_CAS', 'ARMOUR_AND_INJURY', 'INJURY', 'CAS'].includes(skippedParts);
    const foul = /foul/i.test(`${presentation?.action?.kind ?? ''} ${presentation?.action?.label ?? ''} ${report.injuryType ?? ''}`);
    const lines: string[] = [];
    if (!skipArmor && Array.isArray(report.armorRoll)) {
      const modifier = preferences.rollModifiers && Array.isArray(report.armorModifiers) && report.armorModifiers.length
        ? ` · armor modifiers ${valueText(report.armorModifiers)}` : '';
      lines.push(`${foul ? 'Foul' : 'Armor'} · ${target} - armor roll ${twoDiceTotal(report.armorRoll)}${av ? ` vs base AV ${av}+` : ''} · armor ${report.armorBroken ? 'broken' : 'held'}!${modifier}`);
    }
    if (!skipInjury && Array.isArray(report.injuryRoll)) {
      const mods = preferences.rollModifiers && Array.isArray(report.injuryModifiers) && report.injuryModifiers.length
        ? ` · ${valueText(report.injuryModifiers)}` : '';
      const outcome = report.injury ? ` · ${named(report.injury)}` : '';
      lines.push(`Injury · ${target} - injury roll ${twoDiceTotal(report.injuryRoll)}${mods}${outcome}!`);
    }
    if (!skipCasualty && Array.isArray(report.casualtyRoll))
      lines.push(`Casualty · ${target} - casualty roll ${casualtyDice(report.casualtyRoll)}${report.seriousInjury ? ` = ${named(report.seriousInjury)}` : ''}!`);
    if (!skipCasualty && Array.isArray(report.casualtyRollDecay))
      lines.push(`Casualty · ${target} - decay casualty roll ${casualtyDice(report.casualtyRollDecay)}${report.seriousInjuryDecay ? ` = ${named(report.seriousInjuryDecay)}` : ''}!`);
    return lines;
  }
  if (report.reportId === 'reRoll') {
    const player = playerName(report.playerId, players) || 'Player';
    const source = sourceName(report.reRollSource).replace(/\s+re\s*roll$/i, '');
    if (['Pro', 'Loner'].includes(source) && typeof report.roll === 'number' && report.roll > 0) {
      const facts = report.logRoll as LogRoll | undefined;
      const retry = (report.logTest as { rerolled: boolean } | undefined)?.rerolled === true;
      const threshold = facts ? ` vs ${facts.target}+ (base ${facts.base}+)` : '';
      const outcome = report.successful ? source === 'Loner' ? 'reroll permitted' : 'reroll available'
        : source === 'Loner' ? 'reroll denied' : 'original roll unchanged';
      const check = `${player} ${retry ? 'rerolls' : 'tests'} ${source}: ${report.roll}${threshold} · ${report.successful ? 'success' : 'failure'} · ${outcome}.`;
      return source === 'Pro' && !retry ? [`${player} used Pro reroll.`, check] : [check];
    }
    return [`${player} ${report.successful === false ? 'attempted' : 'used'} ${source} reroll${report.successful === false ? ' · unavailable' : ''}.`];
  }
  const lines = [reportLine(report, state, preferences, presentation)];
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
      lines.push(`KO recovery · ${playerName(recovery.playerId, players)}: ${valueText(recovery.roll)}${preferences.rollModifiers && modifier ? ` · +${modifier} modifier` : ''} · ${recovery.recovering ? 'recovered' : 'remains KO'}${recovery.reason ? ` · ${named(recovery.reason)}` : ''}`);
    }
  }
  return lines;
}

function decisionLine(record: TranscriptRecord, presentation?: LogPresentation): string | null {
  if (record.index === 0) return 'Match started';
  const decision = record.decision ?? {};
  const operation = typeof decision.operation === 'string' ? decision.operation : record.kind;
  const team = record.actor === 'system' ? 'Match' : matchTeamName(record.state, record.actor);
  if (operation === 'action') {
    const action = presentation?.action;
    if (!action || ['move', 'jump', 'select', 'selectBlock', 'stand', 'blitz', 'forgo'].includes(action.kind) || action.kind.startsWith('declare')) return null;
    // Roll reports and declarations describe execution; accepted descriptions cover choices without those reports.
    const reports = record.native.flatMap(sync => (sync.reportList as { reports?: Record<string, unknown>[] } | undefined)?.reports ?? []);
    if (reports.some(report => report.reportId === 'playerAction') || action.kind === 'secureBall'
      || /reroll/i.test(action.kind) && reports.some(report => report.reportId === 'reRoll' || report.reportId === 'mascotUsed')
      || reports.some(report => report.reportId === 'argueTheCall')
      || reports.some(report => report.reportId === 'handOver') || action.kind === 'blockDie' && reports.some(report => report.reportId === 'blockChoice')
      || action.kind === 'block' && reports.some(report => report.reportId === 'block')) return null;
    if (action.kind === 'skill') return `${action.playerId ? playerName(action.playerId, record.state.players) : team} chooses to ${action.label.replace(/^./, letter => letter.toLowerCase())}.`;
    return `${action.playerId ? playerName(action.playerId, record.state.players) : team}: ${action.label}.`;
  }
  if (operation === 'choice') return ['kick', 'receive', 'heads', 'tails'].includes(String(decision.optionId))
    ? `${team} chooses to ${decision.optionId}.` : null;
  if (operation === 'place' || operation === 'route' || operation === 'movement') return null;
  if (operation === 'confirm') return `${team} confirms setup.`;
  if (operation === 'concede') return `${team} conceded! ${record.actor === 'home' ? matchTeamName(record.state, 'away') : matchTeamName(record.state, 'home')} wins ${record.state.homeScore}-${record.state.awayScore}.`;
  return null;
}

export function appendMatchLogLines(lines: MatchLogLine[], record: TranscriptRecord, preferences: MatchLogPreferences = defaultMatchLogPreferences): void {
  if (lines.length && lines[lines.length - 1].revision >= record.revision && lines.some(line => line.key === `${record.index}:0`)) return;
  let ordinal = 0;
  const presentation = record.decision?.logPresentation as LogPresentation | undefined;
  const metadata = (report?: Record<string, unknown>, command?: unknown) => {
    const parts = [`revision ${record.revision}`, `record ${record.index}`];
    for (const [label, value] of [['request', record.decision?.requestId], ['action', record.decision?.actionId], ['command', command],
      ['report', report?.reportId], ['player', report?.playerId ?? report?.actingPlayerId], ['defender', report?.defenderId]])
      if (typeof value === 'string' || typeof value === 'number') parts.push(`${label} ${value}`);
    return parts.join(' · ');
  };
  const add = (text: string, debug: string, dice?: MatchLogLine['dice']) => {
    const key = `${record.index}:${ordinal++}`;
    lines.push({ key, revision: record.revision, at: record.at, text,
      ...(preferences.debug ? { debug } : {}), ...(dice ? { dice } : {}) });
  };
  const decision = decisionLine(record, presentation);
  if (decision) add(decision, metadata());
  for (const sync of record.native) {
    const reports = (sync.reportList as { reports?: unknown[] } | undefined)?.reports;
    const seenReports = new Set<string>();
    if (Array.isArray(reports)) for (const value of reports) if (value && typeof value === 'object' && !Array.isArray(value)) {
      const report = value as Record<string, unknown>;
      const signature = JSON.stringify(report);
      if (seenReports.has(signature)) continue;
      seenReports.add(signature);
      if (report.reportId === 'block' && record.native.some(command => (command.reportList as { reports?: Record<string, unknown>[] } | undefined)?.reports?.some(item => item.reportId === 'blockReRoll'))) continue;
      const moment = reportedDice(report, record.state.players);
      if (report.reportId === 'blockRoll' && reports.some(item => item && typeof item === 'object'
        && (item as Record<string, unknown>).reportId === 'blockChoice')) continue;
      if (report.reportId === 'blockChoice') {
        const blockMoment = reportedDice(report, record.state.players);
        const chosen = blockMoment ? { faces: blockMoment.faces,
          kinds: blockMoment.rolls?.map(roll => roll.kind ?? 'block') ?? blockMoment.faces.map(() => 'block'),
          selected: blockMoment.selected, uphill: blockMoment.uphill, chooser: blockMoment.chooser } : undefined;
        const hasRollBesideChoice = reports.some(item => item && typeof item === 'object'
          && (item as Record<string, unknown>).reportId === 'blockRoll');
        const latestBlockRoll = [...lines].reverse().find(line => line.dice?.kinds.every(kind => kind === 'block'));
        const prior = !hasRollBesideChoice && chosen && latestBlockRoll?.dice?.selected === null
          && JSON.stringify(latestBlockRoll.dice.faces) === JSON.stringify(chosen.faces) ? latestBlockRoll : undefined;
        if (prior && chosen) prior.dice = chosen;
        else add('Block dice ·', metadata(report, sync.commandNr), chosen);
        continue;
      }
      if (report.reportId === 'blockRoll' || report.reportId === 'blockReRoll') {
        const blockMoment = moment;
        add(report.reportId === 'blockReRoll' ? `Block dice rerolled · source ${sourceName(report.reRollSource)}.` : 'Block dice ·', metadata(report, sync.commandNr), blockMoment ? {
          faces: blockMoment.faces, kinds: blockMoment.rolls?.map(roll => roll.kind ?? 'block') ?? blockMoment.faces.map(() => 'block'),
          selected: blockMoment.selected, uphill: blockMoment.uphill, chooser: blockMoment.chooser } : undefined);
        continue;
      }
      for (const text of reportLines(report, record.state, preferences, presentation)) {
        const lineRolls = moment?.rolls?.filter(roll => text.startsWith(`${roll.label} ·`)
          || roll.label.toLowerCase().startsWith('armor') && /^(Armor|Foul) ·/.test(text)
          || roll.label.toLowerCase().startsWith('injury') && text.startsWith('Injury ·')
          || roll.label.toLowerCase().startsWith('casualty') && text.startsWith('Casualty ·'));
        const lineMoment = moment && lineRolls?.length ? { ...moment, faces: lineRolls.map(roll => roll.face), rolls: lineRolls } : moment;
        add(text, metadata(report, sync.commandNr), lineMoment ? {
          faces: lineMoment.faces, kinds: lineMoment.rolls?.map(roll => roll.kind ?? 'd6') ?? lineMoment.faces.map(() => 'block'),
          selected: lineMoment.selected, uphill: lineMoment.uphill, chooser: lineMoment.chooser, inline: !!lineMoment.rolls?.length
        } : undefined);
      }
    }
    const outcomes = (sync.logOutcomes as { events: LogOutcome[] } | undefined)?.events ?? [];
    for (const outcome of outcomes) {
      const name = playerName(outcome.playerId, record.state.players) || 'Player';
      const destination = outcome.to ? `(${outcome.to.x}, ${outcome.to.y})` : 'off the pitch';
      const messages: Record<LogOutcome['kind'], string> = { push: `is pushed to ${destination}`, followUp: `follows up to ${destination}`,
        knockdown: 'is knocked down', prone: 'becomes prone', stunned: 'is stunned', knockedOut: 'is knocked out', removed: 'is removed from play',
        dead: 'dies', standing: `remains standing${outcome.skill ? ` with ${outcome.skill}` : ''}` };
      add(`${name} ${messages[outcome.kind]}.`, `${metadata(undefined, sync.commandNr)} · player ${outcome.playerId} · outcome ${outcome.kind}`);
    }
  }
  const movement = presentation?.movement;
  if (preferences.movement && movement) {
    const key = `movement:${movement.commitRevision}:${movement.playerId}`;
    const target = movement.to ? `(${movement.to.x}, ${movement.to.y})` : 'off pitch';
    const text = `${playerName(movement.playerId, record.state.players)} movement: (${movement.from.x}, ${movement.from.y}) → ${target}${movement.complete ? '.' : ' · in progress'}`;
    const old = lines.findIndex(line => line.key === key);
    const line = { key, revision: old >= 0 ? lines[old].revision : record.revision, at: old >= 0 ? lines[old].at : record.at, text,
      ...(preferences.debug ? { debug: `${metadata()} · committed at revision ${movement.commitRevision} · player ${movement.playerId}` } : {}) };
    if (old >= 0) lines[old] = line; else lines.push(line);
  }
}

export function matchLogLines(records: TranscriptRecord[], preferences: MatchLogPreferences = defaultMatchLogPreferences): MatchLogLine[] {
  const lines: MatchLogLine[] = [];
  records.forEach(record => appendMatchLogLines(lines, record, preferences));
  return lines;
}
