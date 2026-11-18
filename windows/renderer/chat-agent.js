'use strict';
// Modalità agente: cartella, attività, richieste e chiarimenti.
// Fa parte della chat divisa in più script classici: ordine di caricamento in chat.html (globali condivisi).
function renderAgent(value, locked) {
  const agent = value.agent || {}, enabled = Boolean(agent.enabled);
  $('agent-panel').hidden = selectedTab === 'settings' || value.engine === 'locale';
  $('agent-mode').value = enabled ? 'agent' : 'chat'; $('agent-mode').disabled = locked;
  $('agent-workspace').hidden = !enabled; $('agent-workspace').disabled = locked;
  $('agent-workspace-path').hidden = $('agent-help').hidden = $('agent-session').hidden = !enabled;
  $('agent-workspace-path').textContent = agent.workspace || 'Scegli la cartella prima di inviare un compito.';
  $('agent-session').textContent = agent.session ? 'Sessione salvata · Nuova avvia una nuova sessione. Le modifiche ai file restano.' : 'Nuova sessione · cronologia separata dalla chat.';
  $('agent-activity').hidden = !enabled || !agent.events?.length;
  $('agent-events').replaceChildren(...(agent.events || []).map(event => {
    const details = document.createElement('details'), title = document.createElement('summary'), text = document.createElement('pre');
    title.textContent = event.title; text.textContent = event.detail; details.append(title, text); return details;
  }));
  const requests = agent.requests || [], signature = JSON.stringify(requests);
  if ($('agent-requests').dataset.signature !== signature) {
    $('agent-requests').dataset.signature = signature; $('agent-requests').replaceChildren();
    for (const request of requests) {
      const block = document.createElement('section'), title = document.createElement('h3');
      block.className = 'agent-request'; title.textContent = request.title; block.append(title);
      const respond = async data => { const next = await invoke('agent-answer', { id: request.id, ...data }); if (next) render(next); };
      if (request.kind === 'approval') {
        const detail = document.createElement('pre'); detail.textContent = request.detail; block.append(detail);
        block.append(listButton('Rifiuta', () => respond({ approved: false })), listButton('Consenti questa volta', () => respond({ approved: true })));
      } else {
        const fields = [];
        for (const question of request.questions || []) {
          const label = document.createElement('label'), input = document.createElement('textarea');
          label.textContent = question.question; input.rows = 2; input.maxLength = 8000;
          input.setAttribute('aria-label', question.question); label.append(input); block.append(label); fields.push([question.id, input]);
          if (question.options?.length) {
            const options = document.createElement('p'); options.className = 'hint';
            options.textContent = question.options.map(o => typeof o === 'string' ? o : o.label + (o.description ? ': ' + o.description : '')).join(' · '); block.append(options);
          }
        }
        block.append(listButton('Annulla richiesta', () => respond({})), listButton('Rispondi', () => respond({ answers: Object.fromEntries(fields.map(([id, input]) => [id, input.value])) })));
      }
      $('agent-requests').append(block);
      block.scrollIntoView({ block: 'nearest' });
    }
  }
  if (enabled && agent.liveText) {
    const preview = document.createElement('section'); preview.className = 'message assistant'; preview.textContent = agent.liveText; $('messages').append(preview);
  }
}