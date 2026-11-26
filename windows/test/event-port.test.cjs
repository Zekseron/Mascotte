'use strict';
// Porta del server degli eventi (lib/events.cjs): 8766, poi le riserve, poi una porta libera scelta dal sistema.
// Gli hook leggono la porta da events.json, quindi il ripiego è trasparente. Diagnostica: testi e nome del programma.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const P = require('../../viewer/pack.js');
const { EventServer, PORTS } = require('../lib/events.cjs');
const { sendEvent } = require('../lib/notify.cjs');
const { readJSON } = require('../lib/storage.cjs');
const { evaluate, parseLsofCommand, parseNetstatPid, parseTasklistName } = require('../lib/diagnostics.cjs');

const STATES = Object.keys(P.STATES.states);
function temporary(t) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-porta-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; }
// Occupa una porta come farebbe un altro programma; null se nel sistema di prova è già occupata da altro.
function occupy(t, port) {
  return new Promise(resolve => {
    const other = net.createServer();
    other.once('error', () => resolve(null));
    other.listen(port, '127.0.0.1', () => { t.after(() => other.close()); resolve(other); });
  });
}
async function freePorts(count) {
  const ports = [];
  while (ports.length < count) ports.push(await new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }));
  return ports;
}

test('porte dell\'elenco: nessuna sotto 1024 né di servizi noti, la preferita è 8766', () => {
  assert.equal(PORTS[0], 8766);
  for (const port of PORTS) { assert.ok(port >= 1024 && port <= 49151, String(port)); assert.ok(![22, 80, 443, 3000, 5432, 8080].includes(port)); }
  assert.ok(Object.isFrozen(PORTS));
});

test('preferita libera: la usa e non segnala nulla', async t => {
  const [a, b] = await freePorts(2), file = path.join(temporary(t), 'events.json');
  const server = new EventServer(file, STATES, () => {}); t.after(() => server.close());
  assert.equal(await server.startFirst([a, b]), a);
  assert.equal(server.preferredBusy, false);
  assert.equal(readJSON(file, {}).port, a);
});

test('preferita occupata da un altro programma: passa alla riserva e il ponte la trova da events.json', async t => {
  const [a, b] = await freePorts(2), file = path.join(temporary(t), 'events.json'), received = [];
  if (!await occupy(t, a)) return t.skip('porta di prova non disponibile');
  const server = new EventServer(file, STATES, e => received.push(e)); t.after(() => server.close());
  assert.equal(await server.startFirst([a, b]), b);
  assert.equal(server.preferredBusy, true);
  assert.equal(server.port, b);
  await sendEvent(file, 'thinking', 'claude', 500);
  assert.deepEqual(received, [{ state: 'thinking', source: 'claude' }]);
});

test('tutte occupate: porta scelta dal sistema, nell\'intervallo temporaneo e mai sotto 1024', async t => {
  const [a, b] = await freePorts(2), file = path.join(temporary(t), 'events.json');
  if (!await occupy(t, a) || !await occupy(t, b)) return t.skip('porte di prova non disponibili');
  const server = new EventServer(file, STATES, () => {}); t.after(() => server.close());
  const port = await server.startFirst([a, b]);
  assert.ok(![a, b].includes(port));
  assert.ok(port >= 1024, String(port));
  assert.equal(server.preferredBusy, true);
  assert.equal(readJSON(file, {}).port, port);
});

test('errore diverso da «porta occupata»: non lo nasconde provando altre porte', async t => {
  const server = new EventServer(path.join(temporary(t), 'nessuna-cartella', 'events.json'), STATES, () => {});
  t.after(() => server.close());
  await assert.rejects(server.startFirst((await freePorts(1))));
});

test('diagnostica: porta normale ok, preferita occupata = informazione con il nome del programma, server spento = problema', () => {
  const base = { eventServer: true, eventPort: 8766, preferredPort: 8766, preferredBusy: false };
  const eventi = facts => evaluate(facts, { platform: 'darwin' }).find(r => r.id === 'eventi');
  assert.deepEqual([eventi(base).stato, eventi(base).testo], ['ok', 'Mascotte è pronta a ricevere gli eventi degli hook sulla porta 8766.']);
  const busy = eventi({ ...base, eventPort: 8767, preferredBusy: true, preferredOwner: 'node' });
  assert.equal(busy.stato, 'info');
  assert.match(busy.testo, /8766 è già usata da «node», quindi Mascotte riceve gli eventi sulla porta 8767\. .*non devi fare nulla/);
  assert.match(eventi({ ...base, eventPort: 51234, preferredBusy: true, preferredOwner: null }).testo, /da un altro programma.*porta 51234/);
  assert.equal(eventi({ eventServer: false }).stato, 'problema');
});

test('nome del programma che occupa la porta: lsof (Mac), netstat + tasklist (Windows), nomi strani scartati', () => {
  assert.equal(parseLsofCommand('p4321\ncnode\n'), 'node');
  assert.equal(parseLsofCommand(''), null);
  assert.equal(parseLsofCommand('p1\nc' + 'x'.repeat(80) + '\n'), null);
  const netstat = '\r\n  Proto  Indirizzo locale       Indirizzo esterno      Stato           PID\r\n  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       900\r\n  TCP    127.0.0.1:8766         0.0.0.0:0              LISTENING       4321\r\n  TCP    127.0.0.1:52000        127.0.0.1:8766         ESTABLISHED     77\r\n';
  assert.equal(parseNetstatPid(netstat, 8766), 4321);
  assert.equal(parseNetstatPid(netstat, 8767), null);
  assert.equal(parseTasklistName('"python.exe","4321","Console","1","10.000 K"\r\n'), 'python.exe');
  assert.equal(parseTasklistName('INFO: nessuna attività in esecuzione.'), null);
});
