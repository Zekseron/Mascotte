'use strict';
// Eseguire dalla cartella mascotte/:  node --test viewer/test/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const VIEWER = path.join(ROOT, 'viewer');
const DEMO = path.join(__dirname, 'fixtures', 'demo-pack');

const Pack = require(path.join(VIEWER, 'pack.js'));
const { STATES, validatePack, resolveState, frameSchedule, frameAt, frameStart } = Pack;

// ---------------------------------------------------------------- aiuti

// Misura del PNG letta dall'header IHDR (indipendente da Pack.pngSize).
function ihdrSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', 'firma PNG');
  assert.equal(b.subarray(12, 16).toString('latin1'), 'IHDR');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function demoJson() {
  return JSON.parse(fs.readFileSync(path.join(DEMO, 'character.json'), 'utf8'));
}

// Pacchetto minimo valido su un foglio 192x64 (6 colonne x 2 righe, fotogramma 32x32).
function minimal(extra) {
  return Object.assign({
    format: 'mascotte-pack/1',
    name: 'Prova',
    sheet: 'sprites.png',
    frame: { width: 32, height: 32 },
    animations: { idle: { row: 0, frames: 2 } }
  }, extra || {});
}

const check = (json, w = 192, h = 64, o) => validatePack(json, w, h, o);
const hasError = (r, text) => r.errors.some((e) => e.includes(text));
const hasWarning = (r, text) => r.warnings.some((e) => e.includes(text));

// ---------------------------------------------------------------- STATES

test('STATES è identico a spec/states.json', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec', 'states.json'), 'utf8'));
  assert.deepStrictEqual(STATES, spec);
  // anche l'ordine degli stati (la griglia del visore lo segue)
  assert.deepStrictEqual(Object.keys(STATES.states), Object.keys(spec.states));
});

// ---------------------------------------------------------------- fixture demo

test('fixture demo-pack: il PNG è 128x128 (IHDR) e pngSize concorda', () => {
  const file = path.join(DEMO, 'sprites.png');
  assert.deepStrictEqual(ihdrSize(file), { width: 128, height: 128 });
  assert.deepStrictEqual(Pack.pngSize(fs.readFileSync(file)), { width: 128, height: 128 });
});

test('validatePack: il pacchetto demo è valido, senza errori né avvisi', () => {
  const { width, height } = ihdrSize(path.join(DEMO, 'sprites.png'));
  const r = validatePack(demoJson(), width, height);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.warnings, []);
  const p = r.pack;
  assert.equal(p.name, 'Demo');
  assert.equal(p.id, 'demo-pack');
  assert.deepStrictEqual(p.frame, { width: 32, height: 32 });
  assert.deepStrictEqual(p.bubble, { x: 16, y: 8 });
  assert.deepStrictEqual(Object.keys(p.animations), ['idle', 'sleep', 'thinking', 'done']);
  assert.deepStrictEqual(p.animations.idle.frames, [0, 1, 2, 3, 2, 1]);
  assert.deepStrictEqual(p.animations.thinking.frames, [0, 1, 2]);
  assert.equal(p.animations.done.loop, false);
  assert.deepStrictEqual(p.animations.sleep.durations, [900, 700]);
  assert.deepStrictEqual(p.fallbacks, { waiting: 'thinking' });
});

test('fixture demo-pack: animazioni coerenti con la misura del foglio', () => {
  const r = validatePack(demoJson(), 128, 128);
  for (const anim of Object.values(r.pack.animations)) {
    assert.ok(anim.row < 4);
    assert.ok(Math.max(...anim.frames) < 4);
  }
});

// ---------------------------------------------------------------- validatePack

test('validatePack: applica i default (scale 4, fps 8, loop true, id, bubble)', () => {
  const r = check(minimal({ name: 'Più Gatti' }));
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.warnings, []);
  const p = r.pack;
  assert.equal(p.format, 'mascotte-pack/1');
  assert.equal(p.id, 'piu-gatti');
  assert.equal(p.author, '');
  assert.equal(p.license, '');
  assert.equal(p.scale, 4);
  assert.deepStrictEqual(p.bubble, { x: 16, y: 0 });
  assert.deepStrictEqual(p.animations.idle, { row: 0, frames: [0, 1], fps: 8, durations: null, loop: true });
  assert.deepStrictEqual(p.fallbacks, {});
});

test('validatePack: id di default dal nome della cartella, se nota', () => {
  const r = check(minimal(), 192, 64, { folderName: 'gattino' });
  assert.equal(r.pack.id, 'gattino');
  assert.equal(check(minimal({ id: 'mio' }), 192, 64, { folderName: 'gattino' }).pack.id, 'mio');
});

test('validatePack: frames come numero N diventa la lista delle colonne 0..N-1', () => {
  const r = check(minimal({ animations: { idle: { row: 1, frames: 4, fps: 12, loop: false } } }));
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.pack.animations.idle,
    { row: 1, frames: [0, 1, 2, 3], fps: 12, durations: null, loop: false });
});

test('validatePack: idle mancante è un errore', () => {
  const r = check(minimal({ animations: { sleep: { row: 0, frames: 2 } } }));
  assert.ok(hasError(r, 'animations.idle: obbligatorio'), r.errors.join('\n'));
  assert.equal(r.errors.length, 1);
});

test('validatePack: animations assente o non oggetto', () => {
  const noAnim = minimal();
  delete noAnim.animations;
  assert.ok(hasError(check(noAnim), 'animations: obbligatorio'));
  assert.ok(hasError(check(minimal({ animations: [] })), 'animations: deve essere un oggetto'));
});

test('validatePack: format sbagliato o mancante è un errore', () => {
  const wrong = check(minimal({ format: 'mascotte-pack/2' }));
  assert.ok(hasError(wrong, 'format: deve essere "mascotte-pack/1" (trovato: "mascotte-pack/2")'), wrong.errors.join('\n'));
  const missing = minimal();
  delete missing.format;
  assert.ok(hasError(check(missing), 'format: obbligatorio'));
});

test('validatePack: campi obbligatori mancanti', () => {
  const j = minimal();
  delete j.name;
  delete j.sheet;
  delete j.frame;
  const r = check(j);
  assert.ok(hasError(r, 'name: obbligatorio'));
  assert.ok(hasError(r, 'sheet: obbligatorio'));
  assert.ok(hasError(r, 'frame: obbligatorio'));
  const half = check(minimal({ frame: { width: 32 } }));
  assert.ok(hasError(half, 'frame.height: obbligatorio'));
  assert.ok(hasError(check(minimal({ frame: { width: 0, height: 32 } })), 'frame.width: deve essere un intero da 1 a 512'));
});

test('validatePack: colonna fuori dal foglio (messaggio preciso)', () => {
  const r = check(minimal({ animations: { idle: { row: 0, frames: 2 }, done: { row: 1, frames: [0, 7] } } }));
  assert.ok(r.errors.includes('animations.done.frames: colonna 7 fuori dal foglio (colonne 0-5)'), r.errors.join('\n'));
});

test('validatePack: frames numerico più grande delle colonne del foglio', () => {
  const r = check(minimal({ animations: { idle: { row: 0, frames: 8 } } }));
  assert.ok(hasError(r, 'animations.idle.frames: 8 fotogrammi richiesti ma il foglio ha 6 colonne (colonne 0-5)'), r.errors.join('\n'));
});

test('validatePack: riga fuori dal foglio', () => {
  const r = check(minimal({ animations: { idle: { row: 0, frames: 1 }, sleep: { row: 2, frames: 1 } } }));
  assert.ok(r.errors.includes('animations.sleep.row: riga 2 fuori dal foglio (righe 0-1)'), r.errors.join('\n'));
});

test('validatePack: foglio non multiplo del fotogramma (larghezza e altezza)', () => {
  const w = check(minimal(), 100, 64);
  assert.ok(hasError(w, 'la larghezza del PNG (100 px) non è un multiplo della larghezza del fotogramma (32 px)'), w.errors.join('\n'));
  const h = check(minimal(), 192, 70);
  assert.ok(hasError(h, 'l\'altezza del PNG (70 px) non è un multiplo dell\'altezza del fotogramma (32 px)'), h.errors.join('\n'));
  assert.deepStrictEqual(check(minimal(), 192, 64).errors, []);
});

test('validatePack: foglio più piccolo del fotogramma', () => {
  const r = check(minimal(), 16, 16);
  assert.ok(hasError(r, 'non è un multiplo'));
  assert.ok(hasError(r, 'fuori dal foglio'));
});

test('validatePack: durations di lunghezza sbagliata o con valori non positivi', () => {
  const bad = check(minimal({ animations: { idle: { row: 0, frames: 2, durations: [900, 900, 900] } } }));
  assert.ok(bad.errors.includes('animations.idle.durations: 3 valori ma frames ne ha 2 (devono avere la stessa lunghezza)'), bad.errors.join('\n'));
  const neg = check(minimal({ animations: { idle: { row: 0, frames: 2, durations: [900, 0] } } }));
  assert.ok(hasError(neg, 'animations.idle.durations[1]: deve essere un numero positivo di millisecondi (trovato: 0)'), neg.errors.join('\n'));
  const ok = check(minimal({ animations: { idle: { row: 0, frames: 2, durations: [900, 400] } } }));
  assert.deepStrictEqual(ok.errors, []);
  assert.deepStrictEqual(ok.pack.animations.idle.durations, [900, 400]);
});

test('validatePack: fps tra 1 e 30', () => {
  for (const fps of [0, 31, -5, '8']) {
    const r = check(minimal({ animations: { idle: { row: 0, frames: 2, fps } } }));
    assert.ok(hasError(r, 'animations.idle.fps'), 'fps ' + fps);
  }
  for (const fps of [1, 12, 30]) {
    assert.deepStrictEqual(check(minimal({ animations: { idle: { row: 0, frames: 2, fps } } })).errors, [], 'fps ' + fps);
  }
});

test('validatePack: loop, scale e frames con tipi sbagliati', () => {
  assert.ok(hasError(check(minimal({ animations: { idle: { row: 0, frames: 2, loop: 'no' } } })), 'animations.idle.loop: deve essere true o false'));
  assert.ok(hasError(check(minimal({ scale: 2.5 })), 'scale: deve essere un intero da 1 a 8'));
  assert.ok(hasError(check(minimal({ animations: { idle: { row: 0, frames: [0, -1] } } })), 'animations.idle.frames[1]'));
  assert.ok(hasError(check(minimal({ animations: { idle: { row: 0, frames: [] } } })), 'la lista è vuota'));
  assert.ok(hasError(check(minimal({ animations: { idle: { row: 0, frames: 1e9 } } })), 'troppi fotogrammi'));
  assert.ok(hasError(check(minimal({ animations: { idle: { row: 'a', frames: 2 } } })), 'animations.idle.row: deve essere un intero da 0 in su'));
});

test('validatePack: stato sconosciuto è un avviso e viene ignorato', () => {
  const r = check(minimal({ animations: { idle: { row: 0, frames: 2 }, dance: { row: 1, frames: 3 } } }));
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.warnings, ['animations.dance: stato sconosciuto, ignorato']);
  assert.ok(!('dance' in r.pack.animations));
});

test('validatePack: campi in più sono avvisi', () => {
  const r = check(minimal({
    colore: 'rosso',
    frame: { width: 32, height: 32, margine: 1 },
    animations: { idle: { row: 0, frames: 2, easing: 'lineare' } }
  }));
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.warnings.includes('colore: campo sconosciuto, ignorato'));
  assert.ok(r.warnings.includes('frame.margine: campo sconosciuto, ignorato'));
  assert.ok(r.warnings.includes('animations.idle.easing: campo sconosciuto, ignorato'));
  assert.equal(r.warnings.length, 3);
});

test('validatePack: fallbacks verso stati non in elenco sono errori', () => {
  const r = check(minimal({ fallbacks: { celebrate: 'danza', talk: 'idle' } }));
  assert.ok(r.errors.includes('fallbacks.celebrate: "danza" non è uno stato noto'), r.errors.join('\n'));
  assert.deepStrictEqual(r.pack.fallbacks, { talk: 'idle' });
});

test('validatePack: fallbacks con chiave sconosciuta, su se stesso, su idle o già presente', () => {
  const unknown = check(minimal({ fallbacks: { ballo: 'idle' } }));
  assert.deepStrictEqual(unknown.errors, []);
  assert.deepStrictEqual(unknown.warnings, ['fallbacks.ballo: stato sconosciuto, ignorato']);
  assert.ok(hasError(check(minimal({ fallbacks: { talk: 'talk' } })), 'non può essere il proprio ripiego'));
  assert.ok(hasWarning(check(minimal({ fallbacks: { idle: 'sleep' } })), 'fallbacks.idle'));
  const present = check(minimal({ fallbacks: { idle: 'idle', sleep: 'idle' }, animations: { idle: { row: 0, frames: 1 }, sleep: { row: 1, frames: 1 } } }));
  assert.ok(hasWarning(present, 'fallbacks.sleep: lo stato esiste già nel pacchetto'));
});

test('validatePack: ripiego circolare è un avviso', () => {
  const r = check(minimal({ fallbacks: { reading: 'writing', writing: 'reading' } }));
  assert.deepStrictEqual(r.errors, []);
  assert.equal(r.warnings.filter((w) => w.includes('ripiego circolare')).length, 1, r.warnings.join('\n'));
  assert.ok(hasWarning(r, 'reading → writing → reading'));
});

test('validatePack: bubble fuori dal fotogramma è un avviso; bubble malformato un errore', () => {
  const out = check(minimal({ bubble: { x: 40, y: 2 } }));
  assert.deepStrictEqual(out.errors, []);
  assert.ok(hasWarning(out, 'bubble.x: 40 è fuori dal fotogramma (0-32)'));
  assert.deepStrictEqual(out.pack.bubble, { x: 40, y: 2 });
  const bad = check(minimal({ bubble: { x: 'a', y: 2 } }));
  assert.ok(hasError(bad, 'bubble.x: deve essere un numero'));
  assert.deepStrictEqual(bad.pack.bubble, { x: 16, y: 0 });
});

test('validatePack: sheet non può essere un indirizzo, un percorso assoluto o uscire dalla cartella', () => {
  for (const sheet of ['https://example.com/a.png', '//example.com/a.png', '/etc/a.png', '../a.png', 'x/../../a.png', 'file:///a.png']) {
    const r = check(minimal({ sheet }));
    assert.ok(r.errors.some((e) => e.startsWith('sheet: ')), 'sheet ' + sheet + ' -> ' + r.errors.join('|'));
  }
  assert.deepStrictEqual(check(minimal({ sheet: 'img/sprites.png' })).errors, []);
  assert.ok(hasWarning(check(minimal({ sheet: 'sprites.jpg' })), 'estensione .png'));
});

test('validatePack: json che non è un oggetto', () => {
  for (const v of [null, [], 'testo', 42]) {
    const r = validatePack(v, 192, 64);
    assert.equal(r.pack, null);
    assert.equal(r.errors.length, 1);
    assert.ok(r.errors[0].startsWith('character.json: deve contenere un oggetto JSON'));
  }
});

test('validatePack: senza misura del foglio salta solo i controlli sul foglio', () => {
  const r = validatePack(minimal({ animations: { idle: { row: 9, frames: 99 } } }), undefined, undefined);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.pack.animations.idle.frames.length, 99);
});

test('validatePack: stato "__proto__" nelle animazioni non inquina nulla', () => {
  const json = JSON.parse('{"format":"mascotte-pack/1","name":"x","sheet":"s.png","frame":{"width":32,"height":32},' +
    '"animations":{"idle":{"row":0,"frames":1},"__proto__":{"row":0,"frames":1}}}');
  const r = validatePack(json, 32, 32);
  assert.ok(hasWarning(r, 'animations.__proto__: stato sconosciuto'));
  assert.equal(Object.getPrototypeOf(r.pack.animations), Object.prototype);
  assert.deepStrictEqual(Object.keys(r.pack.animations), ['idle']);
});

test('validatePack: non modifica l\'oggetto ricevuto', () => {
  const j = demoJson();
  const copy = JSON.parse(JSON.stringify(j));
  validatePack(j, 128, 128);
  assert.deepStrictEqual(j, copy);
});

// ---------------------------------------------------------------- resolveState

const packWith = (names, fallbacks) => ({
  animations: Object.fromEntries(names.map((n) => [n, { row: 0, frames: [0], fps: 8, durations: null, loop: true }])),
  fallbacks: fallbacks || {}
});

test('resolveState: stato presente nel pacchetto', () => {
  assert.deepStrictEqual(resolveState('done', packWith(['idle', 'done'])), { used: 'done', chain: ['done'] });
  assert.deepStrictEqual(resolveState('idle', packWith(['idle'])), { used: 'idle', chain: ['idle'] });
});

test('resolveState: ripiego a catena reading → working → thinking → idle', () => {
  assert.deepStrictEqual(resolveState('reading', packWith(['idle'])),
    { used: 'idle', chain: ['reading', 'working', 'thinking', 'idle'] });
  assert.deepStrictEqual(resolveState('reading', packWith(['idle', 'thinking'])),
    { used: 'thinking', chain: ['reading', 'working', 'thinking'] });
  assert.deepStrictEqual(resolveState('celebrate', packWith(['idle'])),
    { used: 'idle', chain: ['celebrate', 'done', 'idle'] });
  assert.deepStrictEqual(resolveState('listening', packWith(['idle'])),
    { used: 'idle', chain: ['listening', 'thinking', 'idle'] });
});

test('resolveState: i fallbacks del pacchetto prevalgono su quelli predefiniti', () => {
  // predefinito: celebrate → done; il pacchetto vuole celebrate → talk
  const p = packWith(['idle', 'done', 'talk'], { celebrate: 'talk' });
  assert.deepStrictEqual(resolveState('celebrate', p), { used: 'talk', chain: ['celebrate', 'talk'] });
  // il ripiego del pacchetto prosegue poi con quelli predefiniti
  const q = packWith(['idle', 'thinking'], { reading: 'looking-nowhere', waiting: 'sleep' });
  assert.deepStrictEqual(resolveState('waiting', q), { used: 'idle', chain: ['waiting', 'sleep', 'idle'] });
  const r = packWith(['idle', 'thinking'], { waiting: 'working' });
  assert.deepStrictEqual(resolveState('waiting', r), { used: 'thinking', chain: ['waiting', 'working', 'thinking'] });
});

test('resolveState: un fallback del pacchetto non vale se lo stato esiste già', () => {
  const p = packWith(['idle', 'done', 'talk'], { done: 'talk' });
  assert.deepStrictEqual(resolveState('done', p), { used: 'done', chain: ['done'] });
});

test('resolveState: ciclo nei fallbacks, si arriva a idle senza girare all\'infinito', () => {
  const p = packWith(['idle'], { reading: 'writing', writing: 'reading' });
  assert.deepStrictEqual(resolveState('reading', p), { used: 'idle', chain: ['reading', 'writing', 'idle'] });
  // ciclo creato dall'incrocio con i ripieghi predefiniti: thinking → working → thinking
  const q = packWith(['idle'], { thinking: 'working' });
  assert.deepStrictEqual(resolveState('reading', q), { used: 'idle', chain: ['reading', 'working', 'thinking', 'idle'] });
});

test('resolveState: stato sconosciuto o pacchetto senza idle finiscono su idle', () => {
  assert.deepStrictEqual(resolveState('ballo', packWith(['idle'])), { used: 'idle', chain: ['ballo', 'idle'] });
  assert.deepStrictEqual(resolveState('reading', packWith([])), { used: 'idle', chain: ['reading', 'working', 'thinking', 'idle'] });
  assert.deepStrictEqual(resolveState('idle', { animations: {} }), { used: 'idle', chain: ['idle'] });
  assert.deepStrictEqual(resolveState('sleep', { animations: {} }), { used: 'idle', chain: ['sleep', 'idle'] });
});

test('resolveState: sul pacchetto demo (con fallbacks reali)', () => {
  const p = validatePack(demoJson(), 128, 128).pack;
  assert.deepStrictEqual(resolveState('waiting', p), { used: 'thinking', chain: ['waiting', 'thinking'] }); // ripiego del pacchetto (predefinito: idle)
  assert.deepStrictEqual(resolveState('celebrate', p), { used: 'done', chain: ['celebrate', 'done'] });
  assert.deepStrictEqual(resolveState('reading', p), { used: 'thinking', chain: ['reading', 'working', 'thinking'] });
});

// ---------------------------------------------------------------- frameSchedule

test('frameSchedule: con fps', () => {
  assert.deepStrictEqual(frameSchedule({ row: 2, frames: [0, 1, 2], fps: 10 }), [
    { col: 0, row: 2, ms: 100 }, { col: 1, row: 2, ms: 100 }, { col: 2, row: 2, ms: 100 }
  ]);
  assert.deepStrictEqual(frameSchedule({ row: 0, frames: 2, fps: 4 }), [
    { col: 0, row: 0, ms: 250 }, { col: 1, row: 0, ms: 250 }
  ]);
});

test('frameSchedule: fps di default 8 (125 ms)', () => {
  assert.deepStrictEqual(frameSchedule({ row: 0, frames: [3, 3] }), [
    { col: 3, row: 0, ms: 125 }, { col: 3, row: 0, ms: 125 }
  ]);
});

test('frameSchedule: con durations (prevale su fps)', () => {
  assert.deepStrictEqual(frameSchedule({ row: 1, frames: [0, 1], fps: 30, durations: [900, 700] }), [
    { col: 0, row: 1, ms: 900 }, { col: 1, row: 1, ms: 700 }
  ]);
});

test('frameSchedule: ripete e tiene fermi i fotogrammi come da lista', () => {
  const s = frameSchedule({ row: 0, frames: [0, 0, 0, 1, 0, 2], fps: 6 });
  assert.deepStrictEqual(s.map((x) => x.col), [0, 0, 0, 1, 0, 2]);
  assert.ok(s.every((x) => Math.abs(x.ms - 1000 / 6) < 1e-9));
});

test('frameSchedule: dal pacchetto normalizzato demo', () => {
  const p = validatePack(demoJson(), 128, 128).pack;
  const idle = frameSchedule(p.animations.idle);
  assert.deepStrictEqual(idle.map((x) => x.col), [0, 1, 2, 3, 2, 1]);
  assert.equal(idle[0].row, 0);
  assert.deepStrictEqual(frameSchedule(p.animations.sleep).map((x) => x.ms), [900, 700]);
  assert.deepStrictEqual(frameSchedule(p.animations.done).map((x) => x.ms), [100, 100, 100, 100]);
});

// ---------------------------------------------------------------- frameAt / frameStart

test('frameAt: con loop torna all\'inizio, senza loop si ferma sull\'ultimo', () => {
  const s = frameSchedule({ row: 0, frames: 3, fps: 10 }); // 100 ms ciascuno, 300 totali
  assert.deepStrictEqual(frameAt(s, 0, true), { index: 0, finished: false });
  assert.deepStrictEqual(frameAt(s, 99, true), { index: 0, finished: false });
  assert.deepStrictEqual(frameAt(s, 100, true), { index: 1, finished: false });
  assert.deepStrictEqual(frameAt(s, 299, true), { index: 2, finished: false });
  assert.deepStrictEqual(frameAt(s, 300, true), { index: 0, finished: false });
  assert.deepStrictEqual(frameAt(s, 650, true), { index: 0, finished: false });
  assert.deepStrictEqual(frameAt(s, 299, false), { index: 2, finished: false });
  assert.deepStrictEqual(frameAt(s, 300, false), { index: 2, finished: true });
  assert.deepStrictEqual(frameAt(s, 99999, false), { index: 2, finished: true });
  assert.deepStrictEqual(frameAt(s, -50, true), { index: 0, finished: false });
  assert.deepStrictEqual(frameAt([], 100, true), { index: 0, finished: true });
});

test('frameAt e frameStart: si compongono (anche con durate irregolari)', () => {
  const s = frameSchedule({ row: 0, frames: [0, 1, 2], durations: [120.5, 333.3, 90.1] });
  for (let i = 0; i < s.length; i++) {
    assert.equal(frameAt(s, frameStart(s, i), true).index, i);
    assert.equal(frameAt(s, frameStart(s, i), false).index, i);
  }
});

// ---------------------------------------------------------------- file e percorsi

test('pngSize: rifiuta ciò che non è un PNG', () => {
  assert.equal(Pack.pngSize(new Uint8Array(0)), null);
  assert.equal(Pack.pngSize(Buffer.from('<html>non sono un png, ma sono abbastanza lungo</html>')), null);
  assert.equal(Pack.pngSize(null), null);
  const truncated = fs.readFileSync(path.join(DEMO, 'sprites.png')).subarray(0, 20);
  assert.equal(Pack.pngSize(truncated), null);
});

test('parseJson: BOM, errore in italiano', () => {
  assert.deepStrictEqual(Pack.parseJson('﻿{"a":1}'), { json: { a: 1 }, error: null });
  const bad = Pack.parseJson('{"a":');
  assert.equal(bad.json, null);
  assert.ok(bad.error.startsWith('character.json non è un JSON valido'));
});

test('listCharacterJsons: ordina per vicinanza alla radice', () => {
  const paths = ['characters/zebra/character.json', 'characters/zebra/sprites.png', 'character.json',
    'characters/gattino/Character.JSON', 'note.txt'];
  assert.deepStrictEqual(Pack.listCharacterJsons(paths),
    ['character.json', 'characters/gattino/Character.JSON', 'characters/zebra/character.json']);
  assert.deepStrictEqual(Pack.listCharacterJsons(['a.png', 'b.json']), []);
  assert.deepStrictEqual(Pack.listCharacterJsons(['./gattino\\character.json']), ['gattino/character.json']);
});

test('resolveSheetPath: percorso esatto, maiuscole diverse, solo nome', () => {
  const paths = ['gattino/character.json', 'gattino/sprites.png', 'altro/sprites.png'];
  assert.equal(Pack.resolveSheetPath(paths, 'gattino/character.json', 'sprites.png'), 'gattino/sprites.png');
  assert.equal(Pack.resolveSheetPath(['character.json', 'SPRITES.PNG'], 'character.json', 'sprites.png'), 'SPRITES.PNG');
  assert.equal(Pack.resolveSheetPath(['gattino/character.json', 'gattino/img/sprites.png'], 'gattino/character.json', 'sprites.png'), 'gattino/img/sprites.png');
  assert.equal(Pack.resolveSheetPath(['character.json', 'sprites.png'], 'character.json', './sprites.png'), 'sprites.png');
  assert.equal(Pack.resolveSheetPath(['character.json', 'altro.png'], 'character.json', 'sprites.png'), null);
  // due candidati con lo stesso nome: ambiguo, non indovino
  assert.equal(Pack.resolveSheetPath(['g/character.json', 'g/a/s.png', 'g/b/s.png'], 'g/character.json', 's.png'), null);
});

test('folderName: da percorsi e indirizzi di cartella', () => {
  assert.equal(Pack.folderName('../characters/gattino/'), 'gattino');
  assert.equal(Pack.folderName('characters/gattino/character.json'), 'gattino');
  assert.equal(Pack.folderName('character.json'), '');
  assert.equal(Pack.folderName(''), '');
  assert.equal(Pack.folderName('./'), '');
});

// ---------------------------------------------------------------- pagina

const html = fs.readFileSync(path.join(VIEWER, 'index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(VIEWER, 'app.js'), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
const appCode = stripComments(appSrc);

test('pagina: pack.js non usa il DOM', () => {
  const src = fs.readFileSync(path.join(VIEWER, 'pack.js'), 'utf8');
  assert.ok(!/\bdocument\b|\blocalStorage\b|\bfetch\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('pagina: script classici nell\'ordine giusto (funziona da file://)', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 2);
  assert.ok(scripts.every((a) => !/type\s*=\s*["']?module/i.test(a)));
  assert.ok(scripts[0].includes('pack.js') && scripts[1].includes('app.js'));
  assert.ok(html.includes('viewer.css'));
  assert.ok(!/(https?:)?\/\/(cdn|unpkg|fonts)/i.test(html), 'nessuna risorsa esterna');
});

test('pagina: ogni id usato da app.js esiste in index.html', () => {
  const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(htmlIds).size, htmlIds.length, 'id duplicati: ' + htmlIds.join(','));
  const used = new Set([...appSrc.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
  for (const m of appSrc.matchAll(/getElementById\('([^']+)'\)/g)) used.add(m[1]);
  assert.ok(used.size > 20, 'app.js dovrebbe usare molti id, trovati ' + used.size);
  const missing = [...used].filter((id) => !htmlIds.includes(id));
  assert.deepStrictEqual(missing, []);
  // niente accessi dinamici agli id: non sarebbero controllabili
  assert.ok(!/getElementById\((?!')/.test(appSrc.replace("document.getElementById(id)", '')));
  assert.ok(!/\$\((?!')/.test(appSrc.replace(/const \$ = \(id\) =>/, '')));
});

test('pagina: nessuna dipendenza esterna in CSS e JavaScript', () => {
  const css = fs.readFileSync(path.join(VIEWER, 'viewer.css'), 'utf8');
  assert.ok(!/@import|url\(\s*["']?https?:/i.test(css));
  assert.ok(!/\bimport\s*\(|^\s*import\s|\brequire\(/m.test(appCode));
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(appCode), 'i testi del pacchetto vanno solo in textContent');
});

test('pagina: tema scuro e variabili CSS su :root', () => {
  const css = fs.readFileSync(path.join(VIEWER, 'viewer.css'), 'utf8');
  assert.ok(/:root\s*\{[^}]*--bg:/.test(css));
  assert.ok(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{/.test(css));
  assert.ok(/:focus-visible/.test(css));
  assert.ok(/imageSmoothingEnabled\s*=\s*false/.test(appSrc));
});

test('pagina: una sola requestAnimationFrame, nessun timer per canvas', () => {
  const raf = appSrc.match(/requestAnimationFrame\(/g) || [];
  assert.equal(raf.length, 2, 'una per avviare il ciclo e una nel ciclo stesso');
  assert.ok(!/setInterval\(/.test(appSrc));
});

test('validatePack: scala e fotogrammi estremi non possono produrre una finestra enorme', () => {
  assert.ok(hasError(check(minimal({ scale: Number.MAX_SAFE_INTEGER })), 'scale:'));
  assert.ok(hasError(validatePack(minimal({ frame: { width: Number.MAX_SAFE_INTEGER, height: 32 } })), 'frame.width:'));
  assert.ok(hasError(validatePack(minimal({ frame: { width: 512, height: 512 }, scale: 8 })), '2048 punti'));
  assert.deepStrictEqual(check(minimal({ scale: 8 })).errors, []);
});
