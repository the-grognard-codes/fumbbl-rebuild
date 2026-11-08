import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ inputBytes: 2 * 1024 * 1024, inputs: 16, frames: 8192, measures: 2048,
  traffic: 241, markers: 256, markdownBytes: 32 * 1024, jsonBytes: 128 * 1024, incidents: 25 });
const METRICS = ['frame', 'rtt', 'probe', 'feedback', 'provisional', 'transcript', 'presentation', 'inputPresentation',
  'queue', 'handling', 'authorization', 'sessionApply', 'checkpoint', 'serialization', 'sql', 'longtask', 'long-animation-frame'];
const CATEGORIES = ['mutation', 'advisory', 'read', 'authentication', 'probe', 'error'];
const MARKERS = ['enabled', 'hidden', 'visible', 'connected', 'disconnected', 'incident', 'reset', 'probe-timeout', 'context'];
const REQUESTS = ['authenticate', 'setup', 'watch', 'browse', 'catalog', 'savedTeam', 'preparedMatch', 'matchTranscript',
  'matchResult', 'movementRange', 'movementPreview', 'routePreview', 'matchChat', 'currentMatches', 'skillUsePreferences', 'computer', 'diagnostics'];
const SERVER_METRICS = ['queue', 'handling', 'authorization', 'sessionApply', 'checkpoint', 'serialization', 'sql'];
const LABELS = { frame: 'rAF interval', rtt: 'Application RTT', probe: 'Probe RTT', feedback: 'Pending feedback',
  provisional: 'Provisional feedback', transcript: 'Transcript wait', presentation: 'Presentation opportunity',
  inputPresentation: 'Input to presentation opportunity', queue: 'Server queue', handling: 'Server handling',
  authorization: 'Authorization', sessionApply: 'Session apply', checkpoint: 'Checkpoint', serialization: 'Recovery serialization',
  sql: 'Checkpoint SQL', longtask: 'Long task', 'long-animation-frame': 'Long animation frame' };
const FLAGS = { 'frame-gap': 'Frame gap', 'frame-pressure': 'Sustained frame-budget pressure', 'slow-rtt': 'Slow application RTT', 'slow-probe': 'Slow probe RTT',
  'slow-end-to-end': 'Slow input-to-presentation total',
  'server-queue': 'Server queue wait', 'server-handling': 'Server handling time', 'presentation-wait': 'Feedback or presentation wait',
  'long-task': 'Browser scheduling stall', incident: 'Manual incident marker', disconnected: 'Disconnect marker',
  'probe-timeout': 'Probe timeout', pending: 'Pending request snapshot', backlog: 'Presentation backlog' };
const REVIEW = { 'frame-gap': 'Review browser scheduling and rendering work.', 'long-task': 'Review browser main-thread work.',
  'frame-pressure': 'Review sustained browser cadence against the selected frame budget.',
  'slow-rtt': 'Review correlated client dispatch, server work and application transport.', 'slow-probe': 'Review idle application echo timing separately from actions.',
  'slow-end-to-end': 'Compare the end-to-end input total with RTT and local waits; this total does not isolate local scheduling.',
  'server-queue': 'Review engine queue admission and competing work.', 'server-handling': 'Review measured server phases without adding overlapping spans.',
  'presentation-wait': 'Review transcript availability, intentional playback waits and presentation scheduling.',
  incident: 'Compare the manual marker with the measured observations.', disconnected: 'Review connection lifecycle around the marker.',
  'probe-timeout': 'Review application echo timeout and connection context; this is not a packet-loss measurement.',
  pending: 'Review pending ages; unfinished requests are not completed RTT samples.', backlog: 'Review ordered playback and intentional presentation waits.' };
const SEVERITY = { severe: 2, important: 1, context: 0 };
export class CaptureAnalysisError extends Error { }
function invalid() { throw new CaptureAnalysisError('Invalid capture structure or numeric values.'); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function number(value, max = Number.MAX_SAFE_INTEGER, min = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid();
  return value;
}
function count(value) { const result = number(value); if (!Number.isSafeInteger(result)) invalid(); return result; }
function optionalNumber(value, max, min) { return value === undefined || value === null ? null : number(value, max, min); }
function optionalCount(value) { return value === undefined || value === null ? null : count(value); }
function array(value, cap) { if (!Array.isArray(value) || value.length > cap) invalid(); return value; }
function rounded(value) { return value === null ? null : Math.round(value * 1000) / 1000; }
function sum(values) { return values.reduce((total, value) => Math.min(Number.MAX_SAFE_INTEGER, total + value), 0); }
function stats(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return { count: sorted.length, p50Ms: rounded(sorted[Math.ceil(sorted.length * .5) - 1] ?? null),
    p95Ms: rounded(sorted[Math.ceil(sorted.length * .95) - 1] ?? null), maxMs: rounded(sorted.at(-1) ?? null) };
}
function limitOption(value = 10) {
  if (!Number.isInteger(value) || value < 1 || value > LIMITS.incidents) throw new CaptureAnalysisError('Incident limit must be an integer from 1 to 25.');
  return value;
}
function metadata(input, quality) {
  if (!object(input)) return { build: null, browser: null, viewport: null, pixelRatio: null };
  let build = null, browser = null, viewport = null, pixelRatio = null;
  if (input.build === 'working-tree' || typeof input.build === 'string' && input.build.length >= 7 && input.build.length <= 64 && !/[^a-fA-F0-9]/.test(input.build)) build = input.build.toLowerCase();
  else if (input.build !== undefined) quality.invalidMetadata++;
  if (typeof input.browser === 'string' && input.browser.length <= 1024) {
    for (const [family, expression] of [['Edge', /\bEdg\/(\d{1,4}(?:\.\d{1,4}){0,3})\b/],
      ['Chromium', /\bHeadlessChrome\/(\d{1,4}(?:\.\d{1,4}){0,3})\b/], ['Chrome', /\bChrome\/(\d{1,4}(?:\.\d{1,4}){0,3})\b/],
      ['Firefox', /\bFirefox\/(\d{1,4}(?:\.\d{1,4}){0,3})\b/], ['Safari', /\bVersion\/(\d{1,4}(?:\.\d{1,4}){0,3})\b/]]) {
      const match = input.browser.match(expression);
      if (match) { browser = { family, version: match[1] }; break; }
    }
  }
  if (Array.isArray(input.viewport) && input.viewport.length === 2 && input.viewport.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 20000)) viewport = input.viewport.map(rounded);
  else if (input.viewport !== undefined) quality.invalidMetadata++;
  if (typeof input.pixelRatio === 'number' && Number.isFinite(input.pixelRatio) && input.pixelRatio > 0 && input.pixelRatio <= 16) pixelRatio = rounded(input.pixelRatio);
  else if (input.pixelRatio !== undefined) quality.invalidMetadata++;
  return { build, browser, viewport, pixelRatio };
}
function normalize(bytes) {
  if (typeof bytes === 'string') bytes = Buffer.from(bytes);
  if (!(bytes instanceof Uint8Array)) invalid();
  if (bytes.byteLength > LIMITS.inputBytes) throw new CaptureAnalysisError('Capture exceeds the 2 MiB input limit.');
  let raw;
  try { raw = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { throw new CaptureAnalysisError('Capture is not valid JSON.'); }
  if (!object(raw)) invalid();
  if (raw.formatVersion !== 1) throw new CaptureAnalysisError('Unsupported capture format version.');
  if (!object(raw.capture)) invalid();
  const source = raw.capture, end = number(source.at);
  const preferences = object(raw.preferences) ? raw.preferences : {};
  const seconds = preferences.window === undefined ? 30 : preferences.window;
  if (![10, 30, 60].includes(seconds)) invalid();
  const thresholds = { frameBudgetMs: preferences.frameBudget === undefined ? 1000 / 60 : number(preferences.frameBudget, 1000, 1),
    latencyBudgetMs: preferences.latencyBudget === undefined ? 250 : number(preferences.latencyBudget, 60000, 1),
    frameGapMs: 50, severeFrameGapMs: 100, queueMs: 100, handlingMs: 250, presentationMs: 100, associationMs: 500, frameBurstMs: 1000 };
  const start = Math.max(0, end - seconds * 1000);
  const quality = { unknownMetrics: 0, unknownCategories: 0, unknownRequestTypes: 0, unknownMarkers: 0, unknownSignals: 0,
    outsideWindow: 0, inputOrderInversions: 0, duplicateTraffic: 0, invalidMetadata: 0, counterMismatch: 0 };
  const samples = [], traffic = [], markers = [];
  let frames = 0, measures = 0, previous = -1;
  for (const item of array(source.samples, LIMITS.frames + LIMITS.measures)) {
    if (!object(item) || typeof item.kind !== 'string') invalid();
    const at = number(item.at, end), value = number(item.value, 3600000);
    if (item.kind === 'frame') frames++; else measures++;
    if (frames > LIMITS.frames || measures > LIMITS.measures) invalid();
    if (at < previous) quality.inputOrderInversions++;
    previous = at;
    if (!METRICS.includes(item.kind)) { quality.unknownMetrics++; continue; }
    let category = 'unspecified';
    if (item.category !== undefined) {
      if (CATEGORIES.includes(item.category)) category = item.category;
      else { category = 'other'; quality.unknownCategories++; }
    }
    if (item.requestType !== undefined && !REQUESTS.includes(item.requestType)) quality.unknownRequestTypes++;
    const trace = item.trace === undefined ? null : count(item.trace);
    if (trace === 0) invalid();
    if (at < start) { quality.outsideWindow++; continue; }
    samples.push({ at, value, kind: item.kind, category, trace });
  }
  const trafficTimes = new Set();
  for (const item of array(source.traffic, LIMITS.traffic)) {
    if (!object(item)) invalid();
    const bucket = { at: number(item.at, end), incoming: count(item.incoming), outgoing: count(item.outgoing), received: count(item.received), sent: count(item.sent) };
    if (bucket.at < start) { quality.outsideWindow++; continue; }
    if (trafficTimes.has(bucket.at)) { quality.duplicateTraffic++; continue; }
    trafficTimes.add(bucket.at); traffic.push(bucket);
  }
  for (const item of array(source.markers, LIMITS.markers)) {
    if (!object(item) || typeof item.kind !== 'string') invalid();
    const at = number(item.at, end);
    if (!MARKERS.includes(item.kind)) { quality.unknownMarkers++; continue; }
    if (at < start) { quality.outsideWindow++; continue; }
    markers.push({ at, kind: item.kind });
  }
  const signals = source.signals === undefined ? [] : array(source.signals, 64);
  quality.unknownSignals = signals.filter(signal => !['longtask', 'long-animation-frame'].includes(signal)).length;
  if (source.connected !== undefined && typeof source.connected !== 'boolean') invalid();
  const playback = source.playback === undefined ? {} : source.playback;
  if (!object(playback)) invalid();
  for (const key of ['active', 'synchronizing', 'announcement']) if (playback[key] !== undefined && typeof playback[key] !== 'boolean') invalid();
  const snapshot = { pending: optionalCount(source.pending), oldestPendingMs: optionalNumber(source.oldestPending), bufferedBytes: optionalCount(source.buffered),
    connected: source.connected ?? null, server: ['enabled', 'negotiating', 'unavailable'].includes(source.server) ? source.server : 'unavailable',
    dropped: optionalCount(source.dropped), totalInBytes: optionalCount(source.totalIn), totalOutBytes: optionalCount(source.totalOut),
    playback: { received: optionalCount(playback.received), presented: optionalCount(playback.presented), backlog: optionalCount(playback.backlog),
      oldestAgeMs: optionalNumber(playback.oldestAge), active: playback.active ?? null, synchronizing: playback.synchronizing ?? null,
      announcement: playback.announcement ?? null, mode: ['live', 'replay'].includes(playback.mode) ? playback.mode : null,
      speed: optionalNumber(playback.speed, 1000, 0) },
    signals: { longtask: signals.includes('longtask') ? 'supported' : 'unavailable',
      longAnimationFrame: signals.includes('long-animation-frame') ? 'supported' : 'unavailable' } };
  samples.sort((a, b) => a.at - b.at || METRICS.indexOf(a.kind) - METRICS.indexOf(b.kind));
  traffic.sort((a, b) => a.at - b.at); markers.sort((a, b) => a.at - b.at || MARKERS.indexOf(a.kind) - MARKERS.indexOf(b.kind));
  return { bytes, samples, traffic, markers, snapshot, thresholds, quality, metadata: metadata(raw.metadata, quality), window: { startMs: rounded(start), endMs: rounded(end), selectedSeconds: seconds } };
}
function finding(sample, thresholds) {
  let flag, threshold;
  if (sample.kind === 'frame') { flag = 'frame-gap'; threshold = 50; }
  else if (sample.kind === 'rtt') { flag = 'slow-rtt'; threshold = thresholds.latencyBudgetMs; }
  else if (sample.kind === 'probe') { flag = 'slow-probe'; threshold = thresholds.latencyBudgetMs; }
  else if (sample.kind === 'queue') { flag = 'server-queue'; threshold = 100; }
  else if (sample.kind === 'handling') { flag = 'server-handling'; threshold = 250; }
  else if (sample.kind === 'inputPresentation') { flag = 'slow-end-to-end'; threshold = thresholds.latencyBudgetMs; }
  else if (['feedback', 'provisional', 'transcript', 'presentation'].includes(sample.kind)) { flag = 'presentation-wait'; threshold = 100; }
  else if (['longtask', 'long-animation-frame'].includes(sample.kind)) { flag = 'long-task'; threshold = 50; }
  if (!flag || sample.value < threshold) return null;
  return { flag, severity: sample.kind === 'frame' ? (sample.value >= 100 ? 'severe' : 'important')
    : sample.value >= Math.max(threshold * 2, 1000) ? 'severe' : 'important', score: sample.value / threshold };
}
function rangeDistance(a, b) { return Math.max(0, a.start - b.end, b.start - a.end); }
function makeIncident(kind, samples, flags, trace = null) {
  const rtts = samples.filter(sample => sample.kind === 'rtt' || sample.kind === 'probe');
  const times = samples.map(sample => sample.at);
  const at = Math.min(...times), end = Math.max(...times);
  const requestRange = rtts.length ? { start: Math.max(0, Math.min(...rtts.map(sample => sample.at - sample.value))),
    end: Math.max(...rtts.map(sample => sample.at)) } : null;
  const clientInterval = requestRange ? { startMs: rounded(requestRange.start), endMs: rounded(requestRange.end) } : null;
  return { kind, trace, atMs: rounded(at), observationEndMs: rounded(end), clientInterval, severity: 'context', score: 0,
    flags: [...new Set(flags.map(flag => flag.flag))], evidence: [], nearby: { frameBursts: 0, frameCount: 0, frameMaxMs: null, markers: [] },
    serverTiming: samples.some(sample => SERVER_METRICS.includes(sample.kind)) ? 'available' : 'unavailable',
    _range: requestRange ?? { start: at, end }, _samples: samples };
}
function rank(incident, flags) {
  for (const flag of flags) {
    if (SEVERITY[flag.severity] > SEVERITY[incident.severity]) incident.severity = flag.severity;
    incident.score = Math.max(incident.score, flag.score);
  }
}
function incidentsFor(data, maxIncidents) {
  const traces = new Map(), standalone = [], frameBursts = [];
  for (const sample of data.samples) {
    if (sample.kind === 'frame') continue;
    if (sample.trace !== null) {
      if (!traces.has(sample.trace)) traces.set(sample.trace, []);
      traces.get(sample.trace).push(sample);
    } else if (finding(sample, data.thresholds)) standalone.push([sample]);
  }
  const groups = [];
  for (const [trace, samples] of [...traces.entries(), ...standalone.map(samples => [null, samples])]) {
    const flags = samples.map(sample => finding(sample, data.thresholds)).filter(Boolean);
    if (!flags.length) continue;
    const incident = makeIncident(trace === null ? 'measurement' : 'trace', samples, flags, trace);
    rank(incident, flags); groups.push(incident);
  }
  for (const sample of data.samples.filter(sample => sample.kind === 'frame' && sample.value >= 50)) {
    let burst = frameBursts.at(-1);
    if (!burst || sample.at - burst[0].at > 1000) { burst = []; frameBursts.push(burst); }
    burst.push(sample);
  }
  function nearest(range, candidates) {
    return candidates.map(incident => ({ incident, distance: rangeDistance(range, incident._range) }))
      .filter(entry => entry.distance <= 500).sort((a, b) => a.distance - b.distance || a.incident.atMs - b.incident.atMs)[0]?.incident;
  }
  for (const burst of frameBursts) {
    const flags = burst.map(sample => finding(sample, data.thresholds));
    const range = { start: Math.max(0, burst[0].at - burst[0].value), end: burst.at(-1).at };
    const correlated = nearest(range, groups);
    if (correlated) {
      correlated.nearby.frameBursts++;
      correlated.nearby.frameCount += burst.length;
      correlated.nearby.frameMaxMs = rounded(Math.max(correlated.nearby.frameMaxMs ?? 0, ...burst.map(sample => sample.value)));
      correlated.flags = [...new Set([...correlated.flags, 'frame-gap'])]; rank(correlated, flags);
    } else {
      const incident = makeIncident('frame-burst', burst, flags);
      incident._range = range; rank(incident, flags); groups.push(incident);
    }
  }
  for (const marker of data.markers.filter(marker => ['incident', 'disconnected', 'probe-timeout'].includes(marker.kind))) {
    const related = nearest({ start: marker.at, end: marker.at }, groups);
    const flags = [{ flag: marker.kind, severity: marker.kind === 'incident' ? 'context' : 'important', score: 1 }];
    if (related) {
      let record = related.nearby.markers.find(item => item.kind === marker.kind);
      if (!record) { record = { kind: marker.kind, count: 0 }; related.nearby.markers.push(record); }
      record.count++; related.flags = [...new Set([...related.flags, marker.kind])]; rank(related, flags);
    } else {
      const incident = makeIncident('marker', [{ at: marker.at, value: 0, kind: 'marker' }], flags);
      incident._samples = []; rank(incident, flags); groups.push(incident);
    }
  }
  const snapshotFlags = [];
  if (data.snapshot.pending > 0) snapshotFlags.push({ flag: 'pending', severity: data.snapshot.oldestPendingMs >= data.thresholds.latencyBudgetMs ? 'important' : 'context', score: (data.snapshot.oldestPendingMs ?? 0) / data.thresholds.latencyBudgetMs });
  if (data.snapshot.playback.backlog > 0) snapshotFlags.push({ flag: 'backlog', severity: data.snapshot.playback.oldestAgeMs >= 100 ? 'important' : 'context', score: (data.snapshot.playback.oldestAgeMs ?? 0) / 100 });
  if (snapshotFlags.length) {
    const incident = makeIncident('snapshot', [{ at: data.window.endMs, value: 0, kind: 'snapshot' }], snapshotFlags);
    incident._samples = []; rank(incident, snapshotFlags); groups.push(incident);
  }
  const frames = data.samples.filter(sample => sample.kind === 'frame');
  const frameMedian = frames.length ? frames.map(sample => sample.value).toSorted((a, b) => a - b)[Math.ceil(frames.length * .5) - 1] : null;
  if (frames.length >= 20 && frameMedian > data.thresholds.frameBudgetMs * 1.25) {
    const incident = makeIncident('frame-pressure', frames, [{ flag: 'frame-pressure' }]);
    incident.severity = 'important';
    incident.score = frameMedian / data.thresholds.frameBudgetMs;
    incident.framePressure = { medianMs: rounded(frameMedian), selectedBudgetMs: rounded(data.thresholds.frameBudgetMs), multiplier: 1.25, minimumFrames: 20 };
    groups.push(incident);
  }
  groups.sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity] || b.score - a.score || a.atMs - b.atMs);
  return { total: groups.length, frameBursts: frameBursts.length, items: groups.slice(0, maxIncidents).map(incident => {
    const { _range, _samples, score, ...safe } = incident;
    safe.evidence = METRICS.flatMap(metric => {
      const values = _samples.filter(sample => sample.kind === metric).map(sample => sample.value);
      return values.length ? [{ metric, count: values.length, maxMs: rounded(Math.max(...values)) }] : [];
    });
    safe.review = [...new Set(safe.flags.map(flag => REVIEW[flag]))];
    return safe;
  }) };
}

/** Accepts only exported JSON bytes/text. No raw objects, strings or source filenames enter the report. */
export function analyzeCapture(bytes, { ordinal = 1, maxIncidents = 10 } = {}) {
  maxIncidents = limitOption(maxIncidents);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > LIMITS.inputs) invalid();
  const data = normalize(bytes), incidents = incidentsFor(data, maxIncidents), frames = data.samples.filter(sample => sample.kind === 'frame');
  const statistics = [];
  for (const metric of METRICS) for (const category of [...CATEGORIES, 'unspecified', 'other']) {
    const values = data.samples.filter(sample => sample.kind === metric && sample.category === category).map(sample => sample.value);
    if (values.length) statistics.push({ metric, category, ...stats(values) });
  }
  const windowIn = sum(data.traffic.map(bucket => bucket.incoming)), windowOut = sum(data.traffic.map(bucket => bucket.outgoing));
  if (data.snapshot.totalInBytes !== null && windowIn > data.snapshot.totalInBytes) data.quality.counterMismatch++;
  if (data.snapshot.totalOutBytes !== null && windowOut > data.snapshot.totalOutBytes) data.quality.counterMismatch++;
  // Fixed 250 ms application buckets; rate denominators are bucket widths, never inferred wire duration.
  const rateSeconds = data.traffic.length * .25;
  const times = data.samples.map(sample => sample.at);
  return { id: `capture-${ordinal}-${createHash('sha256').update(data.bytes).digest('hex').slice(0, 12)}`, ordinal, metadata: data.metadata,
    window: { ...data.window, firstSampleMs: times.length ? rounded(times[0]) : null, lastSampleMs: times.length ? rounded(times.at(-1)) : null,
      sampleSpanMs: times.length ? rounded(times.at(-1) - times[0]) : null },
    counts: { samples: data.samples.length, frames: frames.length, measures: data.samples.length - frames.length, trafficBuckets: data.traffic.length,
      markers: data.markers.length, framesOverBudget: frames.filter(sample => sample.value > data.thresholds.frameBudgetMs).length,
      frameGaps50Ms: frames.filter(sample => sample.value >= 50).length, frameGaps100Ms: frames.filter(sample => sample.value >= 100).length,
      frameBursts: incidents.frameBursts, incidentGroups: incidents.total },
    thresholds: data.thresholds, snapshot: data.snapshot, quality: data.quality,
    traffic: { retainedInBytes: windowIn, retainedOutBytes: windowOut, receivedMessages: sum(data.traffic.map(bucket => bucket.received)),
      sentMessages: sum(data.traffic.map(bucket => bucket.sent)), representedBucketSeconds: rounded(rateSeconds),
      meanInBytesPerSecond: rateSeconds ? rounded(windowIn / rateSeconds) : null,
      meanOutBytesPerSecond: rateSeconds ? rounded(windowOut / rateSeconds) : null,
      peakInBytesPerSecond: data.traffic.length ? Math.max(...data.traffic.map(bucket => bucket.incoming * 4)) : null,
      peakOutBytesPerSecond: data.traffic.length ? Math.max(...data.traffic.map(bucket => bucket.outgoing * 4)) : null },
    markerCounts: Object.fromEntries(MARKERS.map(kind => [kind, data.markers.filter(marker => marker.kind === kind).length])),
    unavailableMetrics: METRICS.filter(metric => !data.samples.some(sample => sample.kind === metric)),
    statistics, incidents: incidents.items, truncation: { incidents: incidents.total - incidents.items.length, statistics: 0 } };
}

export function analyzeCaptures(inputs, options = {}) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > LIMITS.inputs) throw new CaptureAnalysisError('Provide from 1 to 16 captures.');
  limitOption(options.maxIncidents);
  const report = { reportVersion: 1, captures: inputs.map((input, index) => analyzeCapture(input, { ...options, ordinal: index + 1 })),
    limits: { markdownBytes: LIMITS.markdownBytes, jsonBytes: LIMITS.jsonBytes }, outputTruncated: false };
  while (Buffer.byteLength(JSON.stringify(report)) + 1 > LIMITS.jsonBytes) {
    report.outputTruncated = true;
    const largest = report.captures.toSorted((a, b) => b.statistics.length - a.statistics.length)[0];
    if (largest.statistics.length) {
      const removed = Math.min(8, largest.statistics.length);
      largest.statistics.splice(-removed); largest.truncation.statistics += removed; continue;
    }
    const remaining = report.captures.toSorted((a, b) => b.incidents.length - a.incidents.length)[0];
    if (!remaining.incidents.length) throw new CaptureAnalysisError('Report exceeds the bounded output limit.');
    remaining.incidents.pop(); remaining.truncation.incidents++;
  }
  return report;
}

export function serializeReport(report) {
  const result = `${JSON.stringify(report)}\n`;
  if (Buffer.byteLength(result) > LIMITS.jsonBytes) throw new CaptureAnalysisError('Report exceeds the bounded output limit.');
  return result;
}
const display = value => value === null || value === undefined ? 'Unavailable' : String(rounded(value));
export function renderMarkdown(report) {
  let lines = ['# Diagnostic capture review', '',
    'Independent retained windows; capture clocks are never merged. Durations are milliseconds. rAF measures scheduling opportunities, not physical display frames.', '',
    'Heuristics: frame gaps >=50 ms are important, >=100 ms severe; ordinary frame-budget crossings are counts only. Sustained pressure requires >=20 frames with median >1.25 x the selected frame budget. RTT and end-to-end input-to-presentation totals use the configured latency budget (default 250 ms); queue >=100 ms, handling >=250 ms, local feedback/provisional/transcript/presentation waits >=100 ms. End-to-end totals include RTT and do not isolate local waits. Other duration findings are severe at max(2 x threshold, 1000 ms). Gap-end observations form bursts within 1 s. Nearby frame/marker context within 500 ms is correlation only.', '',
    'Server durations are joined by capture-local trace, not positioned on the client clock. Nested phases overlap; do not add them or subtract them from RTT. RTT intervals include dispatch and server work. Missing data stays unavailable. Drops are cumulative ring replacements/correlation evictions, not necessarily unexpected truncation or packet loss. Intentional playback waits can contribute to presentation delays.', ''];
  const preamble = [...lines];
  // Emit every capture summary before spending the detail budget, so batches never hide a window.
  for (const capture of report.captures) {
    const { counts, window, snapshot, traffic } = capture;
    lines.push(`## ${capture.id}`, '',
      `Window ${display(window.startMs)}..${display(window.endMs)} ms (${window.selectedSeconds} s selected); sample span ${display(window.sampleSpanMs)} ms. Samples ${counts.samples}: frames ${counts.frames}, measurements ${counts.measures}; traffic buckets ${counts.trafficBuckets}, markers ${counts.markers}.`,
      `Frame budget ${display(capture.thresholds.frameBudgetMs)} ms; over budget ${counts.framesOverBudget}; >=50 ms ${counts.frameGaps50Ms}, >=100 ms ${counts.frameGaps100Ms}; bursts ${counts.frameBursts}. RTT budget ${display(capture.thresholds.latencyBudgetMs)} ms.`,
      `Connection ${snapshot.connected === null ? 'Unavailable' : snapshot.connected ? 'connected' : 'disconnected'}; server ${snapshot.server}; pending ${display(snapshot.pending)}, oldest ${display(snapshot.oldestPendingMs)} ms; buffered ${display(snapshot.bufferedBytes)} bytes. Backlog ${display(snapshot.playback.backlog)}, oldest ${display(snapshot.playback.oldestAgeMs)} ms; playback ${snapshot.playback.mode ?? 'Unavailable'}, active ${snapshot.playback.active ?? 'Unavailable'}, synchronizing ${snapshot.playback.synchronizing ?? 'Unavailable'}, announcement ${snapshot.playback.announcement ?? 'Unavailable'}.`,
      `Payload retained in/out ${traffic.retainedInBytes}/${traffic.retainedOutBytes} bytes; messages ${traffic.receivedMessages}/${traffic.sentMessages}; mean in/out ${display(traffic.meanInBytesPerSecond)}/${display(traffic.meanOutBytesPerSecond)} B/s, peak ${display(traffic.peakInBytesPerSecond)}/${display(traffic.peakOutBytesPerSecond)} B/s. Rates use ${traffic.representedBucketSeconds} s of 250 ms buckets, including partial trailing buckets; missing buckets are not zero. Cumulative since reset ${display(snapshot.totalInBytes)}/${display(snapshot.totalOutBytes)} bytes. Scope: V2 UTF-8 application payload only, excluding HTTP assets and wire overhead.`,
      `Dropped ${display(snapshot.dropped)}; Long Tasks ${snapshot.signals.longtask}, Long Animation Frames ${snapshot.signals.longAnimationFrame}. Unknown/ignored entries ${Object.entries(capture.quality).filter(([key]) => key.startsWith('unknown')).reduce((total, [, value]) => total + value, 0)}; outside window ${capture.quality.outsideWindow}; input order transitions normalized ${capture.quality.inputOrderInversions} (grouped exporter ordering is expected); duplicate traffic ${capture.quality.duplicateTraffic}; metadata rejected ${capture.quality.invalidMetadata}; counter mismatches ${capture.quality.counterMismatch}.`,
      `Markers: manual ${capture.markerCounts.incident}, disconnect ${capture.markerCounts.disconnected}, probe timeout ${capture.markerCounts['probe-timeout']}, hidden ${capture.markerCounts.hidden}, reset ${capture.markerCounts.reset}, context ${capture.markerCounts.context}.`,
      `Environment: build ${capture.metadata.build ?? 'Unavailable'}; browser ${capture.metadata.browser ? `${capture.metadata.browser.family} ${capture.metadata.browser.version}` : 'Unavailable'}; viewport ${capture.metadata.viewport ? capture.metadata.viewport.join(' x ') : 'Unavailable'}; pixel ratio ${display(capture.metadata.pixelRatio)}.`,
      `Incident groups ${counts.incidentGroups}; omitted ${capture.truncation.incidents}; omitted statistics ${capture.truncation.statistics}.`, '');
  }
  if (Buffer.byteLength(lines.join('\n')) > LIMITS.markdownBytes - 4096) {
    lines = [...preamble, 'Extended summaries omitted by the global output budget; structured JSON retains available context.', '',
      ...report.captures.flatMap(capture => [`## ${capture.id}`, `Window ${capture.window.startMs}..${capture.window.endMs} ms; samples ${capture.counts.samples} (frames ${capture.counts.frames}, measurements ${capture.counts.measures}); groups ${capture.counts.incidentGroups}, omitted ${capture.truncation.incidents}; pending ${display(capture.snapshot.pending)}, oldest ${display(capture.snapshot.oldestPendingMs)} ms; dropped ${display(capture.snapshot.dropped)}.`, ''])];
  }
  let omittedIncidents = 0, omittedStatistics = 0;
  function append(fragment, kind) {
    if (Buffer.byteLength([...lines, fragment].join('\n')) > LIMITS.markdownBytes - 512) {
      if (kind === 'incident') omittedIncidents++; else omittedStatistics++;
      return;
    }
    lines.push(fragment);
  }
  append('## Ranked evidence by independent capture\n', 'statistics');
  const ranked = report.captures.flatMap(capture => capture.incidents.map((incident, index) => ({ capture, incident, index })))
    .sort((a, b) => SEVERITY[b.incident.severity] - SEVERITY[a.incident.severity] || a.index - b.index || a.capture.ordinal - b.capture.ordinal);
  for (const { capture, incident, index } of ranked) {
      const evidence = incident.evidence.map(row => `${LABELS[row.metric]} max ${row.maxMs} ms (n=${row.count})`).join('; ') || 'snapshot/marker context';
      append(`- **${incident.severity}**, ${capture.id}, rank ${index + 1}, first ${incident.trace === null ? '' : 'trace '}observation ${display(incident.atMs)} ms${incident.trace === null ? '' : `, trace ${incident.trace}`}: ${incident.flags.map(flag => FLAGS[flag]).join('; ')}. ${evidence}. ${incident.framePressure ? `Median ${incident.framePressure.medianMs} ms against selected ${incident.framePressure.selectedBudgetMs} ms budget. ` : ''}${incident.clientInterval ? `Client RTT interval ${incident.clientInterval.startMs}..${incident.clientInterval.endMs} ms. ` : ''}Server timing ${incident.serverTiming}. Nearby correlation: ${incident.nearby.frameBursts} frame bursts, ${incident.nearby.frameCount} gaps, peak ${display(incident.nearby.frameMaxMs)} ms; markers ${incident.nearby.markers.map(marker => `${FLAGS[marker.kind]} x${marker.count}`).join(', ') || 'none'}. Review: ${incident.review.join(' ')}\n`, 'incident');
  }
  for (const capture of report.captures) {
    append(`### ${capture.id}: metric statistics\n`, 'statistics');
    if (!capture.incidents.length) append('No threshold findings or incident markers in retained samples. Missing signals do not establish performance health.\n', 'statistics');
    append(`Metric/category | n | p50 ms | p95 ms | max ms\n---|---:|---:|---:|---:`, 'statistics');
    for (const row of capture.statistics) append(`${LABELS[row.metric]} / ${row.category} | ${row.count} | ${display(row.p50Ms)} | ${display(row.p95Ms)} | ${display(row.maxMs)}`, 'statistics');
    append(`Unavailable metrics: ${capture.unavailableMetrics.map(metric => LABELS[metric]).join(', ') || 'none'}.\n`, 'statistics');
  }
  if (report.outputTruncated || omittedIncidents || omittedStatistics) lines.push('', `Output truncated to bounded report limits. Additional Markdown incident groups omitted: ${omittedIncidents}; statistics/detail rows omitted: ${omittedStatistics}. JSON omissions are recorded per capture.`);
  const result = `${lines.join('\n')}\n`;
  if (Buffer.byteLength(result) > LIMITS.markdownBytes) throw new CaptureAnalysisError('Report exceeds the bounded output limit.');
  return result;
}
