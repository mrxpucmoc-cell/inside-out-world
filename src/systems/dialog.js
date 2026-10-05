// Движок диалогов на основе графа узлов из JSON.
// Поддерживает: ${hero}, nextWhen, dynamicOptions, ! в условиях,
// промежуточное окно "Принять квест" с описанием и наградой.

export class DialogEngine {
  constructor() {
    this.db = null;
    this.active = null;
    this.onRender = null;
    this.onClose = null;
    this.quest = null;
    this.state = null;
  }

  load(json) {
    this.db = json || {};
  }

  start(treeName, npc) {
    const tree = this.db[treeName];
    if (!tree) {
      console.warn('[dialog] tree not found:', treeName);
      return;
    }
    this.active = { tree, nodeId: tree.start, npc };

    // Засчитываем квест-цель "поговорить с этим NPC"
    if (this.quest && npc) {
      const npcId = npc.dialogId || npc.type;
      try {
        this.quest.onTalk(npcId);
      } catch (e) {
        console.warn('[dialog] quest.onTalk failed:', e);
      }
    }

    this.render();
  }

  render() {
    if (!this.active) return;
    const node = this.active.tree.nodes[this.active.nodeId];
    if (!node) {
      console.warn('[dialog] node not found:', this.active.nodeId);
      return this.close();
    }

    // Условный авто-переход
    if (node.nextWhen) {
      for (const rule of node.nextWhen) {
        if (this.evalCondition(rule.condition)) {
          this.active.nodeId = rule.next;
          return this.render();
        }
      }
    }

    // Действия при входе в узел
    if (node.onEnter) this.execActions(node.onEnter);

    const options = [];

    // Обычные опции
    if (node.options) {
      for (const opt of node.options) {
        if (opt.condition && !this.evalCondition(opt.condition)) continue;
        options.push({
          text: opt.text,
          action: () => this.pickOption(opt),
        });
      }
    }

    // Динамические квесты от этого NPC
    if (node.dynamicOptions && this.quest) {
      const giver = node.dynamicOptions.split(':')[1];
      const quests = this.quest.availableQuestsFor(giver);
      for (const q of quests) {
        options.push({
          text: `📜 ${q.name}`,
          action: () => this.showQuestOffer(q.id),
        });
      }
      if (quests.length === 0 && node.fallback) {
        options.push({
          text: node.fallback.text,
          action: () => this.pickOption(node.fallback),
        });
      }
    }

    // Авто-переход "Далее"
    if (options.length === 0 && node.next) {
      options.push({
        text: 'Далее',
        action: () => {
          this.active.nodeId = node.next;
          this.render();
        },
      });
    }
    if (options.length === 0) {
      options.push({ text: 'Закрыть', action: () => this.close() });
    }

    // Подставить имя героя в текст
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

    // Действия
    if (opt.action === 'close') return this.close();
    if (typeof opt.action === 'function') return opt.action();

    // Переход по next
    if (opt.next) {
      this.active.nodeId = opt.next;
      return this.render();
    }

    this.close();
  }

  close() {
    this.active = null;
    if (this.onClose) this.onClose();
  }

  // === Промежуточное окно "Принять квест" ===
  showQuestOffer(questId) {
    const q = this.quest?.db?.[questId];
    if (!q) {
      console.warn('[dialog] quest not found:', questId);
      return;
    }

    const heroName = this.state?.character?.name || 'Герой';
    const rawDesc = q.description
      || q.stages?.[0]?.text
      || q.name;
    const desc = rawDesc.replace(/\$\{hero\}/g, heroName);
    const reward = this.formatReward(q.rewards);

    if (this.onRender) {
      this.onRender({
        speaker: this.active?.npc?.name || '???',
        text: `${desc}\n\n🎁 Награда: ${reward}`,
        options: [
          {
            text: '✔ Принять',
            action: () => {
              this.quest.offer(questId, this.active?.npc);
              this.close();
            },
          },
          {
            text: '↩ Назад',
            action: () => this.render(),
          },
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
          parts.push(item ? item.name : it.id);
        } else if (it.rarity) {
          const rarName = {
            common: 'обычный предмет',
            rare: 'редкий предмет',
            unique: 'уникальный предмет',
            legendary: 'легендарный предмет',
          }[it.rarity] || it.rarity;
          parts.push(rarName);
        }
      }
    }
    return parts.length > 0 ? parts.join(' + ') : '—';
  }

  // === Условия ===
  evalCondition(cond) {
    if (typeof cond !== 'string') return true;
    cond = cond.trim();

    // Отрицание
    if (cond.startsWith('!')) {
      return !this.evalCondition(cond.slice(1));
    }

    if (cond.startsWith('flag.')) {
      return !!this.state?.flags?.[cond.slice(5)];
    }
    if (cond.startsWith('quest.done:')) {
      return this.quest?.isDone(cond.slice(11));
    }
    if (cond.startsWith('quest.active:')) {
      return this.quest?.isActive(cond.slice(13));
    }

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

  // === Действия ===
  execActions(actions) {
    for (const a of actions || []) {
      try {
        if (a.action === 'setFlag') {
          if (this.state?.setFlag) this.state.setFlag(a.flag, a.value);
          else if (this.state?.flags) {
            this.state.flags[a.flag] = a.value;
            window.dispatchEvent(new CustomEvent('flag:changed', {
              detail: { key: a.flag, value: a.value },
            }));
          }
        }
        if (a.action === 'unlockQuest' && this.quest) {
          this.quest.unlock(a.quest);
        }
        if (a.action === 'giveItem') {
          if (this.state?.addItem) this.state.addItem(a.item, a.count || 1);
        }
        if (a.action === 'openShop') {
          window.__openShop?.(a.tab || 'buy');
        }
        if (a.action === 'openRepair') {
          window.__openRepair?.();
        }
        if (a.action === 'heal') {
          window.__healPlayer?.();
        }
      } catch (e) {
        console.warn('[dialog] action error:', a, e);
      }
    }
  }
}