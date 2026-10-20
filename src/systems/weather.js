// Ветер: качание деревьев + пыль.
import * as THREE from 'three';
import { world } from '../core/scene.js';

export const weather = {
  windTime: 0,
  windDirection: new THREE.Vector3(1, 0, 0.3).normalize(),
  windStrength: 1.0,
  dustParticles: null,
  dustData: [],
  dustGeo: null,
  dustIndex: 0,
  windTargets: [],
  isMobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
};

// Найти все деревья в сцене и пометить их для качания
export function registerWindTargets() {
  weather.windTargets = [];
  world.scene.traverse(o => {
    if (o.userData && o.userData.windAmp > 0) {
      weather.windTargets.push({
        obj: o,
        phase: Math.random() * Math.PI * 2,
        amp: o.userData.windAmp,
        baseRotZ: o.rotation.z,
        baseRotX: o.rotation.x,
      });
    }
  });
  console.log('[weather] деревьев для качания:', weather.windTargets.length);
}

export function initDust() {
  const N = weather.isMobile ? 120 : 250;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  weather.dustData = [];

  // Круглая текстура пылинки
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 32;
  const ctx = cvs.getContext('2d');
  const grd = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(230,210,170,0.85)');
  grd.addColorStop(0.5, 'rgba(200,180,140,0.35)');
  grd.addColorStop(1, 'rgba(180,160,120,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(cvs);

  for (let i = 0; i < N; i++) {
    weather.dustData.push({
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      life: 0, maxLife: 0,
      active: false,
    });
    positions[i * 3] = 0;
    positions[i * 3 + 1] = -100;
    positions[i * 3 + 2] = 0;
    colors[i * 3] = 0.92;
    colors[i * 3 + 1] = 0.85;
    colors[i * 3 + 2] = 0.68;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.32,
    map: tex,
    transparent: true,
    vertexColors: true,
    depthWrite: false,
    sizeAttenuation: true,
    opacity: 0.7,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  world.scene.add(points);

  weather.dustParticles = points;
  weather.dustGeo = geo;
}

function spawnDust(playerPos, count) {
  const total = weather.dustData.length;
  for (let k = 0; k < count; k++) {
    const i = weather.dustIndex % total;
    weather.dustIndex++;
    const d = weather.dustData[i];

    const angle = Math.random() * Math.PI * 2;
    const radius = 6 + Math.random() * 22;
    d.x = playerPos.x + Math.cos(angle) * radius;
    d.z = playerPos.z + Math.sin(angle) * radius;
    d.y = 0.25 + Math.random() * 1.6;

    const wd = weather.windDirection;
    d.vx = wd.x * (0.4 + Math.random() * 1.6);
    d.vz = wd.z * (0.4 + Math.random() * 1.6);
    d.vy = (Math.random() - 0.3) * 0.15;

    d.maxLife = 4 + Math.random() * 4;
    d.life = d.maxLife;
    d.active = true;
  }
}

export function updateWeather(dt, playerPos) {
  weather.windTime += dt;
  const t = weather.windTime;

  // === Качание деревьев ===
  for (const wt of weather.windTargets) {
    const swing =
      Math.sin(t * 0.75 + wt.phase) * 0.045 * wt.amp +
      Math.sin(t * 1.7 + wt.phase * 1.3) * 0.018 * wt.amp;
    const swing2 =
      Math.cos(t * 0.6 + wt.phase * 0.7) * 0.028 * wt.amp;
    wt.obj.rotation.z = wt.baseRotZ + swing;
    wt.obj.rotation.x = wt.baseRotX + swing2;
  }

  // === Пыль ===
  if (!weather.dustParticles) return;
  if (Math.random() < 0.7) spawnDust(playerPos, 1);

  const posAttr = weather.dustGeo.attributes.position;
  const arr = posAttr.array;
  for (let i = 0; i < weather.dustData.length; i++) {
    const d = weather.dustData[i];
    if (!d.active) {
      arr[i * 3 + 1] = -100;
      continue;
    }
    d.life -= dt;
    const dxp = d.x - playerPos.x;
    const dzp = d.z - playerPos.z;
    if (d.life <= 0 || (dxp * dxp + dzp * dzp) > 40 * 40) {
      d.active = false;
      arr[i * 3 + 1] = -100;
      continue;
    }
    d.x += d.vx * dt;
    d.z += d.vz * dt;
    d.y += d.vy * dt;
    d.y += Math.sin(t * 3 + i) * 0.02;
    arr[i * 3] = d.x;
    arr[i * 3 + 1] = d.y;
    arr[i * 3 + 2] = d.z;
  }
  posAttr.needsUpdate = true;
}