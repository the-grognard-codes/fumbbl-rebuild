import type { SkillMarkerPreferences } from './skill-marker-preferences.ts';
import type { SetupPlayer, SetupState } from './setup-protocol.ts';
import { skillMarkerCatalog } from './generated-skill-markers.ts';

export type MarkerSize = 'small' | 'medium' | 'large';
export type MarkerStyle = 'text' | 'illustrated';
const heights = { small: 16, medium: 20, large: 24 };
const bigGuyNegatraits = new Set([
  'bone-head', 'really-stupid', 'always-hungry', 'animal-savagery', 'unchannelled-fury', 'secret-weapon',
]);

export function isSkillMarkerVisible(marker: { id: string; category: string }, preferences: Pick<SkillMarkerPreferences, 'showTraits' | 'showBigGuyNegatraits'>): boolean {
  return marker.category !== 'TRAIT' || preferences.showTraits
    && (preferences.showBigGuyNegatraits || !bigGuyNegatraits.has(marker.id));
}

const catalog = new Map<string, typeof skillMarkerCatalog[number]>(skillMarkerCatalog.map(marker => [marker.id, marker]));

/** Team gates apply first. Traits ignore origin; all other core skills use their server origin. */
export function playerSkillMarkers(player: SetupPlayer, caller: SetupState['callerRole'], preferences: SkillMarkerPreferences, replay = false) {
  const own = replay || caller === 'spectator' ? player.role === 'home' : player.role === caller;
  if (!(own ? preferences.showOwn : preferences.showOpponent)) return [];
  const seen = new Set<string>();
  return (player.skillMarkers?.entries ?? []).flatMap(entry => {
    const marker = catalog.get(entry.id);
    if (!marker || seen.has(marker.id) || marker.category !== entry.category || !isSkillMarkerVisible(marker, preferences)
      || marker.category !== 'TRAIT' && !(entry.origin === 'base' ? preferences.showBase : preferences.showAcquired)) return [];
    seen.add(marker.id); return [marker];
  }).sort((first, second) => {
    const priority = (marker: typeof first) => marker.negative || bigGuyNegatraits.has(marker.id)
      || marker.id === 'animosity' || marker.id === 'loner' ? 0 : marker.priority ? 1 : 2;
    return priority(first) - priority(second) || first.id.localeCompare(second.id);
  });
}

export function skillMarkerUrl(id: string, style: MarkerStyle): string {
  return `${import.meta.env?.BASE_URL ?? '/'}assets/game/ui/player-skill-markers-v1/${style}/${id}.${style === 'text' ? 'svg' : 'png'}`;
}

/** The selected size is relative to a 64px pitch square, with a legibility floor. */
export function markerStripMetrics(labels: string[], size: MarkerSize, squarePixels = 64, style: MarkerStyle = 'text') {
  const scale = Number.isFinite(squarePixels) ? Math.max(0, Math.min(2.5, squarePixels / 64)) : 1;
  const minimum = style === 'illustrated' || labels.some(label => label.length === 3) ? 20 : 14;
  const height = Math.max(minimum, heights[size] * scale);
  return { height, gap: Math.max(2, height / 12),
    widths: labels.map(label => height * (style === 'text' && label.length === 3 ? 88 / 96 : 72 / 96)) };
}

/** Prefer three badges; trade capacity for readable symbols on crowded projected squares. */
export function markerStripLayout(labels: string[], size: MarkerSize, squarePixels: number, style: MarkerStyle) {
  let count = Math.min(3, labels.length);
  const measure = () => {
    const metrics = markerStripMetrics(labels.slice(0, count), size, squarePixels, style);
    const remaining = labels.length - count;
    const overflowWidth = remaining ? Math.ceil(8 + (`+${remaining}`).length * metrics.height * .55 * .7) : 0;
    const width = metrics.widths.reduce((sum, width) => sum + width, 0)
      + metrics.gap * Math.max(0, count - 1 + (remaining ? 1 : 0)) + overflowWidth;
    return { ...metrics, count, remaining, width, overflowWidth };
  };
  let layout = measure();
  while (count > 1 && layout.width > Math.max(0, squarePixels - 4)) { count--; layout = measure(); }
  return layout;
}
