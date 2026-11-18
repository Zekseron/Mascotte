'use strict';
// Base della chat: scorciatoie, stato condiviso, schede, sezioni aperte, invoke.
// Fa parte della chat divisa in più script classici: ordine di caricamento in chat.html (globali condivisi).
const $ = id => document.getElementById(id);
// Nomi dei servizi remoti; per tutto il resto (motore locale) si usa localTitle.
const SERVICE_NAMES = { codex: 'Codex', claude: 'Claude' };
// Pulsante di elenco: tipo, testo, stato disabilitato (solo se indicato) e gestore, nell'ordine in cui si impostano.
function listButton(label, onClick, disabled) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  if (disabled !== undefined) button.disabled = disabled;
  button.addEventListener('click', onClick); return button;
}
// Pulsante che invia un'azione senza dati e mostra la risposta.
const onClickRender = (id, action) => $(id).addEventListener('click', async () => render(await invoke(action)));
let current = null, drafts = { codex: '', claude: '', locale: '' }, watchStream = null, pendingImage = null, memorySource = 'manuale', remotePending = null;
// Servizi remoti già confermati in questa esecuzione: dopo il primo invio i messaggi di testo partono senza nuova conferma.
// La finestra della chat viene solo nascosta, quindi l'elenco dura finché Mascotte resta aperta. Immagini e secondo parere chiedono sempre.
const remoteConfirmed = new Set();
const remoteKey = engine => current?.agent?.enabled ? `${engine}|agent|${current.agent.workspace}` : engine;
let selectedTab = 'chat';
// Impostazioni al posto della chat: l'ingranaggio apre, «← Chat» (o l'ingranaggio di nuovo) torna indietro.
function selectTab(tab) {
  selectedTab = tab;
  const settingsOpen = tab === 'settings';
  document.querySelector('h1').textContent = settingsOpen ? 'Impostazioni' : 'Due parole?';
  $('watch-dot').hidden = !current?.watching;
  $('settings-panel').hidden = !settingsOpen;
  for (const id of ['messages', 'status', 'composer']) $(id).hidden = settingsOpen;
  $('chat-controls').hidden = settingsOpen;
  document.querySelector('footer').hidden = settingsOpen;
  $('watch-toggle').hidden = settingsOpen || !current?.watchAvailable;
  if (settingsOpen) { openWatchPanel(false); openAttachMenu(false); }
  $('watch-chip').hidden = settingsOpen || !current?.watching;
  $('agent-panel').hidden = settingsOpen || current?.engine === 'locale';
  $('settings-toggle').setAttribute('aria-pressed', String(settingsOpen));
}
// Sezioni aperte delle impostazioni: ricordate tra una apertura e l'altra (se il browser non permette di salvarle, si parte dalla prima).
const SECTIONS_KEY = 'mascotte-sezioni-aperte';
function restoreSections() {
  let open = ['sec-mascotte'];
  try { const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY)); if (Array.isArray(saved)) open = saved; } catch {}
  for (const section of document.querySelectorAll('details.sec')) {
    section.open = open.includes(section.id);
    section.addEventListener('toggle', () => { try { localStorage.setItem(SECTIONS_KEY, JSON.stringify([...document.querySelectorAll('details.sec[open]')].map(item => item.id))); } catch {} });
  }
}
async function invoke(action, data) {
  try { return await window.mascotte.invoke(action, data); }
  catch { $(selectedTab === 'settings' ? 'settings-error' : 'status').textContent = 'Operazione non completata. Puoi riprovare.'; }
}