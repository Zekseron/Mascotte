'use strict';
// Note, conferma degli invii a Codex e Claude, invio dei messaggi.
// Fa parte della chat divisa in più script classici: ordine di caricamento in chat.html (globali condivisi).
function openMemory(text = '', source = 'manuale') { memorySource = source; $('memory-text').value = text.slice(0, 2000); $('memory-dialog').showModal(); }
// `preview`: immagine mostrata nella conferma. Senza `imageData` è il fotogramma conservato da Mascotte (useLastFrame).
function openRemote(text, engine, imageData = null, noHistory = false, preview = null) {
  remotePending = { imageData, noHistory, useLastFrame: Boolean(preview && !imageData) };
  $('remote-image').hidden = !preview; $('remote-image-choice').hidden = !preview || !noHistory; $('remote-include-image').checked = true;
  if (preview) $('remote-image').src = preview; else $('remote-image').removeAttribute('src');
  $('remote-engine').value = engine; $('remote-engine').disabled = !noHistory;
  $('remote-text').value = text;
  const context = noHistory ? [] : current.messages.filter(message => ['user', 'assistant'].includes(message.role) && message.kind !== 'local').slice(-20).map(({ role, text }) => ({ role, text }));
  $('remote-context').textContent = context.length ? JSON.stringify(context, null, 2) : 'Nessun messaggio precedente.';
  $('remote-image-status').textContent = preview && noHistory ? 'Fotogramma da inviare insieme al testo (togli la spunta per mandare solo il testo):' : imageData ? 'È incluso anche il fotogramma che hai appena approvato.' : 'Nessuna immagine allegata.';
  const name = SERVICE_NAMES[engine] || 'Claude';
  $('remote-once').textContent = noHistory ? `Secondo parere in Chat, senza cronologia: il servizio scelto non accede a file o comandi, anche con la modalità Agente attiva.` : imageData ? '' : `Dopo questa conferma, i prossimi messaggi a ${name} partiranno senza chiedere finché non chiudi Mascotte. Immagini e secondo parere chiedono sempre conferma.`;
  if (current.agent?.enabled && !noHistory) {
    $('remote-context').textContent = current.agent.session ? 'La sessione agente salvata viene ripresa dal servizio. Può contenere file e risultati dei turni precedenti.' : 'Nuova sessione agente, separata dalla chat.';
    $('remote-once').textContent = `Modalità Agente · ${current.agent.workspace || 'cartella non scelta'}. ${name} può leggere file, proporre modifiche ed eseguire comandi. Anche il contenuto letto e gli output possono essere inviati al servizio. Le richieste di permesso compariranno nella chat.`;
  }
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
  if (current.agent?.enabled && !noHistory && !current.agent.workspace) return;
  // Codex e Claude: «apri …» lo gestisce Mascotte sul computer, senza finestra di invio remoto e senza mandare il messaggio.
  if (engine !== 'locale' && !confirmed && !imageData && !noHistory && !current.agent?.enabled) {
    const opened = await invoke('open-request', text);
    if (opened?.handled === true) { $('input').value = ''; drafts[engine] = ''; render(await invoke('snapshot')); $('input').focus(); return; }
  }
  if (engine !== 'locale' && !confirmed && (imageData || noHistory || !remoteConfirmed.has(remoteKey(engine)))) { openRemote(text, engine, imageData, noHistory); return; }
  $('input').value = ''; drafts[engine] = ''; $('send').disabled = true;
  await invoke('send', imageData || noHistory || useLastFrame ? { text, ...(imageData ? { imageData } : {}), ...(noHistory ? { noHistory: true } : {}), ...(useLastFrame ? { useLastFrame: true } : {}) } : text);
  const next = await invoke('snapshot');
  if (next?.notice) { $('input').value = text; drafts[engine] = text; }
  render(next); $('input').focus();
}