'use strict';
// Impostazioni → Diagnostica (controlli in lib/diagnostics.cjs, nel processo principale): «Controlla», elenco degli esiti
// con «Come si fa» (guida PROBLEMI.md) e, dove serve, «Apri Impostazioni di Sistema»; «Copia resoconto».
// Fa parte della chat divisa in più script classici: ordine di caricamento in chat.html (globali condivisi).
const DIAGNOSTIC_ICON = { ok: '✅', avviso: '⚠️', problema: '❌', info: 'ℹ️' };
const DIAGNOSTIC_LABEL = { ok: 'OK', avviso: 'Avviso', problema: 'Problema', info: 'Info' };
const DIAGNOSTIC_ORDER = ['problema', 'avviso', 'info', 'ok'];

function diagnosticRow(item) {
  const row = document.createElement('li'); row.className = `diag-item diag-${item.stato}`;
  const icon = document.createElement('span'); icon.className = 'diag-icon'; icon.textContent = DIAGNOSTIC_ICON[item.stato] || ''; icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('div'); text.className = 'diag-text';
  const heading = document.createElement('div'); heading.className = 'diag-heading';
  const title = document.createElement('strong'); title.textContent = item.title;
  const outcome = document.createElement('span'); outcome.className = 'diag-outcome';
  outcome.textContent = DIAGNOSTIC_LABEL[item.stato] || '';
  heading.append(title, outcome);
  const detail = document.createElement('p'); detail.textContent = item.testo;
  text.append(heading, detail);
  if (item.stato !== 'ok') {
    const actions = document.createElement('div'); actions.className = 'management-actions diag-actions';
    const help = document.createElement('button'); help.type = 'button'; help.textContent = 'Come si fa';
    help.addEventListener('click', () => invoke('diagnostics-open', '#' + item.help.split('#')[1]));
    actions.append(help);
    if (item.settings) {
      const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Apri Impostazioni di Sistema';
      open.addEventListener('click', () => invoke('diagnostics-open', item.settings));
      actions.append(open);
    }
    text.append(actions);
  }
  row.append(icon, text);
  return row;
}

function renderDiagnostics(value) {
  const results = Array.isArray(value?.results) ? value.results : [];
  const ordered = [...results].sort((a, b) => DIAGNOSTIC_ORDER.indexOf(a.stato) - DIAGNOSTIC_ORDER.indexOf(b.stato));
  $('diagnostics-list').replaceChildren(...ordered.map(diagnosticRow));
  const problems = results.filter(item => item.stato === 'problema').length, warnings = results.filter(item => item.stato === 'avviso').length;
  $('sum-diagnostica').textContent = !results.length ? 'Non eseguita' : problems ? `${problems} da sistemare` : warnings ? `${warnings} da controllare` : 'Tutto a posto';
  $('diagnostics-status').textContent = results.length ? `Controllo delle ${new Date(value.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.` : 'Controllo non riuscito.';
  $('diagnostics-copy').disabled = !results.length;
}

$('diagnostics-run').addEventListener('click', async () => {
  const run = $('diagnostics-run');
  const copy = $('diagnostics-copy');
  const status = $('diagnostics-status');
  const list = $('diagnostics-list');
  run.disabled = true;
  copy.disabled = true;
  status.classList.add('diag-running');
  status.textContent = 'Controllo in corso… Mascotte invia anche una notifica di prova.';
  list.setAttribute('aria-busy', 'true');
  try {
    renderDiagnostics(await invoke('diagnostics-run'));
  } catch {
    renderDiagnostics(null);
  } finally {
    list.setAttribute('aria-busy', 'false');
    status.classList.remove('diag-running');
    run.disabled = false;
  }
});
$('diagnostics-copy').addEventListener('click', async () => {
  const result = await invoke('diagnostics-copy');
  $('diagnostics-status').textContent = result?.copied ? 'Resoconto copiato: incollalo dove vuoi (contiene solo esiti, versione e sistema).' : 'Esegui prima il controllo.';
});
