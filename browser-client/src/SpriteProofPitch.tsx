import { useEffect, useRef, useState } from 'react';
import { Application, Sprite, Texture } from 'pixi.js';
import { PitchProjection, type PitchEnd, type PitchProjectionMode } from './pitch-projection.ts';
import { resolvePlayerArt, playerArtPlacement, type PlayerFacing } from './player-art.ts';
import { animationFrameAt, findProofClip, type ProofAnimation, type ProofClip, type ProofDesign } from './sprite-proof-animation.ts';
import { recolorProofImage } from './sprite-proof-format.ts';
import type { SetupPlayer } from './setup-protocol.ts';

export type ProofPitchSettings = { design: ProofDesign; clip: ProofClip; direction: string; end: PitchEnd; mode: PitchProjectionMode;
  primary: string; secondary: string; mirror: boolean; elapsed: number; reduced: boolean; crowd: boolean; staticScene: boolean; sameKits: boolean };
export function SpriteProofPitch({ pack, settings }: { pack: ProofAnimation; settings: ProofPitchSettings }) {
  const host = useRef<HTMLDivElement>(null), current = useRef(settings), [error, setError] = useState('');
  current.current = settings;
  const projection = new PitchProjection({ width: 1000, height: 600, end: settings.end, mode: settings.mode, zoom: 0.8 });
  useEffect(() => {
    let stopped = false, request = 0;
    const app = new Application(), textures = new Map<string, Texture>(), fallback = new Map<string, Texture>();
    const sprites = Array.from({ length: 22 }, () => new Sprite());
    let initialized = false, paletteKey = '', textureBytes = 0, lastTime = 0;
    const intervals: number[] = [], costs: number[] = [];
    const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)] ?? 0;
    const destroy = () => {
      if (!initialized) return;
      app.destroy(true, { children: true, texture: false });
      for (const texture of [...textures.values(), ...fallback.values()]) texture.destroy(true);
    };
    const loadFallback = async (url: string) => {
      if (fallback.has(url)) return;
      const image = new Image(); image.src = url; await image.decode();
      if (!stopped) fallback.set(url, Texture.from({ resource: image, scaleMode: 'nearest' }));
    };
    void (async () => {
      await app.init({ width: 1000, height: 600, backgroundAlpha: 0, antialias: false, autoStart: false, preference: 'webgl' });
      initialized = true;
      if (stopped) { destroy(); return; }
      host.current!.appendChild(app.canvas); sprites.forEach(sprite => app.stage.addChild(sprite));
      const urls = new Set<string>();
      for (const design of ['lineman', 'halfling', 'ogre']) for (const end of ['home', 'away'] as const) for (const facing of ['south-east', 'north-east', 'east'] as PlayerFacing[]) {
        const player: SetupPlayer = { id: design, name: design, slot: 1, role: 'home', x: 13, y: 7, state: 'standing', art: { rosterId: 'human', positionId: design } };
        const art = resolvePlayerArt(player, { end, facing }); if (art) urls.add(art.body.url);
      }
      await Promise.all([...urls].map(loadFallback));
      if (stopped) return;
      const render = (now: number) => {
        if (stopped) return;
        const start = performance.now(), s = current.current;
        const key = `${s.primary}:${s.secondary}:${s.sameKits}:${s.staticScene}:${s.crowd}:${s.mode}:${s.end}`;
        if (key !== paletteKey) {
          sprites.forEach(sprite => { sprite.texture = Texture.EMPTY; });
          textures.forEach(texture => texture.destroy(true)); textures.clear(); textureBytes = 0;
          paletteKey = key; intervals.length = 0; costs.length = 0; lastTime = 0;
        }
        const camera = new PitchProjection({ width: 1000, height: 600, end: s.end, mode: s.mode, zoom: 0.8 });
        let fallbacks = 0;
        sprites.forEach((sprite, index) => {
          sprite.visible = s.crowd || index === 0; if (!sprite.visible) return;
          const design = s.crowd ? (['lineman', 'halfling', 'ogre'] as const)[index % 3] : s.design;
          const player: SetupPlayer = { id: String(index), name: design, slot: index + 1, role: index < 11 ? 'home' : 'away',
            x: s.crowd ? 9 + Math.floor(index / 6) * 2 : 13, y: s.crowd ? 2.5 + index % 6 * 2 : 7.5,
            state: 'standing', art: { rosterId: 'human', positionId: design } };
          const facing: PlayerFacing = s.direction === 'front45' ? 'south-east' : s.direction === 'back45' ? 'north-east' : 'east';
          const accepted = resolvePlayerArt(player, { end: s.end, facing })!;
          const clip = s.staticScene ? null : findProofClip(pack, design, s.clip, accepted.body.pose);
          const frame = clip?.frames[animationFrameAt(clip, s.elapsed, s.reduced)];
          const image = frame ? pack.palettePack.images.find(image => image.id === frame.imageId)! : null;
          const primary = pack.palettePack.ramps.find(ramp => ramp.id === (index < 11 || s.sameKits ? s.primary : s.secondary))!;
          const secondary = pack.palettePack.ramps.find(ramp => ramp.id === (index < 11 || s.sameKits ? s.secondary : s.primary))!;
          if (image) {
            const textureKey = `${image.id}:${primary.id}:${secondary.id}`;
            let texture = textures.get(textureKey);
            if (!texture) {
              const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
              canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(recolorProofImage(image, primary, secondary)), image.width, image.height), 0, 0);
              texture = Texture.from({ resource: canvas, scaleMode: 'nearest' }); textures.set(textureKey, texture);
              textureBytes += image.width * image.height * 4;
            }
            sprite.texture = texture;
          } else { sprite.texture = fallback.get(accepted.body.url) ?? Texture.EMPTY; fallbacks++; }
          const record = image && frame ? { ...frame, file: image.sourceUrl, width: image.width, height: image.height } : accepted.body;
          const placement = playerArtPlacement(record, s.mode === 'top-down'), point = camera.project({ x: player.x!, y: player.y! })!;
          const flipped = accepted.body.mirror !== s.mirror;
          sprite.anchor.set(placement.anchor.x / record.width, placement.anchor.y / record.height);
          const scale = point.pixelsPerSquare / 64;
          sprite.scale.set(flipped ? -scale : scale, scale); sprite.position.set(point.x, point.y);
        });
        app.renderer.render(app.stage);
        if (lastTime) intervals.push(now - lastTime); lastTime = now; costs.push(performance.now() - start);
        if (intervals.length > 600) intervals.shift(); if (costs.length > 600) costs.shift();
        host.current!.dataset.metrics = JSON.stringify({ count: s.crowd ? 22 : 1, samples: intervals.length,
          intervalMedianMs: percentile(intervals, 0.5), intervalP95Ms: percentile(intervals, 0.95),
          cpuMedianMs: percentile(costs, 0.5), cpuP95Ms: percentile(costs, 0.95), textures: textures.size,
          textureBytes, fallbackTextures: fallback.size, fallbacks, staticScene: s.staticScene });
        request = requestAnimationFrame(render);
      };
      request = requestAnimationFrame(render);
    })().catch(error => { if (!stopped) setError(String(error)); });
    return () => { stopped = true; cancelAnimationFrame(request); destroy(); };
  }, [pack]);
  return <><div className="proof-pitch-scroll"><div className="proof-pitch-stage">
    <img alt="Existing pitch background" src="/assets/game/pitch/live-pitch.svg" width={960} height={564}
      style={{ position: 'absolute', transformOrigin: '0 0', transform: projection.planeImageTransform([[1 / 36, 0, -1 / 3], [0, 1 / 36, -1 / 3], [0, 0, 1]]) }}/>
    <div ref={host} className="proof-pixi" aria-label="Projected sprite proof"/>
  </div></div>{error && <p role="alert">Pitch proof unavailable: {error}</p>}</>;
}
