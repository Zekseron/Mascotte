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

module.exports = { configureDisplayCapture };
