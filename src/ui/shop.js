// Магазин, ремонт у кузнеца, лечение у аптекаря.

import { state } from '../core/state.js';
import { RAR_COLOR, RAR_NAME, SLOT_NAMES, EQ_SLOTS } from '../core/constants.js';
import { itemBaseStats } from '../systems/inventory.js';
import { addChatMsg } from './hud.js';
import { renderInventory } from './panels.js';

let shopTab = 'buy';

// Список того, что продаёт торговец
const SHOP_ITEMS = [
  'hp_potion', 'mp_potion',
  'sword_rusty', 'sword_short', 'sword_iron', 'sword_2h',
  'axe_war', 'bow_battle', 'bow_green',
  'staff_oak', 'staff_green',
  'shield_wooden', 'shield_green',
  'helm_leather', 'helm_iron',
  'armor_cloth', 'armor_leather', 'armor_chain',
  'pants_leather', 'boots_leather', 'gloves_leather',
  'ear_copper',
];

// === Открыть магазин ===
export function openShop(tab) {
  shopTab = tab || 'buy';
  const shopEl = document.getElementById('shop');
  if (!shopEl) return;

  document.querySelectorAll('.shopTab').forEach(t => {
    t.classList.toggle('sel', t.dataset.tab === shopTab);
  });

  const title = document.getElementById('shopTitle');
  if (title) title.textContent = shopTab === 'buy' ? 'Торговец — товары' : 'Торговец — продажа';

  const goldEl = document.getElementById('shopGold');
  if (goldEl) goldEl.textContent = state.gold;

  const grid = document.getElementById('shopGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (shopTab === 'buy') {
    const ITEMS = window.registry.items || {};
    for (const id of SHOP_ITEMS) {
      const it = ITEMS[id];
      if (!it) continue;
      const price = it.price || 100;
      const card = document.createElement('div');
      card.className = 'shopItem';
      if (state.gold < price) card.classList.add('disabled');
      card.innerHTML = `
        <div class="si">${it.icon || '📦'}</div>
        <div class="sn" style="color:${RAR_COLOR[it.rar] || '#3a2210'}">${it.name}</div>
        <div class="sp">${price} 💰</div>
      `;
      card.addEventListener('click', e => {
        e.stopPropagation();
        showBuyConfirm(it);
      });
      grid.appendChild(card);
    }
  } else {
    // Продажа
    if (state.inv.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;font-style:italic;color:#7a5a38">Пусто.</div>`;
    } else {
      state.inv.forEach((it, idx) => {
        if (it.type === 'quest') return;
        const card = document.createElement('div');
        card.className = 'shopItem';
        const sp = Math.floor((it.price || 0) * 0.5);
        card.innerHTML = `
          <div class="si">${it.icon || '📦'}</div>
          <div class="sn" style="color:${RAR_COLOR[it.rar] || '#3a2210'}">${it.name}</div>
          <div class="sp">Продать: ${sp} 💰</div>
        `;
        card.addEventListener('click', e => {
          e.stopPropagation();
          if (sp <= 0) { addChatMsg('Нельзя продать'); return; }
          state.gold += sp;
          state.inv.splice(idx, 1);
          addChatMsg(`💰 Продано: ${it.name} (+${sp})`);
          if (goldEl) goldEl.textContent = state.gold;
          renderInventory();
          openShop('sell');
        });
        grid.appendChild(card);
      });
    }
  }

  // Привязка кнопки закрытия (одноразово)
  const closeBtn = document.getElementById('shopClose');
  if (closeBtn && !closeBtn._bound) {
    closeBtn._bound = true;
    closeBtn.addEventListener('click', () => shopEl.classList.remove('show'));
  }

  shopEl.classList.add('show');
}

// === Подтверждение покупки ===
function showBuyConfirm(item) {
  const backdrop = document.getElementById('buyConfirm');
  const nameEl = document.getElementById('bcName');
  const typeEl = document.getElementById('bcType');
  const statsEl = document.getElementById('bcStats');
  const actEl = document.getElementById('bcActions');
  if (!backdrop) return;

  const price = item.price || 100;

  nameEl.textContent = item.name;
  nameEl.style.color = RAR_COLOR[item.rar] || '#3a2210';
  typeEl.textContent =
    (SLOT_NAMES[item.slot] || item.type.toUpperCase()) +
    ' · ' + (RAR_NAME[item.rar] || '');
  statsEl.innerHTML = itemBaseStats(item) +
    `<div class="statLine"><span>Цена</span><b>${price} 💰</b></div>`;

  actEl.innerHTML = '';

  const buyBtn = document.createElement('button');
  buyBtn.className = 'ipBtn';
  buyBtn.textContent = 'Купить';
  buyBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (state.gold < price) { addChatMsg('Мало золота!'); return; }
    if (item.type === 'potion') {
      state.inv.push({ ...item });
    } else {
      if (state.inv.length >= 40) { addChatMsg('Инвентарь полон!'); return; }
      const copy = { ...item, dur: item.maxDur || 0 };
      state.inv.push(copy);
    }
    state.gold -= price;
    addChatMsg(`Куплено: ${item.name}`);
    const goldEl = document.getElementById('shopGold');
    if (goldEl) goldEl.textContent = state.gold;
    renderInventory();
    backdrop.classList.remove('show');
    openShop('buy');
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'ipBtn close';
  cancelBtn.textContent = 'Отмена';
  cancelBtn.addEventListener('click', e => {
    e.stopPropagation();
    backdrop.classList.remove('show');
  });

  actEl.appendChild(buyBtn);
  actEl.appendChild(cancelBtn);
  backdrop.classList.add('show');
}

// === Ремонт у кузнеца ===
export function openRepair() {
  const shopEl = document.getElementById('shop');
  if (!shopEl) return;

  const title = document.getElementById('shopTitle');
  if (title) title.textContent = 'Кузнец — починка';
  const goldEl = document.getElementById('shopGold');
  if (goldEl) goldEl.textContent = state.gold;

  const grid = document.getElementById('shopGrid');
  grid.innerHTML = '';

  // Собрать повреждённые предметы (надетые + в сумке)
  const worn = [];
  for (const slot of EQ_SLOTS) {
    const it = state.eq[slot];
    if (it && it.maxDur > 0 && it.dur < it.maxDur) {
      worn.push({ location: 'eq', slot, it });
    }
  }
  state.inv.forEach((it, idx) => {
    if (it && it.maxDur > 0 && it.dur < it.maxDur) {
      worn.push({ location: 'inv', idx, it });
    }
  });

  if (worn.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;font-style:italic;color:#7a5a38">Всё снаряжение в порядке.</div>`;
  } else {
    for (const w of worn) {
      const cost = Math.ceil((w.it.maxDur - w.it.dur) * (w.it.price || 50) * 0.02) + 5;
      const card = document.createElement('div');
      card.className = 'shopItem';
      if (state.gold < cost) card.classList.add('disabled');
      card.innerHTML = `
        <div class="si">${w.it.icon || '🔧'}</div>
        <div class="sn">${w.it.name}</div>
        <div class="sp">${cost} 💰</div>
        <div style="font-size:11px;color:#7a5a38;text-align:center;margin-top:4px">
          ${w.it.dur}/${w.it.maxDur}
        </div>
      `;
      card.addEventListener('click', e => {
        e.stopPropagation();
        if (state.gold < cost) { addChatMsg('Мало золота!'); return; }
        state.gold -= cost;
        w.it.dur = w.it.maxDur;
        addChatMsg(`🔧 Починено: ${w.it.name}`);
        if (goldEl) goldEl.textContent = state.gold;
        renderInventory();
        openRepair();
      });
      grid.appendChild(card);
    }
  }

  const closeBtn = document.getElementById('shopClose');
  if (closeBtn && !closeBtn._bound) {
    closeBtn._bound = true;
    closeBtn.addEventListener('click', () => shopEl.classList.remove('show'));
  }

  shopEl.classList.add('show');
}

// === Лечение у аптекаря ===
export function healPlayer() {
  const beforeHp = state.hp;
  const beforeMp = state.mp;
  state.hp = state.hpMax;
  state.mp = state.mpMax;

  // Обновить UI баров
  const hpF = document.getElementById('hpBarFill');
  const mpF = document.getElementById('mpBarFill');
  const hpT = document.getElementById('hpBarText');
  const mpT = document.getElementById('mpBarText');
  if (hpF) hpF.style.width = '100%';
  if (mpF) mpF.style.width = '100%';
  if (hpT) hpT.textContent = `${state.hpMax}/${state.hpMax}`;
  if (mpT) mpT.textContent = `${state.mpMax}/${state.mpMax}`;

  const healedHp = Math.round(state.hp - beforeHp);
  const healedMp = Math.round(state.mp - beforeMp);
  addChatMsg(`💚 +${healedHp} HP, +${healedMp} MP`);
}

// Подключить обработчики вкладок и кнопок после загрузки DOM
export function initShopUI() {
  document.querySelectorAll('.shopTab').forEach(t => {
    t.addEventListener('click', e => {
      e.stopPropagation();
      openShop(t.dataset.tab);
    });
  });
  const closeBtn = document.getElementById('shopClose');
  if (closeBtn && !closeBtn._bound) {
    closeBtn._bound = true;
    closeBtn.addEventListener('click', () => document.getElementById('shop').classList.remove('show'));
  }
  // Закрытие попапа покупки по клику на фон
  const backdrop = document.getElementById('buyConfirm');
  if (backdrop && !backdrop._bound) {
    backdrop._bound = true;
    backdrop.addEventListener('click', e => {
      if (e.target.id === 'buyConfirm') backdrop.classList.remove('show');
    });
  }
}