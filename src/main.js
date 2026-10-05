// Точка входа: собирает все системы, регистрирует колбэки, запускает game loop.

import {
  VILLAGE, LILY_POS, GOLEM_POS,
  HALF, CHUNK, WATER_LEVEL,
  MAP, FENCE_R,
  APOTHECARY_POS, TELEPORT_POS,
} from './core/constants.js';
import { openShop, openRepair, healPlayer, initShopUI } from './ui/shop.js';
import {
  spawnNPC, findNPC, updateNPCs, findNearestNPC,
  npcMeshes, npcList,
} from './entities/npc.js';
import * as THREE from 'three';
import { initScene, world, updateCameraFollow, setZoom } from './core/scene.js';
import { initInput, input, readMove } from './core/input.js';
import { state, addXP, addGold } from './core/state.js'; state.stepUp = null;
import { rnd, ri, clamp } from './core/assets.js';
import { createHumanoid, ensureAnimState, animateHumanoid } from './entities/humanoid.js';
import { initTerrain, buildChunk, getHeight, isWater, isOnBridge, isOnBridgeExact, groundHeight, addCollider, hitsCollider } from './world/terrain.js';
import {
  initDecor, populateWorld, buildDecor, decor,
  buildLogHouse, buildWell, buildCampfire, buildIdol,
  buildFence, hitsFence,
  buildHouse, buildElderHouse, buildForge, buildTeleport,
} from './world/decor.js';
import { loadZones, updateZones, zoneManager, isInVillage } from './world/zones.js';
import {
  combat, wireCombat, spawnProjectile, damagePlayer, doMeleeAttack, killEnemy,
  updateProjectiles, updateEnemyProjectiles, updateFireParticles, updateEffects,
  updateFloaters, spawnFireParticle, spawnWave, applyBurn, updateBurns,
} from './systems/combat.js';
import { spawner, spawnMobByDef, spawnRandomMob, spawnFromZone, updateMobs, queueRespawn } from './systems/spawn.js';
import { DialogEngine } from './systems/dialog.js';
import { QuestEngine } from './systems/quest.js';
import { initHud, updateOrbs, updateXPBar, updateZoneUI, updateAbilityUI, addChatMsg, hud } from './ui/hud.js';

import {
  panels,
  initInventoryUI,
  renderInventory,
  toggleInventory,
  openStatsPanel,
  openQuestPanel,
  openMapPanel,
  showDialogUI,
  hideDialogUI,
  renderQuestList,
  initQuestTabs,
} from './ui/panels.js';

import { initMenus, show, CLASS_RU } from './ui/menus.js';
import { applyEquipmentVisuals, recalcStats, totalDamage, critChance, playerAttackSpeed, playerAttackRange, playerRanged, classifyWeapon, gainSkillXP } from './systems/inventory.js';
import { loadChars, saveChars, makeCharRecord, applyCharToState } from './systems/save.js';

window.createHumanoid = createHumanoid;

// === Глобальные регистры ===
window.registry = { items: {}, mobs: {}, quests: {}, dialogs: {}, zones: {} };
window.gameState = state;

// === Игровые движки ===
const dialogEngine = new DialogEngine();
const questEngine = new QuestEngine();
let hero, playerRoot, weaponAnchor, shieldAnchor, weaponSheathAnchor, weaponHipAnchor, shieldSheathAnchor;
let playerNameLabel;
let currentWeaponMeshHand = null;

// === Управление атакой ===
let attackHoldTime = 0;

function setCombatMode(on) {
  if (state.combatMode === on) return;
  state.combatMode = on;

  if (weaponAnchor) for (const child of weaponAnchor.children) child.visible = on;
  if (shieldAnchor) for (const child of shieldAnchor.children) child.visible = on;
  if (weaponSheathAnchor) for (const child of weaponSheathAnchor.children) child.visible = !on;
  if (weaponHipAnchor) for (const child of weaponHipAnchor.children) child.visible = !on;
  if (shieldSheathAnchor) for (const child of shieldSheathAnchor.children) child.visible = !on;

  if (hero) {
    state.handAnim = { type: on ? 'draw' : 'sheath', t: 0, dur: 0.55 };
  }
}

function isStaffChanneling() {
  const w = state.eq.weapon;
  return !!(w && w.kind === 'staff' && w.ranged === 'fire');
}

function getWeaponWorldTip() {
  if (currentWeaponMeshHand && currentWeaponMeshHand.visible) {
    const tip = new THREE.Vector3();
    currentWeaponMeshHand.getWorldPosition(tip);
    tip.y += 0.25;
    return tip;
  }
  return playerRoot.position.clone().setY(1.5);
}

// === Загрузка данных ===
async function loadData() {
  const files = {
    items: 'data/items.json',
    mobs: 'data/mobs.json',
    quests: 'data/quests.json',
    dialogs: 'data/dialogs.json',
    zones: 'data/zones.json',
    abilities: 'data/abilities.json',
  };
  for (const [key, path] of Object.entries(files)) {
    try {
      const res = await fetch(path);
      const json = await res.json();
      window.registry[key] = normalizeColors(json);
    } catch (e) {
      console.warn('Failed to load', path, e);
      window.registry[key] = {};
    }
  }

  dialogEngine.load(window.registry.dialogs);
  dialogEngine.state = state;
  dialogEngine.quest = questEngine;
  dialogEngine.onRender = showDialogUI;
  dialogEngine.onClose = hideDialogUI;

  questEngine.load(window.registry.quests);
  questEngine.state = state;
  questEngine.dialog = dialogEngine;
  questEngine.onProgress = () => renderQuestList();
  questEngine.onComplete = (qid, q) => addChatMsg(`✅ Квест «${q.name}» завершён!`);

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
      } else {
        out[k] = normalizeColors(v);
      }
    }
    return out;
  }
  return obj;
}

// === Инициализация ===
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
  window.combat = combat;   // ← КРИТИЧНО: без этого мобы не бьют
  combat.getGroundHeight = groundHeight;

  combat.onKillMob = (e, gold) => {
    addChatMsg(`☠ ${e.type.name} убит. +${gold}💰`);
    questEngine.onKill(e.defId);
    queueRespawn(e);
  };
  combat.onPlayerDeath = () => {
    document.getElementById('death').style.display = 'flex';
  };

  zoneManager.onEnterZone = (zone) => updateZoneUI(zone);

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
      mapClose:   () => hidePanel('mapPanel'),
      menuResume: () => hidePanel('menuPanel'),
      actionDialogBtn: () => {
        const npc = findNearestNPC(playerRoot.position, 4.5);
        if (!npc) { addChatMsg('Рядом нет NPC'); return; }
        const dlg = window.__dialogEngine;
        if (dlg) dlg.start(npc.dialogId, npc);
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
    // Короткий тап посохом → burst
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
  window.addEventListener('flag:changed', e => {
    if (e.detail.key === 'elderGone' && e.detail.value) {
      const elder = findNPC('elder');
      if (elder && elder.mesh) elder.mesh.visible = false;
      addChatMsg('❓ Староста исчез...');
    }
    if (e.detail.key === 'lilyReturned' && e.detail.value) {
      const lily = findNPC('lily');
      const elder = findNPC('elder');
      if (lily && elder) {
        lily.mesh.position.x = elder.mesh.position.x + 1.5;
        lily.mesh.position.z = elder.mesh.position.z + 1.5;
      }
    }
  });
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
}

// === Запуск игры ===
async function startGame() {
  show(null);
  document.getElementById('loadingOverlay')?.classList.add('show');
  await loadData();
  initGameSystems();
  generateWorld();
  createPlayer();
  gameRunning = true;
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
  document.getElementById('loadingOverlay')?.classList.remove('show');
  addChatMsg(`👋 Добро пожаловать, ${state.character.name}!`);
  updateZoneUI({ name: 'Деревня Хорса' });
}

// === Генерация мира ===
function generateWorld() {
  const HALF = 200, CHUNK = 50;
  for (let cx = -HALF; cx < HALF; cx += CHUNK) {
    for (let cz = -HALF; cz < HALF; cz += CHUNK) {
      buildChunk(cx, cz);
    }
  }

  populateWorld();
  buildDecor();
  buildFence();
  buildTeleport(VILLAGE.x, VILLAGE.z + 24);

  // === NPC ===
  spawnNPC('helga', VILLAGE.x - 6,  VILLAGE.z - 20,   0);
  spawnNPC('dorn',  VILLAGE.x + 26, VILLAGE.z + 22,   0);
  spawnNPC('iva',   VILLAGE.x - 5,  VILLAGE.z + 16,   Math.PI);
  spawnNPC('yasen', VILLAGE.x + 5,  VILLAGE.z + 20,   Math.PI);

  // === Мобы из зон (плотность ×5) ===
  for (const zone of zoneManager.zones) {
    spawnFromZone(zone, 5);
  }

  // === 900 диких мобов по всей карте (кроме деревни и зон) ===
  const VILLAGE_GUARD_R = 110;
  let spawned = 0, attempts = 0;
  while (spawned < 900 && attempts < 6000) {
    attempts++;
    const x = rnd(-HALF + 20, HALF - 20);
    const z = rnd(-HALF + 20, HALF - 20);

    // Отсев возле деревни
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE_GUARD_R) continue;

    // Отсев внутри зон (там мобы уже спавнились через spawnFromZone)
    const inZone = zoneManager.zones.some(zn =>
      Math.hypot(x - zn.center.x, z - zn.center.z) < zn.radius * 0.9
    );
    if (inZone) continue;

    // Отсев на воде
    if (isWater(x, z) && !isOnBridgeExact(x, z)) continue;

    // Отсев в коллайдерах (постройки, камни)
    if (hitsCollider(x, z, 0.9)) continue;

    if (spawnRandomMob(x, z)) spawned++;
  }

  console.log(`[generateWorld] Спавнено диких мобов: ${spawned}/${attempts} попыток`);
}

// === Создание игрока ===
function createPlayer() {
  playerRoot = new THREE.Group();
  world.scene.add(playerRoot);

  hero = createHumanoid({
    skin: state.character.skin, hair: state.character.hair,
    shirt: state.character.outfit,
    pants: 0x5a4a48,
    gender: state.character.gender, hairStyle: state.character.hairStyle,
    eyeColor: state.character.eyeColor, mouthStyle: state.character.mouthStyle,
    bodyType: state.character.bodyType, beard: state.character.beard,
  });
  hero.scale.setScalar(0.95);
  playerRoot.add(hero);

  weaponAnchor = new THREE.Group();
  hero.userData.handR.add(weaponAnchor);

  shieldAnchor = new THREE.Group();
  hero.userData.handL.add(shieldAnchor);

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
  shieldSheathAnchor.rotation.set(0, 0, 0);
  hero.userData.spineUpper.add(shieldSheathAnchor);

  ensureAnimState(hero);

  recalcStats();
  state.hp = state.hpMax;
  state.mp = state.mpMax;

  // Спавн у деревни
  const spawnX = VILLAGE.x, spawnZ = VILLAGE.z + 8;
  playerRoot.position.set(spawnX, groundHeight(spawnX, spawnZ), spawnZ);
  world.camCurrent.set(spawnX, 13.2, spawnZ + 10);
  world.camera.position.copy(world.camCurrent);

  window.addEventListener('inv:changed', () => {
    applyEquipmentVisuals(
      hero, weaponAnchor, shieldAnchor,
      weaponSheathAnchor, weaponHipAnchor, shieldSheathAnchor
    );
    currentWeaponMeshHand = weaponAnchor.children[0] || null;
    state.combatTimer = 5;
  });

  const IT = window.registry.items || {};
  const mk = (id) => {
    const it = IT[id];
    if (!it) { console.warn('[start] item not found:', id); return null; }
    return { ...it, dur: it.maxDur ?? 0 };
  };

  const hpP = mk('hp_potion');
  const mpP = mk('mp_potion');
  if (hpP) { state.inv.push({ ...hpP }, { ...hpP }); }
  if (mpP) { state.inv.push({ ...mpP }, { ...mpP }); }

  const sword2h = mk('sword_2h');
  const staff   = mk('staff_oak');
  const bow     = mk('bow_battle');
  const armor   = mk('armor_leather');
  const shield  = mk('shield_wooden');
  if (sword2h) state.inv.push(sword2h);
  if (staff)   state.inv.push(staff);
  if (bow)     state.inv.push(bow);
  if (armor)   state.inv.push(armor);
  if (shield)  state.inv.push(shield);

  const swordEq = mk('sword_rusty');
  const shieldEq = mk('shield_wooden');
  const armorEq = mk('armor_leather');
  if (swordEq)  state.eq.weapon = swordEq;
  if (shieldEq) state.eq.shield = shieldEq;
  if (armorEq)  state.eq.armor = armorEq;

  applyEquipmentVisuals(
    hero, weaponAnchor, shieldAnchor,
    weaponSheathAnchor, weaponHipAnchor, shieldSheathAnchor
  );
  currentWeaponMeshHand = weaponAnchor.children[0] || null;

  renderInventory();
  updateOrbs();
  updateXPBar();

  playerNameLabel = document.createElement('div');
  playerNameLabel.className = 'plabel';
  playerNameLabel.textContent = `${state.character.name} [ур.1]`;
  document.getElementById('world-ui')?.appendChild(playerNameLabel);
}

// === Главный цикл ===
let gameRunning = false;
let lastTime = 0;

function gameLoop(now) {
  if (!gameRunning) return;
  requestAnimationFrame(gameLoop);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // Анимация костров
  if (window._campfires) {
    for (const cf of window._campfires) {
      cf.t += dt;
      const f = 1 + Math.sin(cf.t * 9) * 0.18 + Math.sin(cf.t * 14) * 0.12;
      if (cf.light) cf.light.intensity = 1.8 * f;
      if (cf.flame1) cf.flame1.scale.set(1, 0.85 + 0.2 * Math.sin(cf.t * 8), 1);
      if (cf.flame2) cf.flame2.scale.set(1, 0.9 + 0.18 * Math.sin(cf.t * 11), 1);
      if (cf.flame3) cf.flame3.scale.set(1, 0.95 + 0.15 * Math.sin(cf.t * 13), 1);
      for (const sp of cf.sparks || []) {
        const phase = (cf.t * 0.8 + sp.userData.phase) % 1;
        sp.position.y = sp.userData.baseY + phase * 1.5;
        sp.position.x = Math.cos(sp.userData.a + cf.t * 1.5) * sp.userData.r * (1 - phase * 0.5);
        sp.position.z = Math.sin(sp.userData.a + cf.t * 1.5) * sp.userData.r * (1 - phase * 0.5);
        sp.material.opacity = 1 - phase;
      }
      for (const sm of cf.smoke || []) {
        const phase = (cf.t * 0.5 + sm.userData.phase) % 1;
        sm.position.y = 1.0 + phase * 2.5;
        sm.position.x = Math.sin(cf.t * 0.7 + sm.userData.phase) * 0.4 * phase;
        sm.material.opacity = 0.35 * (1 - phase);
      }
    }
  }

  if (state.alive) update(dt);

  // === Обработка атаки ===
  if (input.attackHeld && state.alive && gameRunning) {
    attackHoldTime += dt;
    if (isStaffChanneling()) {
      // Посох: канал при зажатии
      setCombatMode(true);
      state.combatMode = true;
      state.combatTimer = 6;
      if (attackHoldTime >= 0.3) {
        state.channeling = true;
        updateStaffChannel(dt);
      }
    } else {
      // Обычная атака (ближний бой / лук)
      if (attackHoldTime >= 0.05) {
        if (state.atkCd <= 0) doAttack();
      }
    }
  }

  updateAbilityUI();
  updateFireParticles(dt);
  updateEffects(dt);
  updateFloaters(dt, world.camera);

  if (state.hurtFlash > 0) state.hurtFlash -= dt;

  world.renderer.render(world.scene, world.camera);
}

// === Обновление ===
function update(dt) {
  window.__playerPos = playerRoot.position;
  window.__playerRot = playerRoot.rotation.y;
  if (!playerRoot || !hero) return;
  const anim = ensureAnimState(hero);
  anim.t += dt;
  anim.attackType = state.attackType;

  // Движение
  let moving = false;
  const { vx, vz } = readMove();
  const SPEED = 6.2;
  let dx = 0, dz = 0;

  // При канале посоха — стоим
  if (state.channeling) {
    dx = 0; dz = 0;
  } else if (vx || vz) {
    const len = Math.hypot(vx, vz);
    const nx = vx / len, nz = vz / len;
    dx = nx * SPEED * dt; dz = nz * SPEED * dt;
    playerRoot.rotation.y = Math.atan2(nx, nz);
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
        !(isWater(nxp, playerRoot.position.z) && !isOnBridgeExact(nxp, playerRoot.position.z)) &&
        Math.abs(nxp) < 199) {
      playerRoot.position.x = nxp;
    }
    if (!hitsCollider(playerRoot.position.x, nzp, 0.42) &&
        !(isWater(playerRoot.position.x, nzp) && !isOnBridgeExact(playerRoot.position.x, nzp)) &&
        Math.abs(nzp) < 199) {
      playerRoot.position.z = nzp;
    }
  }

  const py = groundHeight(playerRoot.position.x, playerRoot.position.z);
  const dy = py - playerRoot.position.y;
  if (moving && Math.abs(dy) > 0.35 && (!state.stepUp || state.stepUp.t <= 0)) {
    state.stepUp = { t: 0.45, maxT: 0.45, sign: dy > 0 ? 1 : -1 };
  }
  if (state.stepUp) {
    state.stepUp.t -= dt;
    if (state.stepUp.t <= 0) state.stepUp = null;
  }
  playerRoot.position.y += (py - playerRoot.position.y) * Math.min(1, dt * 18);

  // Анимация
  if (state.channeling) {
    anim.mode = 'attack';
    anim.attackType = 'staff';
    anim.swing = state.swing || 0.5;
  } else if (state.swing > 0) {
    anim.mode = 'attack';
    anim.swing = state.swing;
  } else if (moving) {
    anim.mode = 'walk';
    anim.walkPhase += dt * 9;
  } else {
    anim.mode = 'idle';
  }
  animateHumanoid(hero, anim, dt);

  // Достать/убрать оружие
  if (state.handAnim && !state.channeling) {
    state.handAnim.t += dt;
    const dur = state.handAnim.dur || 0.55;
    if (state.handAnim.t >= dur) {
      state.handAnim = null;
    } else {
      const k = Math.min(1, state.handAnim.t / dur);
      const ws = Math.sin(k * Math.PI);
      const w = state.eq.weapon;
      const isTwoH = w && (w.twoHanded || w.kind === 'bow' || w.kind === 'staff' || w.kind === 'axe');
      if (state.handAnim.type === 'draw') {
        if (isTwoH) {
          hero.userData.armL.rotation.x = -ws * 1.3;
          hero.userData.armL.rotation.z = -ws * 0.6;
        } else {
          hero.userData.armL.rotation.x = ws * 0.4;
          hero.userData.armL.rotation.z = -ws * 1.2;
        }
        if (state.eq.shield) {
          hero.userData.armR.rotation.x = -ws * 1.3;
          hero.userData.armR.rotation.z = ws * 0.6;
        }
      } else {
        if (isTwoH) {
          hero.userData.armL.rotation.x = -ws * 1.3;
          hero.userData.armL.rotation.z = -ws * 0.6;
        } else {
          hero.userData.armL.rotation.x = ws * 0.4;
          hero.userData.armL.rotation.z = -ws * 1.2;
        }
        if (state.eq.shield) {
          hero.userData.armR.rotation.x = -ws * 1.3;
          hero.userData.armR.rotation.z = ws * 0.6;
        }
      }
    }
  }

  if (state.atkCd > 0) state.atkCd -= dt;
  if (state.abilityCd > 0) state.abilityCd -= dt;
  if (state.swing > 0 && !state.channeling) state.swing -= dt * 4.2;

  // Боевой таймер
  if (state.combatTimer > 0) state.combatTimer -= dt;
  else if (state.combatMode && !state.channeling) setCombatMode(false);

  // Мобы
  window.__playerPos = playerRoot.position;
  updateNPCs(dt);
  updateMobs(dt, playerRoot.position);

  // Снаряды
  updateProjectiles(dt);
  updateEnemyProjectiles(dt, playerRoot.position);
  updateBurns(dt);

  // Зоны
  updateZones(playerRoot.position, dt);

  // Телепорт
  if (!window.__teleportCooldown) window.__teleportCooldown = 0;
  if (window.__teleportCooldown > 0) window.__teleportCooldown -= dt;
  const dtp = Math.hypot(
    playerRoot.position.x - TELEPORT_POS.x,
    playerRoot.position.z - TELEPORT_POS.z
  );
  if (dtp < 3 && window.__teleportCooldown <= 0) {
    window.__teleportCooldown = 3;
    const msg = document.getElementById('teleportMsg');
    if (msg) {
      msg.textContent = '🌀 Нет открытых мест для путешествия';
      msg.classList.add('show');
      clearTimeout(msg._t);
      msg._t = setTimeout(() => msg.classList.remove('show'), 2500);
    }
  }

  updateCameraFollow(playerRoot.position, dt);
  updateOrbs();
}

// === Атака (ближний бой / лук / короткий тап посохом) ===
function doAttack() {
  setCombatMode(true);
  state.combatMode = true;
  state.combatTimer = 6;

  const ranged = playerRanged();
  if (ranged) {
    // === Дальний бой: поиск цели в конусе, стрельба в цель ===
    const rotY = playerRoot.rotation.y;
    const forward = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    const maxRange = playerAttackRange();
    let target = null, bestScore = -Infinity;
    for (const e of spawner.mobs) {
      if (!e.alive) continue;
      const toE = e.group.position.clone().sub(playerRoot.position);
      toE.y = 0;
      const dist = toE.length();
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
      spawnProjectile(startPos, dir, totalDamage(), ranged, target);
    } else {
      spawnProjectile(startPos, forward, totalDamage(), ranged, null);
    }
    return;
  }

  // === Ближний бой ===
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
  dir.y = 0;
  dir.normalize();
  playerRoot.rotation.y = Math.atan2(dir.x, dir.z);

  const finalDist = playerRoot.position.distanceTo(target.group.position);
  if (finalDist <= range * 1.15) {
    doMeleeAttack(target, playerRoot.position, playerRoot.rotation.y);
  } else {
    state.swing = 1;
    state.atkCd = playerAttackSpeed() * 0.6;
    state.attackType = 'melee';
  }
}

// === Канал посоха (при зажатии >0.3 сек) ===
function updateStaffChannel(dt) {
  if (!state.channeling) return;
  setCombatMode(true);
  state.combatMode = true;
  state.combatTimer = 6;
  state.attackType = 'staff';
  state.swing = Math.min(0.5, (state.swing || 0) + dt * 3);

  const tip = getWeaponWorldTip();
  const rotY = playerRoot.rotation.y;
  const forward = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));

  // Визуальные частицы пламени
  for (let i = 0; i < 2; i++) {
    const col = Math.random() < 0.5 ? 0xffb080 : 0xffd0a0;
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 })
    );
    p.position.copy(tip);
    p.position.x += rnd(-0.15, 0.15);
    p.position.y += rnd(-0.15, 0.15);
    p.position.z += rnd(-0.15, 0.15);
    p.userData.vel = forward.clone().multiplyScalar(rnd(10, 18));
    p.userData.life = 0.5;
    world.scene.add(p);
    combat.fireParticles.push(p);
  }

  // Урон раз в секунду по конусу
  state.channelTick = (state.channelTick || 0) + dt;
  if (state.channelTick >= 1.0) {
    state.channelTick = 0;
    const dmgRange = totalDamage();
    const dmgPerTick = Math.max(3, Math.floor((dmgRange[0] + dmgRange[1]) * 0.5 * 1.10));
    const skillKey = classifyWeapon(state.eq.weapon);
    for (let i = spawner.mobs.length - 1; i >= 0; i--) {
      const e = spawner.mobs[i];
      if (!e.alive) continue;
      const toE = e.group.position.clone().sub(playerRoot.position);
      toE.y = 0;
      const dist = toE.length();
      if (dist > 13) continue;
      toE.normalize();
      const dot = toE.dot(forward);
      if (dot < 0.3) continue;
      e.hp -= dmgPerTick;
      e.hurt = 1;
      e.aggroed = true;
      e.chasing = true;
      if (!e.leashFrom) e.leashFrom = { x: e.group.position.x, z: e.group.position.z };
      combat.addBlood(e, 1);
      combat.spawnFloater(e.group.position.clone().setY(1.8), '🔥 ' + dmgPerTick, 'fire');
      applyBurn(e, dmgPerTick);
      if (skillKey) gainSkillXP(skillKey, dmgPerTick, false);
      if (e.hp <= 0) killEnemy(e);
    }
  }
}

// === Короткий тап посохом — одиночный выстрел ===
function performStaffBurst() {
  if (state.atkCd > 0) return;
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
    toE.y = 0;
    const dist = toE.length();
    if (dist > 11) continue;
    toE.normalize();
    const dot = toE.dot(forward);
    if (dot < 0.35) continue;
    e.hp -= dmg;
    e.hurt = 1;
    e.aggroed = true;
    e.chasing = true;
    if (!e.leashFrom) e.leashFrom = { x: e.group.position.x, z: e.group.position.z };
    combat.addBlood(e, 1);
    combat.spawnFloater(e.group.position.clone().setY(1.8), '🔥 ' + dmg, 'fire');
    applyBurn(e, dmg);
    if (skillKey) gainSkillXP(skillKey, dmg, false);
    if (e.hp <= 0) killEnemy(e);
  }

  const tip = getWeaponWorldTip();
  for (let i = 0; i < 8; i++) {
    const col = Math.random() < 0.5 ? 0xffb080 : 0xffd0a0;
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.24, 0.24),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 })
    );
    p.position.copy(tip);
    p.position.x += rnd(-0.2, 0.2);
    p.position.y += rnd(-0.2, 0.2);
    p.position.z += rnd(-0.2, 0.2);
    p.userData.vel = forward.clone().multiplyScalar(rnd(12, 22));
    p.userData.life = 0.55;
    world.scene.add(p);
    combat.fireParticles.push(p);
  }
}

// === Способности ===
function useAbility() {
  if (!state.alive) return;
  if (state.abilityCd > 0) return;
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
      best.hp -= base;
      best.hurt = 1;
      best.aggroed = true;
      best.chasing = true;
      if (best.hp <= 0) killEnemy(best);
    }
  } else if (ab.id === 'explode') {
    for (const e of spawner.mobs) {
      if (!e.alive) continue;
      if (playerRoot.position.distanceTo(e.group.position) > ab.radius) continue;
      e.hp -= base;
      e.hurt = 1;
      e.aggroed = true;
      e.chasing = true;
      if (e.hp <= 0) killEnemy(e);
    }
    spawnWave(playerRoot.position, ab.radius, 0xd090d0);
  } else if (ab.id === 'freeze') {
    for (const e of spawner.mobs) {
      if (!e.alive) continue;
      const toE = e.group.position.clone().sub(playerRoot.position);
      toE.y = 0;
      const d = toE.length();
      if (d > ab.radius) continue;
      const forward = new THREE.Vector3(Math.sin(playerRoot.rotation.y), 0, Math.cos(playerRoot.rotation.y));
      if (toE.normalize().dot(forward) < 0.35) continue;
      e.hp -= base;
      e.hurt = 1;
      e.aggroed = true;
      e.chasing = true;
      e.frozen = { timeLeft: ab.freezeTime };
      if (e.hp <= 0) killEnemy(e);
    }
    spawnWave(playerRoot.position, ab.radius, 0xb8d8f0);
  }
  state.abilityCd = ab.cd;
}

// === Тап по миру ===
function handleWorldTap(cx, cy) {
  if (!state.alive) return;
  if (document.querySelector('.screen.show')) return;
  if (document.getElementById('inv')?.classList.contains('open')) return;
  if (document.getElementById('itemPopupBackdrop')?.classList.contains('show')) return;

  const ndc = new THREE.Vector2(
    (cx / innerWidth) * 2 - 1,
    -(cy / innerHeight) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, world.camera);

  const npcHits = ray.intersectObjects(npcMeshes, true);
  if (npcHits.length > 0) {
    let obj = npcHits[0].object;
    while (obj && !obj.userData.npc) obj = obj.parent;
    if (obj?.userData.npc) {
      const dlg = window.__dialogEngine;
      if (dlg) dlg.start(obj.userData.npc.dialogId, obj.userData.npc);
      return;
    }
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

// === Потребление зелий ===
function consumePotion(id) {
  const idx = state.inv.findIndex(i => i.id === id);
  if (idx < 0) return;
  const it = state.inv[idx];
  if (it.heal) state.hp = Math.min(state.hpMax, state.hp + it.heal);
  if (it.mana) state.mp = Math.min(state.mpMax, state.mp + it.mana);
  state.inv.splice(idx, 1);
  renderInventory();
  updateOrbs();
}

// === Респавн у деревни (а не в воде) ===
document.getElementById('btnRespawn')?.addEventListener('click', () => {
  state.hp = state.hpMax;
  state.mp = state.mpMax;
  state.alive = true;
  document.getElementById('death').style.display = 'none';
  const sx = VILLAGE.x, sz = VILLAGE.z + 8;
  playerRoot.position.set(sx, groundHeight(sx, sz), sz);
  state.stepUp = null;
  state.channeling = false;
  state.channelTick = 0;
  state.swing = 0;
  attackHoldTime = 0;
  updateOrbs();
});

// === Bootstrap ===
initMenus(startGame);
import('./ui/preview.js').then(m => m.initPreview?.()).catch(() => {});