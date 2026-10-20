// Загрузчик 3D-зданий. Асинхронно грузит GLB, готовит модели для расстановки.
// Использование:
//   1. await preloadBuildings() — до generateWorld()
//   2. getBuildingModel('house_22') — синхронно достать заготовку
//   3. placeBuilding(model, x, y, z, rotY, scale) — клонировать и поставить

import * as THREE from 'three';
import { loadGLTF } from './gltfLoader.js';

// Реестр загруженных моделей: id → THREE.Group (заготовка)
const buildingCache = new Map();

// Список моделей, которые нужно загрузить заранее
const BUILDINGS_TO_LOAD = [
  { id: 'house_21', url: 'assets/models/buildings/house_21.glb' },
  { id: 'house_22', url: 'assets/models/buildings/house_22.glb' },
];

// Подготовка модели: тени, корректные параметры PBR-материалов.
// ВАЖНО: НЕ конвертируем в toon — чтобы не терять цвета текстур.
// Металличность 1.0 делает модель чёрной без окружения, поэтому
// принудительно ставим metalness=0, roughness=0.85.
function prepareModel(root) {
  root.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.receiveShadow = true;

      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        // Убираем зеркальность — иначе модель выглядит чёрной
        if (m.metalness !== undefined) m.metalness = 0.0;
        if (m.roughness !== undefined) m.roughness = 0.85;
        // Правильное цветовое пространство текстуры (иначе тёмная)
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      }
    }
  });
}

// Главная функция: загрузить все здания
export async function preloadBuildings() {
  console.log('[buildings] начинаю предзагрузку...');
  const t0 = performance.now();

  for (const cfg of BUILDINGS_TO_LOAD) {
    try {
      const gltf = await loadGLTF(cfg.url);
      const model = gltf.scene;
model.traverse(o => {
  if (o.isMesh && o.material) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    }
  }
});
model.updateMatrixWorld(true);
      prepareModel(model);
      model.updateMatrixWorld(true);
      buildingCache.set(cfg.id, model);
      console.log(`[buildings] ✓ ${cfg.id} загружен`);
    } catch (e) {
      console.error(`[buildings] ✗ ${cfg.id} ошибка:`, e.message || e);
    }
  }

  const ms = Math.round(performance.now() - t0);
  console.log(`[buildings] готово за ${ms} мс, моделей: ${buildingCache.size}`);
}

// Синхронно достать готовую модель
export function getBuildingModel(id) {
  return buildingCache.get(id) || null;
}

// Клонировать и разместить модель в сцене
// parent — куда добавить (обычно decor.group)
// model  — заготовка из getBuildingModel()
// x,y,z  — координаты
// rotY   — поворот вокруг вертикальной оси (радианы)
// scale  — масштаб
// opts.offsetY — доп. смещение по Y (если модель парит/утопает)
export function placeBuilding(parent, model, x, y, z, rotY = 0, scale = 1, opts = {}) {
  if (!model) {
    console.warn('[buildings] placeBuilding: модель не найдена');
    return null;
  }
  const inst = model.clone();
  inst.position.set(x, y + (opts.offsetY || 0), z);
  inst.rotation.y = rotY;
  inst.scale.setScalar(scale);
  inst.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  parent.add(inst);
  return inst;
}