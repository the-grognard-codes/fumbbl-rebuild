"""Reproduce text-only review assets from the MUTP font; no generated bitmap art."""
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(tempfile.gettempdir()) / 'fumbbl-skill-marker-review/python'))
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

out = Path(__file__).resolve().parent
root = out.parents[2]
manifest = json.loads((out.parent / 'manifest.json').read_text(encoding='utf-8'))
font = TTFont(root / 'browser-client/public/assets/game/ui/fonts/ChakraPetch-Bold.ttf')
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
units = font['head'].unitsPerEm
samples = ['block', 'dodge', 'tackle', 'guard', 'mighty-blow', 'claws', 'pass',
           'dirty-player', 'loner', 'bone-head', 'hail-mary-pass', 'very-long-legs',
           'safe-pair-of-hands', 'animosity']
colors = {p['category'].upper(): p for p in manifest['palette']}
colors['TRAIT'] = colors['CORE TRAITS']
icons = out / 'icons'
icons.mkdir(exist_ok=True)
data = []
for ident in samples:
    entry = next(r for r in manifest['entries'] if r['id'] == ident)
    label = entry['shorthand']
    ink = colors[entry['category']]['text']
    fill = colors[entry['category']]['fill']
    font_size = {1: 47, 2: 38, 3: 28}[len(label)]
    scale = font_size / units
    tracking = 1.3 / scale
    advance = 0
    paths = []
    whole = []
    for letter in label:
        name = cmap[ord(letter)]
        bounds = BoundsPen(glyphs)
        glyphs[name].draw(bounds)
        x0, y0, x1, y1 = bounds.bounds
        whole.append((advance + x0, y0, advance + x1, y1))
        paths.append((name, advance))
        advance += font['hmtx'][name][0] + tracking
    left = min(b[0] for b in whole)
    right = max(b[2] for b in whole)
    bottom = min(b[1] for b in whole)
    top = max(b[3] for b in whole)
    scale = min(scale, 50 / (right - left))
    tx = 36 - (left + right) * scale / 2
    ty = 49 + (bottom + top) * scale / 2
    letter_paths = []
    for name, position in paths:
        pen = SVGPathPen(glyphs)
        transformed = TransformPen(pen, (scale, 0, 0, -scale, tx + position * scale, ty))
        glyphs[name].draw(transformed)
        letter_paths.append(f'<path d="{pen.getCommands()}"/>')
    pale = '#B4C7D5' if entry['category'] == 'TRAIT' else '#D9E9F7'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="72" height="96" viewBox="0 0 72 96" role="img" aria-labelledby="title">
<title id="title">{entry['name']} ({label}) — {entry['category'].title()}</title>
<path d="M8 1H64L71 8V88L64 95H8L1 88V8Z" fill="#091726"/>
<path d="M9 5H63L67 9V87L63 91H9L5 87V9Z" fill="{pale}"/>
<path d="M10 8H62L64 10V86L62 88H10L8 86V10Z" fill="{fill}"/>
<path d="M12 12H60M12 12V21" fill="none" stroke="#FFFFFF" stroke-opacity=".46" stroke-width="2"/>
<path d="M12 82H60" stroke="#091726" stroke-opacity=".35" stroke-width="3"/>
<g fill="{ink}">{''.join(letter_paths)}</g>
</svg>'''
    (icons / f'{ident}.svg').write_text(svg, encoding='utf-8')
    data.append(dict(id=ident, name=entry['name'], label=label, category=entry['category'], fill=fill))
(out / 'samples.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
print(f'Generated {len(data)} portrait SVGs with outlined MUTP glyphs; sizes 12x16, 15x20, 18x24.')
