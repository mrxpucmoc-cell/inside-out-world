// Загрузчик GLTF/GLB с поддержкой Draco-сжатия и кэшированием.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// Draco-декодер: подгружается с CDN, потому что локально его нет
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
dracoLoader.setDecoderConfig({ type: 'js' });   // js-декодер работает без WASM, чуть медленнее, но совместимее

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const cache = new Map();

export function loadGLTF(url) {
  if (cache.has(url)) return cache.get(url);
  const promise = new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf),
      undefined,
      (err) => reject(err)
    );
  });
  cache.set(url, promise);
  return promise;
}

// Клонирование skinned-модели — обычный .clone() ломает скелет.
export function cloneSkinned(source) {
  return skeletonClone(source);
}