'use strict';
// Avvisi di Claude e Codex nel fumetto (0.11), dagli eventi degli hook ricevuti su /event (lib/events.cjs).
// Solo frasi fisse scelte qui: dagli hook arrivano soltanto stato, agente e, quando l'hook lo porta, un identificatore
// di sessione opaco (impronta calcolata dal ponte, lib/notify.cjs). Nulla viene salvato su disco.
//
// Garanzie concordate:
// - «X è in attesa»: un solo avviso per agente, che resta. Con sessioni identificate si chiude da solo solo quando
//   quella stessa sessione riparte, conclude il turno o viene interrotta: l'attività di un'altra sessione non lo chiude.
//   Un'attesa senza identificatore resta fino al clic. «in N sessioni» solo quando il conteggio è certo.
// - «X ha concluso il turno»: avviso a parte, sparisce dopo 8 secondi dalla prima comparsa; i fine turno ravvicinati
//   si accorpano. Un fine turno anonimo non chiude nessuna attesa.
// - Clic sul testo o sulla «×»: l'avviso di attesa prende atto di tutte le attese che rappresenta in quel momento;
//   una nuova attesa lo fa ricomparire.
// - Fumetto non disponibile (mascotte nascosta): i nuovi avvisi si scartano, mai come notifica di sistema; le chiusure
//   delle attese già mostrate si elaborano comunque.
// - L'errore di un singolo comando resta solo nell'animazione.

const AGENTS = { claude: 'Claude', codex: 'Codex' };
// Stati che dicono «la sessione è ripartita» (o è stata interrotta): listening = nuovo prompt, idle = interruzione.
const RESUME = new Set(['listening', 'thinking', 'working', 'reading', 'writing', 'running', 'idle']);
const SESSION = /^[a-f0-9]{16}$/;

function waitingText(name, { sessions, anonymous }) {
  return !anonymous && sessions.size > 1 ? `${name} è in attesa in ${sessions.size} sessioni` : `${name} è in attesa`;
}

function createAgentNotices({ queue, enabled = () => false, ready = () => true }) {
  const state = new Map(); // agente → { sessions: Set, anonymous: bool, waitingId, doneId }
  const of = source => {
    if (!state.has(source)) state.set(source, { sessions: new Set(), anonymous: false, waitingId: null, doneId: null });
    return state.get(source);
  };

  // Riallinea l'avviso di attesa di un agente allo stato attuale.
  function renderWaiting(source, entry, { allowNew }) {
    const pending = entry.anonymous || entry.sessions.size > 0;
    const shown = entry.waitingId && queue.has(entry.waitingId);
    if (!pending) { if (shown) queue.remove(entry.waitingId); entry.waitingId = null; return; }
    const body = waitingText(AGENTS[source], entry);
    if (shown) { queue.update(entry.waitingId, { body }); return; }
    if (!allowNew) return;
    entry.waitingId = queue.add({ title: AGENTS[source], body, sticky: true, agent: true })?.id || null;
  }

  function handle(event) {
    const { state: kind, source } = event || {};
    if (!AGENTS[source] || !enabled()) return;
    const session = SESSION.test(event.session || '') ? event.session : null;
    const entry = of(source), visible = ready();
    if (kind === 'waiting') {
      // Mascotte nascosta: un'attesa nuova si scarta; non viene ricordata per dopo.
      if (!visible) return;
      if (session) entry.sessions.add(session); else entry.anonymous = true;
      renderWaiting(source, entry, { allowNew: true });
      return;
    }
    if (kind === 'done' || RESUME.has(kind)) {
      // Solo una sessione identificata chiude la propria attesa; un evento anonimo non chiude nulla.
      if (session && entry.sessions.delete(session)) renderWaiting(source, entry, { allowNew: false });
      if (kind === 'done' && visible) {
        // Fine turno ravvicinati: uno solo, con gli 8 secondi contati dalla prima comparsa.
        if (!(entry.doneId && queue.has(entry.doneId))) entry.doneId = queue.add({ title: AGENTS[source], body: `${AGENTS[source]} ha concluso il turno`, agent: true })?.id || null;
      }
    }
  }

  // Clic su testo o «×» di un avviso: se è un'attesa, prende atto di tutte quelle che rappresenta.
  function dismissed(id) {
    for (const entry of state.values()) {
      if (entry.waitingId === id) { entry.sessions.clear(); entry.anonymous = false; entry.waitingId = null; }
      if (entry.doneId === id) entry.doneId = null;
    }
  }

  // Opzione spenta: via gli avvisi degli agenti e tutto lo stato.
  function reset() {
    for (const entry of state.values()) for (const id of [entry.waitingId, entry.doneId]) if (id && queue.has(id)) queue.remove(id);
    state.clear();
  }

  return { handle, dismissed, reset };
}

module.exports = { createAgentNotices, RESUME, AGENTS };
