import { useEffect, useMemo, useRef, useState } from 'react';
import { decodeProofAnimation, animationFrameAt, findProofClip, type ProofAnimation, type ProofClip, type ProofDesign } from './sprite-proof-animation.ts';
import { recolorProofImage, type SpriteProofPack } from './sprite-proof-format.ts';
import { SpriteProofPitch } from './SpriteProofPitch.tsx';

export function SpriteAnimationProof({ palette, primary, secondary, mirror, zoom }: {
  palette: SpriteProofPack; primary: string; secondary: string; mirror: boolean; zoom: number;
}) {
  const [pack, setPack] = useState<ProofAnimation | null>(null), [error, setError] = useState('');
  const [design, setDesign] = useState<ProofDesign>('lineman');
  const [end, setEnd] = useState<'home' | 'away'>('home'), [mode, setMode] = useState<'perspective' | 'top-down'>('perspective');
  const [crowd, setCrowd] = useState(false), [staticScene, setStaticScene] = useState(false), [sameKits, setSameKits] = useState(false);
  const [clip, setClip] = useState<ProofClip>('idle'), [direction, setDirection] = useState('front45');
  const [playing, setPlaying] = useState(true), [elapsed, setElapsed] = useState(0);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/assets/game/proofs/shared-sprite-v1/animation.json', { signal: controller.signal })
      .then(response => { if (!response.ok) throw Error('Animation pack unavailable'); return response.json(); })
      .then(decodeProofAnimation).then(setPack).catch(error => { if (!controller.signal.aborted) setError(String(error)); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches);
    media.addEventListener('change', changed); return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (!playing || reduced) return;
    let previous: number | undefined, request: number;
    const tick = (now: number) => {
      if (previous !== undefined) { const delta = now - previous; setElapsed(value => value + delta); }
      previous = now; request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick); return () => cancelAnimationFrame(request);
  }, [playing, reduced]);
  const selected = pack ? findProofClip(pack, design, clip, direction) : null;
  const frame = selected ? animationFrameAt(selected, elapsed, reduced) : 0;
  const size = design === 'ogre' ? 80 : 64;
  const frames = useMemo(() => {
    if (!pack || !selected) return [];
    const p = palette.ramps.find(ramp => ramp.id === primary)!, s = palette.ramps.find(ramp => ramp.id === secondary)!;
    return selected.frames.map(frame => {
      const image = pack.palettePack.images.find(image => image.id === frame.imageId)!;
      return new ImageData(new Uint8ClampedArray(recolorProofImage(image, p, s)), size, size);
    });
  }, [pack, palette, primary, secondary, selected, size]);
  useEffect(() => { const context = canvas.current?.getContext('2d'); context?.clearRect(0, 0, size, size); if (frames[frame]) context?.putImageData(frames[frame], 0, 0); }, [frames, frame, size]);
  return <section id="animation-proof"><h2>Three-size animation proof</h2>
    <p>Four generated frames per clip. Lineman has two three-quarter views; halfling and ogre have front three-quarter. Colors and mirror follow the controls above. Fall holds its final grounded frame. Reduced motion shows a static representative pose.</p>
    {error ? <p role="alert">{error}. The approved static previews below remain available.</p> : !pack ? <p>Loading animation…</p> : null}
    <label>Design <select aria-label="Animation design" value={design} onChange={event => { setDesign(event.target.value as ProofDesign); setElapsed(0); }}><option value="lineman">Lineman · standard</option><option value="halfling">Halfling · small</option><option value="ogre">Ogre · big</option></select></label>
    <label>Clip <select aria-label="Animation clip" value={clip} onChange={event => { setClip(event.target.value as ProofClip); setElapsed(0); }}>
      <option value="idle">Idle</option><option value="move">Move</option><option value="fall">Contact / fall</option></select></label>
    <label>View <select aria-label="Animation view" value={direction} onChange={event => setDirection(event.target.value)}>
      <option value="front45">Front three-quarter</option><option value="back45">Back three-quarter</option><option value="side">Side · static fallback</option></select></label>
    <button onClick={() => setPlaying(value => !value)}>{playing ? 'Pause animation' : 'Play animation'}</button>
    <button onClick={() => setElapsed(0)}>Restart animation</button>
    <button disabled={reduced || !selected} onClick={() => { setPlaying(false); const next = (frame + 1) % 4; setElapsed(selected!.frames.slice(0, next).reduce((sum, value) => sum + value.durationMs, 0)); }}>Next frame</button>
    <p data-animation-frame={frame}>Frame {frame + 1} / 4{reduced ? ' · reduced motion' : ''}</p>
    <div className="proof-green" style={{ width: 'fit-content', padding: 24 }}><canvas ref={canvas} width={size} height={size} aria-label="Animated player"
      style={{ width: size * zoom, height: size * zoom, imageRendering: 'pixelated', transform: mirror ? 'scaleX(-1)' : undefined }}/></div>
    {!selected && pack && <p>No authored clip for this view; the projected scene retains the accepted static player.</p>}
    <h3>Projected pitch · current Pixi renderer</h3>
    <label>Coach end <select aria-label="Coach end" value={end} onChange={event => setEnd(event.target.value as typeof end)}><option value="home">Home</option><option value="away">Away</option></select></label>
    <label>Projection <select aria-label="Proof projection" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="perspective">Perspective</option><option value="top-down">Top-down</option></select></label>
    <label><input type="checkbox" checked={crowd} onChange={event => setCrowd(event.target.checked)}/> 22-player synthetic scene</label>
    <label><input type="checkbox" checked={staticScene} onChange={event => setStaticScene(event.target.checked)}/> Accepted static baseline</label>
    <label><input type="checkbox" checked={sameKits} onChange={event => setSameKits(event.target.checked)}/> Identical opposing kits</label>
    <p>Both ends use the existing direction resolver. Unsupported directions use accepted static art. Opponents swap the selected colors unless identical kits is selected. This synthetic scene does not change match state.</p>
    {pack && <SpriteProofPitch pack={pack} settings={{ design, clip, direction, end, mode, primary, secondary, mirror, elapsed, reduced, crowd, staticScene, sameKits }}/>}
  </section>;
}
