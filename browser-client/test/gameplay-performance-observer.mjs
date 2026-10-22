// Test-only instrumentation. A requestAnimationFrame callback is a paint
// opportunity, never proof that a GPU frame reached the physical display.
import { cpus, platform, release, totalmem } from 'node:os';

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, mean: null, p50: null, p95: null, max: null };
  const round = value => Math.round(value * 100) / 100;
  return { count: sorted.length, mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: round(sorted[Math.ceil(sorted.length * .5) - 1]), p95: round(sorted[Math.ceil(sorted.length * .95) - 1]), max: round(sorted.at(-1)) };
}

export function summarizeGameplayPerformance(events, metadata = {}) {
  const traces = new Map(), frames = [], documents = [], routeMotion = new Map();
  for (const event of events) {
    if (event.kind === 'document') { documents.push(event); continue; }
    if (event.kind === 'frame') { frames.push(event); continue; }
    if (event.kind === 'motion') {
      const key = `${event.documentId}:${event.requestId}`;
      const motion = routeMotion.get(key) ?? { documentId: event.documentId, requestId: event.requestId, role: event.role, samples: [] };
      const sample = [event.at, event.x, event.y];
      if (Number.isFinite(event.targetLeft)) sample.push(event.targetLeft, event.targetTop,
        event.computedLeft, event.computedTop, event.sceneLeft, event.sceneTop);
      motion.samples.push(sample); routeMotion.set(key, motion); continue;
    }
    if (!event.requestId) continue;
    const key = `${event.documentId}:${event.requestId}`;
    const trace = traces.get(key) ?? { documentId: event.documentId, role: event.role, requestId: event.requestId };
    Object.assign(trace, event); delete trace.kind;
    traces.set(key, trace);
  }
  const metrics = {};
  const sample = (trace, name, from, to) => {
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    const category = `${trace.phase ?? 'unknown'}/${trace.operation ?? 'unknown'}/${trace.actionKind ?? 'other'}`;
    ((metrics[category] ??= {})[name] ??= []).push(to - from);
  };
  const raw = [...traces.values()];
  for (const trace of raw) {
    sample(trace, 'inputToPendingDomMs', trace.inputAt, trace.pendingDomAt);
    sample(trace, 'inputToPendingPaintOpportunityMs', trace.inputAt, trace.pendingPaintAt);
    sample(trace, 'inputToFeedbackDomMs', trace.inputAt, trace.feedbackDomAt);
    sample(trace, 'inputToFeedbackPaintOpportunityMs', trace.inputAt, trace.feedbackPaintAt);
    sample(trace, 'requestToResponseMs', trace.sentAt, trace.responseAt);
    sample(trace, 'responseToTranscriptMs', trace.responseAt, trace.transcriptAt);
    sample(trace, 'requestToDiceDataMs', trace.sentAt, trace.diceDataAt);
    sample(trace, 'diceDataToDomMs', trace.diceDataAt, trace.diceDomAt);
    sample(trace, 'diceDataToPaintOpportunityMs', trace.diceDataAt, trace.dicePaintAt);
    if (trace.geometryCorrelated === true) {
      sample(trace, 'inputToFirstScreenMovementPaintOpportunityMs', trace.inputAt, trace.firstScreenMovementAt);
      sample(trace, 'requestToFirstScreenMovementPaintOpportunityMs', trace.sentAt, trace.firstScreenMovementAt);
      sample(trace, 'responseToFirstScreenMovementPaintOpportunityMs', trace.responseAt, trace.firstScreenMovementAt);
    }
    for (const output of ['state', 'movement', 'dice', 'decision']) {
      const title = output[0].toUpperCase() + output.slice(1);
      const dom = trace[`${output}DomAt`], paint = trace[`${output}PaintAt`];
      sample(trace, `requestTo${title}DomMs`, trace.sentAt, dom);
      sample(trace, `requestTo${title}PaintOpportunityMs`, trace.sentAt, paint);
      sample(trace, `responseTo${title}DomMs`, trace.responseAt, dom);
      const requiredAt = output === 'dice' ? trace.diceDataAt : output === 'state' || output === 'decision' ? trace.responseAt
        : Number.isFinite(trace.responseAt) && Number.isFinite(trace.transcriptAt) ? Math.max(trace.responseAt, trace.transcriptAt) : undefined;
      sample(trace, `requiredDataTo${title}PaintOpportunityMs`, requiredAt, paint);
    }
  }
  const play = raw.filter(trace => trace.phase === 'PLAY');
  const cohort = predicate => {
    const matches = play.filter(predicate);
    return { requested: matches.length, accepted: matches.filter(trace => trace.code === 'ACCEPTED').length,
      movementObserved: matches.filter(trace => Number.isFinite(trace.movementDomAt)).length,
      screenMovementObserved: matches.filter(trace => trace.geometryCorrelated === true && Number.isFinite(trace.firstScreenMovementAt)).length,
      uncorrelatedSourceGeometryObserved: matches.filter(trace => trace.geometryCorrelated !== true && Number.isFinite(trace.firstScreenMovementAt)).length,
      diceObserved: matches.filter(trace => Number.isFinite(trace.diceDomAt)).length,
      decisionObserved: matches.filter(trace => Number.isFinite(trace.decisionDomAt)).length,
      pendingDomObserved: matches.filter(trace => Number.isFinite(trace.pendingDomAt)).length,
      feedbackDomObserved: matches.filter(trace => Number.isFinite(trace.feedbackDomAt)).length,
      pendingRemovedBeforePaint: matches.filter(trace => trace.pendingRemovedBeforePaint === true).length,
      missingTranscript: matches.filter(trace => trace.code === 'ACCEPTED' && !Number.isFinite(trace.transcriptAt)).length };
  };
  return { formatVersion: 1, metadata: { platform: platform(), osRelease: release(), cpu: cpus()[0]?.model,
    logicalProcessors: cpus().length, memoryBytes: totalmem(), ...metadata },
    semantics: { clock: 'performance.timeOrigin + performance.now(), milliseconds',
      paint: 'requestAnimationFrame paint opportunity; not actual GPU presentation or physical display latency',
      movement: 'first DOM coordinate change for an authoritatively moved player, including provisional movement before response; CSS transition completion is separate',
      transcript: 'first wire receipt containing the matching revision; no additional fetch is introduced',
      diceData: 'earliest matching state action with a block/reroll face or transcript native dice values; transcript arrival remains separate',
      frames: 'rAF intervals during PLAY while pending, playback active, or within 3 seconds of a local mutation',
      screenMovement: 'first rAF observing movement source getBoundingClientRect change >=0.5px after coordinate mutation; metrics require matching authoritative source movement; geometry at a paint opportunity, not actual displayed pixels; includes camera transforms',
      routeMotion: 'up to 1500ms after first coordinate change for each movement; samples are [epochMilliseconds,screenLeft,screenTop,targetLeft,targetTop,computedLeft,computedTop,sceneLeft,sceneTop]; baseline captured before this instrumentation has no geometry cohort',
      observationWindowMs: 10000,
      input: 'last click or Enter/Space keydown within 2 seconds before request; pending is a matching machine-state marker; feedback separately requires a disabled/removed input control or visible busy overlay',
      privacy: 'allowlisted timing/category/revision fields only; no credentials, player IDs, names, chat or native state',
      incomplete: 'Absent metrics stay absent; coverage counts describe unobserved or unavailable cohorts' },
    coverage: { play: cohort(() => true), ordinaryMovement: cohort(trace => trace.actionKind === 'move' && (trace.routeSteps ?? 1) <= 1),
      queuedRoute: cohort(trace => ['movement', 'route'].includes(trace.operation) && trace.routeSteps > 1),
      rollBoundary: cohort(trace => trace.routeChecks > 0),
      blocks: cohort(trace => /block/i.test(trace.actionKind ?? '')), rolls: cohort(trace => trace.hasRoll === true) },
    distributionsMs: Object.fromEntries(Object.entries(metrics).map(([category, values]) => [category,
      Object.fromEntries(Object.entries(values).map(([name, samples]) => [name, distribution(samples)]))])),
    frameIntervalsMs: { ...distribution(frames.map(frame => frame.intervalMs)),
      over50Ms: frames.filter(frame => frame.intervalMs > 50).length, over100Ms: frames.filter(frame => frame.intervalMs > 100).length },
    documents, traces: raw, routeMotion: [...routeMotion.entries()].map(([key, motion]) => ({ ...motion,
      correlated: traces.get(key)?.geometryCorrelated === true })), frameStalls: frames.filter(frame => frame.intervalMs > 50) };
}

export async function observeGameplayPerformance(context, role, events) {
  await context.exposeBinding('__emitGameplayPerformance', (_source, event) => { events.push({ ...event, role }); });
  await context.addInitScript(installGameplayPerformanceObserver);
}

// Self-contained because Playwright serializes this function into each document.
export function installGameplayPerformanceObserver() {
  if (window.top !== window) return;
  // Initial about:blank and third-party auth frames may lack secure-context UUID.
  // This identifier only separates test documents; it is never an auth/request ID.
  const documentId = globalThis.crypto?.randomUUID?.() ?? `document-${Date.now()}-${Math.random()}`;
  const now = () => performance.timeOrigin + performance.now();
  const pendingEmits = new Set();
  let recording = true;
  const emit = event => {
    if (!recording) return;
    const pending = window.__emitGameplayPerformance({ documentId, ...event }).catch(() => {});
    pendingEmits.add(pending); pending.then(() => pendingEmits.delete(pending));
  };
  const traces = new Map(), transcripts = new Map(), stateDice = new Map();
  let latest = null, latestRoute = null, inputAt, inputElement, previousFrame, activeUntil = 0, dirty = true;
  const root = () => document.querySelector('.hosted-match');
  const visible = node => !!node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const markers = () => new Map([...document.querySelectorAll('.live-marker[data-player-id]')]
    .map(node => [node.dataset.playerId, `${node.dataset.x},${node.dataset.y}`]));
  const decisionSignature = () => [...document.querySelectorAll('[aria-label="Match decision"], .pitch-decision-overlay[role="dialog"]')]
    .filter(visible).map(node => node.textContent).join('|');
  const send = trace => {
    // Internal correlation data stays in this page; exported fields are explicit.
    const { initialMarkers, expectedMoves, movementChanges, initialDecision, inputElement, geometryPlayerId, initialRect, ...safe } = trace;
    emit({ kind: 'trace', ...safe });
  };
  emit({ kind: 'document', at: now(), userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight],
    devicePixelRatio, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    visibility: document.visibilityState, hardwareConcurrency: navigator.hardwareConcurrency });
  for (const type of ['click', 'keydown']) document.addEventListener(type, event => {
    if (type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    inputAt = now(); inputElement = event.target instanceof Element ? event.target.closest('button, input, select, textarea') : null;
    dirty = true;
  }, true);
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', event => {
        let message; try { message = JSON.parse(event.data); } catch { return; }
        const at = now();
        if (message.type === 'movementPreview' && message.plan?.route) latestRoute = message.plan.route;
        if (message.type === 'routePreview' && message.route) latestRoute = message.route;
        if (message.type === 'matchTranscript') {
          for (const record of message.page?.records ?? []) {
            if (!transcripts.has(record.revision)) transcripts.set(record.revision, { at,
              hasRoll: (record.native ?? []).some(command => (command.reportList?.reports ?? []).some(report =>
                report.numericDice?.dice?.length || Number.isFinite(report.roll) || Number.isFinite(report.dedicatedFansRoll)
                || ['blockRoll', 'armorRoll', 'injuryRoll', 'casualtyRoll', 'casualtyRollDecay', 'rolls', 'weatherRoll', 'distanceRoll', 'tentacleRoll']
                  .some(field => Array.isArray(report[field]) && report[field].length))) });
          }
        }
        if (message.type === 'setupState' && message.state) {
          latest = message.state;
          if (latest.actions?.some(action => ['blockDie', 'rerollDie'].includes(action.kind)
            && /^(?:Choose|Reroll) (SKULL|BOTH DOWN|PUSHBACK|POW\/PUSH|POW) \(die \d+\)$/.test(action.label))
            && !stateDice.has(latest.revision)) stateDice.set(latest.revision, at);
        }
        const trace = traces.get(message.requestId);
        if (trace && !Number.isFinite(trace.responseAt) && ['setupState', 'error'].includes(message.type)) {
          trace.responseAt = at; trace.code = message.code; trace.revision = message.state?.revision;
          trace.expectedMoves = (message.state?.players ?? []).filter(player => player.x !== null
            && trace.initialMarkers.has(player.id) && trace.initialMarkers.get(player.id) !== `${player.x},${player.y}`)
            .map(player => [player.id, `${player.x},${player.y}`]);
          trace.geometryCorrelated = message.code === 'ACCEPTED' && trace.expectedMoves.some(([id]) => id === trace.geometryPlayerId);
          send(trace);
        }
        for (const item of traces.values()) if (Number.isFinite(item.revision)) {
          const transcript = transcripts.get(item.revision), stateAt = stateDice.get(item.revision);
          let changed = false;
          if (transcript && !Number.isFinite(item.transcriptAt)) {
            item.transcriptAt = transcript.at; item.hasRoll = transcript.hasRoll || Number.isFinite(stateAt) || item.hasRoll === true; changed = true;
          }
          const source = Number.isFinite(stateAt) && (!transcript?.hasRoll || stateAt <= transcript.at) ? 'stateAction'
            : transcript?.hasRoll ? 'nativeTranscript' : undefined;
          const dataAt = source === 'stateAction' ? stateAt : source === 'nativeTranscript' ? transcript.at : undefined;
          if (Number.isFinite(dataAt) && (!Number.isFinite(item.diceDataAt) || dataAt < item.diceDataAt)) {
            item.diceDataAt = dataAt; item.diceDataSource = source; item.hasRoll = true; changed = true;
          }
          if (changed) send(item);
        }
        dirty = true;
      });
    }
    send(raw) {
      let message; try { message = JSON.parse(raw); } catch { super.send(raw); return; }
      if (message.type === 'setup' && !['load', 'concessionStatus'].includes(message.operation)) {
        const at = now(), action = latest?.actions?.find(item => item.id === message.actionId);
        const route = ['movement', 'route'].includes(message.operation) && latestRoute?.revision === message.expectedRevision
          && latestRoute.playerId === message.playerId ? latestRoute : null;
        const geometryPlayerId = ['movement', 'route'].includes(message.operation) || action?.kind === 'move'
          ? message.playerId ?? action?.sourcePlayerId : undefined;
        const marker = [...document.querySelectorAll('.live-marker')].find(node => node.dataset.playerId === geometryPlayerId);
        const rect = marker?.getBoundingClientRect();
        const trace = { requestId: message.requestId, operation: message.operation, actionKind: action?.kind ??
          (message.operation === 'movement' ? message.kind ?? 'move' : message.operation === 'route' ? 'move' : 'other'), phase: latest?.phase,
          ...(route ? { routeSteps: route.steps?.length ?? 0,
            eligiblePrefixSteps: (() => {
              const unsafe = (route.steps ?? []).findIndex(step => step.jump || step.dodge > 0 || step.rush > 0
                || step.checks?.length || step.reactions?.length);
              return unsafe < 0 ? route.steps.length : unsafe;
            })(),
            routeChecks: (route.steps ?? []).reduce((sum, step) => sum + (step.checks?.length ?? 0)
              + (step.dodge > 0 ? 1 : 0) + (step.rush > 0 ? 1 : 0) + (step.reactions?.length ?? 0), 0) } : {}),
          expectedRevision: message.expectedRevision, sentAt: at, initialMarkers: markers(), expectedMoves: [], movementChanges: new Map(),
          initialDiceRevision: root()?.dataset.diceRevision ?? '',
          geometryPlayerId, initialRect: rect ? [rect.left, rect.top] : null,
          initialDecision: decisionSignature(), ...(at - inputAt < 2000 ? { inputAt, inputElement } : {}) };
        traces.set(message.requestId, trace); activeUntil = at + 3000; send(trace); dirty = true;
      }
      super.send(raw);
    }
  };
  function inspect() {
    if (!recording) return;
    const at = now(), host = root();
    if (host) {
      dirty = false;
      const current = markers(), signature = decisionSignature();
      for (const trace of traces.values()) {
        if (at - trace.sentAt > 10000) {
          if (!trace.observationExpiredAt) { trace.observationExpiredAt = at; send(trace); }
          continue;
        }
        for (const [id, square] of current) if (trace.initialMarkers.has(id) && trace.initialMarkers.get(id) !== square
          && !trace.movementChanges.has(id)) {
          const change = { domAt: at };
          trace.movementChanges.set(id, change);
          requestAnimationFrame(() => {
            change.paintAt = now();
            if (trace.movementDomAt === change.domAt) { trace.movementPaintAt = change.paintAt; send(trace); }
          });
        }
        const stamp = output => {
          if (Number.isFinite(trace[`${output}DomAt`])) return;
          // MutationObserver supplies DOM ordering; rAF is the next paint opportunity.
          trace[`${output}DomAt`] = at;
          requestAnimationFrame(() => {
            if (['pending', 'feedback'].includes(output) && root()?.dataset.requestPending !== trace.requestId)
              trace[`${output}RemovedBeforePaint`] = true;
            else trace[`${output}PaintAt`] = now();
            send(trace);
          });
          send(trace);
        };
        if (host.dataset.requestPending === trace.requestId) {
          stamp('pending');
          const control = trace.inputElement;
          const busy = [...document.querySelectorAll('.live-dice-overlay[aria-busy="true"]')].some(visible);
          const feedback = control && !control.isConnected ? 'controlRemoved'
            : control?.disabled && visible(control) ? 'controlDisabled' : busy ? 'busyOverlay' : null;
          if (feedback) { trace.feedbackKind = feedback; stamp('feedback'); }
        }
        if (trace.code !== 'ACCEPTED' || !Number.isFinite(trace.revision) || !(trace.revision > trace.expectedRevision)) continue;
        if (trace.revision > trace.expectedRevision && Number(host.dataset.revision) === trace.revision) stamp('state');
        const firstMove = trace.expectedMoves.map(([id]) => trace.movementChanges.get(id)).filter(Boolean)
          .sort((a, b) => a.domAt - b.domAt)[0];
        if (firstMove && !Number.isFinite(trace.movementDomAt)) {
          trace.movementDomAt = firstMove.domAt;
          trace.provisionalMovementObserved = firstMove.domAt < trace.responseAt;
          if (Number.isFinite(firstMove.paintAt)) trace.movementPaintAt = firstMove.paintAt;
          send(trace);
        }
        if (host.dataset.diceRevision !== '' && host.dataset.diceRevision !== trace.initialDiceRevision && Number(host.dataset.diceRevision) === trace.revision
          && visible(document.querySelector('.live-dice-overlay'))) stamp('dice');
        if (Number(host.dataset.revision) === trace.revision && signature && signature !== trace.initialDecision) stamp('decision');
      }
    }
  }
  new MutationObserver(inspect).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  function frame() {
    if (!recording) return;
    const at = now(), host = root();
    const active = at < activeUntil || host?.dataset.playbackActive === 'true' || !!host?.dataset.requestPending;
    if (previousFrame && active && latest?.phase === 'PLAY') emit({ kind: 'frame', at, intervalMs: at - previousFrame });
    previousFrame = at;
    if (dirty) inspect();
    for (const trace of traces.values()) {
      if (!trace.initialRect || !trace.geometryPlayerId || !trace.movementChanges.has(trace.geometryPlayerId)
        || Number.isFinite(trace.responseAt) && trace.geometryCorrelated !== true
        || at - trace.sentAt > 10000) continue;
      const change = trace.movementChanges.get(trace.geometryPlayerId);
      if (at - change.domAt > 1500) continue;
      const marker = [...document.querySelectorAll('.live-marker')].find(node => node.dataset.playerId === trace.geometryPlayerId);
      if (!visible(marker)) continue;
      const rect = marker.getBoundingClientRect();
      const style = getComputedStyle(marker);
      if (!trace.motionTransition) {
        trace.motionTransition = { property: style.transitionProperty, duration: style.transitionDuration, easing: style.transitionTimingFunction };
        send(trace);
      }
      if (!trace.firstScreenMovementAt && Math.hypot(rect.left - trace.initialRect[0], rect.top - trace.initialRect[1]) >= .5) {
        trace.firstScreenMovementAt = at; send(trace);
      }
      const scene = marker.closest('.live-pitch-scene')?.getBoundingClientRect();
      emit({ kind: 'motion', requestId: trace.requestId, at,
        x: Math.round(rect.left * 100) / 100, y: Math.round(rect.top * 100) / 100,
        targetLeft: parseFloat(marker.style.left), targetTop: parseFloat(marker.style.top),
        computedLeft: parseFloat(style.left), computedTop: parseFloat(style.top), sceneLeft: scene?.left, sceneTop: scene?.top });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__gameplayPerformanceFlush = () => {
    for (const trace of traces.values()) send(trace);
    return Promise.all([...pendingEmits]);
  };
  window.__gameplayPerformanceStop = () => {
    for (const trace of traces.values()) send(trace);
    recording = false;
    return Promise.all([...pendingEmits]);
  };
}
