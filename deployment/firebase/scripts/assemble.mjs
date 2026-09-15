import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configurationScript, resolveEnvironment } from './environment.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const output = new URL('../hosting/', import.meta.url);
const configuration = resolveEnvironment(process.argv.slice(2), process.env);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const executable = command === 'npm' ? process.execPath : command;
    const parameters = command === 'npm' ? [npmCli, ...args] : args;
    const child = spawn(executable, parameters, { cwd: repository, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)));
  });
}

await run('npm', ['run', 'build', '--prefix', 'site']);
await run('npm', ['run', 'build', '--prefix', 'browser-client']);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('../../../site/dist/', import.meta.url), output, { recursive: true });
await cp(new URL('../../../browser-client/dist/', import.meta.url), new URL('../hosting/play/', import.meta.url), { recursive: true });
await writeFile(new URL('../hosting/firebase-web-config.js', import.meta.url), configurationScript(configuration), 'utf8');
console.log(`Assembled ${configuration.environment} Firebase Hosting artifact at ${fileURLToPath(output)}`);
