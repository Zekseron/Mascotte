'use strict';
// Diagnostica (Impostazioni → Diagnostica): controlla in locale se le cose che servono a Mascotte sono a posto e, per
// ciascuna che non lo è, dice in parole semplici cosa significa e dove guardare. La guida completa, con i passi
// dettagliati e cosa comporta ogni scelta, è PROBLEMI.md (stesse voci, ancore = `help`).
// Qui c'è solo la traduzione da «fatti» a esiti: i fatti li raccoglie main.cjs (comandi di sistema, impostazioni, stato
// dell'app) e arrivano come oggetto, così i controlli si provano senza Electron. Nulla viene inviato fuori dal computer;
// il resoconto da copiare contiene solo esiti, versione e sistema (nessun percorso, nome utente o testo personale).

const GUIDE = 'https://github.com/Zekseron/Mascotte/blob/main/PROBLEMI.md';
const ICON = { ok: '✅', avviso: '⚠️', problema: '❌', info: 'ℹ️' };

// Ogni controllo: (fatti) → { stato, testo } oppure null se non riguarda questo sistema o non è stato misurato.
const CHECKS = [
  { id: 'firma', title: 'Firma dell’app', help: 'firma', settings: null, mac: true, check: f => {
    if (f.signatureTrusted === null || f.signatureTrusted === undefined) return { stato: 'info', testo: 'Si controlla solo nell’app installata (non in quella avviata dai sorgenti).' };
    return f.signatureTrusted
      ? { stato: 'ok', testo: 'Questo Mac riconosce la firma di Mascotte.' }
      : { stato: f.notificationTest === 'ok' ? 'avviso' : 'problema', testo: f.notificationTest === 'ok'
        ? 'Questo Mac non si fida della firma di Mascotte. Le notifiche di sistema per ora funzionano, ma macOS potrebbe bloccarle (per esempio dopo un aggiornamento). Il fumetto accanto alla mascotte funziona comunque.'
        : 'Questo Mac non si fida della firma di Mascotte: è la causa più probabile se le notifiche di sistema non partono e Mascotte non compare in Impostazioni di Sistema → Notifiche. Il fumetto accanto alla mascotte funziona comunque.' };
  } },
  { id: 'notifiche', title: 'Notifiche di sistema', help: 'notifiche', settings: 'notifiche', check: f => {
    const failed = f.notificationTest === 'failed' || f.lastNotificationFailure;
    const covered = f.notices === 'fumetto' && f.mascotVisible;
    if (failed) return covered
      ? { stato: 'avviso', testo: 'Le notifiche di sistema non partono. Finché la mascotte è visibile gli avvisi arrivano nel fumetto; se la nascondi, compaiono nella chat.' }
      : { stato: 'problema', testo: 'Le notifiche di sistema non partono: promemoria e conferme compaiono solo nella chat di Mascotte.' };
    if (f.notificationTest === 'ok') return { stato: 'ok', testo: 'La notifica di prova è stata accettata dal sistema. Se non l’hai vista, controlla la modalità Non disturbare o le impostazioni delle notifiche.' };
    return { stato: 'info', testo: 'Il sistema non ha confermato la notifica di prova. Se non l’hai vista comparire, apri le impostazioni delle notifiche.' };
  } },
  { id: 'fumetto', title: 'Fumetto degli avvisi', help: 'fumetto', settings: null, check: f => {
    if (f.notices === 'sistema') return { stato: 'info', testo: 'Hai scelto le notifiche di sistema (Impostazioni → Sveglie e promemoria → Avvisi di Mascotte).' };
    return f.mascotVisible
      ? { stato: 'ok', testo: 'Gli avvisi compaiono nel fumetto accanto alla mascotte.' }
      : { stato: 'avviso', testo: 'La mascotte è nascosta: finché resta nascosta gli avvisi vanno alle notifiche di sistema. Per mostrarla: clic destro sull’icona di Mascotte nella barra dei menu → Mostra.' };
  } },
  { id: 'registrazione-schermo', title: 'Registrazione schermo', help: 'registrazione-schermo', settings: 'registrazione-schermo', mac: true, check: f => {
    if (!f.screenAccess) return null;
    if (f.screenAccess === 'granted') return { stato: 'ok', testo: 'Permesso concesso: l’osservazione delle finestre può funzionare.' };
    if (f.screenAccess === 'not-determined') return { stato: 'info', testo: 'Non ancora chiesto. Serve solo per osservare una finestra dalla chat.' };
    return { stato: 'avviso', testo: 'Permesso negato: l’osservazione delle finestre non funziona. Serve solo per quella funzione.' };
  } },
  { id: 'hook', title: 'Collegamento a Claude e Codex (hook)', help: 'hook', settings: null, check: f => {
    if (f.hooks === 'active') return { stato: 'ok', testo: 'Gli hook sono installati e puntano a questa copia di Mascotte.' };
    if (f.hooks === 'moved') return { stato: 'problema', testo: 'Gli hook puntano a un’altra posizione dell’app (l’hai spostata?): la mascotte non reagisce alle sessioni. Premi «Crea / aggiorna hook» nella sezione Hook.' };
    return f.agentNotices
      ? { stato: 'avviso', testo: 'Gli avvisi di Claude e Codex sono accesi, ma gli hook non sono installati: non arriverà nessun avviso. Premi «Crea / aggiorna hook» nella sezione Hook.' }
      : { stato: 'info', testo: 'Non installati. Servono solo se vuoi che la mascotte reagisca alle sessioni di Claude Code e Codex.' };
  } },
  ...['claude', 'codex'].map(agent => ({ id: agent, title: agent === 'claude' ? 'Claude Code' : 'Codex', help: 'login', settings: null, check: f => {
    const name = agent === 'claude' ? 'Claude Code' : 'Codex', cli = f.cli?.[agent];
    if (!cli || !cli.found) return { stato: 'info', testo: `${name} non è installato su questo computer (facoltativo).` };
    if (cli.login === true) return { stato: 'ok', testo: `${name} è installato e risulta un accesso. Se le risposte non arrivano, l’accesso potrebbe essere scaduto: rifallo dal terminale.` };
    if (cli.login === false) return { stato: 'avviso', testo: `${name} è installato ma non risulta nessun accesso: le richieste a ${name} non funzioneranno.` };
    return { stato: 'info', testo: `${name} è installato; non sono riuscito a controllare l’accesso.` };
  } })),
  { id: 'ia-locale', title: 'IA locale', help: 'ia-locale', settings: null, check: f => f.localAvailable
    ? { stato: 'ok', testo: 'Il motore locale risponde.' }
    : { stato: 'info', testo: 'Il motore locale non è pronto. È facoltativo: serve per la chat locale, i promemoria e i comandi come «apri».' } },
  { id: 'eventi', title: 'Ricezione degli eventi', help: 'eventi', settings: null, check: f => {
    if (!f.eventServer) return { stato: 'problema', testo: 'Mascotte non riesce a ricevere gli eventi degli hook: la mascotte non reagirà alle sessioni di Claude Code e Codex. Chiudi le altre copie di Mascotte e riaprila.' };
    const port = Number.isInteger(f.eventPort) ? ` sulla porta ${f.eventPort}` : '';
    if (!f.preferredBusy) return { stato: 'ok', testo: `Mascotte è pronta a ricevere gli eventi degli hook${port}.` };
    const owner = f.preferredOwner ? `da «${f.preferredOwner}»` : 'da un altro programma';
    return { stato: 'info', testo: `La porta abituale ${f.preferredPort || 8766} è già usata ${owner}, quindi Mascotte riceve gli eventi${port}. Gli hook la trovano da soli: non devi fare nulla.` };
  } },
  { id: 'posizione', title: 'Posizione dell’app', help: 'posizione', settings: null, mac: true, check: f => {
    if (f.inApplications === null || f.inApplications === undefined) return null;
    return f.inApplications
      ? { stato: 'ok', testo: 'Mascotte è nella cartella Applicazioni.' }
      : { stato: 'avviso', testo: 'Mascotte non è nella cartella Applicazioni: «Controlla aggiornamenti» potrebbe non riuscire a sostituirla. Spostala in Applicazioni e riaprila.' };
  } },
];

function evaluate(facts, { platform = process.platform } = {}) {
  const results = [];
  for (const item of CHECKS) {
    if (item.mac && platform !== 'darwin') continue;
    let outcome = null;
    try { outcome = item.check(facts || {}); } catch { outcome = { stato: 'info', testo: 'Controllo non riuscito.' }; }
    if (outcome) results.push({ id: item.id, title: item.title, ...outcome, help: `${GUIDE}#${item.help}`, settings: platform === 'darwin' ? item.settings : null });
  }
  return results;
}

// Testo da copiare e mandare a chi aiuta: solo esiti, versione e sistema.
function report(results, { version, platform, osVersion }) {
  const head = `Mascotte ${version} · ${platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : platform} ${osVersion || ''}`.trim();
  return [head, ...results.map(r => `${ICON[r.stato] || ''} ${r.title}: ${r.testo}`)].join('\n');
}

// Pagine di Impostazioni di Sistema che la diagnostica può aprire (solo Mac, solo da questo elenco fisso).
const MAC_SETTINGS = {
  notifiche: 'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
  'registrazione-schermo': 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
};

// Nome del programma che tiene una porta in ascolto. Mac: `lsof -Fc` (righe «p<pid>», «c<nome>»). Windows: `netstat -ano`
// (riga TCP in LISTENING sulla porta → PID) e `tasklist /FO CSV /NH` (primo campo = nome). Nomi lunghi o strani: scartati.
const cleanName = name => typeof name === 'string' && /^[\w .()+-]{1,60}$/.test(name.trim()) ? name.trim() : null;
function parseLsofCommand(stdout) {
  const line = String(stdout || '').split(/\r?\n/).find(l => l.startsWith('c'));
  return line ? cleanName(line.slice(1)) : null;
}
function parseNetstatPid(stdout, port) {
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length >= 5 && /^TCP$/i.test(cols[0]) && new RegExp(`[:.]${port}$`).test(cols[1]) && /^(LISTENING|IN ASCOLTO)$/i.test(cols[3]) && /^\d+$/.test(cols[4])) return Number(cols[4]);
  }
  return null;
}
function parseTasklistName(stdout) {
  const match = String(stdout || '').match(/^"([^"]+)"/m);
  return match ? cleanName(match[1]) : null;
}

module.exports = { evaluate, report, CHECKS, MAC_SETTINGS, GUIDE, ICON, parseLsofCommand, parseNetstatPid, parseTasklistName };
