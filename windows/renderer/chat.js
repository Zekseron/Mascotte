'use strict';
const $ = id => document.getElementById(id);
let current = null, drafts = { codex: '', claude: '' }, watchStream = null, pendingImage = null;
let selectedTab = 'chat';
function selectTab(tab) {
  selectedTab = tab;
  const managing = tab === 'management';
  document.querySelector('h1').textContent = managing ? 'Gestione' : 'Due parole?';
  $('tab-chat').textContent = current?.watching ? 'Chat · osserva' : 'Chat';
  $('management-panel').hidden = !managing;
  for (const id of ['messages', 'status', 'composer']) $(id).hidden = managing;
  document.querySelector('header .controls').hidden = managing;
  document.querySelector('footer').hidden = managing;
  $('watch-panel').hidden = managing || !current?.watchAvailable;
  $('tab-chat').setAttribute('aria-pressed', String(!managing));
  $('tab-management').setAttribute('aria-pressed', String(managing));
}
async function invoke(action, data) {
  try { return await window.mascotte.invoke(action, data); }
  catch { $(selectedTab === 'management' ? 'update-status' : 'status').textContent = 'Operazione non completata. Puoi riprovare.'; }
}
function clearPendingImage() {
  pendingImage = null; $('share-preview').removeAttribute('src');
  if ($('share-dialog').open) $('share-dialog').close();
}
function stopWatchLocal() {
  for (const track of watchStream?.getTracks() || []) track.stop();
  watchStream = null; $('watch-video').srcObject = null; $('watch-video').classList.remove('active');
  $('watch-state').textContent = 'Osservazione spenta · acquisizione solo locale';
  clearPendingImage();
}
async function stopWatching() { stopWatchLocal(); render(await invoke('watch-disable')); }
async function refreshWatchSources() {
  const sources = await invoke('watch-sources');
  if (!Array.isArray(sources)) return;
  const select = $('watch-source'); select.replaceChildren(new Option('Scegli una finestra', ''));
  for (const source of sources) select.add(new Option(source.name, source.id));
  select.disabled = false; $('toggle-watch').disabled = !select.value;
  $('watch-state').textContent = sources.length ? 'Seleziona una finestra. L’elenco resta su questo PC.' : 'Non trovo finestre da osservare.';
}
async function startWatching() {
  const id = $('watch-source').value; if (!id) return;
  const source = await invoke('watch-enable', { id });
  if (!source?.id) { if (source?.messages) render(source); return; }
  try {
    watchStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: {
      chromeMediaSource: 'desktop', chromeMediaSourceId: source.id, maxWidth: 1600, maxHeight: 900, maxFrameRate: 5
    } } });
    $('watch-video').srcObject = watchStream; $('watch-video').classList.add('active');
    await $('watch-video').play(); $('watch-state').textContent = `Osservazione locale attiva · ${source.name}`;
    for (const track of watchStream.getTracks()) track.addEventListener('ended', () => { if (watchStream) stopWatching(); }, { once: true });
    render(await invoke('snapshot'));
  } catch {
    stopWatchLocal(); $('watch-state').textContent = 'Non riesco ad acquisire questa finestra.';
    render(await invoke('watch-disable'));
  }
}
function render(value) {
  if (!value) return;
  current = value;
  const management = value.management || {};
  const locked = value.busy || management.running;
  selectTab(selectedTab);
  $('app-version').textContent = `MASCOTTE ${management.version || ''}`;
  $('repo-path').textContent = management.repoPath || 'Nessuna repo selezionata.';
  $('choose-repo').disabled = !management.available || management.running;
  $('update-app').disabled = !management.available || !management.repoPath || locked || Boolean(value.setup);
  $('update-app').textContent = management.running ? 'Aggiornamento in corso…' : 'Aggiorna e riavvia';
  $('manage-hooks').disabled = !management.available || locked;
  $('update-status').textContent = management.available ? management.status || '' : 'Aggiornamenti e hook disponibili nel pacchetto Windows.';
  $('update-status').className = management.failed ? 'error' : '';
  $('hook-status').textContent = value.notice || '';
  $('engine').value = value.engine;
  $('engine').disabled = $('new').disabled = $('input').disabled = locked;
  $('messages').replaceChildren();
  if (!value.messages.length) {
    const intro = document.createElement('p'); intro.className = 'intro';
    intro.textContent = 'Ciao! Scegli Claude o Codex e scrivimi qui. Le due conversazioni restano separate.';
    $('messages').append(intro);
  }
  for (const message of value.messages) {
    const item = document.createElement('section'); item.className = 'message ' + message.role;
    const name = document.createElement('strong'); name.textContent = message.role === 'user' ? 'Tu' : value.engine === 'codex' ? 'Codex' : 'Claude';
    const text = document.createElement('span'); text.textContent = message.text;
    item.append(name, text); $('messages').append(item);
  }
  $('messages').scrollTop = $('messages').scrollHeight;
  $('status').textContent = value.busy ? 'Sta pensando…' : value.notice || (value.available.includes(value.engine) ? 'Pronto · ' + (value.engine === 'codex' ? 'Codex' : 'Claude') : 'Installa e accedi alla CLI ' + value.engine);
  $('status').className = value.notice ? 'error' : '';
  $('send').textContent = value.busy ? 'Interrompi' : 'Invia ↗';
  $('send').disabled = management.running || (!value.busy && !$('input').value.trim());
  $('share-view').disabled = !value.watching || locked || !watchStream;
  $('toggle-watch').hidden = value.watching; $('stop-watch').hidden = !value.watching;
  $('watch-source').disabled = value.watching;
  if (value.setup) {
    $('claude-preview').textContent = value.setup.claude; $('codex-preview').textContent = value.setup.codex;
    if (!$('setup-dialog').open) $('setup-dialog').showModal();
  } else if ($('setup-dialog').open) $('setup-dialog').close();
}
async function submit(imageData = null) {
  if (current?.management?.running) return;
  if (current?.busy) { await invoke('stop'); return; }
  const text = $('input').value.trim(); if (!text) return;
  const engine = current.engine;
  $('input').value = ''; drafts[engine] = ''; $('send').disabled = true;
  await invoke('send', imageData ? { text, imageData } : text);
  const next = await invoke('snapshot');
  if (next?.notice) { $('input').value = text; drafts[engine] = text; }
  render(next); $('input').focus();
}
function prepareShare() {
  const video = $('watch-video');
  if (!$('input').value.trim()) { $('status').textContent = 'Scrivi una domanda prima di allegare il fotogramma.'; return; }
  if (!watchStream || !video.videoWidth || !video.videoHeight) return;
  const scale = Math.min(1, 1600 / video.videoWidth, 900 / video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  pendingImage = canvas.toDataURL('image/jpeg', .78);
  $('share-preview').src = pendingImage;
  $('share-notice').textContent = `Il fotogramma resta sul dispositivo finché non confermi. Confermando, viene inviato a ${current.engine === 'codex' ? 'Codex' : 'Claude'} con il tuo account. Non viene salvato nella cronologia Mascotte.`;
  $('share-dialog').showModal();
}
$('composer').addEventListener('submit', event => { event.preventDefault(); submit(); });
$('input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } });
$('input').addEventListener('input', () => { if (current) drafts[current.engine] = $('input').value; $('send').disabled = !current?.busy && !$('input').value.trim(); });
$('engine').addEventListener('change', async () => { const next = await invoke('engine', $('engine').value); $('input').value = drafts[next.engine] || ''; render(next); $('input').focus(); });
$('new').addEventListener('click', async () => { $('input').value = ''; drafts[current.engine] = ''; render(await invoke('new')); });
$('tab-chat').addEventListener('click', () => selectTab('chat'));
$('tab-management').addEventListener('click', () => selectTab('management'));
$('choose-repo').addEventListener('click', async () => render(await invoke('repo-select')));
$('update-app').addEventListener('click', async () => render(await invoke('update-run')));
$('manage-hooks').addEventListener('click', async () => render(await invoke('setup-preview')));
$('apply').addEventListener('click', async () => render(await invoke('setup-apply')));
$('dismiss').addEventListener('click', async () => render(await invoke('setup-dismiss')));
$('setup-dialog').addEventListener('cancel', () => invoke('setup-dismiss'));
$('refresh-watch').addEventListener('click', refreshWatchSources);
$('watch-source').addEventListener('change', () => { $('toggle-watch').disabled = !$('watch-source').value; });
$('toggle-watch').addEventListener('click', startWatching);
$('stop-watch').addEventListener('click', stopWatching);
$('share-view').addEventListener('click', prepareShare);
$('confirm-share').addEventListener('click', async () => { const image = pendingImage; clearPendingImage(); if (image) await submit(image); });
$('cancel-share').addEventListener('click', clearPendingImage);
$('share-dialog').addEventListener('cancel', clearPendingImage);
window.mascotte.onWatchStop(stopWatchLocal);
window.mascotte.onChat(render);
invoke('snapshot').then(value => { render(value); $('input').focus(); });
