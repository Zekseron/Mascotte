'use strict';
// Collaudo esplicito, fuori dalla suite automatica: solo dati sintetici in work/agent-live.
const fs = require('node:fs'), path = require('node:path');
const { AgentManager } = require('../../lib/agents.cjs');
const CLI = require('../../lib/cli.cjs');
const root = path.resolve(__dirname, '../../../work/agent-live');
const workspace = path.join(root, 'progetto'); fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(path.join(workspace, 'input.txt'), 'LANTERNA-AGENTE-2026\n', 'utf8');
const manager = new AgentManager(path.join(root, 'dati'), () => {
  for (const request of manager.snapshot('codex').requests) {
    // Nessuna approvazione automatica di accessi oltre la sandbox della fixture.
    manager.answer({ id: request.id, approved: false });
  }
});
manager.choose('codex', workspace); manager.reset('codex');
(async () => {
  const command = CLI.findCLI('codex'); if (!command) throw new Error('Codex non trovato');
  await manager.run('codex', command, 'Collaudo con dati sintetici. Lavora solo nella cartella corrente. Leggi input.txt e crea risultato.txt con lo stesso contenuto. Verifica il file con gli strumenti. Non usare rete o altre cartelle, non installare nulla. Rispondi con il codice letto.').promise;
  if (fs.readFileSync(path.join(workspace, 'risultato.txt'), 'utf8').trim() !== 'LANTERNA-AGENTE-2026') throw new Error('File non corretto');
  const id = manager.entry('codex').sessionId;
  const reply = await manager.run('codex', command, 'Riprendi il turno precedente: quale codice avevi letto? Rispondi con quel codice senza rileggere file e senza altri strumenti.').promise;
  if (!reply.includes('LANTERNA-AGENTE-2026') || manager.entry('codex').sessionId !== id) throw new Error('Ripresa non corretta');
  console.log(JSON.stringify({ fileVerificato: true, sessioneRipresa: true, messaggi: manager.store.get('codex').length }));
})().catch(error => { manager.active?.stop(); console.error(error.message); process.exitCode = 1; });
