// Панели: инвентарь, статы, квесты, карта, магазин, диалог.

import * as THREE from 'three';
import { state } from '../core/state.js';
import { EQ_SLOTS, SLOT_SHORT, SLOT_NAMES, RAR_COLOR, RAR_NAME, STAT_NAMES, SKILL_INFO } from '../core/constants.js';
import { world } from '../core/scene.js';
import {
  getEquipBonuses, getTotalStats, totalDamage, totalArmor, critChance,
  useInventoryItem, unequip, itemBaseStats,
} from '../systems/inventory.js';

export const panels = {
  dialog: null,
  questEngine: null,
  selectedItemCtx: null,
};

// === Инвентарь ===
export function initInventoryUI() {
  const charLayout = document.getElementById('charLayout');
  if (!charLayout) return;
  charLayout.innerHTML = '';
  const positions = {
    helm: { r: 1, c: 1 }, earring: { r: 2, c: 1 },
    weapon: { r: 2, c: 3 }, shield: { r: 3, c: 3 },
    armor: { r: 3, c: 1 }, gloves: { r: 4, c: 1 },
    pants: { r: 4, c: 2 }, boots: { r: 4, c: 3 },
  };
  for (const slot of EQ_SLOTS) {
    const el = document.createElement('div');
    el.className = 'eqslot';
    el.dataset.slot = slot;
    const p = positions[slot];
    if (p) { el.style.gridRow = p.r; el.style.gridColumn = p.c; }
    el.innerHTML = `<span class="slotIcon">—</span><span class="slotName">${SLOT_SHORT[slot]}</span>`;
    el.addEventListener('click', e => {
      e.stopPropagation();
      const it = state.eq[slot];
      if (it) showItemPopup(it, { location: 'eq', slot });
    });
    charLayout.appendChild(el);
  }
  const cnv = document.createElement('canvas');
  cnv.id = 'invCharCanvas';
  cnv.width = 96; cnv.height = 130;
  charLayout.appendChild(cnv);
}

export function renderInventory() {
  const invGrid = document.getElementById('invGrid');
  if (!invGrid) return;
  invGrid.innerHTML = '';
  for (let i = 0; i < 40; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const it = state.inv[i];
    if (it) {
      slot.innerHTML = `<span class="slotIcon">${it.icon}</span><span class="slotName">${it.name}</span>`;
      if (it.lvl && it.lvl > state.level) {
        slot.style.opacity = '0.7';
        slot.style.border = '1px solid #c07070';
      }
      if (it.maxDur > 0 && it.dur < it.maxDur) {
        const p = it.dur / it.maxDur;
        slot.style.borderBottom = `3px solid ${p < 0.3 ? '#b05050' : p < 0.6 ? '#c8b898' : '#9ab860'}`;
      }
      slot.addEventListener('click', e => {
        e.stopPropagation();
        showItemPopup(it, { location: 'inv', idx: i });
      });
    }
    invGrid.appendChild(slot);
  }
  const charLayout = document.getElementById('charLayout');
  if (charLayout) {
    for (const slot of EQ_SLOTS) {
      const el = charLayout.querySelector(`[data-slot="${slot}"]`);
      if (!el) continue;
      const it = state.eq[slot];
      el.innerHTML = it
        ? `<span class="slotIcon">${it.icon}</span><span class="slotName">${SLOT_SHORT[slot]}</span>`
        : `<span class="slotIcon">—</span><span class="slotName">${SLOT_SHORT[slot]}</span>`;
    }
  }
}

export function toggleInventory() {
  document.getElementById('inv')?.classList.toggle('open');
  if (document.getElementById('inv')?.classList.contains('open')) renderInventory();
}

// === Тултип ===
export function showItemPopup(item, ctx) {
  const backdrop = document.getElementById('itemPopupBackdrop');
  const nameEl = document.getElementById('ipName');
  const typeEl = document.getElementById('ipType');
  const statsEl = document.getElementById('ipStats');
  const actEl = document.getElementById('ipActions');
  if (!backdrop) return;

  nameEl.textContent = item.name;
  nameEl.style.color = RAR_COLOR[item.rar] || '#3a2210';
  typeEl.textContent = (SLOT_NAMES[item.slot] || item.type.toUpperCase()) + ' · ' + (RAR_NAME[item.rar] || '');
  statsEl.innerHTML = itemBaseStats(item);
  actEl.innerHTML = '';

  const reqLevel = item.lvl || 1;
  const canUse = state.level >= reqLevel;

  if (ctx.location === 'inv') {
    if (item.type === 'potion') {
      actEl.appendChild(makeBtn('Использовать', () => {
        useInventoryItem(ctx.idx);
        hideItemPopup();
        renderInventory();
      }));
    } else if (item.type === 'quest') {
      actEl.appendChild(makeBtn('Квестовый', null, 'disabled'));
    } else if (!canUse) {
      actEl.appendChild(makeBtn(`Треб. ур. ${reqLevel}`, null, 'disabled'));
    } else {
      actEl.appendChild(makeBtn('Надеть', () => {
        useInventoryItem(ctx.idx);
        hideItemPopup();
        renderInventory();
        window.dispatchEvent(new CustomEvent('inv:changed'));
      }));
    }
    actEl.appendChild(makeBtn('Выбросить', () => {
      dropInventoryItem(ctx.idx);
      hideItemPopup();
    }, 'danger'));
  } else if (ctx.location === 'eq') {
    actEl.appendChild(makeBtn('Снять', () => {
      unequip(ctx.slot);
      hideItemPopup();
      renderInventory();
    }));
  }
  actEl.appendChild(makeBtn('Закрыть', hideItemPopup, 'close'));
  backdrop.classList.add('show');
}

export function hideItemPopup() {
  document.getElementById('itemPopupBackdrop')?.classList.remove('show');
}

function makeBtn(t, fn, cls) {
  const b = document.createElement('button');
  b.className = 'ipBtn' + (cls ? ' ' + cls : '');
  b.textContent = t;
  if (fn) {
    const handler = e => {
      e.stopPropagation();
      e.preventDefault();
      fn();
    };
    b.addEventListener('click', handler);
    b.addEventListener('touchstart', handler, { passive: false });
    b.addEventListener('mousedown', handler);
  }
  return b;
}

function dropInventoryItem(idx) {
  const it = state.inv[idx];
  if (!it) return;
  state.inv.splice(idx, 1);
  window.dispatchEvent(new CustomEvent('inv:changed'));
  renderInventory();
}

// === Статы ===
export function openStatsPanel() {
  renderStatsPanel();
  document.getElementById('statsPanel')?.classList.add('show');
}

export function renderStatsPanel() {
  const grid = document.getElementById('statGrid');
  const left = document.getElementById('statPointsLeft');
  if (!grid) return;
  if (left) left.textContent = state.statPoints;
  const bonus = getEquipBonuses();
  grid.innerHTML = '';
  for (const k of ['str', 'dex', 'int', 'vit', 'wis', 'luck', 'mas']) {
    const row = document.createElement('div');
    row.className = 'statRow';
    const b = bonus[k] ? `<span style="color:#7a5a38;font-size:10px"> +${bonus[k]}</span>` : '';
    row.innerHTML = `
      <div class="sname">${STAT_NAMES[k]}${b}</div>
      <div class="sval">${state.stats[k]}</div>
      <div class="plusBtn ${state.statPoints > 0 ? '' : 'disabled'}">+</div>`;
    const plusEl = row.querySelector('.plusBtn');
    plusEl.addEventListener('click', () => {
      if (state.statPoints <= 0) return;
      state.statPoints--;
      state.stats[k]++;
      renderStatsPanel();
    });
    grid.appendChild(row);
  }

  const skillsList = document.getElementById('skillsList');
  if (skillsList) {
    skillsList.innerHTML = '';
    for (const sk of Object.keys(state.skills)) {
      const info = SKILL_INFO[sk] || { icon: '?', name: sk };
      const s = state.skills[sk];
      const need = Math.floor(100 * Math.pow(s.lvl, 1.35));
      const pct = Math.min(100, s.xp / need * 100);
      const el = document.createElement('div');
      el.className = 'skillRow';
      el.innerHTML = `
        <div class="skillHead">
          <span class="skillName">${info.icon} ${info.name}</span>
          <span class="skillLvl">Ур. ${s.lvl}/100</span>
        </div>
        <div class="skillBar"><div class="skillFill" style="width:${pct}%"></div></div>`;
      skillsList.appendChild(el);
    }
  }

  const ds = document.getElementById('derivedStats');
  if (ds) {
    const dmg = totalDamage(), ar = totalArmor();
    ds.innerHTML = `
      Уровень: <b>${state.level}</b> · Урон: <b>${dmg[0]} - ${dmg[1]}</b> ·
      Броня: <b>${ar}</b> · Крит: <b>${(critChance() * 100).toFixed(1)}%</b><br>
      HP: <b>${state.hpMax}</b> · MP: <b>${state.mpMax}</b>`;
  }
}

// === Квесты ===
export function openQuestPanel() {
  renderQuestList();
  document.getElementById('questPanel')?.classList.add('show');
}


// ============================================================
// === КАРТА ===
// ============================================================

const HALF = 200;
let mapLoopRunning = false;
let mapViewX = 0, mapViewY = 0;
let MAP_VIEW_RANGE = 100;
const MAP_VIEW_MIN = 35, MAP_VIEW_MAX = 240;
let mapDragging = false, mapDragId = null;
let mapDragStartX = 0, mapDragStartY = 0;
let mapDragViewStartX = 0, mapDragViewStartY = 0;
let mapPinch = null;

export function openMapPanel() {
  const panel = document.getElementById('mapPanel');
  const canvas = document.getElementById('mapCanvas');
  if (!panel || !canvas) {
    console.warn('[map] panel or canvas not found');
    return;
  }

  mapViewX = 0;
  mapViewY = 0;
  panel.classList.add('show');

  if (!mapLoopRunning) {
    mapLoopRunning = true;
    const loop = () => {
      if (!panel.classList.contains('show')) {
        mapLoopRunning = false;
        return;
      }
      renderMap(canvas);
      requestAnimationFrame(loop);
    };
    loop();
  }

  // Кнопка закрытия
  const closeBtn = document.getElementById('mapClose');
  if (closeBtn && !closeBtn._bound) {
    closeBtn._bound = true;
    closeBtn.addEventListener('click', () => panel.classList.remove('show'));
  }

  // Обработчики жестов
  if (!canvas._bound) {
    canvas._bound = true;

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      e.stopPropagation();
      if (e.touches.length === 2) {
        mapDragging = false;
        mapDragId = null;
        const t1 = e.touches[0], t2 = e.touches[1];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        mapPinch = { startDist: Math.hypot(dx, dy), startRange: MAP_VIEW_RANGE };
        return;
      }
      if (mapDragId !== null) return;
      const t = e.changedTouches[0];
      mapDragId = t.identifier;
      mapDragging = true;
      mapDragStartX = t.clientX;
      mapDragStartY = t.clientY;
      mapDragViewStartX = mapViewX;
      mapDragViewStartY = mapViewY;
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      e.stopPropagation();
      if (e.touches.length === 2 && mapPinch) {
        const t1 = e.touches[0], t2 = e.touches[1];
        const d = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const f = mapPinch.startDist / Math.max(d, 1);
        MAP_VIEW_RANGE = Math.max(MAP_VIEW_MIN, Math.min(MAP_VIEW_MAX, mapPinch.startRange * f));
        return;
      }
      if (!mapDragging) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== mapDragId) continue;
        const rect = canvas.getBoundingClientRect();
        const wpp = (MAP_VIEW_RANGE * 2) / rect.width;
        mapViewX = mapDragViewStartX - (t.clientX - mapDragStartX) * wpp;
        mapViewY = mapDragViewStartY - (t.clientY - mapDragStartY) * wpp;
      }
    }, { passive: false });

    const endTouch = e => {
      if (e.touches.length < 2) mapPinch = null;
      for (const t of e.changedTouches) {
        if (t.identifier === mapDragId) {
          mapDragging = false;
          mapDragId = null;
        }
      }
    };
    canvas.addEventListener('touchend', endTouch, { passive: false });
    canvas.addEventListener('touchcancel', endTouch, { passive: false });
  }
}

function renderMap(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const playerPos = window.__playerPos;

  // Морской фон
  ctx.fillStyle = '#1a3050';
  ctx.fillRect(0, 0, W, H);

  if (!playerPos) {
    ctx.fillStyle = '#c89848';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Мир загружается...', W / 2, H / 2);
    return;
  }

  const vr = MAP_VIEW_RANGE;
  const cx = playerPos.x + mapViewX;
  const cz = playerPos.z + mapViewY;
  const ppw = W / (vr * 2);
  const vrY = (H / ppw) / 2;
  const wx2mx = wx => (wx - cx + vr) * ppw;
  const wz2my = wz => (wz - cz + vrY) * ppw;
  const S = ppw;
  const HALF_MAP = 200;

  // Суша (светло-песочный прямоугольник)
  const bX1 = wx2mx(-HALF_MAP), bX2 = wx2mx(HALF_MAP);
  const bY1 = wz2my(-HALF_MAP), bY2 = wz2my(HALF_MAP);
  ctx.fillStyle = '#c8b898';
  ctx.fillRect(bX1, bY1, bX2 - bX1, bY2 - bY1);

  // Биомы — круглые пятна
  const blobs = [
    { x: -78, z: 20, r: 40, c: 'rgba(140,160,90,0.55)' },     // деревня
    { x: 40,  z: 0,  r: 40, c: 'rgba(90,90,110,0.6)' },       // кладбище
    { x: 130, z: -110, r: 32, c: 'rgba(150,140,120,0.7)' },   // каменоломня
    { x: -80, z: -100, r: 36, c: 'rgba(70,60,50,0.7)' },      // заброшенная деревня
    { x: -60, z: 150, r: 22, c: 'rgba(70,90,60,0.7)' },       // болото
    { x: 90,  z: -60, r: 40, c: 'rgba(180,170,140,0.5)' },    // мыс
    { x: 70,  z: 20, r: 90, c: 'rgba(120,150,90,0.45)' }      // холмы/лес
  ];
  for (const b of blobs) {
    const mx = wx2mx(b.x), my = wz2my(b.z), r = b.r * S;
    if (mx + r < 0 || mx - r > W || my + r < 0 || my - r > H) continue;
    ctx.fillStyle = b.c;
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
  }

  // Берег (полоса песка)
  ctx.strokeStyle = 'rgba(230,200,150,0.8)';
  ctx.lineWidth = Math.max(2, 15 * S);
  ctx.beginPath();
  ctx.moveTo(wx2mx(-110), wz2my(-HALF_MAP));
  ctx.lineTo(wx2mx(-110), wz2my(HALF_MAP));
  ctx.stroke();

  // Зоны
  const zones = window.__zones || [];
  for (const z of zones) {
    if (!z.center) continue;
    const mx = wx2mx(z.center.x), my = wz2my(z.center.z);
    const rad = (z.radius || 20) * S;
    if (mx + rad < 0 || mx - rad > W || my + rad < 0 || my - rad > H) continue;
    ctx.strokeStyle = 'rgba(255,220,160,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mx, my, rad, 0, Math.PI * 2); ctx.stroke();
    if (rad > 18) {
      ctx.fillStyle = 'rgba(40,20,10,0.9)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(z.name || z.id, mx, my - rad + 12);
    }
  }

  // Постройки
  const buildings = window.__decor?.buildingsOnMap || [];
  for (const b of buildings) {
    const mx = wx2mx(b.x), my = wz2my(b.z);
    if (mx < -20 || mx > W + 20 || my < -20 || my > H + 20) continue;
    if (b.r) {
      ctx.fillStyle = b.color || '#c89848';
      ctx.beginPath(); ctx.arc(mx, my, Math.max(3, b.r * S * 0.5), 0, Math.PI * 2); ctx.fill();
    } else {
      const w = (b.w || 5) * S, h = (b.d || 5) * S;
      ctx.fillStyle = b.color || '#c89848';
      ctx.fillRect(mx - w / 2, my - h / 2, w, h);
    }
  }

  // Мобы
  const mobs = window.__spawner?.mobs || [];
  for (const e of mobs) {
    if (!e.alive) continue;
    const mx = wx2mx(e.group.position.x);
    const my = wz2my(e.group.position.z);
    if (mx < 0 || mx > W || my < 0 || my > H) continue;
    ctx.fillStyle = e.type.boss ? '#c94a3c' : (e.aggroed ? '#ff4040' : '#8a5a3a');
    ctx.beginPath();
    ctx.arc(mx, my, e.type.boss ? 6 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // NPC
  const npcs = window.__npcList || [];
  for (const npc of npcs) {
    if (!npc.mesh || !npc.mesh.visible) continue;
    const mx = wx2mx(npc.mesh.position.x);
    const my = wz2my(npc.mesh.position.z);
    if (mx < 0 || mx > W || my < 0 || my > H) continue;
    ctx.fillStyle = '#e8c058';
    ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a0e04';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letter = {
      helga: 'Х', iva: 'И', yasen: 'Я', dorn: 'К',
      elder: 'С', trader: 'Т', blacksmith: 'К', lily: 'Л',
      viy: 'В', apothecary: 'А'
    }[npc.type] || '?';
    ctx.fillText(letter, mx, my);
  }

  // Игрок
  const px = wx2mx(playerPos.x);
  const py = wz2my(playerPos.z);
  const rotY = window.__playerRot || 0;
  const dirX = Math.sin(rotY), dirY = Math.cos(rotY);
  const perpX = -dirY, perpY = dirX;
  const size = 14, width = 10;
  ctx.beginPath();
  ctx.moveTo(px + dirX * size, py + dirY * size);
  ctx.lineTo(px - dirX * size * 0.4 + perpX * width, py - dirY * size * 0.4 + perpY * width);
  ctx.lineTo(px - dirX * size * 0.4 - perpX * width, py - dirY * size * 0.4 - perpY * width);
  ctx.closePath();
  ctx.fillStyle = '#f0c060';
  ctx.fill();
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Легенда в углу
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(8, 8, 130, 92);
  ctx.fillStyle = '#e8d8b0';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Гальда', 24, 14);
  ctx.fillText('Кладбище', 24, 30);
  ctx.fillText('Каменоломня', 24, 46);
  ctx.fillText('Волки', 24, 62);
  ctx.fillText('Крабы', 24, 78);
  ctx.fillStyle = '#8aa060'; ctx.fillRect(12, 16, 8, 8);
  ctx.fillStyle = '#5a5a6e'; ctx.fillRect(12, 32, 8, 8);
  ctx.fillStyle = '#968c78'; ctx.fillRect(12, 48, 8, 8);
  ctx.fillStyle = '#8a5a3a'; ctx.fillRect(12, 64, 8, 8);
  ctx.fillStyle = '#c85a5a'; ctx.fillRect(12, 80, 8, 8);
}

// ============================================================
// === ЖУРНАЛ КВЕСТОВ ===
// ============================================================

let questTab = 'active';

export function renderQuestList() {
  const listEl = document.getElementById('questList');
  const detailEl = document.getElementById('questDetail');
  if (!listEl || !detailEl) return;

  const engine = window.__questEngine;
  if (!engine) {
    listEl.innerHTML = '<div class="questRow" style="opacity:.7;cursor:default">Движок квестов не загружен.</div>';
    detailEl.innerHTML = '<h4>Нет данных</h4>';
    return;
  }

  const active = engine.listActive() || [];
  const done = engine.listDone ? engine.listDone() : [];
  const list = questTab === 'active' ? active : done;

  listEl.innerHTML = '';

  if (list.length === 0) {
    const msg = questTab === 'active' ? 'Нет активных заданий.' : 'Нет завершённых заданий.';
    listEl.innerHTML = `<div class="questRow" style="opacity:.7;cursor:default">${msg}</div>`;
    detailEl.innerHTML = '<h4>Выберите квест</h4>';
    return;
  }

  for (const q of list) {
    const el = document.createElement('div');
    el.className = 'questRow' + (q.completed ? ' done' : '');
    el.innerHTML = `<b>${q.name}</b>` +
      (q.progress ? `<br><span style="opacity:.7">${q.progress}</span>` : '');
    el.addEventListener('click', e => {
      e.stopPropagation();
      showQuestDetail(q);
    });
    listEl.appendChild(el);
  }

  if (list[0]) showQuestDetail(list[0]);
}

export function showDialogUI(info) {
  const dlg = document.getElementById('dialog');
  const nameEl = document.getElementById('dialogName');
  const textEl = document.getElementById('dialogText');
  const btnsEl = document.getElementById('dialogBtns');
  const rewardEl = document.getElementById('dialogReward');
  if (!dlg || !nameEl || !textEl || !btnsEl) return;

  nameEl.textContent = info.speaker;
  textEl.textContent = info.text;
  if (rewardEl) rewardEl.style.display = 'none';
  btnsEl.innerHTML = '';
  for (const opt of info.options) {
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = opt.text;
    btn.addEventListener('click', () => opt.action());
    btnsEl.appendChild(btn);
  }
  dlg.classList.add('show');
}

export function hideDialogUI() {
  document.getElementById('dialog')?.classList.remove('show');
}

// Переключение вкладок
export function initQuestTabs() {
  document.querySelectorAll('.questTab').forEach(tab => {
    tab.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.questTab').forEach(t => t.classList.remove('sel'));
      tab.classList.add('sel');
      questTab = tab.dataset.qt || 'active';
      renderQuestList();
    });
  });
}