// Универсальное тело + анимация. Всё, что ходит на двух ногах,
// создаётся отсюда. Мобы, NPC, игрок.

import * as THREE from 'three';
import { getMat, addOutlineToGroup, shadeColor, rnd } from '../core/assets.js';
import { SKEL } from '../core/constants.js';

export function createHumanoid(cfg) {
  const root = new THREE.Group();
  const skin   = cfg.skin   ?? 0xe8c8a8;
  const shirt  = cfg.shirt  ?? 0x7a8ab8;
  const pants  = cfg.pants  ?? 0x5a4a48;
  const hair   = cfg.hair   ?? 0x3a3530;
  const female = cfg.gender === 'female';
  const ghost  = cfg.ghost === true;

  const hairStyle = cfg.hairStyle || 'short';
  const eyeColor = cfg.eyeColor ?? 0x2a2520;
  const mouthStyle = cfg.mouthStyle || 'neutral';
  const bodyType = cfg.bodyType || 'normal';
  const beardStyle = cfg.beard || 'none';

  let torsoW = female ? 0.44 : 0.52;
  let torsoH = female ? 0.68 : 0.72;
  let armW = 0.19, legW = 0.21, shoulderPad = 0.09;

  if (bodyType === 'slim')     { torsoW *= 0.82; armW = 0.16; legW = 0.18; shoulderPad = 0.07; }
  else if (bodyType === 'muscular') { torsoW *= 1.18; armW = 0.24; legW = 0.25; shoulderPad = 0.11; }
  else if (bodyType === 'heavy')    { torsoW *= 1.35; torsoH *= 1.05; armW = 0.23; legW = 0.27; shoulderPad = 0.13; }

  const { HIP_Y, THIGH_LEN, SHIN_LEN, UPPER_ARM_LEN, FOREARM_LEN } = SKEL;

  // Таз
  const pelvis = new THREE.Group();
  pelvis.position.y = HIP_Y;
  root.add(pelvis);

  const hipsMesh = new THREE.Mesh(new THREE.BoxGeometry(torsoW * 0.9, 0.14, 0.32), getMat(pants));
  hipsMesh.position.y = -0.03;
  pelvis.add(hipsMesh);

  if (female) {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(torsoW + 0.06, 0.22, 0.34), getMat(pants));
    sk.position.y = 0.05;
    pelvis.add(sk);
  }

  if (ghost) {
    const robe = new THREE.Mesh(new THREE.BoxGeometry(torsoW + 0.15, 0.55, 0.4), getMat(shirt));
    robe.position.y = -0.4;
    pelvis.add(robe);
  }

  // Позвоночник
  const spineLower = new THREE.Group();
  spineLower.position.y = 0.05;
  pelvis.add(spineLower);

  const spineLowerMesh = new THREE.Mesh(
    new THREE.BoxGeometry(torsoW * 0.95, torsoH * 0.35, 0.30), getMat(shirt));
  spineLowerMesh.position.y = torsoH * 0.175;
  spineLower.add(spineLowerMesh);

  const spineUpper = new THREE.Group();
  spineUpper.position.y = torsoH * 0.35;
  spineLower.add(spineUpper);

  const spineUpperMesh = new THREE.Mesh(
    new THREE.BoxGeometry(torsoW, torsoH * 0.65, 0.30), getMat(shirt));
  spineUpperMesh.position.y = torsoH * 0.325;
  spineUpper.add(spineUpperMesh);
  const torso = spineUpperMesh;

  // Шея / голова
  const neck = new THREE.Group();
  neck.position.y = torsoH;
  spineUpper.add(neck);

  const neckMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.14), getMat(skin));
  neckMesh.position.y = 0.04;
  neck.add(neckMesh);

  const headG = new THREE.Group();
  headG.position.y = 0.08;
  neck.add(headG);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), getMat(skin));
  head.position.y = 0.25;
  headG.add(head);

  // Причёски (сжато — все варианты в одной функции)
  buildHair(headG, hairStyle, hair, skin, female);

  // Глаза
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf0e8e0 });
  const pupMat = new THREE.MeshBasicMaterial({ color: eyeColor });
  for (const sx of [-0.12, 0.12]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.02), eyeMat);
    e.position.set(sx, 0.3, 0.26); headG.add(e);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.02), pupMat);
    p.position.set(sx + (sx > 0 ? 0.02 : -0.02), 0.3, 0.275); headG.add(p);
  }
  for (const sx of [-0.12, 0.12]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.02), getMat(hair));
    b.position.set(sx, 0.4, 0.26); headG.add(b);
  }

  // Рот
  buildMouth(headG, mouthStyle);

  // Борода
  if (!female) buildBeard(headG, beardStyle, hair);

  // Руки
  function buildArm(side) {
    const armGroup = new THREE.Group();
    armGroup.position.set(side * (torsoW / 2 + shoulderPad * 0.5), torsoH * 0.92, 0);
    spineUpper.add(armGroup);
    const upperArmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(armW, UPPER_ARM_LEN, armW + 0.01), getMat(shirt));
    upperArmMesh.position.y = -UPPER_ARM_LEN / 2;
    armGroup.add(upperArmMesh);
    const elbow = new THREE.Group();
    elbow.position.y = -UPPER_ARM_LEN;
    armGroup.add(elbow);
    const forearmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(armW - 0.01, FOREARM_LEN, armW - 0.01), getMat(shirt));
    forearmMesh.position.y = -FOREARM_LEN / 2;
    elbow.add(forearmMesh);
    const hand = new THREE.Group();
    hand.position.y = -FOREARM_LEN;
    elbow.add(hand);
    const handMesh = new THREE.Mesh(
      new THREE.BoxGeometry(armW * 0.9, armW * 0.85, armW * 0.9), getMat(skin));
    handMesh.position.y = -armW * 0.4;
    hand.add(handMesh);
    return { armGroup, upperArmMesh, elbow, forearmMesh, hand, handMesh, side };
  }
  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Ноги
  function buildLeg(side) {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * (legW * 0.55 + 0.02), 0, 0);
    pelvis.add(legGroup);
    const thighMesh = new THREE.Mesh(
      new THREE.BoxGeometry(legW, THIGH_LEN, legW + 0.01), getMat(pants));
    thighMesh.position.y = -THIGH_LEN / 2;
    legGroup.add(thighMesh);
    const knee = new THREE.Group();
    knee.position.y = -THIGH_LEN;
    legGroup.add(knee);
    const shinMesh = new THREE.Mesh(
      new THREE.BoxGeometry(legW - 0.01, SHIN_LEN, legW - 0.01), getMat(pants));
    shinMesh.position.y = -SHIN_LEN / 2;
    knee.add(shinMesh);
    const foot = new THREE.Group();
    foot.position.y = -SHIN_LEN;
    knee.add(foot);
    const footMesh = new THREE.Mesh(
      new THREE.BoxGeometry(legW, 0.14, legW + 0.18), getMat(pants));
    footMesh.position.set(0, -0.07, legW * 0.5);
    foot.add(footMesh);
    return { legGroup, thighMesh, knee, shinMesh, foot, footMesh, side };
  }
  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  if (ghost) {
    const gm = new THREE.MeshLambertMaterial({
      color: shirt, transparent: true, opacity: 0.65, depthWrite: false
    });
    torso.material = gm;
    leftArm.upperArmMesh.material = gm;
    rightArm.upperArmMesh.material = gm;
  }

  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  addOutlineToGroup(root, 0x1a1010, 1.035);

  root.userData = {
    headG, torso, pelvis, spineLower, spineUpper, neck,
    armL: leftArm.armGroup, armR: rightArm.armGroup,
    armLm: leftArm.upperArmMesh, armRm: rightArm.upperArmMesh,
    elbowL: leftArm.elbow, elbowR: rightArm.elbow,
    forearmL: leftArm.forearmMesh, forearmR: rightArm.forearmMesh,
    handL: leftArm.hand, handR: rightArm.hand,
    handLm: leftArm.handMesh, handRm: rightArm.handMesh,
    legL: leftLeg.legGroup, legR: rightLeg.legGroup,
    legLm: leftLeg.thighMesh, legRm: rightLeg.thighMesh,
    kneeL: leftLeg.knee, kneeR: rightLeg.knee,
    shinL: leftLeg.shinMesh, shinR: rightLeg.shinMesh,
    footL: leftLeg.foot, footR: rightLeg.foot,
    footLm: leftLeg.footMesh, footRm: rightLeg.footMesh,
    female, ghost
  };
  return root;
}

// === Причёски (сжато — все ветвления в одной функции) ===
function buildHair(headG, style, hair, skin, female) {
  const m = getMat(hair);
  const add = (w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    headG.add(mesh);
    return mesh;
  };
  switch (style) {
    case 'short':
      add(0.54, 0.16, 0.54, 0, 0.5, 0);
      add(0.54, 0.34, 0.1, 0, 0.28, -0.23);
      if (female) {
        add(0.1, 0.32, 0.4, -0.28, 0.32, 0.04);
        add(0.1, 0.32, 0.4,  0.28, 0.32, 0.04);
      }
      break;
    case 'long':
      add(0.56, 0.18, 0.56, 0, 0.5, 0);
      add(0.56, 0.85, 0.18, 0, 0.1, -0.24);
      add(0.12, 0.5, 0.42, -0.29, 0.2, 0.04);
      add(0.12, 0.5, 0.42,  0.29, 0.2, 0.04);
      break;
    case 'pony':
      add(0.54, 0.18, 0.54, 0, 0.5, 0);
      add(0.54, 0.3, 0.12, 0, 0.3, -0.24);
      { const p = add(0.18, 0.75, 0.18, 0, 0.05, -0.38); p.rotation.x = 0.15; }
      break;
    case 'mohawk':
      add(0.14, 0.35, 0.6, 0, 0.62, 0);
      add(0.14, 0.2, 0.1, 0, 0.72, 0.22);
      add(0.06, 0.05, 0.5, -0.25, 0.53, 0);
      add(0.06, 0.05, 0.5,  0.25, 0.53, 0);
      break;
    case 'bald':
      break;
    case 'curly':
      add(0.56, 0.2, 0.56, 0, 0.5, 0);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        add(0.16, 0.16, 0.16, Math.cos(a) * 0.24, 0.58, Math.sin(a) * 0.24);
      }
      add(0.54, 0.32, 0.1, 0, 0.28, -0.23);
      break;
    case 'spiky':
      add(0.54, 0.12, 0.54, 0, 0.52, 0);
      for (let i = 0; i < 5; i++) add(0.1, 0.24, 0.1, -0.2 + i * 0.1, 0.7, 0);
      for (let i = 0; i < 5; i++) add(0.1, 0.24, 0.1, 0, 0.7, -0.2 + i * 0.1);
      add(0.54, 0.32, 0.1, 0, 0.28, -0.23);
      break;
    case 'braids':
      add(0.54, 0.16, 0.54, 0, 0.5, 0);
      add(0.54, 0.34, 0.1, 0, 0.28, -0.23);
      for (const sx of [-0.28, 0.28]) {
        add(0.1, 0.55, 0.1, sx, 0.0, 0.1);
        add(0.08, 0.08, 0.08, sx, -0.32, 0.1);
      }
      break;
    case 'topknot':
      add(0.54, 0.16, 0.54, 0, 0.5, 0);
      add(0.54, 0.34, 0.1, 0, 0.28, -0.23);
      add(0.22, 0.22, 0.22, 0, 0.7, -0.05);
      break;
    case 'bob':
      add(0.56, 0.18, 0.56, 0, 0.5, 0);
      add(0.12, 0.55, 0.52, -0.29, 0.1, 0);
      add(0.12, 0.55, 0.52,  0.29, 0.1, 0);
      add(0.56, 0.55, 0.16, 0, 0.1, -0.24);
      break;
    default:
      add(0.54, 0.16, 0.54, 0, 0.5, 0);
  }
}

function buildMouth(headG, style) {
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x3a3030 });
  if (style === 'smile') {
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.02), mouthMat);
    m1.position.set(-0.045, 0.17, 0.255); m1.rotation.z = -0.3; headG.add(m1);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.02), mouthMat);
    m2.position.set(0.045, 0.17, 0.255); m2.rotation.z = 0.3; headG.add(m2);
  } else if (style === 'frown') {
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.02), mouthMat);
    m1.position.set(-0.045, 0.155, 0.255); m1.rotation.z = 0.3; headG.add(m1);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.02), mouthMat);
    m2.position.set(0.045, 0.155, 0.255); m2.rotation.z = -0.3; headG.add(m2);
  } else {
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.02), mouthMat);
    mouth.position.set(0, 0.16, 0.255); headG.add(mouth);
  }
}

function buildBeard(headG, style, hair) {
  const m = getMat(hair);
  const add = (w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    headG.add(mesh);
  };
  switch (style) {
    case 'stubble':   add(0.44, 0.08, 0.32, 0, 0.1, 0.13); break;
    case 'goatee':    add(0.16, 0.16, 0.12, 0, 0.04, 0.24); add(0.22, 0.04, 0.05, 0, 0.14, 0.27); break;
    case 'full':      add(0.46, 0.22, 0.34, 0, 0.03, 0.13); add(0.24, 0.05, 0.05, 0, 0.14, 0.27); break;
    case 'short':     add(0.42, 0.12, 0.30, 0, 0.08, 0.14); add(0.22, 0.04, 0.05, 0, 0.14, 0.27); break;
    case 'long':      add(0.44, 0.5, 0.32, 0, -0.15, 0.13); add(0.26, 0.05, 0.05, 0, 0.14, 0.27); break;
    case 'mustache':  add(0.3, 0.06, 0.06, 0, 0.14, 0.27); break;
    case 'handlebar':
      add(0.22, 0.05, 0.06, 0, 0.14, 0.27);
      for (const sx of [-0.18, 0.18]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.05), m);
        c.position.set(sx, 0.21, 0.27);
        c.rotation.z = sx > 0 ? -0.35 : 0.35;
        headG.add(c);
      }
      break;
  }
}

// === Универсальная анимация (без изменений из игры) ===
export function animateHumanoid(char, st, dt) {
  const P = char.userData;
  if (!P || !P.pelvis) return;
  const HIP_Y = SKEL.HIP_Y;
  const mode = st.mode || 'idle';
  const phase = st.walkPhase || 0;
  const t = st.t || 0;
  const lerpTo = (o, k, target, speed) => {
    o[k] += (target - o[k]) * Math.min(1, dt * speed);
  };

  if (mode === 'death') return;

  if (mode === 'dash') {
    P.pelvis.rotation.x = 0.35; P.spineLower.rotation.x = 0.2; P.spineUpper.rotation.x = 0.15;
    P.pelvis.position.y = HIP_Y - 0.05;
    P.headG.rotation.x = -0.3;
    P.armL.rotation.x = P.armR.rotation.x = -0.9;
    P.elbowL.rotation.x = P.elbowR.rotation.x = -0.9;
    P.legL.rotation.x = -0.4; P.legR.rotation.x = 0.4;
    P.kneeL.rotation.x = 0.7; P.kneeR.rotation.x = 0.3;
    P.footL.rotation.x = -0.3; P.footR.rotation.x = 0.1;
    return;
  }

  if (mode === 'attack') {
    const sw = st.swing || 0;
    const t_sw = 1 - sw;
    const attackType = st.attackType || 'melee';
    const arc = Math.sin(t_sw * Math.PI);

    if (attackType === 'bow') {
      let bowX, drawArmX, drawElbow, drawZ;
      if (t_sw < 0.25) {
        const k = t_sw / 0.25, e = k * k * (3 - 2 * k);
        bowX = 0.05 - e * 1.55; drawArmX = 0.05 + e * 0.55;
        drawElbow = -0.3 - e * 1.75; drawZ = -0.1 - e * 0.25;
      } else if (t_sw < 0.7) {
        bowX = -1.5; drawArmX = 0.6; drawElbow = -2.05; drawZ = -0.35;
      } else {
        const k = (t_sw - 0.7) / 0.3, e = k * k * (3 - 2 * k);
        bowX = -1.5 + e * 1.55; drawArmX = 0.6 - e * 0.55;
        drawElbow = -2.05 + e * 1.75; drawZ = -0.35 + e * 0.25;
      }
      P.armR.rotation.x = bowX; P.armR.rotation.z = 0.1;
      P.elbowR.rotation.x = -0.15;
      P.armL.rotation.x = drawArmX; P.armL.rotation.z = drawZ;
      P.elbowL.rotation.x = drawElbow;
      P.pelvis.rotation.y = t_sw < 0.5 ? -0.18 * Math.min(1, t_sw / 0.25) : -0.18;
      P.pelvis.position.y = HIP_Y;
      return;
    }

    if (attackType === 'staff') {
      let armX, armZ;
      if (t_sw < 0.2) {
        const k = t_sw / 0.2, e = k * k * (3 - 2 * k);
        armX = 0.05 - e * 1.5; armZ = 0.1 + e * 0.15;
      } else if (t_sw < 0.85) {
        armX = -1.45; armZ = 0.25;
      } else {
        const k = (t_sw - 0.85) / 0.15, e = k * k * (3 - 2 * k);
        armX = -1.45 + e * 1.5; armZ = 0.25 - e * 0.15;
      }
      P.armR.rotation.x = armX; P.armR.rotation.z = armZ;
      P.elbowR.rotation.x = -0.2;
      P.armL.rotation.x = armX + 0.25; P.armL.rotation.z = -armZ - 0.15;
      P.elbowL.rotation.x = -0.7;
      P.pelvis.position.y = HIP_Y;
      return;
    }

    // Ближний бой
    let armX, armZ, elbowX;
    if (t_sw < 0.4) {
      const k = t_sw / 0.4, e = k * k * (3 - 2 * k);
      armX = 0.05 - e * 1.7; armZ = 0.1 + e * 1.0; elbowX = -0.3 - e * 0.9;
    } else if (t_sw < 0.62) {
      const k = (t_sw - 0.4) / 0.22, e = k * k;
      armX = -1.65 + e * 2.5; armZ = 1.1 - e * 1.4; elbowX = -1.2 + e * 1.1;
    } else {
      const k = (t_sw - 0.62) / 0.38, e = k * k * (3 - 2 * k);
      armX = 0.85 - e * 0.8; armZ = -0.3 + e * 0.4; elbowX = -0.1 - e * 0.2;
    }
    P.pelvis.rotation.x = 0.05;
    P.pelvis.rotation.y = t_sw < 0.4 ? t_sw * 0.3 : 0.12 - (t_sw - 0.4) * 0.4;
    P.armR.rotation.x = armX; P.armR.rotation.z = armZ;
    P.elbowR.rotation.x = elbowX;
    P.armL.rotation.x = 0.1 + arc * 0.3; P.armL.rotation.z = -0.35 - arc * 0.15;
    P.elbowL.rotation.x = -0.7 - arc * 0.25;
    P.pelvis.position.y = HIP_Y;
    return;
  }

  if (mode === 'walk' || mode === 'run') {
    const amp = (mode === 'run') ? 1.0 : 0.68;
    const s = Math.sin(phase), c = Math.cos(phase);
    P.pelvis.position.y = HIP_Y - Math.abs(s) * 0.12 * amp;
    P.pelvis.rotation.z = -c * 0.06 * amp;
    P.pelvis.rotation.y = -s * 0.08 * amp;
    P.pelvis.rotation.x = amp * 0.08;
    P.spineLower.rotation.y = s * 0.07 * amp;
    P.spineUpper.rotation.y = -s * 0.13 * amp;
    P.spineLower.rotation.x = 0.02 + amp * 0.06;
    P.spineUpper.rotation.x = 0.02 + amp * 0.05;
    P.headG.rotation.y = -P.spineUpper.rotation.y * 0.55;
    P.legL.rotation.x = s * 0.75 * amp;
    P.legR.rotation.x = -s * 0.75 * amp;
    const kL = Math.max(0, -c) * 1.35 * amp + 0.05;
    const kR = Math.max(0, c) * 1.35 * amp + 0.05;
    lerpTo(P.kneeL.rotation, 'x', kL, 14);
    lerpTo(P.kneeR.rotation, 'x', kR, 14);
    P.footL.rotation.x = -P.kneeL.rotation.x * 0.55 - s * 0.15;
    P.footR.rotation.x = -P.kneeR.rotation.x * 0.55 + s * 0.15;
    P.armL.rotation.x = -s * 0.55 * amp;
    P.armR.rotation.x = s * 0.55 * amp;
    P.armL.rotation.z = -0.06 - amp * 0.04;
    P.armR.rotation.z = 0.06 + amp * 0.04;
    lerpTo(P.elbowL.rotation, 'x', -0.25 - Math.max(0, s) * 0.5 * amp, 14);
    lerpTo(P.elbowR.rotation, 'x', -0.25 - Math.max(0, -s) * 0.5 * amp, 14);
    return;
  }

  // idle — дыхание
  const breathe = Math.sin(t * 1.6);
  const sway = Math.sin(t * 0.7);
  const micro = Math.sin(t * 3.1) * 0.4;
  lerpTo(P.pelvis.position, 'y', HIP_Y + breathe * 0.008, 5);
  lerpTo(P.pelvis.rotation, 'z', sway * 0.018, 4);
  lerpTo(P.pelvis.rotation, 'y', 0, 4);
  lerpTo(P.pelvis.rotation, 'x', 0, 4);
  lerpTo(P.spineLower.rotation, 'y', 0, 4);
  lerpTo(P.spineLower.rotation, 'z', sway * 0.02, 4);
  lerpTo(P.spineLower.rotation, 'x', 0.02, 4);
  lerpTo(P.spineUpper.rotation, 'y', 0, 4);
  lerpTo(P.spineUpper.rotation, 'z', -sway * 0.015, 4);
  lerpTo(P.spineUpper.rotation, 'x', 0.02 + breathe * 0.012 + micro * 0.005, 4);
  P.neck.rotation.y = Math.sin(t * 0.35) * 0.08;
  P.headG.rotation.y = Math.sin(t * 0.45) * 0.14;
  P.headG.rotation.x = Math.sin(t * 0.6) * 0.03;
  lerpTo(P.legL.rotation, 'x', 0, 4);
  lerpTo(P.legR.rotation, 'x', 0, 4);
  lerpTo(P.kneeL.rotation, 'x', 0.05, 4);
  lerpTo(P.kneeR.rotation, 'x', 0.05, 4);
  lerpTo(P.footL.rotation, 'x', -0.02, 4);
  lerpTo(P.footR.rotation, 'x', -0.02, 4);
  lerpTo(P.armL.rotation, 'x', 0.05 + sway * 0.015, 4);
  lerpTo(P.armR.rotation, 'x', 0.05 - sway * 0.015, 4);
  P.armL.rotation.z = -0.10;
  P.armR.rotation.z = 0.10;
  lerpTo(P.elbowL.rotation, 'x', -0.30 + breathe * 0.02, 4);
  lerpTo(P.elbowR.rotation, 'x', -0.30 - breathe * 0.02, 4);
}

export function ensureAnimState(obj) {
  if (!obj.userData.animState) {
    obj.userData.animState = {
      mode: 'idle', walkPhase: 0, swing: 0, t: 0, attackType: 'melee'
    };
  }
  return obj.userData.animState;
}