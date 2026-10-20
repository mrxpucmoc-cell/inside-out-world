// Обёртка над загруженной GLB-моделью.
// - Клонирует скелет через SkeletonUtils
// - Конвертирует материалы в toon (под стиль игры)
// - Ищет bones и прокидывает их в userData под именами,
//   которые ждёт остальной код (pelvis, handR, headG, ...)
// - Создаёт AnimationMixer и карту actions
// - ФИКС: переписывает пути треков, убирая суффиксы _1, _2
//   (артефакт импорта анимаций Mixamo в Blender)

import * as THREE from 'three';
import { loadGLTF, cloneSkinned } from '../systems/gltfLoader.js';

// Возможные имена костей у разных ригов (Mixamo, Blender, Mixamo с префиксом)
const BONE_ALIASES = {
  pelvis:     ['mixamorig:Hips', 'mixamorigHips', 'Hips', 'hips', 'Pelvis', 'pelvis', 'Bip01_Pelvis', 'Root'],
  spineLower: ['mixamorig:Spine', 'mixamorigSpine', 'Spine', 'spine', 'Bip01_Spine'],
  spineUpper: ['mixamorig:Spine2', 'mixamorigSpine2', 'Spine2', 'Spine1', 'Chest', 'chest', 'Bip01_Spine1'],
  neck:       ['mixamorig:Neck', 'mixamorigNeck', 'Neck', 'neck', 'Bip01_Neck'],
  headG:      ['mixamorig:Head', 'mixamorigHead', 'Head', 'head', 'Bip01_Head'],
  handR:      ['mixamorig:RightHand', 'mixamorigRightHand', 'RightHand', 'hand_R', 'Hand_R', 'Bip01_R_Hand'],
  handL:      ['mixamorig:LeftHand', 'mixamorigLeftHand', 'LeftHand', 'hand_L', 'Hand_L', 'Bip01_L_Hand'],
  shoulderR:  ['mixamorig:RightShoulder', 'mixamorigRightShoulder', 'RightShoulder', 'Shoulder_R', 'Bip01_R_Clavicle'],
  shoulderL:  ['mixamorig:LeftShoulder', 'mixamorigLeftShoulder', 'LeftShoulder', 'Shoulder_L', 'Bip01_L_Clavicle'],
};

function findBone(root, aliases) {
  for (const alias of aliases) {
    let found = null;
    root.traverse(o => {
      if (found) return;
      if (o.isBone && o.name === alias) found = o;
    });
    if (found) return found;
  }
  for (const alias of aliases) {
    let found = null;
    root.traverse(o => {
      if (found) return;
      if (o.name === alias) found = o;
    });
    if (found) return found;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// ЖЁСТКОЕ ПЕРЕНАЗНАЧЕНИЕ АНИМАЦИЙ ПО ИМЕНИ
// Нужно, если в Blender/Mixamo имена клипов перепутаны или нестандартные.
// Ключ — точное имя клипа в файле (как выводит консоль).
// Значение — желаемый слот: 'idle' | 'walk' | 'run' | 'attack' | 'death' | ...
//
// Если null — используется автоматическое распознавание по подстроке.
// ═══════════════════════════════════════════════════════════
const CLIP_NAME_OVERRIDE = {
  // Из твоих логов: клипы перепутаны
  'Idle':     null,        // 0.07s, поза — пропустится по длительности
  'Idle.001': 'walk',      // 1.07s — это на самом деле ходьба
  'Walk':     'idle',      // 1.93s — это на самом деле покой
  'Attack':   'attack',    // 2.30s — верно
};

// Определяем тип анимации по имени (с учётом override)
function classifyAnimation(name) {
  // 1) Сначала смотрим override
  if (name in CLIP_NAME_OVERRIDE) {
    const forced = CLIP_NAME_OVERRIDE[name];
    if (forced !== null) return forced;
    // null → пропускаем override, идём в автоопределение
  }

  // 2) Автоматическое распознавание
  const n = (name || '').toLowerCase();
  if (n.includes('idle') || n.includes('stand') || n.includes('breath')) return 'idle';
  if (n.includes('walk')) return 'walk';
  if (n.includes('run') || n.includes('sprint') || n.includes('jog')) return 'run';
  if (n.includes('attack') || n.includes('slash') || n.includes('punch') || n.includes('sword') || n.includes('hit')) return 'attack';
  if (n.includes('die') || n.includes('death') || n.includes('dead')) return 'death';
  if (n.includes('hurt') || n.includes('damage') || n.includes('receive')) return 'hurt';
  if (n.includes('cast') || n.includes('spell') || n.includes('magic')) return 'cast';
  if (n.includes('jump')) return 'jump';
  return null;
}
// ═══════════════════════════════════════════════════════════
// ФИКС: переписывает пути треков под реальные имена костей в клоне.
// Проблема: анимации из Mixamo импортируются в Blender, и там
// появляются дубли костей с суффиксами _1, _2, _3. При экспорте
// в GLB треки ссылаются на mixamorigHips_1, а меш модели привязан
// к mixamorigHips. Поэтому mixer двигает "пустые" кости, а модель
// стоит в T-позе. Функция переписывает пути треков, убирая суффиксы.
// ═══════════════════════════════════════════════════════════
function fixTrackPaths(clip, root) {
  // Собираем все реальные имена костей
  const realNames = new Set();
  const meshBoneNames = new Set();   // кости, к которым привязан меш

  root.traverse(o => {
    if (o.name) realNames.add(o.name);
    if (o.isSkinnedMesh && o.skeleton && o.skeleton.bones) {
      for (const b of o.skeleton.bones) {
        if (b.name) meshBoneNames.add(b.name);
      }
    }
  });

  let fixedCount = 0;

  const newTracks = clip.tracks.map(track => {
    const path = track.name;
    const lastDot = path.lastIndexOf('.');
    if (lastDot < 0) return track;

    const bonePath = path.slice(0, lastDot);
    const prop = path.slice(lastDot);

    // Уже совпадает с костью меша — не трогаем
    if (meshBoneNames.has(bonePath)) return track;

    // Кандидаты в порядке приоритета
    const candidates = [
      bonePath.replace(/_\d+$/, ''),                     // "mixamorigHips_1" → "mixamorigHips"
      bonePath.replace(/_\d+_/g, '_'),                   // "Foo_1_Bar" → "Foo_Bar"
      bonePath.replace(/_\d+/g, ''),                     // все _N
      bonePath.split('/').pop().replace(/_\d+$/, ''),    // "Armature/mixamorigHips_1"
      bonePath.split('/').pop().replace(/_\d+/g, ''),
    ];

    for (const c of candidates) {
      if (!c) continue;
      if (meshBoneNames.has(c)) {
        track.name = c + prop;
        fixedCount++;
        return track;
      }
      if (realNames.has(c)) {
        track.name = c + prop;
        fixedCount++;
        return track;
      }
    }

    return track;
  });

  clip.tracks = newTracks;
  console.log(`[fixTrack] клип "${clip.name}": исправлено ${fixedCount} из ${clip.tracks.length} треков`);
  return clip;
}

// ═══════════════════════════════════════════════════════════
// РУЧНОЙ МАППИНГ Mixamo-анимаций (fallback)
// Используется только если имя клипа не распознано и не равно "mixamo.com.XXX".
// Для стандартных клипов "Idle", "Walk", "Attack" сработает автораспознавание.
// ═══════════════════════════════════════════════════════════
const MANUAL_CLIP_ORDER = [
  'idle',
  'walk',
  'run',
  'attack',
  'attack',
  'idle',
  'death',
];

export async function createGLTFCharacter(url, opts = {}) {
  const gltf = await loadGLTF(url);
  const root = cloneSkinned(gltf.scene);

  // Масштаб и поворот
  const scale = opts.scale ?? 1;
  root.scale.setScalar(scale);
  if (opts.rotationY !== undefined) root.rotation.y = opts.rotationY;
  if (opts.positionY !== undefined) root.position.y = opts.positionY;

  // Проходим по всем мешам: тени, фрустум-куллинг, материалы
  const matCache = new Map();
  root.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;

      if (opts.toon !== false && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const newMats = mats.map(m => {
          if (matCache.has(m)) return matCache.get(m);
          const toonMat = new THREE.MeshToonMaterial({
            color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
            map: m.map || null,
            gradientMap: opts.gradientMap || null,
          });
          matCache.set(m, toonMat);
          return toonMat;
        });
        o.material = Array.isArray(o.material) ? newMats : newMats[0];
      }
    }
  });

  // === ДИАГНОСТИКА: реальные кости в клоне ===
  const realBones = [];
  root.traverse(o => {
    if (o.isBone || o.type === 'Bone') realBones.push(o.name);
  });
  console.log('[diag] РЕАЛЬНЫХ костей в клоне:', realBones.length);
  console.log('[diag] Первые 15 имён:', realBones.slice(0, 15));

  // Ищем кости и прокидываем их в userData
  const bones = {};
  for (const [key, aliases] of Object.entries(BONE_ALIASES)) {
    const bone = findBone(root, aliases);
    if (bone) {
      bones[key] = bone;
      root.userData[key] = bone;
    }
  }
  root.userData.bones = bones;
  root.userData.isGLTF = true;

  console.log('[gltf] найденные кости:', Object.keys(bones));
  if (!bones.handR) console.warn('[gltf] ВНИМАНИЕ: не найдена кость правой руки (handR)');
  if (!bones.handL) console.warn('[gltf] ВНИМАНИЕ: не найдена кость левой руки (handL)');

  // === Анимации ===
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};

  if (gltf.animations && gltf.animations.length) {
    console.log('[gltf] анимаций в файле:', gltf.animations.length);

    gltf.animations.forEach((clip, i) => {
      const dur = clip.duration.toFixed(2);
      const tracks = clip.tracks.length;
      console.log(`[gltf] clip #${i} "${clip.name}" — ${dur}s, ${tracks} треков`);

      // Пропускаем мусорные клипы-позы (< 0.3 сек)
      if (clip.duration < 0.3) {
        console.log(`[gltf]   → пропущен (слишком короткий, это поза, а не анимация)`);
        return;
      }

      // 1) Пробуем распознать по имени
      let key = classifyAnimation(clip.name);

      // 2) Если имя "mixamo.com.XXX" — берём из ручного маппинга по индексу
      if (!key && i < MANUAL_CLIP_ORDER.length) {
        key = MANUAL_CLIP_ORDER[i];
        console.log(`[gltf]   → "${key}" (ручной маппинг #${i})`);
      } else if (key) {
        console.log(`[gltf]   → "${key}" (по имени)`);
      } else {
        console.warn(`[gltf]   → пропущен (нет в маппинге)`);
        return;
      }

      // Не перезаписываем уже занятый слот
      if (actions[key]) {
        console.log(`[gltf]   → слот "${key}" уже занят, пропускаю`);
        return;
      }

      // ФИКС: переписываем пути треков (убираем _1, _2 от импорта в Blender)
      const fixedClip = fixTrackPaths(clip, root);
      actions[key] = mixer.clipAction(fixedClip);
    });
  }

  root.userData.mixer = mixer;
  root.userData.actions = actions;
  root.userData.currentAction = null;
  root.userData.currentMode = null;

  // Если нет idle, но есть другие анимации — берём первую как idle
  if (!actions.idle && Object.keys(actions).length > 0) {
    const firstName = Object.keys(actions)[0];
    actions.idle = actions[firstName];
    console.log(`[gltf] нет idle, использую "${firstName}" как idle`);
  }

  console.log('[gltf] готовые слоты анимаций:', Object.keys(actions));

  // === ДИАГНОСТИКА: как выглядят треки после фикса ===
  const idleAction = actions.idle;
  if (idleAction && idleAction.getClip()) {
    const testTracks = idleAction.getClip().tracks;
    console.log('[diag] idle после фикса, первые 5 путей:',
      testTracks.slice(0, 5).map(t => t.name));
  }

  return root;
}

// Плавное переключение между анимациями
// opts.restart  — перезапустить клип с начала, даже если режим тот же
// opts.timeScale — скорость проигрывания (1 = обычная, 2 = в 2 раза быстрее)
export function setGLTFMode(root, mode, opts = {}) {
  const actions = root.userData.actions;
  if (!actions || !actions[mode]) {
    // Fallback-цепочка
    if (mode === 'run' && actions?.walk) mode = 'walk';
    else if (mode === 'walk' && actions?.idle) mode = 'idle';
    else if (mode === 'attack' && actions?.idle) mode = 'idle';
    else if (mode === 'cast' && actions?.attack) mode = 'attack';
    else if (mode === 'hurt' && actions?.idle) mode = 'idle';
    else if (mode === 'death' && actions?.idle) mode = 'idle';
    else if (actions?.idle) mode = 'idle';
    else return;
  }

  const action = actions[mode];
  const current = root.userData.currentAction;

  // Режим тот же и не просят перезапустить — только обновляем timeScale
  if (root.userData.currentMode === mode && !opts.restart) {
    if (opts.timeScale !== undefined && current) {
      current.setEffectiveTimeScale(opts.timeScale);
    }
    return;
  }

  const fadeDur = opts.fade ?? 0.2;

  // Всегда сбрасываем — иначе клип продолжит с середины при restart
  action.reset();
  action.setEffectiveTimeScale(opts.timeScale ?? 1);
  action.setEffectiveWeight(1);

  if (mode === 'attack' || mode === 'hurt' || mode === 'death' || mode === 'jump') {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  } else {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  }

  if (current && current !== action) {
    current.fadeOut(fadeDur);
    action.fadeIn(fadeDur).play();
  } else {
    action.play();
  }

  root.userData.currentAction = action;
  root.userData.currentMode = mode;
}

// Обновление микшера — вызывать каждый кадр
export function updateGLTFCharacter(root, dt) {
  const mixer = root.userData.mixer;
  if (mixer) mixer.update(dt);
}

// Смерть
export function setGLTFDeath(root) {
  setGLTFMode(root, 'death');
}