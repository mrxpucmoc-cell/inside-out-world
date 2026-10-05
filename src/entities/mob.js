// Фабрика мобов из JSON-описания.
// kind определяет тело, def.stats — характеристики, def.ai — поведение.

import * as THREE from 'three';
import { createHumanoid, ensureAnimState } from './humanoid.js';
import { buildWeapon } from './item.js';
import { addOutlineToGroup, shadeColor } from '../core/assets.js';
import { world } from '../core/scene.js';

// Фабрики тел — легко расширяются
const KIND_FACTORY = {
  humanoid: def => createHumanoid({ ...def.look, pants: def.look?.pants ?? 0x5a4a48 }),
  ghost:    def => createHumanoid({ ...def.look, ghost: true }),
  beast:    def => createBeast(def),
  golem:    ()  => createGolem(),
  troll:    ()  => createTroll(),
  crab:     def => createCrab(def),
  lizard:   def => createLizard(def),
};

export function spawnMob(defId, def, x, z, ctx) {
  const factory = KIND_FACTORY[def.kind] || KIND_FACTORY.humanoid;
  const g = factory(def);

  // Оружие в руку, если задано
  if (def.weapon && ctx.items?.[def.weapon]) {
    const w = buildWeapon(ctx.items[def.weapon]);
    w.rotation.set(Math.PI / 2, 0, 0);
    w.position.set(0, -0.16, 0.12);
    g.userData.handR?.add(w);
  }

  g.scale.setScalar(def.scale || 1);
  const y = ctx.groundHeight(x, z);
  g.position.set(x, y + (def.kind === 'ghost' ? 0.7 : 0), z);
  g.rotation.y = Math.random() * Math.PI * 2;

  // Клонируем материалы, чтобы hurt-эффект не задевал других мобов
  g.traverse(o => {
    if (o.isMesh && o.material && !o.userData.isOutline) {
      o.material = o.material.clone();
    }
  });
  addOutlineToGroup(g, 0x1a1010, 1.035);
  world.scene.add(g);

  const stats = def.stats;
  const e = {
    defId, type: def, group: g, parts: g.userData,
    hp: stats.hp, hpMax: stats.hp,
    dmg: stats.dmg, speed: stats.speed,
    alive: true, hurt: 0, hurtPrev: 0,
    atkCd: Math.random(),
    aggroed: false,
    wanderDir: { x: 0, z: 0 },
    wanderTime: Math.random() * 2,
    spawnX: x, spawnZ: z,
    anim: ensureAnimState(g),
    blood: [], frozen: null, burn: null,
    mats: [],
  };

  // Собираем материалы для hurt-эффекта
  g.traverse(o => {
    if (o.isMesh && o.material?.emissive && !o.userData.isOutline) {
      e.mats.push(o.material);
    }
  });

  g.traverse(o => { if (o.isMesh) o.userData.enemy = e; });

  return e;
}

// === Вспомогательные конструкторы тел ===

function createBeast(def) {
  const root = new THREE.Group();
  const bc = def.look?.body ?? 0xb8a890;
  const dc = shadeColor(bc, 0.75);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 1.35), getMatSafe(bc));
  body.position.y = 0.75;
  root.add(body);
  const headG = new THREE.Group();
  headG.position.set(0, 1.02, 0.85);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.55), getMatSafe(bc));
  headG.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.35), getMatSafe(dc));
  snout.position.set(0, -0.1, 0.4);
  headG.add(snout);
  const eyeColor = def.look?.eyeColor ?? 0xf0d8a0;
  for (const sx of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.02),
      new THREE.MeshBasicMaterial({ color: eyeColor }));
    eye.position.set(sx, 0.08, 0.29);
    headG.add(eye);
  }
  for (const sx of [-0.17, 0.17]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.06), getMatSafe(dc));
    ear.position.set(sx, 0.32, -0.05);
    headG.add(ear);
  }
  root.add(headG);
  // Ноги
  const legs = [];
  for (const [lx, lz] of [[-0.28, -0.5], [0.28, -0.5], [-0.28, 0.5], [0.28, 0.5]]) {
    const leg = new THREE.Group();
    leg.position.set(lx, 0.5, lz);
    const lm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), getMatSafe(dc));
    lm.position.y = -0.25;
    leg.add(lm);
    root.add(leg);
    legs.push(leg);
  }
  if (def.look?.tail) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.55), getMatSafe(bc));
    tail.position.set(0, 0.95, -0.85);
    tail.rotation.x = 0.4;
    root.add(tail);
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  root.userData = { headG, body, legs, kind: 'beast' };
  return root;
}

function createGolem() {
  const root = new THREE.Group();
  const sc = 0x9a8a78, dc = 0x6a5a48, gc = 0xe07070;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.2), getMatSafe(sc));
  torso.position.y = 1.55;
  root.add(torso);
  const headG = new THREE.Group();
  headG.position.y = 2.75;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.95, 0.95), getMatSafe(sc));
  headG.add(head);
  for (const sx of [-0.24, 0.24]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.14, 0.05),
      new THREE.MeshBasicMaterial({ color: gc }));
    eye.position.set(sx, 0.1, 0.49);
    headG.add(eye);
  }
  root.add(headG);
  for (const sx of [-1.1, 1.1]) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.95), getMatSafe(dc));
    sh.position.set(sx, 2.15, 0);
    root.add(sh);
  }
  const armL = new THREE.Group();
  armL.position.set(-1.1, 1.9, 0);
  const am = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.75, 0.6), getMatSafe(sc));
  am.position.y = -0.875;
  armL.add(am);
  const fL = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), getMatSafe(dc));
  fL.position.y = -1.9;
  armL.add(fL);
  root.add(armL);
  const armR = new THREE.Group();
  armR.position.set(1.1, 1.9, 0);
  const armRm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.75, 0.6), getMatSafe(sc));
  armRm.position.y = -0.875;
  armR.add(armRm);
  const fR = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), getMatSafe(dc));
  fR.position.y = -1.9;
  armR.add(fR);
  root.add(armR);
  const legL = new THREE.Group();
  legL.position.set(-0.42, 1.2, 0);
  const lm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.2, 0.62), getMatSafe(dc));
  lm.position.y = -0.6;
  legL.add(lm);
  root.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.42, 1.2, 0);
  const rm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.2, 0.62), getMatSafe(dc));
  rm.position.y = -0.6;
  legR.add(rm);
  root.add(legR);
  const el = new THREE.PointLight(gc, 1.1, 6);
  el.position.set(0, 2.85, 0.55);
  root.add(el);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  root.userData = { headG, torso, armL, armR, legL, legR, armLm: am, armRm, legLm: lm, legRm: rm, kind: 'golem' };
  return root;
}

function createTroll() {
  const root = new THREE.Group();
  const sc = 0x8a8068, dc = 0x5a5040;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 1.4), getMatSafe(sc));
  torso.position.y = 1.8;
  root.add(torso);
  const headG = new THREE.Group();
  headG.position.y = 3.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 1.2), getMatSafe(sc));
  headG.add(head);
  for (const sx of [-0.3, 0.3]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.16, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xf0d8a0 }));
    eye.position.set(sx, 0.15, 0.6);
    headG.add(eye);
  }
  root.add(headG);
  const armL = new THREE.Group();
  armL.position.set(-1.3, 2.2, 0);
  const am = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.0, 0.75), getMatSafe(sc));
  am.position.y = -1.0;
  armL.add(am);
  const fL = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), getMatSafe(dc));
  fL.position.y = -2.15;
  armL.add(fL);
  root.add(armL);
  const armR = new THREE.Group();
  armR.position.set(1.3, 2.2, 0);
  const armRm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.0, 0.75), getMatSafe(sc));
  armRm.position.y = -1.0;
  armR.add(armRm);
  const fR = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), getMatSafe(dc));
  fR.position.y = -2.15;
  armR.add(fR);
  root.add(armR);
  const legL = new THREE.Group();
  legL.position.set(-0.5, 1.4, 0);
  const lm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.4, 0.75), getMatSafe(dc));
  lm.position.y = -0.7;
  legL.add(lm);
  root.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.5, 1.4, 0);
  const rm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.4, 0.75), getMatSafe(dc));
  rm.position.y = -0.7;
  legR.add(rm);
  root.add(legR);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  root.userData = { headG, torso, armL, armR, legL, legR, armLm: am, armRm, legLm: lm, legRm: rm, kind: 'troll' };
  return root;
}

/* ============================================================
   КРАБ (по «Варианты Краба.html» — вариант 1)
   ============================================================ */
function createCrab(def) {
  const g = new THREE.Group();
  const cfg = def.look || {};
  const shell      = cfg.shell      ?? 0xc85a5a;
  const shellDark  = cfg.shellDark  ?? 0x7a2020;
  const shellLight = cfg.shellLight ?? 0xe88878;
  const clawColor  = cfg.clawColor  ?? shell;
  const clawDark   = cfg.clawDark   ?? shellDark;
  const legColor   = cfg.legColor   ?? shellDark;
  const eyeColor   = cfg.eyeColor   ?? 0x101010;
  const bodyW       = cfg.bodyW       ?? 0.75;
  const bodyH       = cfg.bodyH       ?? 0.28;
  const bodyD       = cfg.bodyD       ?? 0.85;
  const bodyY       = cfg.bodyY       ?? 0.32;
  const clawSize    = cfg.clawSize    ?? 0.42;
  const clawBig     = cfg.clawBig     ?? false;
  const legPairs    = cfg.legPairs    ?? 3;
  const legLen      = cfg.legLen      ?? 0.34;
  const legSpread   = cfg.legSpread   ?? 1.0;
  const eyeStalkLen = cfg.eyeStalkLen ?? 0.20;
  const eyeSize     = cfg.eyeSize     ?? 0.10;
  const eyeGlow     = cfg.eyeGlow     ?? 0;
  const hasTailFlap = cfg.tailFlap    ?? false;

  // ПАНЦИРЬ
  g.add(getBox(bodyW, bodyH, bodyD, shell, 0, bodyY, 0));
  g.add(getBox(bodyW*0.9, bodyH*0.35, bodyD*0.9, shellLight, 0, bodyY + bodyH*0.32, 0));

  // РОТ
  const faceZ = bodyD * 0.5;
  g.add(getBox(bodyW*0.35, 0.05, 0.05, 0x1a0808, 0, bodyY - bodyH*0.10, faceZ + 0.01));

  // ГЛАЗА
  const eyeBaseY = bodyY + bodyH*0.5;
  const eyeBaseX = bodyW * 0.22;
  const eyeBaseZ = faceZ - 0.10;
  for (const sx of [-1, 1]) {
    g.add(getBox(0.06, eyeStalkLen, 0.06, shell,
      sx*eyeBaseX, eyeBaseY + eyeStalkLen/2, eyeBaseZ));
    g.add(getBox(eyeSize, eyeSize, eyeSize, shellLight,
      sx*eyeBaseX, eyeBaseY + eyeStalkLen + eyeSize*0.5, eyeBaseZ));
    g.add(getBox(eyeSize*0.55, eyeSize*0.55, eyeSize*0.15, eyeColor,
      sx*eyeBaseX, eyeBaseY + eyeStalkLen + eyeSize*0.5, eyeBaseZ + eyeSize*0.5));
    if (eyeGlow) {
      g.add(getBox(eyeSize*0.3, eyeSize*0.3, eyeSize*0.1, eyeGlow,
        sx*eyeBaseX, eyeBaseY + eyeStalkLen + eyeSize*0.5, eyeBaseZ + eyeSize*0.62));
    }
  }

  // КЛЕШНИ
  const clawY = bodyY - 0.02;
  const clawZ = faceZ + 0.15;
  for (const sx of [-1, 1]) {
    const isBig = clawBig && sx > 0;
    const sizeMul = isBig ? 1.6 : 1.0;
    const cSize = clawSize * sizeMul;
    g.add(getBox(cSize, cSize*0.8, cSize*1.1, clawColor,
      sx*(bodyW*0.55 + cSize*0.35), clawY, clawZ));
    g.add(getBox(cSize*0.55, cSize*0.35, cSize*0.5, clawDark,
      sx*(bodyW*0.55 + cSize*0.35), clawY + cSize*0.28, clawZ + cSize*0.55));
  }

  // НОГИ
  const legYs = bodyY - bodyH * 0.15;
  for (let p = 0; p < legPairs; p++) {
    const t = p / Math.max(1, legPairs - 1);
    const legZ = 0.20 - t * bodyD * 0.55;
    for (const sx of [-1, 1]) {
      g.add(getBox(legLen, 0.07, 0.07, legColor,
        sx*(bodyW*0.5 + legSpread*0.15),
        legYs - legLen*0.4,
        legZ,
        0, 0, sx * 0.6));
      g.add(getBox(0.09, 0.05, 0.20, clawDark,
        sx*(bodyW*0.5 + legSpread*0.32), 0.03, legZ + 0.05));
    }
  }

  // ТЕЛЬСОН
  if (hasTailFlap) {
    const flap = getBox(bodyW*0.7, 0.08, 0.25, shellDark,
      0, bodyY - bodyH*0.30, -bodyD*0.45);
    flap.rotation.x = 0.3;
    g.add(flap);
  }

  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { kind: 'crab' };
  return g;
}

/* ============================================================
   ЯЩЕРИЦА (по «Варианты Ящерицы.html» — вариант 8 Огненная)
   ============================================================ */
function createLizard(def) {
  const g = new THREE.Group();
  const L = def.look || {};
  const body      = L.body      ?? 0xd86828;
  const bodyDark  = L.bodyDark  ?? 0x8a3010;
  const bodyLight = L.bodyLight ?? 0xe89848;
  const belly     = L.belly     ?? 0xf8c878;
  const eyeColor  = L.eyeColor  ?? 0xffe050;
  const spikeColor= L.spikeColor?? 0x5a1808;

  const bodyLen = 0.58, bodyH = 0.22, bodyW = 0.32, bodyY = 0.22;
  const headLen = 0.35, headH = 0.24, headW = 0.27;

  // Тело
  g.add(getBox(bodyW, bodyH, bodyLen, body, 0, bodyY, 0));
  g.add(getBox(bodyW*0.9, bodyH*0.25, bodyLen*0.9, belly, 0, bodyY - bodyH*0.38, 0));

  // Шипы
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const sh = 0.05 + (1 - Math.abs(t - 0.5) * 1.5) * 0.06;
    g.add(getBox(0.05, sh, 0.05, spikeColor, 0, bodyY + bodyH/2 + sh/2, -bodyLen*0.4 + t*bodyLen*0.8));
  }

  // Хвост из 5 сегментов
  let curW = bodyW * 0.6, curH = bodyH * 0.6, curY = bodyY;
  for (let i = 0; i < 5; i++) {
    const segLen = 1.0 / 5;
    g.add(getBox(curW, curH, segLen, i % 2 === 0 ? body : bodyDark,
      0, curY, -bodyLen/2 - segLen/2 - i*segLen));
    curY -= 0.012; curW *= 0.75; curH *= 0.78;
  }

  // Голова
  const headZ = bodyLen/2 + headLen/2;
  const headY = bodyY + 0.02;
  g.add(getBox(headW, headH, headLen, body, 0, headY, headZ));
  g.add(getBox(headW*0.85, headH*0.72, headLen*0.55, bodyLight, 0, headY - 0.005, headZ + headLen*0.42));
  g.add(getBox(headW*0.55, headH*0.5, headLen*0.18, bodyLight, 0, headY - 0.01, headZ + headLen*0.75));
  g.add(getBox(headW*0.92, headH*0.32, headLen*0.85, bodyDark, 0, headY - headH*0.38, headZ + headLen*0.03));

  // Глаза
  const eyeY = headY + headH*0.28;
  const eyeZ = headZ + headLen*0.10;
  for (const sx of [-1, 1]) {
    g.add(getBox(0.035, 0.09, 0.09, bodyLight, sx*(headW/2 - 0.005), eyeY, eyeZ));
    g.add(getBox(0.025, 0.075, 0.075, 0x050505, sx*(headW/2 + 0.010), eyeY, eyeZ));
    g.add(getBox(0.015, 0.05, 0.05, eyeColor, sx*(headW/2 + 0.020), eyeY, eyeZ));
  }

  // Лапы
  const legLen = 0.18, legW = 0.07;
  const legData = [
    { x: -bodyW/2 - legW/2, z:  bodyLen*0.30, sx: -1, sz: 1 },
    { x:  bodyW/2 + legW/2, z:  bodyLen*0.30, sx: 1,  sz: 1 },
    { x: -bodyW/2 - legW/2, z: -bodyLen*0.30, sx: -1, sz: -1 },
    { x:  bodyW/2 + legW/2, z: -bodyLen*0.30, sx: 1,  sz: -1 },
  ];
  for (const Ld of legData) {
    g.add(getBox(legW, legLen, legW, bodyDark,
      Ld.x, bodyY - bodyH*0.4, Ld.z, 0, 0, Ld.sx * 0.3));
    const footX = Ld.x + Ld.sx * legW*0.55;
    const footZ = Ld.z + Ld.sz * legW*0.4;
    g.add(getBox(legW*1.7, legW*0.7, legW*1.7, bodyDark,
      footX, legW*0.35, footZ));
  }

  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { kind: 'lizard' };
  return g;
}

// Хелпер для новых фабрик (getMat уже импортирован ниже)
function getBox(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getMat(color));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Локальная обёртка, чтобы не импортировать getMat в каждый модуль
import { getMat } from '../core/assets.js';
function getMatSafe(hex) { return getMat(hex); }