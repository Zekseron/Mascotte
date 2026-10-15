'use strict';
const P = window.MascottePack, canvas = document.getElementById('pet'), ctx = canvas.getContext('2d', { willReadFrequently: true });
const image = new Image();
let pack, animation, schedule, started, timer, previous, pointer, paused = false;
let loading=false,pendingAnimation;
function loadCharacter(value){
  clearTimeout(timer);loading=true;pendingAnimation=null;pack=value.pack;
  canvas.width=pack.frame.width;canvas.height=pack.frame.height;
  canvas.setAttribute('aria-label',pack.name+': clic per aprire la micro chat');
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
