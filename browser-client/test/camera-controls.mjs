/** Exercise the public cycle button instead of the former Debug-only selectors. */
export async function setCameraAngle(root, angle) {
  const button = root.getByRole('button', { name: /^Cycle camera angle:/ });
  for (let step = 0; step < 4; step++) {
    const current = Number((await button.innerText()).replace('°', ''));
    if (current === Number(angle)) return;
    const next = ({ 30: 40, 40: 50, 50: 90, 90: 30 })[current];
    await button.click();
    await button.filter({ hasText: `${next}°` }).waitFor();
  }
  throw Error(`Camera did not reach ${angle} degrees`);
}

export async function setCameraMode(root, mode) {
  const button = root.getByRole('button', { name: /^Cycle camera angle:/ });
  const current = Number((await button.innerText()).replace('°', ''));
  if (mode === 'top-down') await setCameraAngle(root, 90);
  else if (current === 90) await setCameraAngle(root, 30);
}
