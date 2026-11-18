'use strict';
// Esempi della chat locale, chat vuota e render dello stato ricevuto dal processo principale.
// Fa parte della chat divisa in più script classici: ordine di caricamento in chat.html (globali condivisi).
// I dettagli di motore e modello restano nelle Impostazioni.
function localTitle() { return 'Locale'; }
// Chat vuota: saluto del personaggio e, con il motore locale, esempi delle funzioni che altrimenti si scoprono solo nelle Impostazioni.
// Un esempio riempie il campo senza inviare: il testo si può completare o correggere prima di premere Invio.
const LOCAL_EXAMPLES = ['Sveglia tra 20 minuti', 'Ricordami alle 15:30 di ', 'Che file ho in Download?', 'Che promemoria ho?'];
const characterName = value => value.characters?.list.find(c => c.id === value.characters.current)?.name || '';
function useExample(text) {
  const input = $('input'); input.value = text; input.dispatchEvent(new Event('input')); input.focus();
  input.setSelectionRange?.(text.length, text.length);
}
function emptyChat(value, name) {
  const box = document.createElement('div'); box.className = 'intro';
  const hello = document.createElement('p');
  const who = name ? `Ciao, sono ${name}! ` : 'Ciao! ';
  hello.textContent = value.engine === 'locale'
    ? `${who}Scrivimi qui: rispondo dal tuo ${value.deviceName || 'computer'}, senza inviare nulla in rete. Puoi anche provare:`
    : `${who}Scrivimi qui: il messaggio va a ${SERVICE_NAMES[value.engine]} con il tuo account. Ogni IA ha la sua conversazione.`;
  box.append(hello);
  if (value.engine === 'locale') {
    const examples = document.createElement('div'); examples.className = 'examples';
    examples.append(...LOCAL_EXAMPLES.map(text => listButton(text.trim(), () => useExample(text), Boolean(value.busy))));
    box.append(examples);
  }
  return box;
}
function render(value) {
  if (!value) return;
  current = value;
  const management = value.management || {};
  const locked = value.busy || management.running;
  selectTab(selectedTab);
  for (const item of document.querySelectorAll('.device')) item.textContent = value.deviceName || 'PC';
  $('settings-error').textContent = '';
  const packageName = management.packageName || 'Windows';
  $('app-hint').textContent = packageName === 'Windows' ? 'X riduce a icona · Esci dal menu mascotte' : 'Hook e aggiornamenti: ingranaggio in alto';
  $('app-version').textContent = `MASCOTTE ${packageName.toUpperCase()} ${management.version || ''}`.trim();
  $('app-build').textContent = management.buildInfo ? `Build ${management.buildInfo.revision.slice(0, 12)}${management.buildInfo.modified ? ' · modifiche locali' : ''}` : 'Revisione della build non disponibile';
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
  $('local-vision-hardware').textContent = otherEngine ? (value.localVision ? `${engineLabel} dichiara che questo modello legge le immagini. Durante l’osservazione ogni messaggio locale include il fotogramma attuale, sul computer. Usa Smetti per fermare la cattura.` : `${engineLabel} non dichiara il supporto alle immagini per questo modello: gli allegati sono disattivati.`) : localCatalog.visionNote;
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
  if (!value.messages.length && !value.agent?.enabled) $('messages').append(emptyChat(value, characterName(value)));
  else if (!value.messages.length) { const intro = document.createElement('p'); intro.className = 'intro'; intro.textContent = 'Scegli la cartella e descrivi il lavoro da fare.'; $('messages').append(intro); }
  for (const [index, message] of value.messages.entries()) {
    const appMessage = message.role === 'assistant' && ['app', 'local'].includes(message.kind);
    const item = document.createElement('section'); item.className = 'message ' + message.role + (appMessage ? ' app' : '');
    const name = document.createElement('strong'); name.textContent = message.role === 'user' ? 'Tu' : appMessage || message.role === 'notice' ? 'Mascotte' : SERVICE_NAMES[value.engine] || localTitle(value);
    const text = document.createElement('span'); text.textContent = message.text;
    item.append(name, text);
    const actions = document.createElement('div'); actions.className = 'message-actions';
    if (message.role === 'assistant' && !appMessage) actions.append(listButton('Salva nota…', () => openMemory(message.text, value.engine), locked));
    if (message.role === 'assistant' && !appMessage && value.engine === 'locale') {
      const question = [...value.messages.slice(0, index)].reverse().find(entry => entry.role === 'user')?.text || '';
      const ask = document.createElement('button'); ask.type = 'button'; ask.textContent = 'Secondo parere…'; ask.disabled = locked;
      const askText = `Domanda: ${question}\n\nRisposta locale da approfondire o verificare: ${message.text}`.slice(0, 8000);
      ask.addEventListener('click', () => openRemote(askText, 'codex', null, true));
      actions.append(ask);
      // Secondo parere con immagine: il fotogramma che ha visto il modello locale (conservato 10 minuti) oppure, se stai osservando, quello attuale.
      const frame = value.secondOpinionFrame, kept = frame && frame.message === index && message.text.startsWith(frame.reply);
      if (kept || watchStream) {
        const second = document.createElement('button'); second.type = 'button'; second.textContent = kept ? 'Secondo parere con schermata precedente…' : 'Secondo parere con schermata attuale…'; second.disabled = locked;
        second.title = kept ? `Usa il fotogramma di «${frame.name}» analizzato dal modello locale` : 'Usa il fotogramma attuale della finestra osservata';
        second.addEventListener('click', async () => {
          if (kept) { const preview = await invoke('second-opinion-frame'); if (preview) { openRemote(askText, 'codex', null, true, preview); return; } }
          const fresh = captureFrame(); if (fresh) openRemote(askText, 'codex', fresh, true, fresh);
          else $('status').textContent = 'Il fotogramma non è più disponibile: osserva di nuovo la finestra.';
        });
        actions.append(second);
      }
    }
    if (message.role === 'assistant' && !appMessage) item.append(actions);
    $('messages').append(item);
  }
  renderAgent(value, locked);
  $('messages').scrollTop = $('messages').scrollHeight;
  $('status').textContent = value.busy ? 'Sta pensando…' : value.notice || (value.available.includes(value.engine) ? 'Pronto · ' + (SERVICE_NAMES[value.engine] || localTitle(value, true)) : value.engine === 'locale' ? (value.localEngine !== 'ollama' ? `${value.localEngineLabel} o il modello non sono disponibili: controlla nelle Impostazioni (ingranaggio in alto).` : 'Installa Ollama e il modello nelle Impostazioni (ingranaggio in alto).') : 'Installa e accedi alla CLI ' + value.engine);
  if (value.agent?.requests?.length) $('status').textContent = 'L’agente attende una tua risposta.';
  $('status').className = value.notice ? (value.noticeTone === 'info' ? 'info' : 'error') : '';
  $('send').textContent = value.busy ? 'Interrompi' : 'Invia ↗';
  $('send').disabled = management.running || (!value.busy && !$('input').value.trim());
  if (value.agent?.enabled && !value.agent.workspace && !value.busy) $('send').disabled = true;
  $('watch-title').textContent = value.watching
    ? (value.engine === 'locale' ? (value.localVision ? 'Osservazione attiva · immagine automatica locale' : 'Anteprima attiva · modello solo testo') : 'Anteprima attiva · allega un fotogramma')
    : 'Finestra da condividere';
  $('watch-toggle').hidden = selectedTab === 'settings' || !value.watchAvailable;
  $('watch-toggle').setAttribute('aria-pressed', String(Boolean(value.watching)));
  $('watch-chip').hidden = selectedTab === 'settings' || !value.watching;
  $('watch-chip-name').textContent = value.watchName || 'Finestra osservata'; $('watch-chip-open').title = value.watchName ? `Osservi «${value.watchName}» · apri il pannello` : 'Apri il pannello';
  $('watch-help').textContent = value.engine === 'locale' && !value.localVision
    ? `I modelli locali disponibili leggono solo testo: questa anteprima non viene vista da ${value.localEngineLabel || 'Ollama'}. Per fare una domanda su un fotogramma, scegli Codex o Claude e allegalo: ogni invio richiede conferma.`
    : value.engine === 'locale' ? 'Mentre osservi, ogni messaggio alla chat locale include il fotogramma attuale della finestra (non un video in diretta). Il fotogramma resta sul ' + value.deviceName + ' e non viene salvato nella cronologia. Per fermare la cattura usa Smetti.'
    : `L'anteprima resta sul ${value.deviceName}. Il servizio vede solo il fotogramma che alleghi e confermi, non la finestra in diretta. Chiudere il pannello non ferma la cattura: usa Smetti o la ✕ accanto al nome.`;
  $('share-view').disabled = (value.engine === 'locale' && !value.localVision) || !value.watching || locked || !watchStream;
  updateImageStatus();
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