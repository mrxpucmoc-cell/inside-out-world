// Сохранение и загрузка. До 5 персонажей в localStorage.

const KEY_CHARS = 'inside_out_chars_v1';
const MAX_CHARS = 5;

export const saveSys = {
  MAX_CHARS,
};

export function loadChars() {
  try {
    const d = localStorage.getItem(KEY_CHARS);
    if (d) {
      const a = JSON.parse(d);
      if (Array.isArray(a)) return a;
    }
  } catch (e) {}
  return [];
}

export function saveChars(arr) {
  try { localStorage.setItem(KEY_CHARS, JSON.stringify(arr)); }
  catch (e) { console.warn('save failed', e); }
}

export function makeCharRecord(state) {
  return {
    id: 'char_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: state.character.name,
    class: state.character.class,
    level: state.level,
    appearance: {
      gender: state.character.gender,
      skin: state.character.skin,
      hair: state.character.hair,
      outfit: state.character.outfit,
      hairStyle: state.character.hairStyle,
      eyeColor: state.character.eyeColor,
      mouthStyle: state.character.mouthStyle,
      bodyType: state.character.bodyType,
      beard: state.character.beard,
    }
  };
}

export function applyCharToState(state, c) {
  state.character.name = c.name || 'Герой';
  state.character.class = c.class || 'rift';
  const a = c.appearance || {};
  for (const k of Object.keys(a)) {
    if (a[k] !== undefined) state.character[k] = a[k];
  }
}