import type { DiceEventPresentation, DiceMoment, PresentedRoll } from './dice-presentation.ts';
import { casualtyOutcome } from './dice-outcomes.ts';

// Presentation is separate from the original labels used by logs and replay summaries.
const events: Record<string, readonly [string, string]> = {
  dodgeRoll: ['Dodge', 'dodge'],
  goForItRoll: ['Rush', 'rush'],
  catchRoll: ['Catch', 'catch'],
  weather: ['Weather', 'weather'],
  pickUpRoll: ['Pick up', 'pick-up'],
  jumpUpRoll: ['Jump Up', 'jump-up'],
  rightStuffRoll: ['Landing', 'landing'],
  interceptionRoll: ['Interception', 'interception'],
  bloodLustRoll: ['Bloodlust', 'bloodlust'],
  hypnoticGazeRoll: ['Hypnotic Gaze', 'hypnotic-gaze'],
  throwTeamMateRoll: ['Throw Team-mate', 'throw-team-mate'],
  kickTeamMateRoll: ['Kick Team-mate', 'kick-team-mate'],
  standUpRoll: ['Stand up', 'stand-up'],
  alwaysHungryRoll: ['Always Hungry', 'always-hungry'],
  animosityRoll: ['Animosity', 'animosity'],
  dauntlessRoll: ['Dauntless', 'dauntless'],
  foulAppearanceRoll: ['Foul Appearance', 'foul-appearance'],
  regenerationRoll: ['Regeneration', 'regeneration'],
  bribesRoll: ['Bribe', 'bribe'],
  argueTheCall: ['Argue the Call', 'argue-the-call'],
  chainsawRoll: ['Chainsaw', 'chainsaw'],
  dodgySnackRoll: ['Dodgy Snack', 'dodgy-snack'],
  steadyFootingRoll: ['Steady Footing', 'steady-footing'],
  teamCaptainRoll: ['Team Captain', 'team-captain'],
  gettingEvenRoll: ['Getting Even', 'getting-even'],
  saboteurRoll: ['Saboteur', 'saboteur'],
  chompRoll: ['Chomp', 'chomp'],
  lookIntoMyEyesRoll: ['Look Into My Eyes', 'look-into-my-eyes'],
  dwarfenWisdomRoll: ['Dwarfen Wisdom', 'dwarfen-wisdom'],
  escapeRoll: ['Escape', 'escape'],
  allYouCanEat: ['All You Can Eat', 'all-you-can-eat'],
  balefulHex: ['Baleful Hex', 'baleful-hex'],
  breatheFire: ['Breathe Fire', 'breathe-fire'],
  catchOfTheDay: ['Catch of the Day', 'catch-of-the-day'],
  projectileVomit: ['Projectile Vomit', 'projectile-vomit'],
  mascotUsed: ['Mascot', 'mascot'],
  oldPro: ['Old Pro', 'old-pro'],
  pickMeUp: ['Pick-me-up', 'pick-me-up'],
  thenIStartedBlastin: ['Then I Started Blastin\'', 'then-i-started-blastin'],
  throwAtStallingPlayer: ['Stalling throw', 'stalling-throw'],
  thrownKeg: ['Thrown Keg', 'thrown-keg'],
  trapDoor: ['Trap Door', 'trap-door'],
  throwAtPlayer: ['Throw at player', 'throw-at-player'],
  biasedRef: ['Biased Referee', 'biased-referee'],
  throwIn: ['Throw-in distance', 'throw-in'],
  kickoffScatter: ['Kick direction', 'kick-direction'],
  fanFactor: ['Fan factor', 'fan-factor'],
};

const traits: Record<string, string> = { 'Bone Head': 'bone-head', 'Really Stupid': 'really-stupid',
  'Animal Savagery': 'animal-savagery', 'Take Root': 'take-root', 'Unchannelled Fury': 'unchannelled-fury' };
const flightResults: Record<string, string> = { ACCURATE: 'Accurate', INACCURATE: 'Inaccurate',
  FUMBLE: 'Fumble', SAVED_FUMBLE: 'Recovered Fumble', WILDLY_INACCURATE: 'Wildly Inaccurate' };
const weatherResults: Record<string, string> = { 'Sweltering Heat': 'Sweltering Heat', 'Very Sunny': 'Very Sunny',
  'Nice Weather': 'Nice', 'Pouring Rain': 'Pouring Rain', Blizzard: 'Blizzard', SWELTERING_HEAT: 'Sweltering Heat',
  VERY_SUNNY: 'Very Sunny', NICE: 'Nice', POURING_RAIN: 'Pouring Rain', BLIZZARD: 'Blizzard' };
const outcomeResults: Record<string, string> = { stun: 'Stunned', ko: 'Knocked out', casualty: 'Casualty',
  bh: 'Badly Hurt!', mng: 'Miss Next Game!', ni: 'Niggling Injury!', stat: 'Stat Reduction!', dead: 'Dead' };
const directions = new Set(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']);
function known(table: Record<string, string>, value: unknown): string | undefined {
  return typeof value === 'string' && Object.hasOwn(table, value) ? table[value] : undefined;
}

function event(report: Record<string, unknown>): DiceEventPresentation | undefined {
  const id = String(report.reportId);
  let pair = Object.hasOwn(events, id) ? events[id] : undefined;
  if (id === 'passRoll') pair = report.hailMaryPass === true
    ? report.bomb === true ? ['Hail Mary Bomb', 'hail-mary-bomb'] : ['Hail Mary Pass', 'hail-mary-pass']
    : report.bomb === true ? ['Throw Bomb', 'throw-bomb'] : ['Pass', 'pass'];
  if (id === 'throwTeamMateRoll' && report.kicked === true) pair = ['Kick Team-mate', 'kick-team-mate'];
  if (id === 'leapRoll') pair = report.skill === 'Leap' ? ['Leap', 'leap'] : ['Jump', 'jump'];
  if (id === 'confusionRoll') {
    const icon = known(traits, report.confusionSkill);
    if (icon) pair = [String(report.confusionSkill), icon];
  }
  if (id === 'spellEffectRoll') {
    const effect = typeof report.specialEffect === 'string' ? report.specialEffect.toLowerCase() : '';
    if (['lightning', 'fireball', 'zap', 'bomb'].includes(effect)) pair = [effect[0].toUpperCase() + effect.slice(1), effect];
  }
  if (id === 'tentaclesShadowingRoll' && ['Tentacles', 'Shadowing'].includes(String(report.skill)))
    pair = [String(report.skill), String(report.skill).toLowerCase()];
  if (id === 'reRoll') {
    const source = report.reRollSource;
    pair = typeof source === 'string' && /^Pro(?: |$)/.test(source) ? ['Pro', 'pro']
      : source === 'Loner' ? ['Loner', 'loner'] : ['Reroll test', 'reroll'];
  }
  if (id === 'scatterBall') pair = ['Ball scatter', 'scatter'];
  if (id === 'kickoffScatter' && (report.scatterDistanceSides === 3 || report.scatterDistanceSides === 6)) pair = ['Deviation', 'deviation'];
  if (id === 'scatterPlayer' && report.isScatter === true) pair = ['Player scatter', 'scatter'];
  if (!pair) return undefined;
  const logTest = report.logTest as { version?: unknown; rerolled?: unknown } | undefined;
  const rerolled = report.reRolled === true || logTest?.version === 1 && logTest.rerolled === true;
  let result = typeof report.successful === 'boolean' ? report.successful ? 'Success' : 'Failed' : undefined;
  if (['passRoll', 'throwTeamMateRoll', 'kickTeamMateRoll'].includes(id) && report.passResult !== undefined)
    result = known(flightResults, report.passResult);
  if (id === 'weather') result = known(weatherResults, report.weather);
  if (['scatterBall', 'scatterPlayer', 'kickoffScatter', 'throwIn', 'fanFactor', 'dwarfenWisdomRoll'].includes(id)) result = undefined;
  return { name: pair[0] + (rerolled ? ' (reroll)' : ''), icon: pair[1], ...(result ? { result } : {}) };
}

function injury(report: Record<string, unknown>, roll: PresentedRoll): DiceEventPresentation | undefined {
  const label = roll.label.toLowerCase(), apothecary = report.reportId === 'apothecaryRoll';
  let name: string, result: string | undefined;
  if (/^armou?r$/.test(label)) {
    name = 'Armor';
    result = typeof report.armorBroken === 'boolean' ? report.armorBroken ? 'Broken' : 'Held' : undefined;
  } else if (label === 'injury') {
    name = 'Injury'; result = known(outcomeResults, roll.outcome);
  } else if (/serious injury/.test(label)) {
    name = label.includes('decay') ? 'Decay stat reduced' : 'Stat Reduced';
    const serious = label.includes('decay') ? report.seriousInjuryDecay : report.seriousInjury;
    result = typeof serious === 'string' ? serious.replace(/\(-(?:1\s*)?(MA|ST|AG|AV|PA)\)/gi, '(-1 $1)') : undefined;
  } else if (/casualty/.test(label)) {
    name = label.includes('decay') ? 'Decay casualty' : 'Casualty';
    const decay = label.includes('decay');
    result = known(outcomeResults, casualtyOutcome(apothecary ? report.playerState : decay ? report.injuryDecay : report.injury,
      decay ? report.seriousInjuryDecay : report.seriousInjury, apothecary));
  } else return undefined;
  return { name: apothecary ? 'Apothecary Result' : name, ...(result ? { result } : {}) };
}

/** Add display-only facts without changing labels, values, or log/summary semantics. */
export function describeDiceEvent(report: Record<string, unknown>, moment: DiceMoment): DiceMoment {
  if (!moment.rolls) return moment; // Block dice retain their existing presentation.
  const presentation = event(report);
  const rolls = moment.rolls.map((roll, index) => {
    const description = ['injury', 'apothecaryRoll'].includes(String(report.reportId)) ? injury(report, roll) : presentation;
    const rawDirection = Array.isArray(report.directionArray) && report.directionArray.length === moment.rolls!.length
      ? report.directionArray[index] : report.reportId === 'kickoffScatter' ? report.scatterDirection : undefined;
    const direction = typeof rawDirection === 'string' ? rawDirection.toLowerCase() : '';
    return { ...roll, ...(description ? { presentation: description } : {}),
      ...(roll.kind === 'd8' && directions.has(direction) ? { direction } : {}) };
  });
  return { ...moment, rolls, ...(presentation ? { presentation } : {}) };
}
