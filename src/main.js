// Точка входа.

import { supabase } from '../supabaseClient.js';
import { VILLAGE, HALF, CHUNK, TELEPORT_POS } from './core/constants.js';
import { openShop, openRepair, healPlayer, initShopUI } from './ui/shop.js';
import { spawnNPC, findNPC, updateNPCs, findNearestNPC, npcMeshes, npcList } from './entities/npc.js';
import * as THREE from 'three';
import { initScene, world, updateCameraFollow, setZoom, snapCamera, IS_MOBILE } from './core/scene.js';
import { initInput, input, readMove } from './core/input.js';
import { initMenus, show, loadChars } from './ui/menus.js';
import { saveChars } from './systems/save.js';
import { state, addXP, addGold } from './core/state.js'; state.stepUp = null;
import { rnd, ri, clamp } from './core/assets.js';
import { createHumanoid, ensureAnimState, animateHumanoid } from './entities/humanoid.js';
import { initTerrain, buildChunk, getHeight, isWater, isOnBridgeExact, groundHeight, hitsCollider } from './world/terrain.js';
import { initDecor, populateWorld, buildDecor, decor, buildFence, buildTeleport } from './world/decor.js';
import { loadZones, updateZones, zoneManager, isInVillage } from './world/zones.js';
import {
  combat, wireCombat, spawnProjectile, killEnemy,
  updateProjectiles, updateEnemyProjectiles, updateFireParticles,
  updateEffects, updateFloaters, spawnWave, applyBurn, updateBurns,
} from './systems/combat.js';
import { spawner, spawnRandomMob, spawnFromZone, updateMobs, queueRespawn, findMobByKey } from './systems/spawn.js';
import { withSeededRandom, WORLD_SEED } from './systems/worldRng.js';
import { DialogEngine } from './systems/dialog.js';
import { QuestEngine } from './systems/quest.js';
import { initHud, updateOrbs, updateXPBar, updateZoneUI, updateAbilityUI, addChatMsg } from './ui/hud.js';
import { panels, initInventoryUI, renderInventory, toggleInventory, openStatsPanel,
  openQuestPanel, openMapPanel, showDialogUI, hideDialogUI, renderQuestList, initQuestTabs } from './ui/panels.js';
import { applyEquipmentVisuals, recalcStats, totalDamage, playerAttackSpeed, playerAttackRange,
  playerRanged, classifyWeapon, gainSkillXP, critChance } from './systems/inventory.js';

window.createHumanoid = createHumanoid;
window.registry = { items: {}, mobs: {}, quests: {}, dialogs: {}, zones: {}, abilities: {} };
window.gameState = state;

const dialogEngine = new DialogEngine();
const questEngine = new QuestEngine();
let hero, playerRoot, weaponAnchor, shieldAnchor, weaponSheathAnchor, weaponHipAnchor, shieldSheathAnchor;
let playerNameLabel;
let currentWeaponMeshHand = null;
let attackHoldTime = 0;

// === Глобальные переменные для онлайн-систем ===
let currentUser = null;
let autoSaveIntervalId = null;
let playersChannel = null;
let positionChannel = null;
let presenceChannel = null;
let lastBroadcastTime = 0;
let lastBroadcastEquip = '';
let lastSentGuild = '';
let remotePlayers = {};
let remoteProjectiles = [];
let lastChannelBroadcast = 0;
let localBloodPool = null;
let remoteBloodPools = {};

// === Обновление счётчиков зелий над кнопкой ⚔ ===
function updatePotionBar() {
  const hpCount = state.inv.filter(i => i.id === 'hp_potion').length;
  const mpCount = state.inv.filter(i => i.id === 'mp_potion').length;
  const hpEl = document.getElementById('potionHpCnt');
  const mpEl = document.getElementById('potionMpCnt');
  if (hpEl) hpEl.textContent = hpCount;
  if (mpEl) mpEl.textContent = mpCount;
  const hpSlot = document.getElementById('potionHpSlot');
  const mpSlot = document.getElementById('potionMpSlot');
  if (hpSlot) hpSlot.style.opacity = hpCount > 0 ? '1' : '0.45';
  if (mpSlot) mpSlot.style.opacity = mpCount > 0 ? '1' : '0.45';
}

function setCombatMode(on) {
  if (state.combatMode === on) return;
  state.combatMode = on;
  if (weaponAnchor) for (const c of weaponAnchor.children) c.visible = on;
  if (shieldAnchor) for (const c of shieldAnchor.children) c.visible = on;
  if (weaponSheathAnchor) for (const c of weaponSheathAnchor.children) c.visible = !on;
  if (weaponHipAnchor) for (const c of weaponHipAnchor.children) c.visible = !on;
  if (shieldSheathAnchor) for (const c of shieldSheathAnchor.children) c.visible = !on;
  if (hero) state.handAnim = { type: on ? 'draw' : 'sheath', t: 0, dur: 0.55 };
}

function isStaffChanneling() {
  const w = state.eq.weapon;
  return !!(w && w.kind === 'staff' && w.ranged === 'fire');
}

function weaponManaCost() {
  const w = state.eq.weapon;
  return w?.manaCost || 0;
}

function getWeaponWorldTip() {
  if (!playerRoot) return new THREE.Vector3(0, 1.5, 0);
  let tip;
  if (currentWeaponMeshHand && currentWeaponMeshHand.visible && currentWeaponMeshHand.parent) {
    tip = new THREE.Vector3();
    currentWeaponMeshHand.getWorldPosition(tip);
    tip.y += 0.25;
  } else {
    tip = playerRoot.position.clone().setY(1.5);
  }
  const gy = groundHeight(tip.x, tip.z);
  if (tip.y < gy + 1.2) tip.y = gy + 1.2;
  return tip;
}

// ============================================================
// ЗАГРУЗКА ДАННЫХ — ПАРАЛЛЕЛЬНО
// ============================================================
async function loadData() {
  const files = {
    items:     'data/items.json',
    mobs:      'data/mobs.json',
    quests:    'data/quests.json',
    dialogs:   'data/dialogs.json',
    zones:     'data/zones.json',
    abilities: 'data/abilities.json',
  };

  const t0 = performance.now();

  // Параллельная загрузка — все запросы одновременно
  const results = await Promise.all(
    Object.entries(files).map(async ([key, path]) => {
      try {
        const res = await fetch(path, { cache: 'force-cache' });
        const text = await res.text();
        if (!text || text.length === 0) throw new Error('Пустой ответ');
        const clean = text.replace(/^\uFEFF/, '').trim();
        if (clean[0] !== '{' && clean[0] !== '[') throw new Error('Не JSON');
        return [key, normalizeColors(JSON.parse(clean))];
      } catch (e) {
        console.error(`[data] ОШИБКА для ${path}:`, e);
        return [key, {}];
      }
    })
  );

  for (const [key, data] of results) {
    window.registry[key] = data;
    console.log(`[data] ${key} — ключей:`, Object.keys(data).length);
  }

  console.log(`[data] Все данные за ${Math.round(performance.now() - t0)} мс`);

  dialogEngine.load(window.registry.dialogs);
  dialogEngine.state = state;
  dialogEngine.quest = questEngine;
  dialogEngine.onRender = showDialogUI;
  dialogEngine.onClose = hideDialogUI;

  questEngine.load(window.registry.quests);
  questEngine.state = state;
  questEngine.dialog = dialogEngine;
  questEngine.onProgress = (qid, stage) => {
    renderQuestList();
    if (stage === 'accepted' || stage === 'stageAdvance' || stage === 'complete') {
      savePlayerProgress();
    }
  };
  questEngine.onComplete = (qid, q) => {
    if (!state.completedQuests.includes(qid)) {
      state.completedQuests.push(qid);
    }
    addChatMsg(`✅ Квест «${q.name}» завершён!`);
    savePlayerProgress();
  };

  loadZones(window.registry.zones);
}

function normalizeColors(obj) {
  if (Array.isArray(obj)) return obj.map(normalizeColors);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        if (/^0x[0-9a-fA-F]{6}$/.test(v)) out[k] = parseInt(v, 16);
        else if (/^#[0-9a-fA-F]{6}$/.test(v)) out[k] = parseInt(v.slice(1), 16);
        else if (/^[0-9a-fA-F]{6}$/.test(v)) out[k] = parseInt(v, 16);
        else out[k] = v;
      } else out[k] = normalizeColors(v);
    }
    return out;
  }
  return obj;
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ИГРОВЫХ СИСТЕМ
// ============================================================
function initGameSystems() {
  window.__decor = decor;
  initScene(document.body);
  initTerrain();
  initDecor();
  initHud();
  initQuestTabs();
  initInventoryUI();
  initShopUI();

  spawner.collidesAt = hitsCollider;
  spawner.isWater = isWater;
  spawner.isOnBridge = isOnBridgeExact;
  spawner.isInVillage = (x, z) => {
    const v = zoneManager.zones.find(zn => zn.id === 'village');
    if (!v) return false;
    return Math.hypot(x - v.center.x, z - v.center.z) < v.radius;
  };
  spawner.groundHeight = groundHeight;

  wireCombat({
    getAllMobs: () => spawner.mobs,
    getPlayerPos: () => playerRoot?.position || null,
    playerAttackSpeed: () => playerAttackSpeed(),
  });
  window.combat = combat;
  combat.getGroundHeight = groundHeight;

  combat.beforeKill = (e) => {
    const myId = currentUser?.id;
    if (!myId) { e.rewardMultiplier = 1; return; }
    const c = e.contributions || {};
    const myDmg = c[myId] || 0;
    const totalDmg = Object.values(c).reduce((a, b) => a + b, 0);
    if (totalDmg <= 0 || myDmg <= 0) { e.rewardMultiplier = 1; return; }
    e.rewardMultiplier = Math.max(0.1, myDmg / totalDmg);
  };

  combat.onMobDamaged = (e, dmg) => {
    const myId = currentUser?.id;
    if (!myId || !e.syncKey) return;
    if (!e.contributions) e.contributions = {};
    e.contributions[myId] = (e.contributions[myId] || 0) + dmg;
    positionChannel?.send({
      type: 'broadcast',
      event: 'mob_hit',
      payload: {
        key: e.syncKey,
        hp: Math.max(0, e.hp),
        dmg,
        hitterId: myId,
      },
    });
  };

  combat.onKillMob = (e, gold) => {
    positionChannel?.send({
      type: 'broadcast',
      event: 'mob_killed',
      payload: {
        key: e.syncKey,
        killerId: currentUser?.id,
        contributions: e.contributions || {},
        xpTotal: e._rawXp ?? e.type.stats.xp,
        goldTotal: e._rawGold ?? gold,
      },
    });
    addChatMsg(`☠ ${e.type.name} убит. +${gold}💰`);
    questEngine.onKill(e.defId);
    queueRespawn(e);
  };

  combat.onPlayerDeath = () => {
    onLocalPlayerDeath();
  };

  zoneManager.onEnterZone = (zone) => {
    updateZoneUI(zone);
    if (zone.id === 'quarry') questEngine.onReach('quarry');
  };

  const hidePanel = (id) => document.getElementById(id)?.classList.remove('show');

  initInput({
    canvas: world.renderer.domElement,
    ui: {
      ability1: useAbility,
      btnInv: toggleInventory,
      btnStats: openStatsPanel,
      btnQuests: openQuestPanel,
      btnMap: openMapPanel,
      btnMenu: () => document.getElementById('menuPanel')?.classList.add('show'),
      btnCraft: () => addChatMsg('⚒️ Крафт: в разработке'),
      potionHpSlot: () => consumePotion('hp_potion'),
      potionMpSlot: () => consumePotion('mp_potion'),
      statsClose: () => hidePanel('statsPanel'),
      questClose: () => hidePanel('questPanel'),
      mapClose: () => hidePanel('mapPanel'),
      menuResume: () => hidePanel('menuPanel'),
      actionDialogBtn: () => {
        const npc = findNearestNPC(playerRoot.position, 4.5);
        if (!npc) { addChatMsg('Рядом нет NPC'); return; }
        if (dialogEngine) dialogEngine.start(npc.dialogId, npc);
      },
    },
  });
  input.onTap = handleWorldTap;
  input.onZoom = setZoom;
  input.onAttackStart = () => {
    setCombatMode(true);
    state.combatMode = true;
    state.combatTimer = 6;
  };
  input.onAttackEnd = () => {
    if (isStaffChanneling() && attackHoldTime > 0 && attackHoldTime < 0.3 && state.alive) {
      performStaffBurst();
    }
    attackHoldTime = 0;
    if (state.channeling) {
      state.channeling = false;
      state.channelTick = 0;
      state.swing = 0;
      state.attackType = 'melee';
    }
  };
  input.onUiBtn = (code) => {
    if (code === 'KeyI') toggleInventory();
    if (code === 'KeyQ') openQuestPanel();
    if (code === 'Escape') {
      hideDialogUI();
      document.getElementById('inv')?.classList.remove('open');
      document.getElementById('statsPanel')?.classList.remove('show');
      document.getElementById('questPanel')?.classList.remove('show');
      document.getElementById('itemPopupBackdrop')?.classList.remove('show');
    }
  };

  initMenus(startGame);
  window.__dialogEngine = dialogEngine;
  window.__questEngine = questEngine;
  window.__panels = panels;
  window.__spawner = spawner;
  window.__npcList = npcList;
  window.__zones = zoneManager.zones;
  window.__decor = decor;
  window.__playerPos = playerRoot?.position || null;
  window.__openShop = openShop;
  window.__openRepair = openRepair;
  window.__healPlayer = healPlayer;

  window.addEventListener('inv:changed', () => {
    try { updatePotionBar(); } catch (e) {}
  });
}

// ============================================================
// СТАРТ ИГРЫ — с промежуточными сообщениями загрузки
// ============================================================
function setLoadingText(text) {
  const el = document.getElementById('loadingText');
  if (el) el.textContent = text;
}

async function startGame() {
  show(null);
  document.getElementById('loadingOverlay')?.classList.add('show');

  try {
    setLoadingText('ЗАГРУЗКА ДАННЫХ...');
    await loadData();

    setLoadingText('ИНИЦИАЛИЗАЦИЯ...');
    initGameSystems();

    // Даём браузеру отрисовать "ЗАГРУЗКА ДАННЫХ..." перед тяжёлой синхронной работой
    await new Promise(r => setTimeout(r, 30));

    setLoadingText('ГЕНЕРАЦИЯ МИРА...');
    await new Promise(r => setTimeout(r, 30));   // разблокировать UI
    generateWorld();

    await new Promise(r => setTimeout(r, 30));
    setLoadingText('СОЗДАНИЕ ПЕРСОНАЖА...');
    createPlayer();

    gameRunning = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    document.getElementById('loadingOverlay')?.classList.remove('show');
    addChatMsg(`👋 Добро пожаловать, ${state.character.name}!`);
    updateZoneUI({ name: 'Деревня Гальда' });

    setLoadingText('СИНХРОНИЗАЦИЯ...');
    await loadPlayerProgress();
    startAutoSave();
    await savePlayerProgress();
    await initRealtimeSync();
    initPositionBroadcast();
  } catch (err) {
    console.error('[startGame] ОШИБКА:', err);
    console.error('[startGame] stack:', err.stack);
    document.getElementById('loadingOverlay')?.classList.remove('show');
  }
}

// ============================================================
// ГЕНЕРАЦИЯ МИРА — адаптивная под мобильные
// ============================================================
function generateWorld() {
  return withSeededRandom(WORLD_SEED, () => {
    // На мобильных грузим только центральные чанки (радиус 2 = 5×5 = 25 вместо 64)
    const CHUNK_RADIUS = IS_MOBILE ? 2 : 4;   // 4 → 8×8 на ПК, 2 → 5×5 на мобильном
    const PLAYER_CHUNK_X = Math.floor(VILLAGE.x / CHUNK) * CHUNK;
    const PLAYER_CHUNK_Z = Math.floor(VILLAGE.z / CHUNK) * CHUNK;

    const chunksToLoad = [];
    for (let i = -CHUNK_RADIUS; i <= CHUNK_RADIUS; i++) {
      for (let j = -CHUNK_RADIUS; j <= CHUNK_RADIUS; j++) {
        chunksToLoad.push([
          PLAYER_CHUNK_X + i * CHUNK,
          PLAYER_CHUNK_Z + j * CHUNK,
        ]);
      }
    }
    console.log(`[generateWorld] Чанков: ${chunksToLoad.length} (мобильный: ${IS_MOBILE})`);
    for (const [cx, cz] of chunksToLoad) buildChunk(cx, cz);

    populateWorld();
    buildDecor();
    buildFence();
    buildTeleport(VILLAGE.x, VILLAGE.z + 40);

    const CX = VILLAGE.x, CZ = VILLAGE.z;
    const faceCenter = (x, z) => Math.atan2(CX - x, CZ - z);

    const NPCS = [
      { type: 'helga', x: CX - 22, z: CZ - 22 },
      { type: 'dorn',  x: CX - 20, z: CZ - 8 },
      { type: 'radim', x: CX + 20, z: CZ - 8 },
      { type: 'mara',  x: CX + 22, z: CZ + 4 },
      { type: 'iva',   x: CX - 10, z: CZ + 22 },
      { type: 'yasen', x: CX + 10, z: CZ + 22 },
    ];
    for (const n of NPCS) {
      spawnNPC(n.type, n.x, n.z, faceCenter(n.x, n.z));
    }

    for (const zone of zoneManager.zones) spawnFromZone(zone, 2);

    // Мобы: на мобильных меньше секторов и мобов на сектор
    const zXMin = -200, zXMax = 330;
    const zZMin = -330, zZMax = 330;
    const SECTORS_X = IS_MOBILE ? 4 : 8;
    const SECTORS_Z = IS_MOBILE ? 4 : 8;
    const MOBS_PER_SECTOR = IS_MOBILE ? 1 : 3;
    const VILLAGE_GUARD_R = 130;
    let wildSpawned = 0;

    for (let sx = 0; sx < SECTORS_X; sx++) {
      for (let sz = 0; sz < SECTORS_Z; sz++) {
        const x0 = zXMin + (zXMax - zXMin) * sx / SECTORS_X;
        const x1 = zXMin + (zXMax - zXMin) * (sx + 1) / SECTORS_X;
        const z0 = zZMin + (zZMax - zZMin) * sz / SECTORS_Z;
        const z1 = zZMin + (zZMax - zZMin) * (sz + 1) / SECTORS_Z;
        for (let i = 0; i < MOBS_PER_SECTOR; i++) {
          for (let attempt = 0; attempt < 12; attempt++) {
            const x = rnd(x0, x1), z = rnd(z0, z1);
            if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE_GUARD_R) continue;
            const inZone = zoneManager.zones.some(zn =>
              Math.hypot(x - zn.center.x, z - zn.center.z) < zn.radius * 1.1
            );
            if (inZone) continue;
            if (isWater(x, z) && !isOnBridgeExact(x, z)) continue;
            if (hitsCollider(x, z, 1.0)) continue;
            if (spawnRandomMob(x, z)) { wildSpawned++; break; }
          }
        }
      }
    }
    console.log(`[generateWorld] Зональных: ${spawner.mobs.length - wildSpawned}, диких: ${wildSpawned}`);
  });
}

// ============================================================
// СОЗДАНИЕ ИГРОКА
// ============================================================
function createPlayer() {
  playerRoot = new THREE.Group();
  world.scene.add(playerRoot);
  hero = createHumanoid({
    skin: state.character.skin, hair: state.character.hair,
    shirt: state.character.outfit, pants: 0x5a4a48,
    gender: state.character.gender, hairStyle: state.character.hairStyle,
    eyeColor: state.character.eyeColor, mouthStyle: state.character.mouthStyle,
    bodyType: state.character.bodyType, beard: state.character.beard,
  });
  hero.scale.setScalar(0.95);
  playerRoot.add(hero);

  weaponAnchor = new THREE.Group(); hero.userData.handR.add(weaponAnchor);
  shieldAnchor = new THREE.Group(); hero.userData.handL.add(shieldAnchor);
  weaponSheathAnchor = new THREE.Group();
  weaponSheathAnchor.position.set(0.30, 0.80, -0.22);
  weaponSheathAnchor.rotation.set(-4.50, -0.45, 3.35);
  hero.userData.spineUpper.add(weaponSheathAnchor);
  weaponHipAnchor = new THREE.Group();
  weaponHipAnchor.position.set(0.28, 0.37, 0.02);
  weaponHipAnchor.rotation.set(0.70, 0, 2.95);
  hero.userData.pelvis.add(weaponHipAnchor);
  shieldSheathAnchor = new THREE.Group();
  shieldSheathAnchor.position.set(-0.02, 0.25, -0.32);
  hero.userData.spineUpper.add(shieldSheathAnchor);

  ensureAnimState(hero);
  recalcStats();
  state.hp = state.hpMax;
  state.mp = state.mpMax;

  const spawnX = VILLAGE.x, spawnZ = VILLAGE.z + 8;
  playerRoot.position.set(spawnX, groundHeight(spawnX, spawnZ), spawnZ);
  snapCamera(playerRoot.position);

  window.addEventListener('inv:changed', () => {
    applyEquipmentVisuals(hero, weaponAnchor, shieldAnchor, weaponSheathAnchor, weaponHipAnchor, shieldSheathAnchor);
    currentWeaponMeshHand = weaponAnchor.children[0] || null;
    state.combatTimer = 5;
    broadcastPosition(true);
  });

  const IT = window.registry.items || {};
  const mk = (id) => {
    const it = IT[id];
    if (!it) { console.warn('[start] item not found:', id); return null; }
    return { ...it, dur: it.maxDur ?? 0 };
  };

  const hpP = mk('hp_potion'), mpP = mk('mp_potion');
  if (hpP) state.inv.push({ ...hpP }, { ...hpP }, { ...hpP });
  if (mpP) state.inv.push({ ...mpP }, { ...mpP });

  const sword2h = mk('sword_2h');
  const staff   = mk('staff_oak');
  const bow     = mk('bow_battle');
  const wand    = mk('wand_wood');
  const javelin = mk('javelin_wood');
  if (sword2h) state.inv.push(sword2h);
  if (staff)   state.inv.push(staff);
  if (bow)     state.inv.push(bow);
  if (wand)    state.inv.push(wand);
  if (javelin) state.inv.push(javelin);

  const eq = {
    weapon: mk('sword_rusty'),
    shield: mk('shield_wooden'),
    helm:   mk('helm_leather'),
    armor:  mk('armor_cloth'),
    pants:  mk('pants_leather'),
    boots:  mk('boots_leather'),
    gloves: mk('gloves_leather'),
  };
  for (const [slot, it] of Object.entries(eq)) {
    if (it) state.eq[slot] = it;
  }

  applyEquipmentVisuals(hero, weaponAnchor, shieldAnchor, weaponSheathAnchor, weaponHipAnchor, shieldSheathAnchor);
  currentWeaponMeshHand = weaponAnchor.children[0] || null;

  renderInventory();
  updateOrbs();
  updateXPBar();
  updatePotionBar();

  playerNameLabel = makePlayerLabel(state.character.name, state.character.guild || '', true);
  document.getElementById('world-ui')?.appendChild(playerNameLabel);
}

// ============================================================
// ПЛАШКИ ИГРОКОВ
// ============================================================
function makePlayerLabel(name, guild, isSelf) {
  const wrap = document.createElement('div');
  wrap.className = 'plabel-wrap' + (isSelf ? ' self' : '');
  const guildEl = document.createElement('div');
  guildEl.className = 'plabel-guild';
  const nameEl = document.createElement('div');
  nameEl.className = 'plabel-name';
  const hpEl = document.createElement('div');
  hpEl.className = 'plabel-hp';
  const fill = document.createElement('div');
  fill.className = 'plabel-hp-fill';
  hpEl.appendChild(fill);
  wrap.appendChild(guildEl);
  wrap.appendChild(nameEl);
  wrap.appendChild(hpEl);
  wrap.style.display = 'none';
  wrap._update = (n, level, hp, hpMax, g) => {
    nameEl.textContent = `${n} [ур.${level}]`;
    if (g) { guildEl.textContent = g; guildEl.style.display = 'block'; }
    else { guildEl.style.display = 'none'; }
    const pct = Math.max(0, Math.min(1, hp / Math.max(1, hpMax)));
    fill.style.width = (pct * 100) + '%';
  };
  wrap._update(name, 1, 1, 1, guild);
  return wrap;
}

function updateSelfLabel() {
  if (!playerNameLabel || !playerRoot) return;
  if (!state.alive) { playerNameLabel.style.display = 'none'; return; }
  playerNameLabel._update(
    state.character.name,
    state.level,
    state.hp,
    state.hpMax,
    state.character.guild || ''
  );
  const wp = playerRoot.position.clone();
  wp.y += 3.1;
  const v = wp.project(world.camera);
  if (v.z < 1) {
    playerNameLabel.style.display = 'flex';
    playerNameLabel.style.transform =
      `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * innerWidth}px,${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
  } else {
    playerNameLabel.style.display = 'none';
  }
}

// ============================================================
// АНИМАЦИЯ СМЕРТИ + КРОВАВАЯ ЛУЖА
// ============================================================
function setDeathPose(char) {
  const P = char?.userData;
  if (!P) return;
  P.pelvis.rotation.set(1.5, 0.35, 0.55);
  P.pelvis.position.set(0.05, 0.22, 0);
  P.spineLower.rotation.set(0.25, 0.15, -0.15);
  P.spineUpper.rotation.set(0.15, 0.25, -0.15);
  P.headG.rotation.set(-0.5, 0.35, 0.2);
  P.armL.rotation.set(-0.5, 0, -1.25);
  P.elbowL.rotation.x = -0.45;
  P.armR.rotation.set(0.35, 0, 1.55);
  P.elbowR.rotation.x = -0.65;
  P.legL.rotation.set(-0.35, 0, 0.35);
  P.kneeL.rotation.x = 0.95;
  P.footL.rotation.x = 0.25;
  P.legR.rotation.set(0.45, 0, -0.25);
  P.kneeR.rotation.x = 0.35;
  P.footR.rotation.x = -0.15;
}

function resetPose(char) {
  const P = char?.userData;
  if (!P) return;
  P.pelvis.rotation.set(0, 0, 0);
  P.pelvis.position.set(0, 0.86, 0);
  P.spineLower.rotation.set(0.02, 0, 0);
  P.spineUpper.rotation.set(0.02, 0, 0);
  P.headG.rotation.set(0, 0, 0);
  P.armL.rotation.set(0.05, 0, -0.10);
  P.armR.rotation.set(0.05, 0, 0.10);
  P.elbowL.rotation.x = -0.30;
  P.elbowR.rotation.x = -0.30;
  P.legL.rotation.set(0, 0, 0);
  P.legR.rotation.set(0, 0, 0);
  P.kneeL.rotation.x = 0.05;
  P.kneeR.rotation.x = 0.05;
  P.footL.rotation.x = -0.02;
  P.footR.rotation.x = -0.02;
}

function spawnBloodPool(x, z) {
  if (localBloodPool) {
    world.scene.remove(localBloodPool);
    localBloodPool.geometry?.dispose();
    localBloodPool.material?.dispose();
  }
  const geo = new THREE.CircleGeometry(1, 28);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x5a0808, transparent: true, opacity: 0, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const y = groundHeight(x, z) + 0.05;
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(0.01);
  world.scene.add(mesh);
  localBloodPool = mesh;
  const start = performance.now();
  const dur = 1800;
  const maxR = 1.25;
  const tick = () => {
    if (!localBloodPool || localBloodPool !== mesh) return;
    const t = Math.min(1, (performance.now() - start) / dur);
    mesh.scale.setScalar(0.01 + t * maxR);
    mat.opacity = 0.9 * Math.min(1, t * 1.4);
    if (t < 1) requestAnimationFrame(tick);
  };
  tick();
}

function removeBloodPool() {
  if (localBloodPool) {
    world.scene.remove(localBloodPool);
    localBloodPool.geometry?.dispose();
    localBloodPool.material?.dispose();
    localBloodPool = null;
  }
}

function spawnRemoteBloodPool(userId, x, z) {
  removeRemoteBloodPool(userId);
  const geo = new THREE.CircleGeometry(1, 28);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x5a0808, transparent: true, opacity: 0, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, groundHeight(x, z) + 0.05, z);
  mesh.scale.setScalar(0.01);
  world.scene.add(mesh);
  remoteBloodPools[userId] = mesh;
  const start = performance.now();
  const dur = 1800;
  const maxR = 1.25;
  const tick = () => {
    if (remoteBloodPools[userId] !== mesh) return;
    const t = Math.min(1, (performance.now() - start) / dur);
    mesh.scale.setScalar(0.01 + t * maxR);
    mat.opacity = 0.9 * Math.min(1, t * 1.4);
    if (t < 1) requestAnimationFrame(tick);
  };
  tick();
}

function removeRemoteBloodPool(userId) {
  const mesh = remoteBloodPools[userId];
  if (!mesh) return;
  world.scene.remove(mesh);
  mesh.geometry?.dispose();
  mesh.material?.dispose();
  delete remoteBloodPools[userId];
}

function onLocalPlayerDeath() {
  document.getElementById('death').style.display = 'flex';
  const st = ensureAnimState(hero);
  st.mode = 'death';
  setDeathPose(hero);
  spawnBloodPool(playerRoot.position.x, playerRoot.position.z);
  positionChannel?.send({
    type: 'broadcast',
    event: 'player_death',
    payload: {
      userId: currentUser?.id,
      x: playerRoot.position.x,
      z: playerRoot.position.z,
    },
  });
}

// ============================================================
// ИГРОВОЙ ЦИКЛ
// ============================================================
let gameRunning = false;
let lastTime = 0;

function gameLoop(now) {
  if (!gameRunning) return;
  requestAnimationFrame(gameLoop);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (state.alive) update(dt);

  const aj = input.attackJoy;
  const ajPushing = aj.active && (Math.abs(aj.dx) > 0.15 || Math.abs(aj.dy) > 0.15);

  if (ajPushing && state.alive && gameRunning && playerRoot && hero) {
    const angle = Math.atan2(aj.dx, aj.dy);
    playerRoot.rotation.y = angle;
    setCombatMode(true);
    state.combatMode = true;
    state.combatTimer = 6;

    if (isStaffChanneling()) {
      if (state.mp <= 0) {
        addChatMsg('❌ Недостаточно маны');
        input.attackHeld = false;
        aj.active = false;
        aj.dx = 0; aj.dy = 0;
        setCombatMode(false);
      } else {
        state.channeling = true;
        updateStaffChannel(dt);
      }
    } else {
      if (state.atkCd <= 0) doDirectionalAttack();
    }
  } else if (input.attackHeld && state.alive && gameRunning && playerRoot && hero) {
    attackHoldTime += dt;
    if (isStaffChanneling()) {
      setCombatMode(true);
      state.combatMode = true;
      state.combatTimer = 6;
      if (attackHoldTime >= 0.3) {
        state.channeling = true;
        updateStaffChannel(dt);
      }
    } else {
      if (attackHoldTime >= 0.05 && state.atkCd <= 0) doDirectionalAttack();
    }
  } else {
    attackHoldTime = 0;
    if (state.channeling) {
      state.channeling = false;
      state.channelTick = 0;
      state.swing = 0;
      state.attackType = 'melee';
    }
  }

  updateAbilityUI();
  updateFireParticles(dt);
  updateEffects(dt);
  updateFloaters(dt, world.camera);
  if (state.hurtFlash > 0) state.hurtFlash -= dt;

  updateRemotePlayers(dt);
  updateRemoteProjectiles(dt);
  updateSelfLabel();

  broadcastPosition();

  world.renderer.render(world.scene, world.camera);
}

function update(dt) {
  if (!playerRoot || !hero) return;
  window.__playerPos = playerRoot.position;
  window.__playerRot = playerRoot.rotation.y;
  const anim = ensureAnimState(hero);
  anim.t += dt;
  anim.attackType = state.attackType;

  if (!state.combatMode) {
    state.manaRegenTick = (state.manaRegenTick || 0) + dt;
    if (state.manaRegenTick >= 0.6) {
      state.manaRegenTick = 0;
      if (state.mp < state.mpMax) state.mp = Math.min(state.mpMax, state.mp + 2);
    }
  }

  let moving = false;
  const { vx, vz } = readMove();
  const SPEED = 6.2;
  let dx = 0, dz = 0;

  if (state.channeling) { dx = 0; dz = 0; }
  else if (vx || vz) {
    const len = Math.hypot(vx, vz);
    dx = (vx / len) * SPEED * dt; dz = (vz / len) * SPEED * dt;
    playerRoot.rotation.y = Math.atan2(vx / len, vz / len);
    moving = true;
  } else if (input.attackTarget?.alive && !input.attackHeld) {
    const d = playerRoot.position.distanceTo(input.attackTarget.group.position);
    const stopDist = playerRanged() ? playerAttackRange() * 0.85 : playerAttackRange();
    if (d > stopDist) {
      const dir = input.attackTarget.group.position.clone().sub(playerRoot.position).normalize();
      dx = dir.x * SPEED * dt; dz = dir.z * SPEED * dt;
      playerRoot.rotation.y = Math.atan2(dir.x, dir.z);
      moving = true;
    }
  } else if (input.moveTarget) {
    const d = playerRoot.position.distanceTo(input.moveTarget);
    if (d > 0.3) {
      const dir = input.moveTarget.clone().sub(playerRoot.position).normalize();
      dx = dir.x * SPEED * dt; dz = dir.z * SPEED * dt;
      playerRoot.rotation.y = Math.atan2(dir.x, dir.z);
      moving = true;
    } else input.moveTarget = null;
  }

  if (dx || dz) {
    const nxp = playerRoot.position.x + dx;
    const nzp = playerRoot.position.z + dz;
    if (!hitsCollider(nxp, playerRoot.position.z, 0.42) &&
        !(isWater(nxp, playerRoot.position.z) && !isOnBridgeExact(nxp, playerRoot.position.z))) {
      playerRoot.position.x = nxp;
    }
    if (!hitsCollider(playerRoot.position.x, nzp, 0.42) &&
        !(isWater(playerRoot.position.x, nzp) && !isOnBridgeExact(playerRoot.position.x, nzp))) {
      playerRoot.position.z = nzp;
    }
  }

  const py = groundHeight(playerRoot.position.x, playerRoot.position.z);
  playerRoot.position.y += (py - playerRoot.position.y) * Math.min(1, dt * 18);

  if (state.channeling) { anim.mode = 'attack'; anim.attackType = 'staff'; anim.swing = 0.5; }
  else if (state.swing > 0) { anim.mode = 'attack'; anim.swing = state.swing; }
  else if (moving) { anim.mode = 'walk'; anim.walkPhase += dt * 9; }
  else anim.mode = 'idle';
  animateHumanoid(hero, anim, dt);

  if (state.atkCd > 0) state.atkCd -= dt;
  if (state.abilityCd > 0) state.abilityCd -= dt;
  if (state.swing > 0 && !state.channeling) state.swing -= dt * 4.2;

  if (state.combatTimer > 0) state.combatTimer -= dt;
  else if (state.combatMode && !state.channeling) setCombatMode(false);

  updateNPCs(dt);
  updateMobs(dt, playerRoot.position);
  updateProjectiles(dt);
  updateEnemyProjectiles(dt, playerRoot.position);
  updateBurns(dt);
  updateZones(playerRoot.position, dt);

  updateCameraFollow(playerRoot.position, dt);
  updateOrbs();
}

function fireProjectile(startPos, dir, dmgRange, kind, target) {
  spawnProjectile(startPos, dir, dmgRange, kind, target);
  positionChannel?.send({
    type: 'broadcast',
    event: 'projectile',
    payload: {
      userId: currentUser?.id,
      kind,
      x: startPos.x, y: startPos.y, z: startPos.z,
      dx: dir.x, dy: dir.y, dz: dir.z,
    },
  });
}

function doAttack() {
  setCombatMode(true);
  state.combatMode = true;
  state.combatTimer = 6;

  const ranged = playerRanged();
  if (ranged) {
    const manaCost = weaponManaCost();
    if (manaCost > 0) {
      if (state.mp < manaCost) { addChatMsg('❌ Недостаточно маны'); return; }
      state.mp -= manaCost;
    }
    const rotY = playerRoot.rotation.y;
    const forward = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    const maxRange = playerAttackRange();

    const pvp = findPvpTargetInCone(forward, maxRange);
    if (pvp) {
      state.atkCd = playerAttackSpeed();
      state.swing = 1;
      state.attackType = ranged === 'fire' ? 'staff' : 'bow';
      doPvpAttack(pvp);
      return;
    }

    let target = null, bestScore = -Infinity;
    for (const e of spawner.mobs) {
      if (!e.alive) continue;
      const toE = e.group.position.clone().sub(playerRoot.position);
      toE.y = 0; const dist = toE.length();
      if (dist > maxRange) continue;
      toE.normalize();
      const dot = toE.dot(forward);
      if (dot < 0.15) continue;
      const score = dot * 3.0 - dist * 0.02;
      if (score > bestScore) { bestScore = score; target = e; }
    }
    state.atkCd = playerAttackSpeed();
    state.swing = 1;
    state.attackType = ranged === 'fire' ? 'staff' : 'bow';
    const startPos = getWeaponWorldTip();
    if (target) {
      const tPos = target.group.position.clone();
      tPos.y += 0.9 * (target.type.scale || 1);
      const dir = tPos.sub(startPos).normalize();
      fireProjectile(startPos, dir, totalDamage(), ranged, target);
    } else {
      fireProjectile(startPos, forward, totalDamage(), ranged, null);
    }
    return;
  }

  let target = input.attackTarget;
  const range = playerAttackRange();
  const dist = target ? playerRoot.position.distanceTo(target.group.position) : Infinity;
  if (!target?.alive || dist > range * 1.6) {
    let best = null, bestD = range * 1.8;
    for (const e of spawner.mobs) {
      if (!e.alive) continue;
      const d = playerRoot.position.distanceTo(e.group.position);
      if (d < bestD) { bestD = d; best = e; }
    }
    target = best;
  }
  if (!target) {
    state.swing = 1;
    state.atkCd = playerAttackSpeed() * 0.5;
    state.attackType = 'melee';
    return;
  }
  const dir = target.group.position.clone().sub(playerRoot.position);
  dir.y = 0; dir.normalize();
  playerRoot.rotation.y = Math.atan2(dir.x, dir.z);
  const finalDist = playerRoot.position.distanceTo(target.group.position);
  if (finalDist <= range * 1.15) {
    combat.doMeleeAttack(target, playerRoot.position, playerRoot.rotation.y);
  } else {
    state.swing = 1;
    state.atkCd = playerAttackSpeed() * 0.6;
    state.attackType = 'melee';
  }
}

function doDirectionalAttack() {
  if (!playerRoot || !hero) return;
  if (state.atkCd > 0) return;
  setCombatMode(true);
  state.combatMode = true;
  state.combatTimer = 6;

  const rotY = playerRoot.rotation.y;
  const forward = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
  const ranged = playerRanged();

  if (ranged) {
    const manaCost = weaponManaCost();
    if (manaCost > 0) {
      if (state.mp < manaCost) { addChatMsg('❌ Недостаточно маны'); return; }
      state.mp -= manaCost;
    }
    state.atkCd = playerAttackSpeed();
    state.swing = 1;
    state.attackType = ranged === 'fire' ? 'staff' : 'bow';

    const pvp = findPvpTargetInCone(forward, playerAttackRange());
    if (pvp) { doPvpAttack(pvp); return; }

    const startPos = getWeaponWorldTip();
    fireProjectile(startPos, forward, totalDamage(), ranged, null);
    return;
  }

  const maxRange = playerAttackRange() * 1.15;
  let best = null, bestScore = -Infinity;
  for (const e of spawner.mobs) {
    if (!e.alive) continue;
    const toE = e.group.position.clone().sub(playerRoot.position);
    toE.y = 0;
    const dist = toE.length();
    if (dist > maxRange) continue;
    toE.normalize();
    const dot = toE.dot(forward);
    if (dot < 0.4) continue;
    const score = dot * 3 - dist * 0.15;
    if (score > bestScore) { bestScore = score; best = e; }
  }

  const pvpTarget = findPvpTargetInCone(forward, maxRange);

  if (pvpTarget) {
    doPvpAttack(pvpTarget);
  } else if (best) {
    combat.doMeleeAttack(best, playerRoot.position, playerRoot.rotation.y);
  } else {
    state.atkCd = playerAttackSpeed() * 0.7;
    state.swing = 1;
    state.attackType = 'melee';
  }
}

function findPvpTargetInCone(forward, maxRange) {
  if (!playerRoot) return null;
  if (isInVillage(playerRoot.position.x, playerRoot.position.z)) return null;
  let best = null, bestScore = -Infinity;
  for (const uid in remotePlayers) {
    const rp = remotePlayers[uid];
    if (rp.isDead) continue;
    const toP = rp.mesh.position.clone().sub(playerRoot.position);
    toP.y = 0;
    const dist = toP.length();
    if (dist > maxRange) continue;
    toP.normalize();
    const dot = toP.dot(forward);
    if (dot < 0.4) continue;
    const score = dot * 3 - dist * 0.15 + 1.5;
    if (score > bestScore) { bestScore = score; best = rp; }
  }
  return best;
}

function doPvpAttack(rp) {
  state.atkCd = playerAttackSpeed();
  state.swing = 1;

  const ranged = playerRanged();
  state.attackType = ranged ? (ranged === 'fire' ? 'staff' : 'bow') : 'melee';

  const dmgRange = totalDamage();
  let dmg = ri(dmgRange[0], dmgRange[1]);
  if (Math.random() < critChance()) dmg = Math.floor(dmg * 1.8);
  dmg = Math.max(1, Math.floor(dmg * 0.7));

  if (ranged) {
    const startPos = getWeaponWorldTip();
    const tPos = rp.mesh.position.clone();
    tPos.y += 1.4;
    const dir = tPos.sub(startPos).normalize();
    fireProjectile(startPos, dir, dmgRange, ranged, null);
    const wp = rp.mesh.position.clone();
    wp.y += 2.3;
    combat.spawnFloater(wp, dmg, 'crit');
  } else {
    const wp = rp.mesh.position.clone();
    wp.y += 2.3;
    combat.spawnFloater(wp, dmg, 'crit');
  }

  positionChannel?.send({
    type: 'broadcast',
    event: 'pvp_hit',
    payload: { targetId: rp.userId, dmg },
  });
}

function updateStaffChannel(dt) {
  if (!state.channeling) return;
  if (!playerRoot || !hero || !state.eq.weapon) {
    state.channeling = false;
    state.channelTick = 0;
    return;
  }
  const manaCost = weaponManaCost();

  if (state.mp <= 0) {
    state.channeling = false;
    state.channelTick = 0;
    state.swing = 0;
    state.attackType = 'melee';
    setCombatMode(false);
    return;
  }

  setCombatMode(true);
  state.combatMode = true;
  state.combatTimer = 6;
  state.attackType = 'staff';
  state.swing = 0.5;

  const tip = getWeaponWorldTip();
  const rotY = playerRoot.rotation.y;
  const forward = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));

  for (let i = 0; i < 2; i++) {
    const col = Math.random() < 0.5 ? 0xffb080 : 0xffd0a0;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
    p.position.copy(tip);
    p.position.x += rnd(-0.15, 0.15);
    p.position.y += rnd(-0.15, 0.15);
    p.position.z += rnd(-0.15, 0.15);
    p.userData.vel = forward.clone().multiplyScalar(rnd(10, 18));
    p.userData.life = 0.5;
    world.scene.add(p);
    combat.fireParticles.push(p);
  }

  const now = performance.now();
  if (now - lastChannelBroadcast > 60) {
    lastChannelBroadcast = now;
    positionChannel?.send({
      type: 'broadcast',
      event: 'channel_tick',
      payload: {
        userId: currentUser?.id,
        x: tip.x, y: tip.y, z: tip.z,
        dx: forward.x, dy: forward.y, dz: forward.z,
      },
    });
  }

  state.channelTick = (state.channelTick || 0) + dt;
  if (state.channelTick >= 0.7) {
    if (state.mp < manaCost) {
      state.channeling = false;
      state.channelTick = 0;
      state.swing = 0;
      state.attackType = 'melee';
      setCombatMode(false);
      return;
    }
    state.mp -= manaCost;
    state.channelTick = 0;

    const dmgRange = totalDamage();
    const dmgPerTick = Math.max(3, Math.floor((dmgRange[0] + dmgRange[1]) * 0.5 * 1.10));
    const skillKey = classifyWeapon(state.eq.weapon);

    for (let i = spawner.mobs.length - 1; i >= 0; i--) {
      const e = spawner.mobs[i];
      if (!e.alive) continue;
      const toE = e.group.position.clone().sub(playerRoot.position);
      toE.y = 0; const dist = toE.length();
      if (dist > 13) continue;
      toE.normalize();
      const dot = toE.dot(forward);
      if (dot < 0.3) continue;
      e.hp -= dmgPerTick;
      e.hurt = 1; e.aggroed = true; e.chasing = true;
      if (!e.leashFrom) e.leashFrom = { x: e.group.position.x, z: e.group.position.z };
      combat.addBlood(e, 1);
      combat.spawnFloater(e.group.position.clone().setY(1.8), '🔥 ' + dmgPerTick, 'fire');
      combat.onMobDamaged?.(e, dmgPerTick);
      applyBurn(e, dmgPerTick);
      if (skillKey) gainSkillXP(skillKey, dmgPerTick, false);
      if (e.hp <= 0) killEnemy(e);
    }

    if (!isInVillage(playerRoot.position.x, playerRoot.position.z)) {
      for (const uid in remotePlayers) {
        const rp = remotePlayers[uid];
        if (rp.isDead) continue;
        const toP = rp.mesh.position.clone().sub(playerRoot.position);
        toP.y = 0; const dist = toP.length();
        if (dist > 13) continue;
        toP.normalize();
        if (toP.dot(forward) < 0.3) continue;
        positionChannel?.send({
          type: 'broadcast',
          event: 'pvp_hit',
          payload: { targetId: rp.userId, dmg: dmgPerTick },
        });
        const wp = rp.mesh.position.clone();
        wp.y += 2.3;
        combat.spawnFloater(wp, '🔥 ' + dmgPerTick, 'fire');
      }
    }
  }
}

function performStaffBurst() {
  if (state.atkCd > 0) return;
  if (!playerRoot || !hero) return;
  const manaCost = weaponManaCost();
  if (manaCost > 0) {
    if (state.mp < manaCost) { addChatMsg('❌ Недостаточно маны'); return; }
    state.mp -= manaCost;
  }
  setCombatMode(true);
  state.combatMode = true;
  state.combatTimer = 6;
  state.attackType = 'staff';
  state.swing = 1;
  state.atkCd = playerAttackSpeed() * 1.4;

  const rotY = playerRoot.rotation.y;
  const forward = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
  const dmgRange = totalDamage();
  const dmg = Math.max(3, Math.floor((dmgRange[0] + dmgRange[1]) * 0.5 * 0.65));
  const skillKey = classifyWeapon(state.eq.weapon);

  for (let i = spawner.mobs.length - 1; i >= 0; i--) {
    const e = spawner.mobs[i];
    if (!e.alive) continue;
    const toE = e.group.position.clone().sub(playerRoot.position);
    toE.y = 0; const dist = toE.length();
    if (dist > 11) continue;
    toE.normalize();
    if (toE.dot(forward) < 0.35) continue;
    e.hp -= dmg; e.hurt = 1; e.aggroed = true; e.chasing = true;
    if (!e.leashFrom) e.leashFrom = { x: e.group.position.x, z: e.group.position.z };
    combat.addBlood(e, 1);
    combat.spawnFloater(e.group.position.clone().setY(1.8), '🔥 ' + dmg, 'fire');
    combat.onMobDamaged?.(e, dmg);
    applyBurn(e, dmg);
    if (skillKey) gainSkillXP(skillKey, dmg, false);
    if (e.hp <= 0) killEnemy(e);
  }

  if (!isInVillage(playerRoot.position.x, playerRoot.position.z)) {
    for (const uid in remotePlayers) {
      const rp = remotePlayers[uid];
      if (rp.isDead) continue;
      const toP = rp.mesh.position.clone().sub(playerRoot.position);
      toP.y = 0; const dist = toP.length();
      if (dist > 11) continue;
      toP.normalize();
      if (toP.dot(forward) < 0.35) continue;
      positionChannel?.send({
        type: 'broadcast',
        event: 'pvp_hit',
        payload: { targetId: rp.userId, dmg },
      });
      const wp = rp.mesh.position.clone();
      wp.y += 2.3;
      combat.spawnFloater(wp, '🔥 ' + dmg, 'fire');
    }
  }
}

function useAbility() {
  if (!state.alive || state.abilityCd > 0) return;
  const ab = window.registry.abilities?.[state.character.class];
  if (!ab) return;
  const dmg = totalDamage();
  const base = Math.floor((dmg[0] + dmg[1]) * 0.5 * ab.dmgMul);
  if (ab.id === 'dash') {
    let best = null, bestD = ab.range;
    for (const e of spawner.mobs) {
      if (!e.alive) continue;
      const d = playerRoot.position.distanceTo(e.group.position);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      const dir = best.group.position.clone().sub(playerRoot.position).normalize();
      playerRoot.position.addScaledVector(dir, Math.min(bestD - 1, ab.range));
      best.hp -= base; best.hurt = 1; best.aggroed = true; best.chasing = true;
      if (best.hp <= 0) killEnemy(best);
    }
  } else if (ab.id === 'explode') {
    for (const e of spawner.mobs) {
      if (!e.alive) continue;
      if (playerRoot.position.distanceTo(e.group.position) > ab.radius) continue;
      e.hp -= base; e.hurt = 1; e.aggroed = true; e.chasing = true;
      if (e.hp <= 0) killEnemy(e);
    }
    spawnWave(playerRoot.position, ab.radius, 0xd090d0);
  } else if (ab.id === 'freeze') {
    for (const e of spawner.mobs) {
      if (!e.alive) continue;
      const toE = e.group.position.clone().sub(playerRoot.position);
      toE.y = 0; const d = toE.length();
      if (d > ab.radius) continue;
      const fwd = new THREE.Vector3(Math.sin(playerRoot.rotation.y), 0, Math.cos(playerRoot.rotation.y));
      if (toE.normalize().dot(fwd) < 0.35) continue;
      e.hp -= base; e.hurt = 1; e.aggroed = true; e.chasing = true;
      e.frozen = { timeLeft: ab.freezeTime };
      if (e.hp <= 0) killEnemy(e);
    }
    spawnWave(playerRoot.position, ab.radius, 0xb8d8f0);
  }
  state.abilityCd = ab.cd;

  positionChannel?.send({
    type: 'broadcast',
    event: 'ability',
    payload: {
      userId: currentUser?.id,
      abilityId: ab.id,
      x: playerRoot.position.x,
      z: playerRoot.position.z,
      rotY: playerRoot.rotation.y,
    },
  });
}

function handleWorldTap(cx, cy) {
  if (!state.alive) return;
  if (document.querySelector('.screen.show')) return;
  if (document.getElementById('inv')?.classList.contains('open')) return;
  if (document.getElementById('itemPopupBackdrop')?.classList.contains('show')) return;

  const ndc = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, world.camera);

  const npcHits = ray.intersectObjects(npcMeshes, true);
  if (npcHits.length > 0) {
    let obj = npcHits[0].object;
    while (obj && !obj.userData.npc) obj = obj.parent;
    if (obj?.userData.npc) { dialogEngine.start(obj.userData.npc.dialogId, obj.userData.npc); return; }
  }

  const hits = ray.intersectObjects(spawner.mobMeshes, false);
  if (hits.length > 0) {
    const e = hits[0].object.userData.enemy;
    if (e?.alive) {
      input.attackTarget = e;
      input.moveTarget = null;
      setCombatMode(true);
      state.combatMode = true;
      state.combatTimer = 6;
      return;
    }
  }

  const pt = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  if (ray.ray.intersectPlane(plane, pt)) {
    if (!(isWater(pt.x, pt.z) && !isOnBridgeExact(pt.x, pt.z))) {
      input.moveTarget = pt;
      input.attackTarget = null;
    }
  }
}

function consumePotion(id) {
  const idx = state.inv.findIndex(i => i.id === id);
  if (idx < 0) return;
  const it = state.inv[idx];
  if (it.heal) state.hp = Math.min(state.hpMax, state.hp + it.heal);
  if (it.mana) state.mp = Math.min(state.mpMax, state.mp + it.mana);
  state.inv.splice(idx, 1);
  renderInventory();
  updateOrbs();
  updatePotionBar();
}

document.getElementById('btnRespawn')?.addEventListener('click', () => {
  state.hp = state.hpMax;
  state.mp = state.mpMax;
  state.alive = true;
  document.getElementById('death').style.display = 'none';
  const sx = VILLAGE.x, sz = VILLAGE.z + 8;
  playerRoot.position.set(sx, groundHeight(sx, sz), sz);
  snapCamera(playerRoot.position);
  state.stepUp = null;
  state.channeling = false;
  state.channelTick = 0;
  state.swing = 0;
  attackHoldTime = 0;
  resetPose(hero);
  const st = ensureAnimState(hero);
  st.mode = 'idle';
  removeBloodPool();
  updateOrbs();
  updatePotionBar();
  positionChannel?.send({
    type: 'broadcast',
    event: 'player_respawn',
    payload: { userId: currentUser?.id },
  });
});

// ============================================================
// АУТЕНТИФИКАЦИЯ SUPABASE
// ============================================================
function setAuthStatus(text, isError) {
  const el = document.getElementById('authStatus');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? '#a04040' : '#4a7a3a';
}

async function checkExistingSession() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      currentUser = data.session.user;
      console.log('[auth] session active:', currentUser.id);
      return true;
    }
  } catch (e) { console.warn('[auth] getSession failed:', e); }
  return false;
}

async function signUpWithEmail() {
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPassword')?.value || '';
  if (!email || password.length < 6) {
    setAuthStatus('Введите email и пароль (от 6 символов)', true);
    return;
  }
  setAuthStatus('Регистрация...');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { setAuthStatus('Ошибка: ' + error.message, true); return; }
  currentUser = data.user;
  setAuthStatus('Готово! Заходим...');
  setTimeout(() => proceedToCharacterSelect(), 500);
}

async function signInWithEmail() {
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPassword')?.value || '';
  if (!email || !password) { setAuthStatus('Введите email и пароль', true); return; }
  setAuthStatus('Вход...');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { setAuthStatus('Ошибка: ' + error.message, true); return; }
  currentUser = data.user;
  setAuthStatus('Добро пожаловать!');
  setTimeout(() => proceedToCharacterSelect(), 500);
}

async function signInAsGuest() {
  setAuthStatus('Создаём гостевой аккаунт...');
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) { setAuthStatus('Ошибка: ' + error.message, true); return; }
  currentUser = data.user;
  setAuthStatus('Гостевой вход выполнен');
  setTimeout(() => proceedToCharacterSelect(), 500);
}

function proceedToCharacterSelect() {
  const chars = loadChars();
  if (chars.length === 0) {
    show('introScreen');
  } else {
    show('charSelectScreen');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('refreshCharList'));
    }, 50);
  }
}

// ============================================================
// СОХРАНЕНИЕ / ЗАГРУЗКА ПРОГРЕССА
// ============================================================
async function savePlayerProgress() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) currentUser = data.session.user;
  } catch (e) {}
  if (!currentUser) return;
  if (!playerRoot || !hero) return;

  const equippedIds = {};
  for (const slot of ['weapon','shield','helm','armor','pants','boots','gloves']) {
    if (state.eq[slot]?.id) equippedIds[slot] = state.eq[slot].id;
  }

  const skillsObj = {};
  for (const [k, v] of Object.entries(state.skills)) {
    skillsObj[k] = { lvl: v.lvl, xp: v.xp };
  }

  const { error } = await supabase
    .from('players')
    .upsert({
      user_id: currentUser.id,
      name: state.character.name,
      class: state.character.class,
      level: state.level,
      xp: state.xp,
      gold: state.gold,
      position_x: playerRoot.position.x,
      position_z: playerRoot.position.z,
      inventory: state.inv,
      appearance: {
        skin: state.character.skin,
        hair: state.character.hair,
        outfit: state.character.outfit,
        gender: state.character.gender,
        hairStyle: state.character.hairStyle,
        eyeColor: state.character.eyeColor,
        mouthStyle: state.character.mouthStyle,
        bodyType: state.character.bodyType,
        beard: state.character.beard,
      },
      equipped: equippedIds,
      skills: skillsObj,
      flags: state.flags || {},
      quests_done: state.completedQuests || [],
      quests_state: window.__questEngine?.exportState?.() || null,
      stat_points: state.statPoints || 0,
      stats: { ...state.stats },
      kills: state.kills || 0,
    }, { onConflict: 'user_id' });

  if (error) console.error('[save] Ошибка сохранения:', error.message);
  else console.log('[save] Прогресс сохранён', new Date().toLocaleTimeString());
}

function startAutoSave() {
  if (autoSaveIntervalId) clearInterval(autoSaveIntervalId);
  // На мобильных автосейв раз в 45 сек (меньше нагрузка на CPU)
  const interval = IS_MOBILE ? 45000 : 30000;
  autoSaveIntervalId = setInterval(savePlayerProgress, interval);
  console.log(`[save] Автосохранение каждые ${interval / 1000} сек включено`);
}

async function loadPlayerProgress() {
  if (!currentUser) return;
  if (!playerRoot) return;

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (error) {
    console.warn('[load] Не удалось загрузить прогресс:', error.message);
    return;
  }
  if (!data) {
    console.log('[load] Прогресс не найден, начинаем новую игру');
    await savePlayerProgress();
    return;
  }

  if (data.class) state.character.class = data.class;

  if (data.appearance && typeof data.appearance === 'object') {
    for (const [k, v] of Object.entries(data.appearance)) {
      if (v !== undefined) state.character[k] = v;
    }
  }

  state.level      = data.level || 1;
  state.xp         = data.xp || 0;
  state.gold       = data.gold || 0;
  state.kills      = data.kills || 0;
  state.statPoints = data.stat_points || 0;

  if (data.stats && typeof data.stats === 'object') {
    for (const k of Object.keys(state.stats)) {
      if (typeof data.stats[k] === 'number') state.stats[k] = data.stats[k];
    }
  }

  if (data.skills && typeof data.skills === 'object') {
    for (const k of Object.keys(state.skills)) {
      const s = data.skills[k];
      if (s && typeof s === 'object') {
        state.skills[k].lvl = s.lvl || 1;
        state.skills[k].xp  = s.xp || 0;
      }
    }
  }

  if (data.flags && typeof data.flags === 'object') {
    state.flags = { ...data.flags };
  }
  if (Array.isArray(data.quests_done)) {
    state.completedQuests = [...data.quests_done];
  }

  if (Array.isArray(data.inventory)) state.inv = data.inventory;

  if (data.equipped && typeof data.equipped === 'object') {
    for (const slot of Object.keys(state.eq)) state.eq[slot] = null;
    for (const [slot, itemId] of Object.entries(data.equipped)) {
      const def = window.registry.items?.[itemId];
      if (def) state.eq[slot] = { ...def, dur: def.maxDur ?? 0 };
    }
  }

  if (typeof data.position_x === 'number' && typeof data.position_z === 'number') {
    playerRoot.position.set(
      data.position_x,
      groundHeight(data.position_x, data.position_z),
      data.position_z
    );
    snapCamera(playerRoot.position);
  }

  if (data.quests_state && window.__questEngine) {
    window.__questEngine.importState(data.quests_state);
  }

  recalcStats();
  updateOrbs();
  updateXPBar();
  renderInventory();
  updatePotionBar();

  applyEquipmentVisuals(
    hero, weaponAnchor, shieldAnchor,
    weaponSheathAnchor, weaponHipAnchor, shieldSheathAnchor
  );
  currentWeaponMeshHand = weaponAnchor.children[0] || null;

  try {
    const chars = loadChars();
    let found = false;
    for (let i = 0; i < chars.length; i++) {
      if (chars[i]?.name === data.name) {
        chars[i].level = state.level;
        chars[i].class = state.character.class;
        chars[i].appearance = { ...chars[i].appearance, ...(data.appearance || {}) };
        found = true;
        break;
      }
    }
    if (!found) {
      chars.push({
        id: 'char_' + Date.now(),
        name: data.name || 'Герой',
        class: state.character.class,
        level: state.level,
        appearance: { ...state.character },
      });
    }
    saveChars(chars);
    window.dispatchEvent(new CustomEvent('refreshCharList'));
  } catch (e) { console.warn('[load] sync chars failed:', e); }

  console.log('[load] Прогресс игрока загружен:', data.name, 'ур.', state.level);
}

// ============================================================
// REALTIME — синхронизация игроков
// ============================================================
async function initRealtimeSync() {
  if (playersChannel) supabase.removeChannel(playersChannel);

  playersChannel = supabase
    .channel('public:players')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, (payload) => {
      const row = payload.new;
      if (!row) return;
      if (row.user_id === currentUser?.id) return;

      if (payload.eventType === 'DELETE') {
        removeRemotePlayer(row.user_id);
        return;
      }
      if (!getOnlineIds().has(row.user_id)) return;
      upsertRemotePlayer(row.user_id, row, false);
    })
    .subscribe(s => console.log('[realtime]', s));

  initPresence();
}

function getOnlineIds() {
  if (!presenceChannel) return new Set();
  const st = presenceChannel.presenceState();
  return new Set(Object.keys(st));
}

function initPresence() {
  if (presenceChannel) supabase.removeChannel(presenceChannel);

  presenceChannel = supabase.channel('online', {
    config: { presence: { key: currentUser.id } }
  });

  presenceChannel
    .on('presence', { event: 'sync' }, async () => {
      const st = presenceChannel.presenceState();
      const onlineIds = new Set(Object.keys(st));

      for (const uid in remotePlayers) {
        if (!onlineIds.has(uid)) removeRemotePlayer(uid);
      }

      const missing = [];
      for (const uid of onlineIds) {
        if (uid === currentUser.id) continue;
        if (!remotePlayers[uid]) missing.push(uid);
      }
      if (missing.length > 0) {
        try {
          const { data } = await supabase
            .from('players')
            .select('*')
            .in('user_id', missing);
          if (Array.isArray(data)) {
            for (const row of data) {
              if (row.user_id !== currentUser?.id && !remotePlayers[row.user_id]) {
                upsertRemotePlayer(row.user_id, row, false);
              }
            }
          }
        } catch (e) { console.warn('[presence] fetch missing failed:', e); }
      }
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      removeRemotePlayer(key);
    })
    .subscribe(async (status) => {
      console.log('[presence]', status);
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({ online_at: Date.now() });
      }
    });
}

// ============================================================
// BROADCAST
// ============================================================
function initPositionBroadcast() {
  if (positionChannel) supabase.removeChannel(positionChannel);

  positionChannel = supabase.channel('positions', {
    config: { broadcast: { self: false } }
  });

  positionChannel.on('broadcast', { event: 'pos' }, ({ payload }) => {
    if (!payload || payload.userId === currentUser?.id) return;
    const rp = remotePlayers[payload.userId];
    if (!rp) return;
    rp.targetX = payload.x;
    rp.targetZ = payload.z;
    rp.targetRotY = payload.rotY;
    rp.isMoving = payload.moving;
    if (typeof payload.combatMode === 'boolean' && rp.combatMode !== payload.combatMode) {
      rp.combatMode = payload.combatMode;
      setRemoteWeaponVisibility(rp);
    }
    if (payload.channeling) {
      rp.isChanneling = true;
      rp.combatMode = true;
      rp.isAttacking = true;
      setRemoteWeaponVisibility(rp);
    } else {
      if (rp.isChanneling) {
        rp.isChanneling = false;
      }
      if (payload.attacking && !rp.isAttacking) {
        rp.isAttacking = true;
        rp.attackT = 0;
        rp.attackType = payload.attackType || 'melee';
      }
    }
    if (typeof payload.hp === 'number') {
      rp.hp = payload.hp;
      rp.hpMax = payload.hpMax || rp.hpMax;
    }
    if (typeof payload.level === 'number') rp.level = payload.level;
    if (typeof payload.name === 'string')    rp.name = payload.name;
    if (payload.guild !== undefined)         rp.guild = payload.guild;
    if (payload.equip)                       applyRemoteEquipment(rp, payload.equip);
    rp.lastUpdate = performance.now();
  });

  positionChannel.on('broadcast', { event: 'ability' }, ({ payload }) => {
    if (!payload || payload.userId === currentUser?.id) return;
    playRemoteAbility(payload);
  });

  positionChannel.on('broadcast', { event: 'projectile' }, ({ payload }) => {
    if (!payload || payload.userId === currentUser?.id) return;
    spawnRemoteProjectile(payload);
  });

  positionChannel.on('broadcast', { event: 'channel_tick' }, ({ payload }) => {
    if (!payload || payload.userId === currentUser?.id) return;
    const origin = new THREE.Vector3(payload.x, payload.y, payload.z);
    const fwd = new THREE.Vector3(payload.dx, payload.dy, payload.dz);
    for (let i = 0; i < 2; i++) {
      const col = Math.random() < 0.5 ? 0xffb080 : 0xffd0a0;
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 })
      );
      p.position.copy(origin);
      p.position.x += (Math.random() - 0.5) * 0.3;
      p.position.y += (Math.random() - 0.5) * 0.3;
      p.position.z += (Math.random() - 0.5) * 0.3;
      p.userData.vel = fwd.clone().multiplyScalar(10 + Math.random() * 8);
      p.userData.life = 0.5;
      world.scene.add(p);
      combat.fireParticles.push(p);
    }
  });

  positionChannel.on('broadcast', { event: 'mob_hit' }, ({ payload }) => {
    if (!payload || payload.hitterId === currentUser?.id) return;
    const mob = findMobByKey(payload.key);
    if (!mob) return;
    if (!mob.contributions) mob.contributions = {};
    mob.contributions[payload.hitterId] = (mob.contributions[payload.hitterId] || 0) + payload.dmg;
    if (payload.hp < mob.hp) {
      mob.hp = payload.hp;
      mob.hurt = 1;
      mob.aggroed = true;
      mob.chasing = true;
      if (!mob.leashFrom) mob.leashFrom = { x: mob.group.position.x, z: mob.group.position.z };
    }
  });

  positionChannel.on('broadcast', { event: 'mob_killed' }, ({ payload }) => {
    if (!payload || payload.killerId === currentUser?.id) return;
    const mob = findMobByKey(payload.key);

    if (mob && mob.alive) {
      mob.alive = false;
      world.scene.remove(mob.group);
      if (mob.bar) mob.bar.remove();
      if (mob.blood) for (const b of mob.blood) world.scene.remove(b);
      const idx = spawner.mobs.indexOf(mob);
      if (idx >= 0) spawner.mobs.splice(idx, 1);
      queueRespawn(mob);
    }

    const myId = currentUser?.id;
    const myDmg = payload.contributions?.[myId] || 0;
    if (myDmg <= 0) return;
    const totalDmg = Object.values(payload.contributions || {}).reduce((a, b) => a + b, 0);
    if (totalDmg <= 0) return;
    const share = myDmg / totalDmg;
    const xp = Math.max(1, Math.floor((payload.xpTotal || 0) * share));
    const gold = Math.max(0, Math.floor((payload.goldTotal || 0) * share));
    addXP(xp);
    addGold(gold);
    state.kills++;
    const wp = mob?.group.position.clone() || playerRoot.position.clone();
    wp.y += 2.5;
    combat.spawnFloater(wp, `+${xp} XP`, 'heal');
    addChatMsg(`☠ Союзный удар. Доля: +${gold}💰 +${xp} XP`);
  });

  positionChannel.on('broadcast', { event: 'pvp_hit' }, ({ payload }) => {
    if (!payload || payload.targetId !== currentUser?.id) return;
    if (playerRoot && isInVillage(playerRoot.position.x, playerRoot.position.z)) return;
    if (!state.alive) return;
    combat.damagePlayer(payload.dmg);
    const wp = playerRoot.position.clone();
    wp.y += 2.5;
    combat.spawnFloater(wp, '-' + payload.dmg, 'player');
  });

  positionChannel.on('broadcast', { event: 'player_death' }, ({ payload }) => {
    if (!payload || payload.userId === currentUser?.id) return;
    const rp = remotePlayers[payload.userId];
    if (!rp) return;
    rp.isDead = true;
    rp.isMoving = false;
    rp.isAttacking = false;
    rp.isChanneling = false;
    const st = ensureAnimState(rp.mesh);
    st.mode = 'death';
    setDeathPose(rp.mesh);
    if (rp.label) rp.label.style.display = 'none';
    const x = typeof payload.x === 'number' ? payload.x : rp.mesh.position.x;
    const z = typeof payload.z === 'number' ? payload.z : rp.mesh.position.z;
    spawnRemoteBloodPool(payload.userId, x, z);
  });

  positionChannel.on('broadcast', { event: 'player_respawn' }, ({ payload }) => {
    if (!payload || payload.userId === currentUser?.id) return;
    const rp = remotePlayers[payload.userId];
    if (!rp) return;
    rp.isDead = false;
    resetPose(rp.mesh);
    const st = ensureAnimState(rp.mesh);
    st.mode = 'idle';
    removeRemoteBloodPool(payload.userId);
  });

  positionChannel.subscribe(s => {
    console.log('[broadcast]', s);
    if (s === 'SUBSCRIBED') {
      setTimeout(() => { try { broadcastPosition(true); } catch (e) {} }, 200);
    }
  });
}

function broadcastPosition(forceEquip = false) {
  if (!positionChannel || !currentUser || !playerRoot) return;
  const now = performance.now();
  if (!forceEquip && now - lastBroadcastTime < 100) return;
  lastBroadcastTime = now;

  const anim = ensureAnimState(hero);
  const moving = anim.mode === 'walk';
  const attacking = anim.mode === 'attack' || state.channeling;
  const channeling = !!(state.channeling && isStaffChanneling());

  const equipIds = {};
  for (const slot of ['weapon','shield','helm','armor','pants','boots','gloves']) {
    equipIds[slot] = state.eq[slot]?.id || null;
  }
  const eqKey = JSON.stringify(equipIds);
  const sendEquip = forceEquip || eqKey !== lastBroadcastEquip;
  if (sendEquip) lastBroadcastEquip = eqKey;

  const sendGuild = state.character.guild !== lastSentGuild;
  if (sendGuild) lastSentGuild = state.character.guild;

  positionChannel.send({
    type: 'broadcast',
    event: 'pos',
    payload: {
      userId: currentUser.id,
      x: playerRoot.position.x,
      z: playerRoot.position.z,
      rotY: playerRoot.rotation.y,
      moving, attacking, channeling,
      attackType: state.attackType,
      combatMode: state.combatMode,
      alive: state.alive,
      hp: state.hp,
      hpMax: state.hpMax,
      level: state.level,
      name: state.character.name,
      guild: sendGuild ? state.character.guild : undefined,
      equip: sendEquip ? equipIds : null,
    },
  });
}

function upsertRemotePlayer(userId, row, isFromBroadcast) {
  let rp = remotePlayers[userId];

  if (!rp) {
    const a = row.appearance || {};
    const mesh = createHumanoid({
      skin:       a.skin       ?? 0xe8c8a8,
      hair:       a.hair       ?? 0x3a3530,
      shirt:      a.outfit     ?? 0x8a8ac8,
      pants:      0x5a4a48,
      gender:     a.gender     ?? 'male',
      hairStyle:  a.hairStyle  ?? 'short',
      eyeColor:   a.eyeColor   ?? 0x2a2520,
      mouthStyle: a.mouthStyle ?? 'neutral',
      bodyType:   a.bodyType   ?? 'normal',
      beard:      a.beard      ?? 'none',
    });
    mesh.scale.setScalar(0.95);
    world.scene.add(mesh);

    const label = makePlayerLabel(row.name || 'Игрок', '', false);
    document.getElementById('world-ui')?.appendChild(label);

    const rwWeaponAnchor = new THREE.Group();
    if (mesh.userData.handR) mesh.userData.handR.add(rwWeaponAnchor);
    const rwShieldAnchor = new THREE.Group();
    if (mesh.userData.handL) mesh.userData.handL.add(rwShieldAnchor);
    const rwWeaponSheathAnchor = new THREE.Group();
    rwWeaponSheathAnchor.position.set(0.30, 0.80, -0.22);
    rwWeaponSheathAnchor.rotation.set(-4.50, -0.45, 3.35);
    if (mesh.userData.spineUpper) mesh.userData.spineUpper.add(rwWeaponSheathAnchor);
    const rwWeaponHipAnchor = new THREE.Group();
    rwWeaponHipAnchor.position.set(0.28, 0.37, 0.02);
    rwWeaponHipAnchor.rotation.set(0.70, 0, 2.95);
    if (mesh.userData.pelvis) mesh.userData.pelvis.add(rwWeaponHipAnchor);
    const rwShieldSheathAnchor = new THREE.Group();
    rwShieldSheathAnchor.position.set(-0.02, 0.25, -0.32);
    if (mesh.userData.spineUpper) mesh.userData.spineUpper.add(rwShieldSheathAnchor);

    ensureAnimState(mesh);

    rp = {
      userId,
      mesh, label,
      weaponAnchor: rwWeaponAnchor,
      shieldAnchor: rwShieldAnchor,
      weaponSheathAnchor: rwWeaponSheathAnchor,
      weaponHipAnchor: rwWeaponHipAnchor,
      shieldSheathAnchor: rwShieldSheathAnchor,
      lastUpdate: performance.now(),
      targetX: row.position_x ?? 0,
      targetZ: row.position_z ?? 0,
      targetRotY: 0,
      isMoving: false,
      isAttacking: false,
      isChanneling: false,
      isDead: false,
      attackT: 0,
      attackType: 'melee',
      combatMode: false,
      equippedApplied: null,
      hp: 1, hpMax: 1,
      level: row.level || 1,
      name: row.name || 'Игрок',
      guild: row.guild || '',
    };
    remotePlayers[userId] = rp;
    console.log('[realtime] Появился:', row.name);
  }

  if (row.equipped) applyRemoteEquipment(rp, row.equipped);

  if (!isFromBroadcast) {
    rp.targetX = row.position_x ?? rp.targetX;
    rp.targetZ = row.position_z ?? rp.targetZ;
    rp.name  = row.name  || rp.name;
    rp.level = row.level || rp.level;
  }

  rp.lastUpdate = performance.now();
}

function removeRemotePlayer(userId) {
  const rp = remotePlayers[userId];
  if (!rp) return;
  world.scene.remove(rp.mesh);
  if (rp.label) rp.label.remove();
  removeRemoteBloodPool(userId);
  delete remotePlayers[userId];
  console.log('[realtime] Ушёл:', userId);
}

function applyRemoteEquipment(rp, equipIds) {
  const eqKey = JSON.stringify(equipIds);
  if (rp.equippedApplied === eqKey) return;
  rp.equippedApplied = eqKey;

  const backup = { ...state.eq };
  for (const slot of Object.keys(state.eq)) state.eq[slot] = null;
  for (const [slot, itemId] of Object.entries(equipIds)) {
    if (!itemId) continue;
    const def = window.registry.items?.[itemId];
    if (def) state.eq[slot] = { ...def, dur: def.maxDur ?? 0 };
  }
  applyEquipmentVisuals(
    rp.mesh, rp.weaponAnchor, rp.shieldAnchor,
    rp.weaponSheathAnchor, rp.weaponHipAnchor, rp.shieldSheathAnchor
  );
  for (const slot of Object.keys(state.eq)) state.eq[slot] = backup[slot];

  setRemoteWeaponVisibility(rp);
}

function setRemoteWeaponVisibility(rp) {
  const showHand = !!(rp.combatMode || rp.isAttacking || rp.isChanneling);
  if (rp.weaponAnchor)        rp.weaponAnchor.children.forEach(c => c.visible = showHand);
  if (rp.weaponSheathAnchor)  rp.weaponSheathAnchor.children.forEach(c => c.visible = !showHand);
  if (rp.weaponHipAnchor)     rp.weaponHipAnchor.children.forEach(c => c.visible = !showHand);
  if (rp.shieldAnchor)        rp.shieldAnchor.children.forEach(c => c.visible = showHand);
  if (rp.shieldSheathAnchor)  rp.shieldSheathAnchor.children.forEach(c => c.visible = !showHand);
}

function spawnRemoteProjectile({ kind, x, y, z, dx, dy, dz }) {
  let mesh, speed;
  if (kind === 'arrow') {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xf0e0c0 }));
    const trail = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.7 }));
    trail.position.z = -0.4;
    mesh.add(trail);
    speed = 40;
  } else if (kind === 'spear') {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 1.0),
      new THREE.MeshBasicMaterial({ color: 0xd8c8a8 }));
    speed = 30;
  } else {
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xe8c8a0 }));
    if (!IS_MOBILE) mesh.add(new THREE.PointLight(0xe8c8a0, 2.2, 7));
    speed = 34;
  }
  mesh.position.set(x, y, z);
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  if (Math.abs(dir.x) + Math.abs(dir.z) > 0.01) {
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
  }
  world.scene.add(mesh);
  remoteProjectiles.push({ mesh, dir, speed, life: 5 });
}

function updateRemoteProjectiles(dt) {
  for (let i = remoteProjectiles.length - 1; i >= 0; i--) {
    const p = remoteProjectiles[i];
    p.life -= dt;
    if (p.life <= 0) {
      world.scene.remove(p.mesh);
      remoteProjectiles.splice(i, 1);
      continue;
    }
    p.mesh.position.addScaledVector(p.dir, p.speed * dt);
    const gy = groundHeight(p.mesh.position.x, p.mesh.position.z);
    if (p.mesh.position.y < gy - 5) {
      world.scene.remove(p.mesh);
      remoteProjectiles.splice(i, 1);
    }
  }
}

function playRemoteAbility({ abilityId, x, z }) {
  const origin = new THREE.Vector3(x, groundHeight(x, z) + 0.5, z);

  if (abilityId === 'dash') {
    spawnWave(origin, 3, 0x88c8ff);
  } else if (abilityId === 'explode') {
    spawnWave(origin, 7, 0xd090d0);
  } else if (abilityId === 'freeze') {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.15, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xb8d8f0, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(origin);
    world.scene.add(ring);
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 800;
      if (t >= 1) { world.scene.remove(ring); return; }
      ring.scale.setScalar(1 + t * 7);
      ring.material.opacity = (1 - t) * 0.9;
      requestAnimationFrame(tick);
    };
    tick();
  }
}

function updateRemotePlayers(dt) {
  const now = performance.now();
  for (const userId in remotePlayers) {
    const rp = remotePlayers[userId];

    if (now - rp.lastUpdate > 120000) {
      removeRemotePlayer(userId);
      continue;
    }

    if (rp.isDead) {
      continue;
    }

    if (rp.targetX !== undefined && rp.targetZ !== undefined) {
      const lerp = Math.min(1, dt * 10);
      rp.mesh.position.x += (rp.targetX - rp.mesh.position.x) * lerp;
      rp.mesh.position.z += (rp.targetZ - rp.mesh.position.z) * lerp;
      const y = groundHeight(rp.mesh.position.x, rp.mesh.position.z);
      rp.mesh.position.y += (y - rp.mesh.position.y) * Math.min(1, dt * 12);
    }

    if (rp.targetRotY !== undefined) {
      let dy = rp.targetRotY - rp.mesh.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      rp.mesh.rotation.y += dy * Math.min(1, dt * 10);
    }

    const st = ensureAnimState(rp.mesh);
    st.t += dt;

    if (rp.isChanneling) {
      st.mode = 'attack';
      st.attackType = 'staff';
      st.swing = 0.5;
    } else if (rp.isAttacking) {
      rp.attackT += dt;
      if (rp.attackT < 0.35) {
        st.mode = 'attack';
        st.swing = 1 - (rp.attackT / 0.35);
        st.attackType = rp.attackType;
      } else {
        rp.isAttacking = false;
        rp.attackT = 0;
        setRemoteWeaponVisibility(rp);
      }
    } else if (rp.isMoving) {
      st.mode = 'walk';
      st.walkPhase += dt * 9;
    } else {
      st.mode = 'idle';
    }
    animateHumanoid(rp.mesh, st, dt);

    if (rp.label && world.camera) {
      rp.label._update(rp.name, rp.level, rp.hp, rp.hpMax, rp.guild);
      const wp = rp.mesh.position.clone();
      wp.y += 3.1;
      const v = wp.project(world.camera);
      if (v.z < 1) {
        rp.label.style.display = 'flex';
        rp.label.style.transform =
          `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * innerWidth}px,${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
      } else {
        rp.label.style.display = 'none';
      }
    }
  }
}

// ============================================================
// ПРОВЕРКА СЕССИИ ПРИ СТАРТЕ
// ============================================================
(async () => {
  const loggedIn = await checkExistingSession();
  console.log('[auth] Проверка сессии при старте:', loggedIn ? 'залогинен' : 'не залогинен');
})();

window.__signIn = signInWithEmail;
window.__signUp = signUpWithEmail;
window.__signInGuest = signInAsGuest;

// Периодический heartbeat (реже на мобильных)
const heartbeatInterval = IS_MOBILE ? 5000 : 3000;
setInterval(() => {
  if (positionChannel && currentUser && playerRoot) {
    try { broadcastPosition(); } catch (e) {}
  }
}, heartbeatInterval);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && positionChannel && currentUser && playerRoot) {
    try { broadcastPosition(true); } catch (e) {}
  }
});

initMenus(startGame);
import('./ui/preview.js').then(m => m.initPreview?.()).catch(() => {});