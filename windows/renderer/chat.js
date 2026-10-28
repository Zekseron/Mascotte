'use strict';
const $ = id => document.getElementById(id);
let current = null, drafts = { codex: '', claude: '', locale: '' }, watchStream = null, pendingImage = null, memorySource = 'manuale', remotePending = null;
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
    watchStream = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: {
      width: { max: 1600 }, height: { max: 900 }, frameRate: { max: 5 }
    } });
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
  $('release-update').disabled = !management.available || locked || Boolean(value.setup);
  $('release-update').textContent = management.running ? 'Aggiornamento in corso…' : 'Controlla aggiornamenti';
  $('cli-status').textContent = `Codex: ${value.available.includes('codex') ? 'trovato' : 'non trovato'} · Claude: ${value.available.includes('claude') ? 'trovato' : 'non trovato'}`;
  $('local-download').disabled = locked || Boolean(value.setup);
  $('local-download-cancel').hidden = !value.localDownloading;
  $('local-check').disabled = locked;
  $('local-status').textContent = value.localDownloadStatus || (value.available.includes('locale') ? 'Modello locale pronto.' : 'Ollama o modello locale non disponibile.');
  const localCatalog = value.localCatalog;
  $('local-intro').textContent = localCatalog.intro;
  if ($('local-model').options.length !== localCatalog.models.length || localCatalog.models.some((model, index) => $('local-model').options[index].value !== model.tag || $('local-model').options[index].textContent !== model.label))
    $('local-model').replaceChildren(...localCatalog.models.map(model => { const option = document.createElement('option'); option.value = model.tag; option.textContent = model.label; return option; }));
  $('local-model').value = value.localModel;
  $('local-vision-hardware').textContent = localCatalog.visionNote;
  $('local-vision-hardware').hidden = !value.localVision;
  const localWarning = localCatalog.models.find(model => model.tag === value.localModel)?.warning || '';
  $('local-hardware').textContent = localWarning; $('local-hardware').hidden = !localWarning;
  $('local-model').disabled = locked;
  $('local-install-command').textContent = `Nel terminale: ollama pull ${value.localModel}`;
  $('memory-list').replaceChildren();
  for (const note of value.memories || []) {
    const item = document.createElement('div'); item.className = 'memory-note';
    const text = document.createElement('p'); text.textContent = note.text;
    const origin = document.createElement('small'); origin.textContent = 'Fonte: ' + note.source;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Elimina'; remove.disabled = locked;
    remove.addEventListener('click', async () => render(await invoke('memory-remove', note.id)));
    item.append(text, origin, remove); $('memory-list').append(item);
  }
  const folders = management.folders || { defaults: [], extra: [], max: 20 };
  const folderRow = (folder, removable, index) => {
    const row = document.createElement('div'); row.className = 'folder-row';
    const name = document.createElement('strong'); name.textContent = folder.name;
    const where = document.createElement('p'); where.className = 'local-path'; where.textContent = folder.path;
    row.append(name, where);
    if (removable) { const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Rimuovi'; remove.disabled = locked || Boolean(value.setup); remove.addEventListener('click', async () => render(await invoke('folders-remove', index))); row.append(remove); }
    return row;
  };
  $('folder-defaults').replaceChildren(...folders.defaults.map(folder => folderRow(folder, false)));
  $('folder-extra').replaceChildren(...folders.extra.map((folder, index) => folderRow(folder, true, index)));
  $('folders-add').disabled = locked || Boolean(value.setup) || folders.extra.length >= folders.max;
  $('folder-status').textContent = folders.status || ''; $('folder-status').className = folders.failed ? 'error' : '';
  $('update-app').disabled = !management.available || !management.repoPath || locked || Boolean(value.setup);
  $('update-app').textContent = management.running ? 'Aggiornamento in corso…' : 'Compila e aggiorna';
  $('manage-hooks').disabled = !management.available || locked;
  $('update-status').textContent = management.available ? management.status || '' : 'Aggiornamenti e hook disponibili nel pacchetto Windows.';
  $('update-status').className = management.failed ? 'error' : '';
  $('hook-status').textContent = value.notice || '';
  $('engine').value = value.engine;
  $('account-hint').textContent = value.engine === 'locale' ? `Chat locale su questo ${value.deviceName}` : 'Usa il tuo account IA';
  $('engine').disabled = $('new').disabled = $('input').disabled = locked;
  $('messages').replaceChildren();
  if (!value.messages.length) {
    const intro = document.createElement('p'); intro.className = 'intro';
    intro.textContent = 'Ciao! Scegli Locale, Codex o Claude e scrivimi qui. Le conversazioni restano separate.';
    $('messages').append(intro);
  }
  for (const [index, message] of value.messages.entries()) {
    const item = document.createElement('section'); item.className = 'message ' + message.role;
    const name = document.createElement('strong'); name.textContent = message.role === 'user' ? 'Tu' : value.engine === 'codex' ? 'Codex' : value.engine === 'claude' ? 'Claude' : 'Locale';
    const text = document.createElement('span'); text.textContent = message.text;
    item.append(name, text);
    if (message.role === 'assistant') { const remember = document.createElement('button'); remember.type = 'button'; remember.textContent = 'Ricorda…'; remember.disabled = locked; remember.addEventListener('click', () => openMemory(message.text, value.engine)); item.append(remember); }
    if (message.role === 'assistant' && value.engine === 'locale') {
      const question = [...value.messages.slice(0, index)].reverse().find(entry => entry.role === 'user')?.text || '';
      const ask = document.createElement('button'); ask.type = 'button'; ask.textContent = 'Chiedi a Codex o Claude…'; ask.disabled = locked;
      ask.addEventListener('click', () => openRemote(`Domanda: ${question}\n\nRisposta locale da approfondire o verificare: ${message.text}`.slice(0, 8000), 'codex', null, true));
      item.append(ask);
    }
    $('messages').append(item);
  }
  $('messages').scrollTop = $('messages').scrollHeight;
  $('status').textContent = value.busy ? 'Sta pensando…' : value.notice || (value.available.includes(value.engine) ? 'Pronto · ' + (value.engine === 'codex' ? 'Codex' : value.engine === 'claude' ? 'Claude' : 'locale') : value.engine === 'locale' ? 'Installa Ollama e il modello in Gestione.' : 'Installa e accedi alla CLI ' + value.engine);
  $('status').className = value.notice ? 'error' : '';
  $('send').textContent = value.busy ? 'Interrompi' : 'Invia ↗';
  $('send').disabled = management.running || (!value.busy && !$('input').value.trim());
  $('watch-summary').textContent = value.watching
    ? (value.engine === 'locale' && !value.localVision ? 'Anteprima attiva - IA locale senza visione' : 'Anteprima attiva - allega un fotogramma')
    : 'Finestra da condividere';
  $('watch-summary').title = value.watching ? value.watchName : '';
  $('watch-help').textContent = value.engine === 'locale' && !value.localVision
    ? 'I modelli locali disponibili leggono solo testo: questa anteprima non viene vista da Ollama. Per fare una domanda su un fotogramma, scegli Codex o Claude e allegalo: ogni invio richiede conferma.'
    : value.engine === 'locale' ? 'Il modello locale vede solo il fotogramma che alleghi e confermi, non la finestra in diretta. Il fotogramma resta sul ' + value.deviceName + ' e non viene salvato nella cronologia. Per fermare la cattura usa Smetti.'
    : "L'anteprima resta sul PC. Il servizio vede solo il fotogramma che alleghi e confermi, non la finestra in diretta. Chiudere questa sezione nasconde l'anteprima ma non ferma la cattura: usa Smetti.";
  $('share-view').disabled = (value.engine === 'locale' && !value.localVision) || !value.watching || locked || !watchStream;
  $('share-view').title = value.engine === 'locale' && !value.localVision ? `Scegli ${localCatalog.visionChoice} in Gestione per analizzare immagini.` : '';
  $('toggle-watch').hidden = value.watching; $('stop-watch').hidden = !value.watching;
  $('watch-source').disabled = value.watching;
  if (value.setup) {
    $('claude-preview').textContent = value.setup.claude; $('codex-preview').textContent = value.setup.codex;
    if (!$('setup-dialog').open) $('setup-dialog').showModal();
  } else if ($('setup-dialog').open) $('setup-dialog').close();
  if (value.pendingAction) { $('pc-action-description').textContent = value.pendingAction.description; if (!$('pc-action-dialog').open) $('pc-action-dialog').showModal(); }
  else if ($('pc-action-dialog').open) $('pc-action-dialog').close();
}
function openMemory(text = '', source = 'manuale') { memorySource = source; $('memory-text').value = text.slice(0, 2000); $('memory-dialog').showModal(); }
function openRemote(text, engine, imageData = null, noHistory = false) {
  remotePending = { imageData, noHistory };
  $('remote-engine').value = engine; $('remote-engine').disabled = !noHistory;
  $('remote-text').value = text;
  const context = noHistory ? [] : current.messages.filter(message => ['user', 'assistant'].includes(message.role)).slice(-20);
  $('remote-context').textContent = context.length ? JSON.stringify(context, null, 2) : 'Nessun messaggio precedente.';
  $('remote-image-status').textContent = imageData ? 'È incluso anche il fotogramma che hai appena approvato.' : 'Nessuna immagine allegata.';
  $('remote-dialog').showModal();
}
async function submit(imageData = null, noHistory = false, confirmed = false) {
  if (current?.management?.running) return;
  if (current?.busy) { await invoke('stop'); return; }
  const text = $('input').value.trim(); if (!text) return;
  const engine = current.engine;
  if (engine !== 'locale' && !confirmed) { openRemote(text, engine, imageData, noHistory); return; }
  $('input').value = ''; drafts[engine] = ''; $('send').disabled = true;
  await invoke('send', imageData ? { text, imageData } : noHistory ? { text, noHistory: true } : text);
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
  $('share-notice').textContent = current.engine === 'locale' ? 'Confermando, il fotogramma viene analizzato dal modello locale sul ' + current.deviceName + '. Non viene inviato a Codex o Claude e non viene salvato nella cronologia.' : `Il fotogramma resta sul dispositivo finché non confermi. Confermando, viene inviato a ${current.engine === 'codex' ? 'Codex' : 'Claude'} con il tuo account. Non viene salvato nella cronologia Mascotte.`;
  $('share-dialog').showModal();
}
$('composer').addEventListener('submit', event => { event.preventDefault(); submit(); });
$('input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } });
$('input').addEventListener('input', () => { if (current) drafts[current.engine] = $('input').value; $('send').disabled = !current?.busy && !$('input').value.trim(); });
$('engine').addEventListener('change', async () => { const next = await invoke('engine', $('engine').value); $('input').value = drafts[next.engine] || ''; render(next); $('input').focus(); });
$('new').addEventListener('click', async () => { $('input').value = ''; drafts[current.engine] = ''; render(await invoke('new')); });
$('tab-chat').addEventListener('click', () => selectTab('chat'));
$('tab-management').addEventListener('click', () => selectTab('management'));
$('folders-add').addEventListener('click', async () => render(await invoke('folders-add')));
$('choose-repo').addEventListener('click', async () => render(await invoke('repo-select')));
$('release-update').addEventListener('click', async () => render(await invoke('release-update')));
$('guide-codex').addEventListener('click', () => invoke('cli-guide', 'codex'));
$('guide-claude').addEventListener('click', () => invoke('cli-guide', 'claude'));
$('local-download').addEventListener('click', async () => render(await invoke('local-download')));
$('local-download-cancel').addEventListener('click', async () => render(await invoke('local-download-cancel')));
$('guide-ollama').addEventListener('click', () => invoke('cli-guide', 'ollama'));
$('local-check').addEventListener('click', async () => render(await invoke('local-check')));
$('local-model').addEventListener('change', async () => render(await invoke('local-model', $('local-model').value)));
$('memory-new').addEventListener('click', () => openMemory());
$('memory-cancel').addEventListener('click', () => $('memory-dialog').close());
$('memory-save').addEventListener('click', async () => { const text = $('memory-text').value.trim(); if (!text) return; const result = await invoke('memory-add', { text, source: memorySource }); if (result?.notice?.startsWith('Nota salvata')) $('memory-dialog').close(); render(result); });
$('pc-action-cancel').addEventListener('click', async () => render(await invoke('pc-action-cancel')));
$('pc-action-confirm').addEventListener('click', async () => render(await invoke('pc-action-confirm', current?.pendingAction?.id)));
$('pc-action-dialog').addEventListener('cancel', () => invoke('pc-action-cancel'));
$('remote-cancel').addEventListener('click', () => { remotePending = null; $('remote-dialog').close(); });
$('remote-dialog').addEventListener('cancel', () => { remotePending = null; });
$('remote-confirm').addEventListener('click', async () => { const text = $('remote-text').value.trim(); if (!text || !remotePending) return; const selected = $('remote-engine').value, pending = remotePending; remotePending = null; $('remote-dialog').close(); const next = await invoke('engine', selected); $('input').value = text; render(next); await submit(pending.imageData, pending.noHistory, true); });
$('guide-git').addEventListener('click', () => invoke('cli-guide', 'git'));
$('guide-node').addEventListener('click', () => invoke('cli-guide', 'node'));
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
// Riaprendo la chat (barra dei menu, mascotte) il cursore torna nel campo, se non c'è un dialogo aperto o un altro campo/elenco in uso.
window.addEventListener('focus', () => { if (!document.querySelector('dialog[open]') && !document.activeElement?.matches('textarea, input, select') && !$('input').disabled) $('input').focus(); });
