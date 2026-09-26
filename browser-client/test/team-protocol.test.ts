import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canPurchaseSkill, decodeTeam, emptyDraft } from '../src/team-protocol.ts';
import type { Catalog, Validation } from '../src/team-protocol.ts';
import { TeamValidationView } from '../src/team-validation-view.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/catalog-v1.json', import.meta.url), 'utf8'));
const result: Validation = { version: 1, type: 'teamValidation', requestId: 'test', catalogVersion: fixture.catalogVersion, ruleset: 'BB2025', draftVersion: 2, valid: true, total: 700000, budget: 1150000, skillPoints: 0, messages: [] };
test('catalog fixture is runtime checked and new drafts retain version and ruleset', () => {
  const catalog = decodeTeam(JSON.stringify(fixture)) as Catalog;
  const draft = emptyDraft(catalog);
  assert.equal(draft.catalogVersion, catalog.catalogVersion); assert.equal(draft.ruleset, 'BB2025');
  assert.equal(catalog.positions.length, 6); assert.equal(catalog.skills.length, 108);
  assert.equal(catalog.skills.filter(skill => skill.selectable).length, 72);
  assert.equal(catalog.skills.filter(skill => !skill.selectable && skill.category === 'T').length, 36);
  assert.deepEqual(catalog.skills.filter(skill => skill.elite).map(skill => skill.id).sort(), ['block', 'dodge', 'guard', 'mighty-blow']);
  for (const category of ['A', 'D', 'G', 'M', 'P', 'S']) assert.equal(catalog.skills.filter(skill => skill.category === category).length, 12);
});
test('Human skill choices respect category access, prerequisites and starting skills', () => {
  const catalog = decodeTeam(JSON.stringify(fixture)) as Catalog;
  const skill = (id: string) => catalog.skills.find(item => item.id === id)!;
  const position = (id: string) => catalog.positions.find(item => item.id === id)!;
  assert.equal(canPurchaseSkill(skill('bullseye'), position('lineman'), false), false);
  assert.equal(canPurchaseSkill(skill('bullseye'), position('ogre'), false), true);
  assert.equal(canPurchaseSkill(skill('lethal-flight'), position('lineman'), false), false);
  assert.equal(canPurchaseSkill(skill('lethal-flight'), position('halfling'), false), true);
  assert.equal(canPurchaseSkill(skill('saboteur'), position('lineman'), false), false);
  assert.equal(canPurchaseSkill(skill('right-stuff'), position('halfling'), false), false);
  assert.equal(canPurchaseSkill(skill('pro'), position('lineman'), true), false);
});
test('unknown schema versions, fields, references and duplicate identifiers fail closed', () => {
  for (const invalid of [
    { ...fixture, version: 2 }, { ...fixture, catalogVersion: 'unknown' }, { ...fixture, ruleset: 'BB2020' },
    { ...fixture, class: 'internal' }, { ...fixture, budget: -1 }, { ...fixture, budget: 1.5 },
    { ...fixture, positions: [] }, { ...fixture, positions: [fixture.positions[0], fixture.positions[0]] },
    { ...fixture, positions: [{ ...fixture.positions[0], baseSkills: [{ id: 'unknown', value: 0 }] }] },
    { ...fixture, positions: [{ ...fixture.positions[0], cost: '50000' }] },
    { ...fixture, resources: [] }, { ...fixture, skills: [fixture.skills[0], fixture.skills[0]] },
    { ...fixture, skills: [{ ...fixture.skills[0], elite: 1 }] },
  ]) assert.throws(() => decodeTeam(JSON.stringify(invalid)));
  assert.throws(() => decodeTeam('{')); assert.throws(() => decodeTeam('x'.repeat(16385)));
});
test('validation decoder rejects contradictory or malformed server messages', () => {
  assert.deepEqual(decodeTeam(JSON.stringify(result)), result);
  for (const invalid of [
    { ...result, valid: 'true' }, { ...result, total: -1 }, { ...result, total: null },
    { ...result, valid: false }, { ...result, messages: [{ code: 'X' }] }, { ...result, type: 'other' },
  ]) assert.throws(() => decodeTeam(JSON.stringify(invalid)));
});
test('DOM renders server cost, rejection messages and unavailable totals accessibly', () => {
  assert.match(renderToStaticMarkup(createElement(TeamValidationView, { result: null })), /Draft has not been validated/);
  let html = renderToStaticMarkup(createElement(TeamValidationView, { result }));
  assert.match(html, /Valid draft/); assert.match(html, /700,000 gold/); assert.match(html, /aria-live="polite"/);
  for (const text of ['<script>bad</script>', '<SCRIPT>bad</SCRIPT>', '<ScRiPt>bad</ScRiPt>']) {
    html = renderToStaticMarkup(createElement(TeamValidationView, { result: { ...result, valid: false, total: null, messages: [{ code: 'QUANTITY', path: 'resources.rerolls', text }] } }));
    assert.match(html, /Draft needs changes/); assert.match(html, /Total unavailable/); assert.match(html, /resources.rerolls/);
    assert.match(html, /&lt;script&gt;/i); assert.doesNotMatch(html, /<script>/i);
  }
});
