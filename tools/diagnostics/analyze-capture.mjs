import { constants } from 'node:fs';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeCaptures, CaptureAnalysisError, LIMITS, renderMarkdown, serializeReport } from './capture-analysis.mjs';

const USAGE = 'Usage: node tools/diagnostics/analyze-capture.mjs <capture.json> [more.json...] [--output report.md] [--json report.json] [--max-incidents 1..25] [--force]\n';
const failure = message => { throw new CaptureAnalysisError(message); };
const pathKey = path => process.platform === 'win32' ? path.toLowerCase() : path;
const sameFile = (left, right) => left.dev === right.dev && left.ino === right.ino;

export function parseArguments(args) {
  if (!Array.isArray(args) || args.length > 64) failure('Invalid arguments.');
  const result = { inputs: [], maxIncidents: 10, force: false };
  if (args.length === 1 && args[0] === '--help') return { help: true };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--force') {
      if (result.force) failure('Duplicate option.');
      result.force = true;
    } else if (['--output', '--json', '--max-incidents'].includes(argument)) {
      const key = { '--output': 'output', '--json': 'json', '--max-incidents': 'maxIncidents' }[argument];
      if (result[`_${key}`]) failure('Duplicate option.');
      result[`_${key}`] = true;
      const value = args[++index];
      if (typeof value !== 'string' || !value || value.startsWith('--')) failure('Option requires a value.');
      if (key === 'maxIncidents') {
        if (!/^(?:[1-9]|1\d|2[0-5])$/.test(value) || String(Number(value)) !== value) failure('Incident limit must be an integer from 1 to 25.');
        result.maxIncidents = Number(value);
      } else result[key] = value;
    } else if (typeof argument !== 'string' || argument.startsWith('--') || !argument) failure('Unknown option.');
    else result.inputs.push(argument);
  }
  if (!result.inputs.length || result.inputs.length > LIMITS.inputs) failure('Provide from 1 to 16 captures.');
  delete result._output; delete result._json; delete result._maxIncidents;
  return result;
}

async function readInput(path, ordinal) {
  let handle;
  try {
    const canonical = pathKey(await realpath(path));
    handle = await open(path, 'r');
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile()) failure(`Capture ${ordinal} must be a regular file.`);
    if (stat.size > BigInt(LIMITS.inputBytes)) failure(`Capture ${ordinal} exceeds the 2 MiB input limit.`);
    const buffer = Buffer.alloc(LIMITS.inputBytes + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, null);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > LIMITS.inputBytes) failure(`Capture ${ordinal} exceeds the 2 MiB input limit.`);
    return { bytes: buffer.subarray(0, used), canonical, stat };
  } catch (error) {
    if (error instanceof CaptureAnalysisError) throw error;
    failure(`Unable to read capture ${ordinal}.`);
  } finally { await handle?.close().catch(() => {}); }
}

async function outputTarget(path, inputs, force) {
  try {
    const absolute = resolve(path);
    let stat = null, canonical;
    try {
      stat = await lstat(absolute, { bigint: true });
      if (stat.isSymbolicLink()) failure('Report output must not be a symbolic link.');
      if (!stat.isFile()) failure('Report output must be a regular file.');
      canonical = pathKey(await realpath(absolute));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      canonical = pathKey(resolve(await realpath(dirname(absolute)), basename(absolute)));
    }
    if (inputs.some(input => canonical === input.canonical || stat && sameFile(stat, input.stat))) failure('Report output must never overwrite a capture input.');
    if (stat && !force) failure('Report output already exists; use --force to replace a report.');
    return { absolute, canonical, stat, created: false, handle: null };
  } catch (error) {
    if (error instanceof CaptureAnalysisError) throw error;
    failure('Unable to prepare report output.');
  }
}

async function writeOutputs(targets, inputs, force) {
  try {
    for (const target of targets) {
      // Do not truncate on open: compare the actual handle identity against inputs before any write.
      const flags = constants.O_WRONLY | constants.O_CREAT | (force ? (constants.O_NOFOLLOW ?? 0) : constants.O_EXCL);
      target.handle = await open(target.absolute, flags, 0o600);
      target.created = !target.stat;
      const stat = await target.handle.stat({ bigint: true });
      if (!stat.isFile() || inputs.some(input => sameFile(stat, input.stat))) failure('Report output must never overwrite a capture input.');
      if (targets.some(other => other !== target && other.openStat && sameFile(stat, other.openStat))) failure('Report output paths must be distinct.');
      target.openStat = stat;
    }
    for (const target of targets) {
      await target.handle.truncate(0);
      await target.handle.writeFile(target.content, 'utf8');
    }
  } catch (error) {
    for (const target of targets) {
      await target.handle?.close().catch(() => {});
      target.handle = null;
      if (target.created) await unlink(target.absolute).catch(() => {});
    }
    if (error instanceof CaptureAnalysisError) throw error;
    failure('Unable to create or write report output.');
  } finally {
    for (const target of targets) await target.handle?.close().catch(() => {});
  }
}

export async function runCli(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const options = parseArguments(args);
    if (options.help) { stdout.write(USAGE); return 0; }
    const inputs = [];
    for (let index = 0; index < options.inputs.length; index++) inputs.push(await readInput(options.inputs[index], index + 1));
    const report = analyzeCaptures(inputs.map(input => input.bytes), { maxIncidents: options.maxIncidents });
    const markdown = renderMarkdown(report), json = serializeReport(report), targets = [];
    if (options.output) targets.push({ ...await outputTarget(options.output, inputs, options.force), content: markdown });
    if (options.json) targets.push({ ...await outputTarget(options.json, inputs, options.force), content: json });
    if (targets.length === 2 && (targets[0].canonical === targets[1].canonical
      || targets[0].stat && targets[1].stat && sameFile(targets[0].stat, targets[1].stat))) failure('Report output paths must be distinct.');
    await writeOutputs(targets, inputs, options.force);
    if (!options.output) stdout.write(markdown);
    return 0;
  } catch (error) {
    // Never expose built-in filesystem/JSON errors, submitted text, filenames or stack traces.
    stderr.write(`${error instanceof CaptureAnalysisError ? error.message : 'Capture analysis failed.'}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await runCli(process.argv.slice(2));
