// Менеджер спавна. Держит пул мобов, обновляет AI, спавнит по зонам.

import * as THREE from 'three';
import { world } from '../core/scene.js';
import { spawnMob } from '../entities/mob.js';
import { runAI } from './ai.js';
import { animateHumanoid } from '../entities/humanoid.js';
import { state } from '../core/state.js';
import { combat, damagePlayer, spawnEnemyProjectile } from './combat.js';
import { rnd, clamp } from '../core/assets.js';

export const spawner = {
  mobs: [],
  mobMeshes: [],
  respawnQueue: [],
  RESPAWN_MS: 5 * 60 * 1000,
  collidesAt: null,
  isWater: null,
  isInVillage: null,
  groundHeight: null,
  isOnBridge: null,
  getAllMobs: () => spawner.mobs,
  onEnemyBarUpdate: null,
};

export function spawnMobByDef(defId, x, z) {
  const def = window.registry.mobs[defId];
  if (!def) return null;

  if (spawner.isWater?.(x, z) && !spawner.isOnBridge?.(x, z)) return null;
  if (spawner.isInVillage?.(x, z)) return null;

  const e = spawnMob(defId, def, x, z, {
    groundHeight: spawner.groundHeight,
    items: window.registry.items,
  });

  const bar = document.createElement('div');
  bar.className = 'ebar';
  if (def.boss) { bar.style.width = '78px'; bar.style.height = '9px'; }
  bar.innerHTML = `<div class="ename">${def.name} [ур.${def.stats.lvl || 1}]</div><div class="efill"></div>`;
  const ui = document.getElementById('world-ui');
  if (ui) ui.appendChild(bar);
  e.bar = bar;
  e.barFill = bar.querySelector('.efill');

  e.chasing = false;
  e.leashFrom = null;

  e.group.traverse(o => {
    if (o.isMesh && !o.userData.isOutline) {
      o.userData.enemy = e;
      spawner.mobMeshes.push(o);
    }
  });

  spawner.mobs.push(e);
  return e;
}

// === Рандом по биому ===
export function spawnRandomMob(x, z) {
  const L = state.level;
  // Лесная зона — тут волки, медведи, гоблины, зомби, скелеты
  const pool = ['wolf', 'wolf', 'bear', 'goblin_scout', 'zombie', 'skeleton'];
  if (L >= 8) pool.push('bear');
  const id = pool[Math.floor(Math.random() * pool.length)];
  return spawnMobByDef(id, x, z);
}

// === Спавн из зоны с плотностью ===
export function spawnFromZone(zone, density = 1) {
  if (!zone.spawns || !zone.spawns.length) return;
  for (const s of zone.spawns) {
    const count = Math.round((s.weight || 1) * density);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(zone.radius * 0.25, zone.radius * 0.92);
      const x = zone.center.x + Math.cos(a) * r;
      const z = zone.center.z + Math.sin(a) * r;
      if (spawner.collidesAt?.(x, z, 0.7)) continue;
      if (spawner.isWater?.(x, z) && !spawner.isOnBridge?.(x, z)) continue;
      spawnMobByDef(s.mob, x, z);
    }
  }
}

export function updateMobs(dt, playerPos) {
  const ctx = makeAIContext(playerPos);

  for (let i = spawner.mobs.length - 1; i >= 0; i--) {
    const e = spawner.mobs[i];
    if (!e.alive) {
      spawner.mobs.splice(i, 1);
      for (let k = spawner.mobMeshes.length - 1; k >= 0; k--) {
        if (spawner.mobMeshes[k].userData.enemy === e) spawner.mobMeshes.splice(k, 1);
      }
      continue;
    }

    // Отсев по дальности от игрока — оптимизация
    const dx = e.group.position.x - playerPos.x;
    const dz = e.group.position.z - playerPos.z;
    const distSq = dx * dx + dz * dz;
    // Если моб далеко и не в агро — обновляем раз в 4 кадра
    if (distSq > 60 * 60 && !e.chasing) {
      if (!e._slowSkip) e._slowSkip = 0;
      e._slowSkip = (e._slowSkip + 1) % 4;
      if (e._slowSkip !== 0) continue;
    }

    if (spawner.collidesAt?.(e.group.position.x, e.group.position.z, 0.5)) {
      const free = findFreeSpot(e.group.position.x, e.group.position.z);
      e.group.position.x = free.x;
      e.group.position.z = free.z;
    }

    const ey = spawner.groundHeight?.(e.group.position.x, e.group.position.z) ?? 0;
    if (e.type.kind === 'ghost') e.group.position.y = ey + 0.7;
    else e.group.position.y += (ey - e.group.position.y) * Math.min(1, dt * 10);

    if (e.frozen && e.frozen.timeLeft > 0) {
      e.frozen.timeLeft -= dt;
      if (e.frozen.timeLeft <= 0) e.frozen = null;
      else {
        e.anim.mode = 'idle';
        e.anim.t += dt;
        animateHumanoid(e.group, e.anim, dt);
        for (const m of e.mats) m.emissive.setRGB(0.05, 0.15, 0.35);
        updateHealthBar(e, playerPos);
        continue;
      }
    }

    e.atkCd -= dt;
    e.anim.t += dt;
    runAI(e, dt, ctx);
    animateHumanoid(e.group, e.anim, dt);

    if (!e.chasing) {
      const distHome = Math.hypot(
        e.group.position.x - e.spawnX,
        e.group.position.z - e.spawnZ
      );
      if (distHome > 50 && e.hp < e.hpMax) {
        e.hp = e.hpMax;
        if (e.barFill) e.barFill.style.width = '100%';
      }
    }

    if (e.hurt > 0 || e.hurtPrev > 0) {
      e.hurt -= dt * 4;
      if (e.hurt < 0) e.hurt = 0;
      for (const m of e.mats) m.emissive.setRGB(e.hurt * 0.5, 0, 0);
      e.hurtPrev = e.hurt;
    }

    updateHealthBar(e, playerPos);
  }

  const now = performance.now();
  for (let i = spawner.respawnQueue.length - 1; i >= 0; i--) {
    const rq = spawner.respawnQueue[i];
    if (now >= rq.time) {
      spawnMobByDef(rq.key, rq.x, rq.z);
      spawner.respawnQueue.splice(i, 1);
    }
  }
}

function updateHealthBar(e, playerPos) {
  if (!e.bar) return;
  const d = e.group.position.distanceTo(playerPos);
  if (d < 45) {
    const wp = e.group.position.clone();
    wp.y += (e.type.boss ? 5.2 : 3.2) * (e.type.scale ?? 1);
    const v = wp.project(world.camera);
    if (v.z < 1) {
      e.bar.style.display = 'block';
      e.bar.style.transform =
        `translate(-50%,-50%) translate(${(v.x * 0.5 + 0.5) * innerWidth}px,${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
      e.barFill.style.width = (e.hp / e.hpMax * 100) + '%';
    } else e.bar.style.display = 'none';
  } else e.bar.style.display = 'none';
}

function findFreeSpot(x, z) {
  if (!spawner.collidesAt?.(x, z, 0.7)) return { x, z };
  for (let ring = 1; ring <= 4; ring++) {
    for (let a = 0; a < 8; a++) {
      const ang = a / 8 * Math.PI * 2;
      const nx = x + Math.cos(ang) * ring;
      const nz = z + Math.sin(ang) * ring;
      if (!spawner.collidesAt?.(nx, nz, 0.7) && !spawner.isWater?.(nx, nz)) {
        return { x: nx, z: nz };
      }
    }
  }
  return { x, z };
}

function makeAIContext(playerPos) {
  return {
    getPlayer: () => ({ pos: playerPos, alive: state.alive }),
    distToPlayer: (e) => e.group.position.distanceTo(playerPos),
    dirToPlayer: (e) => {
      const dir = playerPos.clone().sub(e.group.position);
      dir.y = 0;
      return dir.normalize();
    },
    moveWithSlide: (e, dir, speed, dt) => moveWithSlide(e, dir, speed, dt),
    damagePlayer: (dmg) => {
      if (window.combat && window.combat.damagePlayer) {
        window.combat.damagePlayer(dmg);
      } else {
        damagePlayer(dmg);
      }
    },
    spawnEnemyProjectile: (e, dir) => {
      if (window.combat && window.combat.spawnEnemyProjectile) {
        window.combat.spawnEnemyProjectile(e, dir);
      } else {
        spawnEnemyProjectile(e, dir);
      }
    },
    aliveEnemiesNear: (e, radius) => {
      let n = 0;
      for (const m of spawner.mobs) {
        if (m.alive && m.group.position.distanceTo(e.group.position) < radius) n++;
      }
      return n;
    },
    spawnMob: (defId, x, z) => spawnMobByDef(defId, x, z),
  };
}

function moveWithSlide(e, dir, speed, dt) {
  if (dir.x === 0 && dir.z === 0) return false;
  const len = Math.hypot(dir.x, dir.z);
  if (len < 0.001) return false;
  const nx = dir.x / len, nz = dir.z / len;

  const tryX = e.group.position.x + nx * speed * dt;
  const tryZ = e.group.position.z + nz * speed * dt;

  const blockFull = isBlocked(e, tryX, tryZ);
  if (!blockFull) {
    e.group.position.x = tryX;
    e.group.position.z = tryZ;
    return true;
  }

  const blockX = isBlocked(e, tryX, e.group.position.z);
  if (!blockX) { e.group.position.x = tryX; return true; }

  const blockZ = isBlocked(e, e.group.position.x, tryZ);
  if (!blockZ) { e.group.position.z = tryZ; return true; }

  const px = -nz, pz = nx;
  for (const s of [1, -1]) {
    const sx = e.group.position.x + s * px * speed * 0.85 * dt;
    const sz = e.group.position.z + s * pz * speed * 0.85 * dt;
    if (!isBlocked(e, sx, sz)) {
      e.group.position.x = sx;
      e.group.position.z = sz;
      return true;
    }
  }
  return false;
}

function isBlocked(e, x, z) {
  if (Math.abs(x) > 399 || Math.abs(z) > 399) return true;
  if (e.phaseThrough) return false;
  if (spawner.collidesAt?.(x, z, 0.5)) return true;
  if (spawner.isWater?.(x, z) && !spawner.isOnBridge?.(x, z)) return true;
  return false;
}

export function queueRespawn(e) {
  spawner.respawnQueue.push({
    key: e.defId,
    x: e.spawnX,
    z: e.spawnZ,
    time: performance.now() + spawner.RESPAWN_MS,
  });
}