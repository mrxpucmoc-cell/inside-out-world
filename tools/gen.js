// node tools/gen.js > data/items.json
// node tools/gen.js --mobs > data/mobs.json
// node tools/gen.js --quests > data/quests.json

const MATERIALS = {
  rusty:    { lvl: 1,  mult: 0.6, color: 0xb8a888, name: 'Ржавый' },
  iron:     { lvl: 4,  mult: 1.0, color: 0xe8e0d0, name: 'Железный' },
  steel:    { lvl: 8,  mult: 1.4, color: 0xd0d8e0, name: 'Стальной' },
  silver:   { lvl: 12, mult: 1.8, color: 0xf0f0f8, name: 'Серебряный' },
  mithril:  { lvl: 18, mult: 2.4, color: 0x88c8e0, name: 'Мифриловый' },
  obsidian: { lvl: 24, mult: 3.0, color: 0x2a2a3a, name: 'Обсидиановый' },
  flame:    { lvl: 30, mult: 3.6, color: 0xe87040, name: 'Пламенный' },
  frost:    { lvl: 30, mult: 3.6, color: 0xa8d8f0, name: 'Ледяной' },
  shadow:   { lvl: 36, mult: 4.2, color: 0x3a2a48, name: 'Теневой' },
};

const RARITY = {
  common:    { mult: 1.0, suffix: '' },
  rare:      { mult: 1.5, suffix: ' редкий' },
  unique:    { mult: 2.2, suffix: ' уникальный' },
  legendary: { mult: 3.5, suffix: ' легендарный' },
};

const WEAPONS = {
  sword:   { name: 'меч',       dmg: [4, 8],  speed: 0.62, range: 0.4,  icon: '⚔️', stat: 'str' },
  axe:     { name: 'топор',     dmg: [6, 11], speed: 0.9,  range: 0.6,  icon: '🪓', stat: 'str', twoHanded: true },
  mace:    { name: 'булава',    dmg: [5, 10], speed: 0.85, range: 0.5,  icon: '🔨', stat: 'str', twoHanded: true },
  dagger:  { name: 'кинжал',    dmg: [3, 6],  speed: 0.4,  range: 0.3,  icon: '🗡️', stat: 'dex' },
  bow:     { name: 'лук',       dmg: [3, 7],  speed: 0.6,  range: 6.0,  icon: '🏹', stat: 'dex', twoHanded: true, ranged: 'arrow' },
  staff:   { name: 'посох',     dmg: [3, 6],  speed: 0.68, range: 6.0,  icon: '🪄', stat: 'int', twoHanded: true, ranged: 'fire' },
  spear:   { name: 'копьё',     dmg: [5, 9],  speed: 0.7,  range: 0.7,  icon: '🗡️', stat: 'str' },
  halberd: { name: 'алебарда',  dmg: [7, 12], speed: 0.95, range: 0.8,  icon: '⚔️', stat: 'str', twoHanded: true },
  scythe:  { name: 'коса',      dmg: [8, 13], speed: 1.0,  range: 0.65, icon: '⚔️', stat: 'str', twoHanded: true },
};

function makeWeapon(kind, mat, rar) {
  const w = WEAPONS[kind];
  const m = MATERIALS[mat];
  const r = RARITY[rar];
  const id = `${kind}_${mat}_${rar}`;
  const dmg = [
    Math.round(w.dmg[0] * m.mult * r.mult),
    Math.round(w.dmg[1] * m.mult * r.mult),
  ];
  const stats = {};
  if (rar !== 'common') stats[w.stat] = Math.floor(r.mult * 2);
  return {
    id,
    name: `${m.name} ${w.name}`,
    type: 'weapon',
    slot: 'weapon',
    kind,
    twoHanded: w.twoHanded || false,
    ranged: w.ranged,
    dmg,
    speed: w.speed,
    range: w.range,
    len: 0.85,
    visual: { blade: '0x' + m.color.toString(16), hilt: '0x5a4a38' },
    stats,
    icon: w.icon,
    rar,
    lvl: m.lvl,
    price: Math.round(20 * m.mult * r.mult * (1 + dmg[1] * 0.1)),
  };
}

function* generateWeapons() {
  for (const kind of Object.keys(WEAPONS)) {
    for (const mat of Object.keys(MATERIALS)) {
      for (const rar of Object.keys(RARITY)) {
        if (rar === 'legendary' && mat === 'rusty') continue;
        if (rar === 'common' && mat !== 'rusty' && mat !== 'iron') continue;
        yield makeWeapon(kind, mat, rar);
      }
    }
  }
}

// Армор
const ARMOR_SLOTS = {
  helm:   { name: 'шлем',      def: 3 },
  armor:  { name: 'доспех',    def: 5 },
  pants:  { name: 'штаны',     def: 3 },
  boots:  { name: 'сапоги',    def: 2 },
  gloves: { name: 'перчатки',  def: 2 },
  shield: { name: 'щит',       def: 4 },
  ring:   { name: 'кольцо',    def: 1 },
  earring:{ name: 'серьга',    def: 1 },
};

function makeArmor(slot, mat, rar) {
  const a = ARMOR_SLOTS[slot];
  const m = MATERIALS[mat];
  const r = RARITY[rar];
  const id = `${slot}_${mat}_${rar}`;
  const def = Math.round(a.def * m.mult * r.mult);
  const stats = {};
  if (rar !== 'common') stats.int = Math.floor(r.mult * 1.5);
  return {
    id,
    name: `${m.name} ${a.name}`,
    type: slot === 'ring' || slot === 'earring' ? 'accessory' : slot,
    slot,
    def,
    color: '0x' + m.color.toString(16),
    stats,
    icon: slot === 'helm' ? '⛑️' :
          slot === 'armor' ? '🧥' :
          slot === 'pants' ? '👖' :
          slot === 'boots' ? '🥾' :
          slot === 'gloves' ? '🧤' :
          slot === 'shield' ? '🛡️' :
          slot === 'ring' ? '💍' : '📿',
    rar,
    lvl: m.lvl,
    price: Math.round(15 * m.mult * r.mult),
  };
}

function* generateArmor() {
  for (const slot of Object.keys(ARMOR_SLOTS)) {
    for (const mat of Object.keys(MATERIALS)) {
      for (const rar of Object.keys(RARITY)) {
        if (rar === 'legendary' && mat === 'rusty') continue;
        if (rar === 'common' && mat !== 'rusty' && mat !== 'iron') continue;
        yield makeArmor(slot, mat, rar);
      }
    }
  }
}

// Потионы
const POTION_EFFECTS = {
  hp:  { kind: 'heal', name: 'здоровья', icon: '🧪' },
  mp:  { kind: 'mana', name: 'маны',     icon: '⚗️' },
  str: { kind: 'buff', name: 'силы',     icon: '💪', stat: 'str' },
  dex: { kind: 'buff', name: 'ловкости', icon: '🏃', stat: 'dex' },
  int: { kind: 'buff', name: 'интеллекта', icon: '🧠', stat: 'int' },
};

const POTION_TIERS = [
  { id: 'weak',   name: 'слабое',  lvl: 1,  value: 20 },
  { id: 'base',   name: '',        lvl: 3,  value: 50 },
  { id: 'strong', name: 'сильное', lvl: 8,  value: 120 },
  { id: 'great',  name: 'великое', lvl: 16, value: 250 },
  { id: 'epic',   name: 'эпическое', lvl: 24, value: 500 },
];

function* generatePotions() {
  for (const eff of Object.keys(POTION_EFFECTS)) {
    const e = POTION_EFFECTS[eff];
    for (const t of POTION_TIERS) {
      const id = `${eff}_potion_${t.id}`;
      const value = t.value;
      yield {
        id,
        name: `Зелье ${e.name} ${t.name}`.trim(),
        type: 'potion',
        effects: [{ kind: e.kind, value, stat: e.stat }],
        [e.kind === 'heal' ? 'heal' : e.kind === 'mana' ? 'mana' : 'buff']: value,
        icon: e.icon,
        rar: t.id === 'epic' ? 'unique' : t.id === 'great' ? 'rare' : 'common',
        lvl: t.lvl,
        price: Math.round(value * 0.5),
      };
    }
  }
}

// === Сборка ===
function build() {
  const out = {};
  for (const w of generateWeapons()) out[w.id] = w;
  for (const a of generateArmor()) out[a.id] = a;
  for (const p of generatePotions()) out[p.id] = p;
  return out;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const json = build();
  process.stdout.write(JSON.stringify(json, null, 2));
}

module.exports = { build, generateWeapons, generateArmor, generatePotions };