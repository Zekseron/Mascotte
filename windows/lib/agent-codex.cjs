'use strict';
const { spawnAgent, stopProcess } = require('./agent-process.cjs');

// JSON-RPC newline-delimited, verificato sullo schema dell'app-server installato.
function runCodex({ command, cwd, prompt, image, sessionId, onSession, onEvent, ask, spawn = spawnAgent }) {
  const child = spawn(command, ['-c', 'web_search="live"', '-c', 'approval_policy="on-request"', '-c', 'approvals_reviewer="user"', 'app-server'], cwd);
  let sequence = 0, buffer = '', diagnostic = '', closed = false, settle, text = '';
  const pending = new Map();
  const send = message => { if (!closed) child.stdin.write(JSON.stringify(message) + '\n'); };
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Codex non risponde al protocollo: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer }); send({ id, method, params });
  });
  const finish = error => {
    if (closed) return; closed = true;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error || new Error('Sessione conclusa.')); } pending.clear();
    stopProcess(child);
    error ? settle.reject(error) : settle.resolve(text || 'Attività completata.');
  };
  const promise = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  async function serverRequest(message) {
    const p = message.params || {};
    let result;
    if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(message.method)) {
      const approved = await ask({ kind: 'approval', title: message.method.includes('commandExecution') ? 'Eseguire il comando?' : 'Applicare le modifiche?', detail: JSON.stringify(p, null, 2) });
      result = { decision: approved ? 'accept' : 'decline' };
    } else if (message.method === 'item/tool/requestUserInput') {
      const answers = await ask({ kind: 'questions', title: 'Codex chiede un chiarimento', questions: p.questions || [] });
      result = { answers: Object.fromEntries(Object.entries(answers || {}).map(([id, answer]) => [id, { answers: [answer] }])) };
    } else if (message.method === 'item/permissions/requestApproval') {
      const approved = await ask({ kind: 'approval', title: 'Concedere questi permessi per il turno?', detail: JSON.stringify(p, null, 2) });
      result = { permissions: approved ? p.permissions : {}, scope: 'turn' };
    } else {
      onEvent({ title: 'Richiesta non supportata', detail: message.method });
      send({ id: message.id, error: { code: -32601, message: 'Questa richiesta non è ancora supportata da Mascotte.' } }); return;
    }
    send({ id: message.id, result });
  }
  function receive(message) {
    if (message.method && message.id !== undefined) { serverRequest(message).catch(finish); return; }
    if (message.id !== undefined) {
      const p = pending.get(message.id); if (!p) return;
      pending.delete(message.id); clearTimeout(p.timer);
      message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result); return;
    }
    const p = message.params || {};
    if (message.method === 'item/agentMessage/delta') { text = (text + (p.delta || '')).slice(-100000); onEvent({ liveText: text }); }
    if (message.method === 'item/started' || message.method === 'item/completed') {
      const item = p.item || {};
      if (item.type === 'agentMessage' && message.method === 'item/completed') { text = item.text || text; onEvent({ liveText: text }); }
      else if (item.type !== 'reasoning') onEvent({ title: item.type || 'Attività', detail: JSON.stringify(item, null, 2) });
    }
    if (message.method === 'turn/diff/updated') onEvent({ title: 'Modifiche ai file', detail: p.diff || '' });
    if (message.method === 'error') onEvent({ title: 'Codex', detail: p.message || JSON.stringify(p.error || p) });
    if (message.method === 'turn/completed') {
      const status = p.turn?.status;
      finish(status === 'completed' ? null : new Error(p.turn?.error?.message || (status === 'interrupted' ? 'Attività interrotta.' : 'Codex non ha completato il turno.')));
    }
  }
  child.stdin.on('error', error => finish(error));
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    if (Buffer.byteLength(buffer) > 4 * 1024 * 1024) { finish(new Error('Evento Codex troppo grande.')); return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      try { receive(JSON.parse(line)); } catch { finish(new Error('Risposta app-server Codex non valida.')); return; }
    }
  });
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-16000); });
  child.on('error', finish);
  child.on('close', () => finish(new Error(diagnostic.trim().slice(-1500) || 'Codex si è chiuso prima della fine del turno.')));
  (async () => {
    await request('initialize', { clientInfo: { name: 'mascotte', title: 'Mascotte', version: '0.9.0' }, capabilities: { experimentalApi: true } });
    send({ method: 'initialized', params: {} });
    const options = { cwd, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'workspace-write', developerInstructions: 'Sei l’agente di Mascotte. Lavora nella cartella scelta dall’utente. Spiega le azioni rilevanti e verifica il risultato. Pubblicazioni, invii a terzi e operazioni distruttive richiedono una richiesta esplicita dell’utente. Rispondi nella sua lingua.' };
    const response = await request(sessionId ? 'thread/resume' : 'thread/start', sessionId ? { ...options, threadId: sessionId } : options);
    sessionId = response.thread.id; onSession(sessionId);
    const input = [{ type: 'text', text: prompt }];
    if (image) input.push({ type: 'image', url: 'data:image/jpeg;base64,' + image });
    await request('turn/start', { threadId: sessionId, input });
  })().catch(finish);
  return { promise, stop() { finish(new Error('Attività interrotta.')); } };
}
module.exports = { runCodex };
