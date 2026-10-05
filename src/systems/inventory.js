// Инвентарь, экипировка, бонусы, визуализация на персонаже.

import * as THREE from 'three';
import { state } from '../core/state.js';
import { EQ_SLOTS, CLASS_STATS, SLOT_SHORT } from '../core/constants.js';
import { getMat, shadeColor } from '../core/assets.js';
import { buildWeapon } from '../entities/item.js';

// === Бонусы от экипировки ===
export function getEquipBonuses() {
  const b = { str: 0, dex: 0, int: 0, vit: 0, wis: 0, luck: 0, mas: 0, hp: 0, mp: 0 };
  for (const s of EQ_SLOTS) {
    const it = state.eq[s];
    if (!it) continue;
    for (const k of ['str', 'dex', 'int', 'vit', 'wis', 'luck', 'mas', 'hp', 'mp']) {
      if (it[k]) b[k] += it[k];
    }
  }
  return b;
}

export function getTotalStats() {
  const b = getEquipBonuses();
  return {
    str: state.stats.str + b.str,
    dex: state.stats.dex + b.dex,
    int: state.stats.int + b.int,
    vit: state.stats.vit + b.vit,
    wis: state.stats.wis + b.wis,
    luck: state.stats.luck + b.luck,
    mas: state.stats.mas + b.mas,
    bonus: b,
  };
}

export function recalcStats() {
  const cls = CLASS_STATS[state.character.class];
  const S = getTotalStats();
  const extraHp = (S.str - 10) * 3 + (S.vit - 10) * 5 + (state.level - 1) * 6 + S.bonus.hp;
  const extraMp = (S.int - 10) * 5 + (S.wis - 10) * 3 + (state.level - 1) * 3 + S.bonus.mp;
  state.hpMax = cls.hp + extraHp;
  state.mpMax = cls.mp + extraMp;
  if (state.hp > state.hpMax) state.hp = state.hpMax;
  if (state.mp > state.mpMax) state.mp = state.mpMax;
}

// === Урон и броня ===
export function totalDamage() {
  const w = state.eq.weapon;
  const cb = CLASS_STATS[state.character.class].dmg;
  let wd = w ? w.dmg : cb;
  const S = getTotalStats();
  let b = 0;
  if (!w || w.kind === 'sword' || w.kind === 'axe' || w.kind === 'mace') b = (S.str - 10) * 0.5;
  else if (w.kind === 'bow') b = (S.dex - 10) * 0.6;
  else if (w.kind === 'staff') b = (S.int - 10) * 0.6;
  const lb = (state.level - 1) * 0.8;
  let dmin = Math.max(1, Math.floor(wd[0] + b + lb));
  let dmax = Math.max(1, Math.floor(wd[1] + b + lb));
  if (w && w.maxDur > 0) {
    const m = 0.3 + 0.7 * (w.dur / w.maxDur);
    dmin = Math.floor(dmin * m);
    dmax = Math.floor(dmax * m);
  }
  // +30% урона посоху
  if (w && w.kind === 'staff') {
    dmin = Math.floor(dmin * 1.3);
    dmax = Math.floor(dmax * 1.3);
  }
  return [dmin, dmax];
}

export function totalArmor() {
  let d = 0;
  for (const s of EQ_SLOTS) {
    const it = state.eq[s];
    if (it && it.def) {
      const m = it.maxDur > 0 ? 0.3 + 0.7 * (it.dur / it.maxDur) : 1;
      d += Math.floor(it.def * m);
    }
  }
  return d;
}

export function critChance() {
  const S = getTotalStats();
  return Math.max(0, Math.min(0.6, (5 + (S.dex - 10) * 0.4 + (S.luck - 10) * 0.5) / 100));
}

export function attackSpeedBonus() {
  return (state.stats.dex - 10) * 0.01;
}

export function playerAttackSpeed() {
  return (state.eq.weapon ? state.eq.weapon.speed : 0.7) * (1 - attackSpeedBonus());
}

export function playerAttackRange() {
  const w = state.eq.weapon;
  if (!w) return 2.0;
  if (w.ranged) return (w.range || 5) * 1.5;
  return 1.75 + (w.range || 0.3);
}

export function playerRanged() {
  return state.eq.weapon && state.eq.weapon.ranged ? state.eq.weapon.ranged : null;
}

export function classifyWeapon(w) {
  if (!w) return null;
  if (w.kind === 'bow') return 'ranged';
  if (w.kind === 'staff') return 'magic';
  if (w.twoHanded) return 'twohand';
  if (w.kind === 'dagger') return 'throwing';
  return 'onehand';
}

export function gainSkillXP(skill, baseDamage, isPvP) {
  if (!skill || !state.skills[skill]) return;
  const s = state.skills[skill];
  if (s.lvl >= 100) return;
  const pvpMul = isPvP ? 1.5 : 1.0;
  const xp = Math.max(1, Math.floor(baseDamage * pvpMul));
  s.xp += xp;
  let need = Math.floor(100 * Math.pow(s.lvl, 1.35));
  while (s.xp >= need && s.lvl < 100) {
    s.xp -= need;
    s.lvl++;
    need = Math.floor(100 * Math.pow(s.lvl, 1.35));
  }
}

// === Операции с инвентарём ===
export function useInventoryItem(idx) {
  const it = state.inv[idx];
  if (!it) return;

  if (it.type === 'potion') {
    if (it.heal) state.hp = Math.min(state.hpMax, state.hp + it.heal);
    if (it.mana) state.mp = Math.min(state.mpMax, state.mp + it.mana);
    state.inv.splice(idx, 1);
    window.dispatchEvent(new CustomEvent('inv:changed'));
    return;
  }

  if (it.lvl && it.lvl > state.level) return;

  const slot = it.slot;
  if (slot === 'weapon' && it.twoHanded && state.eq.shield) {
    state.inv.push(state.eq.shield);
    state.eq.shield = null;
  }
  if (slot === 'shield' && it.twoHanded && state.eq.weapon) {
    state.inv.push(state.eq.weapon);
    state.eq.weapon = null;
  }
  if (slot === 'shield' && it.type === 'shield' && state.eq.weapon?.twoHanded) {
    state.inv.push(state.eq.weapon);
    state.eq.weapon = null;
  }

  const old = state.eq[slot];
  state.eq[slot] = it;
  state.inv.splice(idx, 1);
  if (old) state.inv.push(old);

  recalcStats();
  window.dispatchEvent(new CustomEvent('inv:changed'));
}

export function unequip(slot) {
  const it = state.eq[slot];
  if (!it) return;
  if (state.inv.length >= 40) return;
  state.inv.push(it);
  state.eq[slot] = null;
  recalcStats();
  window.dispatchEvent(new CustomEvent('inv:changed'));
}

// === Визуализация на персонаже ===
export function applyEquipmentVisuals(hero, weaponAnchor, shieldAnchor,
  weaponSheathAnchor, weaponHipAnchor, shieldSheathAnchor) {
  if (!hero) return;
  const P = hero.userData;

  // Броня
  const armor = state.eq.armor;
  const tc = armor ? armor.color : shadeColor(state.character.outfit, 0.9);
  P.torso.material = getMat(tc);
  P.armLm.material = getMat(tc);
  P.armRm.material = getMat(tc);

  const pants = state.eq.pants;
  const pc = pants ? pants.color : shadeColor(state.character.outfit, 0.65);
  if (P.legLm) P.legLm.material = getMat(pc);
  if (P.legRm) P.legRm.material = getMat(pc);

  // Сапоги
  if (P.bootsL) { P.footL.remove(P.bootsL); P.footR.remove(P.bootsR); P.bootsL = P.bootsR = null; }
  const boots = state.eq.boots;
  if (boots) {
    const bm = getMat(boots.color);
    P.bootsL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.20, 0.42), bm);
    P.bootsL.position.set(0, -0.05, 0.10);
    P.footL.add(P.bootsL);
    P.bootsR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.20, 0.42), bm);
    P.bootsR.position.set(0, -0.05, 0.10);
    P.footR.add(P.bootsR);
  }

  // Перчатки
  if (P.glovesL) { hero.remove(P.glovesL); hero.remove(P.glovesR); P.glovesL = P.glovesR = null; }
  const gloves = state.eq.gloves;
  if (gloves) {
    P.glovesL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), getMat(gloves.color));
    P.glovesL.position.set(0, -0.6, 0);
    P.armL.add(P.glovesL);
    P.glovesR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), getMat(gloves.color));
    P.glovesR.position.set(0, -0.6, 0);
    P.armR.add(P.glovesR);
  }

  // Шлем — увеличен, чтобы не пересекаться с головой
  if (P.helmMesh) { P.headG.remove(P.helmMesh); P.helmMesh = null; }
  const helm = state.eq.helm;
  if (helm) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.62), getMat(helm.color));
    h.position.y = 0.42;
    P.headG.add(h);
    P.helmMesh = h;
  }

  // Оружие
  if (weaponAnchor) {
    // Чистим старое
    while (weaponAnchor.children.length) weaponAnchor.remove(weaponAnchor.children[0]);
  }
  if (weaponSheathAnchor) {
    while (weaponSheathAnchor.children.length) weaponSheathAnchor.remove(weaponSheathAnchor.children[0]);
  }
  if (weaponHipAnchor) {
    while (weaponHipAnchor.children.length) weaponHipAnchor.remove(weaponHipAnchor.children[0]);
  }

  const w = state.eq.weapon;
  if (w && weaponAnchor) {
    const hand = buildWeapon(w);
    if (w.kind === 'staff') {
      hand.rotation.set(2.0, 0, 0);
      hand.position.set(0, 0, 0);
    } else if (w.kind === 'bow') {
      hand.rotation.set(-1.35, 1.50, 0.14);
      hand.position.set(0, 0, 0);
    } else {
      hand.rotation.set(2.0, 0, 0);
      hand.position.set(0, -0.16, 0.06);
    }
    weaponAnchor.add(hand);

    // Заноженный вариант
    const sheath = buildWeapon(w);
            const twoH = w.twoHanded || w.kind === 'bow' || w.kind === 'staff' || w.kind === 'axe';
    if (w.kind === 'staff') {
      sheath.rotation.set(1.5, 2, -2.85);
      sheath.position.set(0, -0.20, 0.65);
    } else if (w.kind === 'bow') {
      sheath.rotation.set(1.8, 0, -3.25);
      sheath.position.set(-0.11, -0.1, 0.35);
    } else if (twoH) {
      sheath.rotation.set(0, Math.PI / 2, -2.85 - 0.35 - 1.34);
    }
    // Одноручное — без поворота, анкор уже ориентирует меч на бедре

    if (twoH && weaponSheathAnchor) weaponSheathAnchor.add(sheath);
    else if (weaponHipAnchor) weaponHipAnchor.add(sheath);

    hand.visible = state.combatMode;
    sheath.visible = !state.combatMode;
  }

  // Щит
  if (shieldAnchor) while (shieldAnchor.children.length) shieldAnchor.remove(shieldAnchor.children[0]);
  if (shieldSheathAnchor) while (shieldSheathAnchor.children.length) shieldSheathAnchor.remove(shieldSheathAnchor.children[0]);

  const sh = state.eq.shield;
  if (sh && shieldAnchor) {
    const hand = buildWeapon(sh);
    if (sh.type === 'weapon') {
      hand.rotation.set(1.35, 0, 0);
      hand.position.set(0, -0.6, 0.1);
    } else {
      hand.rotation.set(-0.5 + 1.483, Math.PI / 2, 0);
      hand.position.set(-0.12, -0.1, 0.1);
    }
    shieldAnchor.add(hand);
    const sheath = buildWeapon(sh);
    if (shieldSheathAnchor) shieldSheathAnchor.add(sheath);
    hand.visible = state.combatMode;
    sheath.visible = !state.combatMode;
  }
}

// === Сравнение (для тултипа) ===
export function itemBaseStats(it) {
  const lines = [];
  if (it.type === 'weapon') {
    if (it.dmg) lines.push(`<div class="cl"><span>Урон</span><b>${it.dmg[0]} - ${it.dmg[1]}</b></div>`);
    if (it.speed) lines.push(`<div class="cl"><span>Скорость</span><b>${(1 / it.speed).toFixed(2)}/сек</b></div>`);
    if (it.range > 1) lines.push(`<div class="cl"><span>Дальность</span><b>${it.range.toFixed(1)}</b></div>`);
    if (it.twoHanded) lines.push(`<div class="cl"><span>Тип</span><b>Двуручное</b></div>`);
  } else {
    if (it.def) lines.push(`<div class="cl"><span>Защита</span><b>+${it.def}</b></div>`);
    if (it.hp) lines.push(`<div class="cl"><span>HP</span><b>+${it.hp}</b></div>`);
    if (it.mp) lines.push(`<div class="cl"><span>MP</span><b>+${it.mp}</b></div>`);
  }
  if (it.type === 'potion') {
    if (it.heal) lines.push(`<div class="cl"><span>HP</span><b>+${it.heal}</b></div>`);
    if (it.mana) lines.push(`<div class="cl"><span>MP</span><b>+${it.mana}</b></div>`);
  }
  for (const k of ['str', 'dex', 'int', 'vit', 'wis', 'luck', 'mas']) {
    if (it[k]) lines.push(`<div class="cl"><span>${k.toUpperCase()}</span><b>+${it[k]}</b></div>`);
  }
  if (it.maxDur > 0) lines.push(`<div class="cl"><span>Прочность</span><b>${it.dur}/${it.maxDur}</b></div>`);
  if (it.lvl) lines.push(`<div class="cl"><span>Треб. уровень</span><b>${it.lvl}</b></div>`);
  return lines.join('');
}