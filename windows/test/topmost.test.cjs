'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

test('Windows: mascotte topmost sopra una finestra normale anche dopo Mostra e cambio hitbox', { skip: process.platform !== 'win32' && 'ordine nativo solo Windows', timeout: 30000 }, async t => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-topmost-'));
  const env = { ...process.env, MASCOTTE_TOPMOST_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  // Su Windows un blocco temporaneo dell'eseguibile può far fallire spawn con EBUSY.
  // Ritentare solo l'avvio; le verifiche native successive restano obbligatorie.
  let child;
  t.after(async () => { if (child?.pid) { child.kill(); await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); }); } fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  for (let attempt = 0; ; attempt++) {
    try {
      child = await new Promise((resolve, reject) => {
        const candidate = spawn(require('electron'), [path.join(__dirname, 'fixtures/topmost.cjs')], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        candidate.once('error', reject);
        candidate.once('spawn', () => resolve(candidate));
      });
      break;
    } catch (error) {
      if (error.code !== 'EBUSY' || attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  let output = '', diagnostic = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { diagnostic += data; });
  const until = async text => { const end = Date.now() + 12000; while (!output.includes(text) && Date.now() < end && child.exitCode === null) await new Promise(r => setTimeout(r, 50)); assert.ok(output.includes(text), diagnostic || 'Fixture non pronta'); };
  const inspect = ({ coverTopmost = false, covered = false } = {}) => {
    const script = `Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class ZOrder {
public delegate bool Callback(IntPtr h, IntPtr p);
[DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback,IntPtr p);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
[DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int n);
[DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
public static void Print(uint expected){int index=0;EnumWindows((h,p)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==expected){var s=new StringBuilder(256);GetWindowText(h,s,256);if(s.ToString().EndsWith(" fixture"))Console.WriteLine(s+"|"+index+"|"+((GetWindowLong(h,-20)&8)!=0));}index++;return true;},IntPtr.Zero);}
}
'@
[ZOrder]::Print(${child.pid})`;
    const stdout = execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const rows = stdout.trim().split(/\r?\n/).map(line => line.split('|'));
    const mascot = rows.find(row => row[0] === 'Mascotte topmost fixture'), cover = rows.find(row => row[0] === 'Mascotte cover fixture');
    assert.ok(mascot && cover, stdout); assert.equal(mascot[2], 'True', 'flag WS_EX_TOPMOST presente'); assert.equal(cover[2], coverTopmost ? 'True' : 'False');
    assert.equal(Number(mascot[1]) < Number(cover[1]), !covered, 'ordine nativo fra mascotte e finestra di copertura');
  };
  await until('ready'); inspect();
  fs.writeFileSync(path.join(profile, 'restore'), 'restore'); await until('restored'); inspect();
  // Riproduce il caso di una barra/finestra topmost che viene sollevata in seguito.
  fs.writeFileSync(path.join(profile, 'cover'), 'cover'); await until('covered'); inspect({ coverTopmost: true, covered: true });
  fs.writeFileSync(path.join(profile, 'reassert'), 'reassert'); await until('reasserted'); inspect({ coverTopmost: true });
});
