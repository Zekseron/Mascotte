'use strict';
// Suono della sveglia, comune a chat e fumetto: il file scelto nelle Impostazioni in ciclo, oppure due bip generati
// ogni 1,2 secondi. custom = { base64, mime } letto dal processo principale, oppure null per il bip.
const AlarmPlayer = (() => {
  let context = null, beeps = null, player = null, url = null;
  function beepSound(volume) {
    try { context = new AudioContext(); } catch { return; }
    const beep = () => { for (const start of [0, 0.25]) { const osc = context.createOscillator(), gain = context.createGain(), at = context.currentTime + start;
      osc.frequency.value = 880; gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.3 * volume, at + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      osc.connect(gain).connect(context.destination); osc.start(at); osc.stop(at + 0.2); } };
    beep(); beeps = setInterval(beep, 1200);
  }
  function stop() {
    clearInterval(beeps); beeps = null; try { context?.close(); } catch {} context = null;
    if (player) { player.pause(); player.removeAttribute('src'); player = null; }
    if (url) { URL.revokeObjectURL(url); url = null; }
  }
  async function start({ volume = 0.8, custom = null } = {}) {
    stop();
    volume = Number(volume) || 0.8;
    if (custom?.base64) {
      try {
        const bytes = Uint8Array.from(atob(custom.base64), char => char.charCodeAt(0));
        url = URL.createObjectURL(new Blob([bytes], { type: custom.mime }));
        player = new Audio(url); player.loop = true; player.volume = volume; await player.play(); return;
      } catch { stop(); }
    }
    beepSound(volume); // ripiego anche se l'audio scelto non si riesce a riprodurre
  }
  return { start, stop, get playing() { return Boolean(beeps || player); } };
})();
