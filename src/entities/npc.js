import * as THREE from 'three';
import { world } from '../core/scene.js';
import { createHumanoid, ensureAnimState, animateHumanoid } from './humanoid.js';
import { getHeight } from '../world/terrain.js';

export const npcList = [];
export const npcMeshes = [];
const npcLabels = [];

function createQuestMarker() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 100px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#000'; ctx.lineWidth = 8;
  ctx.strokeText('⭐', 64, 68);
  ctx.fillStyle = '#f8e070'; ctx.fillText('⭐', 64, 68);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false });
  const s = new THREE.Sprite(m); s.scale.set(0.9, 0.9, 1);
  return s;
}

export function spawnNPC(type, x, z, rotY) {
  let cfg = {}, scale = 0.95, name = '', dialogId = type;

  if (type === 'helga') {
    cfg = { skin: 0xe0c8a8, hair: 0xd8d0c0, shirt: 0x4a3a5a, pants: 0x2a1a3a,
            gender: 'female', hairStyle: 'long', bodyType: 'slim' };
    name = 'Хельга'; scale = 0.9;
  } else if (type === 'iva') {
    cfg = { skin: 0xf0d0b0, hair: 0x2a1a10, shirt: 0x587048, pants: 0x4a3a28,
            gender: 'female', hairStyle: 'long' };
    name = 'Ива'; scale = 0.95;
  } else if (type === 'yasen') {
    cfg = { skin: 0xd8b890, hair: 0x4a3020, shirt: 0x6a5838, pants: 0x3a2a18,
            gender: 'male', hairStyle: 'pony', beard: 'stubble' };
    name = 'Ясень'; scale = 1.05;
  } else if (type === 'dorn') {
    cfg = { skin: 0xd8b898, hair: 0x8a5a38, shirt: 0x8a6858, pants: 0x6a5a48,
            gender: 'male', bodyType: 'heavy', hairStyle: 'long', beard: 'full' };
    name = 'Кузнец Дорн'; scale = 0.78;
  } else if (type === 'radim') {
    cfg = { skin: 0xe0c0a0, hair: 0x6a4530, shirt: 0xa88858, pants: 0x7a6a48,
            gender: 'male', beard: 'short' };
    name = 'Торговец Радим'; scale = 0.95;
  } else if (type === 'mara') {
    cfg = { skin: 0xe8c8a0, hair: 0xc8b898, shirt: 0xf8f0e0, pants: 0x8a7a58,
            gender: 'female', hairStyle: 'long' };
    name = 'Аптекарь Мара'; scale = 0.95;
  }

  const mesh = createHumanoid(cfg);
  mesh.position.set(x, getHeight(x, z), z);
  mesh.rotation.y = rotY ?? Math.PI;
  mesh.scale.setScalar(scale);

  if (type === 'mara') {
    const wr = new THREE.MeshLambertMaterial({ color: 0xf8f0e0 });
    if (mesh.userData.torso) mesh.userData.torso.material = wr;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.42), wr);
    skirt.position.y = -0.15;
    mesh.userData.pelvis.add(skirt);
  }

  world.scene.add(mesh);

  const npc = { type, x, z, mesh, name, dialogId, marker: null,
                animPhase: Math.random() * 10, homePos: { x, z } };
  ensureAnimState(mesh);

  if (type === 'helga' || type === 'iva' || type === 'yasen') {
    npc.marker = createQuestMarker();
    npc.marker.position.y = 3.0;
    mesh.add(npc.marker);
  }

  mesh.traverse(o => { if (o.isMesh && !o.userData.isOutline) o.userData.npc = npc; });
  npcList.push(npc);
  npcMeshes.push(mesh);

  const lbl = document.createElement('div');
  lbl.className = 'nlabel ' + type;
  lbl.textContent = name;
  const ui = document.getElementById('world-ui');
  if (ui) ui.appendChild(lbl);
  npcLabels.push({ npc, el: lbl });

  return npc;
}

export function findNPC(type) { return npcList.find(n => n.type === type); }

export function updateNPCs(dt) {
  const playerPos = window.__playerPos;
  if (!playerPos) return;

  for (const npc of npcList) {
    npc.animPhase += dt * 1.5;
    if (npc.marker) npc.marker.position.y = 3.0 + Math.sin(npc.animPhase) * 0.15;
    const st = ensureAnimState(npc.mesh);
    st.t += dt; st.mode = 'idle';
    animateHumanoid(npc.mesh, st, dt);
  }

  for (const { npc, el } of npcLabels) {
    if (!npc.mesh.visible) { el.style.display = 'none'; continue; }
    const dist = npc.mesh.position.distanceTo(playerPos);
    if (dist > 30) { el.style.display = 'none'; continue; }
    const wp = npc.mesh.position.clone(); wp.y += 2.75;
    const v = wp.project(world.camera);
    if (v.z < 1) {
      el.style.display = 'block';
      el.style.transform = `translate(-50%,-50%) translate(${(v.x*0.5+0.5)*innerWidth}px,${(-v.y*0.5+0.5)*innerHeight}px)`;
      el.style.opacity = Math.max(0.4, Math.min(1, 1 - (dist - 20) / 10));
    } else {
      el.style.display = 'none';
    }
  }
}

export function findNearestNPC(playerPos, maxDist = 4.5) {
  let best = null, bestD = maxDist;
  for (const npc of npcList) {
    if (!npc.mesh.visible) continue;
    const d = playerPos.distanceTo(npc.mesh.position);
    if (d < bestD) { bestD = d; best = npc; }
  }
  return best;
}