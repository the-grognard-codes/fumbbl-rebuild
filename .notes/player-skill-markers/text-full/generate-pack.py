"""Extend the approved round-2 text marker style to the complete core manifest."""
from html import escape
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
samples = [entry['id'] for entry in manifest['entries']]
assert len(samples) == len(set(samples)) == 108
assert all(entry['section'] == 'core' for entry in manifest['entries'])
assert all(entry['shorthand'].isalpha() and entry['shorthand'].isupper()
           and 1 <= len(entry['shorthand']) <= 3 for entry in manifest['entries'])
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
<title id="title">{escape(entry['name'])} ({label}) - {entry['category'].title()}</title>
<path d="M8 1H{width-8}L{width-1} 8V88L{width-8} 95H8L1 88V8Z" fill="#091726"/>
<path d="M9 5H{width-9}L{width-5} 9V87L{width-9} 91H9L5 87V9Z" fill="{pale}"/>
<path d="M10 8H{width-10}L{width-8} 10V86L{width-10} 88H10L8 86V10Z" fill="{fill}"/>
<path d="M12 12H{width-12}M12 12V21" fill="none" stroke="#FFFFFF" stroke-opacity=".46" stroke-width="2"/>
<path d="M12 82H{width-12}" stroke="#091726" stroke-opacity=".35" stroke-width="3"/>
<g fill="{ink}">{''.join(letter_paths)}</g>
</svg>'''
    (icons / f'{ident}.svg').write_text(svg, encoding='utf-8')
    data.append(dict(id=ident, name=entry['name'], label=label, category=entry['category'], fill=fill, masterWidth=width,
                     svg=f'icons/{ident}.svg', png={size: f'png/{size}/{ident}.png' for size in ['master', 'small', 'medium', 'large']}))
(out / 'markers.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
print(f'Generated {len(data)} portrait SVGs with outlined MUTP glyphs; three-letter frames widened to 88x96 with taller outlined lettering.')

categories = ['GENERAL', 'AGILITY', 'STRENGTH', 'MUTATION', 'PASSING', 'DEVIOUS', 'TRAIT']
sections = []
for category in categories:
    cards = []
    entries = sorted((row for row in data if row['category'] == category), key=lambda row: row['name'].lower())
    for row in entries:
        sizes = []
        for size, base in [('small', 16), ('medium', 20), ('large', 24)]:
            height = max(base, 20 if len(row['label']) == 3 else 14)
            width = height * row['masterWidth'] / 96
            sizes.append(f'<div><img src="{row["svg"]}" width="{width}" height="{height}" alt="{row["label"]} {size}"><small>{size[0].upper()}</small></div>')
        cards.append(f'''<article data-marker-id="{row['id']}" data-search="{escape(row['name'].lower() + ' ' + row['label'].lower())}">
<div class="master"><img src="{row['svg']}" width="{row['masterWidth'] * .75}" height="72" alt="{escape(row['name'])} marker"></div>
<h3>{escape(row['name'])}</h3><p class="label">{row['label']}</p><div class="native">{''.join(sizes)}</div></article>''')
    name = 'Core traits' if category == 'TRAIT' else category.title()
    sections.append(f'<section data-category="{category}" style="--accent:{colors[category]["fill"] if category != "TRAIT" else colors[category]["text"]}"><h2>{name} <small>{len(entries)}</small></h2><div class="grid">{"".join(cards)}</div></section>')

page = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>108 core text skill markers - MUTP review</title><style>
@font-face{font-family:Chakra;src:url('../../../browser-client/public/assets/game/ui/fonts/ChakraPetch-Bold.ttf');font-weight:700}
*{box-sizing:border-box}body{margin:0;background:#091726;color:#d9e9f7;font-family:system-ui,sans-serif}main{max-width:1600px;margin:auto;padding:28px}
h1,h2,h3,.label{font-family:Chakra,system-ui,sans-serif}h1{font-size:30px;margin:8px 0}header>small{color:#49dfff;letter-spacing:.12em}header p{color:#b4c7d5;margin:10px 0;max-width:1000px;line-height:1.5}
nav{display:flex;gap:12px;flex-wrap:wrap;padding:16px 0}input,select{font:inherit;background:#102639;color:#d9e9f7;border:1px solid #738c9f;padding:9px;border-radius:5px}input{width:300px;max-width:100%}
section{margin-top:24px;break-inside:avoid}section h2{border-bottom:2px solid var(--accent);padding-bottom:10px;color:var(--accent)}h2 small{font:16px system-ui;color:#b4c7d5;margin-left:8px}
.grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}article{border:1px solid #385064;background:#102335;border-radius:7px;text-align:center;padding:14px 8px 10px;min-width:0}
.master{height:80px;display:flex;align-items:center;justify-content:center}h3{font-size:16px;line-height:1.2;margin:8px 0 3px;min-height:39px;display:flex;align-items:center;justify-content:center}.label{font-size:14px;color:#b4c7d5;margin:0 0 9px}
.native{display:flex;align-items:end;justify-content:center;gap:20px;height:44px}.native div{display:flex;align-items:center;flex-direction:column;gap:4px}small{font-size:11px;color:#b4c7d5}img{display:block}footer{margin-top:28px;color:#b4c7d5;line-height:1.6}[hidden]{display:none!important}
@media(max-width:900px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}main{padding:16px}}@media(max-width:480px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:24px}.native{gap:16px}}
</style></head><body><main><header><small>MOLES UNDER THE PITCH · TEXT PACK REVIEW</small><h1>All 108 core skills &amp; traits</h1>
<p>Approved round-2 styling: MUTP lettering, seven category colors, portrait frames, wider three-letter cards. Every card shows a 72 px specimen plus Small / Medium / Large at a 64 px player square. Three-letter cards retain their 20 px readability floor.</p></header>
<nav aria-label="Marker filters"><input id="search" type="search" aria-label="Find marker" placeholder="Find a skill, trait, or abbreviation"><select id="category" aria-label="Category"><option value="">All categories (108)</option>'''
page += ''.join(f'<option value="{category}">{"Core traits" if category == "TRAIT" else category.title()}</option>' for category in categories)
page += '</select></nav>' + ''.join(sections) + '''<footer>72 category skills + 36 core traits. Text labels contain letters only; full values and targets remain on player cards.<br>Core abilities on star players reuse these markers. Unique star abilities, stat changes, and named temporary effects are excluded.<br>Artwork checkpoint only. Production pitch integration and the illustrated pack remain separate work.</footer></main>
<script>const search=document.querySelector('#search'),category=document.querySelector('#category');function filter(){for(const section of document.querySelectorAll('section')){let visible=0;for(const card of section.querySelectorAll('article')){card.hidden=!!(category.value&&category.value!==section.dataset.category)||!card.dataset.search.includes(search.value.trim().toLowerCase());if(!card.hidden)visible++}section.hidden=!visible}}search.addEventListener('input',filter);category.addEventListener('change',filter);</script></body></html>'''
(out / 'review.html').write_text(page, encoding='utf-8')
