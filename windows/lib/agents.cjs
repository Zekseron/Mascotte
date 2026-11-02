'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ChatStore, prepareDirectory, readJSON, atomicJSON } = require('./storage.cjs');
const { runCodex } = require('./agent-codex.cjs');
const { runClaude } = require('./agent-claude.cjs');

function workspacePath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error('Scegli una cartella di lavoro esistente.');
  const real = fs.realpathSync(value);
  if (!fs.statSync(real).isDirectory()) throw new Error('La cartella di lavoro non è disponibile.');
  return real;
}
class AgentManager {
  constructor(directory, notify = () => {}, runners = { codex: runCodex, claude: runClaude }) {
    prepareDirectory(directory); this.file = path.join(directory, 'state.json');
    const saved = readJSON(this.file, {});
    this.saved = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    this.notify = notify; this.runners = runners;
    this.store = new ChatStore(directory); this.mode = false; this.events = []; this.liveText = ''; this.pending = new Map(); this.active = null;
  }
  entry(engine) { return this.saved[engine] || {}; }
  save() { atomicJSON(this.file, this.saved); }
  choose(engine, directory) {
    if (this.active) return;
    const cwd = workspacePath(directory);
    if (this.entry(engine).cwd === cwd) return;
    this.saved[engine] = { cwd }; this.store.set(engine, []); this.events = []; this.liveText = ''; this.save();
  }
  reset(engine) {
    if (this.active) return;
    this.saved[engine] = { cwd: this.entry(engine).cwd }; this.store.set(engine, []); this.events = []; this.liveText = ''; this.save();
  }
  snapshot(engine) {
    return { enabled: this.mode && engine !== 'locale', workspace: this.entry(engine).cwd || '', session: Boolean(this.entry(engine).sessionId), events: this.eventEngine === engine ? this.events : [], liveText: this.eventEngine === engine ? this.liveText : '', requests: [...this.pending.values()].map(p => p.public) };
  }
  event(event) {
    if (event.liveText !== undefined) this.liveText = String(event.liveText).slice(-100000);
    else if (event.delta) this.liveText = (this.liveText + event.delta).slice(-100000);
    else { this.events.push({ title: String(event.title || 'Attività').slice(0, 200), detail: String(event.detail || '').slice(0, 32000) }); this.events = this.events.slice(-50); }
    if (!this.eventTimer) this.eventTimer = setTimeout(() => { this.eventTimer = null; this.notify(); }, 80);
  }
  ask(request) {
    if (!this.active) return Promise.resolve(false);
    clearTimeout(this.timer);
    return new Promise(resolve => {
      const id = randomUUID();
      this.pending.set(id, { resolve, public: { ...request, id } }); this.notify();
    });
  }
  answer(data) {
    const p = this.pending.get(data?.id); if (!p) throw new Error('La richiesta non è più attiva.');
    let answer = false;
    if (p.public.kind === 'approval') { if (typeof data.approved !== 'boolean') throw new Error('Decisione non valida.'); answer = data.approved; }
    else if (data.answers) {
      answer = {};
      for (const q of p.public.questions) {
        if (typeof data.answers[q.id] !== 'string' || !data.answers[q.id].trim() || data.answers[q.id].length > 8000) throw new Error('Rispondi a tutte le domande.');
        answer[q.id] = data.answers[q.id].trim();
      }
    }
    this.pending.delete(data.id); p.resolve(answer); this.armTimer(); this.notify();
  }
  armTimer() {
    clearTimeout(this.timer);
    if (this.active && !this.pending.size) this.timer = setTimeout(() => this.active?.stop(), 20 * 60 * 1000);
  }
  run(engine, command, prompt, image) {
    if (this.active) throw new Error('Un agente è già al lavoro.');
    if (!this.runners[engine]) throw new Error('Modalità agente disponibile con Codex e Claude.');
    const entry = this.entry(engine), cwd = workspacePath(entry.cwd);
    if (cwd !== entry.cwd) throw new Error('La cartella di lavoro è cambiata: sceglila nuovamente.');
    this.eventEngine = engine;
    this.events = []; this.liveText = '';
    this.store.set(engine, [...this.store.get(engine), { role: 'user', text: prompt + (image ? '\n[Fotogramma allegato]' : '') }]);
    let stopped = false, resolveReady;
    const ready = new Promise(resolve => { resolveReady = resolve; });
    const handle = { stop: () => { stopped = true; ready.then(run => run?.stop()); for (const p of this.pending.values()) p.resolve(false); this.pending.clear(); this.notify(); } };
    this.active = handle;
    handle.promise = (async () => {
      try {
        const run = this.runners[engine]({ command, cwd, prompt, image, sessionId: entry.sessionId,
          onSession: id => { if (typeof id === 'string' && id.length < 500) { this.saved[engine] = { cwd, sessionId: id }; this.save(); } },
          onEvent: event => this.event(event), ask: request => this.ask(request) });
        resolveReady(run); this.armTimer(); if (stopped) run.stop();
        const text = await run.promise;
        this.store.set(engine, [...this.store.get(engine), { role: 'assistant', text: text.slice(0, 100000) }]); return text;
      } finally {
        resolveReady(null); clearTimeout(this.timer); clearTimeout(this.eventTimer); this.eventTimer = null; this.active = null;
        for (const p of this.pending.values()) p.resolve(false); this.pending.clear(); this.liveText = ''; this.notify();
      }
    })();
    return handle;
  }
}
module.exports = { AgentManager, workspacePath };
