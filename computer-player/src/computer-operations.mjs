const gameplayOperations = new Set(['action', 'choice', 'place', 'confirm', 'route', 'movement']);

/** Only gameplay mutations carry a checkpoint or consume a policy decision. */
export function isComputerGameOperation(operation) {
  return gameplayOperations.has(operation);
}
