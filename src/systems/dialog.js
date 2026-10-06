// Движок диалогов. Окно «Принять квест / Отказаться».

export class DialogEngine {
  constructor() {
    this.db = null;
    this.active = null;
    this.onRender = null;
    this.onClose = null;
    this.quest = null;
    this.state = null;
  }
  load(json) { this.db = json || {}; }

  start(treeName, npc) {
    const tree = this.db[treeName];
    if (!tree) { console.warn('[dialog] tree not found:', treeName); return; }
    this.active = { tree, nodeId: tree.start, npc };
    if (this.quest && npc) {
      const npcId = npc.dialogId || npc.type;
      try { this.quest.onTalk(npcId); } catch (e) {}
    }
    this.render();
  }

  render() {
    if (!this.active) return;
    const node = this.active.tree.nodes[this.active.nodeId];
    if (!node) { return this.close(); }

    if (node.nextWhen) {
      for (const rule of node.nextWhen) {
        if (this.evalCondition(rule.condition)) {
          this.active.nodeId = rule.next;
          return this.render();
        }
      }
    }

    if (node.onEnter) this.execActions(node.onEnter);

    const options = [];
    if (node.options) {
      for (const opt of node.options) {
        if (opt.condition && !this.evalCondition(opt.condition)) continue;
        options.push({ text: opt.text, action: () => this.pickOption(opt) });
      }
    }

    if (node.dynamicOptions && this.quest) {
      const giver = node.dynamicOptions.split(':')[1];
      const quests = this.quest.availableQuestsFor(giver);
      for (const q of quests) {
        options.push({ text: `📜 ${q.name}`, action: () => this.showQuestOffer(q.id) });
      }
      if (quests.length === 0 && node.fallback) {
        options.push({ text: node.fallback.text, action: () => this.pickOption(node.fallback) });
      }
    }

    if (options.length === 0 && node.next) {
      options.push({ text: 'Далее', action: () => {
        this.active.nodeId = node.next; this.render();
      }});
    }
    if (options.length === 0) {
      options.push({ text: 'Закрыть', action: () => this.close() });
    }

    const heroName = this.state?.character?.name || 'Герой';
    const displayText = (node.text || '').replace(/\$\{hero\}/g, heroName);

    if (this.onRender) {
      this.onRender({
        speaker: node.speaker || this.active.npc?.name || '???',
        text: displayText,
        options,
      });
    }
  }

  pickOption(opt) {
    if (!opt) return this.close();
    if (opt.action === 'close') return this.close();
    if (typeof opt.action === 'function') return opt.action();
    if (opt.next) { this.active.nodeId = opt.next; return this.render(); }
    this.close();
  }

  close() {
    this.active = null;
    if (this.onClose) this.onClose();
  }

  showQuestOffer(questId) {
    const q = this.quest?.db?.[questId];
    if (!q) return;
    const heroName = this.state?.character?.name || 'Герой';
    const rawDesc = q.description || q.stages?.[0]?.text || q.name;
    const desc = rawDesc.replace(/\$\{hero\}/g, heroName);
    const reward = this.formatReward(q.rewards);

    if (this.onRender) {
      this.onRender({
        speaker: this.active?.npc?.name || '???',
        text: `${desc}\n\n🎁 Награда: ${reward}`,
        options: [
          { text: '✔ Взять', action: () => {
              this.quest.offer(questId, this.active?.npc);
              this.close();
            } },
          { text: '✖ Отказаться', action: () => {
              this.quest.decline();
              this.close();
            } },
        ],
      });
    }
  }

  formatReward(r) {
    if (!r) return '—';
    const parts = [];
    if (r.gold) parts.push(`${r.gold}💰`);
    if (r.xp) parts.push(`${r.xp} XP`);
    if (r.items && r.items.length) {
      for (const it of r.items) {
        if (it.id) {
          const item = window.registry?.items?.[it.id];
          parts.push(item ? item.name + (it.count > 1 ? ` ×${it.count}` : '') : it.id);
        }
      }
    }
    return parts.length > 0 ? parts.join(' + ') : '—';
  }

  evalCondition(cond) {
    if (typeof cond !== 'string') return true;
    cond = cond.trim();
    if (cond.startsWith('!')) return !this.evalCondition(cond.slice(1));
    if (cond.startsWith('flag.')) return !!this.state?.flags?.[cond.slice(5)];
    if (cond.startsWith('quest.done:')) return this.quest?.isDone(cond.slice(11));
    if (cond.startsWith('quest.active:')) return this.quest?.isActive(cond.slice(13));
    const m = cond.match(/^level\s*(>=|<=|>|<|==)\s*(\d+)$/);
    if (m) {
      const lvl = this.state?.level || 1;
      const n = +m[2];
      switch (m[1]) {
        case '>=': return lvl >= n;
        case '<=': return lvl <= n;
        case '>':  return lvl > n;
        case '<':  return lvl < n;
        case '==': return lvl === n;
      }
    }
    return true;
  }

  execActions(actions) {
    for (const a of actions || []) {
      try {
        if (a.action === 'setFlag') {
          if (this.state?.setFlag) this.state.setFlag(a.flag, a.value);
        }
        if (a.action === 'unlockQuest' && this.quest) this.quest.unlock(a.quest);
        if (a.action === 'giveItem' && this.state?.addItem) this.state.addItem(a.item, a.count || 1);
        if (a.action === 'openShop') window.__openShop?.(a.tab || 'buy');
        if (a.action === 'openRepair') window.__openRepair?.();
        if (a.action === 'heal') window.__healPlayer?.();
      } catch (e) { console.warn('[dialog] action error:', a, e); }
    }
  }
}