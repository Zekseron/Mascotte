'use strict';
// Suono della sveglia: file scelto in ciclo o bip generati.
// Fa parte della chat divisa in più script classici: ordine di caricamento in chat.html (globali condivisi).
// Suono della sveglia: il file scelto nelle Impostazioni in ciclo, oppure due bip generati ogni 1,2 secondi. Il volume viene dalle Impostazioni.
let alarmAudio = null, alarmBeeps = null, alarmPlayer = null, alarmUrl = null, alarmTesting = false;
function beepSound(volume) {
  try { alarmAudio = new AudioContext(); } catch { return; }
  const beep = () => { for (const start of [0, 0.25]) { const osc = alarmAudio.createOscillator(), gain = alarmAudio.createGain(), at = alarmAudio.currentTime + start;
    osc.frequency.value = 880; gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.3 * volume, at + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    osc.connect(gain).connect(alarmAudio.destination); osc.start(at); osc.stop(at + 0.2); } };
  beep(); alarmBeeps = setInterval(beep, 1200);
}
async function startAlarmSound() {
  stopAlarmSound();
  const volume = Number(current?.alarmSettings?.volume) || 0.8;
  if (current?.alarmSettings?.sound === 'custom') {
    try {
      const sound = await invoke('alarm-sound-data');
      if (sound?.base64) {
        const bytes = Uint8Array.from(atob(sound.base64), char => char.charCodeAt(0));
        alarmUrl = URL.createObjectURL(new Blob([bytes], { type: sound.mime }));
        alarmPlayer = new Audio(alarmUrl); alarmPlayer.loop = true; alarmPlayer.volume = volume; await alarmPlayer.play(); return;
      }
    } catch { stopAlarmSound(); }
  }
  beepSound(volume); // ripiego anche se l'audio scelto non si riesce a riprodurre
}
function stopAlarmSound() {
  clearInterval(alarmBeeps); alarmBeeps = null; try { alarmAudio?.close(); } catch {} alarmAudio = null;
  if (alarmPlayer) { alarmPlayer.pause(); alarmPlayer.removeAttribute('src'); alarmPlayer = null; }
  if (alarmUrl) { URL.revokeObjectURL(alarmUrl); alarmUrl = null; }
}