'use strict';
const P = window.MascottePack, canvas = document.getElementById('pet'), ctx = canvas.getContext('2d', { willReadFrequently: true });
const image = new Image();
let pack, animation, schedule, started, timer, previous, pointer, paused = false;
// Colori personalizzati: la mappa delle parti (parts.png) si legge cella per cella e il fotogramma si ricolora quando viene disegnato.
// Gli ultimi fotogrammi ricolorati restano in memoria; cambiando colore la memoria si svuota.
const R = window.MascotteRecolor, partsImage = new Image(), partsCanvas = document.createElement('canvas'), partsCtx = partsCanvas.getContext('2d', { willReadFrequently: true });
let partsReady = false, transforms = [], colors = {}, recolored = new Map();
function setColors(value) {
  colors = value && typeof value === 'object' ? value : {};
  transforms = pack?.parts ? R.prepare(pack.parts.list.map(part => ({ base: part.color, target: colors[part.id] || part.color }))) : [];
  recolored = new Map(); previous = null;
}
function drawRecolored(col, row, key) {
  let frame = recolored.get(key);
  if (!frame) {
    frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    partsCtx.clearRect(0, 0, partsCanvas.width, partsCanvas.height);
    partsCtx.drawImage(partsImage, col * canvas.width, row * canvas.height, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    R.apply(frame.data, partsCtx.getImageData(0, 0, canvas.width, canvas.height).data, transforms);
    recolored.set(key, frame);
    if (recolored.size > 48) recolored.delete(recolored.keys().next().value);
  }
  ctx.putImageData(frame, 0, 0);
}
let loading=false,pendingAnimation;
function loadCharacter(value){
  clearTimeout(timer);loading=true;pendingAnimation=null;pack=value.pack;
  canvas.width=pack.frame.width;canvas.height=pack.frame.height;
  canvas.style.imageRendering=(pack.pixelRatio||1)>1?'auto':'pixelated';
  canvas.setAttribute('aria-label',pack.name+': clic per aprire la micro chat');
  partsReady=false;partsCanvas.width=pack.frame.width;partsCanvas.height=pack.frame.height;setColors(value.colors);
  if(pack.parts&&value.partsData){partsImage.onload=()=>{partsReady=true;previous=null;if(!loading)tick();};partsImage.src=value.partsData;}else partsImage.removeAttribute('src');
  image.onload=()=>{loading=false;play(pendingAnimation||value.animation);};
  image.src=value.imageData;
}
const invoke = (action, data) => window.mascotte.invoke(action, data).catch(() => {});
function tick() {
  clearTimeout(timer);
  if (paused || !schedule?.length) return;
  const elapsed = performance.now() - started;
  const frame = P.frameAt(schedule, elapsed, animation.loop);
  const entry = schedule[frame.index], key = entry.col + ':' + entry.row;
  if (key !== previous) {
    previous = key;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, entry.col * canvas.width, entry.row * canvas.height, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    if (partsReady && transforms.some(Boolean)) drawRecolored(entry.col, entry.row, key);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const mask = Uint8Array.from({length:canvas.width*canvas.height},(_,i)=>pixels[i*4+3]>10?1:0);
    invoke('mask', mask);
  }
  if (frame.finished || (animation.loop && schedule.length === 1)) return;
  const cycle = animation.loop ? elapsed % P.totalMs(schedule) : elapsed;
  timer = setTimeout(tick, Math.max(4, P.frameStart(schedule, frame.index + 1) - cycle));
}
function play(value) { animation = value; schedule = P.frameSchedule(animation); started = performance.now(); previous = null; tick(); }
window.mascotte.onState(value => {
  if(value.character){loadCharacter(value.character);return;}
  if (value.colors && pack) { setColors(value.colors); if (!loading) tick(); }
  if (typeof value.paused === 'boolean') { paused = value.paused; if (paused) clearTimeout(timer); else if (schedule) tick(); }
  if (value.animation && pack) {if(loading)pendingAnimation=value.animation;else play(value.animation);}
});
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pointer = { x: event.screenX, y: event.screenY, moved: false };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!pointer) return;
  const x = event.screenX - pointer.x, y = event.screenY - pointer.y;
  if (!pointer.moved && Math.hypot(x, y) > 4) { pointer.moved = true; invoke('drag-start'); }
  if (pointer.moved) invoke('drag-move', { x, y });
});
const release = () => { if (!pointer) return; const moved = pointer.moved; pointer = null; invoke(moved ? 'drag-end' : 'chat'); };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', () => { if (pointer?.moved) invoke('drag-end'); pointer = null; });
canvas.addEventListener('contextmenu', event => { event.preventDefault(); invoke('menu'); });
window.mascotte.invoke('init').then(loadCharacter);
