import type { TranscriptRecord } from './transcript-protocol.ts';
import type { SetupPlayer } from './setup-protocol.ts';
import type { DieKind } from './die-geometry.ts';

export type PresentedRoll = { label: string; face: string; kind?: DieKind; rollKey?: string };

export type DiceMoment = { label: string; faces: string[]; subjectId: string | null; selected: number | null;
  rollKey?: string; revision?: number; uphill?: boolean; rolls?: PresentedRoll[]; groups?: DiceRollGroup[] };

export type DiceRollGroup = DiceMoment & { key: string };

/** Native labels identify simultaneous rolls, including the two dice of armour/injury. */
export function diceRollGroups(moment: DiceMoment): DiceMoment[] {
  if (!moment.rolls || moment.rolls.length !== moment.faces.length) return [moment];
  const groups: DiceMoment[] = [];
  for (const roll of moment.rolls) {
    const previous = groups.at(-1);
    if (previous?.label === roll.label) {
      previous.faces.push(roll.face); previous.rolls!.push(roll);
    } else groups.push({ ...moment, label: roll.label, faces: [roll.face], rolls: [roll] });
  }
  return groups;
}

const blockFaces = ['SKULL', 'BOTH DOWN', 'PUSHBACK', 'PUSHBACK', 'POW/PUSH', 'POW'];
// Explicit report semantics, never a guess based on the observed value.
const scalarD6 = new Set(['goForItRoll', 'dodgeRoll', 'pickUpRoll', 'catchRoll', 'passRoll', 'leapRoll',
  'jumpUpRoll', 'rightStuffRoll', 'interceptionRoll', 'safeThrowRoll', 'bloodLustRoll', 'confusionRoll',
  'hypnoticGazeRoll', 'throwTeamMateRoll', 'kickTeamMateRoll', 'standUpRoll', 'reRoll', 'alwaysHungryRoll',
  'animosityRoll', 'dauntlessRoll', 'foulAppearanceRoll', 'regenerationRoll', 'bribesRoll', 'argueTheCall',
  'chainsawRoll', 'weepingDaggerRoll', 'cardEffectRoll', 'spellEffectRoll', 'officiousRefRoll',
  'dodgySnackRoll', 'steadyFootingRoll', 'teamCaptainRoll', 'gettingEvenRoll', 'saboteurRoll', 'chompRoll',
  'lookIntoMyEyesRoll', 'dwarfenWisdomRoll', 'escapeRoll', 'allYouCanEat', 'balefulHex', 'breatheFire',
  'catchOfTheDay', 'projectileVomit', 'bombExplodesAfterCatch', 'mascotUsed', 'kickoffRiot', 'oldPro',
  'pickMeUp', 'thenIStartedBlastin', 'throwAtStallingPlayer', 'thrownKeg', 'trapDoor', 'throwAtPlayer', 'biasedRef', 'tentaclesShadowingRoll']);

export function numericRolls(value: unknown): PresentedRoll[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as { version?: unknown; dice?: unknown };
  if (source.version !== 1 || !Array.isArray(source.dice) || !source.dice.length || source.dice.length > 32) return null;
  const rolls: PresentedRoll[] = [];
  for (const item of source.dice) {
    if (!item || typeof item !== 'object' || ![6, 8, 16].includes(item.sides) || !Number.isInteger(item.value)
      || item.value < 1 || item.value > item.sides || typeof item.label !== 'string' || !item.label || item.label.length > 100) return null;
    rolls.push({ kind: `d${item.sides}` as DieKind, face: String(item.value), label: item.label });
  }
  return rolls;
}
export function blockFace(roll: number): string | null { return Number.isInteger(roll) && roll >= 1 && roll <= 6 ? blockFaces[roll - 1] : null; }
export function blockFaceLabel(face: string): string | undefined {
  const labels: Record<string, string> = { SKULL: 'Skull', 'BOTH DOWN': 'Both down', PUSHBACK: 'Push', 'POW/PUSH': 'Stumble', POW: 'Pow' };
  return Object.hasOwn(labels, face) ? labels[face] : undefined;
}

/** Only values written by native reports become visible dice; no roll is generated in the browser. */
export function reportedDice(report: Record<string, unknown>, players: SetupPlayer[] = []): DiceMoment | null {
  const id = report.reportId;
  if (typeof id !== 'string') return null;
  const subjectId = typeof report.playerId === 'string' ? report.playerId
    : typeof report.defenderId === 'string' ? report.defenderId : null;
  if ((id === 'blockRoll' || id === 'blockChoice' || id === 'blockReRoll') && Array.isArray(report.blockRoll)) {
    const faces = report.blockRoll.map(value => blockFace(value as number));
    if (!faces.length || faces.some(face => face === null)) return null;
    const selected = id === 'blockChoice' && Number.isInteger(report.diceIndex)
      && (report.diceIndex as number) >= 0 && (report.diceIndex as number) < faces.length ? report.diceIndex as number : null;
    const block = report.logBlock as { attackerId?: string; chooser?: string } | undefined;
    const attacker = players.find(player => player.id === block?.attackerId);
    const uphill = attacker && ['home', 'away'].includes(block?.chooser ?? '')
      ? faces.length > 1 && attacker.role !== block?.chooser : undefined;
    return { label: id === 'blockChoice' ? 'Block die selected' : id === 'blockReRoll' ? 'Block dice rerolled' : 'Block dice rolled', faces: faces as string[], subjectId, selected,
      ...(uphill !== undefined ? { uphill } : {}) };
  }
  if (Object.hasOwn(report, 'numericDice')) {
    const rolls = numericRolls(report.numericDice);
    return rolls ? { label: [...new Set(rolls.map(roll => roll.label))].join('; '), faces: rolls.map(roll => roll.face), rolls, subjectId, selected: null } : null;
  }
  if (id === 'scatterBall' && Array.isArray(report.rolls) && report.rolls.length > 0
    && report.rolls.every(value => Number.isInteger(value) && value >= 1 && value <= 8)) {
    const rolls: PresentedRoll[] = report.rolls.map(value => ({ kind: 'd8', face: String(value), label: 'Ball scatter' }));
    return { label: 'Ball scatter', faces: rolls.map(roll => roll.face), rolls, subjectId, selected: null };
  }
  const groupField = id === 'weather' ? 'weatherRoll' : id === 'throwIn' ? 'distanceRoll'
    : id === 'tentaclesShadowingRoll' && Array.isArray(report.tentacleRoll) ? 'tentacleRoll' : null;
  if (groupField && Array.isArray(report[groupField])) {
    const label = id === 'weather' ? 'Weather' : id === 'throwIn' ? 'Throw-in distance' : 'Reaction test';
    const rolls = numericRolls({ version: 1, dice: (report[groupField] as unknown[]).map(value => ({ sides: 6, value, label })) });
    return rolls ? { label, faces: rolls.map(roll => roll.face), rolls, subjectId, selected: null } : null;
  }
  if (scalarD6.has(id) && typeof report.roll === 'number' && Number.isInteger(report.roll) && report.roll >= 1 && report.roll <= 6) {
    const name = id === 'goForItRoll' ? 'Rush' : id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ Roll$/, '').replace(/^./, letter => letter.toUpperCase());
    const target = typeof report.minimumRoll === 'number' ? ` · ${report.minimumRoll}+ needed` : '';
    const result = typeof report.successful === 'boolean' ? ` · ${report.successful ? 'success' : 'failure'}` : '';
    const label = `${name}${target}${result}`;
    return { label, faces: [String(report.roll)], rolls: [{ kind: 'd6', face: String(report.roll), label }], subjectId, selected: null };
  }
  return null;
}

export function recordDice(record: TranscriptRecord): DiceMoment[] {
  const moments: DiceMoment[] = [];
  for (const sync of record.native) {
    const reports = (sync.reportList as { reports?: unknown[] } | undefined)?.reports;
    if (!Array.isArray(reports)) continue;
    for (const value of reports) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const moment = reportedDice(value as Record<string, unknown>, record.state.players);
      if (moment) moments.push(moment);
    }
  }
  return moments;
}
