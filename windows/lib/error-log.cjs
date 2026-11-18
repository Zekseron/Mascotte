'use strict';
// Registro locale degli errori che l'app altrimenti ignorerebbe in silenzio (per esempio una notifica che non
// si mostra o una cartella temporanea di immagini che non si riesce a cancellare). Serve a capire cosa è
// successo quando un utente segnala un problema.
// Privacy: ogni riga contiene solo data e ora, un'etichetta fissa scelta dal codice, il codice dell'errore e il
// messaggio tagliato su una riga, con la cartella personale scritta «~». Mai testi di chat, note, prompt o contenuti di file. Il file resta nella
// cartella dati (errori.log, al massimo MAX_BYTES più la copia precedente errori.log.1) e non viene inviato.
// Il registro non deve mai far fallire chi lo chiama: ogni suo errore è ignorato.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NAME = 'errori.log';
const MAX_BYTES = 256 * 1024;
const MAX_MESSAGE = 300;
let file = null;

function configure(dataDirectory) { file = dataDirectory ? path.join(dataDirectory, NAME) : null; }

function line(context, error) {
  const code = error && typeof error === 'object' && error.code ? String(error.code) : '';
  const raw = error && typeof error === 'object' && 'message' in error ? error.message : error;
  // La cartella personale diventa «~»: i percorsi nei messaggi non portano con sé il nome dell'utente.
  let message = String(raw ?? 'errore sconosciuto');
  const home = os.homedir();
  if (home && home.length > 1) message = message.split(home).join('~');
  message = message.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE);
  const label = String(context).replace(/\s+/g, ' ').slice(0, 80);
  return `${new Date().toISOString()} ${label}${code ? ` [${code}]` : ''}: ${message}\n`;
}

// Scrive una riga. Con { ignore: ['ENOENT'] } i codici attesi (per esempio un file già sparito) non si registrano.
function error(context, err, { ignore = [] } = {}) {
  if (err && typeof err === 'object' && ignore.includes(err.code)) return;
  let text;
  try { text = line(context, err); } catch { return; }
  try { console.error(text.trimEnd()); } catch { /* console non disponibile */ }
  if (!file) return;
  try {
    let size = 0;
    try { size = fs.statSync(file).size; } catch { /* file non ancora creato */ }
    if (size + Buffer.byteLength(text) > MAX_BYTES) fs.renameSync(file, file + '.1');
    fs.appendFileSync(file, text, { mode: 0o600 });
  } catch { /* cartella dati non scrivibile: resta la console */ }
}

module.exports = { configure, error, NAME, MAX_BYTES, MAX_MESSAGE };
