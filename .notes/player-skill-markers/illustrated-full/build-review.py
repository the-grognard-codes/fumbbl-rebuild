"""Build review HTML and inventory from generated assets; no raster editing."""
import base64
from html import escape
import json
from pathlib import Path

out = Path(__file__).resolve().parent
repo = out.parents[2]
rows = json.loads((out / 'markers.json').read_text(encoding='utf-8'))
manifest = json.loads((out.parent / 'manifest.json').read_text(encoding='utf-8'))
assert len(rows) == 108
assert [(r['id'], r['name'], r['category'], r['label']) for r in rows] == [
    (r['id'], r['name'], r['category'], r['shorthand']) for r in manifest['entries']]

for row in rows:
    if row['id'] == 'dodge':
        row['source'] = 'sources/dodge-opaque.png'
        row['opaqueMaster'] = True
    row['png'] = {size: f'png/{size}/{row["id"]}.png' for size in ['master', 'small', 'medium', 'large']}
(out / 'markers.json').write_text(json.dumps(rows, indent=2) + '\n', encoding='utf-8')

source = (out.parent / 'illustrated-round-2/preview.tsx').read_text(encoding='utf-8')
source = source.replace("./samples.json?raw", "./markers.json?raw")
source = source.replace('9 of 108 core identities', '108 of 108 core identities')
source = source.replace('Round 2', 'Full pack')
source = source.replace('Deeper category colors and simpler silhouettes.', 'Complete core inventory with owner-directed revisions.')
(out / 'preview.tsx').write_text(source, encoding='utf-8')
(out / 'preview.html').write_text((out.parent / 'illustrated-round-2/preview.html').read_text(encoding='utf-8').replace('round 2', 'full pack'), encoding='utf-8')

categories = ['GENERAL', 'AGILITY', 'STRENGTH', 'MUTATION', 'PASSING', 'DEVIOUS', 'TRAIT']
font = base64.b64encode((repo / 'browser-client/public/assets/game/ui/fonts/ChakraPetch-Bold.ttf').read_bytes()).decode('ascii')
sections = []
for category in categories:
    entries = sorted((row for row in rows if row['category'] == category), key=lambda row: row['name'].lower())
    cards = []
    for row in entries:
        sizes = ''.join(f'<div><img src="png/{size}/{row["id"]}.png" width="{width}" height="{height}" alt="{escape(row["name"])} {size}"><small>{size[0].upper()} {height}px</small></div>'
                        for size, width, height in [('small', 15, 20), ('medium', 15, 20), ('large', 18, 24)])
        cards.append(f'''<article data-marker-id="{row['id']}" data-search="{escape((row['name'] + ' ' + row['label']).lower())}">
<img class="master" src="png/master/{row['id']}.png" width="54" height="72" alt="{escape(row['name'])} marker">
<h3>{escape(row['name'])}</h3><div class="sizes">{sizes}</div></article>''')
    name = 'Core traits' if category == 'TRAIT' else category.title()
    color = '#B4C7D5' if category == 'TRAIT' else entries[0]['fill']
    sections.append(f'<section data-category="{category}" style="--accent:{color}"><h2>{name} <small>{len(entries)}</small></h2><div class="grid">{"".join(cards)}</div></section>')

focus = []
for ident in ['secret-weapon', 'dodge', 'claws', 'dirty-player', 'put-the-boot-in']:
    row = next(row for row in rows if row['id'] == ident)
    old = out.parent / 'illustrated-round-2/png/master' / f'{ident}.png'
    before = f'<div><img width="54" height="72" alt="Previous {escape(row["name"])}" src="data:image/png;base64,{base64.b64encode(old.read_bytes()).decode("ascii")}"><small>Previous</small></div>' if old.exists() else ''
    focus.append(f'<div class="direction-card"><h3>{escape(row["name"])}</h3><div class="comparison">{before}<div><img src="png/master/{ident}.png" width="54" height="72" alt="Revised {escape(row["name"])}"><small>Current</small></div></div></div>')

html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>108 illustrated skill markers - MUTP review</title><style>
@font-face{{font-family:Chakra;src:url(data:font/ttf;base64,{font});font-weight:700}}*{{box-sizing:border-box}}body{{background:#091726;color:#d9e9f7;font:14px system-ui;margin:0}}main{{max-width:1600px;padding:28px;margin:auto}}h1,h2,h3{{font-family:Chakra,system-ui}}h1{{margin:10px 0;font-size:29px}}header>small{{color:#49dfff;letter-spacing:.12em}}header p{{color:#b4c7d5;line-height:1.6}}a{{color:#49dfff}}nav{{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}}input,select{{font:inherit;padding:10px;background:#102335;color:#d9e9f7;border:1px solid #738c9f;border-radius:5px}}input{{width:320px;max-width:100%}}section{{margin-top:24px}}h2{{font-size:23px;color:var(--accent);border-bottom:2px solid var(--accent);padding-bottom:10px}}h2 small{{font:14px system-ui;color:#b4c7d5;margin-left:8px}}.grid{{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}}article,.direction-card{{background:#102335;border:1px solid #385064;border-radius:7px;padding:16px 8px;text-align:center;min-width:0}}img{{display:block}}.master{{margin:auto}}h3{{font-size:15px;line-height:1.25;margin:10px 0 8px;min-height:38px;display:flex;align-items:center;justify-content:center}}.sizes{{display:flex;align-items:end;justify-content:center;gap:20px;height:46px}}.sizes div,.comparison>div{{display:flex;align-items:center;flex-direction:column;gap:5px}}small{{font-size:11px;color:#b4c7d5}}.direction{{background:#0c1e2e;border:1px solid #385064;padding:16px;margin:20px 0}}.direction h2{{color:#d9e9f7;border:0;margin-top:0}}.focus-grid{{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}}.comparison{{display:flex;justify-content:center;gap:20px}}.direction-card h3{{margin:0 0 12px;min-height:35px}}footer{{margin-top:24px;line-height:1.6;color:#b4c7d5}}[hidden]{{display:none!important}}@media(max-width:1000px){{.grid{{grid-template-columns:repeat(3,minmax(0,1fr))}}.focus-grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}main{{padding:16px}}}}@media(max-width:480px){{.grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}.focus-grid{{grid-template-columns:1fr}}.sizes{{gap:12px}}h1{{font-size:24px}}}}
</style></head><body><main><header><small>MOLES UNDER THE PITCH · COMPLETE ILLUSTRATED PACK</small><h1>All 108 core skills &amp; traits</h1><p>72 category skills + 36 core traits. Deeper category colors, bold original symbols, 20px minimum. Small and Medium start at 20px; Large starts at 24px and all sizes grow with player zoom.<br>Unique star abilities, stat changes, named temporary effects and numeric variants are outside this batch.</p><p><a href="pitch-medium.png">Pitch mockup</a> · <a href="README.md">Review notes and prompts</a></p></header>
<div class="direction" aria-label="Owner art direction"><h2>Requested art direction</h2><div class="focus-grid">{''.join(focus)}</div><p>Secret Weapon: spiked steam roller. Dodge: incoming arrow removed. Claws: blood on the tips. Dirty Player: single stomp retained. Put the Boot In: two coordinated boots.</p></div>
<nav aria-label="Marker filters"><input id="search" type="search" aria-label="Find marker" placeholder="Find a skill, trait or abbreviation"><select id="category" aria-label="Category"><option value="">All categories (108)</option>'''
html += ''.join(f'<option value="{category}">{"Core traits" if category == "TRAIT" else category.title()}</option>' for category in categories)
html += '</select></nav>' + ''.join(sections) + '''<footer>Illustrated PNG exports have transparent clipped corners. Cards show larger art plus actual Small / Medium / Large exports.<br>Six approved round-2 sources are reused unchanged. The text pack is preserved. Production integration remains a separate checkpoint.</footer></main><script>const search=document.querySelector('#search'),category=document.querySelector('#category');function filter(){for(const section of document.querySelectorAll('section[data-category]')){let count=0;for(const card of section.querySelectorAll('article')){card.hidden=!!(category.value&&category.value!==section.dataset.category)||!card.dataset.search.includes(search.value.trim().toLowerCase());if(!card.hidden)count++}section.hidden=!count}}search.addEventListener('input',filter);category.addEventListener('change',filter);</script></body></html>'''
(out / 'review.html').write_text(html, encoding='utf-8')
print('Built the full inventory, searchable gallery, directed-art comparison, and isolated pitch preview.')
