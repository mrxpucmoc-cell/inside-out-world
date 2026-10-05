import * as THREE from 'three';
import { state } from '../core/state.js';
import { createHumanoid, ensureAnimState, animateHumanoid } from '../entities/humanoid.js';
import { shadeColor } from '../core/assets.js';

let renderer = null, scene = null, camera = null, char = null, running = false;

export function initPreview() {
  const canvas = document.getElementById('previewCanvas');
  if (!canvas || renderer) return;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(200, 260, false);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 200 / 260, 0.1, 40);
  camera.position.set(0, 1.15, 4.8);
  camera.lookAt(0, 1.0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.9));
  const l = new THREE.DirectionalLight(0xffffff, 0.9);
  l.position.set(3, 5, 4);
  scene.add(l);

  rebuild();
  running = true;
  loop();

  window.addEventListener('preview:rebuild', rebuild);
}

function rebuild() {
  if (!scene) return;
  if (char) scene.remove(char);
  char = createHumanoid({
    skin: state.character.skin,
    hair: state.character.hair,
    shirt: state.character.outfit,
    pants: shadeColor(state.character.outfit, 0.65),
    gender: state.character.gender,
    hairStyle: state.character.hairStyle,
    eyeColor: state.character.eyeColor,
    mouthStyle: state.character.mouthStyle,
    bodyType: state.character.bodyType,
    beard: state.character.beard,
  });
  char.scale.setScalar(0.78);
  scene.add(char);
  ensureAnimState(char);
}

function loop() {
  if (!running) return;
  requestAnimationFrame(loop);
  if (char) {
    char.rotation.y += 0.012;
    const st = ensureAnimState(char);
    st.t += 0.016;
    animateHumanoid(char, st, 0.016);
    renderer.render(scene, camera);
  }
}

export function disposePreview() {
  running = false;
  renderer?.dispose();
  renderer = null;
  scene = null;
  char = null;
}