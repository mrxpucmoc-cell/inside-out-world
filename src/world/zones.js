// Менеджер зон: определяет, в какой зоне игрок, дёргает UI и ambient.

import { state } from '../core/state.js';

export const zoneManager = {
  zones: [],
  currentZone: null,
  onEnterZone: null,   // (zone) → UI: показать название
  teleportCooldown: 0,
};

export function loadZones(json) {
  zoneManager.zones = Object.entries(json).map(([id, z]) => ({ id, ...z }));
}

export function updateZones(playerPos, dt) {
  zoneManager.teleportCooldown = Math.max(0, zoneManager.teleportCooldown - dt);

  let entered = null;
  for (const zone of zoneManager.zones) {
    const d = Math.hypot(playerPos.x - zone.center.x, playerPos.z - zone.center.z);
    if (d < zone.radius) { entered = zone; break; }
  }

  if (entered && entered.id !== zoneManager.currentZone?.id) {
    zoneManager.currentZone = entered;
    zoneManager.onEnterZone?.(entered);
  } else if (!entered && zoneManager.currentZone?.id !== 'wild') {
    zoneManager.currentZone = { id: 'wild', name: 'Дикие земли' };
    zoneManager.onEnterZone?.(zoneManager.currentZone);
  }
}

export function isInVillage(x, z) {
  const v = zoneManager.zones.find(zn => zn.id === 'village');
  if (!v) return false;
  return Math.hypot(x - v.center.x, z - v.center.z) < v.radius;
}