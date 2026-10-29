'use strict';
// Promemoria e sveglie dalla chat locale: frasi riconosciute da Mascotte (mai dal modello), orario calcolato qui,
// salvati in reminders.json nella cartella dati e mostrati come notifica di sistema alla scadenza.
const { randomUUID } = require('node:crypto');
const { readJSON, atomicJSON } = require('./storage.cjs');

const MAX_REMINDERS = 50, MAX_AHEAD = 31 * 24 * 60 * 60 * 1000, MAX_TEXT = 300;
const fold = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim();
const NUMBERS = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, quindici: 15, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50 };
const num = word => /^\d+$/.test(word) ? Number(word) : NUMBERS[word];
const NUM = '(\\d{1,3}|un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|quindici|venti|trenta|quaranta|cinquanta)';

// Inizio della frase: «ricordami …», «sveglia …», «promemoria …», «avvisami …», «imposta/metti una sveglia …», anche dopo «puoi», «mi puoi», «per favore».
const POLITE = /^(?:(?:per favore|perfavore|ehi|ciao)[ ,]+)?(?:(?:mi )?(?:puoi|potresti|riesci a) )?/;
const TRIGGER = /^(ricordami|ricordarmi|avvisami|avvisarmi|svegliami|svegliarmi|(?:imposta|impostami|impostare|metti|mettimi|mettere|crea|creare|aggiungi|aggiungere)(?: (?:una|un|la|il))? (?:sveglia|promemoria|allarme|timer)|sveglia|promemoria|allarme|timer)\b/;
const RELATIVE = new RegExp(`\\b(?:tra|fra) (?:(mezz'?ora)|${NUM} ?(minuti|minuto|min|ore|ora|h)(?: e ${NUM} ?(?:minuti|minuto|min))?)\\b`);
const DAY = /\b(oggi|stasera|stamattina|domani|dopodomani)\b/;
const CLOCK = /\b(?:alle|all'|per le|verso le|a ore|ore)\s*(\d{1,2})(?:[:.](\d{2})| e (mezza|un quarto|\d{1,2}))?(?: (?:di|del|della|in) (mattina|pomeriggio|sera|notte))?\b/;

// Restituisce null (non è un promemoria), { error } (è un promemoria ma l'orario non va) oppure { when, text }.
function parseReminder(input, now = new Date()) {
  const raw = String(input || '').trim(), text = fold(raw).replace(POLITE, '');
  const trigger = text.match(TRIGGER); if (!trigger) return null;
  const rest = text.slice(trigger[0].length); let when = null;
  const relative = rest.match(RELATIVE), clock = rest.match(CLOCK), day = rest.match(DAY);
  if (relative) {
    const minutes = relative[1] ? 30 : /^(ore|ora|h)$/.test(relative[3]) ? num(relative[2]) * 60 + (relative[4] ? num(relative[4]) : 0) : num(relative[2]);
    if (!minutes) return { error: 'Non ho capito tra quanto: prova con «tra 20 minuti» o «tra 1 ora».' };
    when = new Date(now.getTime() + minutes * 60000);
  } else if (clock) {
    let hour = Number(clock[1]); const minute = clock[2] ? Number(clock[2]) : clock[3] === 'mezza' ? 30 : clock[3] === 'un quarto' ? 15 : clock[3] ? Number(clock[3]) : 0;
    if ((clock[4] === 'pomeriggio' || clock[4] === 'sera' || day?.[1] === 'stasera') && hour < 12) hour += 12;
    if (hour > 23 || minute > 59) return { error: 'L’orario non è valido: usa per esempio «alle 15:30».' };
    const offset = { domani: 1, dopodomani: 2 }[day?.[1]] || 0;
    when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute, 0, 0);
    // Senza giorno e con l'ora già passata, vale domani.
    if (!day && when <= now) when.setDate(when.getDate() + 1);
  } else return { error: 'Quando? Scrivi per esempio «ricordami alle 15:30 di chiamare Marco» o «sveglia tra 20 minuti».' };
  if (when <= now) return { error: 'Quell’orario è già passato.' };
  if (when - now > MAX_AHEAD) return { error: 'Posso impostare promemoria fino a un mese da oggi.' };
  // Testo del promemoria: la frase originale senza comando e orario, nella forma scritta dall'utente.
  let message = removeParts(raw, [trigger[0], relative?.[0], clock?.[0], day?.[0]].filter(Boolean));
  const alarm = /sveglia|svegli|allarme|timer/.test(trigger[0]);
  message = message.replace(/^[\s,:;.\-–]+|[\s,;.?!\-–]+$/g, '').replace(/^(?:di|del|della|dello|dei|delle|degli|che|per|a|da)\s+/i, '').trim();
  if (!message || /^(?:mi )?(?:sveglia|promemoria)$/i.test(message)) message = alarm ? 'Sveglia' : 'Promemoria';
  return { when, text: message.slice(0, MAX_TEXT), alarm };
}
// Toglie dal testo originale (con maiuscole) i pezzi riconosciuti, confrontandoli senza accenti né maiuscole.
function removeParts(raw, parts) {
  let out = raw;
  for (const part of parts) {
    const words = part.split(' ').map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/a/g, '[aàá]').replace(/e/g, '[eèé]').replace(/i/g, '[iìí]').replace(/o/g, '[oòó]').replace(/u/g, '[uùú]').replace(/'/g, "['’]"));
    out = out.replace(new RegExp(words.join('\\s+'), 'i'), ' ');
  }
  return out.replace(/^\s*(?:per favore|perfavore|ehi|ciao)?[\s,]*(?:(?:mi\s+)?(?:puoi|potresti|riesci a)\s+)?/i, '').replace(/\s+/g, ' ').trim();
}

const LIST = /^(?:(?:che|quali) (?:promemoria|sveglie|allarmi)|(?:elenca|mostra|mostrami|vedi) (?:i |le )?(?:miei |mie )?(?:promemoria|sveglie|allarmi))/;
const CANCEL = /^(?:cancella|elimina|annulla|togli|rimuovi) (?:(tutti i|tutte le) (?:promemoria|sveglie|allarmi)|(?:il |la |lo )?(?:promemoria|sveglia|allarme|timer)(?: (?:numero |n\.? ?)?(\d{1,2}))?)/;
function parseReminderCommand(input) {
  const text = fold(input).replace(POLITE, '');
  if (LIST.test(text)) return { type: 'reminder-list' };
  const cancel = text.match(CANCEL);
  if (cancel) return { type: 'reminder-cancel', all: Boolean(cancel[1]), index: cancel[2] ? Number(cancel[2]) : null };
  return null;
}

const formatWhen = (when, now = new Date()) => {
  const date = new Date(when), sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `oggi alle ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `domani alle ${time}`;
  return `${date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} alle ${time}`;
};

// Elenco salvato: [{ id, when (ms), text, alarm }], ordinato per scadenza. I valori non validi vengono scartati.
class ReminderStore {
  constructor(file) { this.file = file; this.items = this.read(); }
  read() {
    const raw = readJSON(this.file, [], 262144);
    return (Array.isArray(raw) ? raw : []).filter(item => item && typeof item.id === 'string' && Number.isFinite(item.when) && typeof item.text === 'string')
      .slice(0, MAX_REMINDERS).map(item => ({ id: item.id, when: item.when, text: item.text.slice(0, MAX_TEXT), alarm: Boolean(item.alarm) })).sort((a, b) => a.when - b.when);
  }
  save() { atomicJSON(this.file, this.items); }
  list() { return this.items.slice(); }
  add({ when, text, alarm }) {
    if (this.items.length >= MAX_REMINDERS) throw new Error(`Hai già ${MAX_REMINDERS} promemoria: cancellane qualcuno.`);
    const item = { id: randomUUID(), when: new Date(when).getTime(), text: String(text).slice(0, MAX_TEXT), alarm: Boolean(alarm) };
    this.items = [...this.items, item].sort((a, b) => a.when - b.when); this.save(); return item;
  }
  remove(id) { const before = this.items.length; this.items = this.items.filter(item => item.id !== id); if (this.items.length !== before) this.save(); return before !== this.items.length; }
  clear() { const count = this.items.length; this.items = []; this.save(); return count; }
  // Scaduti (anche quelli persi mentre l'app era chiusa): tolti dall'elenco e restituiti.
  takeDue(now = Date.now()) { const due = this.items.filter(item => item.when <= now); if (due.length) { this.items = this.items.filter(item => item.when > now); this.save(); } return due; }
  next() { return this.items[0] || null; }
}

function describeReminders(items, now = new Date()) {
  if (!items.length) return 'Non hai promemoria. Per impostarne uno scrivi per esempio «ricordami alle 15:30 di chiamare Marco» o «sveglia tra 20 minuti».';
  return 'I tuoi promemoria:\n' + items.map((item, index) => `${index + 1}. ${formatWhen(item.when, now)} · ${item.text}`).join('\n') + '\n\nPer cancellarne uno scrivi «cancella promemoria 2»; per tutti «cancella tutti i promemoria».';
}

module.exports = { parseReminder, parseReminderCommand, formatWhen, describeReminders, ReminderStore, MAX_REMINDERS, MAX_AHEAD };
