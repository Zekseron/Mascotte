'use strict';
// Osservazione di una finestra: permesso di registrazione dello schermo, elenco delle finestre osservabili,
// finestra scelta e interruzione. La cattura vera (flusso video nella chat) è in capture.cjs; qui ci sono le
// decisioni, con le dipendenze di Electron passate da fuori così si provano nei test.
const PERMISSION_MESSAGES = {
  restricted: 'La registrazione dello schermo è bloccata da un profilo o da Tempo di utilizzo su questo Mac.',
  missing: 'Mascotte non ha il permesso «Registrazione schermo». Attivalo in Impostazioni di Sistema > Privacy e sicurezza > Registrazione schermo, poi esci da Mascotte e riaprila.',
};

function createWatch({
  desktopCapturer, systemPreferences, Capture, macHelperPath, ErrorLog,
  ownWindows,          // () => finestre di Mascotte da escludere dall'elenco (mascotte, chat)
  onStop,              // chiamata quando l'osservazione si interrompe (avviso alla chat, stato)
  platform = process.platform, pid = process.pid,
}) {
  let source = null;

  // Su Mac la cattura richiede il permesso «Registrazione schermo» (Privacy e sicurezza). Su Windows non serve.
  const permission = () => platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted';
  const permissionMessage = status => status === 'restricted' ? PERMISSION_MESSAGES.restricted : PERMISSION_MESSAGES.missing;

  async function windows() {
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    const own = new Set(ownWindows().filter(Boolean).map(w => w.getMediaSourceId()).filter(Boolean).map(id => id.split(':')[1]));
    const list = sources.filter(item => item.name?.trim() && /^window:/.test(item.id) && !own.has(item.id.split(':')[1]))
      .map(item => ({ id: item.id, name: item.name.slice(0, 160) }));
    if (platform !== 'darwin') return list;
    // Mac: via le anteprime di Stage Manager e le finestre di servizio. Senza helper si mostra l'elenco completo.
    const macWindows = await Capture.listMacWindows(macHelperPath, pid);
    return macWindows ? Capture.filterMacWindows(list, macWindows) : list;
  }

  // Elenco per la chat: se il permesso manca restituisce { permission, message } al posto delle finestre.
  async function windowsWithPermission() {
    let status = permission();
    // Prima richiesta: getSources fa comparire la domanda di macOS. Il permesso vale di solito solo dopo il riavvio dell'app.
    if (status === 'not-determined') { try { await windows(); } catch (e) { ErrorLog.error('richiesta permesso registrazione schermo', e); } status = permission(); }
    if (status !== 'granted') return { permission: status, message: permissionMessage(status) };
    return windows();
  }

  function select(item) { source = item; }
  function stop() { source = null; onStop(); }

  return { permission, permissionMessage, windows, windowsWithPermission, select, stop, get source() { return source; } };
}

module.exports = { createWatch, PERMISSION_MESSAGES };
