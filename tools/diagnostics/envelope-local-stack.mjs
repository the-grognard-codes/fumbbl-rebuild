import { execFileSync } from 'node:child_process';

export function envelopeLocalStack(environment = process.env, docker = args =>
  execFileSync('docker', args, { encoding: 'utf8', windowsHide: true }).trim()) {
  const project = environment.ENVELOPE_DOCKER_PROJECT ?? 'ffb-match-review';
  if (!/^ffb-[a-z0-9][a-z0-9_-]{0,58}$/.test(project)) throw Error('An explicit local FFB Compose project is required');
  const databaseName = `${project}-database-1`;
  const [database] = JSON.parse(docker(['inspect', '--type', 'container', databaseName]));
  if (database?.Name !== `/${databaseName}` || !database.State?.Running
    || database.Config?.Labels?.['com.docker.compose.project'] !== project
    || database.Config.Labels['com.docker.compose.service'] !== 'database') throw Error('Wrong local database ownership');
  const bindings = database.NetworkSettings?.Ports?.['3306/tcp'];
  if (bindings?.length !== 1 || bindings[0].HostIp !== '127.0.0.1'
    || !/^[0-9]+$/.test(bindings[0].HostPort)) throw Error('One loopback database port is required');
  const port = Number(bindings[0].HostPort);
  if (port < 1 || port > 65535) throw Error('Invalid local database port');
  return { project, database, port };
}
