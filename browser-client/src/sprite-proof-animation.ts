import { decodeSpriteProof, type ProofImage, type SpriteProofPack } from './sprite-proof-format.ts';
export type ProofClip = 'idle' | 'move' | 'fall';
export type ProofDesign = 'lineman' | 'halfling' | 'ogre';
type Point = { x: number; y: number };
export type AnimationFrame = { imageId: string; durationMs: number; bounds: Point & { width: number; height: number };
  footAnchor: Point; bodyAnchor: Point; groundAnchor: Point; pose: 'front45' | 'prone' };
export type AnimationClip = { design: ProofDesign; direction: 'front45' | 'back45'; id: ProofClip; loop: boolean; frames: AnimationFrame[] };
export type ProofAnimation = { version: 1; palettePack: SpriteProofPack; clips: AnimationClip[] };
export const proofClips = {
  idle: { durations: [260, 260, 260, 260], loop: true },
  move: { durations: [140, 140, 140, 140], loop: true },
  fall: { durations: [160, 160, 180, 300], loop: false },
};
export function animationFrameAt(clip: { loop: boolean; frames: { durationMs: number }[] }, elapsed: number, reducedMotion = false): number {
  if (reducedMotion) return clip.loop ? 0 : clip.frames.length - 1;
  const total = clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  let time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  if (clip.loop) time %= total;
  for (let frame = 0; frame < clip.frames.length - 1; frame++) {
    if (time < clip.frames[frame].durationMs) return frame;
    time -= clip.frames[frame].durationMs;
  }
  return clip.frames.length - 1;
}
export function proofFrameAt(clip: ProofClip, elapsed: number, reducedMotion = false): number {
  return animationFrameAt({ ...proofClips[clip], frames: proofClips[clip].durations.map(durationMs => ({ durationMs })) }, elapsed, reducedMotion);
}
export function findProofClip(pack: ProofAnimation, design: string, clip: string, direction: string): AnimationClip | null {
  return pack.clips.find(entry => entry.design === design && entry.id === clip && entry.direction === direction) ?? null;
}
export function decodeProofAnimation(value: unknown): ProofAnimation {
  const fail = (): never => { throw Error('Invalid animation proof manifest'); };
  if (!value || typeof value !== 'object') return fail();
  const root = value as Record<string, unknown>;
  if (root.version !== 1 || !Array.isArray(root.clips) || root.clips.length !== 12) return fail();
  const palettePack = decodeSpriteProof(root.palettePack);
  if (palettePack.images.length !== 48) return fail();
  const point = (p: unknown, image: ProofImage): p is Point => {
    const v = p as Point | undefined;
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && v.x >= 0 && v.x <= image.width && v.y >= 0 && v.y <= image.height;
  };
  const keys = new Set<string>(), used = new Set<string>();
  const clips = root.clips.map(raw => {
    if (!raw || typeof raw !== 'object') return fail();
    const clip = raw as AnimationClip;
    const key = `${clip.design}-${clip.direction}-${clip.id}`;
    if (!['lineman', 'halfling', 'ogre'].includes(clip.design) || !['idle', 'move', 'fall'].includes(clip.id)
      || !['front45', ...(clip.design === 'lineman' ? ['back45'] : [])].includes(clip.direction)
      || clip.loop !== (clip.id !== 'fall') || !Array.isArray(clip.frames) || clip.frames.length !== 4 || keys.has(key)) return fail();
    keys.add(key);
    const frames = clip.frames.map((frame, index) => {
      if (!frame || typeof frame !== 'object') return fail();
      const image = palettePack.images.find(image => image.id === frame.imageId), size = clip.design === 'ogre' ? 80 : 64;
      if (!image || image.id !== `${key}-${index}` || image.kind !== 'body' || image.width !== size || image.height !== size
        || used.has(image.id) || !Number.isInteger(frame.durationMs) || frame.durationMs < 16 || frame.durationMs > 5000
        || !point(frame.footAnchor, image) || !point(frame.bodyAnchor, image) || !point(frame.groundAnchor, image)
        || frame.pose !== (clip.id === 'fall' && index === 3 ? 'prone' : 'front45')) return fail();
      const b = frame.bounds;
      if (!b || ![b.x, b.y, b.width, b.height].every(Number.isInteger) || b.x < 1 || b.y < 1 || b.width < 1 || b.height < 1
        || b.x + b.width >= size || b.y + b.height >= size) return fail();
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (image.rgba[(y * size + x) * 4 + 3] > 0 && (x < b.x || x >= b.x + b.width || y < b.y || y >= b.y + b.height)) return fail();
      }
      used.add(image.id);
      return { ...frame, bounds: { ...b }, footAnchor: { ...frame.footAnchor }, bodyAnchor: { ...frame.bodyAnchor }, groundAnchor: { ...frame.groundAnchor } };
    });
    return { design: clip.design, direction: clip.direction, id: clip.id, loop: clip.loop, frames };
  });
  return { version: 1, palettePack, clips };
}
