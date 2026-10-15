'use strict';
const $ = id => document.getElementById(id);
let current = null, drafts = { codex: '', claude: '' };
async function invoke(action, data) {
  try { return await window.mascotte.invoke(action, data); }
  catch { $('status').textContent = 'Operazione non completata. Puoi riprovare.'; }
}
function render(value) {
  if (!value) return;
  current = value;
  $('engine').value = value.engine;
  $('engine').disabled = $('new').disabled = $('input').disabled = $('setup').disabled = value.busy;
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
  $('send').disabled = !value.busy && !$('input').value.trim();
  if (value.setup) {
    $('claude-preview').textContent = value.setup.claude; $('codex-preview').textContent = value.setup.codex;
    if (!$('setup-dialog').open) $('setup-dialog').showModal();
  } else if ($('setup-dialog').open) $('setup-dialog').close();
}
async function submit() {
  if (current?.busy) { await invoke('stop'); return; }
  const text = $('input').value.trim(); if (!text) return;
  const engine = current.engine;
  $('input').value = ''; drafts[engine] = ''; $('send').disabled = true;
  await invoke('send', text);
  const next = await invoke('snapshot');
  if (next?.notice) { $('input').value = text; drafts[engine] = text; }
  render(next); $('input').focus();
}
$('composer').addEventListener('submit', event => { event.preventDefault(); submit(); });
$('input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } });
$('input').addEventListener('input', () => { if (current) drafts[current.engine] = $('input').value; $('send').disabled = !$('input').value.trim(); });
$('engine').addEventListener('change', async () => { const next = await invoke('engine', $('engine').value); $('input').value = drafts[next.engine] || ''; render(next); $('input').focus(); });
$('new').addEventListener('click', async () => { $('input').value = ''; drafts[current.engine] = ''; render(await invoke('new')); });
$('setup').addEventListener('click', async () => render(await invoke('setup-preview')));
$('apply').addEventListener('click', async () => render(await invoke('setup-apply')));
$('dismiss').addEventListener('click', async () => render(await invoke('setup-dismiss')));
$('setup-dialog').addEventListener('cancel', () => invoke('setup-dismiss'));
window.mascotte.onChat(render);
invoke('snapshot').then(value => { render(value); $('input').focus(); });
