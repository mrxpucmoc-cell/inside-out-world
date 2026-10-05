// Рельеф «Побережья Костей». Карта ×2: 800 × 800.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { world } from '../core/scene.js';
import { toonGradient } from '../core/assets.js';
import {
  HALF, WATER_LEVEL, VILLAGE, VILLAGE_FLAT_R,
  OCEAN_EDGE_X, BEACH_MAX_X, PLAY_MAX_X, PLAY_MIN_Z, PLAY_MAX_Z,
  CAPE, QUARRY, CEMETERY, ABANDONED,
} from '../core/constants.js';

export const terrain = {
  colliders: [],
  platforms: [],
  SWAMP:     { x: -120, z: 300, r: 25 },
  QUARRY:    { x: QUARRY.x, z: QUARRY.z, r: QUARRY.r },
  CEMETERY:  { x: CEMETERY.x, z: CEMETERY.z, r: CEMETERY.r },
  ABANDONED: { x: ABANDONED.x, z: ABANDONED.z, r: ABANDONED.r },
};

const rnd   = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------- Рельеф ---------- */
function heightAt(x, z) {
  let h = 0;
  h += Math.sin(x * 0.030) * Math.cos(z * 0.028) * 2.4;
  h += Math.sin(x * 0.011 + 2.1) * Math.cos(z * 0.013 + 1.2) * 3.6;
  h += Math.sin((x + z) * 0.055) * 0.85;
  h += Math.sin((x - z) * 0.070 + 1.0) * 0.6;
  h += Math.sin(x * 0.14) * 0.35;
  if (x < OCEAN_EDGE_X + 12) h -= clamp((OCEAN_EDGE_X + 12 - x) / 12, 0, 1) * 6.5;
  if (x > PLAY_MAX_X - 12)   h -= clamp((x - PLAY_MAX_X + 12) / 12, 0, 1) * 6.5;
  if (z < PLAY_MIN_Z + 12)   h -= clamp((PLAY_MIN_Z + 12 - z) / 12, 0, 1) * 6.5;
  if (z > PLAY_MAX_Z - 12)   h -= clamp((z - PLAY_MAX_Z + 12) / 12, 0, 1) * 6.5;
  const dCamp = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  if (dCamp < VILLAGE_FLAT_R) h *= 0.20;
  const dCape = Math.hypot(x - CAPE.x, z - CAPE.z);
  if (dCape < CAPE.r) { const k = 1 - dCape / CAPE.r; h += k * 3.5; }
  const dQ = Math.hypot(x - QUARRY.x, z - QUARRY.z);
  if (dQ < QUARRY.r + 4) h *= 0.7;
  return h;
}
export function getHeight(x, z) {
  let h = heightAt(x, z);
  if (x < OCEAN_EDGE_X) h = Math.min(h, -3);
  if (x < OCEAN_EDGE_X + 10) {
    const k = clamp((OCEAN_EDGE_X + 10 - x) / 10, 0, 1);
    h = Math.min(h, -k * 5 + h * (1 - k));
  }
  if (x > PLAY_MAX_X || z < PLAY_MIN_Z || z > PLAY_MAX_Z) h = Math.min(h, -3);
  return Math.round(clamp(h, -8, 8));
}
export function isWater(x, z) {
  if (x < OCEAN_EDGE_X) return true;
  if (x > PLAY_MAX_X) return true;
  if (z < PLAY_MIN_Z) return true;
  if (z > PLAY_MAX_Z) return true;
  return getHeight(x, z) < -0.6;
}
export function groundHeight(x, z) {
  let h = getHeight(x, z);
  for (const p of terrain.platforms) {
    if (Math.hypot(x - p.x, z - p.z) < p.r) {
      const ph = getHeight(p.x, p.z) + p.height;
      if (ph > h) h = ph;
      break;
    }
  }
  return h;
}
export function isOcean(x, z)   { return x < OCEAN_EDGE_X || getHeight(x, z) < -0.6; }
export function isOnCoast(x, z) { return x < BEACH_MAX_X && x > OCEAN_EDGE_X; }
export function seaEdgeAt()     { return OCEAN_EDGE_X; }

export function addCollider(cx, cz, w, d) {
  terrain.colliders.push({ x: cx, z: cz, hw: w / 2, hd: d / 2 });
}
export function addPlatform(x, z, r, height) {
  terrain.platforms.push({ x, z, r, height });
}
export function hitsCollider(x, z, r = 0.42) {
  for (const c of terrain.colliders) {
    if (x > c.x - c.hw - r && x < c.x + c.hw + r &&
        z > c.z - c.hd - r && z < c.z + c.hd + r) return true;
  }
  return false;
}
export function isOnBridge() { return false; }
export function isOnBridgeExact() { return false; }
export function buildBridges() {}
export function buildChunk() {}

/* ============================================================
   КАРТА РАССТОЯНИЙ ДО ВОДЫ (BFS 400×400, шаг 2 м)
   ============================================================ */
const DMAP_SIZE = 400;
const DMAP_STEP = (HALF * 2) / DMAP_SIZE;   // = 2 м
const dMap = new Uint16Array(DMAP_SIZE * DMAP_SIZE);

function buildDistanceMap() {
  for (let j = 0; j < DMAP_SIZE; j++) {
    for (let i = 0; i < DMAP_SIZE; i++) {
      const x = -HALF + (i + 0.5) * DMAP_STEP;
      const z = -HALF + (j + 0.5) * DMAP_STEP;
      dMap[j * DMAP_SIZE + i] = isWater(x, z) ? 0 : 65535;
    }
  }
  const queue = new Int32Array(DMAP_SIZE * DMAP_SIZE);
  let qHead = 0, qTail = 0;
  for (let i = 0; i < DMAP_SIZE * DMAP_SIZE; i++) {
    if (dMap[i] === 0) queue[qTail++] = i;
  }
  while (qHead < qTail) {
    const idx = queue[qHead++];
    const dist = dMap[idx];
    if (dist >= 65534) continue;
    const xi = idx % DMAP_SIZE;
    const zi = (idx / DMAP_SIZE) | 0;
    if (xi > 0) { const n = idx - 1; if (dMap[n] === 65535) { dMap[n] = dist + 1; queue[qTail++] = n; } }
    if (xi < DMAP_SIZE - 1) { const n = idx + 1; if (dMap[n] === 65535) { dMap[n] = dist + 1; queue[qTail++] = n; } }
    if (zi > 0) { const n = idx - DMAP_SIZE; if (dMap[n] === 65535) { dMap[n] = dist + 1; queue[qTail++] = n; } }
    if (zi < DMAP_SIZE - 1) { const n = idx + DMAP_SIZE; if (dMap[n] === 65535) { dMap[n] = dist + 1; queue[qTail++] = n; } }
  }
}

export function distanceToWater(x, z) {
  const fx = (x + HALF) / DMAP_STEP - 0.5;
  const fz = (z + HALF) / DMAP_STEP - 0.5;
  let i0 = Math.floor(fx);
  let j0 = Math.floor(fz);
  if (i0 < 0) i0 = 0;
  if (j0 < 0) j0 = 0;
  if (i0 > DMAP_SIZE - 2) i0 = DMAP_SIZE - 2;
  if (j0 > DMAP_SIZE - 2) j0 = DMAP_SIZE - 2;
  const tx = clamp(fx - i0, 0, 1);
  const tz = clamp(fz - j0, 0, 1);
  const v00 = dMap[j0 * DMAP_SIZE + i0];
  const v10 = dMap[j0 * DMAP_SIZE + i0 + 1];
  const v01 = dMap[(j0 + 1) * DMAP_SIZE + i0];
  const v11 = dMap[(j0 + 1) * DMAP_SIZE + i0 + 1];
  const v0 = v00 * (1 - tx) + v10 * tx;
  const v1 = v01 * (1 - tx) + v11 * tx;
  const v = v0 * (1 - tz) + v1 * tz;
  return v * DMAP_STEP;
}

export function isInGrass(x, z) {
  return distanceToWater(x, z) > 24;
}

/* ============================================================
   ПАЛИТРА
   ============================================================ */
const SAND_MID   = new THREE.Color(0xe0c8a0);
const SAND_WET   = new THREE.Color(0xa08068);
const WET_ROCK   = new THREE.Color(0x7a6858);
const GRASS_1    = new THREE.Color(0x6a7a58);
const GRASS_2    = new THREE.Color(0x7a8a68);
const GRASS_3    = new THREE.Color(0x88a078);
const GRASS_MAIN = new THREE.Color(0x8a9a68);
const ROCK       = new THREE.Color(0x9a9080);
const ASH        = new THREE.Color(0x2a2018);
const DIRT       = new THREE.Color(0x6a5a3a);

const UNDERLAY_COL = 0x1a1008;
const EDGE_COLOR   = 0x1a1010;
const EDGE_OPACITY = 0.35;
const WATER_COLOR  = 0x2a5a88;

/* ============================================================
   ЦВЕТ ПЛИТКИ
   ============================================================ */
function colorAt(x, z) {
  // 1. Гарь у костра деревни
  const fx = VILLAGE.x + 1, fz = VILLAGE.z + 1;
  const dFire = Math.hypot(x - fx, z - fz);
  if (dFire < 3.5) {
    const ashT = smoothstep(3.5, 0.8, dFire);
    return new THREE.Color(DIRT).lerp(ASH, ashT);
  }

  // 2. Каменоломня — тёмная земля
  const dQ = Math.hypot(x - QUARRY.x, z - QUARRY.z);
  if (dQ < QUARRY.r + 6) {
    const t = smoothstep(QUARRY.r + 6, 0, dQ);
    return new THREE.Color(0x6a5a48).lerp(new THREE.Color(0x3a2e20), t);
  }

  // 3. Деревня — плавный переход мокрый камень → зелень
  const dCamp = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  if (dCamp < VILLAGE.r) {
    const xLocal = x - VILLAGE.x;
    const R = VILLAGE.r;
    const t = clamp((xLocal + R) / (R * 2), 0, 1);
    if (t < 0.25) {
      const k = t / 0.25;
      const smoothK = k * k * (3 - 2 * k);
      return WET_ROCK.clone().lerp(GRASS_MAIN, smoothK);
    }
    const gn = Math.sin(x * 0.15 + z * 0.11) * Math.cos(x * 0.08 - z * 0.13);
    if (gn > 0.30) return GRASS_1.clone();
    if (gn > 0.00) return GRASS_2.clone();
    if (gn > -0.30) return GRASS_3.clone();
    return GRASS_MAIN.clone();
  }

  // 4. Разрушенная деревня
  const dAb = Math.hypot(x - ABANDONED.x, z - ABANDONED.z);
  if (dAb < ABANDONED.r + 8) {
    const t = smoothstep(ABANDONED.r + 8, 0, dAb);
    return SAND_MID.clone().lerp(SAND_WET, 0.7 * t);
  }

  // 5. По расстоянию до фактической воды
  const dW = distanceToWater(x, z);

  if (dW < 15) {
    const row = Math.floor(dW / 1.5);
    if (row <= 3) {
      const t = row / 3;
      return SAND_WET.clone().lerp(SAND_MID, t);
    }
    return SAND_MID.clone();
  }
  if (dW < 19.5) {
    const t = (dW - 15) / 4.5;
    return SAND_MID.clone().lerp(WET_ROCK, t);
  }
  if (dW < 24) {
    const t = (dW - 19.5) / 4.5;
    return WET_ROCK.clone().lerp(GRASS_MAIN, t);
  }
  if (Math.hypot(x - QUARRY.x, z - QUARRY.z) < QUARRY.r + 2) return ROCK.clone();
  const gn = Math.sin(x * 0.15 + z * 0.11) * Math.cos(x * 0.08 - z * 0.13);
  if (gn > 0.30) return GRASS_1.clone();
  if (gn > 0.00) return GRASS_2.clone();
  if (gn > -0.30) return GRASS_3.clone();
  return GRASS_MAIN.clone();
}

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
let waterIM = null;

export function initTerrain() {
  buildDistanceMap();
  buildBacking();
  scheduleSurfaceChunks();
  buildWater();
}

function buildBacking() {
  const size = HALF * 2 + 80;
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: UNDERLAY_COL });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -9.0;
  world.scene.add(mesh);
}

const PLATE_X = 1.5;
const PLATE_Z = 1.5;
const TILE_X  = PLATE_X * 0.97;
const TILE_Z  = PLATE_Z * 0.97;
const PLATE_H = 0.30;
const UNDERLAY_OFF = 0.22;
const CHUNKS_PER_SIDE = 8;   // 8×8 = 64 чанка

function scheduleSurfaceChunks() {
  const xMin = OCEAN_EDGE_X - 6;
  const xMax = PLAY_MAX_X + 6;
  const zMin = PLAY_MIN_Z - 6;
  const zMax = PLAY_MAX_Z + 6;
  const chunkW = (xMax - xMin) / CHUNKS_PER_SIDE;
  const chunkD = (zMax - zMin) / CHUNKS_PER_SIDE;

  const queue = [];
  for (let ci = 0; ci < CHUNKS_PER_SIDE; ci++) {
    for (let cj = 0; cj < CHUNKS_PER_SIDE; cj++) {
      queue.push({
        x0: xMin + ci * chunkW, x1: xMin + (ci + 1) * chunkW,
        z0: zMin + cj * chunkD, z1: zMin + (cj + 1) * chunkD,
      });
    }
  }
  const step = () => {
    if (!queue.length) return;
    const c = queue.shift();
    buildSurfaceChunk(c.x0, c.z0, c.x1, c.z1);
    requestAnimationFrame(step);
  };
  step();
}

function buildSurfaceChunk(x0, z0, x1, z1) {
  const tileGeoms = [];
  const underGeoms = [];
  const colTmp = new THREE.Color();

  const nx = Math.ceil((x1 - x0) / PLATE_X);
  const nz = Math.ceil((z1 - z0) / PLATE_Z);

  const plateGeoBase = new THREE.BoxGeometry(TILE_X, PLATE_H, TILE_Z);
  const underGeoBase = new THREE.BoxGeometry(TILE_X + 0.06, 0.06, TILE_Z + 0.06);

  const matTmp = new THREE.Matrix4();
  const qTmp = new THREE.Quaternion();
  const eTmp = new THREE.Euler();
  const posTmp = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const underColor = new THREE.Color(UNDERLAY_COL);

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const px = x0 + (i + 0.5) * PLATE_X;
      const pz = z0 + (j + 0.5) * PLATE_Z;
      if (px < -HALF + 1.5 || px > HALF - 1.5) continue;
      if (pz < -HALF + 1.5 || pz > HALF - 1.5) continue;
      if (isWater(px, pz)) continue;

      const h = getHeight(px, pz);
      const wave = Math.sin(px * 0.45 + pz * 0.3) * 0.08;
      const randY = Math.random() * 0.06 - 0.06;
      const topY = h + wave + randY;
      const yaw = (Math.random() - 0.5) * 2 * 0.06;

      const g = plateGeoBase.clone();
      qTmp.setFromEuler(eTmp.set(0, yaw, 0));
      posTmp.set(px, topY - PLATE_H / 2, pz);
      matTmp.compose(posTmp, qTmp, one);
      g.applyMatrix4(matTmp);

      colTmp.copy(colorAt(px, pz)).multiplyScalar(0.92 + Math.random() * 0.12);
      const cnt = g.attributes.position.count;
      const cols = new Float32Array(cnt * 3);
      for (let k = 0; k < cnt; k++) {
        cols[k * 3]     = colTmp.r;
        cols[k * 3 + 1] = colTmp.g;
        cols[k * 3 + 2] = colTmp.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      tileGeoms.push(g);

      const u = underGeoBase.clone();
      qTmp.setFromEuler(eTmp.set(0, yaw, 0));
      posTmp.set(px, topY - UNDERLAY_OFF, pz);
      matTmp.compose(posTmp, qTmp, one);
      u.applyMatrix4(matTmp);

      const ucnt = u.attributes.position.count;
      const ucols = new Float32Array(ucnt * 3);
      for (let k = 0; k < ucnt; k++) {
        ucols[k * 3]     = underColor.r;
        ucols[k * 3 + 1] = underColor.g;
        ucols[k * 3 + 2] = underColor.b;
      }
      u.setAttribute('color', new THREE.BufferAttribute(ucols, 3));
      underGeoms.push(u);
    }
  }

  if (tileGeoms.length) {
    const merged = mergeGeometries(tileGeoms, false);
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.scene.add(mesh);

    const edges = new THREE.EdgesGeometry(merged, 20);
    const lineMat = new THREE.LineBasicMaterial({
      color: EDGE_COLOR, transparent: true, opacity: EDGE_OPACITY,
    });
    world.scene.add(new THREE.LineSegments(edges, lineMat));
  }

  if (underGeoms.length) {
    const merged = mergeGeometries(underGeoms, false);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = false;
    world.scene.add(mesh);
  }
}

/* ---------- Вода ---------- */
function buildWater() {
  const CELL = 3;            // было 1.5, стало 3 — меньше инстансов
  const N = Math.floor((HALF * 2) / CELL);

  const cells = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = -HALF + (i + 0.5) * CELL;
      const z = -HALF + (j + 0.5) * CELL;
      if (isWater(x, z)) cells.push({ x, z, phase: (i * 0.7 + j * 0.9) });
    }
  }
  if (!cells.length) return;

  const geo = new THREE.BoxGeometry(CELL * 1.05, 1.0, CELL * 1.05);
  const mat = new THREE.MeshToonMaterial({ color: WATER_COLOR, gradientMap: toonGradient });
  waterIM = new THREE.InstancedMesh(geo, mat, cells.length);

  const baseY = WATER_LEVEL - 0.35;
  const dummy = new THREE.Object3D();
  for (let k = 0; k < cells.length; k++) {
    dummy.position.set(cells[k].x, baseY, cells[k].z);
    dummy.updateMatrix();
    waterIM.setMatrixAt(k, dummy.matrix);
  }
  waterIM.instanceMatrix.needsUpdate = true;
  world.scene.add(waterIM);
}