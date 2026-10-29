'use strict';
// Pianificatore di promemoria e sveglie con dipendenze iniettate (testabile senza Electron).
// Non fa nulla finché non si chiama start(): main.cjs lo avvia solo quando controllo degli stati, finestre e tray esistono,
// perché una sveglia scaduta ad app chiusa viene tolta dal file (takeDue) e subito «suonata» (fire).
// Se fire lancia per un elemento, gli altri partono comunque; l'elemento è già stato tolto dal file e non si reinserisce
// (rischierebbe di ripetersi a ogni ricontrollo): l'errore va a onError, che in main.cjs lascia un avviso in chat col testo.
const MAX_WAIT = 3600000, MIN_WAIT = 1000, RETRY_WAIT = 60000;

function createScheduler({ store, fire, onError = () => {}, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null, started = false, stopped = false;
  const report = (item, error) => { try { onError(item, error); } catch {} };
  function run() {
    if (timer !== null) { clearTimer(timer); timer = null; }
    if (!started || stopped) return;
    let delay;
    try {
      for (const item of store.takeDue(now())) { try { fire(item); } catch (error) { report(item, error); } }
      const next = store.next();
      if (!next) return;
      // Al massimo un'ora per volta: i timer molto lunghi non sono affidabili e dopo lo stop del computer si ricontrolla subito.
      delay = Math.max(MIN_WAIT, Math.min(next.when - now(), MAX_WAIT));
    } catch (error) {
      // Lettura o salvataggio dell'elenco falliti: si segnala e si riprova più tardi, senza far fallire chi chiama.
      report(null, error); delay = RETRY_WAIT;
    }
    timer = setTimer(run, delay);
    timer?.unref?.();
  }
  return {
    start() { if (started || stopped) return; started = true; run(); },
    // Prima di start() (o dopo stop()) non fa nulla: lo start elaborerà comunque tutto l'elenco.
    reschedule() { run(); },
    stop() { stopped = true; if (timer !== null) { clearTimer(timer); timer = null; } }
  };
}

module.exports = { createScheduler, MAX_WAIT, MIN_WAIT, RETRY_WAIT };
