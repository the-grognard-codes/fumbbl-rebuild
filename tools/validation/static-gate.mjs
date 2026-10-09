import { fileURLToPath } from 'node:url';
import { assertDependencies, loadBrowserManifest } from './coverage.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
if (!process.env.VALIDATION_NEEDS) throw new Error('Static validation requires VALIDATION_NEEDS');
assertDependencies(JSON.parse(process.env.VALIDATION_NEEDS), ['static-checks']);
await loadBrowserManifest(repository);
console.log('PASS static assets, unit tests, Hosting artifacts, and browser inventory');
