// Движок квестов. Принять/отказаться, обязательная сдача.

export class QuestEngine {
  constructor() {
    this.db = null;
    this.active = {};
    this.done = {};
    this.unlocked = {};
    this.onProgress = null;
    this.onComplete = null;
    this.dialog = null;
    this.state = null;
  }

  load(json) { this.db = json || {}; }

  availableQuestsFor(npcType) {
    const out = [];
    for (const [id, q] of Object.entries(this.db)) {
      if (q.giver !== npcType) continue;
      if (this.active[id] || this.done[id]) continue;
      if (q.unlocked && !this.unlocked[id]) continue;
      if (!this.checkPrereqs(q.prerequisites)) continue;
      out.push({ id, name: q.name });
    }
    return out;
  }

  checkPrereqs(prereq) {
    if (!prereq) return true;
    if (prereq.level && (this.state?.level || 1) < prereq.level) return false;
    if (prereq.quests) {
      for (const qid of prereq.quests) if (!this.done[qid]) return false;
    }
    if (prereq.flags) {
      for (const [k, v] of Object.entries(prereq.flags)) {
        if (this.state?.flags?.[k] !== v) return false;
      }
    }
    return true;
  }

  offer(questId, npc) {
    if (this.active[questId] || this.done[questId]) return;
    const q = this.db[questId];
    if (!q) return;
    this.active[questId] = {
      stageIdx: 0,
      progress: q.stages[0].objectives.map(() => 0),
    };
    this.onProgress?.(questId, 'accepted');
    this.dialog?.close();
    window.dispatchEvent(new CustomEvent('quest:accepted', { detail: { id: questId, name: q.name } }));
  }

  decline() {
    this.dialog?.close();
  }

  unlock(questId) { this.unlocked[questId] = true; }
  isDone(questId) { return !!this.done[questId]; }
  isActive(questId) { return !!this.active[questId]; }

  onKill(mobType) {
    for (const [qid, st] of Object.entries(this.active)) {
      const q = this.db[qid];
      const stage = q.stages[st.stageIdx];
      if (!stage) continue;
      stage.objectives.forEach((obj, i) => {
        if (obj.type === 'kill' && this.matchTarget(obj.target, mobType)) {
          st.progress[i] = (st.progress[i] || 0) + 1;
          this.checkStageComplete(qid, st);
        }
      });
    }
  }

  onTalk(npcType) {
    for (const [qid, st] of Object.entries(this.active)) {
      const q = this.db[qid];
      const stage = q.stages[st.stageIdx];
      if (!stage) continue;
      stage.objectives.forEach((obj, i) => {
        if (obj.type === 'talk' && obj.target === npcType) {
          st.progress[i] = (st.progress[i] || 0) + 1;
          this.checkStageComplete(qid, st);
        }
      });
    }
  }

  onPickup(itemId, count = 1) {
    for (const [qid, st] of Object.entries(this.active)) {
      const q = this.db[qid];
      const stage = q.stages[st.stageIdx];
      if (!stage) continue;
      stage.objectives.forEach((obj, i) => {
        if (obj.type === 'collect' && obj.target === itemId) {
          st.progress[i] = Math.min(obj.count, (st.progress[i] || 0) + count);
          this.checkStageComplete(qid, st);
        }
      });
    }
  }

  onReach(zoneId) {
    for (const [qid, st] of Object.entries(this.active)) {
      const q = this.db[qid];
      const stage = q.stages[st.stageIdx];
      if (!stage) continue;
      stage.objectives.forEach((obj, i) => {
        if (obj.type === 'reach' && obj.target === zoneId) {
          st.progress[i] = 1;
          this.checkStageComplete(qid, st);
        }
      });
    }
  }

  matchTarget(target, mobType) {
    if (Array.isArray(target)) return target.includes(mobType);
    return target === mobType;
  }

  checkStageComplete(qid, st) {
    const q = this.db[qid];
    const stage = q.stages[st.stageIdx];
    if (!stage) return;
    const ok = stage.objectives.every((obj, i) => (st.progress[i] || 0) >= obj.count);
    if (!ok) return;

    if (stage.onComplete?.advanceTo) {
      const nextIdx = q.stages.findIndex(s => s.id === stage.onComplete.advanceTo);
      if (nextIdx < 0) return;
      st.stageIdx = nextIdx;
      st.progress = q.stages[nextIdx].objectives.map(() => 0);
      this.onProgress?.(qid, 'stageAdvance');
      return;
    }
    if (stage.onComplete?.finish) this.finish(qid);
  }

  finish(qid) {
    const q = this.db[qid];
    if (!q) return;
    const r = q.rewards || {};

    if (r.gold && this.state?.addGold) this.state.addGold(r.gold);
    if (r.xp && this.state?.addXP) this.state.addXP(r.xp);
    if (r.items && this.state?.addItem) {
      for (const it of r.items) {
        if (it.id) this.state.addItem(it.id, it.count || 1);
      }
    }
    for (const a of q.onFinish || []) {
      if (a.action === 'setFlag' && this.state?.setFlag) {
        this.state.setFlag(a.flag, a.value);
      }
    }
    this.done[qid] = true;
    delete this.active[qid];
    this.onComplete?.(qid, q);
    this.onProgress?.(qid, 'complete');
    window.dispatchEvent(new CustomEvent('quest:completed', { detail: { id: qid, name: q.name } }));
  }

  listActive() {
    const out = [];
    for (const [qid, st] of Object.entries(this.active)) {
      const q = this.db[qid];
      const stage = q.stages[st.stageIdx];
      if (!stage) continue;
      const heroName = this.state?.character?.name || 'Герой';
      const stageText = (stage.text || '').replace(/\$\{hero\}/g, heroName);
      const progress = stage.objectives.map((o, i) => {
        const cur = st.progress[i] || 0;
        const max = o.count;
        if (max <= 1) return '';
        return `${cur}/${max}`;
      }).filter(Boolean).join(' · ');
      out.push({ id: qid, name: q.name, stage: stageText, progress });
    }
    return out;
  }

  listDone() {
    const out = [];
    for (const [qid, q] of Object.entries(this.db)) {
      if (!this.done[qid]) continue;
      out.push({ id: qid, name: q.name, stage: '✅ Завершён', progress: '', completed: true });
    }
    return out;
  }
}