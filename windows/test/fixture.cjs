'use strict';
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', part => { input += part; });
process.stdin.on('end', () => {
  // Crea un nipote (processo nipote) che scrive il proprio pid in un file e resta vivo: serve a provare l'arresto dell'intero gruppo.
  const grand = process.argv.find(a => a.startsWith('--grandchild='));
  if (grand) {
    const child = require('node:child_process').spawn(process.execPath, ['-e', "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => {}, 30000)", grand.slice(13)], { stdio: 'ignore' });
    child.unref(); setTimeout(() => {}, 30000); return;
  }
  if (process.argv.includes('--slow')) { setTimeout(() => {}, 30000); return; }
  if (process.argv.includes('--oversize')) { process.stdout.write('x'.repeat(2097153)); setTimeout(() => {}, 30000); return; }
  if (process.argv.includes('--fail')) { console.error('Errore fixture'); process.exitCode = 2; return; }
  if (process.argv.includes('--print')) console.log(JSON.stringify({ result: 'Risposta simulata: ' + input, is_error: false }));
  else {
    console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Risposta simulata: ' + input } }));
    console.log(JSON.stringify({ type: 'turn.completed' }));
  }
});
