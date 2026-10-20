// Загрузчик 3D-моделей оружия (мечи, щиты, посохи и т.д.).
// Использование:
//   1. await preloadWeapons()
//   2. getWeaponModel('sword_iron') — синхронно достать заготовку
//   3. attachWeaponModel(parent, model, opts) — клонировать и повесить на анкор

import * as THREE from 'three';
import { loadGLTF } from './gltfLoader.js';

// Реестр загруженных моделей: id → THREE.Group
const weaponCache = new Map();

// Список моделей для предзагрузки. Добавляй сюда всё, что есть в assets/models/weapons/
const WEAPONS_TO_LOAD = [
  { id: 'sword_iron',   url: 'assets/models/weapons/sword_iron.glb' },
  { id: 'shield_iron',  url: 'assets/models/weapons/shield_iron.glb' },
];

// Подготовка оружия: тени, корректный цвет
function prepareModel(root) {
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.metalness !== undefined) m.metalness = 0.0;
        if (m.roughness !== undefined) m.roughness = 0.7;
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      }
    }
  });
}

export async function preloadWeapons() {
  console.log('[weapons] начинаю предзагрузку...');
  const t0 = performance.now();
  for (const cfg of WEAPONS_TO_LOAD) {
    try {
      const gltf = await loadGLTF(cfg.url);
      const model = gltf.scene;
      prepareModel(model);
      model.updateMatrixWorld(true);
      weaponCache.set(cfg.id, model);
      console.log(`[weapons] ✓ ${cfg.id} загружен`);
    } catch (e) {
      console.error(`[weapons] ✗ ${cfg.id} ошибка:`, e.message || e);
    }
  }
  const ms = Math.round(performance.now() - t0);
  console.log(`[weapons] готово за ${ms} мс, моделей: ${weaponCache.size}`);
}

export function getWeaponModel(id) {
  return weaponCache.get(id) || null;
}

// Клонировать модель и прикрепить к анкору (например weaponAnchor в руке)
// opts:
//   scale — масштаб модели (подбирается визуально)
//   rotX, rotY, rotZ — поворот в радианах
//   posX, posY, posZ — позиция относительно анкора
export function attachWeaponModel(parent, model, opts = {}) {
  if (!model || !parent) return null;
  const inst = model.clone();
  inst.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  if (opts.scale !== undefined) inst.scale.setScalar(opts.scale);
  inst.rotation.set(opts.rotX || 0, opts.rotY || 0, opts.rotZ || 0);
  inst.position.set(opts.posX || 0, opts.posY || 0, opts.posZ || 0);
  parent.add(inst);
  return inst;
}