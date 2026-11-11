import assert from 'node:assert/strict';
import test from 'node:test';
import { envelopeLocalStack } from './envelope-local-stack.mjs';

function fixture(project = 'ffb-match-review', port = '23317') {
  return { Name: `/${project}-database-1`, State: { Running: true },
    Config: { Labels: { 'com.docker.compose.project': project, 'com.docker.compose.service': 'database' } },
    NetworkSettings: { Ports: { '3306/tcp': [{ HostIp: '127.0.0.1', HostPort: port }] } } };
}

test('default project resolves only its owned loopback database', () => {
  const database = fixture();
  const stack = envelopeLocalStack({}, args => {
    assert.deepEqual(args, ['inspect', '--type', 'container', 'ffb-match-review-database-1']);
    return JSON.stringify([database]);
  });
  assert.equal(stack.project, 'ffb-match-review');
  assert.equal(stack.port, 23317);
  assert.deepEqual(stack.database, database);
});

test('an isolated project discovers its separate port', () => {
  const stack = envelopeLocalStack({ ENVELOPE_DOCKER_PROJECT: 'ffb-pr521-review' }, args => {
    assert.equal(args.at(-1), 'ffb-pr521-review-database-1');
    return JSON.stringify([fixture('ffb-pr521-review', '23318')]);
  });
  assert.equal(stack.project, 'ffb-pr521-review');
  assert.equal(stack.port, 23318);
});

test('invalid project input never invokes Docker', () => {
  assert.throws(() => envelopeLocalStack({ ENVELOPE_DOCKER_PROJECT: '--other' }, () => {
    assert.fail('Docker must not run');
  }), /local FFB Compose project/);
});

test('a stopped or differently owned database is rejected', () => {
  for (const change of [value => { value.State.Running = false; },
    value => { value.Config.Labels['com.docker.compose.project'] = 'ffb-other'; },
    value => { value.Config.Labels['com.docker.compose.service'] = 'server'; },
    value => { value.Name = '/ffb-other-database-1'; }]) {
    const database = fixture(); change(database);
    assert.throws(() => envelopeLocalStack({}, () => JSON.stringify([database])), /ownership/);
  }
});

test('ambiguous, public and invalid database ports are rejected', () => {
  for (const bindings of [[], [{ HostIp: '0.0.0.0', HostPort: '23318' }],
    [{ HostIp: '127.0.0.1', HostPort: '0' }], [{ HostIp: '127.0.0.1', HostPort: '65536' }],
    [{ HostIp: '127.0.0.1', HostPort: 'not-a-port' }],
    [{ HostIp: '127.0.0.1', HostPort: '23317' }, { HostIp: '127.0.0.1', HostPort: '23318' }]]) {
    const database = fixture(); database.NetworkSettings.Ports['3306/tcp'] = bindings;
    assert.throws(() => envelopeLocalStack({}, () => JSON.stringify([database])), /database port/);
  }
});
