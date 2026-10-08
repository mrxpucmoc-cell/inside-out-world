// Декор «Побережья Костей».
//  • Пальмы, кактусы, камни, мокрые камни, джунгли
//  • Деревня «Широкая площадь»: 5 домов из брёвен,
//    дальний за костром — широкий свес, в центре костёр-частицы
//  • Каменоломня, разрушенная деревня, кладбище

import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { world } from '../core/scene.js';
import { getMat, rnd, clamp, toonGradient } from '../core/assets.js';
import {
  HALF, WATER_LEVEL, VILLAGE, VILLAGE_FLAT_R,
  OCEAN_EDGE_X, BEACH_MAX_X, PLAY_MAX_X, PLAY_MIN_Z, PLAY_MAX_Z,
  CAPE, QUARRY, CEMETERY, ABANDONED, VIY_HOUSE,
} from '../core/constants.js';

import {
  getHeight, isWater, addCollider, hitsCollider,
  isInGrass, distanceToWater, addPlatform,
} from './terrain.js';

export const decor = {
  group: null,
  data: { grass: [], bushes: [], seaweed: [], driftwood: [] },
  buildingsOnMap: [],
};

export function initDecor() {
  decor.group = new THREE.Group();
  decor.group.name = 'decor';
  world.scene.add(decor.group);
}

/* ============================================================
   Хелперы
   ============================================================ */
function wpBox(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getMat(color));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function wpRng(seed) {
  let s = seed % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
function wpOutline(group, color = 0x120c08, scale = 1.04) {
  const list = [];
  group.traverse(o => {
    if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && !o.userData.ol) list.push(o);
  });
  for (const o of list) {
    const m = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({
      color, side: THREE.BackSide, depthWrite: false,
    }));
    m.scale.multiplyScalar(scale);
    m.userData.ol = true;
    o.add(m);
  }
}

/* ============================================================
   Пальма
   ============================================================ */
function buildPalmGroup(x, z, tilt, scale) {
  const g = new THREE.Group();
  const sXZ = 1.5 * scale;
  const lean = tilt ? rnd(0.35, 0.65) : 0;
  const leanDir = Math.random() * Math.PI * 2;
  const cx = Math.cos(leanDir) * lean;
  const cz = Math.sin(leanDir) * lean;

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(cx * 0.2, 2.4 * scale, cz * 0.2),
    new THREE.Vector3(cx * 0.6, 4.8 * scale, cz * 0.6),
    new THREE.Vector3(cx, 7.2 * scale, cz),
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 16, 0.20 * sXZ, 6, false);
  const trunk = new THREE.Mesh(trunkGeo,
    new THREE.MeshLambertMaterial({ color: 0x8a6a50, flatShading: true }));
  trunk.castShadow = true; trunk.receiveShadow = true;
  g.add(trunk);

  const topPoint = curve.getPoint(1);
  const leafA = new THREE.MeshLambertMaterial({ color: 0x5a9a48, flatShading: true, side: THREE.DoubleSide });
  const leafB = new THREE.MeshLambertMaterial({ color: 0x3e7a30, flatShading: true, side: THREE.DoubleSide });
  const nf = 7;
  for (let i = 0; i < nf; i++) {
    const a = (i / nf) * Math.PI * 2 + rnd(-0.15, 0.15);
    const len = (1.7 + Math.random() * 0.3) * sXZ;
    const dx = Math.cos(a), dz = Math.sin(a);
    const leafCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(dx * len * 0.35, 0.5 * scale, dz * len * 0.35),
      new THREE.Vector3(dx * len * 0.72, 0.2 * scale, dz * len * 0.72),
      new THREE.Vector3(dx * len, -0.6 * scale, dz * len),
    ]);
    const lg = new THREE.TubeGeometry(leafCurve, 10, 0.075 * sXZ, 5, false);
    const leaf = new THREE.Mesh(lg, i % 2 === 0 ? leafA : leafB);
    leaf.position.copy(topPoint);
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.position.set(x, getHeight(x, z), z);
  decor.group.add(g);
}

/* ============================================================
   Кактус
   ============================================================ */
function buildCactus(x, z, scale) {
  const s = scale * rnd(0.9, 1.3);
  const g = new THREE.Group();
  const m1 = getMat(0x6a7a48);
  const m2 = getMat(0x4a5a28);
  const fruit = getMat(0xc85848);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 4.5 * s, 0.45 * s), m1);
  trunk.position.y = 2.25 * s; trunk.castShadow = true; g.add(trunk);
  const arms = [
    [-0.45 * s, 1.9 * s, 0, 0.35 * s, 0.85 * s, 0.35 * s],
    [-0.8 * s, 2.5 * s, 0, 0.32 * s, 1.6 * s, 0.32 * s],
    [0.45 * s, 2.6 * s, 0, 0.35 * s, 0.85 * s, 0.35 * s],
    [0.8 * s, 3.1 * s, 0, 0.30 * s, 1.4 * s, 0.30 * s],
  ];
  for (const [ax, ay, az, w, h, d] of arms) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m2);
    m.position.set(ax, ay, az); m.castShadow = true; g.add(m);
  }
  const f = new THREE.Mesh(new THREE.BoxGeometry(0.28 * s, 0.24 * s, 0.28 * s), fruit);
  f.position.y = 4.62 * s; g.add(f);
  g.position.set(x, getHeight(x, z), z);
  g.rotation.y = Math.random() * Math.PI * 2;
  decor.group.add(g);
}

/* ============================================================
   Камни
   ============================================================ */
function buildRock(x, z, scale, isBig) {
  const n = isBig ? 90 : 50;
  const pts = [];
  const maxR = isBig ? 1.05 : 0.55;
  for (let i = 0; i < n; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = (0.35 + Math.random() * 0.65) * maxR;
    pts.push(new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta) * r,
      Math.abs(Math.cos(phi)) * r,
      Math.sin(phi) * Math.sin(theta) * r
    ));
  }
  let geo;
  try { geo = new ConvexGeometry(pts); } catch (e) { return; }
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color: isBig ? 0x8a8274 : 0xa8a090, flatShading: true,
  }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.position.set(x, getHeight(x, z), z);
  g.rotation.y = Math.random() * Math.PI * 2;
  decor.group.add(g);
  addCollider(x, z, maxR * 2 * scale, maxR * 2 * scale);
}

function buildWetRock(x, z, scale) {
  const s = scale * rnd(0.6, 1.1);
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = (0.35 + Math.random() * 0.65) * 0.5;
    pts.push(new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta) * r,
      Math.abs(Math.cos(phi)) * r * 0.6,
      Math.sin(phi) * Math.sin(theta) * r
    ));
  }
  let geo;
  try { geo = new ConvexGeometry(pts); } catch (e) { return; }
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0);
  const c = Math.random();
  const col = c < 0.4 ? 0x4a4640 : (c < 0.7 ? 0x5a5450 : 0x3a3834);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color: col, flatShading: true,
  }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh);
  g.position.set(x, getHeight(x, z) + 0.05, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  g.scale.setScalar(s);
  decor.group.add(g);
}

/* ============================================================
   ПАЛИТРА ДЕРЕВНИ (бревенчатые срубы)
   ============================================================ */
const WPAL = {
  stone: 0xd8d0b8,
  stoneAlt: 0xb8a888,
  stoneDark: 0x8a7860,
  wall: 0x7a5a3a,          // бревно
  wallAlt: 0x5a3e28,       // тёмное бревно
  foundation: 0x6a6458,    // каменный фундамент
  roof: 0x7a6858,
  roofAlt: 0x5a4a3c,
  rubbleDark: 0x4a3a2c,
  wood: 0x7a5838,
  woodDark: 0x4a3018,
  door: 0x1a0e08,
  doorFrame: 0x4a2818,
  tree: 0x6a5838,
  weed: 0x88a858,
  ember: 0xff8840,
  awning: 0x587048,
  awningAlt: 0xd8c8a8,
  signColor: 0x8a6838,
  pathStone: 0xb8a888,
};

/* ============================================================
   Бревенчатая стена (сруб с торчащими торцами)
   ============================================================ */
function logWall(g, cx, cz, w, d, H, logCol, logAlt, rnd, overlap, dmgFn) {
  const logH = 0.26;
  const rows = Math.floor(H / logH);
  const isHoriz = w > d;
  const len = isHoriz ? w : d;
  const thick = isHoriz ? d : w;
  const ext = overlap ?? 0.28;

  for (let r = 0; r < rows; r++) {
    if (dmgFn && dmgFn(r, rows)) continue;
    const y = 0.2 + r * logH + logH / 2;
    const shade = 0.88 + rnd() * 0.18;
    const baseCol = (r % 2 === 0) ? logCol : logAlt;
    const cc = new THREE.Color(baseCol).multiplyScalar(shade).getHex();

    const bw = isHoriz ? (len + ext * 2) : thick;
    const bd = isHoriz ? thick : (len + ext * 2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, logH * 0.92, bd), getMat(cc));
    m.position.set(cx, y, cz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);

    // Верхний тёмный срез
    const capCol = new THREE.Color(cc).multiplyScalar(0.78).getHex();
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(isHoriz ? bw : thick, 0.02, isHoriz ? thick : bd),
      getMat(capCol)
    );
    cap.position.set(cx, y - logH * 0.44, cz);
    g.add(cap);

    // Торцы брёвен
    if (isHoriz) {
      const eL = new THREE.Mesh(new THREE.BoxGeometry(0.04, logH * 0.90, thick * 0.92), getMat(capCol));
      eL.position.set(cx - len / 2 - ext, y, cz);
      g.add(eL);
      const eR = new THREE.Mesh(new THREE.BoxGeometry(0.04, logH * 0.90, thick * 0.92), getMat(capCol));
      eR.position.set(cx + len / 2 + ext, y, cz);
      g.add(eR);
    } else {
      const eF = new THREE.Mesh(new THREE.BoxGeometry(thick * 0.92, logH * 0.90, 0.04), getMat(capCol));
      eF.position.set(cx, y, cz - len / 2 - ext);
      g.add(eF);
      const eB = new THREE.Mesh(new THREE.BoxGeometry(thick * 0.92, logH * 0.90, 0.04), getMat(capCol));
      eB.position.set(cx, y, cz + len / 2 + ext);
      g.add(eB);
    }
  }
}

/* ============================================================
   Дом со всеми типами крыш (сруб из брёвен)
   ============================================================ */
function wpHouse(cx, cz, cfg) {
  const g = new THREE.Group();
  g.position.set(cx, cfg.baseY || 0, cz);
  g.rotation.y = cfg.rot || 0;
  const W = cfg.w, D = cfg.d, H = cfg.h;
  const state = cfg.state || 'intact';
  const rnd = wpRng(cfg.seed || 1);
  const overlap = 0.28;

  // Фундамент
  g.add(wpBox(W + 0.5, 0.25, D + 0.5, cfg.foundation, 0, 0.125, 0));

  // Функции урона для сруба
  const dmgN = state === 'ruined' ? (() => true) : null;
  const dmgW = state === 'ruined' ? ((r, rows) => r >= rows - 2) : null;
  const dmgE = state === 'ruined' ? (() => true)
             : state === 'damaged' ? ((r, rows) => r >= rows - 2) : null;

  // Бэк, лево, право — сруб
  logWall(g, 0, -D / 2, W, 0.28, H, cfg.wall, cfg.wallAlt, rnd, overlap, dmgN);
  logWall(g, -W / 2, 0, 0.28, D, H, cfg.wall, cfg.wallAlt, rnd, overlap, dmgW);
  logWall(g, W / 2, 0, 0.28, D, H, cfg.wall, cfg.wallAlt, rnd, overlap, dmgE);

  if (state !== 'ruined') {
    const dmgS = (state === 'damaged') ? ((r, rows) => r >= rows - 2) : null;

    // Передняя стена — две секции с проёмом под дверь
    logWall(g, -W * 0.32, D / 2, W * 0.34, 0.28, H, cfg.wall, cfg.wallAlt, rnd, overlap, dmgS);
    logWall(g,  W * 0.32, D / 2, W * 0.34, 0.28, H, cfg.wall, cfg.wallAlt, rnd, overlap, dmgS);

    // Брёвна НАД дверью (только ряды выше проёма)
    const doorH = 1.75;
    const doorRows = Math.floor(doorH / 0.26);
    const totalRows = Math.floor(H / 0.26);
    for (let r = doorRows; r < totalRows; r++) {
      const y = 0.2 + r * 0.26 + 0.13;
      const cc = new THREE.Color(r % 2 === 0 ? cfg.wall : cfg.wallAlt)
        .multiplyScalar(0.88 + rnd() * 0.18).getHex();
      const capCol = new THREE.Color(cc).multiplyScalar(0.78).getHex();
      g.add(wpBox(0.85, 0.24, 0.28, cc, 0, y, D / 2));
      g.add(wpBox(0.04, 0.22, 0.26, capCol, -0.425, y, D / 2));
      g.add(wpBox(0.04, 0.22, 0.26, capCol,  0.425, y, D / 2));
    }

    // Дверь в проёме
    g.add(wpBox(0.85, doorH, 0.10, cfg.door, 0, 0.2 + doorH / 2, D / 2 + 0.14));
    g.add(wpBox(1.05, 0.14, 0.38, cfg.doorFrame, 0, 0.2 + doorH + 0.07, D / 2 + 0.14));
    g.add(wpBox(0.14, doorH + 0.18, 0.38, cfg.doorFrame, -0.50, 0.2 + doorH / 2, D / 2 + 0.14));
    g.add(wpBox(0.14, doorH + 0.18, 0.38, cfg.doorFrame,  0.50, 0.2 + doorH / 2, D / 2 + 0.14));
    g.add(wpBox(0.55, doorH * 0.92, 0.06, cfg.doorFrame, 0.35, 0.2 + doorH / 2, D / 2 + 0.22, 0, 0.40, 0));
  }

  // Окна с наличниками и ставнями
  if (cfg.window && state !== 'ruined') {
    for (const wx of [-W * 0.28, W * 0.28]) {
      g.add(wpBox(0.60, 0.55, 0.30, 0x0a0606, wx, 1.40, D / 2 + 0.02));
      g.add(wpBox(0.72, 0.10, 0.32, cfg.doorFrame, wx, 1.72, D / 2 + 0.02));
      g.add(wpBox(0.72, 0.10, 0.32, cfg.doorFrame, wx, 1.08, D / 2 + 0.02));
      g.add(wpBox(0.10, 0.72, 0.32, cfg.doorFrame, wx - 0.34, 1.40, D / 2 + 0.02));
      g.add(wpBox(0.10, 0.72, 0.32, cfg.doorFrame, wx + 0.34, 1.40, D / 2 + 0.02));
      g.add(wpBox(0.06, 0.55, 0.32, cfg.doorFrame, wx, 1.40, D / 2 + 0.02));
      g.add(wpBox(0.60, 0.06, 0.32, cfg.doorFrame, wx, 1.40, D / 2 + 0.02));
      // Ставни
      g.add(wpBox(0.25, 0.65, 0.06, cfg.wallAlt, wx - 0.50, 1.40, D / 2 + 0.20, 0, -0.5, 0));
      g.add(wpBox(0.25, 0.65, 0.06, cfg.wallAlt, wx + 0.50, 1.40, D / 2 + 0.20, 0,  0.5, 0));
    }
    // Боковое окно
    g.add(wpBox(0.30, 0.55, 0.55, 0x0a0606, -W / 2 + 0.05, 1.40, D * 0.22));
    g.add(wpBox(0.32, 0.06, 0.60, cfg.doorFrame, -W / 2 + 0.05, 1.40, D * 0.22));
  }

  const roofY = 0.2 + H;

  // ===== Крыши =====
  if (state === 'ruined') {
    g.add(wpBox(W * 0.55, 0.15, D * 0.55, cfg.roof, -W * 0.15, roofY + 0.25, 0, 0, 0, 0.55));
    g.add(wpBox(W * 0.35, 0.15, D * 0.40, cfg.roofAlt, W * 0.20, roofY - 0.4, D * 0.15, 0.3, 0.5, 0));
  } else if (cfg.roofType === 'sand') {
    // ПЕСЧАНАЯ КРЫША
    const sandRnd = wpRng((cfg.seed || 1) + 9000);
    g.add(wpBox(W + 0.8, 0.24, D + 0.8, 0xb89860, 0, roofY + 0.12, 0));
    g.add(wpBox(W + 0.6, 0.10, D + 0.6, 0xd8b878, 0, roofY + 0.29, 0));
    for (let i = 0; i < 6; i++) {
      const s = 0.20 + sandRnd() * 0.15;
      g.add(wpBox(s, s * 0.7, s,
        sandRnd() < 0.5 ? 0xa89878 : 0x8a7858,
        (sandRnd() - 0.5) * W * 0.7, roofY + 0.40, (sandRnd() - 0.5) * D * 0.7,
        0, sandRnd() * Math.PI, 0));
    }
    const woodDark = new THREE.Color(cfg.wall).multiplyScalar(0.7).getHex();
    g.add(wpBox(W + 1.0, 0.26, 0.20, woodDark, 0, roofY + 0.32, -D / 2 - 0.35));
    g.add(wpBox(W + 1.0, 0.26, 0.20, woodDark, 0, roofY + 0.32,  D / 2 + 0.35));
    g.add(wpBox(0.20, 0.26, D + 0.7, woodDark, -W / 2 - 0.35, roofY + 0.32, 0));
    g.add(wpBox(0.20, 0.26, D + 0.7, woodDark,  W / 2 + 0.35, roofY + 0.32, 0));
  } else if (cfg.roofType === 'overhang') {
    // ШИРОКИЙ СВЕС
    const wood = cfg.wall;
    const woodDark = new THREE.Color(cfg.wall).multiplyScalar(0.7).getHex();
    g.add(wpBox(W + 1.8, 0.24, D + 1.8, wood, 0, roofY + 0.12, 0));
    g.add(wpBox(W + 2.0, 0.10, D + 2.0, woodDark, 0, roofY + 0.29, 0));
    for (let i = 0; i < 4; i++) {
      const x = -W / 2 + 0.3 + i * (W - 0.6) / 3;
      g.add(wpBox(0.14, 0.6, 0.14, woodDark, x, roofY - 0.40, -D / 2 - 0.6));
      g.add(wpBox(0.14, 0.6, 0.14, woodDark, x, roofY - 0.40,  D / 2 + 0.6));
    }
  } else if (cfg.roofType === 'flat') {
    g.add(wpBox(W + 0.6, 0.30, D + 0.6, cfg.roof, 0, roofY + 0.15, 0));
    g.add(wpBox(W + 0.7, 0.4, 0.2, cfg.roofAlt, 0, roofY + 0.4, -D / 2 - 0.3));
    g.add(wpBox(W + 0.7, 0.4, 0.2, cfg.roofAlt, 0, roofY + 0.4, D / 2 + 0.3));
    g.add(wpBox(0.2, 0.4, D + 0.6, cfg.roofAlt, -W / 2 - 0.3, roofY + 0.4, 0));
    g.add(wpBox(0.2, 0.4, D + 0.6, cfg.roofAlt, W / 2 + 0.3, roofY + 0.4, 0));
  } else if (cfg.roofType === 'earth') {
    // Земляная крыша — слой глины с травой
    g.add(wpBox(W + 0.9, 0.26, D + 0.9, 0x5a4a30, 0, roofY + 0.13, 0));
    g.add(wpBox(W + 0.7, 0.20, D + 0.7, 0x4a3828, 0, roofY + 0.36, 0));
    g.add(wpBox(W + 0.3, 0.14, D + 0.3, 0x6a8850, 0, roofY + 0.53, 0));
    for (let i = 0; i < 12; i++) {
      const x = (rnd() - 0.5) * W * 0.8;
      const z = (rnd() - 0.5) * D * 0.8;
      const h = 0.12 + rnd() * 0.15;
      g.add(wpBox(0.05, h, 0.05, 0x7a9858, x, roofY + 0.60 + h / 2, z));
    }
    const woodDark = new THREE.Color(cfg.wall).multiplyScalar(0.7).getHex();
    for (let i = 0; i < 5; i++) {
      g.add(wpBox(0.5, 0.28, 0.14, woodDark, -W / 2 + (i / 4) * W, roofY + 0.20, -D / 2 - 0.4));
      g.add(wpBox(0.5, 0.28, 0.14, woodDark, -W / 2 + (i / 4) * W, roofY + 0.20,  D / 2 + 0.4));
    }
  } else {
    const pitch = 0.55, depth = D / 2 + 0.6;
    g.add(wpBox(W + 0.7, 0.16, depth, cfg.roof, 0, roofY + 0.55, -D / 4, -pitch, 0, 0));
    g.add(wpBox(W + 0.7, 0.16, depth, cfg.roof, 0, roofY + 0.55, D / 4, pitch, 0, 0));
    g.add(wpBox(W + 0.8, 0.20, 0.35, cfg.roofAlt, 0, roofY + 1.05, 0));
    for (let i = 0; i < 5; i++) {
      const x = -W / 2 + (i / 4) * W;
      g.add(wpBox(0.10, 0.10, depth * 2 + 0.3, cfg.roofAlt, x, roofY + 0.02, 0));
    }
  }

  if (cfg.chimney && state !== 'ruined') {
    const chX = -W * 0.33, chZ = -D * 0.20;
    g.add(wpBox(0.55, 1.4, 0.55, cfg.wall, chX, 0.2 + H + 1.2, chZ));
    g.add(wpBox(0.72, 0.18, 0.72, cfg.wallAlt, chX, 0.2 + H + 2.0, chZ));
  }
  if (cfg.attic && state !== 'ruined') {
    g.add(wpBox(0.45, 0.45, 0.16, 0x0a0606, W * 0.30, 0.2 + H - 0.15, D / 2 + 0.15));
  }

  const rubbleN = state === 'ruined' ? 12 : state === 'damaged' ? 8 : 4;
  const rubbleCol = (cfg.rubbleDark !== undefined) ? cfg.rubbleDark : 0x4a3a2c;
  for (let i = 0; i < rubbleN; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.max(W, D) * 0.7 + rnd() * 1.2;
    const bs = 0.25 + rnd() * 0.35;
    g.add(wpBox(bs * 1.2, bs * 0.9, bs, rubbleCol,
      Math.cos(a) * r, 0.15 + rnd() * 0.1, Math.sin(a) * r,
      0, rnd() * Math.PI, (rnd() - 0.5) * 0.4));
  }
  return g;
}

/* ============================================================
   Кузница
   ============================================================ */
function wpForge(cx, cz, cfg) {
  const g = new THREE.Group();
  g.position.set(cx, cfg.baseY || 0, cz);
  g.rotation.y = cfg.rot || 0;

  g.add(wpHouse(0, 0, {
    w: cfg.w, d: cfg.d, h: cfg.h, state: 'intact',
    wall: cfg.wall, wallAlt: cfg.wallAlt,
    roof: cfg.roof, roofAlt: cfg.roofAlt,
    door: cfg.door, doorFrame: cfg.doorFrame, foundation: cfg.foundation,
    rubbleDark: cfg.rubbleDark,
    chimney: true, window: false,
    roofType: cfg.roofType || 'flat',
    seed: cfg.seed + 10,
  }));

  const sd = cfg.stoneDark, metal = 0x4a4a50, wd = cfg.woodDark, em = cfg.ember;
  const ax = cfg.w * 0.75, az = cfg.d * 0.5;
  g.add(wpBox(0.6, 0.4, 0.6, sd, ax, 0.2, az));
  g.add(wpBox(0.5, 0.3, 0.5, metal, ax, 0.55, az));
  g.add(wpBox(0.75, 0.2, 0.35, metal, ax, 0.80, az - 0.05));
  g.add(wpBox(1.0, 0.9, 1.0, sd, ax + 1.3, 0.55, az));
  g.add(wpBox(0.7, 0.5, 0.7, 0x1a0a06, ax + 1.3, 0.35, az + 0.55));
  g.add(wpBox(0.55, 0.12, 0.55, em, ax + 1.3, 0.55, az + 0.55));

  const rx = -cfg.w * 0.75, rz = cfg.d * 0.5;
  for (const sx of [-0.45, 0.45]) g.add(wpBox(0.12, 1.6, 0.12, wd, rx + sx, 0.9, rz));
  g.add(wpBox(1.05, 0.12, 0.12, wd, rx, 1.6, rz));
  for (let i = 0; i < 3; i++) {
    const sx = -0.25 + i * 0.30, hh = 0.9 - i * 0.15;
    g.add(wpBox(0.06, hh, 0.06, metal, rx + sx, 1.2 - (0.9 - hh) * 0.3, rz));
    g.add(wpBox(0.18, 0.15, 0.15, metal, rx + sx, 1.65 - (0.9 - hh) * 0.3, rz));
  }
  const rnd = wpRng(cfg.seed + 60);
  const barrels = [0x7a5030, 0x5a3820, 0x6a4830];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4, r = 2.5 + rnd() * 0.5;
    const bc = barrels[i % 3];
    g.add(wpBox(0.45, 0.55, 0.45, bc, Math.cos(a) * r, 0.27, Math.sin(a) * r));
    g.add(wpBox(0.50, 0.08, 0.50, 0x3a3a3a, Math.cos(a) * r, 0.42, Math.sin(a) * r));
    g.add(wpBox(0.50, 0.08, 0.50, 0x3a3a3a, Math.cos(a) * r, 0.12, Math.sin(a) * r));
  }
  const lamp = new THREE.PointLight(em, 0.9, 4, 2);
  lamp.position.set(ax + 1.3, 0.8, az + 0.55);
  g.add(lamp);
  return g;
}

/* ============================================================
   Магазин
   ============================================================ */
function wpShop(cx, cz, cfg) {
  const g = new THREE.Group();
  g.position.set(cx, cfg.baseY || 0, cz);
  g.rotation.y = cfg.rot || 0;

  g.add(wpHouse(0, 0, {
    w: cfg.w, d: cfg.d, h: cfg.h, state: 'intact',
    wall: cfg.wall, wallAlt: cfg.wallAlt,
    roof: cfg.roof, roofAlt: cfg.roofAlt,
    door: cfg.door, doorFrame: cfg.doorFrame, foundation: cfg.foundation,
    rubbleDark: cfg.rubbleDark,
    chimney: false, window: true, attic: true,
    roofType: cfg.roofType || 'flat',
    seed: cfg.seed + 20,
  }));

  const wd = cfg.woodDark, wood = cfg.wood, aw = cfg.awning, awA = cfg.awningAlt;
  const fz = cfg.d / 2 + 0.4;
    g.add(wpBox(cfg.w + 0.4, 0.14, 1.2, aw, 0, 2.15, fz, 0.35, 0, 0));
  for (let i = 0; i < 5; i++) {
    const x = -cfg.w / 2 + 0.3 + i * (cfg.w - 0.6) / 4;
    g.add(wpBox((cfg.w - 0.6) / 10, 0.15, 1.22, awA, x, 2.16, fz, 0.35, 0, 0));
  }
  g.add(wpBox(0.12, 2.2, 0.12, wd, -cfg.w / 2 + 0.15, 1.1, fz + 0.5));
  g.add(wpBox(0.12, 2.2, 0.12, wd, cfg.w / 2 - 0.15, 1.1, fz + 0.5));
  g.add(wpBox(1.8, 0.75, 0.65, wood, 0, 0.38, fz + 0.15));
  g.add(wpBox(1.9, 0.08, 0.72, wd, 0, 0.80, fz + 0.15));
  g.add(wpBox(0.22, 0.25, 0.20, 0xd8b048, -0.55, 0.95, fz + 0.15));
  g.add(wpBox(0.20, 0.30, 0.20, 0x8848a0, 0.00, 0.98, fz + 0.15));
  g.add(wpBox(0.25, 0.20, 0.22, 0x48a088, 0.55, 0.93, fz + 0.15));
  for (let i = 0; i < 3; i++) {
    const bx = -cfg.w / 2 - 0.6 + i * 0.55;
    g.add(wpBox(0.42, 0.42, 0.42, wood, bx, 0.22, cfg.d * 0.3));
    g.add(wpBox(0.44, 0.06, 0.44, wd, bx, 0.42, cfg.d * 0.3));
  }
  g.add(wpBox(0.42, 0.42, 0.42, wood, -cfg.w / 2 - 0.3, 0.65, cfg.d * 0.3));
  g.add(wpBox(1.2, 0.5, 0.10, wd, 0, 2.75, fz - 0.2));
  g.add(wpBox(0.8, 0.28, 0.06, cfg.signColor, 0, 2.75, fz - 0.14));
  return g;
}

/* ============================================================
   Мелкий декор
   ============================================================ */
function wpDeadTree(g, x, z, color, seed) {
  const rnd = wpRng(seed);
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  const H = 2.2 + rnd() * 1.5;
  let parent = grp;
  for (let i = 0; i < 4; i++) {
    const piv = new THREE.Group();
    if (i > 0) piv.position.y = H / 4;
    piv.rotation.z = (rnd() - 0.5) * 0.15;
    piv.rotation.x = (rnd() - 0.5) * 0.1;
    parent.add(piv);
    const w = 0.24 - i * 0.04;
    piv.add(wpBox(w, H / 4, w, i % 2 === 0 ? color
      : new THREE.Color(color).multiplyScalar(0.85).getHex(), 0, H / 8, 0));
    parent = piv;
  }
  for (let b = 0; b < 3; b++) {
    const a = rnd() * Math.PI * 2;
    const bp = new THREE.Group();
    bp.position.y = H * (0.4 + rnd() * 0.4);
    bp.rotation.y = a;
    bp.rotation.z = -0.8 - rnd() * 0.4;
    grp.add(bp);
    const len = 0.5 + rnd() * 0.6;
    bp.add(wpBox(0.10, len, 0.10, color, 0, len / 2, 0));
  }
  g.add(grp);
}
function wpBarrel(g, x, z, seed) {
  const rnd = wpRng(seed);
  const bc = [0x7a5030, 0x5a3820, 0x6a4830][Math.floor(rnd() * 3)];
  g.add(wpBox(0.45, 0.55, 0.45, bc, x, 0.27, z));
  g.add(wpBox(0.50, 0.08, 0.50, 0x3a3a3a, x, 0.42, z));
  g.add(wpBox(0.50, 0.08, 0.50, 0x3a3a3a, x, 0.12, z));
}
function wpRock(g, x, z, color, dark, seed) {
  const rnd = wpRng(seed);
  const s = 0.3 + rnd() * 0.5;
  for (let i = 0, n = 2 + Math.floor(rnd() * 2); i < n; i++) {
    const ss = s * (0.7 + rnd() * 0.5);
    g.add(wpBox(ss * 1.3, ss * 0.9, ss, rnd() < 0.5 ? color : dark,
      x + (rnd() - 0.5) * s, ss * 0.4, z + (rnd() - 0.5) * s,
      0, rnd() * Math.PI, (rnd() - 0.5) * 0.2));
  }
}
function wpCart(g, x, z, rot, wood, wd) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = rot;
  grp.add(wpBox(1.5, 0.14, 0.8, wood, 0, 0.55, 0));
  grp.add(wpBox(0.10, 0.10, 0.85, wd, 0, 0.62, 0.4));
  grp.add(wpBox(0.10, 0.10, 0.85, wd, 0, 0.62, -0.4));
  for (const sx of [-0.6, 0.6]) {
    grp.add(wpBox(0.55, 0.55, 0.10, wd, sx, 0.28, 0.15));
    grp.add(wpBox(0.55, 0.55, 0.10, wd, sx, 0.28, -0.15));
  }
  grp.add(wpBox(0.8, 0.10, 0.10, wood, 1.1, 0.45, 0.2, 0, 0, -0.15));
  grp.add(wpBox(0.8, 0.10, 0.10, wood, 1.1, 0.45, -0.2, 0, 0, -0.15));
  g.add(grp);
}
function wpWeeds(g, x, z, color, seed) {
  const rnd = wpRng(seed);
  for (let i = 0, n = 3 + Math.floor(rnd() * 3); i < n; i++) {
    const h = 0.25 + rnd() * 0.35;
    g.add(wpBox(0.04, h, 0.04, color,
      x + (rnd() - 0.5) * 0.5, h / 2, z + (rnd() - 0.5) * 0.5,
      (rnd() - 0.5) * 0.2, 0, (rnd() - 0.5) * 0.3));
  }
}

/* ============================================================
   КОСТЁР-ЧАСТИЦЫ
   ============================================================ */
function wpCampfirePoints(cx, cz) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  decor.group.add(g);

  // Земля — тёмный круг
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(1.75, 1.9, 0.18, 20),
    getMat(0x3a2a1c)
  );
  ground.position.y = 0.09;
  ground.receiveShadow = true;
  g.add(ground);

  // Пепел в центре
  const ash = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.72, 0.06, 16),
    getMat(0x2a2018)
  );
  ash.position.y = 0.21;
  g.add(ash);

  // Кольцо камней
  const ringR = 0.95;
  const stoneCount = 11;
  for (let i = 0; i < stoneCount; i++) {
    const a = i / stoneCount * Math.PI * 2 + 0.15;
    const s = 0.20 + Math.random() * 0.14;
    const stone = new THREE.Mesh(
      new THREE.BoxGeometry(s * 1.4, s * 0.85, s * 1.1),
      getMat(i % 3 === 0 ? 0xa8a090 : i % 3 === 1 ? 0x8a8274 : 0x9a9284)
    );
    stone.position.set(Math.cos(a) * ringR, s * 0.34, Math.sin(a) * ringR);
    stone.rotation.y = a + (Math.random() - 0.4);
    stone.rotation.z = (Math.random() - 0.25);
    stone.rotation.x = (Math.random() - 0.15);
    stone.castShadow = true;
    stone.receiveShadow = true;
    g.add(stone);
  }

  // Перекрещённые поленья
  const logCols = [0x5a3e28, 0x6a4a30, 0x4a3020];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + Math.PI / 8;
    const log = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.13, 0.15),
      getMat(logCols[i % 3])
    );
    log.position.set(Math.cos(a) * 0.28, 0.24 + i * 0.05, Math.sin(a) * 0.28);
    log.rotation.y = a + Math.PI / 2;
    log.rotation.z = 0.35;
    log.castShadow = true;
    log.receiveShadow = true;
    g.add(log);
  }

  // Тлеющие угли
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.35 + 0.2;
    const s = Math.random() * 0.1 + 0.12;
    const ember = new THREE.Mesh(
      new THREE.BoxGeometry(s, s * 0.6, s),
      new THREE.MeshBasicMaterial({ color: 0xff6020 })
    );
    ember.position.set(Math.cos(a) * r, 0.26, Math.sin(a) * r);
    g.add(ember);
  }

  // Свет
  const light = new THREE.PointLight(0xff8030, 2.6, 15, 2);
  light.position.y = 0.95;
  g.add(light);

  // ===== ВАРИАНТ 4 — ЧАСТИЦЫ THREE.Points =====
  const N = 220;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);

  const parts = [];
  for (let i = 0; i < N; i++) {
    parts.push({
      phase: Math.random(),
      speed: 0.5 + Math.random() * 0.7,
      offX: (Math.random() - 0.5) * 0.5,
      offZ: (Math.random() - 0.5) * 0.5,
      sway: 0.15 + Math.random() * 0.35,
      seed: Math.random() * 100,
    });
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0.3;
    positions[i * 3 + 2] = 0;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Круглая текстура спрайта
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 64;
  const ctx = cvs.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,240,200,1)');
  grd.addColorStop(0.4, 'rgba(255,180,80,0.7)');
  grd.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cvs);

  const mat = new THREE.PointsMaterial({
    size: 0.28,
    map: tex,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  g.add(points);

  const posAttr = geo.attributes.position;
  const colAttr = geo.attributes.color;
  const tmp = new THREE.Color();

  const tick = () => {
    requestAnimationFrame(tick);
    const t = performance.now() / 1000;
    for (let i = 0; i < N; i++) {
      const p = parts[i];
      p.phase += p.speed * 0.45 * 0.016;
      if (p.phase > 1) p.phase -= 1;

      const h = p.phase * 2.4;
      posAttr.array[i * 3]     = p.offX + Math.sin(t * 2.5 + p.seed) * p.sway * p.phase;
      posAttr.array[i * 3 + 1] = 0.3 + h;
      posAttr.array[i * 3 + 2] = p.offZ + Math.cos(t * 2.1 + p.seed * 1.4) * p.sway * p.phase;

      if (p.phase < 0.2) tmp.setHex(0xfff8d0);
      else if (p.phase < 0.5) tmp.setHex(0xffb040);
      else if (p.phase < 0.8) tmp.setHex(0xff6020);
      else tmp.setHex(0x601810);

      colAttr.array[i * 3]     = tmp.r;
      colAttr.array[i * 3 + 1] = tmp.g;
      colAttr.array[i * 3 + 2] = tmp.b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    light.intensity = 2.5 + Math.sin(t * 6) * 0.3;
  };
  tick();

  addCollider(cx, cz, 1.6, 1.6);
}

/* ============================================================
   КУРИЦЫ
   ============================================================ */
function buildChickens(cx, cz, count) {
  const rng = wpRng(99887);
  const chickens = [];

  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const bodyCol = rng() < 0.7 ? 0xf8f0e0 : 0xe8d8c0;

    g.add(wpBox(0.35, 0.32, 0.42, bodyCol, 0, 0.28, 0));
    g.add(wpBox(0.22, 0.22, 0.22, bodyCol, 0, 0.52, 0.18));
    g.add(wpBox(0.08, 0.06, 0.10, 0xd8b878, 0, 0.49, 0.32));
    g.add(wpBox(0.08, 0.10, 0.16, 0xc84848, 0, 0.66, 0.18));
    g.add(wpBox(0.05, 0.13, 0.05, 0xd8b878, -0.10, 0.06, 0));
    g.add(wpBox(0.05, 0.13, 0.05, 0xd8b878, 0.10, 0.06, 0));
    const tail = wpBox(0.10, 0.18, 0.10, bodyCol, 0, 0.42, -0.24);
    tail.rotation.x = -0.4;
    g.add(tail);

    const a0 = rng() * Math.PI * 2;
    const r0 = rng() * 12;
    const px = cx + Math.cos(a0) * r0;
    const pz = cz + Math.sin(a0) * r0;

    g.position.set(px, getHeight(px, pz), pz);
    g.rotation.y = rng() * Math.PI * 2;
    decor.group.add(g);

    chickens.push({
      group: g,
      dir: rng() * Math.PI * 2,
      speed: 0.35 + rng() * 0.30,
      changeTimer: 2 + rng() * 4,
      idleTimer: 0,
      center: { x: cx, z: cz },
      radius: 28,
    });
  }

  const tick = () => {
    requestAnimationFrame(tick);
    const dt = 0.016;
    for (const ch of chickens) {
      const g = ch.group;
      ch.changeTimer -= dt;
      if (ch.changeTimer <= 0) {
        ch.changeTimer = 3 + Math.random() * 5;
        if (Math.random() < 0.35) ch.idleTimer = 1.5 + Math.random() * 2.5;
        else ch.dir = Math.random() * Math.PI * 2;
      }
      if (ch.idleTimer > 0) { ch.idleTimer -= dt; continue; }
      const dx = Math.sin(ch.dir), dz = Math.cos(ch.dir);
      const nx = g.position.x + dx * ch.speed * dt;
      const nz = g.position.z + dz * ch.speed * dt;
      const dC = Math.hypot(nx - ch.center.x, nz - ch.center.z);
      if (dC > ch.radius) { ch.dir = Math.atan2(ch.center.x - g.position.x, ch.center.z - g.position.z); continue; }
      if (isWater(nx, nz)) { ch.dir = Math.random() * Math.PI * 2; continue; }
      if (hitsCollider(nx, nz, 0.3)) { ch.dir = Math.random() * Math.PI * 2; continue; }
      g.position.x = nx;
      g.position.z = nz;
      g.position.y = getHeight(nx, nz);
      const targetYaw = Math.atan2(dx, dz);
      let dyaw = targetYaw - g.rotation.y;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      g.rotation.y += dyaw * Math.min(1, dt * 6);
    }
  };
  tick();
}

/* ============================================================
   ДЕРЕВНЯ «ШИРОКАЯ ПЛОЩАДЬ»
   ============================================================ */
function buildWidePlazaVillage(cx, cz) {
  const c = WPAL;
  const rnd = wpRng(707);
  const VILLAGE_R = 40;
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);

  wpCampfirePoints(cx, cz);

  // Кузница слева сзади — сруб + песчаная крыша
  g.add(wpForge(-22, -10, {
    ...c, rot: 0, w: 6.2, d: 5.5, h: 3.6,
    roofType: 'sand', seed: 810,
  }));
  addCollider(cx - 22, cz - 10, 6.5, 5.8);

  // Магазин справа сзади — сруб + песчаная крыша
  g.add(wpShop(22, -10, {
    ...c, rot: 0, w: 6.2, d: 5.5, h: 3.6,
    roofType: 'sand', seed: 820,
  }));
  addCollider(cx + 22, cz - 10, 6.5, 5.8);

  // Дальний за костром — сруб + широкий свес (вариант 9)
  g.add(wpHouse(0, -28, {
    ...c, rot: 0, w: 5.5, d: 4.9, h: 3.4,
    state: 'intact', chimney: true, window: true,
    roofType: 'overhang', seed: 830,
  }));
  addCollider(cx, cz - 28, 5.7, 5.1);

  // Передний левый — сруб + песчаная крыша (вариант 8)
  g.add(wpHouse(-22, 9, {
    ...c, rot: Math.PI, w: 5.5, d: 4.9, h: 3.4,
    state: 'intact', chimney: true, window: true,
    roofType: 'sand', seed: 808,
  }));
  addCollider(cx - 22, cz + 9, 5.7, 5.1);

  // Передний правый — сруб + песчаная крыша (вариант 8)
  g.add(wpHouse(22, 9, {
    ...c, rot: Math.PI, w: 5.5, d: 4.9, h: 3.3,
    state: 'intact', window: true,
    roofType: 'sand', seed: 809,
  }));
  addCollider(cx + 22, cz + 9, 5.7, 5.1);

  const trees = [[-16, 0], [16, 0], [-5, 22], [5, 22], [-28, -14], [28, -14], [0, 15]];
  for (let i = 0; i < trees.length; i++) {
    const [x, z] = trees[i];
    if (rnd() < 0.7) {
      wpDeadTree(g, x + (rnd() - 0.5), z + (rnd() - 0.5), c.tree, 707 + i * 22);
    }
  }
  for (let i = 0; i < 20; i++) {
    const a = rnd() * Math.PI * 2, r = 5 + rnd() * 14;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z) < 4.0) continue;
    wpRock(g, x, z, c.rubbleDark, c.stoneDark, 707 + i * 17);
  }
  wpBarrel(g, -12, 5, 751);
  wpBarrel(g, -12.6, 5.8, 752);
  wpBarrel(g, 12.5, 5, 753);
  wpBarrel(g, 13.1, 5.9, 754);
  wpCart(g, 14.5, -1.5, 1.2, c.wood, c.woodDark);
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, r = 3.5 + rnd() * 15;
    wpWeeds(g, Math.cos(a) * r, Math.sin(a) * r, c.weed, 707 + i * 7);
  }

  wpOutline(g, 0x120c08, 1.04);

  decor.group.add(g);
  decor.buildingsOnMap.push({ x: cx, z: cz, r: VILLAGE_R + 3, color: '#8a9878' });
}

/* ============================================================
   Каменоломня
   ============================================================ */
function buildQuarry(cx, cz) {
  const baseY = getHeight(cx, cz);
  const g = new THREE.Group();
  g.position.set(cx, baseY, cz);
  decor.group.add(g);
  const woodDark = getMat(0x5a4030);
  const woodPale = getMat(0x9a7a50);
  const stoneDark = getMat(0x5a5450);
  const stoneLite = getMat(0xc0b8a8);
  const metalDark = getMat(0x3a3a44);

  for (const x of [-3.5, 3.5]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), stoneDark);
    base.position.set(x, 0.25, 0); base.castShadow = true; g.add(base);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.5, 0.45), woodDark);
    tower.position.set(x, 2.75, 0); tower.castShadow = true; g.add(tower);
    for (const sx of [-0.7, 0.7]) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.0, 0.18), woodPale);
      br.position.set(x + sx * 0.65, 1.5, 0);
      br.rotation.z = sx < 0 ? -0.5 : 0.5;
      g.add(br);
    }
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.45, 0.45), woodDark);
  beam.position.y = 5.1; beam.castShadow = true; g.add(beam);
  const beamTop = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.20, 0.6), woodPale);
  beamTop.position.y = 5.4; g.add(beamTop);
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), metalDark);
  block.position.y = 4.8; g.add(block);
  const rope = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.06), getMat(0xd8c8a0));
  rope.position.y = 3.4; g.add(rope);
  const load = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.0), stoneLite);
  load.position.y = 1.7; load.castShadow = true; g.add(load);

  const blockPositions = [
    [-6, 2.4, 1.2], [-3, 3.5, 1.5], [0, 3.4, 1.3],
    [3, 3.0, 1.4], [6, 2.2, 1.2],
    [-5, -2.6, 1.4], [-2, -3.4, 1.6], [1.5, -3.2, 1.3],
    [4.5, -2.4, 1.5], [7, -1.5, 1.1],
    [-7, 0.5, 1.3], [7.5, 1.0, 1.2],
  ];
  for (let i = 0; i < blockPositions.length; i++) {
    const [bx, bz, bs] = blockPositions[i];
    const blockM = new THREE.Mesh(
      new THREE.BoxGeometry(bs, bs, bs),
      getMat(i % 3 === 0 ? 0xc8c0b0 : (i % 3 === 1 ? 0x9a9080 : 0xb8b0a0)));
    const bl = getHeight(cx + bx, cz + bz) - baseY;
    blockM.position.set(bx, bl + bs / 2, bz);
    blockM.rotation.y = rnd(-0.2, 0.2);
    blockM.castShadow = true; blockM.receiveShadow = true;
    g.add(blockM);
    addCollider(cx + bx, cz + bz, bs * 1.1, bs * 1.1);
  }
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rnd(3, QUARRY.r);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (isWater(x, z)) continue;
    const s = 0.4 + Math.random() * 0.9;
    const frag = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.85, s * 0.9),
      getMat(i % 3 === 0 ? 0xc0b8a8 : (i % 3 === 1 ? 0x9a9080 : 0x8a8274)));
    frag.position.set(x, getHeight(x, z) - baseY + s * 0.4, z);
    frag.rotation.y = Math.random() * Math.PI;
    frag.castShadow = true;
    g.add(frag);
  }
}

/* ============================================================
   Разрушенная деревня
   ============================================================ */
function buildBurntHouse(cx, cz, rotY, W, D, H) {
  const g = new THREE.Group();
  const baseY = getHeight(cx, cz);
  g.position.set(cx, baseY, cz);
  g.rotation.y = rotY;
  decor.group.add(g);
  const burnt = getMat(0x1a1008);
  const burntMid = getMat(0x2a1a10);
  const ash = getMat(0x3a3a36);
  const ashPlate = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.06, D + 0.8), ash);
  ashPlate.position.y = 0.03; ashPlate.receiveShadow = true; g.add(ashPlate);
  const logH = 0.30;
  const backLogs = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < backLogs; i++) {
    const y = logH / 2 + i * logH;
    const m = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, logH * 0.85, 0.20),
      i % 2 === 0 ? burnt : burntMid);
    m.position.set(0, y, -D / 2); m.castShadow = true; g.add(m);
  }
  for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
    const y = logH / 2 + i * logH;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.20, logH * 0.85, D),
      i % 2 === 0 ? burnt : burntMid);
    m.position.set(W / 2, y, 0); m.castShadow = true; g.add(m);
  }
  for (let i = 0; i < Math.floor(Math.random() * 2); i++) {
    const y = logH / 2 + i * logH;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.20, logH * 0.85, D), burntMid);
    m.position.set(-W / 2, y, 0); m.castShadow = true; g.add(m);
  }
  const doorW = 1.0, segW = (W - doorW) / 2;
  for (let i = 0; i < 2; i++) {
    const y = logH / 2 + i * logH;
    for (const sx of [-1, 1]) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(segW, logH * 0.85, 0.20), burnt);
      seg.position.set(sx * (doorW / 2 + segW / 2), y, D / 2);
      seg.castShadow = true; g.add(seg);
    }
  }
  for (const [sx, sz] of [[-W/2, -D/2], [W/2, -D/2], [-W/2, D/2], [W/2, D/2]]) {
    const hh = 0.4 + Math.random() * 0.5;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.20, hh, 0.20), burnt);
    post.position.set(sx, hh / 2, sz); post.castShadow = true; g.add(post);
  }
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rnd(0.4, W * 0.7);
    const ll = rnd(0.6, 1.4);
    const log = new THREE.Mesh(new THREE.BoxGeometry(ll, 0.15, 0.15), burnt);
    log.position.set(Math.cos(a) * r, 0.10, Math.sin(a) * r);
    log.rotation.set(0, Math.random() * Math.PI, 0.1);
    log.castShadow = true; g.add(log);
  }
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.5), getMat(0x4a3a28));
  chim.position.set(W * 0.25, 1.3, -D * 0.25); chim.castShadow = true; g.add(chim);
  const chimTop = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.15, 0.65), getMat(0x2a1c10));
  chimTop.position.set(W * 0.25, 2.3, -D * 0.25); g.add(chimTop);
  addCollider(cx, cz, W * 0.75, D * 0.75);
  decor.buildingsOnMap.push({ x: cx, z: cz, w: W, d: D, color: '#2a1810' });
}
function buildBlockyRuined(cx, cz, rotY) {
  const g = new THREE.Group();
  const baseY = getHeight(cx, cz);
  g.position.set(cx, baseY, cz);
  g.rotation.y = rotY;
  decor.group.add(g);
  const W = 3.0, D = 3.0;
  const brick = getMat(0x6a5a48);
  const brickDark = getMat(0x4a3a28);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.2, D + 0.4), getMat(0x2a1c10));
  floor.position.y = 0.10; floor.receiveShadow = true; g.add(floor);
  const rows = 4, cols = 4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.25) continue;
      const bx = -W / 2 + (c + 0.5) * (W / cols);
      const bz = -D / 2 + (r + 0.5) * (D / rows);
      const isBack = r === 0, isLeft = c === 0, isRight = c === cols - 1;
      if (!isBack && !isLeft && !isRight) continue;
      for (let layer = 0; layer < 2; layer++) {
        if (Math.random() < 0.35) continue;
        const y = 0.35 + layer * 0.7;
        const bx2 = isBack ? bx : (isLeft ? -W / 2 : W / 2);
        const bz2 = isBack ? -D / 2 : bz;
        const brickM = new THREE.Mesh(
          new THREE.BoxGeometry(W / cols * 1.02, 0.65, D / rows * 1.02),
          layer % 2 === 0 ? brick : brickDark);
        brickM.position.set(bx2, y, bz2);
        brickM.castShadow = true;
        g.add(brickM);
      }
    }
  }
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.0, 0.55), getMat(0x4a3a28));
  chim.position.set(W * 0.3, 1.4, -D * 0.25); chim.castShadow = true; g.add(chim);
  const chimTop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.7), getMat(0x2a1c10));
  chimTop.position.set(W * 0.3, 2.45, -D * 0.25); g.add(chimTop);
  for (let i = 0; i < 5; i++) {
    const ember = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xff6020 }));
    ember.position.set(rnd(-W / 3, W / 3), 0.28, rnd(-D / 3, D / 3));
    g.add(ember);
  }
  const l = new THREE.PointLight(0xff8040, 0.7, 5, 2);
  l.position.set(0, 0.6, 0); g.add(l);
  addCollider(cx, cz, W * 0.85, D * 0.85);
  decor.buildingsOnMap.push({ x: cx, z: cz, w: W, d: D, color: '#3a2818' });
}
function buildBurntVillage(cx, cz) {
  buildBurntHouse(cx - 4, cz - 3, 0.3, 3.2, 2.8, 1.4);
  buildBurntHouse(cx + 3, cz - 4, -0.2, 3.0, 3.0, 1.3);
  buildBurntHouse(cx - 3.5, cz + 3.5, 1.5, 2.8, 2.8, 1.3);
  buildBurntHouse(cx + 4, cz + 3, 2.6, 3.4, 3.0, 1.5);
  buildBlockyRuined(cx + 0.5, cz - 0.5, 0.7);
}

/* ============================================================
   Кладбище
   ============================================================ */
function buildCemetery(cx, cz) {
  const baseY = getHeight(cx, cz);
  const g = new THREE.Group();
  g.position.set(cx, baseY, cz);
  decor.group.add(g);

  const groundPlate = new THREE.Mesh(new THREE.BoxGeometry(30, 0.12, 30), getMat(0x4a4a44));
  groundPlate.position.y = -0.06; groundPlate.receiveShadow = true; g.add(groundPlate);

  const stoneLight = getMat(0xc8b898);
  const stoneMid = getMat(0xa89070);
  const stoneDark = getMat(0x7a6248);

  for (let i = 0; i < 12; i++) {
    const z = -12 + i * 2.0;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.10, 1.6), getMat(0xa89878));
    slab.position.set(0, 0.06, z); slab.receiveShadow = true; g.add(slab);
  }

  const GRAVE_ROWS = [
    { z: 8, xs: [-9, -6, -3, 3, 6, 9] },
    { z: 4, xs: [-9.5, -6.5, -3.5, 3.5, 6.5, 9.5] },
    { z: 0, xs: [-9, -6, -3, 3, 6, 9] },
    { z: -4, xs: [-7, -4, 4, 7] },
    { z: -8, xs: [-9, -6, -3, 3, 6, 9] },
  ];
  let idx = 0;
  for (const row of GRAVE_ROWS) {
    for (const x of row.xs) {
      const type = idx % 4;
      const broken = Math.random() < 0.35;
      const openGrave = !broken && Math.random() < 0.20;
      idx++;
      buildGraveColored(g, x, row.z, type, broken, openGrave, stoneLight, stoneMid, stoneDark);
    }
  }
  const TREE_POS = [
    [-11, -4], [11, -4], [-12, 4], [12, 4],
    [-10, 12], [10, 12], [-13, -8], [13, -8],
  ];
  for (const [tx, tz] of TREE_POS) buildDeadTree(g, tx, tz);
  buildMausoleumColored(g, 0, -10.5, stoneMid, stoneDark, stoneLight);

  const mistGeo = new THREE.PlaneGeometry(64, 64, 80, 80);
  mistGeo.rotateX(-Math.PI / 2);
  mistGeo.translate(0, 0.55, 0);
  const mistMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      void main(){
        vec3 p = position;
        float h = sin(p.x*0.5 + uTime*0.6)*0.15 + cos(p.z*0.4 + uTime*0.4)*0.13;
        p.y += h;
        vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
      }
      float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.05; a*=0.5; } return s; }
      void main(){
        vec2 p = vWorldPos.xz * 0.35;
        float n = fbm(p + vec2(uTime*0.15, uTime*0.08));
        float n2 = fbm(p*2.5 + vec2(uTime*0.25, -uTime*0.12));
        float mist = n*0.65 + n2*0.35;
        float dEdge = length(vWorldPos.xz) / 16.0;
        float edge = 1.0 - smoothstep(0.55, 1.0, dEdge);
        float ground = 1.0 - smoothstep(0.0, 1.8, vWorldPos.y);
        float a = clamp(mist * edge * ground * 0.65, 0.0, 0.60);
        vec3 col = mix(vec3(0.92,0.90,0.86), vec3(0.98,0.96,0.92), n2);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  g.add(new THREE.Mesh(mistGeo, mistMat));
  const tick = () => {
    requestAnimationFrame(tick);
    mistMat.uniforms.uTime.value = performance.now() / 1000;
  };
  tick();
}
function buildGraveColored(parent, x, z, type, broken, open, stoneLight, stoneMid, stoneDark) {
  const g = new THREE.Group();
  g.position.set(x, 0.05, z);
  g.rotation.y = (Math.random() - 0.5) * 0.2;
  parent.add(g);
  if (open) {
    const hole = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.30, 1.6), getMat(0x3a2a1a));
    hole.position.y = 0.02; g.add(hole);
    const pile = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.6), getMat(0x6a4a28));
    pile.position.set(0.9, 0.14, 0); g.add(pile);
    return;
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.5), stoneDark);
  base.position.y = 0.09; base.castShadow = true; g.add(base);
  const mainStone = Math.random() < 0.5 ? stoneLight : stoneMid;
  if (broken) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 0.22), mainStone);
    slab.position.set(0, 0.48, 0);
    slab.rotation.z = 0.4; slab.rotation.x = 0.2;
    slab.castShadow = true; g.add(slab);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(0.4, 0.8);
      const frag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.15), mainStone);
      frag.position.set(Math.cos(a) * r, 0.08, Math.sin(a) * r);
      frag.rotation.y = Math.random() * Math.PI;
      g.add(frag);
    }
    wpOutline(g, 0x1a1008, 1.06);
    return;
  }
  if (type === 0) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.20, 0.20), mainStone);
    slab.position.y = 0.78; slab.castShadow = true; g.add(slab);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.10, 0.20), mainStone);
    top.position.y = 1.42; g.add(top);
  } else if (type === 1) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.75, 0.18), mainStone);
    post.position.y = 1.0; post.castShadow = true; g.add(post);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.18), mainStone);
    bar.position.y = 1.35; bar.castShadow = true; g.add(bar);
  } else if (type === 2) {
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.8, 0.5), mainStone);
    s1.position.y = 0.68; s1.castShadow = true; g.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.8, 0.40), mainStone);
    s2.position.y = 1.48; s2.castShadow = true; g.add(s2);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 4), mainStone);
    tip.position.y = 2.10; tip.rotation.y = Math.PI / 4; g.add(tip);
  } else {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.75, 0.20), mainStone);
    slab.position.set(0, 0.55, 0);
    slab.rotation.z = (Math.random() - 0.5) * 0.3;
    g.add(slab);
  }
  wpOutline(g, 0x1a1008, 1.06);
}
function buildDeadTree(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0.05, z);
  parent.add(g);
  const wood = getMat(0x6a5a44), woodD = getMat(0x4a3c28);
  const segH = 0.9;
  let cur = g;
  for (let i = 0; i < 5; i++) {
    const piv = new THREE.Group();
    piv.position.y = (i > 0 ? segH : 0);
    piv.rotation.z = (Math.random() - 0.5) * 0.25;
    piv.rotation.x = (Math.random() - 0.5) * 0.15;
    cur.add(piv);
    const w = 0.42 - i * 0.06;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, segH, w), i % 2 === 0 ? wood : woodD);
    seg.position.y = segH / 2; seg.castShadow = true; piv.add(seg);
    cur = piv;
    if (i > 0) {
      const branch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), woodD);
      branch.position.set((Math.random() - 0.5) * 0.6, segH / 2, 0);
      branch.rotation.z = (Math.random() - 0.5) * 1.4;
      branch.rotation.y = Math.random() * Math.PI * 2;
      piv.add(branch);
    }
  }
}
function buildMausoleumColored(parent, x, z, stoneMat, stoneDark, stoneLight) {
  const g = new THREE.Group();
  g.position.set(x, 0.05, z);
  parent.add(g);
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.4, 3.0), stoneDark);
  base.position.y = 0.2; base.castShadow = true; g.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.2, 2.4), stoneMat);
  body.position.y = 1.5; body.castShadow = true; g.add(body);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x2a1a10 }));
  door.position.set(0, 1.1, 1.22); g.add(door);
  const arch = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.18, 0.08), stoneLight);
  arch.position.set(0, 2.00, 1.24); g.add(arch);
  for (const sx of [-0.85, 0.85]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.08), stoneLight);
    w.position.set(sx, 1.5, 1.22); g.add(w);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.4, 4), stoneDark);
  roof.position.y = 3.3; roof.rotation.y = Math.PI / 4; g.add(roof);
  const cv = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.65, 0.10), stoneLight);
  cv.position.y = 4.35; g.add(cv);
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.10, 0.10), stoneLight);
  ch.position.y = 4.52; g.add(ch);
}

/* ============================================================
   Прочее
   ============================================================ */
function addGrass(x, z, s) {
  if (isWater(x, z)) return;
  decor.data.grass.push({ x, z, s, rot: Math.random() * Math.PI * 2, tint: Math.random() });
}
function addBush(x, z, s) {
  if (isWater(x, z)) return;
  decor.data.bushes.push({ x, z, s, rot: Math.random() * Math.PI * 2 });
}
function addSeaweed(x, z) {
  decor.data.seaweed.push({ x, z, rot: Math.random() * Math.PI * 2, s: rnd(0.6, 1.0) });
}
function addDriftwood(x, z) {
  if (isWater(x, z)) return;
  decor.data.driftwood.push({ x, z, rot: Math.random() * Math.PI * 2, s: rnd(0.7, 1.2) });
}

/* ============================================================
   Заполнение мира
   ============================================================ */
/* ============================================================
   Заполнение мира (карта 800×800, растительность ×4)
   ============================================================ */
/* ============================================================
   Заполнение мира (адаптивно под мобильные)
   ============================================================ */
export function populateWorld() {
  // Определяем мобильное устройство (дублирует логику из scene.js, чтобы не тянуть импорт)
  const IS_MOBILE_LOCAL =
    /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && innerWidth < 1024);
  const MUL = IS_MOBILE_LOCAL ? 0.25 : 1.0;   // 25% декора на мобильных

  console.log(`[populateWorld] Мобильный: ${IS_MOBILE_LOCAL}, декор: ${Math.round(MUL * 100)}%`);

  const occupied = [];
  const free = (x, z, r) => {
    for (const o of occupied) if (Math.hypot(o.x - x, o.z - z) < r) return false;
    return true;
  };
  const push = (x, z) => occupied.push({ x, z });

  const nearPOI = (x, z) => {
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + 15) return true;
    if (Math.hypot(x - ABANDONED.x, z - ABANDONED.z) < ABANDONED.r + 8) return true;
    if (Math.hypot(x - CEMETERY.x, z - CEMETERY.z) < CEMETERY.r + 10) return true;
    if (Math.hypot(x - QUARRY.x, z - QUARRY.z) < QUARRY.r + 10) return true;
    if (Math.hypot(x - CAPE.x, z - CAPE.z) < CAPE.r + 10) return true;
    if (Math.hypot(x - VIY_HOUSE.x, z - VIY_HOUSE.z) < 20) return true;
    return false;
  };

  // === ПАЛЬМЫ — прибрежная зона ===
  const palmBeachCount = Math.round(900 * MUL);
  for (let i = 0; i < palmBeachCount; i++) {
    const x = rnd(-HALF + 15, HALF - 15);
    const z = rnd(-HALF + 15, HALF - 15);
    if (isWater(x, z)) continue;
    if (isInGrass(x, z)) continue;
    if (nearPOI(x, z)) continue;
    if (!free(x, z, 5)) continue;
    if (Math.random() > 0.65) continue;
    push(x, z);
    buildPalmGroup(x, z, Math.random() < 0.45, rnd(0.85, 1.15));
  }
  // === ПАЛЬМЫ в лесной зоне ===
  const palmForestCount = Math.round(1500 * MUL);
  for (let i = 0; i < palmForestCount; i++) {
    const x = rnd(-HALF + 15, HALF - 15);
    const z = rnd(-HALF + 15, HALF - 15);
    if (isWater(x, z)) continue;
    if (!isInGrass(x, z)) continue;
    if (nearPOI(x, z)) continue;
    if (!free(x, z, 3.5)) continue;
    if (Math.random() > 0.75) continue;
    push(x, z);
    buildPalmGroup(x, z, Math.random() < 0.5, rnd(0.9, 1.25));
  }
  // === КАКТУСЫ ===
  const cactusCount = Math.round(1000 * MUL);
  for (let i = 0; i < cactusCount; i++) {
    const x = rnd(-HALF + 15, HALF - 15);
    const z = rnd(-HALF + 15, HALF - 15);
    if (isWater(x, z)) continue;
    if (isInGrass(x, z)) continue;
    if (nearPOI(x, z)) continue;
    if (!free(x, z, 3.5)) continue;
    if (Math.random() > 0.65) continue;
    push(x, z);
    buildCactus(x, z, rnd(0.85, 1.2));
  }
  // === Большие валуны ===
  const bigRockCount = Math.round(260 * MUL);
  for (let i = 0; i < bigRockCount; i++) {
    const x = rnd(-HALF + 20, HALF - 20);
    const z = rnd(-HALF + 20, HALF - 20);
    if (isWater(x, z)) continue;
    if (nearPOI(x, z)) continue;
    if (!free(x, z, 3.5)) continue;
    push(x, z);
    buildRock(x, z, rnd(1.1, 1.5), true);
  }
  // === Малые камни ===
  const smallRockCount = Math.round(400 * MUL);
  for (let i = 0; i < smallRockCount; i++) {
    const x = rnd(-HALF + 10, HALF - 10);
    const z = rnd(-HALF + 10, HALF - 10);
    if (isWater(x, z)) continue;
    if (nearPOI(x, z)) continue;
    if (Math.random() > 0.65) continue;
    buildRock(x, z, rnd(0.6, 0.95), false);
  }
  // === Мокрые камни у воды ===
  const wetRockCount = Math.round(3500 * MUL);
  for (let i = 0; i < wetRockCount; i++) {
    const x = rnd(-HALF + 5, HALF - 5);
    const z = rnd(-HALF + 5, HALF - 5);
    if (isWater(x, z)) continue;
    const dW = distanceToWater(x, z);
    if (dW > 8) continue;
    if (nearPOI(x, z)) continue;
    if (!free(x, z, 2)) continue;
    push(x, z);
    buildWetRock(x, z, rnd(0.7, 1.3));
  }
  // === Кусты в лесной зоне ===
  const bushForestCount = Math.round(5000 * MUL);
  for (let i = 0; i < bushForestCount; i++) {
    const x = rnd(-HALF + 10, HALF - 10);
    const z = rnd(-HALF + 10, HALF - 10);
    if (isWater(x, z)) continue;
    if (!isInGrass(x, z)) continue;
    if (nearPOI(x, z)) continue;
    if (hitsCollider(x, z, 0.5)) continue;
    if (!free(x, z, 1.2)) continue;
    if (Math.random() > 0.70) continue;
    push(x, z);
    addBush(x, z, rnd(0.8, 1.5));
  }
  // === Кусты на песке ===
  const bushSandCount = Math.round(900 * MUL);
  for (let i = 0; i < bushSandCount; i++) {
    const x = rnd(-HALF + 10, HALF - 10);
    const z = rnd(-HALF + 10, HALF - 10);
    if (isWater(x, z)) continue;
    if (isInGrass(x, z)) continue;
    if (nearPOI(x, z)) continue;
    if (Math.random() > 0.6) continue;
    addBush(x, z, rnd(0.7, 1.2));
  }
  // === Трава (instanced-лезвия) ===
  const grassCount = Math.round(12000 * MUL);
  for (let i = 0; i < grassCount; i++) {
    const x = rnd(-HALF + 4, HALF - 4);
    const z = rnd(-HALF + 4, HALF - 4);
    if (isWater(x, z)) continue;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + 2) continue;
    if (hitsCollider(x, z, 0.4)) continue;
    if (Math.random() > 0.75) continue;
    addGrass(x, z, rnd(0.6, 1.3));
  }
  // === Водоросли и дрифтвуд у берега ===
  const coastCount = Math.round(1000 * MUL);
  for (let i = 0; i < coastCount; i++) {
    const x = rnd(-HALF + 5, HALF - 5);
    const z = rnd(-HALF + 5, HALF - 5);
    if (isWater(x, z)) continue;
    const dW = distanceToWater(x, z);
    if (dW > 14) continue;
    if (Math.random() < 0.5) addSeaweed(x, z);
    else addDriftwood(x, z);
  }

  // === Постройки (всегда грузим — они важны для геймплея) ===
  buildWidePlazaVillage(VILLAGE.x, VILLAGE.z);
  buildChickens(VILLAGE.x, VILLAGE.z, IS_MOBILE_LOCAL ? 6 : 12);
  buildQuarry(QUARRY.x, QUARRY.z);
  buildBurntVillage(ABANDONED.x, ABANDONED.z);
  buildCemetery(CEMETERY.x, CEMETERY.z);

  // === 12 пальм вокруг деревни ===
  const palmsAround = IS_MOBILE_LOCAL ? 6 : 12;
  for (let i = 0; i < palmsAround; i++) {
    const a = (i / palmsAround) * Math.PI * 2 + 0.3;
    const r = 55 + Math.random() * 5;
    const px = VILLAGE.x + Math.cos(a) * r;
    const pz = VILLAGE.z + Math.sin(a) * r;
    if (isWater(px, pz)) continue;
    buildPalmGroup(px, pz, Math.random() < 0.4, rnd(1.0, 1.3));
  }
}

/* ============================================================
   Меши травы/кустов/водорослей
   ============================================================ */
export function buildDecor() {
  const D = decor.data;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  if (D.grass.length) {
    const H = 0.35;
    const geo = new THREE.PlaneGeometry(0.08, H, 1, 3);
    geo.translate(0, H / 2, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), t = y / H;
      pos.setZ(i, Math.pow(t, 2) * 0.10);
      pos.setX(i, pos.getX(i) * (1 - t * 0.7));
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(geo, mat, D.grass.length);
    const palette = [0x8a9a68, 0x7a8a58, 0x98a878, 0xa8b888, 0x788858, 0x6a7a48];
    D.grass.forEach((d, i) => {
      const y = getHeight(d.x, d.z);
      dummy.position.set(d.x, y, d.z);
      dummy.rotation.set(rnd(-0.15, 0.15), d.rot, rnd(-0.15, 0.15));
      dummy.scale.set(1, d.s, 1);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      col.setHex(palette[Math.floor(d.tint * palette.length)]);
      im.setColorAt(i, col);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    decor.group.add(im);
  }

  if (D.bushes.length) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const im = new THREE.InstancedMesh(geo,
      new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient }),
      D.bushes.length);
    const palette = [0x5a7a3a, 0x6a8a4a, 0x78a058];
    D.bushes.forEach((d, i) => {
      const y = getHeight(d.x, d.z);
      dummy.position.set(d.x, y + 0.35 * d.s, d.z);
      dummy.scale.set(d.s * 0.6, d.s * 0.5, d.s * 0.6);
      dummy.rotation.set(0, d.rot, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      col.setHex(palette[i % 3]).multiplyScalar(0.9 + Math.random() * 0.2);
      im.setColorAt(i, col);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    decor.group.add(im);
  }

  if (D.seaweed.length) {
    const geo = new THREE.BoxGeometry(0.5, 0.08, 0.7);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({
      color: 0x3a6a48, gradientMap: toonGradient }), D.seaweed.length);
    D.seaweed.forEach((d, i) => {
      const y = getHeight(d.x, d.z);
      dummy.position.set(d.x, y + 0.04, d.z);
      dummy.scale.set(d.s, d.s, d.s);
      dummy.rotation.set(0, d.rot, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    decor.group.add(im);
  }

  if (D.driftwood.length) {
    const geo = new THREE.BoxGeometry(0.16, 0.16, 1.4);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({
      color: 0x6a5a48, gradientMap: toonGradient }), D.driftwood.length);
    D.driftwood.forEach((d, i) => {
      const y = getHeight(d.x, d.z);
      dummy.position.set(d.x, y + 0.08, d.z);
      dummy.scale.set(d.s, d.s, d.s);
      dummy.rotation.set(0, d.rot, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    decor.group.add(im);
  }
}

/* ============================================================
   Совместимость с main.js — заглушки
   ============================================================ */
export function buildFence() {}
export function hitsFence() { return false; }
export function buildLogHouse(cx, cz) { buildBurntHouse(cx, cz, 0, 3, 3, 1.5); }
export function buildWell() {}
export function buildIdol() {}
export function buildCampfire() {}
export function buildElderHouse() {}
export function buildHouse() {}
export function buildForge() {}
export function buildTeleport(cx, cz) {
  const g = new THREE.Group();
  const stone     = getMat(0x9a88a8);   // тёплый фиолетовый камень
  const stoneDark = getMat(0x5a4868);   // тёмная окантовка

  const glowCore  = new THREE.MeshBasicMaterial({ color: 0xd0a0ff });
  const glowOuter = new THREE.MeshBasicMaterial({
    color: 0x80e8ff, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const runeMat = new THREE.MeshBasicMaterial({
    color: 0xb080ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  // Основание 3×3
  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 1; z++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1), stone);
      m.position.set(x, 0.15, z); g.add(m);
      const e = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.05, 1.02), stoneDark);
      e.position.set(x, 0.02, z); g.add(e);
    }
  }

  // Светящийся круг в центре
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.92, 0.92, 0.04, 24),
    glowOuter
  );
  disc.position.y = 0.32;
  g.add(disc);

  // Руны по кругу
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rune = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.03, 0.08),
      runeMat
    );
    rune.position.set(Math.cos(a) * 0.68, 0.34, Math.sin(a) * 0.68);
    rune.rotation.y = a + Math.PI / 2;
    g.add(rune);
  }

  // Столбы с шарами
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.5, 0.35), stone);
    c.position.set(x, 1.25, z); g.add(c);

    // Тёмные полосы на столбе
    for (const yy of [0.45, 1.6, 2.1]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.38), stoneDark);
      band.position.set(x, yy, z); g.add(band);
    }

    // Ядро — светлый шар
    const o = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), glowCore);
    o.position.set(x, 2.65, z); g.add(o);

    // Внешняя аура
    const halo = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 0.78), glowOuter);
    halo.position.set(x, 2.65, z); g.add(halo);

    const l = new THREE.PointLight(0xa080ff, 1.5, 8, 2);
    l.position.set(x, 2.65, z); g.add(l);
  }

  // Центральный свет
  const centerLight = new THREE.PointLight(0x80d0ff, 2.2, 12, 2);
  centerLight.position.set(0, 1.2, 0);
  g.add(centerLight);

  g.position.set(cx, getHeight(cx, cz), cz);
  decor.group.add(g);
  decor.buildingsOnMap.push({ x: cx, z: cz, r: 1.8, color: '#a080ff' });

  // Платформа — поднять уровень «пола», чтобы ступни не проваливались
  addPlatform(cx, cz, 2.1, 0.32);
}