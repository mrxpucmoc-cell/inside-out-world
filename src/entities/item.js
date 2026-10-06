// Конструктор предметов и экипировки. Читает item def из JSON.

import * as THREE from 'three';
import { getMat, getBasicMat } from '../core/assets.js';

// Главный билдер для оружия. Вид определяется def.kind и def.visual.
export function buildWeapon(def) {
  const g = new THREE.Group();
  const kind = def.kind || 'sword';
  const twoH = !!def.twoHanded;
  const bc = def.visual?.blade ?? 0xd8d0c0;
  const hc = def.visual?.hilt  ?? 0x6a5a48;
  const sm = twoH ? 1.45 : 1;

  if (kind === 'sword' || kind === 'dagger') {
    const len = (def.len ?? 0.85) * sm;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(twoH ? 0.14 : 0.1, len, twoH ? 0.05 : 0.035), getMat(bc));
    blade.position.y = len / 2 + 0.14;
    g.add(blade);
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(twoH ? 0.08 : 0.06, 0.14, twoH ? 0.05 : 0.035), getMat(bc));
    tip.position.y = len + 0.19;
    g.add(tip);
    const guardG = new THREE.Group();
    guardG.position.y = 0.12;
    guardG.rotation.y = Math.PI / 2;
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(twoH ? 0.44 : 0.3, 0.06, 0.08), getMat(0xd8b878));
    guardG.add(guard);
    g.add(guardG);
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, twoH ? 0.42 : 0.22, 0.07), getMat(hc));
    handle.position.y = twoH ? -0.11 : -0.01;
    g.add(handle);
    const pommel = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.08, 0.1), getMat(0xd8b878));
    pommel.position.y = twoH ? -0.34 : -0.14;
    g.add(pommel);
    g.userData.tipOffset = len + 0.2;
  } else if (kind === 'axe') {
    const len = (def.len ?? 0.8) * sm;
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(twoH ? 0.12 : 0.09, len + 0.35, twoH ? 0.12 : 0.09), getMat(hc));
    shaft.position.y = len / 2;
    g.add(shaft);
    const s = twoH ? 1.35 : 1;
    const headG = new THREE.Group();
    headG.position.set(0, len + 0.06, 0);
    headG.rotation.y = Math.PI / 2;
    const headA = new THREE.Mesh(
      new THREE.BoxGeometry(0.34 * s, 0.34 * s, 0.08 * s), getMat(bc));
    headA.position.set(0.16 * s, 0, 0);
    headG.add(headA);
    const headB = new THREE.Mesh(
      new THREE.BoxGeometry(0.22 * s, 0.26 * s, 0.08 * s), getMat(bc));
    headB.position.set(-0.13 * s, 0, 0);
    headG.add(headB);
    g.add(headG);
    g.userData.tipOffset = len + 0.2;
  } else if (kind === 'mace') {
    const len = (def.len ?? 0.75) * sm;
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(twoH ? 0.11 : 0.08, len + 0.3, twoH ? 0.11 : 0.08), getMat(hc));
    shaft.position.y = len / 2;
    g.add(shaft);
    const s = twoH ? 1.35 : 1;
    const ball = new THREE.Mesh(
      new THREE.BoxGeometry(0.3 * s, 0.3 * s, 0.3 * s), getMat(bc));
    ball.position.y = len + 0.16;
    g.add(ball);
    g.userData.tipOffset = len + 0.3;
  } else if (kind === 'staff') {
    const len = (def.len ?? 1.1) * sm;
    const shaftLen = len + 0.5;
    const th = twoH ? 0.045 : 0.038;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(th, shaftLen, th), getMat(hc));
    g.add(shaft);
    const orbY = shaftLen / 2 + 0.15;
    const orb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), getBasicMat(bc));
    orb.position.y = orbY;
    g.add(orb);
    const glow = new THREE.PointLight(bc, 0.9, 4);
    glow.position.y = orbY;
    g.add(glow);
    g.userData.tipOffset = orbY;
  } else if (kind === 'wand') {
    // Короткий жезл — маленькая палочка с кристаллом на конце
    const len = (def.len ?? 0.55) * sm;
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, len + 0.15, 0.07), getMat(hc));
    shaft.position.y = len / 2;
    g.add(shaft);
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.12, 0.1), getMat(0x3a2a18));
    grip.position.y = 0.02;
    g.add(grip);
    const orb = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.16), getBasicMat(bc));
    orb.position.y = len + 0.15;
    g.add(orb);
    const glow = new THREE.PointLight(bc, 1.1, 4);
    glow.position.y = len + 0.15;
    g.add(glow);
    g.userData.tipOffset = len + 0.15;
  } else if (kind === 'javelin') {
    // Метательное копьё — длинный дротик с наконечником
    const len = (def.len ?? 1.1) * sm;
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, len, 0.055), getMat(hc));
    shaft.position.y = len / 2;
    g.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.24, 0.09), getMat(bc));
    tip.position.y = len + 0.12;
    g.add(tip);
    // Опушка у основания
    const feather = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.18, 0.15), getMat(0xd8c8a8));
    feather.position.y = 0.12;
    g.add(feather);
    g.userData.tipOffset = len + 0.2;
  } else if (kind === 'bow') {
    const len = (def.len ?? 0.9) * 2;
    const h = len / 2;
    const alpha = 0.55;
    const r = h / Math.sin(alpha);
    const cx = -r * Math.cos(alpha);
    const N = 10;
    const limbMat = getMat(0x8a6a48);
    const segPts = [];
    for (let i = 0; i <= N; i++) {
      const theta = -alpha + (2 * alpha) * i / N;
      segPts.push(new THREE.Vector3(cx + r * Math.cos(theta), r * Math.sin(theta), 0));
    }
    const midArc = new THREE.Vector3(cx + r, 0, 0);
    for (const p of segPts) p.sub(midArc);
    for (let i = 0; i < N; i++) {
      const p1 = segPts[i], p2 = segPts[i + 1];
      const mid = p1.clone().add(p2).multiplyScalar(0.5);
      const segLen = p1.distanceTo(p2);
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, segLen * 1.06, 0.06), limbMat);
      seg.position.copy(mid);
      seg.rotation.z = Math.atan2(-(p2.x - p1.x), (p2.y - p1.y));
      g.add(seg);
    }
    const tipTop = segPts[N], tipBot = segPts[0];
    const strLen = tipTop.distanceTo(tipBot);
    const str = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, strLen, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xf0e8d0 }));
    str.position.copy(tipTop.clone().add(tipBot).multiplyScalar(0.5));
    g.add(str);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.13), getMat(0x6a5a38));
    g.add(grip);
    g.userData.tipOffset = 0.15;
  } else if (kind === 'shield') {
    const sz = def.size || 0.9;
    const sh = new THREE.Mesh(new THREE.BoxGeometry(sz * 0.7, sz, 0.12), getMat(bc));
    g.add(sh);
    const boss = new THREE.Mesh(
      new THREE.BoxGeometry(sz * 0.25, sz * 0.25, 0.06), getMat(0xd8b878));
    boss.position.z = 0.08;
    g.add(boss);
    // Ободок
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(sz * 0.75, sz * 0.08, 0.14), getMat(0x6a4a28));
    rim.position.y = sz * 0.46;
    g.add(rim);
    const rimB = rim.clone(); rimB.position.y = -sz * 0.46;
    g.add(rimB);
    g.userData.tipOffset = 0.5;
  }
  return g;
}

// Регистрация дефолтного времени жизни предмета
export function finalizeItemDef(def) {
  if (def.type === 'weapon') {
    const avg = (def.dmg[0] + def.dmg[1]) / 2;
    def.maxDur = Math.max(20, Math.round(100 - avg * 1.4));
  } else if (def.def) {
    def.maxDur = Math.max(20, Math.round(120 - def.def * 2));
  } else {
    def.maxDur = 0;
  }
  def.dur = def.maxDur;
  return def;
}