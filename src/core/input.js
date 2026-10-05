// Единая система ввода. Джойстик слева, тапы справа.
// Внешние системы подписываются на колбэки.

export const input = {
  joystick: { active: false, id: null, dx: 0, dy: 0, startX: 0, startY: 0, maxDist: 55, dead: 6 },
  keys: {},
  attackHeld: false,
  attackHoldTime: 0,
  moveTarget: null,
  attackTarget: null,
  // Колбэки:
  onTap: null,          // (x, y) → world raycast
  onAbility: null,      // клик по 💨
  onAttackStart: null,
  onAttackEnd: null,
  onZoom: null,         // (delta)
  onUiBtn: null,        // (btnId)
};

let joyWrap, joyBase, joyKnob;

export function initInput(opts) {
  const canvas = opts.canvas;
  const ui = opts.ui || {};
  joyWrap = document.getElementById('joyWrap');
  joyBase = document.getElementById('joyBase');
  joyKnob = document.getElementById('joyKnob');

  const LEFT_ZONE = 0.5;

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * LEFT_ZONE && !input.joystick.active) {
        startJoystick(t);
      } else if (t.clientX >= innerWidth * LEFT_ZONE) {
        input.onTap?.(t.clientX, t.clientY);
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (input.joystick.active && t.identifier === input.joystick.id) {
        updateJoystick(t);
      }
    }
  }, { passive: false });

  const endTouch = e => {
    for (const t of e.changedTouches) {
      if (input.joystick.active && t.identifier === input.joystick.id) {
        endJoystick();
      }
    }
  };
  canvas.addEventListener('touchend', endTouch, { passive: false });
  canvas.addEventListener('touchcancel', endTouch, { passive: false });

  canvas.addEventListener('mousedown', e => {
    if ('ontouchstart' in window) return;
    if (e.button !== 0) return;
    input.onTap?.(e.clientX, e.clientY);
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Кнопка атаки
  const atk = document.getElementById('attackBtn');
  if (atk) {
    atk.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      input.attackHeld = true; input.onAttackStart?.();
      atk.classList.add('held');
    }, { passive: false });
    atk.addEventListener('touchend', e => {
      e.preventDefault(); e.stopPropagation();
      input.attackHeld = false; input.onAttackEnd?.();
      atk.classList.remove('held');
    }, { passive: false });
    atk.addEventListener('touchcancel', () => {
      input.attackHeld = false; input.onAttackEnd?.();
      atk.classList.remove('held');
    });
    atk.addEventListener('mousedown', e => {
      if ('ontouchstart' in window) return;
      input.attackHeld = true; input.onAttackStart?.();
      atk.classList.add('held');
    });
    atk.addEventListener('mouseup', () => {
      if ('ontouchstart' in window) return;
      input.attackHeld = false; input.onAttackEnd?.();
      atk.classList.remove('held');
    });
  }

  // UI-кнопки
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation(); fn();
    }, { passive: false });
    el.addEventListener('click', e => { e.stopPropagation(); fn(); });
  };

  Object.entries(ui).forEach(([id, fn]) => bind(id, fn));

  // Зум-кнопки
  bind('zoomIn',  () => input.onZoom?.(-0.15));
  bind('zoomOut', () => input.onZoom?.(0.15));

  // Клавиатура
  addEventListener('keydown', e => {
    input.keys[e.code] = true;
    if (e.code === 'Space') { input.attackHeld = true; input.onAttackStart?.(); }
    if (e.code === 'KeyE') input.onAbility?.();
    input.onUiBtn?.(e.code);
  });
  addEventListener('keyup', e => {
    input.keys[e.code] = false;
    if (e.code === 'Space') { input.attackHeld = false; input.onAttackEnd?.(); }
  });

  return input;
}

function startJoystick(t) {
  const j = input.joystick;
  j.active = true; j.id = t.identifier;
  j.startX = t.clientX; j.startY = t.clientY;
  j.dx = 0; j.dy = 0;
  if (joyWrap) joyWrap.style.display = 'block';
  if (joyBase) { joyBase.style.left = t.clientX + 'px'; joyBase.style.top = t.clientY + 'px'; }
  if (joyKnob) { joyKnob.style.left = t.clientX + 'px'; joyKnob.style.top = t.clientY + 'px'; }
  input.moveTarget = null;
  input.attackTarget = null;
}

function updateJoystick(t) {
  const j = input.joystick;
  let dx = t.clientX - j.startX;
  let dy = t.clientY - j.startY;
  const d = Math.hypot(dx, dy);
  let nx = dx, ny = dy;
  if (d > j.maxDist) { nx = dx / d * j.maxDist; ny = dy / d * j.maxDist; }
  if (joyKnob) {
    joyKnob.style.left = (j.startX + nx) + 'px';
    joyKnob.style.top  = (j.startY + ny) + 'px';
  }
  if (d < j.dead) { j.dx = 0; j.dy = 0; }
  else {
    const cl = Math.min(d, j.maxDist);
    const m = (cl - j.dead) / (j.maxDist - j.dead);
    j.dx = (dx / d) * m;
    j.dy = (dy / d) * m;
  }
}

function endJoystick() {
  const j = input.joystick;
  j.active = false; j.id = null;
  j.dx = 0; j.dy = 0;
  if (joyWrap) joyWrap.style.display = 'none';
}

// Читать направление движения из джойстика+клавиатуры
export function readMove() {
  let vx = 0, vz = 0;
  const k = input.keys;
  if (k['KeyW'] || k['ArrowUp'])    vz -= 1;
  if (k['KeyS'] || k['ArrowDown'])  vz += 1;
  if (k['KeyA'] || k['ArrowLeft'])  vx -= 1;
  if (k['KeyD'] || k['ArrowRight']) vx += 1;
  const j = input.joystick;
  if (j.active && (Math.abs(j.dx) > 0.05 || Math.abs(j.dy) > 0.05)) {
    vx = j.dx; vz = j.dy;
    input.moveTarget = null; input.attackTarget = null;
  }
  return { vx, vz };
}