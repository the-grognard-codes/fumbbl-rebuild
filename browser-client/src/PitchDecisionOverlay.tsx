import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { DecisionOption, MatchDecision } from './match-decision.ts';
import { ReactionCountdown } from './ReactionCountdown.tsx';
import { PolygonDie } from './PolygonDie.tsx';
import { blockFaceLabel, diceRollGroups } from './dice-presentation.ts';
import { PitchDiceEffects, PitchDiceGroup } from './PitchDiceGroup.tsx';
import { useDicePresence } from './use-dice-presence.ts';
import { PITCH_DICE_ROLL_MS } from './presentation-timing.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { PotentialBlockDice } from './block-dice-presentation.ts';
import './pitch-decision-overlay.css';

const resourceIcon = `${import.meta.env.BASE_URL}assets/game/ui/reroll-v1.png`;
const skillIcons = `${import.meta.env.BASE_URL}assets/game/ui/skill-icons-v1.svg`;

/** Keep required pitch choices inside the visible viewport, including after pan/resize. */
export function PitchDecisionOverlay({ decision = null, diceMoment: currentMoment = null, potentialDice = null, awaiting = false,
  attackerRole, chooserRole, disabled, viewport, onAction, onInspectTarget, rollContext = null,
  diceSnapshot = false, presentationKey = '' }: {
  decision?: MatchDecision | null; disabled: boolean; viewport: RefObject<HTMLDivElement | null>;
  rollContext?: MatchDecision | null;
  diceMoment?: DiceMoment | null;
  potentialDice?: PotentialBlockDice | null; awaiting?: boolean;
  attackerRole?: 'home' | 'away';
  chooserRole?: 'home' | 'away';
  onAction?: (id: string) => void;
  onInspectTarget?: (id: string | undefined) => void;
  diceSnapshot?: boolean; presentationKey?: string;
}) {
  const rollDecision = decision ?? rollContext;
  const diceMoment = potentialDice && !awaiting ? null : currentMoment;
  const panel = useRef<HTMLDivElement>(null);
  const [skillChoices, setSkillChoices] = useState<DecisionOption | null>(null);
  const [scrollable, setScrollable] = useState(false);
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const blockOptions = decision?.options.filter(option => option.face) ?? [];
  const activeGroups = diceMoment?.groups?.filter(group => !group.exiting);
  const blockGroups = activeGroups?.filter(group => group.faces.length && group.faces.every(face => blockFaceLabel(face)));
  const blockMoment = blockGroups ? blockGroups.length === 1 ? blockGroups[0] : null : diceMoment;
  const momentIsBlock = (!potentialDice || awaiting)
    && !!blockMoment?.faces.length && blockMoment.faces.every(face => blockFaceLabel(face));
  const resultFaces = blockOptions.length ? blockOptions.map(option => option.face!)
    : momentIsBlock && !rollDecision?.proTest ? blockMoment!.faces : [];
  const preview = resultFaces.length ? null : potentialDice;
  const primaryFaces: (string | undefined)[] = resultFaces.length ? resultFaces
    : preview ? Array.from({ length: Math.abs(preview.dice) }, () => undefined) : [];
  const otherOptions = decision?.options.filter(option => !option.face) ?? [];
  const uphill = decision?.uphill ?? diceMoment?.uphill ?? (preview ? preview.dice < 0
    : blockOptions.length > 1 && attackerRole !== undefined && chooserRole !== undefined && chooserRole !== attackerRole
      || !!diceMoment && diceMoment.faces.length > 1 && !!decision?.options.some(option => /opponent chooses/i.test(option.label)));
  const label = decision?.title ?? rollContext?.title ?? (preview
    ? `${awaiting ? 'Pending' : 'Potential'} block: ${Math.abs(preview.dice)} ${preview.dice === 1 ? 'die' : 'dice'}${preview.dice < 0 ? ', opponent chooses (uphill)' : ', attacker chooses'}${awaiting ? '; awaiting native result' : '; confirm to roll'}`
    : `${diceMoment?.label}: ${diceMoment?.faces.join(', ')}`);
  const isStatic = !!diceMoment?.static || diceSnapshot && !potentialDice && !awaiting;
  const rate = diceMoment?.rate ?? 1;
  const optionRollKey = !isStatic && decision?.kind === 'blockDie' && !decision.proTest
    && !diceMoment?.groups && (!diceMoment || diceMoment.selected === null && diceMoment.faces.some(face => blockFaceLabel(face)))
    ? decision.key : undefined;
  const primary = useDicePresence(primaryFaces.length ? { faces: primaryFaces, preview, awaiting,
    moment: momentIsBlock ? blockMoment : diceMoment, options: blockOptions, optionRollKey } : null, presentationKey, isStatic, rate);
  const original = useDicePresence(rollDecision?.originalFaces ? { faces: rollDecision.originalFaces,
    rolls: rollDecision.originalRolls, label: rollDecision.originalLabel } : null, presentationKey, isStatic, rate);
  const pro = useDicePresence(rollDecision?.proTest ? { test: rollDecision.proTest,
    rollKey: !isStatic && !diceMoment?.groups && diceMoment?.rollKey ? rollDecision.proTest.rollKey : undefined,
    duration: diceMoment?.rollDuration } : null, presentationKey, isStatic, rate);
  const active = !!(decision || diceMoment || potentialDice || original.value || pro.value || primary.value);
  // Ancestor pitch refs are attached after child layout effects on first mount.
  // Bind after the whole tree commits; retain the bounds across phase changes.
  useEffect(() => {
    const element = panel.current, frame = viewport.current;
    if (!active || !element || !frame) { setBounds(null); return; }
    const update = () => {
      const rect = frame.getBoundingClientRect();
      let left = Math.max(8, rect.left + 8), top = Math.max(8, rect.top + 8);
      let right = Math.min(window.innerWidth - 8, rect.right - 8);
      let bottom = Math.min(window.innerHeight - 8, rect.bottom - 8);
      // A scrolled-off or very small pitch must still expose the required response.
      if (right - left < 120 || bottom - top < 120) {
        left = 8; top = 8; right = window.innerWidth - 8; bottom = window.innerHeight - 8;
      }
      const priorWidth = element.style.width;
      const content = element.querySelector<HTMLElement>('.pitch-dice-content');
      const scrollTop = content?.scrollTop ?? 0, scrollLeft = content?.scrollLeft ?? 0;
      element.style.width = 'max-content';
      const naturalWidth = Math.max(element.getBoundingClientRect().width, element.scrollWidth + 2);
      element.style.width = priorWidth;
      // Measuring the unwrapped width must not reset a coach's choice scroll.
      if (content) { content.scrollTop = scrollTop; content.scrollLeft = scrollLeft; }
      const width = Math.max(1, Math.min(naturalWidth, 245, right - left));
      const maxHeight = Math.max(1, bottom - top);
      const height = Math.min(element.getBoundingClientRect().height, maxHeight);
      setScrollable(!!content && content.scrollHeight > content.clientHeight);
      const diceRow = element.querySelector<HTMLElement>('.pitch-block-dice, .pitch-decision-roll');
      const centerOffset = diceRow ? diceRow.getBoundingClientRect().top - element.getBoundingClientRect().top
        + diceRow.getBoundingClientRect().height / 2 : height / 2;
      const next = { left: Math.max(left, Math.min(window.innerWidth * .65 - width / 2, right - width)),
        top: Math.max(top, Math.min(window.innerHeight * .5 - centerOffset, bottom - height)), width, maxHeight };
      setBounds(prior => prior && Object.keys(next).every(key => prior[key as keyof typeof next] === next[key as keyof typeof next]) ? prior : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame); observer.observe(element);
    const choicesChanged = new MutationObserver(update);
    choicesChanged.observe(element, { childList: true, subtree: true });
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !element.contains(event.target)) update(); };
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); choicesChanged.disconnect(); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', update); };
  }, [active, decision?.key, viewport]);
  const ready = bounds !== null;
  // Offered block faces are also native outcomes. Start once per decision even
  // if its transcript is late, and do not restart when that transcript arrives.
  useEffect(() => {
    setSkillChoices(null);
    const content = panel.current?.querySelector<HTMLElement>('.pitch-dice-content');
    if (content) { content.scrollTop = 0; content.scrollLeft = 0; }
  }, [decision?.key]);
  useEffect(() => {
    if (!ready || !decision) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    return () => { if (prior?.isConnected) prior.focus({ preventScroll: true }); };
  }, [decision?.key, ready]);
  if (!active) return null;
  return createPortal(<div ref={panel} className={`live-dice-overlay interactive pitch-decision-overlay block-dice-surface${uphill ? ' uphill' : ''}`} role={decision ? 'dialog' : 'status'} aria-label={label} aria-busy={!!decision && disabled || awaiting}
    style={{ position: 'fixed', ...bounds, visibility: ready ? 'visible' : 'hidden' }}
    onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    <div className="pitch-dice-content" style={{ maxHeight: bounds ? Math.max(1, bounds.maxHeight - 24) : undefined,
      pointerEvents: scrollable ? 'auto' : undefined }}>
    <strong className={diceMoment || primaryFaces.length || decision?.reaction || rollContext ? 'sr-only' : undefined}>{label}</strong>
    {decision?.reaction && <><strong>{decision.title}</strong>
      {decision.detail && <p>{decision.detail}</p>}
      <ReactionCountdown reaction={decision.reaction} matchId={decision.reaction.matchId}/></>}
    {original.value && <PitchDiceEffects exiting={original.exiting} isStatic={isStatic} rate={rate}>
      <div className="pitch-decision-roll" role="status" aria-label={original.value.label ?? 'Original block dice'}>
      {original.value.faces.map((face, index) => <PolygonDie key={index} face={face} index={index}
        kind={original.value!.rolls?.[index]?.kind ?? (blockFaceLabel(face) ? 'block' : 'd6')}/>)}</div></PitchDiceEffects>}
    {pro.value && <PitchDiceEffects exiting={pro.exiting} isStatic={isStatic} rate={rate}>
      <div className="pitch-pro-test" role="status" aria-label={`Pro test: ${pro.value.test.face}, ${pro.value.test.successful ? 'success' : 'failure'}`}>
      <span>Pro</span><PolygonDie kind="d6" face={pro.value.test.face} rollKey={pro.value.rollKey}
        rollDuration={pro.value.duration ?? PITCH_DICE_ROLL_MS}/></div></PitchDiceEffects>}
    {primary.value && <PitchDiceEffects exiting={primary.exiting} isStatic={isStatic} rate={rate}>
      <div className="live-dice-choices pitch-block-dice">{primary.value.faces.map((face, index) => {
      const shown = primary.value!;
      const option = primary.exiting ? undefined : shown.options[index];
      return <button key={`die:${index}`} type="button" className="live-die-choice" data-passive={!option}
        disabled={!option || disabled} tabIndex={option ? undefined : -1} role={option ? undefined : 'presentation'}
        aria-label={option?.label} title={option?.label} onClick={() => option && onAction?.(option.id)}
        onFocus={() => onInspectTarget?.(option?.targetPlayerId)} onPointerEnter={() => onInspectTarget?.(option?.targetPlayerId)}>
        <PolygonDie kind={option?.dieKind ?? 'block'} face={face} potential={!!shown.preview && !shown.awaiting} awaiting={!!shown.preview && shown.awaiting} index={index}
          selected={!option && shown.moment?.selected === index} rollKey={isStatic ? undefined : shown.options[index] ? shown.optionRollKey : shown.moment?.rollKey}
          rollDuration={shown.moment?.rollDuration ?? PITCH_DICE_ROLL_MS}/>
        <span className="sr-only">{option?.label}</span>
      </button>;
    })}</div></PitchDiceEffects>}
    {diceMoment && (diceMoment.groups ?? diceRollGroups(diceMoment).map((group, index) => ({ ...group, key: `result:${index}` })))
      .filter(group => !(primary.value && group.faces.every(face => blockFaceLabel(face)))
        && (group.exiting || !rollDecision?.proTest && (!primaryFaces.length || !!activeGroups))).map(group =>
        <PitchDiceGroup key={group.key} group={group} caption={!!diceMoment.groups} forceStatic={isStatic}
          role={decision || (diceMoment.groups?.length ?? 0) > 1 ? 'status' : undefined}/>)}
    {otherOptions.length > 0 && <div className="live-dice-choices">{otherOptions.map(option => <button key={option.id} type="button"
      className={option.face ? 'live-die-choice' : option.icon ? 'pitch-dice-icon-choice' : undefined}
      disabled={disabled} aria-label={option.label} title={option.choices ? option.choices.map(choice => choice.label).join('\n') : disabled ? `${option.label} (pending)` : option.label}
      aria-expanded={option.choices ? skillChoices?.id === option.id : undefined}
      onFocus={() => onInspectTarget?.(option.targetPlayerId)} onPointerEnter={() => onInspectTarget?.(option.targetPlayerId)}
      onClick={() => option.choices ? setSkillChoices(skillChoices?.id === option.id ? null : option) : onAction?.(option.id)}>
      {option.icon === 'resource' && <img src={resourceIcon} alt="" aria-hidden="true"/>}
      {option.icon?.startsWith('custom:') && <svg aria-hidden="true" viewBox="0 0 48 48" className="pitch-dice-custom-icon">
        <use href={`${skillIcons}#badge`}/><text x="24" y="31">{option.icon.slice(7).split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase()}</text>
      </svg>}
      {option.icon && option.icon !== 'resource' && !option.icon.startsWith('custom:') && <svg aria-hidden="true" viewBox="0 0 48 48"><use href={`${skillIcons}#${option.icon}`}/></svg>}
      <span className={option.face || option.icon ? 'sr-only' : undefined}>{option.label}</span>
    </button>)}</div>}
    {skillChoices && <div className="pitch-skill-choices" aria-label={`${skillChoices.label} choices`}>
      {skillChoices.choices?.map(option => <button key={option.id} type="button" disabled={disabled}
        onFocus={() => onInspectTarget?.(option.targetPlayerId)} onPointerEnter={() => onInspectTarget?.(option.targetPlayerId)}
        onClick={() => onAction?.(option.id)}>{option.label}</button>)}
      <button type="button" disabled={disabled} onClick={() => setSkillChoices(null)}>Cancel skill choice</button>
    </div>}
    </div>
  </div>, document.body);
}
