import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import os from 'node:os';

export class Engine {
  constructor(config, onSpawn = () => {}, onExit = () => {}) {
    this.pending = new Map(); this.sequence = 0; this.error = null; this.diagnostic = '';
    this.child = spawn(config.java, [`-Xmx${config.heapMiB}m`, '-XX:ActiveProcessorCount=1', '-cp', config.classpath,
      'com.fumbbl.ffb.server.match.TrainingEngineHost', String(config.matchesPerJvm)], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.closed = new Promise(resolve => this.child.once('close', () => { onExit(this.child.pid); resolve(); }));
    this.child.on('spawn', () => {
      onSpawn(this.child.pid);
      try { os.setPriority(this.child.pid, config.priority === 'normal' ? 0 : config.priority === 'low' ? 19 : 10); }
      catch (error) { this.fail(Error(`Cannot apply requested engine priority: ${error.message}`)); }
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      try {
        const message = JSON.parse(line), pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id); clearTimeout(pending.timer); pending.resolve(message.response);
      } catch { this.fail(Error('Invalid engine JSON')); }
    });
    this.child.stderr.on('data', data => { this.diagnostic = `${this.diagnostic}${data}`.slice(-4096); });
    this.child.on('error', error => this.fail(error));
    this.child.stdin.on('error', error => this.fail(error));
    this.child.on('exit', (code, signal) => this.fail(Error(`Engine exited ${code ?? signal}: ${this.diagnostic}`)));
  }
  command(body, timeoutMs) {
    if (this.error) return Promise.reject(this.error);
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { const error = Error('Engine response timed out'); error.code = 'timeout'; this.fail(error); }, Math.max(1, timeoutMs));
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ ...body, id })}\n`);
    });
  }
  fail(error) {
    this.error ??= error;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(this.error); }
    this.pending.clear(); this.child.kill();
  }
  close() { this.fail(Object.assign(Error('Engine stopped'), { code: 'budget_exhausted' })); this.lines.close(); this.child.stdin.destroy(); return this.closed; }
}
