// The dispatcher parks idle matches separately from failed and completed matches.
export const idleWorkerExitCode = 75;
export const persistenceUnavailableExitCode = 76;
export const abandonedWorkerExitCode = 77;
export const suspendedWorkerExitCode = 78;

// ChildProcess closes its IPC channel before emitting close. A queued idle message
// can arrive after exit, so take the final revision only when close fires.
export function observeWorkerClose(child, onClose) {
  let idleRevision = -1;
  child.on('message', message => {
    if (message?.type === 'idle' && Number.isSafeInteger(message.revision)) idleRevision = message.revision;
  });
  child.once('close', code => onClose(code, idleRevision));
}
