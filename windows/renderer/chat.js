'use strict';
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
  $('watch-panel').hidden = settingsOpen || !current?.watchAvailable;
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
  $('watch-permission').hidden = !sources?.permission;
  if (sources?.permission) { $('watch-state').textContent = sources.message; return; }
  if (!Array.isArray(sources)) return;
  const select = $('watch-source'); select.replaceChildren(new Option('Scegli una finestra', ''));
  for (const source of sources) select.add(new Option(source.name, source.id));
  select.disabled = false; $('toggle-watch').disabled = !select.value;
  $('watch-state').textContent = sources.length ? `Seleziona una finestra. L’elenco resta su questo ${current?.deviceName || 'PC'}.` : 'Non trovo finestre da osservare.';
  // Su Mac si possono osservare solo le finestre sullo schermo: non quelle ridotte nel Dock o in un altro gruppo di Stage Manager.
  if (current?.deviceName === 'Mac') $('watch-state').textContent += ' Manca una finestra? Portala in primo piano (non ridotta nel Dock né in un altro gruppo di Stage Manager) e premi «Aggiorna elenco».';
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
// I dettagli di motore e modello restano nelle Impostazioni.
function localTitle() { return 'Locale'; }
function render(value) {
  if (!value) return;
  current = value;
  const management = value.management || {};
  const locked = value.busy || management.running;
  selectTab(selectedTab);
  for (const item of document.querySelectorAll('.device')) item.textContent = value.deviceName || 'PC';
  $('settings-error').textContent = '';
  const packageName = management.packageName || 'Windows';
  $('app-version').textContent = `MASCOTTE ${packageName.toUpperCase()} ${management.version || ''}`.trim();
  $('update-intro').textContent = packageName === 'Mac'
    ? 'Controlla le versioni pubblicate e installa l’ultimo pacchetto Mac in Applicazioni. Se in Applicazioni c’è un’altra app Mascotte (la vecchia app Swift), ne viene fatto prima un backup ZIP; poi Mascotte si riavvia.'
    : 'Controlla le versioni pubblicate e installa l’ultimo pacchetto Windows. La versione precedente viene conservata come backup.';
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
  const stateText = item => item.state === 'ready' ? `rilevato · ${item.count} ${item.count === 1 ? 'modello' : 'modelli'}` : item.state === 'absent' ? 'non avviato' : item.state === 'auth' ? 'richiede una chiave: non gestita da Mascotte' : item.state === 'unrecognized' ? 'non riconosciuto' : item.state === 'missing' ? 'da scaricare' : item.state === 'unsupported' ? 'non disponibile su questo computer' : 'non disponibile';
  const engineOptions = [['ollama', 'Ollama', true], ...['lmstudio', 'llamacpp', 'jan', 'llamacpp-mascotte'].map(id => { const item = statuses.find(entry => entry.id === id); return [id, item?.label || { lmstudio: 'LM Studio', llamacpp: 'llama.cpp', jan: 'Jan', 'llamacpp-mascotte': 'llama.cpp (Mascotte)' }[id], id === 'llamacpp-mascotte' ? Boolean(value.localManaged?.supported) : Boolean(item && item.state === 'ready' && item.count > 0)]; })];
  const managedEngine = value.localEngine === 'llamacpp-mascotte', managed = value.localManaged;
  const engineSignature = JSON.stringify([engineOptions, statuses.map(item => [item.id, item.state, item.count]), managed?.complete]);
  if ($('local-engine').dataset.signature !== engineSignature) {
    $('local-engine').replaceChildren(...engineOptions.map(([id, label, usable]) => { const option = document.createElement('option'); option.value = id; option.disabled = !usable && id !== value.localEngine; option.textContent = id === 'ollama' ? label : id === 'llamacpp-mascotte' ? `${label} · ${value.localManaged?.complete ? 'pronto' : 'da scaricare'}` : `${label} · ${stateText(statuses.find(item => item.id === id) || { state: 'unknown' }).replace('non disponibile', 'non ancora cercato')}`; return option; }));
    $('local-engine').dataset.signature = engineSignature;
  }
  $('local-engine').value = value.localEngine; $('local-engine').disabled = locked;
  $('local-engines-list').replaceChildren(...statuses.map(item => { const line = document.createElement('li'); line.textContent = `${item.label}: ${item.id === 'ollama' ? (item.state === 'ready' ? 'in uso come predefinito, rilevato' : 'non avviato') : stateText(item)}${item.state !== 'ready' && item.state !== 'absent' && item.message ? ' (' + item.message + ')' : ''}`; return line; }));
  $('local-engine-note').textContent = managedEngine ? 'Mascotte scarica llama.cpp e il modello (solo dopo la tua conferma), avvia il server solo su 127.0.0.1 quando serve e lo chiude dopo 2 minuti di inattività e alla chiusura dell’app. Tutto resta sul computer.' : otherEngine ? `Mascotte si collega solo a ${engineLabel} già avviato sul computer (solo 127.0.0.1): non lo avvia, non lo chiude e non scarica modelli. I modelli si gestiscono da ${engineLabel}. Tutto resta sul computer.` : 'Per usare LM Studio, llama.cpp o Jan avvia prima il loro server locale, poi premi «Cerca motori locali». Mascotte non li avvia né scarica modelli per loro.';
  $('local-engine-note').hidden = false;
  // Elenco modelli: catalogo + gruppo «Già presenti sul computer» (letto da Ollama) oppure solo i modelli del motore scelto.
  const found = managedEngine ? (managed ? [{ name: managed.model.id, size: managed.model.size, vision: managed.model.vision }] : []) : otherEngine ? (value.localEngineModels?.models || []) : (value.localInstalled?.models || []);
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
  $('guide-ollama').hidden = otherEngine; $('local-download').hidden = otherEngine && !(managedEngine && managed && !managed.complete);
  $('local-download').textContent = managedEngine ? 'Scarica llama.cpp e modello' : 'Scarica / aggiorna modello';
  $('local-download').disabled = locked || Boolean(value.setup) || (value.localInstalledSource && !managedEngine);
  $('local-download').title = value.localInstalledSource && !managedEngine ? 'Mascotte non scarica né aggiorna modelli fuori catalogo.' : '';
  const size = bytes => (bytes / 1e9).toFixed(1).replace('.', ',') + ' GB', yesNo = ok => ok ? 'scaricato e verificato' : 'da scaricare';
  $('managed-remove').hidden = !managedEngine || !managed || (!managed.runtime.present && !managed.model.present); $('managed-remove').disabled = locked || Boolean(value.setup);
  $('managed-status').hidden = !managedEngine || !managed;
  if (managedEngine && managed) $('managed-status').textContent = managed.supported ? `llama.cpp ${managed.build} (${managed.variant}): ${yesNo(managed.runtime.present)}, ${size(managed.runtime.size)} · ${managed.model.label}: ${yesNo(managed.model.present)}, ${size(managed.model.size)} · server: ${{ stopped: 'spento', starting: 'in avvio', ready: 'pronto', stopping: 'in chiusura' }[managed.server] || managed.server}${managed.complete ? '' : ` · da scaricare ${size(managed.missingBytes)}`}` : 'Non disponibile su questo computer: servono un Mac Apple Silicon o un PC Windows x64.';
  $('managed-license').hidden = !managedEngine;
  $('managed-license').textContent = 'Licenze: llama.cpp è software libero con licenza MIT; Gemma 4 è distribuito con licenza Apache 2.0. Download solo da github.com e huggingface.co, su richiesta.';
  $('local-intro').textContent = managedEngine ? 'Chat locale con llama.cpp gestito da Mascotte e il modello Gemma 4 E4B (testo e immagini).' : otherEngine ? `Chat locale con ${engineLabel}: usa un modello che hai già in ${engineLabel}.` : localCatalog.intro;
  const excluded = (otherEngine ? value.localEngineModels?.excluded : value.localInstalled?.excluded) || [];
  $('local-installed-note').textContent = otherEngine ? (found.length ? `Trovati ${found.length} modelli in ${engineLabel}, usabili senza scaricare altro.` : `Nessun modello idoneo in ${engineLabel}.`) : (value.localInstalled?.error || (value.localInstalled ? (found.length ? `Trovati ${found.length} modelli già presenti, usabili senza scaricare altro. Tutto resta sul computer.` : 'Nessun altro modello idoneo già presente in Ollama.') : ''));
  $('local-installed-note').hidden = managedEngine || (otherEngine ? false : !value.localInstalled);
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
    const remove = listButton('Elimina', async () => render(await invoke('memory-remove', note.id)), locked);
    item.append(text, origin, remove); $('memory-list').append(item);
  }
  const folders = management.folders || { defaults: [], extra: [], max: 20 };
  const folderRow = (folder, removable, index) => {
    const row = document.createElement('div'); row.className = 'folder-row';
    const name = document.createElement('strong'); name.textContent = folder.name;
    const where = document.createElement('p'); where.className = 'local-path'; where.textContent = folder.path;
    row.append(name, where);
    if (removable) row.append(listButton('Rimuovi', async () => render(await invoke('folders-remove', index)), locked || Boolean(value.setup)));
    return row;
  };
  $('folder-defaults').replaceChildren(...folders.defaults.map(folder => folderRow(folder, false)));
  $('folder-extra').replaceChildren(...folders.extra.map((folder, index) => folderRow(folder, true, index)));
  $('folders-add').disabled = locked || Boolean(value.setup) || folders.extra.length >= folders.max;
  $('folder-status').textContent = folders.status || ''; $('folder-status').className = folders.failed ? 'error' : '';
  $('update-app').disabled = !management.available || !management.repoPath || locked || Boolean(value.setup);
  $('update-app').textContent = management.running ? 'Aggiornamento in corso…' : 'Compila e aggiorna';
  $('manage-hooks').disabled = !value.hooksAvailable || locked;
  $('update-status').textContent = management.available ? management.status || '' : value.deviceName === 'Mac' ? 'Gli aggiornamenti sono disponibili nell’app installata dal pacchetto (non da npm start).' : 'Aggiornamenti e hook disponibili nel pacchetto Windows.';
  $('update-status').className = management.failed ? 'error' : '';
  $('hook-status').textContent = value.notice || '';
  renderCharacters(value, locked);
  const folderCount = folders.defaults.length + folders.extra.length, noteCount = (value.memories || []).length;
  $('sum-ia').textContent = `${engineLabel} · ${value.localModel}${managedEngine && managed ? (managed.complete ? ' · ' + ({ ready: 'server pronto', starting: 'in avvio' }[managed.server] || 'pronto') : ' · da scaricare') : ''}`;
  $('sum-cli').textContent = `Codex ${value.available.includes('codex') ? '✓' : '✗'} · Claude ${value.available.includes('claude') ? '✓' : '✗'}`;
  const alarmSettings = value.alarmSettings || { sound: 'beep', name: '', volume: 0.8 }, reminderItems = value.reminders || [];
  $('sum-sveglie').textContent = `${reminderItems.length ? `${reminderItems.length} attiv${reminderItems.length === 1 ? 'o' : 'i'}` : 'Nessuno'} · ${alarmSettings.sound === 'custom' ? 'audio' : 'bip'}`;
  $('reminder-list').replaceChildren(...reminderItems.map(item => {
    const row = document.createElement('div'); row.className = 'folder-row';
    const label = document.createElement('strong'); label.textContent = `${item.alarm ? '⏰' : '🔔'} ${item.when}`;
    const what = document.createElement('p'); what.className = 'local-path'; what.textContent = item.text;
    const remove = listButton('Elimina', async () => render(await invoke('reminder-remove', item.id)));
    row.append(label, what, remove); return row;
  }));
  $('alarm-sound-name').textContent = alarmSettings.sound === 'custom' ? alarmSettings.name || 'audio personalizzato' : 'bip';
  $('alarm-sound-remove').disabled = alarmSettings.sound !== 'custom';
  if (document.activeElement !== $('alarm-volume')) $('alarm-volume').value = alarmSettings.volume;
  $('alarm-sound-test').textContent = alarmTesting ? 'Ferma prova' : 'Prova suono';
  $('sum-note').textContent = noteCount ? `${noteCount} ${noteCount === 1 ? 'nota' : 'note'}` : 'Nessuna nota';
  $('sum-cartelle').textContent = `${folderCount} ${folderCount === 1 ? 'cartella' : 'cartelle'}`;
  $('sum-hook').textContent = !value.hooksAvailable ? 'Non disponibile' : { active: 'Hook attivi', moved: 'Da ricollegare', none: 'Da collegare' }[management.hooks] || 'Da collegare';
  $('sum-aggiornamenti').textContent = `${packageName} · ${management.version || ''}`.trim();
  $('watch-dot').hidden = !value.watching;
  $('engine').value = value.engine;
  $('engine').querySelector('option[value="locale"]').textContent = 'Locale';
  $('account-hint').textContent = value.engine === 'locale' ? `Sul tuo ${value.deviceName || 'PC'}` : `Invio a ${SERVICE_NAMES[value.engine]}`;
  $('engine').disabled = $('new').disabled = $('input').disabled = locked;
  $('messages').replaceChildren();
  if (!value.messages.length) {
    const intro = document.createElement('p'); intro.className = 'intro';
    intro.textContent = 'Ciao! Scegli Locale, Codex o Claude e scrivimi qui. Le conversazioni restano separate.';
    $('messages').append(intro);
  }
  for (const [index, message] of value.messages.entries()) {
    const item = document.createElement('section'); item.className = 'message ' + message.role;
    const name = document.createElement('strong'); name.textContent = message.role === 'user' ? 'Tu' : message.role === 'notice' ? 'Mascotte' : SERVICE_NAMES[value.engine] || localTitle(value);
    const text = document.createElement('span'); text.textContent = message.text;
    item.append(name, text);
    if (message.role === 'assistant') item.append(listButton('Ricorda…', () => openMemory(message.text, value.engine), locked));
    if (message.role === 'assistant' && value.engine === 'locale') {
      const question = [...value.messages.slice(0, index)].reverse().find(entry => entry.role === 'user')?.text || '';
      const ask = document.createElement('button'); ask.type = 'button'; ask.textContent = 'Chiedi a Codex o Claude…'; ask.disabled = locked;
      const askText = `Domanda: ${question}\n\nRisposta locale da approfondire o verificare: ${message.text}`.slice(0, 8000);
      ask.addEventListener('click', () => openRemote(askText, 'codex', null, true));
      item.append(ask);
      // Secondo parere con immagine: il fotogramma che ha visto il modello locale (conservato 10 minuti) oppure, se stai osservando, quello attuale.
      const frame = value.secondOpinionFrame, kept = frame && frame.message === index && message.text.startsWith(frame.reply);
      if (kept || watchStream) {
        const second = document.createElement('button'); second.type = 'button'; second.textContent = 'Secondo parere con schermata…'; second.disabled = locked;
        second.title = kept ? `Usa il fotogramma di «${frame.name}» analizzato dal modello locale` : 'Usa il fotogramma attuale della finestra osservata';
        second.addEventListener('click', async () => {
          if (kept) { const preview = await invoke('second-opinion-frame'); if (preview) { openRemote(askText, 'codex', null, true, preview); return; } }
          const fresh = captureFrame(); if (fresh) openRemote(askText, 'codex', fresh, true, fresh);
          else $('status').textContent = 'Il fotogramma non è più disponibile: osserva di nuovo la finestra.';
        });
        item.append(second);
      }
    }
    $('messages').append(item);
  }
  $('messages').scrollTop = $('messages').scrollHeight;
  $('status').textContent = value.busy ? 'Sta pensando…' : value.notice || (value.available.includes(value.engine) ? 'Pronto · ' + (SERVICE_NAMES[value.engine] || localTitle(value, true)) : value.engine === 'locale' ? (value.localEngine !== 'ollama' ? `${value.localEngineLabel} o il modello non sono disponibili: controlla nelle Impostazioni (ingranaggio in alto).` : 'Installa Ollama e il modello nelle Impostazioni (ingranaggio in alto).') : 'Installa e accedi alla CLI ' + value.engine);
  $('status').className = value.notice ? 'error' : '';
  $('send').textContent = value.busy ? 'Interrompi' : 'Invia ↗';
  $('send').disabled = management.running || (!value.busy && !$('input').value.trim());
  $('watch-summary').textContent = value.watching
    ? (value.engine === 'locale' && !value.localVision ? 'Anteprima attiva - IA locale senza visione' : 'Anteprima attiva - allega un fotogramma')
    : 'Finestra da condividere';
  $('watch-summary').title = value.watching ? value.watchName : '';
  $('watch-help').textContent = value.engine === 'locale' && !value.localVision
    ? `I modelli locali disponibili leggono solo testo: questa anteprima non viene vista da ${value.localEngineLabel || 'Ollama'}. Per fare una domanda su un fotogramma, scegli Codex o Claude e allegalo: ogni invio richiede conferma.`
    : value.engine === 'locale' ? 'Mentre osservi, ogni messaggio alla chat locale include il fotogramma attuale della finestra (non un video in diretta). Il fotogramma resta sul ' + value.deviceName + ' e non viene salvato nella cronologia. Per fermare la cattura usa Smetti.'
    : `L'anteprima resta sul ${value.deviceName}. Il servizio vede solo il fotogramma che alleghi e confermi, non la finestra in diretta. Chiudere questa sezione nasconde l'anteprima ma non ferma la cattura: usa Smetti.`;
  $('share-view').disabled = (value.engine === 'locale' && !value.localVision) || !value.watching || locked || !watchStream;
  $('share-view').title = value.engine === 'locale' && !value.localVision ? `Scegli ${localCatalog.visionChoice} nelle Impostazioni per analizzare immagini.` : '';
  $('toggle-watch').hidden = value.watching; $('stop-watch').hidden = !value.watching;
  $('watch-source').disabled = value.watching;
  if (value.setup) {
    $('claude-preview').textContent = value.setup.claude; $('codex-preview').textContent = value.setup.codex;
    if (!$('setup-dialog').open) $('setup-dialog').showModal();
  } else if ($('setup-dialog').open) $('setup-dialog').close();
  // Sveglia attiva: finestra con Ferma/Rimanda e suono a ripetizione finché non la fermi (main la spegne dopo 3 minuti).
  if (value.alarm) { $('alarm-text').textContent = value.alarm.text; $('alarm-time').textContent = value.alarm.time; if (!$('alarm-dialog').open) { $('alarm-dialog').showModal(); startAlarmSound(); } }
  else if ($('alarm-dialog').open) { stopAlarmSound(); $('alarm-dialog').close(); }
  if (value.pendingAction) { $('pc-action-description').textContent = value.pendingAction.description; if (!$('pc-action-dialog').open) $('pc-action-dialog').showModal(); }
  else if ($('pc-action-dialog').open) $('pc-action-dialog').close();
}
// Sezione Mascotte: personaggio e grandezza (stessa logica del clic destro sulla mascotte) e mascotte personali.
function renderCharacters(value, locked) {
  const info = value.characters; if (!info) return;
  const busy = locked || Boolean(value.setup);
  const select = $('character-select'), signature = JSON.stringify(info.list.map(c => [c.id, c.name, c.category]));
  if (select.dataset.signature !== signature) {
    const groups = new Map();
    for (const c of info.list) { if (!groups.has(c.category)) { const group = document.createElement('optgroup'); group.label = c.category; groups.set(c.category, group); } groups.get(c.category).append(new Option(c.name, c.id)); }
    select.replaceChildren(...groups.values()); select.dataset.signature = signature;
  }
  select.value = info.current; select.disabled = $('character-scale').disabled = Boolean(value.setup);
  $('character-scale').replaceChildren(...info.scales.map(scale => new Option(`${scale}×`, String(scale))));
  $('character-scale').value = String(info.scale);
  const currentName = info.list.find(c => c.id === info.current)?.name || '';
  $('sum-mascotte').textContent = `${currentName} · ${info.scale}×`; $('character-eyebrow').textContent = currentName.toUpperCase();
  const personal = info.list.filter(c => c.personal);
  $('character-list').replaceChildren(...personal.map(c => {
    const row = document.createElement('div'); row.className = 'folder-row';
    const name = document.createElement('strong'); name.textContent = c.name;
    const remove = listButton('Rimuovi', async () => render(await invoke('character-remove', c.id)), busy);
    row.append(name, document.createElement('br'), remove); return row;
  }));
  $('character-add').disabled = busy || personal.length >= info.max;
  $('character-warnings').textContent = info.warnings.join('\n'); $('character-warnings').hidden = !info.warnings.length;
  $('character-status').textContent = info.status || ''; $('character-status').className = info.failed ? 'error' : '';
}
// Suono della sveglia: il file scelto nelle Impostazioni in ciclo, oppure due bip generati ogni 1,2 secondi. Il volume viene dalle Impostazioni.
let alarmAudio = null, alarmBeeps = null, alarmPlayer = null, alarmUrl = null, alarmTesting = false;
function beepSound(volume) {
  try { alarmAudio = new AudioContext(); } catch { return; }
  const beep = () => { for (const start of [0, 0.25]) { const osc = alarmAudio.createOscillator(), gain = alarmAudio.createGain(), at = alarmAudio.currentTime + start;
    osc.frequency.value = 880; gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.3 * volume, at + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    osc.connect(gain).connect(alarmAudio.destination); osc.start(at); osc.stop(at + 0.2); } };
  beep(); alarmBeeps = setInterval(beep, 1200);
}
async function startAlarmSound() {
  stopAlarmSound();
  const volume = Number(current?.alarmSettings?.volume) || 0.8;
  if (current?.alarmSettings?.sound === 'custom') {
    try {
      const sound = await invoke('alarm-sound-data');
      if (sound?.base64) {
        const bytes = Uint8Array.from(atob(sound.base64), char => char.charCodeAt(0));
        alarmUrl = URL.createObjectURL(new Blob([bytes], { type: sound.mime }));
        alarmPlayer = new Audio(alarmUrl); alarmPlayer.loop = true; alarmPlayer.volume = volume; await alarmPlayer.play(); return;
      }
    } catch { stopAlarmSound(); }
  }
  beepSound(volume); // ripiego anche se l'audio scelto non si riesce a riprodurre
}
function stopAlarmSound() {
  clearInterval(alarmBeeps); alarmBeeps = null; try { alarmAudio?.close(); } catch {} alarmAudio = null;
  if (alarmPlayer) { alarmPlayer.pause(); alarmPlayer.removeAttribute('src'); alarmPlayer = null; }
  if (alarmUrl) { URL.revokeObjectURL(alarmUrl); alarmUrl = null; }
}
function openMemory(text = '', source = 'manuale') { memorySource = source; $('memory-text').value = text.slice(0, 2000); $('memory-dialog').showModal(); }
// `preview`: immagine mostrata nella conferma. Senza `imageData` è il fotogramma conservato da Mascotte (useLastFrame).
function openRemote(text, engine, imageData = null, noHistory = false, preview = null) {
  remotePending = { imageData, noHistory, useLastFrame: Boolean(preview && !imageData) };
  $('remote-image').hidden = !preview; $('remote-image-choice').hidden = !preview || !noHistory; $('remote-include-image').checked = true;
  if (preview) $('remote-image').src = preview; else $('remote-image').removeAttribute('src');
  $('remote-engine').value = engine; $('remote-engine').disabled = !noHistory;
  $('remote-text').value = text;
  const context = noHistory ? [] : current.messages.filter(message => ['user', 'assistant'].includes(message.role)).slice(-20);
  $('remote-context').textContent = context.length ? JSON.stringify(context, null, 2) : 'Nessun messaggio precedente.';
  $('remote-image-status').textContent = preview && noHistory ? 'Fotogramma da inviare insieme al testo (togli la spunta per mandare solo il testo):' : imageData ? 'È incluso anche il fotogramma che hai appena approvato.' : 'Nessuna immagine allegata.';
  const name = SERVICE_NAMES[engine] || 'Claude';
  $('remote-once').textContent = imageData || noHistory ? '' : `Dopo questa conferma, i prossimi messaggi a ${name} partiranno senza chiedere finché non chiudi Mascotte. Immagini e secondo parere chiedono sempre conferma.`;
  $('remote-dialog').showModal();
}
async function submit(imageData = null, noHistory = false, confirmed = false, useLastFrame = false) {
  if (current?.management?.running) return;
  if (current?.busy) { await invoke('stop'); return; }
  const text = $('input').value.trim(); if (!text) return;
  const engine = current.engine;
  // Chat locale con un modello che legge le immagini: mentre osservi una finestra, il fotogramma attuale parte con il messaggio.
  // Resta sul computer (solo il modello locale lo vede), quindi non serve conferma. Codex e Claude solo con «Allega fotogramma…».
  if (engine === 'locale' && !imageData && current.localVision && current.watching) imageData = captureFrame();
  if (engine !== 'locale' && !confirmed && (imageData || noHistory || !remoteConfirmed.has(engine))) { openRemote(text, engine, imageData, noHistory); return; }
  $('input').value = ''; drafts[engine] = ''; $('send').disabled = true;
  await invoke('send', imageData || noHistory || useLastFrame ? { text, ...(imageData ? { imageData } : {}), ...(noHistory ? { noHistory: true } : {}), ...(useLastFrame ? { useLastFrame: true } : {}) } : text);
  const next = await invoke('snapshot');
  if (next?.notice) { $('input').value = text; drafts[engine] = text; }
  render(next); $('input').focus();
}
// Fotogramma JPEG dalla finestra osservata (massimo 1600×900), oppure null se l'osservazione non è attiva.
function captureFrame() {
  const video = $('watch-video');
  if (!watchStream || !video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, 1600 / video.videoWidth, 900 / video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .78);
}
function prepareShare() {
  if (!$('input').value.trim()) { $('status').textContent = 'Scrivi una domanda prima di allegare il fotogramma.'; return; }
  const frame = captureFrame(); if (!frame) return;
  pendingImage = frame;
  $('share-preview').src = pendingImage;
  $('share-notice').textContent = current.engine === 'locale' ? 'Confermando, il fotogramma viene analizzato dal modello locale sul ' + current.deviceName + '. Non viene inviato a Codex o Claude e non viene salvato nella cronologia.' : `Il fotogramma resta sul dispositivo finché non confermi. Confermando, viene inviato a ${current.engine === 'codex' ? 'Codex' : 'Claude'} con il tuo account. Non viene salvato nella cronologia Mascotte.`;
  $('share-dialog').showModal();
}
$('composer').addEventListener('submit', event => { event.preventDefault(); submit(); });
$('input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } });
$('input').addEventListener('input', () => { if (current) drafts[current.engine] = $('input').value; $('send').disabled = !current?.busy && !$('input').value.trim(); });
$('engine').addEventListener('change', async () => { const next = await invoke('engine', $('engine').value); if (!next) { if (current) $('engine').value = current.engine; return; } $('input').value = drafts[next.engine] || ''; render(next); $('input').focus(); });
$('new').addEventListener('click', async () => { $('input').value = ''; drafts[current.engine] = ''; render(await invoke('new')); });
$('settings-back').addEventListener('click', () => selectTab('chat'));
$('settings-toggle').addEventListener('click', async () => { if (selectedTab === 'settings') { selectTab('chat'); $('input').focus(); return; } selectTab('settings'); render(await invoke('local-scan')); });
$('character-select').addEventListener('change', async () => render(await invoke('character-select', $('character-select').value)));
$('character-scale').addEventListener('change', async () => render(await invoke('character-scale', Number($('character-scale').value))));
onClickRender('character-add', 'character-add');
$('guide-characters').addEventListener('click', () => invoke('cli-guide', 'characters'));
onClickRender('local-scan', 'local-scan');
onClickRender('folders-add', 'folders-add');
onClickRender('choose-repo', 'repo-select');
onClickRender('release-update', 'release-update');
$('guide-codex').addEventListener('click', () => invoke('cli-guide', 'codex'));
$('guide-claude').addEventListener('click', () => invoke('cli-guide', 'claude'));
onClickRender('local-download', 'local-download');
onClickRender('managed-remove', 'local-managed-remove');
onClickRender('local-download-cancel', 'local-download-cancel');
$('guide-ollama').addEventListener('click', () => invoke('cli-guide', 'ollama'));
$('local-engine').addEventListener('change', async () => render(await invoke('local-engine', $('local-engine').value)));
onClickRender('local-check', 'local-check');
$('local-model').addEventListener('change', async () => render(await invoke('local-model', $('local-model').value)));
$('memory-new').addEventListener('click', () => openMemory());
$('memory-cancel').addEventListener('click', () => $('memory-dialog').close());
$('memory-save').addEventListener('click', async () => { const text = $('memory-text').value.trim(); if (!text) return; const result = await invoke('memory-add', { text, source: memorySource }); if (result?.notice?.startsWith('Nota salvata')) $('memory-dialog').close(); render(result); });
onClickRender('pc-action-cancel', 'pc-action-cancel');
$('pc-action-confirm').addEventListener('click', async () => render(await invoke('pc-action-confirm', current?.pendingAction?.id)));
$('pc-action-dialog').addEventListener('cancel', () => invoke('pc-action-cancel'));
onClickRender('alarm-sound-choose', 'alarm-sound-choose');
onClickRender('alarm-sound-remove', 'alarm-sound-remove');
$('alarm-volume').addEventListener('change', async () => render(await invoke('alarm-volume', Number($('alarm-volume').value))));
$('alarm-sound-test').addEventListener('click', async () => {
  if (alarmTesting) { alarmTesting = false; stopAlarmSound(); }
  else { alarmTesting = true; await startAlarmSound(); setTimeout(() => { if (alarmTesting) { alarmTesting = false; stopAlarmSound(); $('alarm-sound-test').textContent = 'Prova suono'; } }, 8000); }
  $('alarm-sound-test').textContent = alarmTesting ? 'Ferma prova' : 'Prova suono';
});
$('alarm-stop').addEventListener('click', async () => { stopAlarmSound(); render(await invoke('alarm-stop')); });
$('alarm-snooze').addEventListener('click', async () => { stopAlarmSound(); render(await invoke('alarm-snooze')); });
$('alarm-dialog').addEventListener('cancel', event => { event.preventDefault(); stopAlarmSound(); invoke('alarm-stop').then(render); });
$('remote-cancel').addEventListener('click', () => { remotePending = null; $('remote-image').removeAttribute('src'); $('remote-dialog').close(); });
$('remote-dialog').addEventListener('cancel', () => { remotePending = null; });
$('remote-confirm').addEventListener('click', async () => { const text = $('remote-text').value.trim(); if (!text || !remotePending) return; const selected = $('remote-engine').value, pending = remotePending; remotePending = null; if (!pending.imageData && !pending.noHistory) remoteConfirmed.add(selected); const include = $('remote-image-choice').hidden || $('remote-include-image').checked; $('remote-dialog').close(); $('remote-image').removeAttribute('src'); const next = await invoke('engine', selected); $('input').value = text; render(next); await submit(include ? pending.imageData : null, pending.noHistory, true, include && pending.useLastFrame); });
$('guide-git').addEventListener('click', () => invoke('cli-guide', 'git'));
$('guide-node').addEventListener('click', () => invoke('cli-guide', 'node'));
onClickRender('update-app', 'update-run');
onClickRender('manage-hooks', 'setup-preview');
onClickRender('apply', 'setup-apply');
onClickRender('dismiss', 'setup-dismiss');
$('setup-dialog').addEventListener('cancel', () => invoke('setup-dismiss'));
$('refresh-watch').addEventListener('click', refreshWatchSources);
// L'elenco delle finestre si aggiorna da solo quando si apre la sezione (non durante l'osservazione).
$('watch-panel').addEventListener('toggle', () => { if ($('watch-panel').open && !current?.watching) refreshWatchSources(); });
$('watch-permission').addEventListener('click', () => invoke('watch-permission-settings'));
$('watch-source').addEventListener('change', () => { $('toggle-watch').disabled = !$('watch-source').value; });
$('toggle-watch').addEventListener('click', startWatching);
$('stop-watch').addEventListener('click', stopWatching);
$('share-view').addEventListener('click', prepareShare);
$('confirm-share').addEventListener('click', async () => { const image = pendingImage; clearPendingImage(); if (image) await submit(image); });
$('cancel-share').addEventListener('click', clearPendingImage);
$('share-dialog').addEventListener('cancel', clearPendingImage);
window.mascotte.onWatchStop(stopWatchLocal);
window.mascotte.onChat(render);
restoreSections();
invoke('snapshot').then(value => { render(value); $('input').focus(); });
// Riaprendo la chat (barra dei menu, mascotte) il cursore torna nel campo, se non c'è un dialogo aperto o un altro campo/elenco in uso.
window.addEventListener('focus', () => { if (!document.querySelector('dialog[open]') && !document.activeElement?.matches('textarea, input, select') && !$('input').disabled) $('input').focus(); });
