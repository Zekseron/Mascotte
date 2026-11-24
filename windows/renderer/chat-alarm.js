'use strict';
// Suono della sveglia nella chat: impostazioni dalla chat, riproduzione con AlarmPlayer (alarm-player.js, comune al fumetto).
// Fa parte della chat divisa in più script classici: ordine di caricamento in chat.html (globali condivisi).
let alarmTesting = false;
async function startAlarmSound() {
  const custom = current?.alarmSettings?.sound === 'custom' ? await invoke('alarm-sound-data').catch(() => null) : null;
  await AlarmPlayer.start({ volume: current?.alarmSettings?.volume, custom });
}
function stopAlarmSound() { AlarmPlayer.stop(); }
