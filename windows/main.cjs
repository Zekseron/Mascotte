'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, session, dialog, desktopCapturer, shell } = require('electron');
const Platform = require('./lib/platform.cjs');
const can = Platform.capabilities();
const dataDirectory = Platform.dataDirectory({ appData: app.getPath('appData') });
const endpoint = path.join(dataDirectory, 'events.json');
if (process.argv.includes('--mascotte-notify')) {
  require('./lib/notify.cjs').notifyMain(process.argv.slice(process.argv.indexOf('--mascotte-notify') + 1), endpoint).finally(() => app.exit(0));
} else {
  app.setPath('userData', path.join(dataDirectory, 'electron'));
  if (!app.requestSingleInstanceLock()) app.quit();
  else startApplication();
}

function startApplication() {
  if (can.hideDock) app.dock?.hide();
  const { prepareDirectory, readJSON, atomicJSON, ChatStore, assertRegularPath } = require('./lib/storage.cjs');
  const CLI = require('./lib/cli.cjs');
  const LocalAI = require('./lib/local-ai.cjs');
  const { StateController, clampPosition } = require('./lib/state.cjs');
  const { EventServer } = require('./lib/events.cjs');
  const Setup = require('./lib/setup.cjs');
  const Updater = require('./lib/updater.cjs');
  const Releases = require('./lib/releases.cjs');
  const Attachment = require('./lib/attachment.cjs');
  const LocalCommands = require('./lib/local-commands.cjs');
  const { mascotSize, maskHit, dragPosition, barEdge, barHit } = require('./lib/geometry.cjs');
  const P = require('./resources/pack.js');
  let mascot, chat, tray, controller, server, store, memory, pack, imageData, currentRun, hitMask, mouseTimer;
  let settings, engine = 'codex', engineTouched = false, notice = '', setupPreview, drag, quitting = false, mouseIgnored = true, localAvailable = false, managedOllama = null;
  let characters = [];
  let attachment = 'free', singing = false, follower, captureFollower, captureTimer, anchorTimer, anchorDisplay, anchorFraction = .8, targetBounds, concealed = false, userVisible = true;
  let watchSource = null, activeShareDirectory = null, pendingAction = null;
  let localDownload = null, localDownloadStatus = '';
  let updateRunning = false, updateStatus = '', updateFailed = false, updateAbort = null;
  const stateFile = path.join(dataDirectory, 'settings.json');
  const views = name => path.join(__dirname, 'renderer', name + '.html');
  const broadcast = () => { if (chat && !chat.isDestroyed()) chat.webContents.send('mascotte-chat', chatSnapshot()); };
  const chatSnapshot = () => ({ engine, messages: store.get(engine), busy: Boolean(currentRun || localDownload), localDownloading: Boolean(localDownload), localDownloadStatus, notice, available: [...CLI.ENGINES.filter(e => CLI.findCLI(e)), ...(localAvailable ? ['locale'] : [])], localModel: settings?.localModel || LocalAI.defaultModel(), localVision: LocalAI.supportsVision(settings?.localModel), localCatalog: LocalAI.uiCatalog(), deviceName: can.deviceName, memories: memory.list(), pendingAction: pendingAction && { id: pendingAction.id, description: pendingAction.description }, setup: setupPreview ? { claude: setupPreview.after.claude, codex: setupPreview.after.codex } : null, watchAvailable: can.watch, watching: Boolean(watchSource), watchName: watchSource?.name || '', management: { available: can.management && app.isPackaged, version: app.getVersion(), repoPath: settings?.updateRepoPath || '', running: updateRunning, status: updateStatus, failed: updateFailed } });
  const saveSettings = () => atomicJSON(stateFile, settings);
  async function prepareLocal() {
    try { await LocalAI.checkModel({ model: settings.localModel }); }
    catch (error) {
      if (error.code !== 'ECONNREFUSED' || managedOllama || !can.managedOllama) throw error;
      managedOllama = LocalAI.startManaged(dataDirectory);
      if (!managedOllama) throw error;
      for (let i = 0; i < 30; i++) {
        if (quitting) throw new Error('Avvio locale interrotto.');
        await new Promise(resolve => setTimeout(resolve, 500));
        try { await LocalAI.checkModel({ model: settings.localModel }); return; }
        catch (next) { if (next.code !== 'ECONNREFUSED') throw next; }
      }
      throw new Error('Il servizio locale non si è avviato in tempo.');
    }
  }
  async function installRepositoryUpdate(repo) {
    const installDir = Updater.installationDirectory(process.execPath, repo.root, dataDirectory);
    const resultFile = path.join(dataDirectory, 'update-result.json');
    const logFile = path.join(dataDirectory, 'update.log');
    const result = await Updater.updateFromRepository(repo.root, message => { updateStatus = message; broadcast(); }, updateAbort.signal);
    updateStatus = 'Pacchetto pronto. Chiudo Mascotte per installare e riavviare…'; broadcast();
    // Run the helper from the NEW unpacked build, so no process locks the installed runtime.
    await Updater.launchInstaller({ ...result, installDir, resultFile, logFile, previousExe: process.execPath, parentPid: process.pid, helperScript: path.join(process.resourcesPath, 'mascotte-updater.cjs') });
    app.quit();
  }
  async function installPublishedRelease(release) {
    const work = fs.mkdtempSync(path.join(dataDirectory, 'release-update-'));
    let handedOff = false;
    try {
      const repo = Releases.repositoryContaining(process.execPath);
      const installDir = Updater.installationDirectory(process.execPath, repo || work, dataDirectory);
      updateStatus = `Scarico Mascotte ${release.version}…`; broadcast();
      const archive = await Releases.downloadRelease(release, work, updateAbort.signal);
      updateStatus = 'Verifica completata. Preparo l’installazione…'; broadcast();
      const runtime = await Releases.extractRuntime(archive, work, updateAbort.signal);
      await Updater.launchInstaller({ root: work, archive, runtime, installDir,
        resultFile: path.join(dataDirectory, 'update-result.json'), logFile: path.join(dataDirectory, 'update.log'),
        previousExe: process.execPath, parentPid: process.pid, helperScript: path.join(process.resourcesPath, 'mascotte-updater.cjs') });
      handedOff = true; app.quit();
    } finally {
      if (!handedOff) { try { await fs.promises.rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} }
    }
  }
  const displayAreas = () => screen.getAllDisplays().map(d => d.workArea);
  const displayScale = () => settings.scale/(pack.pixelRatio||1);
  const effectiveAnimation = animation => P.displayAnimation(pack,animation,attachment !== 'free',singing);
  const stateAnimation = () => effectiveAnimation(pack.animations[P.resolveState(controller.state,pack).used]);
  function moveMascot(x, y) {
    // Always provide the intended size: moving between DPI contexts must not accumulate size changes.
    mascot.setBounds({ x: Math.round(x), y: Math.round(y), ...mascotSize(pack, settings.scale) });
  }
  function updatePose() { if(controller && mascot && !mascot.isDestroyed() && !quitting) mascot.webContents.send('mascotte-state',{animation:stateAnimation()}); }
  function selectCharacter(id, initial = false) {
    const selected = characters.find(c=>c.id===id); if(!selected) return;
    controller?.close(); singing=false; pack=selected.pack;imageData=selected.imageData;hitMask=null;
    settings.character=id;
    settings.scale=settings.scales[id] || (id==='rosso'?settings.scale:pack.scale);
    if(![1,2,3,4,5,6].includes(settings.scale)||Math.max(pack.frame.width,pack.frame.height)*displayScale()>2048)settings.scale=pack.scale;
    controller=new StateController(pack,P,value=>mascot.webContents.send('mascotte-state',{...value,animation:effectiveAnimation(value.animation)}));
    if(!initial){
      mascot.webContents.send('mascotte-state',{character:{pack,imageData,animation:effectiveAnimation(pack.animations.idle)}});
      setScale(settings.scale);controller.set(currentRun?'thinking':'idle',Boolean(currentRun));saveSettings();
    }
  }
  function readCharacters() {
    const directory=path.join(__dirname,'resources/characters'),index=JSON.parse(fs.readFileSync(path.join(directory,'index.json'),'utf8'));
    return index.characters.map(entry=>{
      if(typeof entry.path!=='string'||path.isAbsolute(entry.path)||entry.path.split(/[\\/]/).includes('..'))throw new Error('Percorso personaggio non valido');
      const folder=path.join(directory,entry.path);assertRegularPath(folder);
      const bytes=fs.readFileSync(path.join(folder,'sprites.png')),size=P.pngSize(bytes);
      if(!size||bytes.length>16777216||size.width>8192||size.height>8192||size.width*size.height>33554432)throw new Error('Atlas non valido');
      const result=P.validatePack(JSON.parse(fs.readFileSync(path.join(folder,'character.json'),'utf8')),size.width,size.height);
      if(result.errors.length)throw new Error('Personaggio non valido: '+result.errors.join('; '));
      return {id:result.pack.id,name:result.pack.name,category:entry.category||'Altro',pack:result.pack,imageData:'data:image/png;base64,'+bytes.toString('base64')};
    });
  }
  function detach() {
    follower?.close(); follower = null; clearInterval(anchorTimer); anchorTimer = null;
    targetBounds = null; attachment = 'free'; singing = false; if (settings) settings.attachment = 'free';
    if (concealed && userVisible && !quitting) mascot.showInactive(); concealed = false;
    if(mascot&&!mascot.isDestroyed()&&pack&&!quitting){
      const b=mascot.getBounds(),position=clampPosition(b,b.width,b.height,displayAreas());
      moveMascot(position.x,position.y);
    }
    updatePose();
  }
  function placeAttachment() {
    if (!mascot || mascot.isDestroyed() || !userVisible || drag || attachment === 'free') return;
    const b = mascot.getBounds();
    const display = attachment === 'bar' ? screen.getAllDisplays().find(d => d.id === anchorDisplay) || screen.getDisplayMatching(b) : screen.getDisplayMatching(targetBounds || b);
    if (attachment === 'window' && !targetBounds) return;
    const edge = attachment === 'bar' ? barEdge(display) : targetBounds;
    const anchor=pack.perch?{x:pack.perch.anchor.x*displayScale(),y:pack.perch.anchor.y*displayScale()}:undefined;
    const position = Attachment.origin(b, edge, display.workArea, anchorFraction,anchor);
    if (b.x !== position.x || b.y !== position.y) moveMascot(position.x, position.y);
    if (concealed) { mascot.showInactive(); concealed = false; }
    updateHit();
  }
  function taskbarDisplayAt(point) {
    const d = screen.getDisplayNearestPoint(point);
    return barHit(d, point) ? d : null;
  }
  function attachBar(displayOverride) {
    detach(); const b = mascot.getBounds(), d = displayOverride || screen.getDisplayMatching(b);
    attachment = settings.attachment = 'bar'; anchorDisplay = d.id;
    anchorFraction = Math.max(0, Math.min(1, (b.x+b.width/2-d.workArea.x)/d.workArea.width));
    updatePose();placeAttachment(); anchorTimer = setInterval(placeAttachment, 1000); saveSettings();
  }
  function prepareWindowCapture() {
    if (!can.windowAttach) return;
    clearTimeout(captureTimer); captureFollower?.close();
    captureFollower = new Attachment.WindowFollower(() => {}, () => {});
    captureTimer = setTimeout(() => { captureFollower?.close(); captureFollower = null; }, 30000);
  }
  function attachWindow({ automatic = false, dropPoint } = {}) {
    if (!can.windowAttach) return;
    const selected = automatic ? null : captureFollower;
    clearTimeout(captureTimer); captureFollower = null;
    detach(); attachment = 'window'; updatePose(); saveSettings(); let first = true;
    follower = selected && !selected.closed ? selected : new Attachment.WindowFollower(() => {}, () => {});
    follower.setHandlers(state => {
      if (state.status === 'closed' || (automatic && state.status === 'unavailable')) { detach(); return; }
      if (state.status === 'unavailable') { detach(); dialog.showErrorBox('Nessuna finestra agganciabile', 'Porta in primo piano la finestra desiderata e riprova dal clic destro sulla mascotte.'); return; }
      if (state.status === 'hidden') { targetBounds = null; if (userVisible) { mascot.hide(); concealed = true; } return; }
      // Windows: l'helper dà pixel fisici. Mac: l'helper dà già punti, come `screen`.
      const toDip = point => process.platform === 'win32' ? screen.screenToDipPoint(point) : point;
      const top = toDip({ x: state.x, y: state.y });
      const bottom = toDip({ x: state.x + state.width, y: state.y + state.height });
      targetBounds = { x: top.x, y: top.y, width: bottom.x-top.x, height: bottom.y-top.y };
      if (first) {
        if (automatic) {
          const tolerance = Math.max(24, Math.round(32 * displayScale()));
          const nearTop = dropPoint && dropPoint.x >= targetBounds.x && dropPoint.x <= targetBounds.x + targetBounds.width &&
            dropPoint.y >= targetBounds.y - tolerance && dropPoint.y <= targetBounds.y + tolerance;
          if (!nearTop) { detach(); return; }
        }
        const b = mascot.getBounds(); anchorFraction = Math.max(0, Math.min(1, (b.x+b.width/2-top.x)/targetBounds.width)); first = false;
      }
      placeAttachment();
    }, () => { detach(); if (!automatic && !quitting) dialog.showErrorBox('Aggancio non disponibile', 'Il lettore locale della posizione finestra non è disponibile su questo PC. Puoi usare l’aggancio ' + can.barName + '.'); });
  }
  async function windowSources() {
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    const ownHandles = new Set([mascot?.getMediaSourceId(), chat?.getMediaSourceId()].filter(Boolean).map(id => id.split(':')[1]));
    return sources.filter(source => source.name?.trim() && /^window:/.test(source.id) && !ownHandles.has(source.id.split(':')[1]))
      .map(source => ({ id: source.id, name: source.name.slice(0, 160) }));
  }
  function stopWatching() {
    watchSource = null;
    if (chat && !chat.isDestroyed()) chat.webContents.send('mascotte-watch-stop');
    broadcast();
  }
  function clearTemporaryShares() {
    for (const entry of fs.readdirSync(dataDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^mascotte-share-[a-z0-9-]+$/i.test(entry.name)) continue;
      const target = path.join(dataDirectory, entry.name);
      if (fs.lstatSync(target).isDirectory() && !fs.lstatSync(target).isSymbolicLink()) fs.rmSync(target, { recursive: true, force: true });
    }
  }
  function clearReleaseDownloads() {
    for (const entry of fs.readdirSync(dataDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^release-update-[a-z0-9]+$/i.test(entry.name)) continue;
      const target = path.join(dataDirectory, entry.name);
      try { if (!fs.lstatSync(target).isSymbolicLink()) fs.rmSync(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 }); } catch {}
    }
  }
  function safeWindow(name, options) {
    const window = new BrowserWindow({ ...options, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.loadFile(views(name));
    return window;
  }
  function updateHit() {
    if (!mascot || mascot.isDestroyed() || !mascot.isVisible() || drag) return;
    const opaque = maskHit(hitMask, pack.frame, mascot.getContentBounds(), screen.getCursorScreenPoint());
    if (mouseIgnored !== !opaque) { mouseIgnored = !opaque; mascot.setIgnoreMouseEvents(mouseIgnored, { forward: true }); }
  }
  function showChat() {
    if (!chat || chat.isDestroyed()) {
      chat = safeWindow('chat', { width: 440, height: 680, minWidth: 400, minHeight: 600, show: false, title: 'Mascotte · micro chat', alwaysOnTop: true, autoHideMenuBar: true, backgroundColor: '#191b22' });
      // Mac: app senza Dock, la chat deve comparire sulla scrivania/tutto schermo corrente e non riportare altrove.
      if (can.allSpaces) chat.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      chat.once('ready-to-show', () => { if (can.hideDock) app.focus({ steal: true }); chat.show(); chat.focus(); });
      chat.on('close', event => { if (!quitting) { event.preventDefault(); currentRun?.stop(); chat.hide(); } });
      chat.webContents.on('render-process-gone', stopWatching);
    }
    const b = mascot.getBounds(), d = screen.getDisplayMatching(b).workArea;
    const pos = clampPosition({ x: b.x - 410, y: b.y }, chat.getBounds().width, chat.getBounds().height, [d]);
    chat.setPosition(pos.x, pos.y);
    if (can.hideDock) app.focus({ steal: true }); // Mac: app accessoria (LSUIElement), senza questo la tastiera può restare all'app precedente
    chat.show(); chat.focus(); broadcast();
  }
  function setScale(scale) {
    settings.scale = scale;
    settings.scales[pack.id]=scale;
    const size = mascotSize(pack, scale);
    mascot.setBounds({ ...mascot.getBounds(), ...size });
    const pos = clampPosition(mascot.getBounds(),pack.frame.width * displayScale(),pack.frame.height * displayScale(),displayAreas());
    moveMascot(pos.x, pos.y); settings.position = pos; saveSettings();
    mascot.webContents.send('mascotte-state', { scale }); updateHit();
    placeAttachment();
  }
  function menu() {
    return Menu.buildFromTemplate([
      { label: 'Apri micro chat', click: showChat },
      {label:'Personaggio',submenu:[...new Set(characters.map(c=>c.category))].map(category=>({label:category,submenu:characters.filter(c=>c.category===category).map(c=>({label:c.name,type:'radio',checked:c.id===pack.id,click:()=>selectCharacter(c.id)}))}))},
      { label: 'Grandezza', submenu: [1,2,3,4,5,6].filter(scale=>Math.max(pack.frame.width,pack.frame.height)*scale/(pack.pixelRatio||1)<=2048).map(scale => ({ label: `${scale}×`, type: 'radio', checked: scale === settings.scale, click: () => setScale(scale) })) },
      { label: 'Aggancio', submenu: [
        { label: 'Libera / sgancia', type: 'radio', checked: attachment === 'free', click: () => { detach(); saveSettings(); } },
        { label: can.barLabel, type: 'radio', checked: attachment === 'bar', click: () => attachBar() },
        { label: 'Aggancia alla finestra attiva', type: 'radio', checked: attachment === 'window', enabled: can.windowAttach, click: attachWindow }
      ] },
      { label: 'Osservazione', submenu: [
        { label: watchSource ? `Interrompi osservazione · ${watchSource.name}` : 'Interrompi osservazione', enabled: Boolean(watchSource), click: stopWatching },
        { label: 'Scegli finestra nella micro chat', click: showChat }
      ] },
      ...(pack.perch?.singing ? [{label:'Canta sul bordo (manuale)',type:'checkbox',checked:singing,enabled:attachment!=='free',click:()=>{singing=!singing;updatePose();}}] : []),
      { label: 'Prova uno stato', submenu: Object.keys(P.STATES.states).map(state => ({ label: state+(attachment!=='free'&&pack.perch?' · posa seduta':''), click: () => { if (!currentRun) controller.set(state); } })) },
      { label: userVisible ? 'Nascondi' : 'Mostra', click: () => { userVisible = !userVisible; if (!userVisible) mascot.hide(); else { if (!concealed) mascot.showInactive(); placeAttachment(); } follower?.pause(!userVisible); mascot.webContents.send('mascotte-state', { paused: !userVisible }); } },
      { type: 'separator' }, { label: 'Esci', click: () => app.quit() }
    ]);
  }
  app.on('second-instance', () => { mascot?.showInactive(); if (chat) showChat(); });
  app.on('window-all-closed', () => {});
  // Mac/Linux: un SIGTERM/SIGHUP/SIGINT all'app passi da before-quit, così il gruppo di processi della CLI viene chiuso.
  if (process.platform !== 'win32') for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(signal, () => app.quit());
  app.on('before-quit', () => {
    updateAbort?.abort();
    quitting = true; localDownload?.abort(); currentRun?.stop('Risposta interrotta.', true); controller?.close(); clearInterval(mouseTimer);
    stopWatching();
    if (activeShareDirectory && fs.existsSync(activeShareDirectory)) { try { fs.rmSync(activeShareDirectory, { recursive: true, force: true }); } catch {} }
    activeShareDirectory = null;
    clearTimeout(captureTimer); captureFollower?.close(); captureFollower = null; detach();
    server?.close().catch(() => {});
    if (managedOllama?.pid && managedOllama.exitCode === null) {
      require('node:child_process').execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(managedOllama.pid), '/T', '/F'], { windowsHide: true }, () => {});
    }
  });
  app.whenReady().then(async () => {
    if (can.appMenu) Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
    prepareDirectory(dataDirectory); clearTemporaryShares();
    // The updater may still be exiting from its temporary runtime after the restart.
    setTimeout(clearReleaseDownloads, 15000).unref();
    const chatDirectory = path.join(dataDirectory, 'chat'); prepareDirectory(chatDirectory);
    store = new ChatStore(chatDirectory);
    memory = new LocalAI.LocalMemory(chatDirectory);
    const raw = readJSON(stateFile, {});
    settings = {scale:[1,2,3,4,5,6].includes(raw.scale)?raw.scale:6,scales:raw.scales&&typeof raw.scales==='object'?raw.scales:{},position:raw.position,attachment:raw.attachment==='bar'?'bar':'free',updateRepoPath:typeof raw.updateRepoPath==='string'?raw.updateRepoPath:'',localModel:LocalAI.normalizeModel(raw.localModel)};
    prepareLocal().then(() => { localAvailable = true; if (!currentRun && !engineTouched) engine = 'locale'; broadcast(); }).catch(() => { localAvailable = false; broadcast(); });
    const resultFile = path.join(dataDirectory, 'update-result.json'), updateResult = readJSON(resultFile, null);
    if (updateResult && typeof updateResult.message === 'string') {
      updateStatus = updateResult.message.slice(0, 2000); updateFailed = !updateResult.ok;
      fs.unlinkSync(resultFile);
    }
    characters=readCharacters();selectCharacter(characters.some(c=>c.id===raw.character)?raw.character:'rosso',true);
    require('./lib/capture.cjs').configureDisplayCapture(session.defaultSession, {
      getChat: () => chat, getSource: () => watchSource, listSources: windowSources
    });
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('file:') && !details.url.startsWith('data:') }));
    const width = Math.round(pack.frame.width * displayScale()),height = Math.round(pack.frame.height * displayScale());
    const pos = clampPosition(settings.position, width, height, displayAreas());
    mascot = safeWindow('mascot', { ...pos, width, height, frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: true, skipTaskbar: true, resizable: false, maximizable: false, fullscreenable: false, thickFrame: false, focusable: false, show: false, hasShadow: false });
    // Mac: prima tutte le scrivanie e il tutto schermo, poi il livello (l'ordine inverso può perdere il livello).
    if (can.allSpaces) { if (can.hideDock) app.dock?.hide(); mascot.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true }); mascot.setAlwaysOnTop(true, 'screen-saver'); }
    mascot.setIgnoreMouseEvents(true, { forward: true });
    mascot.once('ready-to-show', () => mascot.showInactive());
    controller.set('idle');
    if (settings.attachment === 'bar') attachBar();
    mouseTimer = setInterval(updateHit, 100);
    const rosso=characters.find(c=>c.id==='rosso');
    const icon = nativeImage.createFromDataURL(rosso.imageData).crop({x:0,y:0,width:rosso.pack.frame.width,height:rosso.pack.frame.height}).resize({width:24,height:24});
    tray = new Tray(icon); tray.setToolTip('Mascotte'); tray.on('click', showChat); tray.on('right-click', () => { prepareWindowCapture(); tray.popUpContextMenu(menu()); });
    if (process.platform === 'darwin') screen.on('display-added', () => setScale(settings.scale));
    screen.on('display-removed', () => setScale(settings.scale));
    screen.on('display-metrics-changed', () => setScale(settings.scale));
    server = new EventServer(endpoint, Object.keys(P.STATES.states), event => { if (!currentRun) controller.set(event.state); });
    try { await server.start(process.env.MASCOTTE_PREVIEW ? 0 : 8766); }
    catch { notice = 'Server eventi non disponibile: controlla se la porta 8766 è occupata.'; }
    console.log('Mascotte pronta. Nessuna richiesta IA automatica.');
  }).catch(error => { dialog.showErrorBox('Mascotte non riesce ad avviarsi', error.message); app.quit(); });

  ipcMain.handle('mascotte', async (event, action, data) => {
    const kitty = event.sender === mascot?.webContents;
    const chatting = event.sender === chat?.webContents;
    const expected = pathToFileURL(views(kitty ? 'mascot' : 'chat')).href;
    if ((!kitty && !chatting) || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== expected) throw new Error('Interfaccia non autorizzata.');
    if (kitty) {
      if (action === 'init') return { pack, imageData, scale: settings.scale, animation: stateAnimation() };
      if (action === 'mask' && (Array.isArray(data)||data instanceof Uint8Array) && data.length === pack.frame.width * pack.frame.height && data.every(x => x === 0 || x === 1)) { hitMask = data; updateHit(); return; }
      if (action === 'chat') { if (!currentRun) controller.set('listening'); showChat(); return; }
      if (action === 'menu') { prepareWindowCapture(); menu().popup({ window: mascot }); return; }
      if (action === 'drag-start') { detach(); drag = { position: mascot.getBounds(), cursor: screen.getCursorScreenPoint(), resume: controller.state }; controller.set('drag', true); mouseIgnored = false; mascot.setIgnoreMouseEvents(false); return; }
      if (action === 'drag-move' && drag && Number.isFinite(data?.x) && Number.isFinite(data?.y) && Math.abs(data.x) < 50000 && Math.abs(data.y) < 50000) { const pos = dragPosition(drag, screen.getCursorScreenPoint()); moveMascot(pos.x, pos.y); return; }
      if (action === 'drag-end' && drag) {
        const resume = drag.resume, dropPoint = screen.getCursorScreenPoint(), barDisplay = taskbarDisplayAt(dropPoint);
        drag = null; settings.position = clampPosition(mascot.getBounds(), mascot.getBounds().width, mascot.getBounds().height, displayAreas());
        moveMascot(settings.position.x, settings.position.y); saveSettings(); controller.set(currentRun ? 'thinking' : resume === 'sleep' ? 'idle' : resume, Boolean(currentRun)); updateHit();
        if (barDisplay) attachBar(barDisplay); else attachWindow({ automatic: true, dropPoint });
        return;
      }
    }
    if (chatting) {
      if (action === 'snapshot') return chatSnapshot();
      if (action === 'local-model' && !localDownload && !currentRun && !updateRunning && LocalAI.isModel(data)) { settings.localModel = data; saveSettings(); localAvailable = false; localDownloadStatus = ''; notice = ''; }
      if (action === 'local-download-cancel') { localDownload?.abort(); return chatSnapshot(); }
      if (action === 'local-download') {
        if (localDownload || currentRun || updateRunning || setupPreview) return chatSnapshot();
        localDownload = new AbortController(); localAvailable = false;
        localDownloadStatus = 'Preparazione download...'; broadcast();
        try {
          // Starts our runtime if present; a missing model is expected before pulling.
          try { await prepareLocal(); } catch (error) { if (error.code === 'ECONNREFUSED') throw error; }
          await LocalAI.pullModel(settings.localModel, { signal: localDownload.signal, onProgress: message => { localDownloadStatus = message; broadcast(); } });
          localAvailable = true; localDownloadStatus = 'Modello aggiornato e compatibile, pronto per la chat.';
        } catch (error) { localDownloadStatus = error.name === 'AbortError' ? 'Download annullato. Puoi riprenderlo con lo stesso pulsante.' : error.message; }
        finally { localDownload = null; broadcast(); }
        return chatSnapshot();
      }
      if ((action === 'local-check' || action === 'local-model') && !localDownload) { localDownloadStatus = ''; try { await prepareLocal(); localAvailable = true; notice = 'Modello locale pronto.'; } catch (error) { localAvailable = false; notice = error.message; } return chatSnapshot(); }
      if (action === 'memory-add' && !currentRun && !updateRunning) { try { memory.add(data?.text, data?.source); notice = `Nota salvata sul ${can.deviceName}.`; } catch (error) { notice = error.message; } return chatSnapshot(); }
      if (action === 'memory-remove' && !currentRun && !updateRunning && typeof data === 'string') { try { memory.remove(data); notice = 'Nota rimossa.'; } catch (error) { notice = error.message; } return chatSnapshot(); }
      if (action === 'pc-action-cancel') { pendingAction = null; notice = 'Azione annullata.'; return chatSnapshot(); }
      if (action === 'pc-action-confirm' && pendingAction && data === pendingAction.id) {
        const selectedAction = pendingAction; pendingAction = null;
        try {
          if (selectedAction.kind === 'remember') { memory.add(selectedAction.text, 'manuale'); notice = `Nota salvata sul ${can.deviceName}.`; }
          else {
            if (!LocalCommands.validateTarget(selectedAction.target)) throw new Error('l’app o la cartella non è più disponibile o non è in una posizione ammessa.');
            const error = await shell.openPath(selectedAction.target);
            if (error) throw new Error(error);
            notice = 'Azione completata.';
          }
        } catch (error) { notice = `Azione non riuscita: ${error.message}`; }
        return chatSnapshot();
      }
      if (action === 'cli-guide') {
        const guides = { codex: 'https://developers.openai.com/codex/cli/', claude: 'https://code.claude.com/docs/en/setup', ollama: can.ollamaGuide,
          git: can.gitGuide, node: 'https://nodejs.org/en/download' };
        if (Object.hasOwn(guides, data)) await shell.openExternal(guides[data]);
        return chatSnapshot();
      }
      if (action === 'release-update') {
        if (!can.management || !app.isPackaged || updateRunning || currentRun || localDownload || setupPreview) return chatSnapshot();
        updateRunning = true; updateFailed = false; updateStatus = 'Controllo le versioni disponibili…'; updateAbort = new AbortController(); broadcast();
        try {
          const release = await Releases.latestRelease(updateAbort.signal);
          if (Releases.compareVersions(release.version, app.getVersion()) <= 0) {
            updateStatus = `Mascotte è aggiornata (versione ${app.getVersion()}).`;
            updateRunning = false; updateAbort = null; broadcast(); return chatSnapshot();
          }
          const repo = Releases.repositoryContaining(process.execPath);
          const installDir = Updater.installationDirectory(process.execPath, repo || dataDirectory, dataDirectory);
          const confirmation = await dialog.showMessageBox(chat, { type: 'question', title: 'Aggiorna Mascotte',
            message: `Installare Mascotte ${release.version}?`,
            detail: `Il pacchetto Windows verrà scaricato dalla release ufficiale e verificato prima dell’installazione.\nDestinazione: ${installDir}\n\nMascotte si chiude e si riavvia; la versione precedente viene conservata come backup.${path.dirname(process.execPath).toLowerCase() !== installDir.toLowerCase() ? '\n\nDopo il riavvio aggiorna gli hook per collegarli al nuovo percorso.' : ''}`,
            buttons: ['Annulla', 'Aggiorna e riavvia'], defaultId: 1, cancelId: 0 });
          if (confirmation.response !== 1) { updateRunning = false; updateAbort = null; updateStatus = 'Aggiornamento annullato.'; broadcast(); return chatSnapshot(); }
          void installPublishedRelease(release).catch(error => {
            updateRunning = false; updateFailed = true; updateStatus = `Aggiornamento non riuscito: ${error.message}`; broadcast();
          }).finally(() => { updateAbort = null; });
        } catch (error) { updateRunning = false; updateAbort = null; updateFailed = true; updateStatus = error.message; broadcast(); }
        return chatSnapshot();
      }
      if (action === 'repo-select' && !updateRunning) {
        if (!can.management || !app.isPackaged) return chatSnapshot();
        try {
          const selected = await dialog.showOpenDialog(chat, { title: 'Scegli la repo Mascotte clonata da GitHub', properties: ['openDirectory'], defaultPath: settings.updateRepoPath || undefined });
          if (!selected.canceled && selected.filePaths[0]) {
            const repo = Updater.validateRepository(selected.filePaths[0]);
            settings.updateRepoPath = repo.root; saveSettings(); updateFailed = false;
            updateStatus = repo.dirty ? 'Repo selezionata. Salva o committa le modifiche locali prima di aggiornare.' : 'Repo selezionata. Puoi aggiornare Mascotte.';
          }
        } catch (error) { updateFailed = true; updateStatus = error.message; }
        return chatSnapshot();
      }
      if (action === 'update-run') {
        if (!can.management || !app.isPackaged || updateRunning || currentRun || localDownload || setupPreview) return chatSnapshot();
        // Reserve the operation before opening the native dialog to prevent duplicate updates.
        updateRunning = true; updateFailed = false; broadcast();
        try {
          const repo = Updater.validateRepository(settings.updateRepoPath, { requireClean: true });
          const installDir = Updater.installationDirectory(process.execPath, repo.root, dataDirectory);
          const confirmation = await dialog.showMessageBox(chat, { type: 'question', title: 'Aggiorna Mascotte', message: 'Scaricare, compilare e installare l’aggiornamento?', detail: `Repo: ${repo.root}\nDestinazione: ${installDir}\n\nServono Git e Node.js 22+ con npm. La repo viene aggiornata con git pull --ff-only. A fine build Mascotte si chiude e si riavvia; la versione precedente viene conservata come backup.${path.dirname(process.execPath).toLowerCase() !== installDir.toLowerCase() ? '\n\nL’app verrà installata in una cartella stabile: dopo il riavvio premi Crea / aggiorna hook per collegarli al nuovo percorso.' : ''}`, buttons: ['Annulla', 'Aggiorna e riavvia'], defaultId: 1, cancelId: 0 });
          if (confirmation.response !== 1) { updateRunning = false; broadcast(); return chatSnapshot(); }
          updateAbort = new AbortController();
          void installRepositoryUpdate(repo).catch(error => {
            updateRunning = false; updateFailed = true; updateStatus = `Aggiornamento non riuscito: ${error.message}`; broadcast();
          }).finally(() => { updateAbort = null; });
        } catch (error) { updateRunning = false; updateFailed = true; updateStatus = error.message; broadcast(); }
        return chatSnapshot();
      }
      if (action === 'watch-sources' && can.watch) return windowSources();
      if (action === 'watch-enable' && can.watch && typeof data?.id === 'string') {
        const sources = await windowSources(), source = sources.find(item => item.id === data.id);
        if (!source) { notice = 'La finestra non è più disponibile. Aggiorna l’elenco e riprova.'; return chatSnapshot(); }
        watchSource = source; notice = ''; broadcast(); return { id: source.id, name: source.name };
      }
      if (action === 'watch-disable') { stopWatching(); return chatSnapshot(); }
      if (action === 'engine' && !currentRun && [...CLI.ENGINES, 'locale'].includes(data)) { engine = data; engineTouched = true; notice = ''; return chatSnapshot(); }
      if (action === 'new' && !currentRun) { store.set(engine, []); notice = ''; return chatSnapshot(); }
      if (action === 'stop') { currentRun?.stop(); return; }
      if (action === 'setup-preview') {
        if (updateRunning || currentRun) return chatSnapshot();
        if (!can.hooks || !app.isPackaged) { notice = 'Configurazione hook disponibile nel pacchetto Windows.'; return chatSnapshot(); }
        try {
          const paths = Setup.configPaths(), before = Setup.snapshot(paths);
          const after = Setup.prepareHooks(before.claude.text, before.codex.text, process.execPath);
          setupPreview = { paths, before, after }; notice = '';
        } catch (e) { notice = e.message; }
        return chatSnapshot();
      }
      if (action === 'setup-apply' && setupPreview) {
        try { Setup.applyHooks(setupPreview.paths, setupPreview.before, setupPreview.after, path.join(dataDirectory, 'hook-installation.json')); notice = 'Hook installati con backup. In Codex controlla e approva gli hook (in CLI: /hooks), poi apri una nuova sessione Codex. Mantieni il pacchetto in questa cartella.'; setupPreview = null; }
        catch (e) { notice = e.message; }
        return chatSnapshot();
      }
      if (action === 'setup-dismiss') { setupPreview = null; return chatSnapshot(); }
      if (action === 'send') {
        const text = typeof data === 'string' ? data : data?.text;
        const imageData = typeof data === 'object' && data ? data.imageData ?? null : null;
        if (localDownload || currentRun || updateRunning || typeof text !== 'string' || !text.trim() || text.length > 8000 || Buffer.byteLength(text) > 32768) return;
        if (pendingAction) { notice = 'Conferma o annulla prima l’azione proposta.'; broadcast(); return; }
        if (engine === 'locale' && !imageData) {
          // Comandi gestiti da Mascotte, non dal modello: azioni predefinite e note, sempre con conferma.
          const command = LocalCommands.parseLocalCommand(text, { actions: can.localActions });
          const reply = answer => { store.set('locale', [...store.get('locale'), { role: 'user', text: text.trim() }, { role: 'assistant', text: answer }]); notice = ''; };
          if (command?.type === 'list-notes') { reply(LocalCommands.describeNotes(memory.list())); broadcast(); return chatSnapshot(); }
          if (command?.type === 'reply') { reply(command.text); broadcast(); return chatSnapshot(); }
          if (command?.type === 'open') { reply('Posso farlo: controlla e conferma l’azione.'); pendingAction = { id: randomUUID(), kind: 'open', description: command.description, target: command.target }; broadcast(); return chatSnapshot(); }
          if (command?.type === 'remember') { reply('Posso salvarla tra le note: controlla e conferma.'); pendingAction = { id: randomUUID(), kind: 'remember', description: `Salvare questa nota sul ${can.deviceName}: «${command.text}»`, text: command.text }; broadcast(); return chatSnapshot(); }
        }
        let image = null, imagePath = null, imageDirectory = null;
        if (imageData !== null) {
          if (engine === 'locale' && !LocalAI.supportsVision(settings.localModel)) { notice = 'Il modello locale scelto è solo testuale.'; broadcast(); return; }
          if (!watchSource || typeof imageData !== 'string' || imageData.length > 12000000) { notice = 'La vista non è più disponibile: attiva l’osservazione e riprova.'; broadcast(); return; }
          const encoded = imageData.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/)?.[1];
          if (!encoded) { notice = 'Il fotogramma non è valido.'; broadcast(); return; }
          const bytes = Buffer.from(encoded, 'base64');
          if (bytes.length > 8000000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) { notice = 'Il fotogramma supera il limite o non è valido.'; broadcast(); return; }
          image = { bytes, name: watchSource.name };
        }
        const command = engine === 'locale' ? null : CLI.findCLI(engine);
        if (engine !== 'locale' && !command) { notice = 'CLI non trovata. Installa e accedi a ' + engine + ' sul tuo ' + can.deviceName + '.'; broadcast(); return; }
        const selected = engine, prompt = text.trim(), history = store.get(selected);
        const imageNote = image ? `\n\n[Fotogramma condiviso: ${image.name}]` : '';
        if (image && selected === 'codex') {
          try {
            imageDirectory = fs.mkdtempSync(path.join(dataDirectory, 'mascotte-share-'));
            imagePath = path.join(imageDirectory, 'finestra.jpg');
            fs.writeFileSync(imagePath, image.bytes, { flag: 'wx', mode: 0o600 });
            activeShareDirectory = imageDirectory;
          } catch {
            if (imageDirectory && fs.existsSync(imageDirectory)) fs.rmSync(imageDirectory, { recursive: true, force: true });
            notice = 'Non riesco a preparare il fotogramma in modo temporaneo.'; broadcast(); return;
          }
        }
        const completePrompt = CLI.promptWithHistory(data?.noHistory === true ? [] : history, prompt + imageNote);
        store.set(selected, [...history, { role: 'user', text: prompt + imageNote }]); notice = '';
        const args = selected === 'locale' ? null : CLI.argumentsFor(selected, imagePath, Boolean(image && selected === 'claude'));
        const input = image && selected === 'claude' ? CLI.promptWithImage(completePrompt, image.bytes.toString('base64')) : completePrompt;
        const run = selected === 'locale' ? LocalAI.runLocal(history, prompt, memory.relevant(prompt), { model: settings.localModel, imageBase64: image?.bytes.toString('base64') || null }) : CLI.runCLI(command, args, input, imageDirectory || path.join(dataDirectory, 'chat'));
        currentRun = run; controller.set('thinking', true); broadcast();
        try {
          const output = await run.promise;
          const text = selected === 'locale' ? output : CLI.decodeOutput(selected, output.stdout, output.code, output.stderr);
          store.set(selected, [...store.get(selected), { role: 'assistant', text }]); controller.set('talk');
        } catch (e) {
          notice = (e.name === 'AbortError' ? 'Risposta interrotta.' : e.message).slice(0, 1500); controller.set('error');
        } finally {
          currentRun = null;
          if (imageDirectory && fs.existsSync(imageDirectory)) { try { fs.rmSync(imageDirectory, { recursive: true, force: true }); } catch {} }
          if (activeShareDirectory === imageDirectory) activeShareDirectory = null;
          broadcast();
        }
        return;
      }
    }
    throw new Error('Azione non valida.');
  });
}
