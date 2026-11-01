const slider = document.querySelector('#display-scale');
const value = document.querySelector('#scale-value');
const summary = document.querySelector('#scale-summary');
const targets = document.querySelectorAll('[data-css-width][data-css-height]');

function updateScale() {
  const scale = Number(slider.value);
  value.textContent = `${scale}%`;
  slider.setAttribute('aria-valuetext', `${scale} percent`);
  summary.textContent = `At ${scale}% display scaling and 100% browser zoom, allow the physical-pixel content areas below, plus space for browser bars and the taskbar.`;
  for (const target of targets) {
    const width = Math.ceil(Number(target.dataset.cssWidth) * scale / 100);
    const height = Math.ceil(Number(target.dataset.cssHeight) * scale / 100);
    target.querySelector('.physical-size').textContent = `${width} × ${height} physical px`;
  }
}

updateScale();
slider.disabled = false;
slider.addEventListener('input', updateScale);
