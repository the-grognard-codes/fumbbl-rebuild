/* Local dice animation study; deliberately separate from match commands and RNG. */
(function () {
  const { sets, die, labels } = window.mutpDice;
  if (new URLSearchParams(location.search).get('capture') === 'motion') document.body.classList.add('motion-capture');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const runningAnimations = new Set();
  const blockSequence = [6,3,5,2,1,4], d6Sequence = [5,2,6,3,1,4];
  function pair(setId, block = 6, d6 = 5) {
    const group = document.createElement('div'); group.className = 'sample-pair'; group.dataset.set = setId; group.dataset.step = '0';
    for (const [kind,value,label] of [['block',block,'BLOCK'],['d6',d6,'D6']]) {
      const sample = document.createElement('div'); sample.className = 'sample';
      sample.append(die(setId,kind,value)); const caption = document.createElement('span'); caption.textContent = label; sample.append(caption); group.append(sample);
    }
    return group;
  }
  for (const [index,set] of sets.entries()) {
    const card = document.createElement('article'); card.className = 'set'; card.dataset.set = set.id;
    card.innerHTML = `<h2>${index+1} · ${set.name}</h2><p class="subtitle">${set.description}</p>`;
    const samples = pair(set.id);
    const button = document.createElement('button'); button.className = 'roll-button'; button.type = 'button'; button.textContent = 'Preview roll'; button.setAttribute('aria-label', `Preview ${set.name} dice roll`);
    const result = document.createElement('p'); result.className = 'roll-result'; result.setAttribute('role','status'); result.textContent = '440 ms · spin in place · no loop';
    card.append(samples,button,result);
    for (const kind of ['block','d6']) {
      const title = document.createElement('h3'); title.textContent = kind === 'block' ? 'BLOCK · SIX FACES' : 'D6 · SIX FACES';
      const row = document.createElement('div'); row.className = 'face-row'; row.dataset.kind = kind;
      for (let value=1;value<=6;value++) {
        const figure = document.createElement('figure'); figure.className = 'face';
        const caption = document.createElement('figcaption'); caption.textContent = kind === 'block' ? labels[value-1] : value;
        figure.append(die(set.id,kind,value),caption); row.append(figure);
      }
      card.append(title,row);
    }
    const downloads = document.createElement('div'); downloads.className = 'downloads';
    downloads.innerHTML = `<a href="exports/${set.id}-block-atlas.png">Block sprite strip</a><a href="exports/${set.id}-d6-atlas.png">D6 sprite strip</a>`; card.append(downloads);
    button.addEventListener('click', () => roll(samples,button,result));
    document.getElementById('sets').append(card);
    document.getElementById('pitch-set').add(new Option(set.name,set.id));
  }
  async function roll(group, button, status) {
    if (group.dataset.rolling === 'true') return;
    group.dataset.rolling = 'true'; group.setAttribute('aria-busy','true'); button.disabled = true;
    const step = Number(group.dataset.step), finalBlock = blockSequence[step%6], finalD6 = d6Sequence[step%6];
    group.dataset.step = String(step+1);
    const dice = [...group.querySelectorAll('.die')];
    let animationFrame;
    if (!reduceMotion.matches) {
      const animations = dice.map((svg,i) => svg.animate([
        { transform: 'translate(0,0) rotate(0deg)' },
        { transform: `translate(${i?2:-2}px,-3px) rotate(${i?-150:150}deg)`, offset: .4 },
        { transform: `translate(0,-1px) rotate(${i?-300:300}deg)`, offset: .8 },
        { transform: `translate(0,0) rotate(${i?-360:360}deg)` }
      ],{ duration: 440, easing: 'cubic-bezier(.2,.6,.35,1)' }));
      let previousFrame = -1;
      function updateFaces() {
        const frame = Math.floor(Number(animations[0].currentTime || 0) / 55);
        if (frame !== previousFrame) {
          previousFrame = frame;
          for (const [i,svg] of dice.entries()) {
            const value = (frame+i*2)%6+1;
            svg.dataset.displayValue = value;
            const replacement = die(group.dataset.set,svg.dataset.kind,value);
            svg.lastElementChild.replaceWith(replacement.lastElementChild);
          }
        }
        animationFrame = requestAnimationFrame(updateFaces);
      }
      updateFaces();
      animations.forEach(a=>runningAnimations.add(a));
      await Promise.all(animations.map(a=>a.finished.catch(()=>{})));
      animations.forEach(a=>runningAnimations.delete(a));
    }
    cancelAnimationFrame(animationFrame);
    dice.forEach(svg=>svg.replaceWith(die(group.dataset.set,svg.dataset.kind,svg.dataset.kind==='block'?finalBlock:finalD6)));
    group.dataset.rolling = 'false'; group.removeAttribute('aria-busy'); button.disabled = false;
    if (status) status.textContent = `${labels[finalBlock-1]} · d6 ${finalD6}${reduceMotion.matches?' · reduced motion':''}`;
  }
  const rollAll = document.getElementById('roll-all');
  rollAll.addEventListener('click', async () => {
    rollAll.disabled = true;
    await Promise.all([...document.querySelectorAll('.set')].map(card=>roll(card.querySelector('.sample-pair'),card.querySelector('.roll-button'),card.querySelector('.roll-result'))));
    rollAll.disabled = false;
  });
  document.getElementById('preview-size').addEventListener('change', event => document.documentElement.style.setProperty('--preview-size',event.target.value+'px'));
  const pitchDice = document.getElementById('pitch-dice');
  const pitchButton = document.getElementById('roll-pitch');
  function showPitchSet() { pitchDice.replaceChildren(pair(document.getElementById('pitch-set').value)); }
  document.getElementById('pitch-set').addEventListener('change', showPitchSet);
  pitchButton.addEventListener('click',()=>roll(pitchDice.firstElementChild,pitchButton));
  reduceMotion.addEventListener('change',()=>{if(reduceMotion.matches)runningAnimations.forEach(a=>a.cancel());});
  showPitchSet();
  window.diceReviewReady = Promise.all([document.fonts.ready, ...sets.map(set=>{
    const image = new Image(); image.src = `art/${set.id}-v1.png`; return image.decode();
  }), ...[...document.images].map(image=>image.decode())]);
}());
