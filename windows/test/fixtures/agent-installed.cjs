'use strict';
// Collaudo esplicito con account Codex e runtime della Mascotte installata.
// Non fa parte di npm test: eseguirlo solo su richiesta, con ELECTRON_RUN_AS_NODE=1.
const fs = require('node:fs'), path = require('node:path');
const archive = path.join(process.env.LOCALAPPDATA, 'Programs/mascotte-windows/resources/app.asar');
const { AgentManager } = require(path.join(archive, 'lib/agents.cjs'));
const CLI = require(path.join(archive, 'lib/cli.cjs'));
const root = path.resolve(__dirname, '../../../work/windows-final'), workspace = path.join(root, 'progetto');
fs.mkdirSync(workspace, { recursive: true });
for (const name of ['output.txt', 'started.txt', 'finished.txt']) { try { fs.unlinkSync(path.join(workspace, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
fs.writeFileSync(path.join(workspace, 'input.txt'), 'VERIFICA-WINDOWS-7319\n');
const reports = {}, command = CLI.findCLI('codex');
let manager;
const notify = () => { if (manager) for (const r of manager.snapshot('codex').requests) manager.answer({ id: r.id, approved: false }); };
const output = () => fs.writeFileSync(path.join(root, 'risultati.json'), JSON.stringify(reports, null, 2));
(async () => {
  manager = new AgentManager(path.join(root, 'dati'), notify); manager.choose('codex', workspace); manager.reset('codex');
  console.log('Prova app installata: lettura e modifica...');
  await manager.run('codex', command, 'Collaudo sintetico. Lavora solo nella cartella corrente: leggi il testo di input.txt, mostralo nella risposta e crea output.txt con esattamente lo stesso contenuto. Non usare rete, non installare nulla e non leggere altre cartelle. Verifica il risultato.').promise;
  reports.file = fs.readFileSync(path.join(workspace, 'output.txt'), 'utf8').trim() === 'VERIFICA-WINDOWS-7319';
  if (!reports.file) throw new Error('Contenuto file non corretto');
  const id = manager.entry('codex').sessionId;
  manager = new AgentManager(path.join(root, 'dati'), notify);
  const reply = await manager.run('codex', command, 'Senza rileggere file né usare strumenti: quale codice hai letto nel turno precedente?').promise;
  reports.riavvio = !manager.mode && manager.entry('codex').sessionId === id && reply.includes('VERIFICA-WINDOWS-7319');
  if (!reports.riavvio) throw new Error('Ripresa dopo riavvio non corretta'); output();
  console.log('Prova app installata: ricerca web nella Chat...');
  const result = await CLI.runCLI(command, CLI.argumentsFor('codex'), 'Collaudo della ricerca web. Cerca online la documentazione ufficiale Node.js di stream.pipeline. Cita il link ufficiale consultato e spiega la funzione in una sola frase. Non usare comandi o file locali.', workspace).promise;
  const text = CLI.decodeOutput('codex', result.stdout, result.code, result.stderr);
  reports.web = { evento: result.stdout.split('\n').some(line => { try { const v = JSON.parse(line); return v.item?.type === 'web_search'; } catch { return false; } }), fonte: /https:\/\/nodejs\.org/.test(text) };
  if (!reports.web.evento || !reports.web.fonte) throw new Error('Ricerca web non provata con evento e fonte'); output();
  console.log('Prova app installata: Interrompi...');
  let stopCalled = false;
  manager.notify = () => {
    const active = manager.snapshot('codex');
    for (const r of active.requests) manager.answer({ id: r.id, approved: false });
    if (!stopCalled && fs.existsSync(path.join(workspace, 'started.txt'))) { stopCalled = true; manager.active?.stop(); }
  };
  const run = manager.run('codex', command, 'Collaudo Interrompi: nella sola cartella corrente esegui un comando Node.js che scriva started.txt contenente String(process.pid), attenda 45 secondi e poi scriva finished.txt. Usa un unico processo Node con setTimeout e attendine il completamento. Non usare rete o altre cartelle e non installare nulla.');
  const polling = setInterval(() => manager.notify(), 100);
  try { await run.promise; throw new Error('Interruzione non avvenuta'); }
  catch (error) { if (!stopCalled || !/interrott/.test(error.message)) throw error; }
  finally { clearInterval(polling); }
  await new Promise(r => setTimeout(r, 1500));
  reports.interrompi = { annullato: stopCalled, libero: manager.active === null, nessunaRichiesta: manager.pending.size === 0, nessunFinale: !fs.existsSync(path.join(workspace, 'finished.txt')) };
  const pid = Number(fs.readFileSync(path.join(workspace, 'started.txt'), 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('PID del processo sintetico non valido');
  try { process.kill(pid, 0); reports.interrompi.processoFiglioTerminato = false; } catch (error) { if (error.code !== 'ESRCH') throw error; reports.interrompi.processoFiglioTerminato = true; }
  if (Object.values(reports.interrompi).some(v => !v)) throw new Error('Interruzione incompleta');
  output(); console.log(JSON.stringify(reports));
})().catch(error => { manager?.active?.stop(); reports.errore = error.message; output(); console.error(error); process.exitCode = 1; });
