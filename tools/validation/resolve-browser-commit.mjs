import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveBrowserCommit(requested, workflowCommit, mainHistory) {
  const fullSha = /^[0-9a-f]{40}$/;
  if (!fullSha.test(requested ?? '') || !fullSha.test(workflowCommit ?? '') ||
      !Array.isArray(mainHistory) || !mainHistory.length || mainHistory.some(commit => !fullSha.test(commit))) {
    throw new Error('Browser validation requires full commit identities and verified main history');
  }
  if (requested === workflowCommit) return workflowCommit;
  const trusted = mainHistory.find(commit => commit === requested);
  if (!trusted) throw new Error('Browser commit is neither this workflow commit nor an ancestor of main');
  return trusted;
}

export function checkoutBrowserCommit(requested, workflowCommit, mainHistory, checkout) {
  const commit = resolveBrowserCommit(requested, workflowCommit, mainHistory);
  checkout(commit);
  return commit;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--checkout')) {
    throw new Error('Usage: node tools/validation/resolve-browser-commit.mjs [--checkout]');
  }
  const git = args => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
  const workflowCommit = git(['rev-parse', 'HEAD']);
  if (workflowCommit !== process.env.GITHUB_SHA) throw new Error('Resolver checkout differs from workflow commit');
  const history = git(['rev-list', 'refs/remotes/origin/main']).split(/\r?\n/);
  if (!process.env.GITHUB_OUTPUT) throw new Error('Missing workflow output file');
  const commit = process.argv[2] === '--checkout'
    ? checkoutBrowserCommit(process.env.BROWSER_COMMIT, workflowCommit, history,
      trusted => git(['checkout', '--detach', trusted]))
    : resolveBrowserCommit(process.env.BROWSER_COMMIT, workflowCommit, history);
  await appendFile(process.env.GITHUB_OUTPUT, `commit=${commit}\n`);
  console.log(`Resolved trusted browser commit ${commit}`);
}
