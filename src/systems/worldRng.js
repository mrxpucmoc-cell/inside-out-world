// Детерминированный RNG. Все клиенты с одинаковым seed получат
// одинаковые позиции мобов, декор, NPC.

export const WORLD_SEED = 20241007;

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Подменяет Math.random на время синхронного вызова fn.
export function withSeededRandom(seed, fn) {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try { fn(); }
  finally { Math.random = orig; }
}