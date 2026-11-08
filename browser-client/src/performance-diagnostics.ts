/** Numeric-only, opt-in diagnostics. Never retains a wire payload or a game document. */
import { decodeDiagnosticDetails, decodeServerTrace } from './diagnostic-trace.ts';
import type { ClientPhase, ClientSpan, DiagnosticDetails, ServerObservation } from './diagnostic-trace.ts';
export type DiagnosticMode = 'off' | 'counters' | 'graph';
export type Metric = 'frame' | 'rtt' | 'probe' | 'feedback' | 'provisional' | 'transcript' | 'presentation' | 'inputPresentation'
  | 'queue' | 'handling' | 'authorization' | 'sessionApply' | 'checkpoint' | 'serialization' | 'sql'
  | 'longtask' | 'long-animation-frame';
export type Sample = { at: number; value: number; kind: Metric; category?: string; trace?: number; requestType?: string };
export type Marker = { at: number; kind: 'enabled' | 'hidden' | 'visible' | 'connected' | 'disconnected' | 'incident' | 'reset' | 'probe-timeout' | 'context' };
export type Traffic = { at: number; incoming: number; outgoing: number; received: number; sent: number };
export type DiagnosticPreferences = {
  window: 10 | 30 | 60; tracks: { frame: boolean; network: boolean; latency: boolean; presentation: boolean };
  frameBudget: number; latencyBudget: number; scale: 'auto' | 'fixed'; corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size: 'compact' | 'expanded'; textScale: number; opacity: number; warningsOnly: boolean; freezeOnThreshold: boolean; probes: boolean; manual: boolean; details: boolean;
};
export const defaultDiagnosticPreferences: DiagnosticPreferences = {
  window: 30, tracks: { frame: true, network: true, latency: true, presentation: true }, frameBudget: 1000 / 60,
  latencyBudget: 250, scale: 'auto', corner: 'bottom-right', size: 'compact', textScale: 1, opacity: .94,
  warningsOnly: false, freezeOnThreshold: false, probes: false, manual: false, details: false,
};
const categories = new Set(['mutation', 'advisory', 'read', 'authentication', 'probe', 'error']);
const requestTypes = new Set(['authenticate', 'setup', 'watch', 'browse', 'catalog', 'savedTeam', 'preparedMatch', 'matchTranscript', 'matchResult', 'movementRange', 'movementPreview', 'routePreview', 'matchChat', 'currentMatches', 'skillUsePreferences', 'computer', 'diagnostics']);
export const timingKeys = ['queueWaitMs', 'handlingMs', 'authorizationMs', 'sessionApplyMs', 'checkpointMs', 'recoverySerializeMs', 'checkpointSqlMs'] as const;
export type ServerTiming = Record<typeof timingKeys[number], number>;
export function decodeServerTiming(value: unknown): ServerTiming | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  return Object.keys(fields).length === timingKeys.length && timingKeys.every(key => typeof fields[key] === 'number'
    && Number.isFinite(fields[key]) && fields[key] >= 0 && fields[key] <= 3_600_000) ? fields as ServerTiming : null;
}
export function diagnosticsAvailable(environment: unknown) { return ['dev', 'local-dev', 'local'].includes(String(environment)); }
export function loadDiagnosticPreferences(storage?: Pick<Storage, 'getItem'>): DiagnosticPreferences {
  const defaults = { ...defaultDiagnosticPreferences, tracks: { ...defaultDiagnosticPreferences.tracks } };
  try {
    const value = JSON.parse(storage?.getItem('moles.diagnostics.preferences') ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    for (const key of ['warningsOnly', 'freezeOnThreshold', 'probes', 'manual', 'details'] as const) if (typeof value[key] === 'boolean') defaults[key] = value[key];
    for (const key of ['frame', 'network', 'latency', 'presentation'] as const) if (typeof value.tracks?.[key] === 'boolean') defaults.tracks[key] = value.tracks[key];
    if ([10, 30, 60].includes(value.window)) defaults.window = value.window;
    if (['auto', 'fixed'].includes(value.scale)) defaults.scale = value.scale;
    if (['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(value.corner)) defaults.corner = value.corner;
    if (['compact', 'expanded'].includes(value.size)) defaults.size = value.size;
    for (const [key, min, max] of [['frameBudget', 1, 1000], ['latencyBudget', 1, 60_000], ['textScale', .8, 1.5], ['opacity', .3, 1]] as const) {
      if (Number.isFinite(value[key])) defaults[key] = Math.max(min, Math.min(max, value[key]));
    }
  } catch { /* Storage is optional. */ }
  return defaults;
}
class Ring<T> {
  private data: (T | undefined)[];
  private next = 0;
  size = 0;
  dropped = 0;
  readonly capacity: number;
  constructor(capacity: number) { this.capacity = capacity; this.data = new Array(capacity); }
  push(value: T) { if (this.size === this.capacity) this.dropped++; else this.size++; this.data[this.next] = value; this.next = (this.next + 1) % this.capacity; }
  values(): T[] { return Array.from({ length: this.size }, (_, index) => this.data[(this.next - this.size + index + this.capacity) % this.capacity]!); }
  clear() { this.data.fill(undefined); this.next = this.size = this.dropped = 0; }
}
export function distribution(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return { count: sorted.length, latest: values.at(-1) ?? null, p50: sorted.length ? sorted[Math.ceil(sorted.length * .5) - 1] : null,
    p95: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null, max: sorted.at(-1) ?? null };
}
export function histogram(values: number[], limits = [8.34, 16.67, 33.34, 50, 100, 250, 1000]) {
  const counts = new Array(limits.length + 1).fill(0) as number[];
  for (const value of values) if (Number.isFinite(value) && value >= 0) { const index = limits.findIndex(limit => value <= limit); counts[index < 0 ? limits.length : index]++; }
  return counts.map((count, index) => ({ count, from: index ? limits[index - 1] : 0, to: limits[index] ?? null }));
}
type Trace = { at: number; category: string; serial: number; requestType: string; input?: number; response?: number; revision?: number; presented?: boolean; feedback?: boolean; provisional?: boolean; transcript?: boolean; committed?: boolean };
export type DiagnosticSnapshot = {
  details?: DiagnosticDetails;
  at: number; samples: Sample[]; traffic: Traffic[]; markers: Marker[]; totalIn: number; totalOut: number; buffered: number;
  pending: number; oldestPending: number | null; lastMessageAge: number | null; connected: boolean;
  server: 'unavailable' | 'negotiating' | 'enabled'; signals: string[]; dropped: number;
  playback: { received: number | null; presented: number | null; backlog: number; oldestAge: number | null; active: boolean; synchronizing: boolean; announcement: boolean; mode: 'live' | 'replay'; speed: number };
};
export class PerformanceDiagnostics {
  mode: DiagnosticMode = 'off';
  preferences: DiagnosticPreferences;
  server: DiagnosticSnapshot['server'] = 'unavailable';
  connected = false;
  signals: string[] = [];
  private clock: () => number;
  private browserClock: boolean;
  private origin: number;
  private frames = new Ring<Sample>(8192);
  private measures = new Ring<Sample>(2048);
  private markers = new Ring<Marker>(256);
  private traffic = new Map<number, Traffic>();
  private pending = new Map<string, Trace>();
  private recent = new Map<string, Trace>();
  private revisions = new Map<number, Trace>();
  private transcripts = new Map<number, number>();
  private serial = 0;
  private inputAt: number | undefined;
  private totalIn = 0;
  private totalOut = 0;
  private lastMessage: number | undefined;
  private correlationDrops = 0;
  private playback: DiagnosticSnapshot['playback'] = { received: null, presented: null, backlog: 0, oldestAge: null, active: false, synchronizing: false, announcement: false, mode: 'live', speed: 1 };
  private backlogAt: number | undefined;
  private awaitingPresentation: number | undefined;
  private awaitingFeedback = new Set<Trace>();
  private awaitingProvisional = false;
  private listeners = new Set<() => void>();
  detailStatus: DiagnosticDetails['status'] = 'unavailable';
  private serverDetails = new Ring<ServerObservation>(64);
  private clientDetails = new Ring<ClientSpan>(512);
  private transport: { configure: (enabled: boolean) => void; probe: () => void; buffered: () => number; pendingMutation: () => boolean; pendingCount?: () => number; maintain?: () => void } | null = null;
  private lastProbe = -Infinity;
  private probeAt: number | undefined;
  constructor(clock: (() => number) | undefined = undefined, preferences = loadDiagnosticPreferences()) {
    this.browserClock = clock === undefined;
    this.clock = clock ?? (() => performance.now()); this.origin = this.clock(); this.preferences = preferences;
  }
  now() { return this.clock() - this.origin; }
  processing(id: unknown, phase: ClientPhase, at: number, durationMs: number, revision?: number) {
    if (!this.detailsEnabled || !Number.isFinite(at) || at < 0 || !Number.isFinite(durationMs) || durationMs < 0) return;
    const trace = typeof id === 'string' ? this.pending.get(id) ?? this.recent.get(id) : undefined;
    this.clientDetails.push({ at, phase, durationMs: Math.min(3_600_000, durationMs), ...(trace ? { trace: trace.serial } : {}),
      ...(Number.isSafeInteger(revision) && revision! >= 0 ? { revision } : {}) });
  }
  serverTrace(id: unknown, value: unknown) {
    if (!this.detailsEnabled || this.detailStatus !== 'enabled' || typeof id !== 'string') return;
    const server = decodeServerTrace(value), trace = this.pending.get(id) ?? this.recent.get(id);
    if (!server || !trace || server.requestType !== trace.requestType || this.serverDetails.values().some(entry => entry.trace === trace.serial && entry.server.correlation === server.correlation)) return;
    this.serverDetails.push({ at: this.now(), trace: trace.serial, server });
    if (server.timing) this.timing(id, server.timing as ServerTiming);
  }
  commit(revision: number) {
    const trace = this.revisions.get(revision);
    if (!this.detailsEnabled || !trace || trace.committed || trace.response === undefined) return;
    trace.committed = true;
    this.clientDetails.push({ phase: 'responseToCommit', at: trace.response, durationMs: Math.min(3_600_000, Math.max(0, this.now() - trace.response)), trace: trace.serial, revision });
  }
  get enabled() { return this.mode !== 'off'; }
  get detailsEnabled() { return this.enabled && this.preferences.details; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  notify() { for (const listener of this.listeners) listener(); }
  setMode(mode: DiagnosticMode) {
    if (this.mode === mode) return;
    const wasEnabled = this.enabled; this.mode = mode;
    if (this.enabled !== wasEnabled) {
      this.pending.clear(); this.recent.clear(); this.revisions.clear(); this.transcripts.clear(); this.probeAt = undefined;
      this.awaitingPresentation = undefined; this.inputAt = undefined;
      this.awaitingFeedback.clear(); this.awaitingProvisional = false;
      if (this.enabled) this.mark('enabled');
      this.transport?.configure(this.enabled);
      if (!this.enabled) this.server = 'unavailable';
      if (!this.enabled) this.detailStatus = 'unavailable';
    }
    this.notify();
  }
  update(preferences: DiagnosticPreferences) { const changed = preferences.details !== this.preferences.details; this.preferences = preferences; if (changed && this.enabled) this.transport?.configure(true); this.notify(); }
  attach(transport: NonNullable<PerformanceDiagnostics['transport']>) { this.transport = transport; return () => { if (this.transport === transport) this.transport = null; }; }
  connection(connected: boolean) {
    this.detailStatus = 'unavailable';
    this.awaitingFeedback.clear(); this.awaitingProvisional = false;
    this.connected = connected; this.server = 'unavailable'; this.pending.clear(); this.recent.clear(); this.revisions.clear(); this.transcripts.clear(); this.probeAt = undefined;
    this.mark(connected ? 'connected' : 'disconnected');
    if (connected && this.enabled) this.transport?.configure(true);
  }
  input() { if (this.enabled) this.inputAt = this.now(); }
  mark(kind: Marker['kind']) { if (this.enabled) this.markers.push({ at: this.now(), kind }); }
  sample(kind: Metric, value: number, category?: string, trace?: number, requestType?: string) {
    if (!this.enabled || !Number.isFinite(value) || value < 0) return;
    const entry: Sample = { at: this.now(), kind, value: Math.min(value, 3_600_000), ...(category && categories.has(category) ? { category } : {}), ...(trace ? { trace } : {}), ...(requestType && requestTypes.has(requestType) ? { requestType } : {}) };
    (kind === 'frame' ? this.frames : this.measures).push(entry);
  }
  payload(direction: 'in' | 'out', bytes: number) {
    if (!this.enabled || !Number.isSafeInteger(bytes) || bytes < 0) return;
    const at = Math.floor(this.now() / 250) * 250;
    let bucket = this.traffic.get(at);
    if (!bucket) { bucket = { at, incoming: 0, outgoing: 0, received: 0, sent: 0 }; this.traffic.set(at, bucket); }
    if (direction === 'in') { bucket.incoming += bytes; bucket.received++; this.totalIn += bytes; this.lastMessage = this.now(); }
    else { bucket.outgoing += bytes; bucket.sent++; this.totalOut += bytes; }
    while (this.traffic.size > 241) this.traffic.delete(this.traffic.keys().next().value!);
  }
  sent(id: string, type: string, operation: unknown, mutation: boolean) {
    if (!this.enabled) return;
    const category = type === 'authenticate' ? 'authentication' : mutation ? 'mutation'
      : ['movementRange', 'movementPreview', 'routePreview'].includes(type) ? 'advisory' : type === 'diagnostics' && operation === 'probe' ? 'probe' : 'read';
    if (this.pending.size >= 128 && !this.pending.has(id)) { this.pending.delete(this.pending.keys().next().value!); this.correlationDrops++; }
    this.pending.set(id, { at: this.now(), category, serial: ++this.serial, requestType: requestTypes.has(type) ? type : 'other',
      ...(mutation && this.inputAt !== undefined && this.now() - this.inputAt < 2000 ? { input: this.inputAt } : {}) });
  }
  response(id: unknown, revision?: number, error = false) {
    if (!this.enabled || typeof id !== 'string') return;
    const trace = this.pending.get(id); if (!trace) return;
    this.pending.delete(id); trace.response = this.now();
    this.sample(trace.category === 'probe' ? 'probe' : 'rtt', trace.response - trace.at, error ? 'error' : trace.category, trace.serial, trace.requestType);
    if (trace.category === 'probe') this.probeAt = undefined;
    if (Number.isSafeInteger(revision) && revision! >= 0 && trace.category === 'mutation') {
      trace.revision = revision; this.revisions.set(revision!, trace); this.cap(this.revisions);
      const transcript = this.transcripts.get(revision!);
      if (transcript !== undefined) { this.sample('transcript', Math.max(0, transcript - trace.response), trace.category, trace.serial); trace.transcript = true; }
    }
    this.recent.set(id, trace); this.cap(this.recent);
  }
  private cap<K, V>(map: Map<K, V>) { while (map.size > 128) { map.delete(map.keys().next().value!); this.correlationDrops++; } }
  transcript(revision: number) {
    if (!this.enabled || !Number.isSafeInteger(revision)) return;
    if (!this.transcripts.has(revision)) this.transcripts.set(revision, this.now());
    this.cap(this.transcripts);
    const trace = this.revisions.get(revision);
    if (trace?.response !== undefined && !trace.transcript) {
      this.sample('transcript', Math.max(0, this.now() - trace.response), trace.category, trace.serial); trace.transcript = true;
    }
  }
  feedback() {
    if (!this.enabled) return;
    for (const trace of this.pending.values()) if (!trace.feedback && trace.input !== undefined) {
      if (this.awaitingFeedback.size < 128) this.awaitingFeedback.add(trace);
      trace.feedback = true;
    }
  }
  timing(id: string, timing: ServerTiming) {
    const trace = this.recent.get(id) ?? this.pending.get(id); if (!this.enabled || this.server !== 'enabled' || !trace) return;
    const names: Metric[] = ['queue', 'handling', 'authorization', 'sessionApply', 'checkpoint', 'serialization', 'sql'];
    timingKeys.forEach((key, index) => this.sample(names[index], timing[key], trace.category, trace.serial));
  }
  presented(received: number, presented: number, active: boolean, synchronizing: boolean, announcement: boolean, mode: 'live' | 'replay', speed: number, opportunityRevision = presented, provisional = false) {
    if (!this.enabled) return;
    const backlog = Math.max(0, received - presented);
    if (!backlog) this.backlogAt = undefined; else this.backlogAt ??= this.now();
    this.playback = { received, presented, backlog, oldestAge: null, active, synchronizing, announcement, mode, speed };
    this.awaitingPresentation = opportunityRevision;
    this.awaitingProvisional = provisional;
  }
  frame(interval?: number) {
    if (!this.enabled) return;
    if (interval !== undefined) this.sample('frame', interval);
    for (const trace of this.awaitingFeedback) if (trace.input !== undefined) this.sample('feedback', this.now() - trace.input, trace.category, trace.serial);
    this.awaitingFeedback.clear();
    if (this.awaitingProvisional) for (const trace of this.pending.values()) if (trace.category === 'mutation' && trace.input !== undefined && !trace.provisional) {
      this.sample('provisional', this.now() - trace.input, trace.category, trace.serial); trace.provisional = true;
    }
    this.awaitingProvisional = false;
    const revision = this.awaitingPresentation; this.awaitingPresentation = undefined;
    if (revision === undefined) return;
    const trace = this.revisions.get(revision);
    const transcript = this.transcripts.get(revision);
    if (trace && trace.response !== undefined && !trace.presented) {
      // Ordered live playback needs both state and transcript. Missing history stays unavailable.
      if (transcript !== undefined) this.sample('presentation', this.now() - Math.max(trace.response, transcript), trace.category, trace.serial);
      if (trace.input !== undefined) this.sample('inputPresentation', this.now() - trace.input, trace.category, trace.serial);
      trace.presented = true;
    }
  }
  poll(hidden = false) {
    if (!this.enabled) return;
    this.transport?.maintain?.();
    const now = this.now();
    if (!hidden && this.connected) {
      const at = Math.floor(now / 250) * 250;
      if (!this.traffic.has(at)) this.traffic.set(at, { at, incoming: 0, outgoing: 0, received: 0, sent: 0 });
      while (this.traffic.size > 241) this.traffic.delete(this.traffic.keys().next().value!);
    }
    if (this.probeAt !== undefined && now - this.probeAt >= 5000) {
      this.mark('probe-timeout'); this.probeAt = undefined;
      for (const [id, trace] of this.pending) if (trace.category === 'probe') this.pending.delete(id);
    }
    for (const [id, trace] of this.recent) if (now - trace.at > 60_000) this.recent.delete(id);
    if (!hidden && this.connected && this.server === 'enabled' && this.preferences.probes && this.probeAt === undefined
      && now - this.lastProbe >= 1000 && !this.transport?.pendingMutation()) {
      this.lastProbe = this.probeAt = now; this.transport?.probe();
    }
  }
  discardDiagnostic(id: string) { this.pending.delete(id); }
  visibility(hidden: boolean) { this.mark(hidden ? 'hidden' : 'visible'); this.awaitingPresentation = undefined; this.awaitingFeedback.clear(); this.awaitingProvisional = false; this.inputAt = undefined; }
  context() { this.mark('context'); this.pending.clear(); this.recent.clear(); this.revisions.clear(); this.transcripts.clear(); this.awaitingPresentation = undefined; this.awaitingFeedback.clear(); this.awaitingProvisional = false; this.backlogAt = undefined; }
  snapshot(windowSeconds: number = this.preferences.window): DiagnosticSnapshot {
    const at = this.now(), since = at - Math.min(60, windowSeconds) * 1000;
    const pending = [...this.pending.values()];
    const pendingCount = this.transport?.pendingCount?.() ?? pending.length;
    return { at, samples: [...this.frames.values(), ...this.measures.values()].filter(sample => sample.at >= since),
      details: { version: 1, status: this.detailStatus, server: this.serverDetails.values().filter(detail => detail.at >= since),
        client: this.clientDetails.values().filter(detail => detail.at <= at && detail.at + detail.durationMs >= since),
        droppedServer: this.serverDetails.dropped, droppedClient: this.clientDetails.dropped },
      traffic: [...this.traffic.values()].filter(bucket => bucket.at >= since).map(bucket => ({ ...bucket })), markers: this.markers.values().filter(marker => marker.at >= since),
      totalIn: this.totalIn, totalOut: this.totalOut, buffered: this.connected ? this.transport?.buffered() ?? 0 : 0,
      pending: pendingCount, oldestPending: pending.length && pendingCount <= pending.length ? Math.max(...pending.map(trace => at - trace.at)) : null,
      lastMessageAge: this.lastMessage === undefined ? null : at - this.lastMessage, connected: this.connected, server: this.server,
      signals: [...this.signals], dropped: this.frames.dropped + this.measures.dropped + this.markers.dropped + this.correlationDrops,
      playback: { ...this.playback, oldestAge: this.backlogAt === undefined ? null : at - this.backlogAt } };
  }
  reset() { this.serverDetails.clear(); this.clientDetails.clear(); this.frames.clear(); this.measures.clear(); this.markers.clear(); this.traffic.clear(); this.pending.clear(); this.recent.clear(); this.revisions.clear(); this.transcripts.clear(); this.awaitingFeedback.clear(); this.awaitingProvisional = false; this.totalIn = this.totalOut = this.correlationDrops = 0; this.lastMessage = undefined; this.backlogAt = undefined; this.awaitingPresentation = undefined; this.inputAt = undefined; this.mark('reset'); }
  export(snapshot = this.snapshot(), environment: { build?: string; browser?: string; viewport?: number[]; pixelRatio?: number; reducedMotion?: boolean } = {}) {
    // Never serialize caller objects. Even environment fields pass through an explicit allowlist.
    const metadata = { build: environment.build?.slice(0, 80), browser: environment.browser?.replace(/[^a-zA-Z0-9 ._/-]/g, '').slice(0, 160),
      viewport: environment.viewport?.slice(0, 2).map(value => Math.max(0, Math.min(20_000, Number(value) || 0))),
      pixelRatio: Number.isFinite(environment.pixelRatio) ? environment.pixelRatio : undefined, reducedMotion: environment.reducedMotion === true,
      rendering: 'browser-rAF paint opportunity; physical display and renderer cadence unavailable',
      ...(this.browserClock && typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin)
        ? { clock: { collectorOriginMs: this.origin, browserTimeOriginUtcMs: performance.timeOrigin } } : {}) };
    const safe = { at: snapshot.at, samples: snapshot.samples.map(({ at, value, kind, category, trace, requestType }) => ({ at, value, kind, category, trace, requestType })),
      traffic: snapshot.traffic.map(({ at, incoming, outgoing, received, sent }) => ({ at, incoming, outgoing, received, sent })),
      markers: snapshot.markers.map(({ at, kind }) => ({ at, kind })), totalIn: snapshot.totalIn, totalOut: snapshot.totalOut, buffered: snapshot.buffered,
      pending: snapshot.pending, oldestPending: snapshot.oldestPending, connected: snapshot.connected, server: snapshot.server, signals: snapshot.signals,
      dropped: snapshot.dropped, playback: { received: snapshot.playback.received, presented: snapshot.playback.presented,
        backlog: snapshot.playback.backlog, oldestAge: snapshot.playback.oldestAge, active: snapshot.playback.active,
        synchronizing: snapshot.playback.synchronizing, announcement: snapshot.playback.announcement,
        mode: snapshot.playback.mode, speed: snapshot.playback.speed }, details: decodeDiagnosticDetails(snapshot.details) ?? undefined };
    const json = JSON.stringify({ formatVersion: 2, metadata, preferences: this.preferences, semantics: {
      time: 'monotonic milliseconds since collector creation', frame: 'rAF callback intervals, not physical frames',
      rtt: 'application send to correlated response, including scheduling and server work', traffic: 'UTF-8 V2 application payload bytes; no wire overhead or HTTP assets',
      server: 'queue and partial handling at response enqueue; nested phases overlap; publication after reply excluded',
      presentation: 'matching revision at next rAF opportunity after commit, not physical display; transcript required',
      feedback: 'input to next rAF opportunity after pending-state commit; provisional movement feedback is separate from authoritative presentation',
      details: 'Version 1 optional details: independent server/browser clocks; nested spans overlap; socket completion is not client receipt; responseToCommit includes React scheduling/render/commit, not isolated React CPU; missing/truncated details remain explicit.',
      unavailable: 'Absent samples stay absent. Long Tasks/LoAF depend on browser support. Renderer cadence unavailable.',
      caps: '60 seconds; 8192 frames, 2048 measurements, 256 markers, 241 traffic buckets, 128 correlations per map; 64 server traces with at most 48 spans each, 512 client spans; export <=2 MiB',
    }, capture: safe });
    if (new TextEncoder().encode(json).length > 2 * 1024 * 1024) throw Error('Capture exceeds the 2 MiB export limit. Clear or choose a shorter window.');
    return json;
  }
}
