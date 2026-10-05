// Меню: старт, выбор класса, кастомизация, выбор персонажа.

import * as THREE from 'three';
import { state } from '../core/state.js';
import { RACE_PALETTES } from '../../data/palettes.js';
import { loadChars, saveChars, makeCharRecord, applyCharToState, saveSys } from '../systems/save.js';

export function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  if (id) document.getElementById(id)?.classList.add('show');
}

export function initMenus(onStartGame) {
  document.getElementById('btnPlay')?.addEventListener('click', () => {
    const chars = loadChars();
    if (chars.length === 0) {
      goCreate();
      return;
    }
    window.__selectedCharIdx = 0;
    show('charSelectScreen');
    setTimeout(() => {
      initCharViewer();
      renderCharList(onStartGame);
    }, 50);
  });

  document.getElementById('btnSettings')?.addEventListener('click', () => show('settingsScreen'));
  document.getElementById('btnToPath')?.addEventListener('click', () => show('classScreen'));
  document.getElementById('btnBackMenu1')?.addEventListener('click', () => show('menuScreen'));
  document.getElementById('btnBackMenu2')?.addEventListener('click', () => show('menuScreen'));
  document.getElementById('btnBackClass')?.addEventListener('click', () => show('classScreen'));
  document.getElementById('btnBackCustom')?.addEventListener('click', () => show('customScreen'));
  document.getElementById('btnToName')?.addEventListener('click', () => show('nameScreen'));
  document.getElementById('btnBackMenu3')?.addEventListener('click', () => show('menuScreen'));

  document.querySelectorAll('.classCard').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.classCard').forEach(c => c.classList.remove('sel'));
      card.classList.add('sel');
      state.character.class = card.dataset.class;
      const pal = RACE_PALETTES[state.character.class];
      state.character.skin = pal.skins[0];
      state.character.hair = pal.hairs[0];
      state.character.outfit = pal.outfits[0];
      buildSwatches(document.getElementById('skinSwatches'), pal.skins, 'skin');
      buildSwatches(document.getElementById('hairSwatches'), pal.hairs, 'hair');
      buildSwatches(document.getElementById('outfitSwatches'), pal.outfits, 'outfit');
      setTimeout(() => show('customScreen'), 150);
    });
  });

  // Кнопки старта (создание нового персонажа)
  document.getElementById('btnStartGame')?.addEventListener('click', () => {
    const n = document.getElementById('nameInput')?.value.trim() || 'Герой';
    state.character.name = n;
    const chars = loadChars();
    if (chars.length >= saveSys.MAX_CHARS) return;
    chars.push(makeCharRecord(state));
    saveChars(chars);
    window.__selectedCharIdx = chars.length - 1;
    show('charSelectScreen');
    setTimeout(() => {
      initCharViewer();
      renderCharList(onStartGame);
    }, 80);
  });

  // Кнопки в экране выбора
  document.getElementById('btnNewChar')?.addEventListener('click', goCreate);
  document.getElementById('btnEnterGame')?.addEventListener('click', () => {
    const chars = loadChars();
    const idx = window.__selectedCharIdx ?? 0;
    if (idx < 0 || idx >= chars.length) return;
    applyCharToState(state, chars[idx]);
    onStartGame();
  });
  document.getElementById('btnDeleteChar')?.addEventListener('click', () => {
    const chars = loadChars();
    const idx = window.__selectedCharIdx ?? 0;
    if (idx < 0 || idx >= chars.length) return;
    chars.splice(idx, 1);
    saveChars(chars);
    window.__selectedCharIdx = Math.max(0, idx - 1);
    renderCharList(onStartGame);
  });
}

function goCreate() {
  state.character.class = 'rift';
  state.character.gender = 'male';
  state.character.skin = RACE_PALETTES.rift.skins[0];
  state.character.hair = RACE_PALETTES.rift.hairs[0];
  state.character.outfit = RACE_PALETTES.rift.outfits[0];
  show('introScreen');
}

// === Сваты (цветовые) ===
export function buildSwatches(container, colors, key) {
  if (!container) return;
  container.innerHTML = '';
  for (const c of colors) {
    const sw = document.createElement('div');
    sw.className = 'sw' + (state.character[key] === c ? ' sel' : '');
    sw.style.background = '#' + new THREE.Color(c).getHexString();
    sw.addEventListener('click', () => {
      state.character[key] = c;
      container.querySelectorAll('.sw').forEach(s => s.classList.remove('sel'));
      sw.classList.add('sel');
      window.dispatchEvent(new CustomEvent('preview:rebuild'));
    });
    container.appendChild(sw);
  }
}

// === Выбор персонажа ===
export function renderCharList(onStartGame) {
  const listEl = document.getElementById('charList');
  if (!listEl) return;
  listEl.innerHTML = '';
  const chars = loadChars();
  const selIdx = window.__selectedCharIdx ?? -1;

  for (let i = 0; i < saveSys.MAX_CHARS; i++) {
    const c = chars[i];
    const card = document.createElement('div');
    if (c) {
      card.className = 'charSlotCard' + (i === selIdx ? ' sel' : '');
      card.innerHTML = `
        <div class="csa">${CLASS_ICON[c.class] || '❔'}</div>
        <div class="csl">
          <div class="csn">${c.name}</div>
          <div class="csc">${CLASS_RU[c.class] || '—'}</div>
        </div>
        <div class="csd">ур. ${c.level || 1}</div>`;
      card.addEventListener('click', () => {
        window.__selectedCharIdx = i;
        renderCharList(onStartGame);
        updateCharViewer();
      });
    } else {
      card.className = 'charSlotCard empty';
      card.innerHTML = `
        <div class="csa">➕</div>
        <div class="csl">
          <div class="csn">Свободный слот</div>
          <div class="csc">создать нового</div>
        </div>`;
      card.addEventListener('click', goCreate);
    }
    listEl.appendChild(card);
  }
  updateCharViewer();
}

export const CLASS_RU = { rift: 'Провал', core: 'Ядро', frost: 'Мороз' };
export const CLASS_ICON = { rift: '🔵', core: '🟣', frost: '⚪' };

let cvRenderer = null, cvScene = null, cvCamera = null, cvModel = null, cvRunning = false;
let cvRotY = 0, cvDragging = false, cvLastX = 0;

export function initCharViewer() {
  const canvas = document.getElementById('charViewerCanvas');
  if (!canvas || cvRenderer) return;
  cvRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  cvRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  cvRenderer.setSize(260, 340, false);
  cvScene = new THREE.Scene();
  cvCamera = new THREE.PerspectiveCamera(32, 260 / 340, 0.1, 40);
  cvCamera.position.set(0, 1.15, 4.8);
  cvCamera.lookAt(0, 1.0, 0);
  cvScene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.9));
  const l = new THREE.DirectionalLight(0xffffff, 0.9);
  l.position.set(3, 5, 4);
  cvScene.add(l);

  cvRunning = true;
  const loop = () => {
    if (!cvRunning) return;
    requestAnimationFrame(loop);
    if (cvModel) {
      if (!cvDragging) cvRotY += 0.008;
      cvModel.rotation.y = cvRotY;
      cvRenderer.render(cvScene, cvCamera);
    }
  };
  loop();

  canvas.addEventListener('touchstart', e => {
    cvDragging = true;
    cvLastX = e.touches[0].clientX;
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (!cvDragging) return;
    const dx = e.touches[0].clientX - cvLastX;
    cvLastX = e.touches[0].clientX;
    cvRotY += dx * 0.012;
  }, { passive: true });
  canvas.addEventListener('touchend', () => { cvDragging = false; });
}

export function updateCharViewer() {
  if (!cvScene) return;
  const chars = loadChars();
  const idx = window.__selectedCharIdx ?? 0;
  if (idx < 0 || idx >= chars.length) return;
  const c = chars[idx];

  if (cvModel) { cvScene.remove(cvModel); cvModel = null; }

  // Импорт createHumanoid — вне модуля, через window для простоты
  cvModel = window.createHumanoid({
    skin: c.appearance.skin, hair: c.appearance.hair,
    shirt: c.appearance.outfit, pants: 0x5a4a48,
    gender: c.appearance.gender, hairStyle: c.appearance.hairStyle,
    eyeColor: c.appearance.eyeColor, mouthStyle: c.appearance.mouthStyle,
    bodyType: c.appearance.bodyType, beard: c.appearance.beard,
  });
  cvModel.scale.setScalar(0.82);
  cvScene.add(cvModel);
  cvRotY = 0;

  const infoEl = document.getElementById('charViewerInfo');
  const classEl = document.getElementById('charViewerClass');
  if (infoEl) infoEl.textContent = c.name;
  if (classEl) classEl.textContent = (CLASS_RU[c.class] || '—') + ' · ' + (c.appearance.gender === 'female' ? '♀' : '♂');
}