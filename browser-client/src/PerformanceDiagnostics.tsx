import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { PerformanceDiagnostics, diagnosticsAvailable, distribution, histogram, loadDiagnosticPreferences } from './performance-diagnostics.ts';
import type { DiagnosticSnapshot, DiagnosticPreferences, Metric } from './performance-diagnostics.ts';
import './performance-diagnostics.css';

const Context = createContext<{ available: boolean; service: PerformanceDiagnostics | null } | null>(null);
export function useDiagnostics() { return useContext(Context); }
export function DiagnosticsBoundary({ environment, preview = false, children }: { environment?: string; preview?: boolean; children: ReactNode }) {
  const inherited = useDiagnostics();
  const [value] = useState(() => {
    const available = diagnosticsAvailable(environment) || preview && import.meta.env?.DEV === true;
    let storage: Storage | undefined; try { storage = localStorage; } catch { /* Optional. */ }
    return { available, service: available ? new PerformanceDiagnostics(undefined, loadDiagnosticPreferences(storage)) : null };
  });
  useEffect(() => () => value.service?.setMode('off'), [value]);
  return inherited ? children : <Context.Provider value={value}>{children}<DiagnosticRuntime service={value.service}/></Context.Provider>;
}

function DiagnosticRuntime({ service }: { service: PerformanceDiagnostics | null }) {
  const [, render] = useState(0);
  useEffect(() => service?.subscribe(() => render(value => value + 1)), [service]);
  const enabled = !!service?.enabled;
  useEffect(() => {
    if (!service || !enabled) return;
    let frame = 0, previous: number | undefined;
    const observers: PerformanceObserver[] = [];
    service.signals = [];
    for (const type of ['longtask', 'long-animation-frame']) {
      if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes(type)) continue;
      const observer = new PerformanceObserver(list => { if (!document.hidden) for (const entry of list.getEntries()) service.sample(type as Metric, entry.duration); });
      try { observer.observe({ type }); observers.push(observer); service.signals.push(type); } catch { observer.disconnect(); }
    }
    const tick = (now: number) => {
      service.frame(previous === undefined ? undefined : now - previous); previous = now;
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame); previous = undefined; service.visibility(document.hidden);
      if (!document.hidden) frame = requestAnimationFrame(tick);
    };
    const input = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.performance-overlay, .performance-controls, .match-debug-drawer')) return;
      if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return;
      service.input();
    };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('pointerdown', input, true); document.addEventListener('keydown', input, true);
    if (!document.hidden) frame = requestAnimationFrame(tick);
    const poll = setInterval(() => service.poll(document.hidden), 250);
    return () => {
      cancelAnimationFrame(frame); clearInterval(poll); observers.forEach(observer => observer.disconnect());
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('pointerdown', input, true); document.removeEventListener('keydown', input, true);
    };
  }, [service, enabled]);
  return null;
}
export function useDiagnosticPresentation(received: number, presented: number, active: boolean, synchronizing: boolean,
  announcement: boolean, pending: boolean, mode: 'live' | 'replay' = 'live', speed = 1, context?: string, opportunityRevision = presented, provisional = false) {
  const service = useDiagnostics()?.service;
  // Metric refreshes belong to the overlay. Gameplay only needs a new commit
  // when collection switches on/off, not each 250 ms counters/graph refresh.
  const enabled = useSyncExternalStore(
    listener => service?.subscribe(listener) ?? (() => {}),
    () => !!service?.enabled);
  useLayoutEffect(() => { service?.context(); }, [service, context]);
  useLayoutEffect(() => {
    service?.presented(received, presented, active, synchronizing, announcement, mode, speed, opportunityRevision, provisional);
    if (pending) service?.feedback();
  }, [service, enabled, received, presented, active, synchronizing, announcement, pending, mode, speed, opportunityRevision, provisional]);
}
function useDiagnosticState() {
  const context = useDiagnostics(), service = context?.service;
  const [, render] = useState(0);
  useEffect(() => service?.subscribe(() => render(value => value + 1)), [service]);
  return { available: context?.available ?? false, service };
}
export function PerformanceControls() {
  const { available, service } = useDiagnosticState();
  if (!available || !service) return null;
  const p = service.preferences;
  const change = (next: Partial<DiagnosticPreferences>) => {
    service.update({ ...p, ...next });
    try { localStorage.setItem('moles.diagnostics.preferences', JSON.stringify(service.preferences)); } catch { /* Optional. */ }
  };
  return <section className="performance-controls" aria-label="Performance and network options">
    <h3>Performance &amp; Network</h3>
    <label>Display <select aria-label="Diagnostics display" value={service.mode} onChange={event => service.setMode(event.target.value as typeof service.mode)}>
      <option value="off">Off</option><option value="counters">Counters</option><option value="graph">Graph</option>
    </select></label>
    <p>Browser frame pacing, V2 payload traffic and application response time. Collection starts Off each page session.</p>
    <fieldset><legend>Tracks</legend>{(['frame', 'network', 'latency', 'presentation'] as const).map(key => <label key={key}>
      <input type="checkbox" checked={p.tracks[key]} onChange={event => change({ tracks: { ...p.tracks, [key]: event.target.checked } })}/>
      {{ frame: 'Frame rate / frame time', network: 'Network I/O', latency: 'Client / server latency', presentation: 'Presentation delay' }[key]}</label>)}</fieldset>
    <div className="performance-options-grid">
      <label>History <select value={p.window} onChange={event => change({ window: Number(event.target.value) as 10 | 30 | 60 })}>{[10, 30, 60].map(seconds => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label>
      <label>Size <select value={p.size} onChange={event => change({ size: event.target.value as typeof p.size })}><option value="compact">Compact</option><option value="expanded">Expanded</option></select></label>
      <label>Position <select value={p.corner} onChange={event => change({ corner: event.target.value as typeof p.corner })}>{['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => <option key={corner}>{corner}</option>)}</select></label>
      <label>Graph scale <select value={p.scale} onChange={event => change({ scale: event.target.value as typeof p.scale })}><option value="auto">Automatic</option><option value="fixed">Fixed</option></select></label>
      <label>Frame budget <select value={[1000 / 30, 1000 / 60, 1000 / 120].includes(p.frameBudget) ? p.frameBudget : 'custom'} onChange={event => { if (event.target.value !== 'custom') change({ frameBudget: Number(event.target.value) }); }}>
        {[30, 60, 120].map(fps => <option key={fps} value={1000 / fps}>{fps} FPS target</option>)}<option value="custom">Custom</option></select></label>
      <label>Budget (ms) <input type="number" min="1" max="1000" step=".1" value={Number(p.frameBudget.toFixed(2))} onChange={event => change({ frameBudget: Math.max(1, Math.min(1000, Number(event.target.value) || 16.67)) })}/></label>
      <label>Latency warning (ms) <input type="number" min="1" max="60000" value={p.latencyBudget} onChange={event => change({ latencyBudget: Math.max(1, Math.min(60000, Number(event.target.value) || 250)) })}/></label>
      <label>Text scale <input type="range" min=".8" max="1.5" step=".1" value={p.textScale} onChange={event => change({ textScale: Number(event.target.value) })}/></label>
      <label>Background opacity <input type="range" min=".3" max="1" step=".05" value={p.opacity} onChange={event => change({ opacity: Number(event.target.value) })}/></label>
    </div>
    {([['warningsOnly', 'Show only on threshold warning'], ['freezeOnThreshold', 'Freeze on threshold'], ['probes', 'Idle echo probes (at most 1/s)'], ['manual', 'Manual graph refresh / reduced motion']] as const).map(([key, text]) => <label key={key}>
      <input type="checkbox" checked={p[key]} onChange={event => change({ [key]: event.target.checked })}/>{text}</label>)}
    <p>Warning-only display still collects. Echo RTT includes server scheduling; it is separate from action RTT.</p>
  </section>;
}
const number = (value: number | null | undefined, digits = 1) => value == null ? 'Unavailable' : value.toFixed(digits);
function stats(snapshot: DiagnosticSnapshot, kind: Metric, category?: string) {
  return distribution(snapshot.samples.filter(sample => sample.kind === kind && (!category || sample.category === category)).map(sample => sample.value));
}
function summary(snapshot: DiagnosticSnapshot, kind: Metric, category?: string) {
  const s = stats(snapshot, kind, category);
  return s.count ? `${number(s.latest)} / ${number(s.p50)} / ${number(s.p95)} / ${number(s.max)} ms · n=${s.count}` : 'No samples';
}
function GraphTrack({ snapshot, kind, label, budget, preferences, inspect, selected, onSelect }: {
  snapshot: DiagnosticSnapshot; kind: 'frame' | 'rtt' | 'traffic' | 'presentation'; label: string; budget?: number; preferences: DiagnosticPreferences;
  inspect: boolean; selected: number; onSelect: (at: number) => void;
}) {
  const windowMs = preferences.window * 1000, start = snapshot.at - windowMs, count = preferences.window * 4;
  const buckets = Array.from({ length: count }, () => ({ value: null as number | null, out: null as number | null }));
  const bucketIndex = (at: number) => Math.floor((at - start) / 250);
  if (kind === 'traffic') for (const entry of snapshot.traffic) {
    const bucket = buckets[bucketIndex(entry.at)];
    if (bucket) { bucket.value = (bucket.value ?? 0) + entry.incoming * 4 / 1024; bucket.out = (bucket.out ?? 0) + entry.outgoing * 4 / 1024; }
  } else for (const sample of snapshot.samples) if (sample.kind === kind && (kind !== 'rtt' || sample.category === 'mutation')) {
    const bucket = buckets[bucketIndex(sample.at)]; if (bucket) bucket.value = Math.max(bucket.value ?? 0, sample.value);
  }
  const peak = Math.max(0, ...buckets.flatMap(bucket => [bucket.value ?? 0, bucket.out ?? 0]));
  const ceiling = preferences.scale === 'auto' ? Math.max(budget ? budget * 2 : 1, peak * 1.1) : kind === 'frame' ? 100 : kind === 'traffic' ? 64 : 1000;
  const x = Math.max(0, Math.min(100, selected / (count - 1) * 100));
  const chosen = buckets[Math.min(count - 1, selected)];
  const paths = { normal: '', spike: '', outgoing: '' };
  const rectangle = (index: number, value: number, width: number) => {
    const height = Math.max(.5, Math.min(44, value / ceiling * 44));
    return `M${index * 600 / count},${44 - height}h${width}v${height}h${-width}z`;
  };
  buckets.forEach((bucket, index) => {
    if (bucket.value !== null) paths[budget && bucket.value > budget ? 'spike' : 'normal'] += rectangle(index, bucket.value, Math.max(1, 600 / count - 1));
    if (bucket.out !== null) paths.outgoing += rectangle(index, bucket.out, Math.max(.5, 600 / count / 2));
  });
  return <div className={`performance-track${inspect ? ' inspect' : ''}`}>
    <div><strong>{label}</strong><span>0–{number(ceiling, kind === 'traffic' ? 1 : 0)} {kind === 'traffic' ? 'KiB/s' : 'ms'} · {preferences.scale}{peak > ceiling ? ' · peak clipped' : ''}</span></div>
    <svg viewBox="0 0 600 44" preserveAspectRatio="none" role="img" aria-label={`${label}, ${preferences.window} second history, peak ${number(peak)}`}
      onPointerMove={event => { if (inspect) onSelect(Math.floor((event.clientX - event.currentTarget.getBoundingClientRect().left) / event.currentTarget.getBoundingClientRect().width * count)); }}
      onPointerDown={event => { if (inspect) { event.stopPropagation(); onSelect(Math.floor((event.clientX - event.currentTarget.getBoundingClientRect().left) / event.currentTarget.getBoundingClientRect().width * count)); } }}>
      {snapshot.markers.filter(marker => ['hidden', 'disconnected', 'incident', 'context'].includes(marker.kind)).map((marker, index) => <line key={`marker${index}`} x1={(marker.at - start) / windowMs * 600} x2={(marker.at - start) / windowMs * 600} y1="0" y2="44" className="performance-marker"/>)}
      {kind === 'frame' && snapshot.samples.filter(sample => sample.kind === 'longtask' || sample.kind === 'long-animation-frame').map((sample, index) => <line key={`task${index}`} x1={(sample.at - start) / windowMs * 600} x2={(sample.at - start) / windowMs * 600} y1="0" y2="44" className="performance-task"><title>{sample.kind}: {number(sample.value)} ms</title></line>)}
      {budget !== undefined && <line x1="0" x2="600" y1={44 - Math.min(44, budget / ceiling * 44)} y2={44 - Math.min(44, budget / ceiling * 44)} className="performance-threshold"/>}
      <path d={paths.normal} className="performance-bar"/><path d={paths.spike} className="performance-spike"/><path d={paths.outgoing} className="performance-out"/>
      {inspect && <line x1={x * 6} x2={x * 6} y1="0" y2="44" className="performance-cursor"/>}
    </svg>
    {inspect && <output>{number((count - 1 - selected) / 4)}s ago: {chosen?.value == null ? 'No sample' : `${number(chosen.value)} ${kind === 'traffic' ? 'KiB/s in' : 'ms'}`}{chosen?.out != null ? ` / ${number(chosen.out)} KiB/s out` : ''}</output>}
  </div>;
}
export function PerformanceOverlay() {
  const { available, service } = useDiagnosticState();
  const [live, setLive] = useState<DiagnosticSnapshot | null>(null), [frozen, setFrozen] = useState<DiagnosticSnapshot | null>(null);
  const [inspect, setInspect] = useState(false), [selected, setSelected] = useState(0), [error, setError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const freezeGate = useRef(-Infinity);
  const p = service?.preferences;
  const enabled = !!service?.enabled;
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => { if (!enabled) return; const media = window.matchMedia?.('(prefers-reduced-motion: reduce)'); const update = () => setReduced(media?.matches ?? false); update(); media?.addEventListener('change', update); return () => media?.removeEventListener('change', update); }, [enabled]);
  useEffect(() => {
    if (!service || !enabled) { setLive(null); setFrozen(null); return; }
    const refresh = () => {
      if (document.hidden) return;
      const snapshot = service.snapshot(); setLive(snapshot);
      if (p!.freezeOnThreshold && snapshot.samples.some(sample => sample.at > freezeGate.current && sample.at >= snapshot.at - 300
        && (sample.kind === 'frame' && sample.value > p!.frameBudget || sample.kind === 'rtt' && sample.value > p!.latencyBudget))) {
        freezeGate.current = snapshot.at; setFrozen(snapshot);
      }
    };
    if (frozen) return;
    refresh();
    if (p?.manual || reduced) return;
    const timer = setInterval(refresh, 250); return () => clearInterval(timer);
  }, [service, enabled, p, reduced, !!frozen]);
  if (!available || !service || !enabled || !p || !live) return null;
  const snapshot = frozen ?? live, frame = stats(snapshot, 'frame');
  const frames = snapshot.samples.filter(sample => sample.kind === 'frame');
  const recent = snapshot.traffic.filter(bucket => bucket.at > snapshot.at - 1000);
  const warning = snapshot.samples.some(sample => sample.at >= snapshot.at - 1000 && (sample.kind === 'frame' && sample.value > p.frameBudget || sample.kind === 'rtt' && sample.value > p.latencyBudget));
  if (p.warningsOnly && !warning && !frozen) return null;
  const download = () => {
    try {
      const blob = new Blob([service.export(snapshot, { build: import.meta.env?.VITE_BUILD_SHA ?? 'working-tree', browser: navigator.userAgent, viewport: [innerWidth, innerHeight], pixelRatio: devicePixelRatio, reducedMotion: reduced })], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'mutp-performance-capture.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Capture export unavailable.'); }
  };
  return <aside className={`performance-overlay ${p.corner} ${p.size}${inspect ? ' inspecting' : ''}`} aria-label="Performance diagnostics" style={{ fontSize: `${12 * p.textScale}px`, backgroundColor: `rgb(9 23 38 / ${p.opacity})` }}>
    <header><strong>Performance <span>{frozen ? 'Frozen' : p.manual || reduced ? 'Manual refresh' : 'Live'}</span></strong><div>
      <button type="button" onClick={() => service.setMode('off')}>Off</button>
    </div></header>
    <div className="performance-readouts">
      {(p.tracks.latency || p.tracks.presentation) && <p className="performance-note">Durations: latest / p50 / p95 / max · sample count</p>}
      {p.tracks.frame && <p><strong>{frames.length ? number(1000 * frames.length / frames.reduce((sum, sample) => sum + sample.value, 0), 0) : '—'} FPS</strong> rAF estimate · latest {number(frame.latest)} ms · p95 {number(frame.p95)} ms · max {number(frame.max)} ms<br/>Budget {number(p.frameBudget)} ms · over budget {frames.filter(sample => sample.value > p.frameBudget).length} · &gt;50 ms {frames.filter(sample => sample.value > 50).length} · &gt;100 ms {frames.filter(sample => sample.value > 100).length}</p>}
      {p.tracks.network && <p><strong>Payload</strong> ↓ {number(recent.reduce((sum, bucket) => sum + bucket.incoming, 0) / 1024)} / ↑ {number(recent.reduce((sum, bucket) => sum + bucket.outgoing, 0) / 1024)} KiB/s · {recent.reduce((sum, bucket) => sum + bucket.received, 0)} / {recent.reduce((sum, bucket) => sum + bucket.sent, 0)} msg/s<br/>
        Total ↓ {number(snapshot.totalIn / 1024)} / ↑ {number(snapshot.totalOut / 1024)} KiB · buffered {snapshot.buffered} B · {snapshot.connected ? 'Connected' : 'Disconnected'} · last message {number(snapshot.lastMessageAge)} ms ago</p>}
      {p.tracks.latency && <p><strong>Action RTT</strong> {summary(snapshot, 'rtt', 'mutation')}<br/>Pending {snapshot.pending} · oldest {number(snapshot.oldestPending)} ms · server timing {snapshot.server}</p>}
      {p.tracks.presentation && <p><strong>Presentation</strong> {summary(snapshot, 'presentation')}<br/>Revision {snapshot.playback.presented ?? '—'} / received {snapshot.playback.received ?? '—'} · backlog {snapshot.playback.backlog} · age {number(snapshot.playback.oldestAge)} ms · {snapshot.playback.synchronizing ? 'Waiting for transcript' : snapshot.playback.announcement ? 'Announcement wait' : snapshot.playback.active ? 'Animation active' : 'Idle'} · {snapshot.playback.mode} {snapshot.playback.speed}×</p>}
    </div>
    {service.mode === 'graph' && <div className="performance-graphs">
      {p.tracks.frame && <GraphTrack snapshot={snapshot} kind="frame" label="Frame interval" budget={p.frameBudget} preferences={p} inspect={inspect} selected={selected} onSelect={value => setSelected(Math.max(0, Math.min(p.window * 4 - 1, value)))}/>}
      {p.tracks.latency && <GraphTrack snapshot={snapshot} kind="rtt" label="Action RTT" budget={p.latencyBudget} preferences={p} inspect={inspect} selected={selected} onSelect={value => setSelected(Math.max(0, Math.min(p.window * 4 - 1, value)))}/>}
      {p.tracks.network && <GraphTrack snapshot={snapshot} kind="traffic" label="Payload ↓ cyan / ↑ gold" preferences={p} inspect={inspect} selected={selected} onSelect={value => setSelected(Math.max(0, Math.min(p.window * 4 - 1, value)))}/>}
      {p.tracks.presentation && <GraphTrack snapshot={snapshot} kind="presentation" label="Required data → presentation opportunity" preferences={p} inspect={inspect} selected={selected} onSelect={value => setSelected(Math.max(0, Math.min(p.window * 4 - 1, value)))}/>}
      <p className="performance-legend">← {p.window}s history · now → · gold dashed = budget · gold bars = over budget · vertical marks = incident / visibility / connection gap · empty = no sample</p>
      <label className="performance-interact"><input type="checkbox" checked={inspect} onChange={event => setInspect(event.target.checked)}/> Inspect graphs (touch / pointer / keyboard)</label>
      {inspect && <label className="performance-interact">History position <input aria-label="Inspect history position" type="range" min="0" max={p.window * 4 - 1} value={Math.min(selected, p.window * 4 - 1)} onChange={event => setSelected(Number(event.target.value))}/></label>}
    </div>}
    <details className="performance-interact" onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>Distributions &amp; timing details</summary>{detailsOpen && <>
      <p>Latest / p50 / p95 / max · samples in {p.window}s. Server phases overlap; do not add them.</p>
      <dl>{(['frame', 'rtt', 'probe', 'feedback', 'provisional', 'transcript', 'presentation', 'inputPresentation', 'queue', 'handling', 'authorization', 'sessionApply', 'checkpoint', 'serialization', 'sql', 'longtask', 'long-animation-frame'] as const).map(kind => <div key={kind}><dt>{kind}</dt><dd>{summary(snapshot, kind)}</dd></div>)}</dl>
      {(['mutation', 'advisory', 'read', 'error'] as const).map(category => <p key={category}>{category} RTT: {summary(snapshot, 'rtt', category)}</p>)}
      {[...new Set(snapshot.samples.filter(sample => sample.kind === 'rtt' && sample.requestType).map(sample => sample.requestType!))].map(type => {
        const values = distribution(snapshot.samples.filter(sample => sample.kind === 'rtt' && sample.requestType === type).map(sample => sample.value));
        return <p key={type}>{type} RTT: p50 {number(values.p50)} / p95 {number(values.p95)} / max {number(values.max)} ms · n={values.count}</p>;
      })}
      {(['frame', 'rtt'] as const).map(kind => <div key={kind} className="performance-histogram"><strong>{kind === 'frame' ? 'Frame interval' : 'RTT'} distribution (ms)</strong>{histogram(snapshot.samples.filter(sample => sample.kind === kind).map(sample => sample.value)).map((bin, index) => <div key={index}><span>{number(bin.from, 2)}–{bin.to === null ? '∞' : number(bin.to, 2)}</span><meter min="0" max={Math.max(1, stats(snapshot, kind).count)} value={bin.count}/><span>{bin.count}</span></div>)}</div>)}
      <p>Long Tasks: {snapshot.signals.includes('longtask') ? 'supported' : 'Unavailable'} · Long Animation Frames: {snapshot.signals.includes('long-animation-frame') ? 'supported' : 'Unavailable'}. Renderer cadence and physical display latency: Unavailable.</p>
    </>}</details>
    <footer className="performance-interact"><button type="button" onClick={() => { if (frozen) { setLive(service.snapshot()); freezeGate.current = service.now(); setFrozen(null); } else setFrozen(service.snapshot()); }}>{frozen ? 'Resume' : 'Pause'}</button>
      <button type="button" onClick={() => { service.mark('incident'); if (frozen) setFrozen({ ...frozen, markers: [...frozen.markers, { at: frozen.at, kind: 'incident' as const }].slice(-256) }); else setLive(service.snapshot()); }}>Mark incident</button>
      <button type="button" onClick={() => { service.reset(); setFrozen(null); freezeGate.current = -Infinity; setLive(service.snapshot()); }}>Clear</button>
      {(p.manual || reduced) && <button type="button" onClick={() => { const next = service.snapshot(); setLive(next); if (frozen) setFrozen(next); }}>Refresh</button>}
      <button type="button" onClick={download}>Export JSON</button><span>Dropped samples {snapshot.dropped}</span>
    </footer>
    {error && <p role="alert">{error}</p>}
    <p className="performance-note">rAF scheduling estimates · UTF-8 gameplay payload only · no packet-loss or one-way latency measurement</p>
  </aside>;
}
