// Константы. Локация: Побережье Костей.
// Карта ×2: 800 × 800 м, HALF = 400.

export const SKEL = {
  HIP_Y: 0.86, THIGH_LEN: 0.36, SHIN_LEN: 0.36,
  UPPER_ARM_LEN: 0.34, FOREARM_LEN: 0.34,
};

export const EQ_SLOTS = ['weapon','shield','helm','armor','pants','boots','gloves','earring'];

export const SLOT_NAMES = {
  weapon:'ПРАВАЯ', shield:'ЛЕВАЯ', helm:'ШЛЕМ', armor:'БРОНЯ',
  pants:'ШТАНЫ', boots:'САПОГИ', gloves:'ПЕРЧАТКИ', earring:'СЕРЬГИ',
};
export const SLOT_SHORT = {
  weapon:'ОРУЖ', shield:'ЩИТ', helm:'ШЛЕМ', armor:'БРОНЯ',
  pants:'ШТАНЫ', boots:'САПОГ', gloves:'ПЕРЧ', earring:'СЕРЬГ',
};

// 5 редкостей: белый / зелёный / синий / фиолетовый / оранжево-жёлтый
export const RAR_COLOR = {
  common:    '#1a1a1a',   // почти чёрный
  uncommon:  '#2a6b1a',   // тёмно-зелёный
  rare:      '#1a4a8a',   // тёмно-синий
  epic:      '#5a1a8a',   // тёмно-фиолетовый
  legendary: '#a86000',   // тёмно-янтарный
};
export const RAR_NAME = {
  common:    'Обычный',
  uncommon:  'Необычный',
  rare:      'Редкий',
  epic:      'Эпический',
  legendary: 'Легендарный',
};
export const STAT_NAMES = {
  str:'Сила', dex:'Ловкость', int:'Интеллект',
  vit:'Выносливость', wis:'Мудрость', luck:'Удача', mas:'Мастерство',
};
export const STAT_INFO = {
  str:  { name:'💪 СИЛА (СИЛ)',        desc:'+2% урона тяжёлым оружием, +0.5% урона ближнему бою, +3 HP.' },
  dex:  { name:'🏃 ЛОВКОСТЬ (ЛОВ)',    desc:'+2% урона лёгким оружием, +0.4% скорости атаки, +0.3% уклонения.' },
  int:  { name:'🧠 ИНТЕЛЛЕКТ (ИНТ)',   desc:'+2% урона магией, +5 маны, +0.5% силы эффектов посоха.' },
  vit:  { name:'❤️ ВЫНОСЛИВОСТЬ (ВЫН)',desc:'+5 HP, +0.3% сопротивления, +1 к грузоподъёмности инвентаря.' },
  wis:  { name:'🔮 МУДРОСТЬ (МДР)',    desc:'+3 маны, +0.3% регенерации, +0.4% к длительности баффов.' },
  luck: { name:'🍀 УДАЧА (УДЧ)',       desc:'+0.5% шанса крита, +0.4% к выпадению редких ресурсов.' },
  mas:  { name:'⚒️ МАСТЕРСТВО (МАС)', desc:'+0.4% к скорости крафта, +0.3% к прочности созданных предметов.' },
};

export const SKILL_INFO = {
  onehand: { name:'Одноручное',  icon:'⚔️', weapons:'мечи, секиры, кинжалы, булавы', desc:'Владение одноручным оружием.' },
  twohand: { name:'Двуручное',   icon:'🗡️', weapons:'двуручные мечи, секиры, булавы', desc:'Владение двуручным оружием.' },
  throwing:{ name:'Метательное', icon:'🎯', weapons:'метательные ножи, дротики, праща', desc:'Владение метательным.' },
  ranged:  { name:'Стрелковое',  icon:'🏹', weapons:'луки, арбалеты', desc:'Владение луками и арбалетами.' },
  magic:   { name:'Магическое',  icon:'🔮', weapons:'посохи, жезлы', desc:'Владение магическим оружием.' },
};

export const CLASS_STATS = {
  rift:  { hp:170, mp:40, dmg:[4,8], speed:0.72 },
  core:  { hp:170, mp:40, dmg:[4,8], speed:0.72 },
  frost: { hp:170, mp:40, dmg:[4,8], speed:0.72 },
};
export const RACE_ABILITIES = {
  rift:  { id:'dash',    name:'Рывок',     icon:'💨', cd:20, range:10, dmgMul:1.5 },
  core:  { id:'explode', name:'Взрыв',     icon:'💥', cd:25, radius:7,  dmgMul:1.0 },
  frost: { id:'freeze',  name:'Заморозка', icon:'❄️', cd:30, radius:8,  dmgMul:1.5, freezeTime:3 },
};

export const MOB_LEVEL = {
  zombie:1, skeleton:2, skeleton_archer:2,
  wolf:3, wraith:4, brute:6, bear:7, werewolf:10, golem:12, troll:15,
  crab:1, lizard_fire:2, goblin_scout:4, drowned:3,
};

// ============ РАЗМЕРЫ КАРТЫ ============
export const MAP = 800;
export const HALF = MAP / 2;              // = 400
export const WATER_LEVEL = 0;
export const CHUNK = 50;                  // 8×8 = 64 чанка

export const OCEAN_EDGE_X = -220;
export const BEACH_MAX_X  = -80;
export const PLAY_MAX_X   = 350;
export const PLAY_MIN_Z   = -350;
export const PLAY_MAX_Z   = 350;

export const VILLAGE = { x: -156, z: 40, r: 60 };
export const VILLAGE_FLAT_R = 75;
export const FENCE_R = 48;
export const GATE_ANGLES = [Math.PI/2, -Math.PI/2];
export const GATE_HALF = 0.34;

export const CAPE       = { x: 180,  z: -120, r: 55 };
export const BEACON_POS = { x: CAPE.x, z: CAPE.z };
export const QUARRY     = { x: 260,  z: -220, r: 45 };
export const CEMETERY   = { x: 80,   z: 0,    r: 60 };
export const ABANDONED  = { x: -160, z: -200, r: 55 };
export const SWAMP      = { x: -120, z: 300,  r: 25 };
export const VIY_HOUSE  = { x: 80,   z: -20 };
export const VIY_POS    = { x: 80,   z: -16 };

export const LILY_POS       = { x: -148, z: 36 };
export const GOLEM_POS      = { x: QUARRY.x, z: QUARRY.z };
export const APOTHECARY_POS = { x: VILLAGE.x, z: VILLAGE.z + 8 };
export const TELEPORT_POS   = { x: VILLAGE.x, z: VILLAGE.z + 40 };

export const COAST_WIDTH = 80;
export const SEA_EDGE_BASE = OCEAN_EDGE_X;