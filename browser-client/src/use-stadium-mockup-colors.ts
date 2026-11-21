import { useEffect, useState } from 'react';
import { recolorTeamImage } from './team-color-art.ts';
import type { TeamColors } from './team-colors.ts';
import { mockupAsset } from './stadium-mockup-assets.ts';

export function useStadiumMockupColors(file: string, home: TeamColors, away: TeamColors, onError: () => void) {
  const key = `${file}:${home.primary}:${home.secondary}:${away.primary}:${away.secondary}`;
  const [sources, setSources] = useState<{ home: string; away: string; key: string } | null>(null);
  useEffect(() => {
    let disposed = false;
    const urls: string[] = [], abort = new AbortController();
    (async () => {
      const response = await fetch(mockupAsset(file + '-indices.bin.gz'), { signal: abort.signal });
      if (!response.ok) throw Error('Missing cloth indices');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const indices = bytes[0] === 31 && bytes[1] === 139 ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()) : bytes;
      const artResponse = await fetch(mockupAsset(file + '.png'), { signal: abort.signal });
      if (!artResponse.ok) throw Error('Missing colour source');
      const bitmap = await createImageBitmap(await artResponse.blob());
      try {
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
        const rgba = new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data);
        if (indices.length !== bitmap.width * bitmap.height || indices.some(index => index > 32)) throw Error('Invalid material indices');
        const result = { home: '', away: '' };
        for (const team of ['home', 'away'] as const) {
          context.putImageData(new ImageData(recolorTeamImage({ rgba, indices }, team === 'home' ? home : away), canvas.width, canvas.height), 0, 0);
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('Colour export failed'))));
          const url = URL.createObjectURL(blob); urls.push(url); result[team] = url;
        }
        if (!disposed) setSources({ ...result, key }); else urls.forEach(URL.revokeObjectURL);
      } finally { bitmap.close(); }
    })().catch(error => { urls.forEach(URL.revokeObjectURL); if (!disposed && error.name !== 'AbortError') onError(); });
    return () => { disposed = true; abort.abort(); };
  }, [file, home.primary, home.secondary, away.primary, away.secondary]);
  useEffect(() => () => { if (sources) [sources.home, sources.away].forEach(URL.revokeObjectURL); }, [sources]);
  return sources?.key === key ? sources : null;
}
