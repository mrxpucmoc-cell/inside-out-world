// Единый игровой стейт. Все системы читают/пишут только через него.

import { EQ_SLOTS } from './constants.js';

export const state = {
  // Прогресс
  level: 1, xp: 0, xpNext: 100,
  gold: 200,
  kills: 0, killCounter: 0,

  // Здоровье / мана
  hp: 120, hpMax: 120,
  mp: 60,  mpMax: 60,

  // Боевые кулдауны
  atkCd: 0, abilityCd: 0,
  swing: 0, hurtFlash: 0, dash: null,
  channeling: false, channelTick: 0,
  attackType: 'melee',
  combatMode: false, combatTimer: 0,
  handAnim: null,

  // Характеристики
  stats: { str: 10, dex: 10, int: 10, vit: 10, wis: 10, luck: 10, mas: 10 },
  statPoints: 0,
  skills: {
    onehand: { lvl: 1, xp: 0 }, twohand: { lvl: 1, xp: 0 },
    throwing: { lvl: 1, xp: 0 }, ranged: { lvl: 1, xp: 0 },
    magic: { lvl: 1, xp: 0 }
  },

  // Инвентарь
  inv: [], eq: {},
  dropBlockers: [],

  // Квесты и флаги (используется движками)
  flags: {},
  completedQuests: [],

  // Живость
  alive: true,

  // Персонаж
  character: {
    class: 'rift', gender: 'male', name: 'Герой',
    skin: 0xe8c8a8, hair: 0x3a3530, outfit: 0x7a8ab8,
    hairStyle: 'short', eyeColor: 0x2a2520,
    mouthStyle: 'neutral', bodyType: 'normal', beard: 'none'
  }
};

for (const s of EQ_SLOTS) state.eq[s] = null;

// === API для движков и систем ===

export function addXP(n) {
  state.xp += Math.round(n);
  while (state.xp >= state.xpNext) {
    state.xp -= state.xpNext;
    state.level++;
    state.xpNext = Math.floor(state.xpNext * 1.55);
    state.stats.str++; state.stats.dex++; state.stats.int++;
    state.stats.vit++; state.stats.wis++; state.stats.luck++; state.stats.mas++;
    state.statPoints += 3;
    state.hp = state.hpMax;
    state.mp = state.mpMax;
    window.dispatchEvent(new CustomEvent('player:levelup', { detail: { level: state.level } }));
  }
  window.dispatchEvent(new CustomEvent('player:xp', { detail: { xp: state.xp, next: state.xpNext } }));
}

export function addGold(n) {
  state.gold += n;
  window.dispatchEvent(new CustomEvent('player:gold', { detail: { gold: state.gold } }));
}

export function addItem(itemId, count = 1) {
  const def = window.registry?.items?.[itemId];
  if (!def) return false;
  for (let i = 0; i < count; i++) {
    if (def.type === 'potion') {
      state.inv.push({ ...def });
    } else {
      if (state.inv.length >= 40) return false;
      state.inv.push({ ...def, dur: def.maxDur || 0 });
    }
  }
  window.dispatchEvent(new CustomEvent('inv:changed'));
  return true;
}

export function removeItem(itemId, count = 1) {
  let removed = 0;
  for (let i = state.inv.length - 1; i >= 0 && removed < count; i--) {
    if (state.inv[i].id === itemId) { state.inv.splice(i, 1); removed++; }
  }
  window.dispatchEvent(new CustomEvent('inv:changed'));
  return removed;
}

export function hasItem(itemId, count = 1) {
  return state.inv.filter(i => i.id === itemId).length >= count;
}

export function setFlag(key, value) {
  state.flags[key] = value;
  window.dispatchEvent(new CustomEvent('flag:changed', { detail: { key, value } }));
}

export function getFlag(key) {
  return state.flags[key];
}