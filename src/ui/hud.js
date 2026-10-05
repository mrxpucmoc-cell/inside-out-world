// HUD: HP/MP/XP, кнопки, чат.

import { state } from '../core/state.js';
import { world } from '../core/scene.js';
import { clamp } from '../core/assets.js';

export const hud = {
  chatOpen: false,
  chatTab: 'general',
  messages: { general: [], guild: [], party: [], pm: [] },
};

export function initHud() {
  document.getElementById('hud')?.classList.add('on');

  document.getElementById('chatToggle')?.addEventListener('click', toggleChat);
  document.getElementById('chatClose')?.addEventListener('click', () => {
    hud.chatOpen = false;
    document.getElementById('chatPanel')?.classList.remove('show');
  });
  document.querySelectorAll('.chatTab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.chatTab').forEach(b => b.classList.remove('sel'));
      t.classList.add('sel');
      hud.chatTab = t.dataset.chat;
      renderChatBody();
    });
  });

  window.addEventListener('player:xp', updateXPBar);
  window.addEventListener('player:gold', () => {});
}

export function updateOrbs() {
  const hpP = clamp(state.hp / state.hpMax, 0, 1);
  const mpP = clamp(state.mp / state.mpMax, 0, 1);
  const hpF = document.getElementById('hpBarFill');
  const mpF = document.getElementById('mpBarFill');
  if (hpF) hpF.style.width = (hpP * 100) + '%';
  if (mpF) mpF.style.width = (mpP * 100) + '%';
  const hpT = document.getElementById('hpBarText');
  const mpT = document.getElementById('mpBarText');
  if (hpT) hpT.textContent = Math.ceil(state.hp) + '/' + state.hpMax;
  if (mpT) mpT.textContent = Math.ceil(state.mp) + '/' + state.mpMax;
}

export function updateXPBar() {
  const pct = (state.xp / state.xpNext * 100).toFixed(1) + '%';
  const f = document.getElementById('xpBarFill');
  if (f) f.style.width = pct;
  const t = document.getElementById('xpBarText');
  if (t) t.textContent = `${state.xp} / ${state.xpNext}`;
}

export function updateZoneUI(zone) {
  const nameEl = document.getElementById('zoneSubName');
  if (nameEl) nameEl.textContent = zone.name || '—';
  const msg = document.getElementById('zoneMsg');
  if (msg && zone.name) {
    msg.textContent = zone.name;
    msg.classList.add('show');
    clearTimeout(msg._t);
    msg._t = setTimeout(() => msg.classList.remove('show'), 2600);
  }
}

export function updateAbilityUI() {
  const state1 = window.gameState;
  const cdEl = document.getElementById('ability1Cd');
  const btn = document.getElementById('ability1');
  if (!btn || !cdEl) return;
  if (state.abilityCd > 0) {
    btn.classList.add('onCd');
    cdEl.textContent = Math.ceil(state.abilityCd);
  } else btn.classList.remove('onCd');
}

// === Чат ===
export function addChatMsg(text, tab = 'general') {
  const arr = hud.messages[tab];
  arr.push(text);
  while (arr.length > 200) arr.shift();
  if (hud.chatOpen && hud.chatTab === tab) {
    const body = document.getElementById('chatBody');
    if (!body) return;
    const d = document.createElement('div');
    d.textContent = text;
    body.appendChild(d);
    while (body.children.length > 200) body.firstChild.remove();
    body.scrollTop = body.scrollHeight;
  }
}

export function toggleChat() {
  hud.chatOpen = !hud.chatOpen;
  document.getElementById('chatPanel')?.classList.toggle('show', hud.chatOpen);
  if (hud.chatOpen) renderChatBody();
}

function renderChatBody() {
  const body = document.getElementById('chatBody');
  if (!body) return;
  body.innerHTML = '';
  for (const m of hud.messages[hud.chatTab]) {
    const d = document.createElement('div');
    d.textContent = m;
    body.appendChild(d);
  }
  body.scrollTop = body.scrollHeight;
}