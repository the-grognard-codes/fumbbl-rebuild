/* Local UI examples only: no match commands or chat transport. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const atlas = '../../../../assets/game/ui/mvp-art/match-ui-icon-atlas-v1.png';
  const hudArt = '../0003-angled-pitch-v2/art/hud.png';
  // Review-only period changes; authoritative match turns will supply these later.
  const turnPeriod = document.getElementById('turn-period');
  function renderTurns() {
    const start = (Number(turnPeriod.value) - 1) * 8 + 1;
    for (const [team, name, withinPeriod] of [['home','Ironbank Rovers',4], ['away','Cinderclaw Crew',3]]) {
      const track = document.getElementById(`${team}-turns`), current = start + withinPeriod - 1;
      track.replaceChildren();
      track.setAttribute('aria-label', `${name} turns ${start}–${start + 7}, current turn ${current}`);
      for (let turn = start; turn < start + 8; turn++) {
        const slot = document.createElement('li'); slot.textContent = turn;
        if (turn < current) slot.className = 'past';
        if (turn === current) slot.setAttribute('aria-current', 'step');
        track.append(slot);
      }
    }
  }
  turnPeriod.addEventListener('change', renderTurns); renderTurns();
  const bounds = { apothecary: [931,489,360,315], bribe: [504,492,323,315], keg: [81,512,293,306], wizard: [1361,81,383,340] };
  function svgCrop(source, rectangle, width, height) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', rectangle.join(' ')); svg.setAttribute('aria-hidden', 'true');
    const image = document.createElementNS(NS, 'image');
    image.setAttribute('href', source); image.setAttribute('width', width); image.setAttribute('height', height);
    svg.append(image); return svg;
  }
  for (const list of document.querySelectorAll('.resource-list')) {
    const counts = list.dataset.team === 'home' ? [3,1,1,0,0] : [2,0,1,2,1];
    ['reroll','apothecary','bribe','keg','wizard'].forEach((name, i) => {
      if (counts[i] <= 0) return;
      const labels = { reroll: 'Rerolls', apothecary: 'Apothecaries', bribe: 'Bribes', keg: 'Bloodweiser kegs', wizard: 'Wizard' };
      const item = document.createElement('button'); item.type = 'button'; item.className = 'resource';
      item.dataset.resourceLabel = `${labels[name]}: ${counts[i]}`;
      item.setAttribute('aria-label', item.dataset.resourceLabel);
      if (name === 'reroll') {
        const img = document.createElement('img'); img.src = 'art/reroll-v1.png'; img.alt = ''; item.append(img);
      } else item.append(svgCrop(atlas, bounds[name], 1774, 887));
      const count = document.createElement('b'); count.textContent = counts[i]; item.append(count); list.append(item);
    });
  }
  const glyphs = { move: [514,823,37,42], block: [667,823,29,38], blitz: [814,823,36,42], pass: [957,823,35,42], 'end-turn': [1117,824,31,38] };
  const shapes = {
    confirm: '<path d="m5 16 7 7L28 7" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="miter"/>',
    other: '<path d="M6 7h20M6 16h20M6 25h20" stroke="currentColor" stroke-width="3"/><path d="M3 4h5v6H3zM3 13h5v6H3zM3 22h5v6H3z" fill="currentColor"/>',
    'hand-off': '<path d="M2 20h6l5 5h10l7-10-4-2-6 7h-5l-3-4H2z" fill="currentColor"/><ellipse cx="19" cy="10" rx="5" ry="8" transform="rotate(38 19 10)" fill="currentColor"/><path d="m16 8 5 4m-3-6-2 9" stroke="#0b1a2c" stroke-width="1.5"/>',
    foul: '<path d="m6 3 10 1-1 12 12 3 3 7H3v-7l3-3z" fill="currentColor"/><path d="m18 6 3-4 2 5 6-1-3 5" fill="#ffd481"/>'
  };
  for (const button of document.querySelectorAll('[data-glyph]')) {
    const glyph = button.dataset.glyph;
    let art;
    if (glyphs[glyph]) art = svgCrop(hudArt, glyphs[glyph], 1672, 941);
    else {
      art = document.createElementNS(NS, 'svg'); art.setAttribute('viewBox', '0 0 32 32');
      art.setAttribute('aria-hidden', 'true'); art.innerHTML = shapes[glyph];
    }
    button.prepend(art);
  }
  // One inspection handler serves pitch sprites and future dugout entries.
  // Both supply a canonical data-player-id; hovering never changes selection.
  const playerCard = document.getElementById('player-card');
  const resourceTip = document.getElementById('resource-tooltip');
  let inspectedSource, hideTimer, hoverPaused = false, pointerX, pointerY;
  function hideInspection() {
    clearTimeout(hideTimer);
    if (inspectedSource) inspectedSource.removeAttribute('aria-describedby');
    inspectedSource = undefined; playerCard.hidden = true; resourceTip.hidden = true;
  }
  function pauseHover() { hideInspection(); hoverPaused = true; }
  function positionInspection(card, source) {
    const frame = document.getElementById('camera-frame').getBoundingClientRect();
    const scale = frame.width / 1672;
    const anchor = source.getBoundingClientRect(), bounds = card.getBoundingClientRect();
    const width = bounds.width / scale, height = bounds.height / scale;
    let left, top;
    if (card === resourceTip) {
      left = (anchor.left - frame.left) / scale;
      top = (anchor.bottom - frame.top) / scale + 12;
    } else {
      const api = window.pitchReference;
      const selected = api.scene.players.find(p => p.id === api.scene.selected);
      const selectedX = api.project(selected.x + 0.5, selected.y + 0.5).x;
      const dockLeft = selectedX >= 836;
      const dock = document.getElementById(dockLeft ? 'match-chat' : 'event-log').getBoundingClientRect();
      card.dataset.dock = dockLeft ? 'left' : 'right';
      left = dockLeft ? (dock.left - frame.left) / scale : (dock.right - frame.left) / scale - width;
      top = (dock.top - frame.top) / scale - height - 12;
    }
    const minimumTop = Math.max(12, (0 - frame.top) / scale + 12);
    const maximumTop = Math.min(929, (innerHeight - frame.top) / scale - 12) - height;
    card.style.left = Math.max(12, Math.min(1660 - width, left)) + 'px';
    card.style.top = Math.max(minimumTop, Math.min(maximumTop, top)) + 'px';
  }
  function inspect(source) {
    if (document.getElementById('pitch').classList.contains('dragging')) return;
    hideInspection();
    let card;
    if (source.dataset.resourceLabel) {
      resourceTip.textContent = source.dataset.resourceLabel; card = resourceTip;
    } else {
      const scene = window.pitchReferenceScene;
      const player = [...scene.players, ...(scene.dugoutPlayers || [])].find(p => p.id === source.dataset.playerId);
      if (!player) return;
      const name = player.hero ? 'Alden' : `${player.team === 'home' ? 'Ironbank' : 'Cinderclaw'} #${player.number}`;
      const role = player.hero ? 'Blitzer' : player.team === 'home' ? 'Human player' : 'Orc player';
      const skills = player.hero ? 'Block, Tackle' : 'None';
      const status = player.status || 'Standing · Ready';
      const originalArt = document.getElementById('player-card-art');
      const summary = document.getElementById('generic-player-summary');
      // SVG does not reflect the HTMLElement.hidden property to an attribute.
      originalArt.toggleAttribute('hidden', !player.hero); summary.hidden = Boolean(player.hero);
      if (!player.hero) {
        document.getElementById('player-summary-name').textContent = name;
        document.getElementById('player-summary-role').textContent = role;
        const asset = window.pitchReferenceSprites.players.find(a => a.id === `${player.team === 'home' ? 'human' : 'orc'}-front`);
        document.getElementById('player-summary-sprite').src = `../0003-angled-pitch-v2/art/sprites/${asset.file}`;
        const stats = document.getElementById('player-summary-stats'); stats.replaceChildren();
        for (const label of ['MA','ST','AG','AV']) {
          const pair = document.createElement('div'), term = document.createElement('dt'), value = document.createElement('dd');
          term.textContent = label; value.textContent = '—'; pair.append(term, value); stats.append(pair);
        }
      }
      document.getElementById('player-skills').textContent = skills;
      document.getElementById('player-status').textContent = status;
      playerCard.dataset.playerId = player.id;
      playerCard.setAttribute('aria-label', `${name}, ${role}, skills ${skills}, status ${status}`);
      card = playerCard;
    }
    inspectedSource = source; card.hidden = false;
    source.setAttribute('aria-describedby', card.id); positionInspection(card, source);
  }
  function inspectionSource(node) {
    return node instanceof Element && !node.closest('.hover-card') ? node.closest('[data-player-id], [data-resource-label]') : null;
  }
  document.addEventListener('pointerover', event => {
    const source = inspectionSource(event.target);
    if (source && !hoverPaused) inspect(source);
    else if (event.target.closest('.hover-card')) clearTimeout(hideTimer);
  });
  document.addEventListener('pointermove', event => {
    const moved = event.clientX !== pointerX || event.clientY !== pointerY;
    pointerX = event.clientX; pointerY = event.clientY;
    if (hoverPaused && moved) {
      hoverPaused = false;
      const source = inspectionSource(event.target);
      if (source) inspect(source);
    }
  });
  document.addEventListener('pointerout', event => {
    if (!inspectedSource) return;
    const next = event.relatedTarget;
    if (next instanceof Node && (inspectedSource.contains(next) || playerCard.contains(next) || resourceTip.contains(next))) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (document.activeElement !== inspectedSource) hideInspection(); }, 100);
  });
  document.addEventListener('focusin', event => {
    const source = inspectionSource(event.target);
    if (source) inspect(source); else hideInspection();
  });
  document.addEventListener('focusout', event => {
    if (inspectionSource(event.target)) hideInspection();
  });
  document.getElementById('pitch').addEventListener('pointerdown', pauseHover);
  window.addEventListener('pitch-reference-render', pauseHover);
  window.addEventListener('resize', pauseHover);
  const controls = document.getElementById('reference-controls');
  const hideControls = document.getElementById('hide-controls');
  const showControls = document.getElementById('show-controls');
  function setControlsVisible(visible) {
    controls.hidden = !visible; showControls.hidden = visible;
    showControls.setAttribute('aria-expanded', String(visible));
    pauseHover();
  }
  hideControls.addEventListener('click', () => { setControlsVisible(false); showControls.focus(); });
  showControls.addEventListener('click', () => { setControlsVisible(true); hideControls.focus(); });
  if (new URLSearchParams(location.search).get('controls') === '0') setControlsVisible(false);
  const eventMessages = document.getElementById('event-messages');
  for (const button of document.querySelectorAll('[data-log-size]')) button.addEventListener('click', () => {
    const atBottom = eventMessages.scrollTop + eventMessages.clientHeight >= eventMessages.scrollHeight - 1;
    document.getElementById('event-log').dataset.fontSize = button.dataset.logSize;
    for (const other of document.querySelectorAll('[data-log-size]')) other.setAttribute('aria-pressed', String(other === button));
    if (atBottom) eventMessages.scrollTop = eventMessages.scrollHeight;
  });
  const tray = document.getElementById('other-actions');
  const toggle = document.getElementById('toggle-other');
  function closeTray() { tray.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  toggle.addEventListener('click', () => { tray.hidden = !tray.hidden; toggle.setAttribute('aria-expanded', String(!tray.hidden)); });
  document.addEventListener('click', event => { if (!event.target.closest('#action-dock')) closeTray(); });
  function log(message) {
    const list = document.getElementById('event-messages');
    const item = document.createElement('li'); item.className = 'current'; item.textContent = message;
    list.append(item); list.scrollTop = list.scrollHeight;
  }
  const confirm = document.getElementById('confirm-action');
  let proposedAction = 'Move';
  confirm.addEventListener('click', () => {
    if (!proposedAction) return;
    log(`${proposedAction} confirmed for Alden.`);
    proposedAction = undefined; confirm.disabled = true;
    confirm.setAttribute('aria-label', 'Proposed action confirmed'); closeTray();
  });
  for (const button of document.querySelectorAll('[data-action]')) button.addEventListener('click', () => {
    for (const other of document.querySelectorAll('[data-action][aria-pressed]')) other.setAttribute('aria-pressed', String(other === button));
    log(`${button.dataset.action} selected for Alden.`); closeTray();
    proposedAction = button.dataset.action; confirm.disabled = false;
    confirm.setAttribute('aria-label', `Confirm proposed ${proposedAction} for Alden`);
    if (button.closest('#other-actions')) toggle.focus();
  });
  const chat = document.getElementById('match-chat');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-entry');
  function openChat() { form.hidden = false; chat.classList.add('composing'); document.getElementById('chat-hint').hidden = true; input.focus(); }
  function closeChat() { form.hidden = true; chat.classList.remove('composing'); document.getElementById('chat-hint').hidden = false; document.getElementById('stage').focus(); }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      pauseHover();
      if (!form.hidden) { event.preventDefault(); closeChat(); }
      if (!tray.hidden) { closeTray(); toggle.focus(); }
    }
    if (event.key === 'Enter' && form.hidden && !event.target.closest('input,textarea,select,button,a')) { event.preventDefault(); openChat(); }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (text) {
      const item = document.createElement('li'); const author = document.createElement('strong'); author.textContent = 'You: ';
      item.append(author, document.createTextNode(text));
      const messages = document.getElementById('chat-messages'); messages.append(item); messages.scrollTop = messages.scrollHeight;
      input.value = '';
    }
    closeChat();
  });
}());
