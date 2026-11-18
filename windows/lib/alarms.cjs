'use strict';
// Scatto di promemoria e sveglie, sveglia che suona, spegnimento automatico e rimando.
// Archivio (reminders.cjs) e pianificatore (reminder-scheduler.cjs) restano separati e vengono avviati da main.cjs;
// qui c'è solo cosa succede quando un promemoria scade. Le dipendenze arrivano da fuori (notifiche di sistema,
// timer, chat e mascotte) così il comportamento si prova nei test senza Electron.
const Reminders = require('./reminders.cjs');

const ALARM_RING = 3 * 60 * 1000;   // una sveglia suona al massimo 3 minuti
const SNOOZE = 5 * 60 * 1000;       // «Rimanda» sposta di 5 minuti
const LATE = 60 * 1000;             // oltre 1 minuto il testo ricorda l'orario previsto
const TOO_LATE_TO_RING = 10 * 60 * 1000; // una sveglia scaduta da più di 10 minuti non suona più

function createAlarms({
  store,                 // ReminderStore: serve al rimando
  Notification,          // classe Notification di Electron (o una finta nei test)
  notify,                // (testo, { info }) → imposta l'avviso della chat (info: anche l'avviso informativo)
  showChat, broadcast,   // apre la chat / invia lo stato alle finestre
  setWaiting,            // mette la mascotte in attesa, se non sta già lavorando
  ErrorLog,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  let active = null, timer = null;

  function stop() { clearTimer(timer); timer = null; active = null; }

  function fire(item) {
    const body = item.text + (now() - item.when > LATE ? ` (era per ${Reminders.formatWhen(item.when)})` : '');
    // Una notifica che non si può mostrare non blocca il resto: un promemoria ricade sull'avviso in chat, una sveglia suona comunque.
    let shown = false;
    try {
      if (Notification.isSupported()) { new Notification({ title: item.alarm ? 'Mascotte · sveglia' : 'Mascotte · promemoria', body, silent: false }).show(); shown = true; }
    } catch (e) { ErrorLog.error('notifica del promemoria non mostrata', e); }
    if (!shown && !item.alarm) { notify(`⏰ ${body}`, { info: true }); showChat(); broadcast(); }
    // Sveglia (non troppo in ritardo): finestra con «Ferma» e «Rimanda», suono a ripetizione nella chat per al massimo 3 minuti, mascotte in attesa.
    if (item.alarm && now() - item.when < TOO_LATE_TO_RING) {
      stop(); active = { id: item.id, text: item.text, when: item.when };
      timer = setTimer(() => { if (active) notify(`La sveglia «${active.text}» si è spenta da sola dopo 3 minuti.`, { info: false }); stop(); broadcast(); }, ALARM_RING);
      setWaiting(); showChat(); broadcast();
    }
  }

  // Un promemoria che non si è potuto mostrare è già stato tolto dall'elenco: resta almeno un avviso in chat col suo testo.
  function failed(item, error) {
    console.error('Promemoria non mostrato:', error?.message || error);
    notify(item
      ? `Non sono riuscito a mostrare ${item.alarm ? 'la sveglia' : 'il promemoria'} «${item.text}» (era per ${Reminders.formatWhen(item.when)}): ${error?.message || 'errore sconosciuto'}.`
      : `Non riesco a controllare i promemoria: ${error?.message || 'errore sconosciuto'}.`, { info: false });
    try { showChat(); } catch (e) { ErrorLog.error('chat non aperta per un promemoria fallito', e); }
    try { broadcast(); } catch (e) { ErrorLog.error('stato non inviato per un promemoria fallito', e); }
  }

  // «Rimanda»: con l'elenco pieno l'aggiunta fallisce e la sveglia resta attiva (Ferma continua a funzionare).
  // Restituisce { error } oppure { item } con il nuovo orario; la sveglia si ferma solo se il rimando è riuscito.
  function snooze() {
    if (!active) return { error: 'Nessuna sveglia attiva.' };
    const snoozed = Reminders.snoozeAlarm(store, active, { now: now(), delay: SNOOZE });
    if (snoozed.error) return snoozed;
    stop();
    return snoozed;
  }

  return { fire, failed, stop, snooze, get active() { return active; } };
}

module.exports = { createAlarms, ALARM_RING, SNOOZE };
