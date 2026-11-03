'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { once } = require('node:events');
const { spawnAgent, stopProcess, descendantPids } = require('../lib/agent-process.cjs');

test('discendenti: include sessioni separate, esclude altri alberi e gestisce cicli', () => {
  assert.deepEqual(descendantPids('10 1\n20 10\n30 20\n40 10\n50 1\n10 30', 10), [20, 40, 30]);
});

test('Interrompi termina anche un comando in un gruppo separato dalla CLI', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-process-'));
  const marker = path.join(directory, 'finished');
  const worker = `setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(marker)},'fine'),2000);`;
  const parent = `const {spawn}=require('child_process');const c=spawn(process.execPath,['-e',${JSON.stringify(worker)}],{detached:true,stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000);`;
  const child = spawnAgent({ file: process.execPath, prefix: [], env: {} }, ['-e', parent], directory);
  let workerPid;
  t.after(() => { stopProcess(child); if (workerPid) { try { process.kill(workerPid, 'SIGKILL'); } catch {} } fs.rmSync(directory, { recursive: true, force: true }); });
  const [data] = await once(child.stdout, 'data'); workerPid = Number(data.toString().trim());
  assert.ok(Number.isInteger(workerPid) && workerPid > 1);
  const closed = once(child, 'close'); stopProcess(child); await closed;
  const deadline = Date.now() + 2000;
  let alive = true;
  while (alive && Date.now() < deadline) {
    try { process.kill(workerPid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
    if (alive) await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(alive, false, 'il comando figlio deve terminare');
  assert.equal(fs.existsSync(marker), false);
});
