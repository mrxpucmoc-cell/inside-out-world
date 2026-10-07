// Боевая система: урон по игроку и мобам, снаряды, крит, статусы.

import * as THREE from 'three';
import { state, addGold, addXP } from '../core/state.js';
import { world } from '../core/scene.js';
import { classifyWeapon, gainSkillXP, totalDamage, totalArmor, critChance } from './inventory.js';
import { rnd, ri, clamp } from '../core/assets.js';

export const combat = {
  projectiles: [],
  enemyProjectiles: [],
  fireParticles: [],
  floaters: [],
  bloodDecals: [],
  effects: [],
  onKillMob: null,
  onPlayerDeath: null,
  getGroundHeight: null,
  getAllMobs: () => [],
};

// === Спавн снаряда игрока ===
export function spawnProjectile(from, dir, dmgRange, kind, target) {
  let mesh, speed;
  if (kind === 'arrow') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xf0e0c0 }));
    // Хвостик для видимости
    const trail = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.7 }));
    trail.position.z = -0.4;
    mesh.add(trail);
    speed = 40;
  } else if (kind === 'spear') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.0),
      new THREE.MeshBasicMaterial({ color: 0xd8c8a8 }));
    speed = 30;
  } else {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xe8c8a0 }));
    mesh.add(new THREE.PointLight(0xe8c8a0, 2.2, 7));
    speed = 34;
  }
  mesh.position.copy(from);
  const lookDir = dir.clone(); lookDir.y = 0;
  if (lookDir.length() > 0.01) mesh.rotation.y = Math.atan2(lookDir.x, lookDir.z);
  world.scene.add(mesh);

  let vel = dir.clone();
  if (target) {
    const tPos = target.group.position.clone();
    tPos.y += 0.9 * (target.type.scale || 1);
    vel = tPos.sub(mesh.position).normalize();
  }
  combat.projectiles.push({ mesh, dir: vel, dmgRange, kind, speed, life: 5, target });
}

export function spawnEnemyProjectile(enemy, dir) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xe8d8b8 }));
  const startPos = enemy.group.position.clone();
  startPos.y += 1.2 * (enemy.type.scale || 1);
  startPos.x += dir.x * 0.5;
  startPos.z += dir.z * 0.5;
  mesh.position.copy(startPos);
  mesh.rotation.y = Math.atan2(dir.x, dir.z);
  world.scene.add(mesh);
  combat.enemyProjectiles.push({
    mesh, dir: dir.clone(), speed: 14,
    damage: enemy.type.stats?.dmg || 10, life: 3
  });
}

// === Урон по игроку ===
export function damagePlayer(rawDmg) {
  if (!state.alive) return;
  const def = totalArmor();
  const red = def / (def + 42);
  const dmg = Math.max(1, Math.round(rawDmg * (1 - red)));
  state.hp -= dmg;
  state.hurtFlash = 0.35;

  for (const slot of Object.keys(state.eq)) {
    const it = state.eq[slot];
    if (it && it.maxDur > 0 && Math.random() < 0.10) {
      it.dur = Math.max(0, it.dur - 1);
    }
  }

  const pPos = _getPlayerPos();
  if (pPos) {
    const wp = pPos.clone(); wp.y += 2.2; wp.x += rnd(-0.3, 0.3);
    spawnFloater(wp, '-' + dmg, 'player');
  }

  if (navigator.vibrate) navigator.vibrate(40);

  if (state.hp <= 0) {
    state.hp = 0;
    state.alive = false;
    combat.onPlayerDeath?.();
  }
}

// === Урон по мобу (ближний бой) ===
export function doMeleeAttack(target, playerPos, playerRot) {
  if (state.atkCd > 0) return;
  state.atkCd = playerAttackSpeed();
  state.swing = 1;
  state.attackType = 'melee';

  const range = totalDamage();
  let dmg = ri(range[0], range[1]);

  if (target.frozen && target.frozen.timeLeft > 0) dmg = Math.floor(dmg * 1.5);
  const crit = Math.random() < critChance();
  if (crit) dmg = Math.floor(dmg * 1.8);
  dmg = Math.max(1, Math.floor(dmg * rnd(0.9, 1.1)));

   target.hp -= dmg;
  target.hurt = 1;
  target.aggroed = true;
  target.chasing = true;
  combat.onMobDamaged?.(target, dmg);
  if (!target.leashFrom) {
    target.leashFrom = { x: target.group.position.x, z: target.group.position.z };
  }
  addBlood(target, 1);

  const wp = target.group.position.clone();
  wp.y += 1.7 * (target.type.scale ?? 1);
  wp.x += rnd(-0.3, 0.3);
  spawnFloater(wp, (crit ? '✦' : '') + dmg, crit ? 'crit' : '');

  const kb = playerPos.clone().sub(target.group.position).normalize().multiplyScalar(-0.35);
  target.group.position.add(kb);

  if (navigator.vibrate) navigator.vibrate(crit ? 30 : 12);

  const skillKey = classifyWeapon(state.eq.weapon);
  if (skillKey) gainSkillXP(skillKey, dmg, false);

  if (target.hp <= 0) killEnemy(target);
}

// === Снаряд игрока попал ===
export function projectileHitMob(p, hit) {
  const range = p.dmgRange;
  let dmg = ri(range[0], range[1]);
  if (hit.frozen && hit.frozen.timeLeft > 0) dmg = Math.floor(dmg * 1.5);
  const crit = Math.random() < critChance();
  if (crit) dmg = Math.floor(dmg * 1.8);

   hit.hp -= dmg;
  hit.hurt = 1;
  combat.onMobDamaged?.(hit, dmg);
  hit.aggroed = true;
  hit.chasing = true;
  if (!hit.leashFrom) {
    hit.leashFrom = { x: hit.group.position.x, z: hit.group.position.z };
  }
  addBlood(hit, 1);

  const wp = hit.group.position.clone();
  wp.y += 1.7 * (hit.type.scale ?? 1);
  spawnFloater(wp, (crit ? '✦' : '') + dmg, crit ? 'crit' : '');

  const skillKey = classifyWeapon(state.eq.weapon);
  if (skillKey) gainSkillXP(skillKey, dmg, false);

  if (hit.hp <= 0) killEnemy(hit);
}

// === Смерть моба ===
export function killEnemy(e) {
  e.alive = false;
  world.scene.remove(e.group);
  if (e.bar) e.bar.remove();
  removeBlood(e);

  // Хук — может установить e.rewardMultiplier (для общего XP с другими игроками)
  if (combat.beforeKill) combat.beforeKill(e);
  const mul = typeof e.rewardMultiplier === 'number' ? e.rewardMultiplier : 1;

  const rawGold = ri(e.type.stats.gold[0], e.type.stats.gold[1]);
  const rawXp = e.type.stats.xp;
  e._rawGold = rawGold;
  e._rawXp = rawXp;

  const gold = Math.max(0, Math.floor(rawGold * mul));
  addGold(gold);
  state.kills++;
  state.killCounter++;

  addXP(Math.max(1, Math.floor(rawXp * mul)));

  if (state.killCounter >= 2) {
    state.killCounter = 0;
    const w = state.eq.weapon;
    if (w && w.maxDur > 0 && w.dur > 0) {
      w.dur = Math.max(0, w.dur - 1);
    }
  }

  combat.onKillMob?.(e, gold);
}

// === Кровь ===
export function addBlood(e, amount) {
  const n = amount || 1;
  for (let i = 0; i < n; i++) {
    const bx = e.group.position.x + rnd(-0.5, 0.5);
    const bz = e.group.position.z + rnd(-0.5, 0.5);
    const by = (combat.getGroundHeight?.(bx, bz) ?? 0) + 0.06;
    const size = rnd(0.22, 0.5);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(size, 0.02, size * rnd(0.7, 1.3)),
      new THREE.MeshBasicMaterial({
        color: 0xc84848, transparent: true, opacity: rnd(0.6, 0.85), depthWrite: false
      }));
    m.position.set(bx, by, bz);
    m.rotation.y = Math.random() * Math.PI;
    world.scene.add(m);
    combat.bloodDecals.push(m);
    if (!e.blood) e.blood = [];
    e.blood.push(m);
  }
}

export function removeBlood(e) {
  if (!e.blood) return;
  for (const m of e.blood) {
    world.scene.remove(m);
    const idx = combat.bloodDecals.indexOf(m);
    if (idx >= 0) combat.bloodDecals.splice(idx, 1);
  }
  e.blood = [];
}

// === Всплывающие числа ===
export function spawnFloater(wp, text, cls) {
  const el = document.createElement('div');
  el.className = 'dmg ' + (cls || '');
  el.textContent = text;
  const ui = document.getElementById('world-ui');
  if (ui) ui.appendChild(el);
  combat.floaters.push({ el, pos: wp.clone(), life: 1.0, vy: 1.6 });
}

// === Снаряды игрока ===
export function updateProjectiles(dt) {
  for (let i = combat.projectiles.length - 1; i >= 0; i--) {
    const p = combat.projectiles[i];
    p.life -= dt;
    if (p.life <= 0) { world.scene.remove(p.mesh); combat.projectiles.splice(i, 1); continue; }

    const prevPos = p.mesh.position.clone();
    p.mesh.position.addScaledVector(p.dir, p.speed * dt);

    // Проверка столкновения с мобами в сегменте движения
    let hit = null, bestT = Infinity;
    const segVec = p.mesh.position.clone().sub(prevPos);
    const segLen = segVec.length();
    if (segLen > 0.0001) {
      const segNorm = segVec.clone().normalize();
      for (const e of combat.getAllMobs()) {
        if (!e.alive) continue;
        const eBase = e.group.position.clone();
        const scale = e.type.scale || 1;
        // Проверяем несколько точек по высоте моба
        for (const hOff of [0.3, 0.9, 1.5, 2.1]) {
          const ePos = eBase.clone().setY(eBase.y + hOff);
          const toE = ePos.clone().sub(prevPos);
          const t = clamp(toE.dot(segNorm), 0, segLen);
          const closest = prevPos.clone().add(segNorm.clone().multiplyScalar(t));
          if (closest.distanceTo(ePos) < 1.3 * scale) {
            if (t < bestT) { bestT = t; hit = e; }
            break;
          }
        }
      }
    }

    if (hit) {
      projectileHitMob(p, hit);
      world.scene.remove(p.mesh);
      combat.projectiles.splice(i, 1);
      continue;
    }

    // Земля: удаляем только при очень глубоком провале (5 м)
const gy = (combat.getGroundHeight?.(p.mesh.position.x, p.mesh.position.z) ?? 0);
if (p.mesh.position.y < gy - 5) {
      world.scene.remove(p.mesh);
      combat.projectiles.splice(i, 1);
      continue;
    }

    if (Math.abs(p.mesh.position.x) > 450 || Math.abs(p.mesh.position.z) > 450) {
      world.scene.remove(p.mesh);
      combat.projectiles.splice(i, 1);
    }
  }
}

export function updateEnemyProjectiles(dt, playerPos) {
  for (let i = combat.enemyProjectiles.length - 1; i >= 0; i--) {
    const p = combat.enemyProjectiles[i];
    p.life -= dt;
    if (p.life <= 0) { world.scene.remove(p.mesh); combat.enemyProjectiles.splice(i, 1); continue; }

    p.mesh.position.addScaledVector(p.dir, p.speed * dt);

    if (state.alive && playerPos) {
      const pp = playerPos.clone(); pp.y += 1.2;
      if (p.mesh.position.distanceTo(pp) < 0.9) {
        damagePlayer(p.damage);
        world.scene.remove(p.mesh);
        combat.enemyProjectiles.splice(i, 1);
        continue;
      }
    }

    const gy = (combat.getGroundHeight?.(p.mesh.position.x, p.mesh.position.z) ?? 0);
    if (p.mesh.position.y < gy) {
      world.scene.remove(p.mesh);
      combat.enemyProjectiles.splice(i, 1);
    }
  }
}

// === Огонь (частицы) ===
export function spawnFireParticle(pos, vel, life = 0.55) {
  const col = Math.random() < 0.5 ? 0xffb080 : 0xffd0a0;
  const p = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
  p.position.copy(pos);
  p.userData.vel = vel;
  p.userData.life = life;
  world.scene.add(p);
  combat.fireParticles.push(p);
}

export function updateFireParticles(dt) {
  for (let i = combat.fireParticles.length - 1; i >= 0; i--) {
    const p = combat.fireParticles[i];
    p.userData.life -= dt;
    if (p.userData.life <= 0) { world.scene.remove(p); combat.fireParticles.splice(i, 1); continue; }
    p.position.addScaledVector(p.userData.vel, dt);
    p.userData.vel.y += 1.5 * dt;
    p.scale.multiplyScalar(0.95);
    if (p.material) p.material.opacity = p.userData.life * 1.5;
  }
}

// === AOE-волны ===
export function spawnWave(pos, radius, color) {
  const ring = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  ring.position.copy(pos); ring.position.y += 0.5;
  world.scene.add(ring);
  combat.effects.push({ mesh: ring, t: 0, dur: 0.55, maxR: radius });
}

export function updateEffects(dt) {
  for (let i = combat.effects.length - 1; i >= 0; i--) {
    const o = combat.effects[i];
    o.t += dt;
    const k = o.t / o.dur;
    if (k >= 1) { world.scene.remove(o.mesh); combat.effects.splice(i, 1); continue; }
    const r = o.maxR * (0.3 + k * 0.9);
    o.mesh.scale.setScalar(r * 2);
    o.mesh.material.opacity = (1 - k) * 0.85;
    o.mesh.rotation.y += dt * 3;
  }
}

// === Всплывающие числа ===
export function updateFloaters(dt, camera) {
  for (let i = combat.floaters.length - 1; i >= 0; i--) {
    const f = combat.floaters[i];
    f.life -= dt * 1.1;
    f.pos.y += f.vy * dt;
    f.vy -= dt * 2.2;
    if (f.life <= 0) { f.el.remove(); combat.floaters.splice(i, 1); continue; }
    const v = f.pos.clone().project(camera);
    if (v.z < 1) {
      f.el.style.display = 'block';
      f.el.style.opacity = clamp(f.life, 0, 1);
      f.el.style.transform =
        `translate(-50%,-50%) translate(${(v.x * 0.5 + 0.5) * innerWidth}px,${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
    } else f.el.style.display = 'none';
  }
}

// === Burn ===
export function applyBurn(enemy, baseDamage) {
  if (!enemy || !enemy.alive) return;
  const tickDamage = Math.max(1, Math.floor(baseDamage * 0.5));
  enemy.burn = { timeLeft: 6, tickTimer: 2, damagePerTick: tickDamage };
}

export function updateBurns(dt) {
  for (const e of combat.getAllMobs()) {
    if (!e.burn || !e.alive) continue;
    e.burn.timeLeft -= dt;
    e.burn.tickTimer -= dt;
    if (e.burn.tickTimer <= 0) {
      e.burn.tickTimer += 2;
      e.hp -= e.burn.damagePerTick;
      e.hurt = 1;
      e.aggroed = true;
      e.chasing = true;
      if (!e.leashFrom) {
        e.leashFrom = { x: e.group.position.x, z: e.group.position.z };
      }
      const wp = e.group.position.clone(); wp.y += 1.8;
      spawnFloater(wp, '🔥 ' + e.burn.damagePerTick, 'fire');
      if (e.hp <= 0) killEnemy(e);
    }
    if (e.burn.timeLeft <= 0) e.burn = null;
  }
}

// === Внешние зависимости ===
let _getMobs = () => [];
let _getPlayerPos = () => null;
let _playerAtkSpeed = () => 0.7;

export function wireCombat({ getAllMobs, getPlayerPos, playerAttackSpeed }) {
  _getMobs = getAllMobs || _getMobs;
  _getPlayerPos = getPlayerPos || _getPlayerPos;
  _playerAtkSpeed = playerAttackSpeed || _playerAtkSpeed;
  combat.getAllMobs = () => _getMobs();
}
combat.getAllMobs = () => [];
function getPlayerPos() { return _getPlayerPos(); }
function playerAttackSpeed() { return _playerAtkSpeed(); }

/* ============================================================
   === КРИТИЧНО: привязка к объекту combat ===
   === Без этого spawn.js не вызовет damagePlayer ===
   ============================================================ */
combat.damagePlayer = damagePlayer;
combat.spawnEnemyProjectile = spawnEnemyProjectile;
combat.spawnProjectile = spawnProjectile;
combat.doMeleeAttack = doMeleeAttack;
combat.killEnemy = killEnemy;
combat.addBlood = addBlood;
combat.spawnFloater = spawnFloater;
combat.beforeKill = null;      // устанавливается в main.js
combat.onMobDamaged = null;    // устанавливается в main.js