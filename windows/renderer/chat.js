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
// Etichetta della risposta locale: con un motore diverso da Ollama dice quale programma risponde, per esempio «Locale · LM Studio · modello».
function localTitle(value, withModel) { return value.localEngine && value.localEngine !== 'ollama' ? `Locale · ${value.localEngineLabel}${withModel ? ' · ' + value.localModel : ''}` : withModel ? 'locale' : 'Locale'; }
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
  $('local-download-cancel').hidden = !value.localDownloading;
  $('local-check').disabled = locked;
  $('local-status').textContent = value.localDownloadStatus || (value.available.includes('locale') ? 'Modello locale pronto.' : `${value.localEngineLabel || 'Ollama'} o modello locale non disponibile.`);
  const localCatalog = value.localCatalog;
  // Motore locale: Ollama (come prima) oppure un server già avviato dall'utente (LM Studio, llama.cpp, Jan), rilevato su richiesta.
  const otherEngine = value.localEngine !== 'ollama', engineLabel = value.localEngineLabel || 'Ollama';
  const statuses = value.localEngines || [];
  const stateText = item => item.state === 'ready' ? `rilevato · ${item.count} ${item.count === 1 ? 'modello' : 'modelli'}` : item.state === 'absent' ? 'non avviato' : item.state === 'auth' ? 'richiede una chiave: non gestita da Mascotte' : item.state === 'unrecognized' ? 'non riconosciuto' : 'non disponibile';
  const engineOptions = [['ollama', 'Ollama', true], ...['lmstudio', 'llamacpp', 'jan'].map(id => { const item = statuses.find(entry => entry.id === id); return [id, item?.label || { lmstudio: 'LM Studio', llamacpp: 'llama.cpp', jan: 'Jan' }[id], Boolean(item && item.state === 'ready' && item.count > 0)]; })];
  const engineSignature = JSON.stringify([engineOptions, statuses.map(item => [item.id, item.state, item.count])]);
  if ($('local-engine').dataset.signature !== engineSignature) {
    $('local-engine').replaceChildren(...engineOptions.map(([id, label, usable]) => { const option = document.createElement('option'); option.value = id; option.disabled = !usable && id !== value.localEngine; option.textContent = id === 'ollama' ? label : `${label} · ${stateText(statuses.find(item => item.id === id) || { state: 'unknown' }).replace('non disponibile', 'non ancora cercato')}`; return option; }));
    $('local-engine').dataset.signature = engineSignature;
  }
  $('local-engine').value = value.localEngine; $('local-engine').disabled = locked;
  $('local-engines-list').replaceChildren(...statuses.map(item => { const line = document.createElement('li'); line.textContent = `${item.label}: ${item.id === 'ollama' ? (item.state === 'ready' ? 'in uso come predefinito, rilevato' : 'non avviato') : stateText(item)}${item.state !== 'ready' && item.state !== 'absent' && item.message ? ' (' + item.message + ')' : ''}`; return line; }));
  $('local-engine-note').textContent = otherEngine ? `Mascotte si collega solo a ${engineLabel} già avviato sul computer (solo 127.0.0.1): non lo avvia, non lo chiude e non scarica modelli. I modelli si gestiscono da ${engineLabel}. Tutto resta sul computer.` : 'Per usare LM Studio, llama.cpp o Jan avvia prima il loro server locale, poi premi «Cerca motori locali». Mascotte non li avvia né scarica modelli per loro.';
  $('local-engine-note').hidden = false;
  // Elenco modelli: catalogo + gruppo «Già presenti sul computer» (letto da Ollama) oppure solo i modelli del motore scelto.
  const found = otherEngine ? (value.localEngineModels?.models || []) : (value.localInstalled?.models || []);
  const present = found.slice();
  if (value.localInstalledSource && !present.some(model => model.name === value.localModel)) present.push({ name: value.localModel, size: 0, vision: value.localVision });
  const gb = size => size > 0 ? ' · ' + (size / 1e9).toFixed(1).replace('.', ',') + ' GB' : '';
  const installedLabel = model => model.name + gb(model.size) + (model.vision ? ' · immagini' : '');
  const catalogModels = otherEngine ? [] : localCatalog.models;
  const signature = JSON.stringify([value.localEngine, catalogModels.map(model => [model.tag, model.label]), present.map(installedLabel)]);
  if ($('local-model').dataset.signature !== signature) {
    const options = catalogModels.map(model => { const option = document.createElement('option'); option.value = model.tag; option.textContent = model.label; return option; });
    if (present.length) {
      const group = document.createElement('optgroup'); group.label = otherEngine ? `Disponibili in ${engineLabel}` : 'Già presenti sul computer';
      group.append(...present.map(model => { const option = document.createElement('option'); option.value = model.name; option.textContent = installedLabel(model); return option; }));
      options.push(group);
    }
    $('local-model').replaceChildren(...options); $('local-model').dataset.signature = signature;
  }
  $('local-model').value = value.localModel;
  $('local-scan').disabled = locked || value.localScanning;
  $('local-scan').textContent = value.localScanning ? 'Cerco…' : 'Cerca motori locali';
  $('guide-ollama').hidden = otherEngine; $('local-download').hidden = otherEngine;
  $('local-download').disabled = locked || Boolean(value.setup) || value.localInstalledSource;
  $('local-download').title = value.localInstalledSource ? 'Mascotte non scarica né aggiorna modelli fuori catalogo.' : '';
  $('local-intro').textContent = otherEngine ? `Chat locale con ${engineLabel}: usa un modello che hai già in ${engineLabel}.` : localCatalog.intro;
  const excluded = (otherEngine ? value.localEngineModels?.excluded : value.localInstalled?.excluded) || [];
  $('local-installed-note').textContent = otherEngine ? (found.length ? `Trovati ${found.length} modelli in ${engineLabel}, usabili senza scaricare altro.` : `Nessun modello idoneo in ${engineLabel}.`) : (value.localInstalled?.error || (value.localInstalled ? (found.length ? `Trovati ${found.length} modelli già presenti, usabili senza scaricare altro. Tutto resta sul computer.` : 'Nessun altro modello idoneo già presente in Ollama.') : ''));
  $('local-installed-note').hidden = otherEngine ? false : !value.localInstalled;
  $('local-excluded').hidden = !excluded.length;
  $('local-excluded-summary').textContent = `${excluded.length} ${excluded.length === 1 ? 'modello escluso' : 'modelli esclusi'}`;
  $('local-excluded-list').replaceChildren(...excluded.map(model => { const item = document.createElement('li'); item.textContent = `${model.name} — escluso: ${model.reason}`; return item; }));
  $('local-vision-hardware').textContent = otherEngine ? (value.localVision ? `${engineLabel} dichiara che questo modello legge le immagini: analizza solo il fotogramma allegato e confermato, sul computer.` : `${engineLabel} non dichiara il supporto alle immagini per questo modello: gli allegati sono disattivati.`) : localCatalog.visionNote;
  $('local-vision-hardware').hidden = otherEngine ? false : !value.localVision;
  const localWarning = (otherEngine ? '' : localCatalog.models.find(model => model.tag === value.localModel)?.warning) || found.find(model => model.name === value.localModel)?.warning || '';
  $('local-hardware').textContent = localWarning; $('local-hardware').hidden = !localWarning;
  $('local-model').disabled = locked;
  $('local-install-command').textContent = otherEngine ? `I modelli si gestiscono da ${engineLabel}.` : value.localInstalledSource ? 'Modello già presente in Ollama: Mascotte lo usa così com’è, senza scaricarlo né aggiornarlo.' : `Nel terminale: ollama pull ${value.localModel}`;
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
  $('engine').querySelector('option[value="locale"]').textContent = value.localEngine && value.localEngine !== 'ollama' ? `Locale · ${value.localEngineLabel}` : 'Locale · Ollama';
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
    const name = document.createElement('strong'); name.textContent = message.role === 'user' ? 'Tu' : value.engine === 'codex' ? 'Codex' : value.engine === 'claude' ? 'Claude' : localTitle(value);
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
  $('status').textContent = value.busy ? 'Sta pensando…' : value.notice || (value.available.includes(value.engine) ? 'Pronto · ' + (value.engine === 'codex' ? 'Codex' : value.engine === 'claude' ? 'Claude' : localTitle(value, true)) : value.engine === 'locale' ? (value.localEngine !== 'ollama' ? `${value.localEngineLabel} o il modello non sono disponibili: controlla in Gestione.` : 'Installa Ollama e il modello in Gestione.') : 'Installa e accedi alla CLI ' + value.engine);
  $('status').className = value.notice ? 'error' : '';
  $('send').textContent = value.busy ? 'Interrompi' : 'Invia ↗';
  $('send').disabled = management.running || (!value.busy && !$('input').value.trim());
  $('watch-summary').textContent = value.watching
    ? (value.engine === 'locale' && !value.localVision ? 'Anteprima attiva - IA locale senza visione' : 'Anteprima attiva - allega un fotogramma')
    : 'Finestra da condividere';
  $('watch-summary').title = value.watching ? value.watchName : '';
  $('watch-help').textContent = value.engine === 'locale' && !value.localVision
    ? `I modelli locali disponibili leggono solo testo: questa anteprima non viene vista da ${value.localEngineLabel || 'Ollama'}. Per fare una domanda su un fotogramma, scegli Codex o Claude e allegalo: ogni invio richiede conferma.`
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
$('tab-management').addEventListener('click', async () => { selectTab('management'); render(await invoke('local-scan')); });
$('local-scan').addEventListener('click', async () => render(await invoke('local-scan')));
$('folders-add').addEventListener('click', async () => render(await invoke('folders-add')));
$('choose-repo').addEventListener('click', async () => render(await invoke('repo-select')));
$('release-update').addEventListener('click', async () => render(await invoke('release-update')));
$('guide-codex').addEventListener('click', () => invoke('cli-guide', 'codex'));
$('guide-claude').addEventListener('click', () => invoke('cli-guide', 'claude'));
$('local-download').addEventListener('click', async () => render(await invoke('local-download')));
$('local-download-cancel').addEventListener('click', async () => render(await invoke('local-download-cancel')));
$('guide-ollama').addEventListener('click', () => invoke('cli-guide', 'ollama'));
$('local-engine').addEventListener('change', async () => render(await invoke('local-engine', $('local-engine').value)));
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
