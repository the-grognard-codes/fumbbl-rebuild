import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodeSpriteProof, recolorProofImage, SpriteProofTextures, type ProofImage, type SpriteProofPack } from './sprite-proof-format.ts';
import { resolvePlayerArt, resolvePlayerPortrait, playerArtPlacement } from './player-art.ts';
import type { SetupPlayer } from './setup-protocol.ts';
import './sprite-proof-review.css';
import { ColorRampPicker } from './ColorRampPicker.tsx';
import { SpriteAnimationProof } from './SpriteAnimationProof.tsx';
import { MatchSplash } from './MatchSplash.tsx';
import type { MatchAnnouncement } from './match-announcements.ts';

const player: SetupPlayer = { id: 'proof-lineman', name: 'Human lineman', slot: 1, role: 'home', x: 13, y: 7,
  state: 'standing', art: { rosterId: 'human', positionId: 'lineman' } };

function imageCanvas(image: ProofImage, pixels: Uint8ClampedArray): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable');
  const data = context.createImageData(image.width, image.height); data.data.set(pixels); context.putImageData(data, 0, 0);
  return canvas;
}

function PaletteSheet({ pack, kind, design }: { pack: SpriteProofPack; kind: ProofImage['kind']; design: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const image = pack.images.find(image => image.kind === kind && (kind !== 'bust' || image.id === `${design}-portrait`))!;
  const cell = image.width + 8;
  useEffect(() => {
    const context = ref.current!.getContext('2d')!;
    context.fillStyle = '#355b35'; context.fillRect(0, 0, cell * 16, cell * 16);
    pack.ramps.forEach((primary, row) => pack.ramps.forEach((secondary, column) => {
      context.drawImage(imageCanvas(image, recolorProofImage(image, primary, secondary)), column * cell + 4, row * cell + 4);
    }));
  }, [pack, image, cell]);
  return <><p>Rows = primary; columns = secondary. Both follow the numbered palette order below. Scroll to inspect every cell at native size.</p>
    <button onClick={() => { const link = document.createElement('a'); link.href = ref.current!.toDataURL(); link.download = `${image.id}-256-pairs.png`; link.click(); }}>Download native-size sheet</button>
    <div className="proof-sheet"><canvas ref={ref} width={cell * 16} height={cell * 16} aria-label={`All 256 ${kind} palette pairs`}/></div></>;
}

function Review({ pack }: { pack: SpriteProofPack }) {
  const [bustDesign, setBustDesign] = useState('lineman');
  const [primary, setPrimary] = useState('navy'), [secondary, setSecondary] = useState('ivory');
  const [zoom, setZoom] = useState(3), [mirror, setMirror] = useState(false), [kind, setKind] = useState<ProofImage['kind']>('body');
  const [textures] = useState(() => new SpriteProofTextures(pack, (image, pixels) => imageCanvas(image, pixels).toDataURL()));
  const [mode, setMode] = useState<'perspective' | 'top-down'>('perspective');
  const body = pack.images.find(image => image.kind === 'body')!, bust = pack.images.find(image => image.id === `${bustDesign}-portrait`)!;
  const helmet = pack.images.find(image => image.kind === 'helmet')!;
  const bodyUrl = textures.resolve(body.sourceUrl, primary, secondary)!;
  // Same portrait identity as cards/dugouts/choices. The builder preview also uses this route.
  const portraitUrl = textures.resolve(resolvePlayerPortrait({ ...player, art: { rosterId: 'human', positionId: bustDesign } }), primary, secondary)!;
  const helmetUrl = textures.resolve(helmet.sourceUrl, primary, secondary)!;
  const originalHelmet = imageCanvas(helmet, new Uint8ClampedArray(helmet.rgba)).toDataURL();
  const selectedBody = resolvePlayerArt(player, { end: 'home', facing: mirror ? 'south-west' : 'south-east' })!.body;
  const placement = playerArtPlacement(selectedBody, mode === 'top-down');
  const maskUrl = (image: ProofImage) => {
    const pixels = new Uint8ClampedArray(image.rgba);
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const at = (y * image.width + x) * 4, index = Number(image.indices[y][x]);
      pixels.set(index === 0 ? [70, 70, 70] : index <= 16 ? [44, 205, 242] : [255, 91, 177], at);
    }
    return imageCanvas(image, pixels).toDataURL();
  };
  return <main>
    <header><p className="proof-eyebrow">MUTP · DEVELOPMENT ART REVIEW · #393 / #432</p><h1>Shared sprite format</h1>
      <p>Human lineman · static bust · team helmet</p></header>
    <aside className="proof-notice"><strong>Player and bust approved</strong> — The shared 16-color, 16-shade palette now also recolors the Human team helmet.
      Lineman animation approved. Halfling, ogre and the projected scene extend the same format below.</aside>
    <section className="proof-controls" aria-label="Review controls">
      <div className="proof-palette-pickers">
        <ColorRampPicker label="Primary color" name="primary" ramps={pack.ramps} value={primary} onChange={setPrimary}/>
        <ColorRampPicker label="Secondary color" name="secondary" ramps={pack.ramps} value={secondary} onChange={setSecondary}/>
      </div>
      <label>Enlargement<select aria-label="Enlargement" value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={1}>1× native</option><option value={3}>3×</option><option value={5}>5×</option></select></label>
      <label><input type="checkbox" checked={mirror} onChange={event => setMirror(event.target.checked)}/> Mirror pitch sprite</label>
      <button onClick={() => { setPrimary('white'); setSecondary('white'); }}>Light / light</button>
      <button onClick={() => { setPrimary('black'); setSecondary('black'); }}>Dark / dark</button>
      <button onClick={() => { setPrimary('navy'); setSecondary('ivory'); }}>Reset</button>
    </section>
    <SpriteAnimationProof palette={pack} primary={primary} secondary={secondary} mirror={mirror} zoom={zoom}/>
    <section><h2>Original → recolored → material regions</h2><p>Cyan = primary · pink = secondary · gray = fixed. Skin, leather, steel and outlines must stay fixed.</p>
      <div className="proof-comparisons">{[body, bust].map(image => <article key={image.id}><h3>{image.kind === 'body' ? 'Pitch sprite · 64 × 64' : 'Player bust · 160 × 160'}</h3>
        <div className="proof-images">{[[image.sourceUrl, 'Original'], [image.kind === 'body' ? bodyUrl : portraitUrl, 'Recolored'], [maskUrl(image), 'Materials']].map(([url, label]) =>
          <figure key={label}><div className="proof-green"><img alt={`${image.kind} ${label}`} src={url} width={image.width * zoom} height={image.height * zoom}
            style={{ transform: mirror && image.kind === 'body' ? 'scaleX(-1)' : undefined }}/></div><figcaption>{label}</figcaption></figure>)}</div>
      </article>)}</div>
    </section>
    <section><h2>Static pitch placement</h2><p>Uses the accepted sprite resolver and its placement anchors. Full projected-pitch animation review follows palette approval.</p>
      <label>Anchor mode <select aria-label="Anchor mode" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="perspective">Perspective · feet</option><option value="top-down">Top-down · body center</option></select></label>
      <div className="proof-placement" data-anchor={placement.mode}><div className="proof-cross"/>
        <img alt="Anchored recolored player" src={bodyUrl} width={192} height={192} style={{ left: 160 - placement.anchor.x * 3, top: 200 - placement.anchor.y * 3, transform: mirror ? 'scaleX(-1)' : undefined }}/>
      </div>
    </section>
    <section><h2>One bust, shared colors</h2><p>Development-only consumer previews. The builder entry deliberately resolves the same portrait as player cards and choices; production screens remain unchanged.</p>
      <label>Bust design <select aria-label="Bust design" value={bustDesign} onChange={event => setBustDesign(event.target.value)}><option value="lineman">Lineman</option><option value="halfling">Halfling</option><option value="ogre">Ogre</option></select></label>
      <div className="proof-consumers">
        <article><h3>Player card</h3><img src={portraitUrl} alt="Player card bust" width={76} height={76}/><p>{bustDesign} · #1</p><small>Shared portrait preview</small></article>
        <article><h3>Builder entry</h3><div className="proof-entry"><img src={portraitUrl} alt="Builder bust" width={48} height={48}/><span>{bustDesign}</span></div></article>
        <article><h3>Interception choice</h3><div className="proof-entry"><img src={portraitUrl} alt="Interception bust" width={66} height={66}/><span>#1 · {bustDesign}</span></div></article>
        <article><h3>Dugout</h3><img src={portraitUrl} alt="Dugout bust" width={27} height={27}/><p>Reserve · #1</p></article>
      </div>
    </section>
    <section><h2>Human team helmet</h2><p>Existing atlas crop at native size (336 × 317). Primary shell and secondary crown stripe share the player palette; faceguard, rivets, lining and outlines stay fixed.</p>
      <div className="proof-images proof-helmet-images">{[[originalHelmet, 'Original'], [helmetUrl, 'Recolored'], [maskUrl(helmet), 'Materials']].map(([url, label]) =>
        <figure key={label}><div className="proof-green"><img src={url} alt={`helmet ${label}`} width={helmet.width} height={helmet.height}/></div><figcaption>{label}</figcaption></figure>)}</div>
      <div className="proof-team-name"><img src={helmetUrl} alt="Team name helmet" width={28} height={36}/><strong>Human team</strong></div>
      <div className="proof-splash-previews">{(['turnStart', 'turnover', 'touchdown'] as const).map(event => {
        const announcement: MatchAnnouncement = { id: `proof-${event}`, kind: event, team: 'home', turn: 3, half: 1, reason: null, teamName: 'Human team', helmet: 'human' };
        return <div key={event} className="proof-splash-preview play-runtime" data-splash-kind={event}>
          <MatchSplash announcement={announcement} onDismiss={() => {}} hold={false} exiting={false} rate={1}
            icon={<img className="match-art" src={helmetUrl} alt=""/>}/>
        </div>;
      })}</div>
    </section>
    <section><h2>16 colors × 16 shades</h2><p>Each ramp runs from deep shadow to bright highlight. Primary and secondary use the same definitions; all equal-color pairs are valid.</p>
      <div className="proof-ramps">{pack.ramps.map((ramp, index) => <article key={ramp.id}><h3>{index + 1}. {ramp.name}</h3>
        <div className="proof-ramp-strip">{ramp.colors.map((color, shade) => <i key={shade} style={{ background: color }} title={`Shade ${shade + 1}: ${color}`}/>)}</div>
        <details><summary>Exact shade values</summary><ol>{ramp.colors.map((color, shade) => <li key={shade}><code>{color}</code></li>)}</ol></details></article>)}</div>
    </section>
    <section><h2>All 256 combinations</h2><label>Sheet artwork <select aria-label="Sheet artwork" value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="body">Pitch sprite</option><option value="bust">Selected static bust</option><option value="helmet">Team helmet</option></select></label><PaletteSheet pack={pack} kind={kind} design={bustDesign}/></section>
    <footer>Development-only proof. Static preview cache: 32 entries. Animation textures: at most 96 per palette pair, released on palette change. Production integration and all-device certification remain separate.</footer>
  </main>;
}

if (import.meta.env.DEV) {
  const root = createRoot(document.getElementById('app')!);
  fetch('/assets/game/proofs/shared-sprite-v1/pack.json').then(response => {
    if (!response.ok) throw new Error(`Proof pack request failed (${response.status})`);
    return response.json();
  }).then(value => root.render(<Review pack={decodeSpriteProof(value)}/>))
    .catch(error => root.render(<main role="alert">Unable to load sprite proof: {String(error.message)}</main>));
}
