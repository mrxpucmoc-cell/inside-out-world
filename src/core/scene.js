// Сцена, камера, свет.
//  • Туман вынесен далеко (250..600) — центр карты больше не тускнеет.
//  • AmbientLight 0.30 — общая подсветка.
//  • Hemisphere bottom 0xa89868 (теплее и светлее прежнего).
//  • Sun 1.45, Rim 0.40.
//  • ACESFilmic, exposure 1.15.

import * as THREE from 'three';
import { HALF } from './constants.js';

export const world = {
  scene: null,
  camera: null,
  renderer: null,
  camOffset: new THREE.Vector3(0, 13.2, 10.8),
  camLookOffset: new THREE.Vector3(0, 1.2, 0),
  camTarget: new THREE.Vector3(),
  camCurrent: new THREE.Vector3(0, 13.2, 10.8),
  distanceMul: 1.0,
};

export function initScene(container) {
  world.scene = new THREE.Scene();
  world.scene.background = new THREE.Color(0xc8dde8);
  // Туман далеко — центр карты не должен тускнеть
  world.scene.fog = new THREE.Fog(0xd0e0ec, 250, 600);

  world.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 800);

  world.renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  world.renderer.setSize(innerWidth, innerHeight);
  world.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  world.renderer.setClearColor(0xc8dde8, 1);
  world.renderer.shadowMap.enabled = true;
  world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  world.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  world.renderer.toneMappingExposure = 1.15;

  const el = world.renderer.domElement;
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.left = '0';
  el.style.zIndex = '1';
  if (container) container.insertBefore(el, container.firstChild);
  else document.body.appendChild(el);

  /* Освещение */
  // 1) Hemisphere — небо голубое, земля тёплая и светлая
  world.scene.add(new THREE.HemisphereLight(0xd8e8f8, 0xa89868, 0.70));

  // 2) AmbientLight — общая подсветка, чтобы центр не был тёмным
  world.scene.add(new THREE.AmbientLight(0xfff8f0, 0.30));

  // 3) Sun
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.45);
  sun.position.set(8, 16, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -200;
  sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200;
  sun.shadow.camera.bottom = -200;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0008;
  sun.target.position.set(0, 0, 0);
  world.scene.add(sun);
  world.scene.add(sun.target);

  // 4) Rim
  const rim = new THREE.DirectionalLight(0xa8b8d8, 0.40);
  rim.position.set(-12, 8, -14);
  world.scene.add(rim);

  buildSky(world.scene);

  addEventListener('resize', onResize);
  return world;
}

function buildSky(scene) {
  const skyGeo = new THREE.SphereGeometry(360, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor:    { value: new THREE.Color(0x4a90d8) },
      midColor:    { value: new THREE.Color(0x98c0e8) },
      bottomColor: { value: new THREE.Color(0xe8e8f0) },
      offset:      { value: 80 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, bottomColor;
      uniform float offset;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        vec3 col;
        if (h > 0.25) col = mix(midColor, topColor, (h - 0.25) / 0.75);
        else if (h > -0.1) col = mix(bottomColor, midColor, (h + 0.1) / 0.35);
        else col = bottomColor;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}

function onResize() {
  if (!world.camera) return;
  world.camera.aspect = innerWidth / innerHeight;
  world.camera.updateProjectionMatrix();
  world.renderer.setSize(innerWidth, innerHeight);
}

export function updateCameraFollow(playerPos, dt) {
  const base = world.camOffset.clone().multiplyScalar(world.distanceMul);
  world.camTarget.copy(playerPos).add(base);
  world.camCurrent.lerp(world.camTarget, 1 - Math.pow(0.001, dt));
  world.camera.position.copy(world.camCurrent);
  world.camera.lookAt(playerPos.clone().add(world.camLookOffset));
}

export function setZoom(delta) {
  world.distanceMul = Math.max(0.6, Math.min(1.5, world.distanceMul + delta));
}

export function snapCamera(playerPos) {
  const base = world.camOffset.clone().multiplyScalar(world.distanceMul);
  world.camTarget.copy(playerPos).add(base);
  world.camCurrent.copy(world.camTarget);
  world.camera.position.copy(world.camCurrent);
  world.camera.lookAt(playerPos.clone().add(world.camLookOffset));
}