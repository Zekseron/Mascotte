'use strict';

function configureDisplayCapture(session, { getChat, getSource, listSources }) {
  const authorized = web => {
    const chat = getChat();
    return Boolean(chat && !chat.isDestroyed() && web === chat.webContents && getSource());
  };
  session.setPermissionRequestHandler((web, permission, callback, details = {}) => callback(
    // Electron 44 reports display requests as media with no camera/mic types.
    (permission === 'display-capture' || (permission === 'media' && Array.isArray(details.mediaTypes) && details.mediaTypes.length === 0)) &&
    authorized(web)
  ));
  session.setPermissionCheckHandler((web, permission) => permission === 'display-capture' && authorized(web));
  session.setDisplayMediaRequestHandler(async (request, callback) => {
    const selected = getSource(), chat = getChat();
    if (!selected || !chat || chat.isDestroyed() || request.frame !== chat.webContents.mainFrame ||
        !request.videoRequested || request.audioRequested) { callback(null); return; }
    try {
      const source = (await listSources()).find(item => item.id === selected.id);
      callback(source && getSource() === selected && getChat() === chat && !chat.isDestroyed() ? { video: source } : null);
    } catch { callback(null); }
  });
}

// Mac: le anteprime di Stage Manager e le finestre di servizio compaiono come finestre vere con lo stesso titolo.
// L'helper Swift (--list) dà ID, app e dimensioni delle finestre visibili: si tengono solo quelle abbastanza grandi
// e si mette il nome dell'app davanti al titolo. ID di desktopCapturer su Mac: «window:<CGWindowID>:0».
const MIN_WIDTH = 200, MIN_HEIGHT = 150, SERVICE_OWNERS = new Set(['WindowManager', 'Dock', 'Window Server', 'Centro di Controllo', 'Control Center', 'SystemUIServer']);
function filterMacWindows(sources, windows) {
  const byId = new Map(windows.filter(item => Number.isInteger(item?.id)).map(item => [item.id, item]));
  return sources.flatMap(source => {
    const info = byId.get(Number(source.id.split(':')[1]));
    if (!info || info.width < MIN_WIDTH || info.height < MIN_HEIGHT || SERVICE_OWNERS.has(info.owner)) return [];
    const owner = typeof info.owner === 'string' ? info.owner.trim().slice(0, 60) : '';
    return [{ id: source.id, name: owner && owner !== source.name && !source.name.startsWith(owner) ? `${owner} · ${source.name}`.slice(0, 160) : source.name }];
  });
}
function listMacWindows(helper, hostPid) {
  return new Promise(resolve => {
    require('node:child_process').execFile(helper, ['--list'], { timeout: 3000, maxBuffer: 1024 * 1024, env: { ...process.env, MASCOTTE_HOST_PID: String(hostPid) } }, (error, stdout) => {
      if (error) { resolve(null); return; }
      try { const value = JSON.parse(stdout); resolve(Array.isArray(value) ? value : null); } catch { resolve(null); }
    });
  });
}

module.exports = { configureDisplayCapture, filterMacWindows, listMacWindows };
