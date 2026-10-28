'use strict';
const path = require('node:path');
const os = require('node:os');

// Comandi della chat locale gestiti da Mascotte senza il modello: azioni predefinite e note.
// Ogni azione e ogni nota passano da una conferma dell'utente (pendingAction in main.cjs).
function openTargets(platform = process.platform, home = os.homedir(), env = process.env) {
  const calculator = platform === 'darwin'
    ? { description: 'Aprire l’app Calcolatrice del Mac.', target: '/System/Applications/Calculator.app' }
    : { description: 'Aprire la Calcolatrice di Windows.', target: path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'calc.exe') };
  const downloads = { description: 'Aprire la cartella Download del tuo utente.', target: path.join(home, 'Downloads') };
  return { 'apri calcolatrice': calculator, 'apri la calcolatrice': calculator, 'apri download': downloads, 'apri la cartella download': downloads };
}
const normalize = text => text.trim().toLocaleLowerCase('it').replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
// «ricorda: …», «ricordati che …», «salva nota: …»: il testo della nota mantiene maiuscole e punteggiatura originali.
const REMEMBER = /^(?:ricorda(?:ti)?(?:\s+che)?|salva(?:\s+(?:una|la|questa))?\s+nota)\s*[:,]?\s+([\s\S]+)$/i;
const LIST = /^(?:che note ho|quali note ho(?: salvato)?|ho (?:delle )?note(?: salvate)?|mostra(?:mi)? (?:le )?(?:mie )?note|elenca (?:le )?note)$/;

function parseLocalCommand(text, { platform = process.platform, home = os.homedir(), env = process.env, actions = true } = {}) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const normalized = normalize(text), targets = openTargets(platform, home, env);
  if (actions && Object.hasOwn(targets, normalized)) return { type: 'open', ...targets[normalized] };
  if (LIST.test(normalized)) return { type: 'list-notes' };
  const remember = text.trim().match(REMEMBER);
  if (remember && remember[1].trim()) return { type: 'remember', text: remember[1].trim().slice(0, 2000) };
  return null;
}
function describeNotes(notes) {
  if (!notes.length) return 'Non hai note salvate. Per salvarne una scrivi «ricorda: …» oppure usa «Ricorda…» sotto una risposta.';
  return 'Le tue note salvate (le uso come contesto quando la domanda contiene parole in comune):\n' + notes.map((note, index) => `${index + 1}. ${note.text}`).join('\n');
}
module.exports = { openTargets, parseLocalCommand, describeNotes };
