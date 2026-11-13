"""Package validated normalized assets and metadata, excluding large generation sources."""
import hashlib
import json
from pathlib import Path
import zipfile

out = Path(__file__).resolve().parent
report = json.loads((out / 'capture-report.json').read_text(encoding='utf-8'))
assert report['status'] == 'passed' and report['candidates'] == 108 and report['pngExports'] == 432
index = json.loads((out / 'export-index.json').read_text(encoding='utf-8'))
assert len(index) == 432
records = []
for path in sorted((out / 'prompts').glob('*.json')):
    record = json.loads(path.read_text(encoding='utf-8'))
    record['recordFile'] = 'prompts/' + path.name
    if record.get('source') and (out / record['source']).exists():
        record['sourceSha256'] = hashlib.sha256((out / record['source']).read_bytes()).hexdigest()
    records.append(record)
assert len({record['id'] for record in records}) == 108
(out / 'generation-records.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')

paths = [entry['path'] for entry in index] + ['markers.json', 'export-index.json', 'generation-records.json', 'capture-report.json']
archive = out / 'bb2025-illustrated-markers.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as target:
    for path in paths:
        target.write(out / path, path)
    target.writestr('README.txt', 'BB2025 illustrated core marker pack\n108 identities; 432 normalized PNG exports.\nMasters 216x288; Small/Medium 15x20; Large 18x24.\n20px illustrated floor; rendering still scales with player zoom.\nUse markers.json for identity/category/asset mapping, export-index.json for dimensions/checksums.\nGenerated source images and earlier rounds remain in the repository and are excluded from this runtime-asset ZIP.\nGeneration records retain provenance paths; those original files are outside this archive.\nUnique star abilities, stat changes, named temporary effects and numeric variants are excluded.\nProduction pitch integration remains a separate review checkpoint.\n')
with zipfile.ZipFile(archive) as target:
    assert len(target.namelist()) == 437
    assert target.testzip() is None
    for entry in index:
        assert hashlib.sha256(target.read(entry['path'])).hexdigest() == entry['sha256'], entry['path']

text = out.parent / 'text-full'
for entry in json.loads((text / 'export-index.json').read_text(encoding='utf-8')):
    assert hashlib.sha256((text / entry['path']).read_bytes()).hexdigest() == entry['sha256'], entry['path']
print(f'PASS: archive has 437 files; all 432 image checksums match; 540 approved text exports unchanged. ZIP {archive.stat().st_size:,} bytes.')
