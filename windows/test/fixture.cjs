'use strict';
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', part => { input += part; });
process.stdin.on('end', () => {
  if (process.argv.includes('--slow')) { setTimeout(() => {}, 30000); return; }
  if (process.argv.includes('--oversize')) { process.stdout.write('x'.repeat(2097153)); setTimeout(() => {}, 30000); return; }
  if (process.argv.includes('--fail')) { console.error('Errore fixture'); process.exitCode = 2; return; }
  if (process.argv.includes('--print')) console.log(JSON.stringify({ result: 'Risposta simulata: ' + input, is_error: false }));
  else {
    console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Risposta simulata: ' + input } }));
    console.log(JSON.stringify({ type: 'turn.completed' }));
  }
});
