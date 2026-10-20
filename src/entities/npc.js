import * as THREE from 'three';
import { world } from '../core/scene.js';
import { createHumanoid, ensureAnimState, animateHumanoid } from './humanoid.js';
import { buildHammer } from './item.js';
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

function buildStaff() {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x5a3e28 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.55, 0.07), woodMat);
  shaft.position.y = 0.78;
  shaft.castShadow = true;
  g.add(shaft);
  const knob = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.14),
    new THREE.MeshLambertMaterial({ color: 0x8a6a48 }));
  knob.position.y = 1.58;
  knob.castShadow = true;
  g.add(knob);
  const wrap = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.2, 0.09),
    new THREE.MeshLambertMaterial({ color: 0x3a2818 }));
  wrap.position.y = 0.15;
  g.add(wrap);
  return g;
}

export function spawnNPC(type, x, z, rotY) {
  let cfg = {}, scale = 0.95, name = '', dialogId = type;

  if (type === 'helga') {
    cfg = {
      skin: 0xd8b898, hair: 0xe8e0d8, shirt: 0x4a3a5a, pants: 0x2a1a3a,
      gender: 'female', hairStyle: 'long', bodyType: 'slim',
      mouthStyle: 'frown',
    };
    name = 'Хельга'; scale = 0.82;
  } else if (type === 'iva') {
    cfg = { skin: 0xf0d0b0, hair: 0x2a1a10, shirt: 0x587048, pants: 0x4a3a28,
            gender: 'female', hairStyle: 'long' };
    name = 'Ива'; scale = 0.95;
  } else if (type === 'yasen') {
    cfg = { skin: 0xd8b890, hair: 0x4a3020, shirt: 0x6a5838, pants: 0x3a2a18,
            gender: 'male', hairStyle: 'pony', beard: 'stubble' };
    name = 'Ясень'; scale = 1.05;
  } else if (type === 'dorn') {
    cfg = { skin: 0xd8b898, hair: 0x8a5a38, shirt: 0x6a4a38, pants: 0x4a3a28,
            gender: 'male', bodyType: 'heavy', hairStyle: 'long', beard: 'full' };
    name = 'Кузнец Дорн'; scale = 0.92;
  } else if (type === 'radim') {
    cfg = { skin: 0xe0c0a0, hair: 0x6a4530, shirt: 0xa88858, pants: 0x7a6a48,
            gender: 'male', beard: 'short' };
    name = 'Торговец Радим'; scale = 0.95;
  } else if (type === 'mara') {
    cfg = { skin: 0xe8c8a0, hair: 0xc8b898, shirt: 0xf8f0e0, pants: 0x8a7a58,
            gender: 'female', hairStyle: 'long' };
    name = 'Аптекарь Мара'; scale = 0.95;
  } else if (type === 'groom') {
    cfg = { skin: 0xe0b890, hair: 0x5a3a20, shirt: 0x6a5040, pants: 0x4a3520,
            gender: 'male', beard: 'short', hairStyle: 'short' };
    name = 'Конюх'; scale = 0.98;
  }

  const mesh = createHumanoid(cfg);
  mesh.position.set(x, getHeight(x, z), z);
  mesh.rotation.y = rotY ?? Math.PI;
  mesh.scale.setScalar(scale);

  let staffMesh = null;
  if (type === 'helga') {
    staffMesh = buildStaff();
    staffMesh.position.set(0.02, -0.25, 0.05);
    staffMesh.rotation.set(0.05, 0, 0.05);
    mesh.userData.handR?.add(staffMesh);
  }

    // Дорну — молот прямо в ладонь (handMesh), ручка вниз, острие развёрнуто на 40°
  if (type === 'dorn') {
    const hammer = buildHammer();
    hammer.position.set(0, -0.02, 0.06);
    hammer.rotation.set(Math.PI, Math.PI * 40 / 180, 0);  // X=180° (ручка вниз), Y=40° (острие вперёд)
    mesh.userData.handRm?.add(hammer);   // ← именно в ладонь, а не в группу кисти
  }

  if (type === 'mara') {
    const wr = new THREE.MeshLambertMaterial({ color: 0xf8f0e0 });
    if (mesh.userData.torso) mesh.userData.torso.material = wr;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.42), wr);
    skirt.position.y = -0.15;
    mesh.userData.pelvis.add(skirt);
  }

  world.scene.add(mesh);

  const npc = {
    type, x, z, mesh, name, dialogId, marker: null,
    animPhase: Math.random() * 10,
    homePos: { x, z },
    facingY: rotY ?? Math.PI,
    currentFacingY: rotY ?? Math.PI,
    targetFacingY: rotY ?? Math.PI,
    dialogActive: false,
    busyAnim: { type: null, timer: 0, phase: 0 },
    idleTimer: 0,
    walkTarget: null,
    walkPause: 0,
    walkReturning: false,
    staffMesh,
    campfire: null,
  };

  // Интервалы «занятий»
  if (type === 'helga') npc.specialEvery = 60;
  else if (type === 'radim') npc.specialEvery = 15;
  else if (type === 'mara') npc.specialEvery = 40;
  else if (type === 'iva') npc.specialEvery = 25;
  else if (type === 'yasen') npc.specialEvery = 35;
  else if (type === 'dorn') npc.specialEvery = 0;
  else npc.specialEvery = 0;

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
  lbl.className = 'nlabel nlabel-' + type;
  lbl.textContent = name;
  const ui = document.getElementById('world-ui');
  if (ui) ui.appendChild(lbl);
  npcLabels.push({ npc, el: lbl });

  return npc;
}

export function findNPC(type) { return npcList.find(n => n.type === type); }

export function npcLookAtPlayer(npc, playerPos) {
  if (!npc) return;
  npc.dialogActive = true;
  const dx = playerPos.x - npc.mesh.position.x;
  const dz = playerPos.z - npc.mesh.position.z;
  npc.targetFacingY = Math.atan2(dx, dz);
}

export function npcLookBack(npc) {
  if (!npc) return;
  npc.dialogActive = false;
  npc.targetFacingY = npc.facingY;
}

function applyBusyAnim(npc, dt) {
  const P = npc.mesh.userData;
  const t = npc.busyAnim.phase;
  switch (npc.busyAnim.type) {
    case 'head_shake': {
      const k = Math.sin(t * 4);
      P.headG.rotation.y = k * 0.45;
      P.headG.rotation.x += 0.2;
      P.headG.rotation.z = k * 0.1;
      break;
    }
    case 'hand_sort': {
      const s = Math.sin(t * 5);
      const c = Math.cos(t * 5);
      P.armL.rotation.x = -0.7 + s * 0.45;
      P.armL.rotation.z = -0.35 + c * 0.25;
      P.armR.rotation.x = -0.7 - s * 0.45;
      P.armR.rotation.z = 0.35 - c * 0.25;
      P.elbowL.rotation.x = -1.55 + s * 0.25;
      P.elbowR.rotation.x = -1.55 - s * 0.25;
      P.spineUpper.rotation.x = 0.32 + s * 0.05;
      P.headG.rotation.x = 0.35;
      P.pelvis.position.y = 0.86 - 0.04 + Math.abs(s) * 0.02;
      break;
    }
    case 'warm_hands': {
      // Руки поднимаются ВПЕРЁД (отрицательный rotation.x = локально +Z)
      const k = Math.min(1, t * 1.5);
      const e = k * k * (3 - 2 * k);
      const wave = Math.sin(t * 2.5) * 0.05;
      P.armL.rotation.x = 0.05 - e * 1.4 - wave;
      P.armR.rotation.x = 0.05 - e * 1.4 + wave;
      P.armL.rotation.z = -0.1 - e * 0.25;
      P.armR.rotation.z = 0.1 + e * 0.25;
      P.elbowL.rotation.x = -0.3 - e * 0.6;
      P.elbowR.rotation.x = -0.3 - e * 0.6;
      P.spineUpper.rotation.x = 0.02 + e * 0.18;
      P.headG.rotation.x = -0.15;
      break;
    }
    case 'hammer': {
      // Замедлено: 1.2 удара в секунду
      const cycle = (t * 1.2) % 1;
      const up = cycle < 0.5 ? cycle / 0.5 : (1 - cycle) / 0.5;
      const swing = up * up;
      P.armR.rotation.x = -0.2 - swing * 1.7;
      P.armR.rotation.z = 0.3 + swing * 0.1;
      P.elbowR.rotation.x = -0.4 - swing * 0.9;
      P.spineUpper.rotation.x = 0.1 + swing * 0.15;
      P.spineUpper.rotation.y = -0.2;
      P.headG.rotation.x = 0.25;
      P.armL.rotation.x = -0.7;
      P.armL.rotation.z = -0.4;
      P.elbowL.rotation.x = -1.3;
      break;
    }
  }
}

function updateNpcWalking(npc, dt, st) {
  if (!npc.walkTarget) return false;
  const wp = npc.walkTarget;
  const dx = wp.x - npc.mesh.position.x;
  const dz = wp.z - npc.mesh.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.15) {
    npc.walkTarget = null;
    npc.walkPause = 3.0;
    return false;
  }
  const speed = 1.6;
  const step = speed * dt;
  npc.mesh.position.x += (dx / dist) * step;
  npc.mesh.position.z += (dz / dist) * step;
  npc.mesh.position.y = getHeight(npc.mesh.position.x, npc.mesh.position.z);
  const ang = Math.atan2(dx, dz);
  npc.mesh.rotation.y = ang;
  npc.currentFacingY = ang;
  npc.targetFacingY = ang;
  st.mode = 'walk';
  st.walkPhase += dt * 6;
  return true;
}

export function updateNPCs(dt) {
  const playerPos = window.__playerPos;
  if (!playerPos) return;

  for (const npc of npcList) {
    npc.animPhase += dt;

    if (npc.marker) npc.marker.position.y = 3.0 + Math.sin(npc.animPhase * 1.5) * 0.15;

    const st = ensureAnimState(npc.mesh);
    st.t += dt;

    const isWalking = updateNpcWalking(npc, dt, st);

    if (!isWalking && npc.walkPause > 0) {
      npc.walkPause -= dt;
      if (npc.walkPause <= 0) {
        if (!npc.walkReturning) {
          npc.walkTarget = { x: npc.homePos.x, z: npc.homePos.z };
          npc.walkReturning = true;
        } else {
          npc.walkReturning = false;
        }
      }
    }

    // === Естественный поворот ===
    let turning = false;
    if (!isWalking) {
      let target = npc.facingY;
      if (npc.dialogActive) {
        const ddx = playerPos.x - npc.mesh.position.x;
        const ddz = playerPos.z - npc.mesh.position.z;
        target = Math.atan2(ddx, ddz);
      }
      npc.targetFacingY = target;
      let dy = npc.targetFacingY - npc.currentFacingY;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      turning = Math.abs(dy) > 0.15;
      const turnSpeed = npc.dialogActive ? 3 : 1.5;
      npc.currentFacingY += dy * Math.min(1, dt * turnSpeed);
      npc.mesh.rotation.y = npc.currentFacingY;
    }

    // Запуск занятий
    if (npc.busyAnim.timer > 0) {
      npc.busyAnim.timer -= dt;
      npc.busyAnim.phase += dt;
      if (npc.busyAnim.timer <= 0) {
        npc.busyAnim.type = null;
        npc.busyAnim.phase = 0;
      }
    } else if (!npc.dialogActive && !isWalking) {
      if (npc.type === 'dorn') {
        npc.busyAnim.type = 'hammer';
        npc.busyAnim.timer = 5.0;
        npc.busyAnim.phase = 0;
      } else if (npc.specialEvery > 0) {
        npc.idleTimer += dt;
        if (npc.idleTimer >= npc.specialEvery) {
          npc.idleTimer = 0;
          if (npc.type === 'helga') {
            npc.busyAnim.type = 'head_shake';
            npc.busyAnim.timer = 2.5;
            npc.busyAnim.phase = 0;
          } else if (npc.type === 'radim') {
            npc.busyAnim.type = 'hand_sort';
            npc.busyAnim.timer = 3.5;
            npc.busyAnim.phase = 0;
          } else if (npc.type === 'mara') {
            const camp = npc.campfire || { x: 0, z: 0 };
            // Цель — севернее костра, где нет других NPC
            npc.walkTarget = { x: camp.x, z: camp.z - 3.5 };
            npc.walkReturning = false;
          } else if (npc.type === 'iva' || npc.type === 'yasen') {
            npc.busyAnim.type = 'warm_hands';
            npc.busyAnim.timer = 3.5;
            npc.busyAnim.phase = 0;
          }
        }
      }
    }

    if (!isWalking) {
      if (turning && !npc.busyAnim.type) {
        // Естественный разворот: шагаем ногами на месте
        st.mode = 'walk';
        st.walkPhase += dt * 3.0;
        animateHumanoid(npc.mesh, st, dt);
        const P = npc.mesh.userData;
        // Уменьшаем амплитуду ног — не «марш», а лёгкий разворот
        if (P.legL) P.legL.rotation.x *= 0.35;
        if (P.legR) P.legR.rotation.x *= 0.35;
        if (P.kneeL) P.kneeL.rotation.x *= 0.6;
        if (P.kneeR) P.kneeR.rotation.x *= 0.6;
        if (P.footL) P.footL.rotation.x *= 0.5;
        if (P.footR) P.footR.rotation.x *= 0.5;
      } else {
        st.mode = 'idle';
        animateHumanoid(npc.mesh, st, dt);

        if (npc.type === 'helga') {
          const P = npc.mesh.userData;
          P.spineLower.rotation.x = 0.15;
          P.spineUpper.rotation.x = 0.22;
          P.headG.rotation.x += 0.15;
          P.armR.rotation.x = 0.35;
          P.armR.rotation.z = 0.15;
          P.elbowR.rotation.x = -0.5;
        }

        if (npc.busyAnim.type) applyBusyAnim(npc, dt);
      }
    } else {
      animateHumanoid(npc.mesh, st, dt);
    }
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
      el.style.opacity = Math.max(0.5, Math.min(1, 1 - (dist - 20) / 10));
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