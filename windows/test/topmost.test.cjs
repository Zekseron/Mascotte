'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

test('Windows: mascotte topmost sopra una finestra normale anche dopo Mostra e cambio hitbox', { skip: process.platform !== 'win32' && 'ordine nativo solo Windows', timeout: 30000 }, async t => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mascotte-topmost-'));
  const env = { ...process.env, MASCOTTE_TOPMOST_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/topmost.cjs')], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', diagnostic = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { diagnostic += data; });
  t.after(async () => { child.kill(); await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); }); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const until = async text => { const end = Date.now() + 12000; while (!output.includes(text) && Date.now() < end && child.exitCode === null) await new Promise(r => setTimeout(r, 50)); assert.ok(output.includes(text), diagnostic || 'Fixture non pronta'); };
  const inspect = () => {
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
    assert.ok(mascot && cover, stdout); assert.equal(mascot[2], 'True', 'flag WS_EX_TOPMOST presente'); assert.equal(cover[2], 'False');
    assert.ok(Number(mascot[1]) < Number(cover[1]), 'la mascotte deve precedere la finestra normale nello z-order');
  };
  await until('ready'); inspect();
  fs.writeFileSync(path.join(profile, 'restore'), 'restore'); await until('restored'); inspect();
});
