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
           'safe-pair-of-hands', 'animosity', 'really-stupid', 'always-hungry',
           'animal-savagery', 'unchannelled-fury', 'secret-weapon']
colors = {p['category'].upper(): p for p in manifest['palette']}
colors['TRAIT'] = colors['CORE TRAITS']
icons = out / 'icons'
icons.mkdir(exist_ok=True)
data = []
for ident in samples:
    entry = next(r for r in manifest['entries'] if r['id'] == ident)
    label = entry['shorthand']
    width = 88 if len(label) == 3 else 72
    ink = colors[entry['category']]['text']
    fill = colors[entry['category']]['fill']
    font_size = {1: 47, 2: 38, 3: 36}[len(label)]
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
    horizontal_scale = min(scale, (width - 22) / (right - left))
    tx = width / 2 - (left + right) * horizontal_scale / 2
    ty = 49 + (bottom + top) * scale / 2
    letter_paths = []
    for name, position in paths:
        pen = SVGPathPen(glyphs)
        transformed = TransformPen(pen, (horizontal_scale, 0, 0, -scale, tx + position * horizontal_scale, ty))
        glyphs[name].draw(transformed)
        letter_paths.append(f'<path d="{pen.getCommands()}"/>')
    pale = '#B4C7D5' if entry['category'] == 'TRAIT' else '#D9E9F7'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="96" viewBox="0 0 {width} 96" role="img" aria-labelledby="title">
<title id="title">{entry['name']} ({label}) - {entry['category'].title()}</title>
<path d="M8 1H{width-8}L{width-1} 8V88L{width-8} 95H8L1 88V8Z" fill="#091726"/>
<path d="M9 5H{width-9}L{width-5} 9V87L{width-9} 91H9L5 87V9Z" fill="{pale}"/>
<path d="M10 8H{width-10}L{width-8} 10V86L{width-10} 88H10L8 86V10Z" fill="{fill}"/>
<path d="M12 12H{width-12}M12 12V21" fill="none" stroke="#FFFFFF" stroke-opacity=".46" stroke-width="2"/>
<path d="M12 82H{width-12}" stroke="#091726" stroke-opacity=".35" stroke-width="3"/>
<g fill="{ink}">{''.join(letter_paths)}</g>
</svg>'''
    (icons / f'{ident}.svg').write_text(svg, encoding='utf-8')
    data.append(dict(id=ident, name=entry['name'], label=label, category=entry['category'], fill=fill, masterWidth=width))
(out / 'samples.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
print(f'Generated {len(data)} portrait SVGs with outlined MUTP glyphs; three-letter frames widened to 88x96 with taller outlined lettering.')
