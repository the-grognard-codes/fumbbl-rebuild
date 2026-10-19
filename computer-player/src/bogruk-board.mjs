// Estimates rank visible alternatives. The engine remains the authority for every roll and move.
export const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const onPitch = player => Number.isInteger(player?.x) && Number.isInteger(player?.y);
export const hasSkill = (player, name) => (player?.skills ?? []).some(skill => skill.toLowerCase().replace(/[^a-z]/g, '') === name.toLowerCase().replace(/[^a-z]/g, ''));
export const prone = player => /prone|stunned|ground/i.test(player?.state ?? '');
export const standing = player => onPitch(player) && !prone(player) && !/distracted|exhausted|fall|air|dragged|picked up/i.test(`${player.state} ${player.status ?? ''}`);
export const probability = target => Math.max(1 / 6, Math.min(5 / 6, (7 - target) / 6));

export function playerValue(player) {
  return (player?.st ?? 3) * 9 + (player?.ma ?? 6) * 2 + (7 - (player?.ag || 6)) * 4
    + (player?.skills?.length ?? 0) * 4 + (hasSkill(player, 'Block') ? 7 : 0);
}

export class BogrukBoard {
  constructor(state, bounds = {}) {
    this.state = state;
    this.role = state.callerRole;
    this.direction = state.computer.attackDirection;
    this.endX = this.direction > 0 ? 25 : 0;
    this.players = state.players.filter(onPitch);
    this.own = this.players.filter(player => player.role === this.role);
    this.opponents = this.players.filter(player => player.role !== this.role);
    this.occupied = new Map(this.players.map(player => [`${player.x},${player.y}`, player]));
    this.carrier = this.players.find(player => player.id === state.ballState?.carrierPlayerId) ?? null;
    this.ball = state.ballState?.inPlay === false ? null : state.ball;
    this.searches = new Map();
    this.maxExpansions = bounds.maxExpansions ?? 1800;
  }

  marks(at, role, ignoreId = null) {
    return this.players.filter(player => player.role !== role && player.id !== ignoreId && standing(player) && distance(player, at) === 1);
  }

  progress(from, to) { return (to.x - from.x) * this.direction; }

  movement(player) {
    if (player.id === this.state.activePlayerId && this.state.computer.movement) return this.state.computer.movement;
    const normal = Math.max(0, (player.ma ?? 6) - (prone(player) && !hasSkill(player, 'Jump Up') ? 3 : 0));
    return { normalRemaining: normal, remaining: normal + (hasSkill(player, 'Sprint') ? 3 : 2) };
  }

  activationRisk(player) {
    return player.id !== this.state.activePlayerId && (player.skills ?? []).some(skill => /bone.head|really stupid|animal savagery|bloodlust|uncontrollable|unchannelled|take root/i.test(skill)) ? 1 : 0;
  }

  // At most 390 settled squares and a fixed queue-pop ceiling per player, cached per decision.
  paths(player) {
    if (this.searches.has(player.id)) return this.searches.get(player.id);
    const movement = this.movement(player);
    const start = { x: player.x, y: player.y, steps: [], cost: 0, risks: this.activationRisk(player), success: this.activationRisk(player) ? 5 / 6 : 1 };
    const best = new Map([[`${player.x},${player.y}`, start]]);
    const queue = [start];
    let pops = 0;
    while (queue.length && pops++ < this.maxExpansions) {
      queue.sort((a, b) => a.cost - b.cost || a.steps.length - b.steps.length || a.x - b.x || a.y - b.y);
      const from = queue.shift();
      if (best.get(`${from.x},${from.y}`) !== from || from.steps.length >= movement.remaining) continue;
      // Secure the Ball, a pickup failure and some special actions end an activation; never plan through a loose ball.
      if (from.steps.length && !this.carrier && this.ball && distance(from, this.ball) === 0) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const to = { x: from.x + dx, y: from.y + dy };
        if (to.x < 0 || to.x > 25 || to.y < 0 || to.y > 14 || this.occupied.has(`${to.x},${to.y}`)) continue;
        const step = this.stepRisk(player, from, to, from.steps.length + 1, movement.normalRemaining);
        const steps = [...from.steps, { ...to, ...step }];
        const next = { ...to, steps, risks: from.risks + step.risks, success: from.success * step.success, usedSkills: step.usedSkills,
          cost: from.cost + 1 + step.risks * 12 + (1 - step.success) * 20 };
        const key = `${to.x},${to.y}`;
        if (!best.has(key) || next.cost < best.get(key).cost) { best.set(key, next); queue.push(next); }
      }
    }
    this.searches.set(player.id, best);
    return best;
  }

  stepRisk(player, from, to, spent, normal) {
    let targets = [];
    let rerollSkills = [];
    let possible = false;
    const forecast = !spent || spent === 1 ? this.state.movementForecast : null;
    const offered = forecast?.playerId === player.id && forecast.steps.find(step => step.x === to.x && step.y === to.y);
    if (offered) {
      if (offered.dodge) { targets.push(offered.dodge); rerollSkills.push('Dodge'); }
      if (offered.rush) { targets.push(offered.rush); rerollSkills.push('Sure Feet'); }
      for (const check of offered.checks ?? []) if (check.condition === 'entry' && check.target) {
        targets.push(check.target); rerollSkills.push(check.name === 'Pickup' ? 'Sure Hands' : null);
      }
      possible = !!offered.reactions?.length;
    } else {
      if (this.marks(from, player.role).length) {
        const marking = this.marks(to, player.role).length;
        const dodge = Math.max(2, (player.ag || 4) + marking - (hasSkill(player, 'Two Heads') ? 1 : 0));
        targets.push(dodge);
        rerollSkills.push('Dodge');
        possible = this.marks(from, player.role).some(opponent => (opponent.skills ?? []).some(skill => /tentacles|diving tackle|shadowing|prehensile tail/i.test(skill)));
      }
      if (spent > normal) { targets.push(/BLIZZARD/i.test(this.state.weather) ? 3 : 2); rerollSkills.push('Sure Feet'); }
      if (!this.carrier && this.ball && distance(to, this.ball) === 0) {
        targets.push((player.ag || 4) + this.marks(to, player.role).length + (/POURING_RAIN|POURING RAIN/i.test(this.state.weather) ? 1 : 0));
        rerollSkills.push('Sure Hands');
      }
    }
    const used = [...(from.usedSkills ?? [])];
    const success = targets.reduce((value, target, index) => {
      const skill = rerollSkills[index];
      let chance = probability(target);
      const tackle = skill === 'Dodge' && this.marks(from, player.role).some(opponent => hasSkill(opponent, 'Tackle'));
      if (skill && !used.includes(skill) && hasSkill(player, skill) && !tackle) {
        chance = 1 - (1 - chance) ** 2;
        used.push(skill);
      }
      return value * chance;
    }, possible ? 0.75 : 1);
    return { risks: targets.length + Number(possible), success, usedSkills: used };
  }

  blockDice(attacker, defender, at = attacker) {
    const offered = distance(at, attacker) === 0 && this.state.blockPreview?.rolls.find(roll => roll.playerId === attacker.id && roll.targetPlayerId === defender.id);
    if (offered) return offered.dice;
    let attack = attacker.st ?? 3;
    let defend = defender.st ?? 3;
    for (const player of this.players) {
      if (!standing(player) || player.id === attacker.id || player.id === defender.id) continue;
      if (player.role === attacker.role && distance(player, defender) === 1
        && (hasSkill(player, 'Guard') || !this.marks(player, player.role, defender.id).length)) attack++;
      if (player.role === defender.role && distance(player, at) === 1
        && (hasSkill(player, 'Guard') || !this.marks(player, player.role, attacker.id).length)) defend++;
    }
    if (attack === defend) return 1;
    return attack > defend ? (attack > defend * 2 ? 3 : 2) : (defend > attack * 2 ? -3 : -2);
  }

  blockScore(attacker, defender, dice) {
    const ownBlock = hasSkill(attacker, 'Block') && !/distracted/i.test(attacker.status ?? '');
    const defenderDodge = hasSkill(defender, 'Dodge') && !hasSkill(attacker, 'Tackle') && !/distracted/i.test(defender.status ?? '');
    const goodFace = defenderDodge ? 1 / 6 : 2 / 6;
    const knockdown = dice > 0 ? 1 - (1 - goodFace) ** dice : goodFace ** Math.abs(dice);
    const turnover = dice > 0 ? (ownBlock ? 1 / 6 : 2 / 6) ** dice : 1 - (ownBlock ? 5 / 6 : 4 / 6) ** Math.abs(dice);
    return 18 + knockdown * 28 - turnover * 95 + (this.carrier?.id === defender.id ? 48 : 0)
      + (hasSkill(attacker, 'Mighty Blow') ? 4 : 0) + (defender.y === 0 || defender.y === 14 ? 4 : 0);
  }

  foulScore(attacker, defender, at = attacker) {
    const attackAssists = this.own.filter(player => player.id !== attacker.id && standing(player) && distance(player, defender) === 1 && !this.marks(player, player.role, defender.id).length).length;
    const defenceAssists = this.opponents.filter(player => player.id !== defender.id && standing(player) && distance(player, at) === 1 && !this.marks(player, player.role, attacker.id).length).length;
    const armour = (defender.av ?? 9) - attackAssists + defenceAssists - (hasSkill(attacker, 'Dirty Player') ? 1 : 0);
    let breaks = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= armour) breaks++;
    // Removal estimate: armour break * 15/36 KO-or-casualty; sending off roughly one double roll plus a possible second.
    const removal = breaks / 36 * 15 / 36;
    const sendingOff = hasSkill(attacker, 'Sneaky Git') ? breaks / 36 / 6 : 1 / 6 + breaks / 36 * 5 / 36;
    return 8 + removal * playerValue(defender) - sendingOff * playerValue(attacker);
  }

  positionScore(player, node) {
    if (this.carrier?.id === player.id) {
      const advance = this.progress(player, node);
      if (advance <= 0) return -Infinity; // A detour is represented by its eventual forward endpoint, never a retreat objective.
      return 58 + advance * 7 - this.marks(node, player.role).length * 9 - (node.y === 0 || node.y === 14 ? 5 : 0);
    }
    if (this.ball && !this.carrier) {
      const improvement = distance(player, this.ball) - distance(node, this.ball);
      if (distance(node, this.ball) === 0 && !hasSkill(player, 'No Ball')) return 100 + (7 - (player.ag || 4)) * 4;
      return improvement > 0 ? 25 + improvement * 4 - this.marks(node, player.role).length * 2 : -Infinity;
    }
    if (this.carrier?.role !== this.role && this.carrier) {
      const improvement = distance(player, this.carrier) - distance(node, this.carrier);
      const pressure = distance(node, this.carrier) === 1 ? 18 : 0;
      // Get between the carrier and our end zone; this can require moving backward on defence.
      const intercept = (node.x - this.carrier.x) * this.direction < 0 ? 5 : 0;
      return improvement > 0 || pressure ? 25 + improvement * 4 + pressure + intercept : -Infinity;
    }
    if (this.carrier?.role === this.role) {
      const target = { x: Math.max(0, Math.min(25, this.carrier.x + this.direction * 2)), y: this.carrier.y };
      const improvement = distance(player, target) - distance(node, target);
      return improvement > 0 ? 20 + improvement * 3 + Math.min(3, this.progress(player, node)) - this.marks(node, player.role).length * 3 : -Infinity;
    }
    return -Infinity;
  }
}
