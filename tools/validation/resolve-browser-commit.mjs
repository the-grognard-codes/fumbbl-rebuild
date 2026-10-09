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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const git = args => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
  const workflowCommit = git(['rev-parse', 'HEAD']);
  if (workflowCommit !== process.env.GITHUB_SHA) throw new Error('Resolver checkout differs from workflow commit');
  const history = git(['rev-list', 'refs/remotes/origin/main']).split(/\r?\n/);
  const commit = resolveBrowserCommit(process.env.BROWSER_COMMIT, workflowCommit, history);
  if (!process.env.GITHUB_OUTPUT) throw new Error('Missing workflow output file');
  await appendFile(process.env.GITHUB_OUTPUT, `commit=${commit}\n`);
  console.log(`Resolved trusted browser commit ${commit}`);
}
