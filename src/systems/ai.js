// Поведенческие модули мобов.
// ВАЖНО: runAI сначала пробует chase — иначе wander "съедает" кадр и агро не стартует.

export const BEHAVIORS = {
  wander(e, dt, ctx) {
    if (e.chasing) return false;
    e.wanderTime = (e.wanderTime || 0) - dt;
    if (e.wanderTime <= 0) {
      e.wanderTime = 2 + Math.random() * 3;
      if (Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        e.wanderDir = { x: Math.cos(a), z: Math.sin(a) };
      } else {
        e.wanderDir = { x: 0, z: 0 };
      }
    }
    if (e.wanderDir && (e.wanderDir.x || e.wanderDir.z)) {
      ctx.moveWithSlide(e, e.wanderDir, 0.35, dt);
      e.group.rotation.y = Math.atan2(e.wanderDir.x, e.wanderDir.z);
      e.anim.mode = 'walk';
      e.anim.walkPhase += dt * 5;
    } else {
      e.anim.mode = 'idle';
    }
    return true;
  },

  chase(e, dt, ctx) {
    const player = ctx.getPlayer();
    if (!player || !player.alive) { e.chasing = false; return false; }
    const dist = ctx.distToPlayer(e);
    const aggro = e.type.aiParams?.aggro || 10;

    // Активация агро при входе в радиус
    if (!e.chasing && dist <= aggro) {
      e.chasing = true;
      e.leashFrom = { x: e.group.position.x, z: e.group.position.z };
    }
    if (!e.chasing) return false;

    // Лиш: слишком далеко от точки активации → сброс агро + полное HP
    const LEASH = e.type.aiParams?.leash || 30;
    if (e.leashFrom) {
      const dLeash = Math.hypot(
        e.group.position.x - e.leashFrom.x,
        e.group.position.z - e.leashFrom.z
      );
      if (dLeash > LEASH) {
        e.chasing = false;
        e.target = null;
        e.hp = e.hpMax;
        if (e.barFill) e.barFill.style.width = '100%';
        return false;
      }
    }

    const atkRange = e.type.aiParams?.atkRange || 1.6;
    if (dist <= atkRange * 0.9) return false;

    const dir = ctx.dirToPlayer(e);
    ctx.moveWithSlide(e, dir, e.type.stats.speed, dt);
    e.group.rotation.y = Math.atan2(dir.x, dir.z);
    e.anim.mode = 'walk';
    e.anim.walkPhase += dt * 8;
    return true;
  },

  attack_melee(e, dt, ctx) {
    if (e.atkCd > 0) return false;
    if (!e.chasing) return false;
    const dist = ctx.distToPlayer(e);
    const rng = e.type.aiParams?.atkRange || 1.6;
    if (dist > rng * 1.2) return false;
    e.atkCd = e.type.aiParams?.atkCd || 1.5;
    if (e.parts?.armR) {
      e.parts.armR.rotation.x = -1.9;
      setTimeout(() => { if (e.alive && e.parts?.armR) e.parts.armR.rotation.x = 0; }, 160);
    }
    ctx.damagePlayer(e.type.stats.dmg);
    e.anim.mode = 'attack';
    e.anim.swing = 1;
    return true;
  },

  attack_ranged(e, dt, ctx) {
    if (e.atkCd > 0) return false;
    if (!e.chasing) return false;
    const dist = ctx.distToPlayer(e);
    const rng = e.type.aiParams?.atkRange || 6;
    if (dist > rng) return false;
    e.atkCd = e.type.aiParams?.atkCd || 2.2;
    if (e.parts?.armR) {
      e.parts.armR.rotation.x = -1.4;
      setTimeout(() => { if (e.alive && e.parts?.armR) e.parts.armR.rotation.x = 0; }, 180);
    }
    ctx.spawnEnemyProjectile(e, ctx.dirToPlayer(e));
    e.anim.mode = 'attack';
    e.anim.swing = 1;
    return true;
  },

  phase(e) { e.phaseThrough = true; return false; },

  kite(e, dt, ctx) {
    if (!e.chasing) return false;
    const dist = ctx.distToPlayer(e);
    const pref = e.type.aiParams?.preferredDist || 5;
    if (dist < pref * 0.7) {
      const dir = ctx.dirToPlayer(e);
      ctx.moveWithSlide(e, { x: -dir.x, z: -dir.z }, e.type.stats.speed, dt);
      e.anim.mode = 'walk';
      e.anim.walkPhase += dt * 7;
      return true;
    }
    return false;
  },

  flee(e, dt, ctx) {
    if (!e.chasing) return false;
    const threshold = e.type.aiParams?.fleeAtHp || 0.2;
    if (e.hp / e.hpMax > threshold) return false;
    const dir = ctx.dirToPlayer(e);
    ctx.moveWithSlide(e, { x: -dir.x, z: -dir.z }, e.type.stats.speed * 1.3, dt);
    e.anim.mode = 'walk';
    e.anim.walkPhase += dt * 10;
    return true;
  },

  summon(e, dt, ctx) {
    if (e.atkCd > 0) return false;
    if (!e.chasing) return false;
    if (ctx.aliveEnemiesNear(e, 12) >= 6) return false;
    e.atkCd = e.type.aiParams?.summonCd || 8;
    const count = e.type.aiParams?.summonCount || 2;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      ctx.spawnMob(
        e.type.aiParams?.summonType || 'skeleton',
        e.group.position.x + Math.cos(a) * 2,
        e.group.position.z + Math.sin(a) * 2
      );
    }
    return true;
  }
};

// ВАЖНО: chase идёт первым — иначе wander всегда съедает кадр
export function runAI(e, dt, ctx) {
  const ai = e.type.ai || ['wander'];

  // 1) Агро/лиш/движение к игроку — всегда в первую очередь
  if (ai.includes('chase')) {
    if (BEHAVIORS.chase(e, dt, ctx)) return true;
  }
  // 2) Китование (стрелки) — если в агро
  if (ai.includes('kite')) {
    if (BEHAVIORS.kite(e, dt, ctx)) return true;
  }
  // 3) Атаки — если рядом
  if (ai.includes('attack_melee')) {
    if (BEHAVIORS.attack_melee(e, dt, ctx)) return true;
  }
  if (ai.includes('attack_ranged')) {
    if (BEHAVIORS.attack_ranged(e, dt, ctx)) return true;
  }
  if (ai.includes('summon')) {
    if (BEHAVIORS.summon(e, dt, ctx)) return true;
  }
  if (ai.includes('flee')) {
    if (BEHAVIORS.flee(e, dt, ctx)) return true;
  }
  // 4) Фолбэк — блуждание
  if (ai.includes('wander')) {
    if (BEHAVIORS.wander(e, dt, ctx)) return true;
  }

  e.anim.mode = 'idle';
  return false;
}