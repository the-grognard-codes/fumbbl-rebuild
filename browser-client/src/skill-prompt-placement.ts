export type PromptRect = { left: number; top: number; width: number; height: number };
const right = (r: PromptRect) => r.left + r.width;
const bottom = (r: PromptRect) => r.top + r.height;
export function promptOverlap(a: PromptRect, b: PromptRect, gap = 6): boolean {
  return a.left < right(b) + gap && right(a) + gap > b.left && a.top < bottom(b) + gap && bottom(a) + gap > b.top;
}

/** Prefer a nearby clear footprint; never move or zoom the game camera to make space. */
export function placeSkillPrompt(frame: PromptRect, size: { width: number; height: number },
  subject: PromptRect | null, protectedRects: PromptRect[], otherPlayers: PromptRect[] = [], dice: PromptRect[] = []): PromptRect {
  const minX = frame.left + 8, minY = frame.top + 8;
  const maxX = Math.max(minX, right(frame) - size.width - 8), maxY = Math.max(minY, bottom(frame) - size.height - 8);
  const anchor = subject ?? { left: frame.left + frame.width / 2, top: frame.top + frame.height / 2, width: 0, height: 0 };
  const candidates: PromptRect[] = [];
  const add = (left: number, top: number) => candidates.push({ left: Math.max(minX, Math.min(maxX, left)),
    top: Math.max(minY, Math.min(maxY, top)), ...size });
  for (const target of [anchor, ...dice]) {
    for (const x of [target.left - size.width - 14, right(target) + 14, target.left + target.width / 2 - size.width / 2]) {
      for (const y of [target.top - size.height - 14, bottom(target) + 14, target.top + target.height / 2 - size.height / 2]) add(x, y);
    }
  }
  for (let x = minX; x <= maxX; x += 16) for (let y = minY; y <= maxY; y += 16) add(x, y);
  add(maxX, maxY);
  const midX = frame.left + frame.width / 2;
  const diceX = dice.length ? dice.reduce((sum, r) => sum + r.left + r.width / 2, 0) / dice.length : null;
  const score = (r: PromptRect) => (subject && promptOverlap(r, subject) ? 1e9 : 0)
    + protectedRects.filter(p => promptOverlap(r, p)).length * 1e7
    + otherPlayers.filter(p => promptOverlap(r, p, 2)).length * 1e5
    // Visibility wins over affinity; choose the dice's horizontal half when it has clear space.
    + (diceX !== null && (r.left + size.width / 2 < midX) !== (diceX < midX) ? 1e4 : 0)
    + (dice.length ? Math.min(...dice.map(d => Math.hypot(r.left + size.width / 2 - d.left - d.width / 2,
      r.top + size.height / 2 - d.top - d.height / 2))) : 0)
    + Math.hypot(r.left + size.width / 2 - anchor.left - anchor.width / 2, r.top + size.height / 2 - anchor.top - anchor.height / 2);
  return candidates.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best);
}
