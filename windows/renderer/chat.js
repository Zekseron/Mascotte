'use strict';
// Collegamento di pulsanti e campi alle funzioni degli altri file, poi avvio.
// Fa parte della chat divisa in più script classici: ordine di caricamento in chat.html (globali condivisi).
$('composer').addEventListener('submit', event => { event.preventDefault(); submit(); });
$('input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } });
// Esc: dalle Impostazioni torna alla chat; dalla chat nasconde la finestra (su Windows la riduce a icona).
// Non agisce se è aperta una finestra di conferma (la chiude il browser) o se una risposta è in corso, per non perderla di vista.
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
  if (!$('attach-menu').hidden) { event.preventDefault(); openAttachMenu(false); $('watch-toggle').focus?.(); return; }
  if (!$('watch-panel').hidden) { event.preventDefault(); openWatchPanel(false); $('watch-toggle').focus?.(); return; }
  if (selectedTab === 'settings') { event.preventDefault(); selectTab('chat'); return; }
  if (current?.busy || current?.alarm || current?.agent?.requests?.length) return;
  event.preventDefault(); invoke('chat-hide');
});
$('input').addEventListener('input', () => { if (current) drafts[current.engine] = $('input').value; $('send').disabled = !current?.busy && !$('input').value.trim(); });
$('engine').addEventListener('change', async () => { const next = await invoke('engine', $('engine').value); if (!next) { if (current) $('engine').value = current.engine; return; } $('input').value = drafts[next.engine] || ''; render(next); $('input').focus(); });
$('agent-mode').addEventListener('change', async () => { remoteConfirmed.clear(); render(await invoke('agent-mode', $('agent-mode').value === 'agent')); });
$('agent-workspace').addEventListener('click', async () => { remoteConfirmed.clear(); render(await invoke('agent-workspace')); });
$('new').addEventListener('click', async () => { $('input').value = ''; drafts[current.engine] = ''; render(await invoke('new')); });
$('settings-back').addEventListener('click', () => selectTab('chat'));
$('settings-toggle').addEventListener('click', async () => { if (selectedTab === 'settings') { selectTab('chat'); $('input').focus(); return; } selectTab('settings'); render(await invoke('local-scan')); });
$('character-select').addEventListener('change', async () => render(await invoke('character-select', $('character-select').value)));
$('colors-reset').addEventListener('click', () => resetColors(null));
$('character-scale').addEventListener('change', async () => render(await invoke('character-scale', Number($('character-scale').value))));
onClickRender('character-add', 'character-add');
$('guide-characters').addEventListener('click', () => invoke('cli-guide', 'characters'));
$('send-feedback').addEventListener('click', () => invoke('cli-guide', 'feedback'));
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
$('notice-style').addEventListener('change', async () => render(await invoke('notice-style', $('notice-style').value)));
onClickRender('notice-test', 'notice-test');
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
$('remote-confirm').addEventListener('click', async () => { const text = $('remote-text').value.trim(); if (!text || !remotePending) return; const selected = $('remote-engine').value, pending = remotePending; remotePending = null; if (!pending.imageData && !pending.noHistory) remoteConfirmed.add(remoteKey(selected)); const include = $('remote-image-choice').hidden || $('remote-include-image').checked; $('remote-dialog').close(); $('remote-image').removeAttribute('src'); const next = await invoke('engine', selected); $('input').value = text; render(next); await submit(include ? pending.imageData : null, pending.noHistory, true, include && pending.useLastFrame); });
$('guide-git').addEventListener('click', () => invoke('cli-guide', 'git'));
$('guide-node').addEventListener('click', () => invoke('cli-guide', 'node'));
onClickRender('update-app', 'update-run');
onClickRender('manage-hooks', 'setup-preview');
onClickRender('apply', 'setup-apply');
onClickRender('dismiss', 'setup-dismiss');
$('setup-dialog').addEventListener('cancel', () => invoke('setup-dismiss'));
$('refresh-watch').addEventListener('click', refreshWatchSources);
// L'elenco delle finestre si aggiorna da solo quando si apre la sezione (non durante l'osservazione).
$('watch-toggle').addEventListener('click', () => { if (!$('watch-panel').hidden) openWatchPanel(false); else openAttachMenu($('attach-menu').hidden); });
$('attach-screen').addEventListener('click', () => openWatchPanel(true));
$('watch-close').addEventListener('click', () => openWatchPanel(false));
$('watch-chip-open').addEventListener('click', () => openWatchPanel(true));
$('watch-chip-stop').addEventListener('click', stopWatching);
// Clic fuori dal pannello (e fuori dai pulsanti che lo aprono) lo chiude. Le finestre di conferma restano escluse.
window.addEventListener('pointerdown', event => {
  if (!$('attach-menu').hidden && ![$('attach-menu'), $('watch-toggle')].some(item => item.contains?.(event.target))) openAttachMenu(false);
  const panel = $('watch-panel'); if (panel.hidden || document.querySelector('dialog[open]')) return;
  if (![panel, $('watch-toggle'), $('watch-chip')].some(item => item.contains?.(event.target))) openWatchPanel(false);
});
$('watch-permission').addEventListener('click', () => invoke('watch-permission-settings'));
$('watch-source').addEventListener('change', () => { $('toggle-watch').disabled = !$('watch-source').value; showThumbnail($('watch-source').value); });
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
