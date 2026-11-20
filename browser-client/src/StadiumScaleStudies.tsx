import { useEffect, useRef, useState } from 'react';
import architectureUrl from '../../assets/game/references/stadiums/scale-studies/empty-gatehouse.webp';
import seatingUrl from '../../assets/game/references/stadiums/scale-studies/empty-seating.png';
import { bowl, drawBowlGround } from './stadium-bowl-study.ts';
import './stadium-mockup.css';
import './stadium-scale-studies.css';

async function image(url: string) {
  const result = new Image();
  result.src = url;
  await result.decode();
  if (result.width !== bowl.width || result.height !== bowl.height) throw Error('Invalid Gatehouse layer dimensions');
  return result;
}

async function loadLayers() {
  const [stadium, seating] = await Promise.all([image(architectureUrl), image(seatingUrl)]);
  const overlay = document.createElement('canvas');
  overlay.width = bowl.width;
  overlay.height = bowl.height;
  const context = overlay.getContext('2d')!;
  context.drawImage(seating, 0, 0);
  const pixels = context.getImageData(0, 0, bowl.width, bowl.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const bay = pixels.data[i];
    const away = bay >= 8 && bay <= 11;
    pixels.data.set(away ? [235, 132, 203, 145] : [64, 214, 195, 145], i);
    if (!bay) pixels.data[i+3] = 0;
  }
  context.putImageData(pixels, 0, 0);
  return { stadium, overlay };
}

export function StadiumScaleStudies() {
  const [layers, setLayers] = useState<Awaited<ReturnType<typeof loadLayers>>>();
  const [failed, setFailed] = useState(false);
  const [masked, setMasked] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    document.title = 'Empty Gatehouse stadium';
    loadLayers().then(value => { if (active) setLayers(value); }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !layers) return;
    drawBowlGround(context, true);
    context.drawImage(layers.stadium, 0, 0);
    if (masked) context.drawImage(layers.overlay, 0, 0);
  }, [layers, masked]);

  return <main className="stadium-mockup scale-studies">
    <h1>Gatehouse stadium</h1>
    <label className="mockup-controls">Gallery view
      <select value={masked ? 'masks' : 'empty'} onChange={e => setMasked(e.target.value === 'masks')}>
        <option value="empty">Empty stadium</option>
        <option value="masks">Show seating masks</option>
      </select>
    </label>
    {masked && <p>Teal marks home seating. Pink marks the east away stand.</p>}
    {failed && <p role="alert">The stadium artwork could not be loaded.</p>}
    <div className="scale-study-crop" style={{maxWidth: bowl.width}}>
      <canvas ref={canvas} width={bowl.width} height={bowl.height} data-ready={Boolean(layers)}
        aria-label={masked ? 'Gatehouse seating masks' : 'Empty Gatehouse stadium'}/>
    </div>
  </main>;
}
