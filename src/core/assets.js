// Кэш материалов и геометрий. Всё, что создаётся чаще одного раза,
// должно проходить через эти функции.

import * as THREE from 'three';

// Приводим любой формат цвета к числу
function toHexNum(c) {
  if (typeof c === 'number') return c;
  if (typeof c === 'string') {
    if (c.startsWith('0x')) return parseInt(c, 16);
    if (c.startsWith('#'))  return parseInt(c.slice(1), 16);
    if (/^[0-9a-fA-F]{6}$/.test(c)) return parseInt(c, 16);
  }
  return 0xffffff; // fallback
}

export const toonGradient = new THREE.DataTexture(
  new Uint8Array([80, 130, 180, 220, 248]), 5, 1, THREE.RedFormat
);
toonGradient.needsUpdate = true;
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.magFilter = THREE.NearestFilter;

const matCache = new Map();

export function getMat(hex) {
  const n = toHexNum(hex);
  const key = 'col|' + n.toString(16);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: n, gradientMap: toonGradient });
    matCache.set(key, m);
  }
  return m;
}

export function getGhostMat(hex, opacity = 0.6) {
  const n = toHexNum(hex);
  const key = `ghost|${n.toString(16)}|${opacity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color: n, transparent: true, opacity, depthWrite: false,
      side: THREE.DoubleSide,
    });
    matCache.set(key, m);
  }
  return m;
}

export function getBasicMat(hex) {
  const n = toHexNum(hex);
  const key = `basic|${n.toString(16)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: n });
    matCache.set(key, m);
  }
  return m;
}

export function shadeColor(hex, factor) {
  const n = toHexNum(hex);
  const c = new THREE.Color(n);
  c.multiplyScalar(factor);
  return c.getHex();
}
// Обводка (outline) для группы мешей: каждый Box получает копию с BackSide
export function addOutlineToGroup(group, color = 0x1a1010, scale = 1.035) {
  const toAdd = [];
  group.traverse(o => {
    if (o.isMesh && o.geometry?.type === 'BoxGeometry' && !o.userData.isOutline) {
      toAdd.push(o);
    }
  });
  for (const o of toAdd) {
    const outline = new THREE.Mesh(
      o.geometry,
      new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, depthWrite: false })
    );
    outline.scale.multiplyScalar(scale);
    outline.userData.isOutline = true;
    o.add(outline);
  }
}

// === Утилиты ===
export const rnd = (a, b) => a + Math.random() * (b - a);
export const ri = (a, b) => Math.floor(rnd(a, b + 1));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];