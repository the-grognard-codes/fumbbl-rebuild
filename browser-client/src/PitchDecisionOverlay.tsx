import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { DecisionOption, MatchDecision } from './match-decision.ts';
import { ReactionCountdown } from './ReactionCountdown.tsx';
import { PolygonDie } from './PolygonDie.tsx';
import { blockFaceLabel } from './dice-presentation.ts';
import type { DiceMoment } from './dice-presentation.ts';
import type { PotentialBlockDice } from './block-dice-presentation.ts';
import './pitch-decision-overlay.css';

const resourceIcon = `${import.meta.env.BASE_URL}assets/game/ui/reroll-v1.png`;
const skillIcons = `${import.meta.env.BASE_URL}assets/game/ui/skill-icons-v1.svg`;

/** Keep required pitch choices inside the visible viewport, including after pan/resize. */
export function PitchDecisionOverlay({ decision = null, diceMoment: currentMoment = null, potentialDice = null, awaiting = false,
  attackerRole, chooserRole, disabled, viewport, onAction, onInspectTarget, rollContext = null }: {
  decision?: MatchDecision | null; disabled: boolean; viewport: RefObject<HTMLDivElement | null>;
  rollContext?: MatchDecision | null;
  diceMoment?: DiceMoment | null;
  potentialDice?: PotentialBlockDice | null; awaiting?: boolean;
  attackerRole?: 'home' | 'away';
  chooserRole?: 'home' | 'away';
  onAction?: (id: string) => void;
  onInspectTarget?: (id: string | undefined) => void;
}) {
  const rollDecision = decision ?? rollContext;
  const diceMoment = potentialDice && !awaiting ? null : currentMoment;
  const panel = useRef<HTMLDivElement>(null);
  const [skillChoices, setSkillChoices] = useState<DecisionOption | null>(null);
  const [scrollable, setScrollable] = useState(false);
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const active = !!(decision || diceMoment || potentialDice || rollContext?.proTest || rollContext?.originalFaces?.length);
  const blockOptions = decision?.options.filter(option => option.face) ?? [];
  const momentIsBlock = (!potentialDice || awaiting) && (!diceMoment?.groups || !!potentialDice)
    && !!diceMoment?.faces.length && diceMoment.faces.every(face => blockFaceLabel(face));
  const resultFaces = blockOptions.length ? blockOptions.map(option => option.face!)
    : momentIsBlock && !rollDecision?.proTest ? diceMoment!.faces : [];
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
  const optionRollKey = decision?.kind === 'blockDie' && !decision.proTest
    && (!diceMoment || diceMoment.selected === null && diceMoment.faces.some(face => blockFaceLabel(face)))
    ? decision.key : undefined;
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
    {rollDecision?.originalFaces && <div className="pitch-decision-roll" role="status" aria-label={rollDecision.originalLabel ?? 'Original block dice'}>
      {rollDecision.originalFaces.map((face, index) => <PolygonDie key={index} face={face} index={index}
        kind={rollDecision.originalRolls?.[index]?.kind ?? (blockFaceLabel(face) ? 'block' : 'd6')}/>)}</div>}
    {rollDecision?.proTest && <div className="pitch-pro-test" role="status" aria-label={`Pro test: ${rollDecision.proTest.face}, ${rollDecision.proTest.successful ? 'success' : 'failure'}`}>
      <span>Pro</span><PolygonDie kind="d6" face={rollDecision.proTest.face} rollKey={diceMoment?.rollKey ? rollDecision.proTest.rollKey : undefined}/></div>}
    {primaryFaces.length > 0 && <div className="live-dice-choices pitch-block-dice">{primaryFaces.map((face, index) => {
      const option = blockOptions[index];
      return <button key={`die:${index}`} type="button" className="live-die-choice" data-passive={!option}
        disabled={!option || disabled} tabIndex={option ? undefined : -1} role={option ? undefined : 'presentation'}
        aria-label={option?.label} title={option?.label} onClick={() => option && onAction?.(option.id)}
        onFocus={() => onInspectTarget?.(option?.targetPlayerId)} onPointerEnter={() => onInspectTarget?.(option?.targetPlayerId)}>
        <PolygonDie kind={option?.dieKind ?? 'block'} face={face} potential={!!preview && !awaiting} awaiting={!!preview && awaiting} index={index}
          selected={!option && diceMoment?.selected === index} rollKey={option ? optionRollKey : diceMoment?.rollKey}/>
        <span className="sr-only">{option?.label}</span>
      </button>;
    })}</div>}
    {diceMoment && !rollDecision?.proTest && !primaryFaces.length && (diceMoment.groups ?? [{ ...diceMoment, key: 'result' }]).map(group =>
      <div className="pitch-roll-group" key={group.key}>
        {diceMoment.groups && <span className="pitch-roll-caption">{group.label}</span>}
        <div className="pitch-decision-roll" role={decision || (diceMoment.groups?.length ?? 0) > 1 ? 'status' : undefined}
          aria-label={`${group.label}: ${group.faces.join(', ')}`}>
          {group.faces.map((face, index) => <span key={index} title={group.rolls?.[index]?.label ?? group.label}>
            <PolygonDie kind={group.rolls?.[index]?.kind ?? (blockFaceLabel(face) ? 'block' : 'd6')} face={face}
              selected={group.selected === index} index={index}
              rollKey={group.rolls?.[index]?.rollKey ?? group.rollKey}/></span>)}
        </div>
      </div>)}
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
