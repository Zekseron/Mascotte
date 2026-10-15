'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, session, dialog } = require('electron');
const dataDirectory = process.env.MASCOTTE_WINDOWS_DATA_DIR || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA, 'Mascotte') : path.join(app.getPath('userData'), 'Windows-preview'));
const endpoint = path.join(dataDirectory, 'events.json');
if (process.argv.includes('--mascotte-notify')) {
  require('./lib/notify.cjs').notifyMain(process.argv.slice(process.argv.indexOf('--mascotte-notify') + 1), endpoint).finally(() => app.exit(0));
} else {
  app.setPath('userData', path.join(dataDirectory, 'electron'));
  if (!app.requestSingleInstanceLock()) app.quit();
  else startApplication();
}

function startApplication() {
  const { prepareDirectory, readJSON, atomicJSON, ChatStore, assertRegularPath } = require('./lib/storage.cjs');
  const CLI = require('./lib/cli.cjs');
  const { StateController, clampPosition } = require('./lib/state.cjs');
  const { EventServer } = require('./lib/events.cjs');
  const Setup = require('./lib/setup.cjs');
  const Attachment = require('./lib/attachment.cjs');
  const { mascotSize, maskHit, dragPosition } = require('./lib/geometry.cjs');
  const P = require('./resources/pack.js');
  let mascot, chat, tray, controller, server, store, pack, imageData, currentRun, hitMask, mouseTimer;
  let settings, engine = 'codex', notice = '', setupPreview, drag, quitting = false, mouseIgnored = true;
  let characters = [];
  let attachment = 'free', singing = false, follower, anchorTimer, anchorDisplay, anchorFraction = .8, targetBounds, concealed = false, userVisible = true;
  const stateFile = path.join(dataDirectory, 'settings.json');
  const views = name => path.join(__dirname, 'renderer', name + '.html');
  const broadcast = () => { if (chat && !chat.isDestroyed()) chat.webContents.send('mascotte-chat', chatSnapshot()); };
  const chatSnapshot = () => ({ engine, messages: store.get(engine), busy: Boolean(currentRun), notice, available: CLI.ENGINES.filter(e => CLI.findCLI(e)), setup: setupPreview ? { claude: setupPreview.after.claude, codex: setupPreview.after.codex } : null });
  const saveSettings = () => atomicJSON(stateFile, settings);
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
      setScale(settings.scale);controller.set(currentRun?'thinking':'idle',Boolean(currentRun));saveSettings();tray?.setContextMenu(menu());
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
    const edge = attachment === 'bar' ? { ...display.workArea, y: display.workArea.y + display.workArea.height } : targetBounds;
    const anchor=pack.perch?{x:pack.perch.anchor.x*displayScale(),y:pack.perch.anchor.y*displayScale()}:undefined;
    const position = Attachment.origin(b, edge, display.workArea, anchorFraction,anchor);
    if (b.x !== position.x || b.y !== position.y) moveMascot(position.x, position.y);
    if (concealed) { mascot.showInactive(); concealed = false; }
    updateHit();
  }
  function attachBar() {
    detach(); const b = mascot.getBounds(), d = screen.getDisplayMatching(b);
    attachment = settings.attachment = 'bar'; anchorDisplay = d.id;
    anchorFraction = Math.max(0, Math.min(1, (b.x+b.width/2-d.workArea.x)/d.workArea.width));
    updatePose();placeAttachment(); anchorTimer = setInterval(placeAttachment, 1000); saveSettings();
  }
  function attachWindow() {
    if (process.platform !== 'win32') return;
    detach(); attachment = 'window'; updatePose(); saveSettings(); let first = true;
    follower = new Attachment.WindowFollower(state => {
      if (state.status === 'closed') { detach(); return; }
      if (state.status === 'unavailable') { detach(); dialog.showErrorBox('Nessuna finestra agganciabile', 'Porta in primo piano la finestra desiderata e riprova dal clic destro sulla mascotte.'); return; }
      if (state.status === 'hidden') { targetBounds = null; if (userVisible) { mascot.hide(); concealed = true; } return; }
      const top = screen.screenToDipPoint({ x: state.x, y: state.y });
      const bottom = screen.screenToDipPoint({ x: state.x + state.width, y: state.y + state.height });
      targetBounds = { x: top.x, y: top.y, width: bottom.x-top.x, height: bottom.y-top.y };
      if (first) { const b = mascot.getBounds(); anchorFraction = Math.max(0, Math.min(1, (b.x+b.width/2-top.x)/targetBounds.width)); first = false; }
      placeAttachment();
    }, () => { detach(); if (!quitting) dialog.showErrorBox('Aggancio non disponibile', 'Il lettore locale della posizione finestra non è disponibile su questo PC. Puoi usare l’aggancio alla barra.'); });
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
      chat = safeWindow('chat', { width: 400, height: 520, minWidth: 360, minHeight: 420, show: false, title: 'Mascotte · micro chat', alwaysOnTop: true, autoHideMenuBar: true, backgroundColor: '#191b22' });
      chat.once('ready-to-show', () => { chat.show(); chat.focus(); });
      chat.on('close', event => { if (!quitting) { event.preventDefault(); currentRun?.stop(); chat.hide(); } });
    }
    const b = mascot.getBounds(), d = screen.getDisplayMatching(b).workArea;
    const pos = clampPosition({ x: b.x - 410, y: b.y }, chat.getBounds().width, chat.getBounds().height, [d]);
    chat.setPosition(pos.x, pos.y); chat.show(); chat.focus(); broadcast();
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
        { label: 'Aggancia alla barra delle applicazioni', type: 'radio', checked: attachment === 'bar', click: attachBar },
        { label: 'Aggancia alla finestra attiva', type: 'radio', checked: attachment === 'window', enabled: process.platform === 'win32', click: attachWindow }
      ] },
      ...(pack.perch?.singing ? [{label:'Canta sul bordo (manuale)',type:'checkbox',checked:singing,enabled:attachment!=='free',click:()=>{singing=!singing;updatePose();tray?.setContextMenu(menu());}}] : []),
      { label: 'Prova uno stato', submenu: Object.keys(P.STATES.states).map(state => ({ label: state+(attachment!=='free'&&pack.perch?' · posa seduta':''), click: () => { if (!currentRun) controller.set(state); } })) },
      { label: userVisible ? 'Nascondi' : 'Mostra', click: () => { userVisible = !userVisible; if (!userVisible) mascot.hide(); else { if (!concealed) mascot.showInactive(); placeAttachment(); } follower?.pause(!userVisible); mascot.webContents.send('mascotte-state', { paused: !userVisible }); } },
      { type: 'separator' }, { label: 'Esci', click: () => app.quit() }
    ]);
  }
  app.on('second-instance', () => { mascot?.showInactive(); if (chat) showChat(); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    quitting = true; currentRun?.stop(); controller?.close(); clearInterval(mouseTimer);
    detach();
    server?.close().catch(() => {});
  });
  app.whenReady().then(async () => {
    prepareDirectory(dataDirectory);
    const chatDirectory = path.join(dataDirectory, 'chat'); prepareDirectory(chatDirectory);
    store = new ChatStore(chatDirectory);
    const raw = readJSON(stateFile, {});
    settings = {scale:[1,2,3,4,5,6].includes(raw.scale)?raw.scale:6,scales:raw.scales&&typeof raw.scales==='object'?raw.scales:{},position:raw.position,attachment:raw.attachment==='bar'?'bar':'free'};
    characters=readCharacters();selectCharacter(characters.some(c=>c.id===raw.character)?raw.character:'rosso',true);
    session.defaultSession.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('file:') && !details.url.startsWith('data:') }));
    const width = Math.round(pack.frame.width * displayScale()),height = Math.round(pack.frame.height * displayScale());
    const pos = clampPosition(settings.position, width, height, displayAreas());
    mascot = safeWindow('mascot', { ...pos, width, height, frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: true, skipTaskbar: true, resizable: false, maximizable: false, fullscreenable: false, thickFrame: false, focusable: false, show: false, hasShadow: false });
    mascot.setIgnoreMouseEvents(true, { forward: true });
    mascot.once('ready-to-show', () => mascot.showInactive());
    controller.set('idle');
    if (settings.attachment === 'bar') attachBar();
    mouseTimer = setInterval(updateHit, 100);
    const rosso=characters.find(c=>c.id==='rosso');
    const icon = nativeImage.createFromDataURL(rosso.imageData).crop({x:0,y:0,width:rosso.pack.frame.width,height:rosso.pack.frame.height}).resize({width:24,height:24});
    tray = new Tray(icon); tray.setToolTip('Mascotte'); tray.setContextMenu(menu()); tray.on('click', showChat); tray.on('right-click', () => tray.setContextMenu(menu()));
    screen.on('display-removed', () => setScale(settings.scale));
    screen.on('display-metrics-changed', () => setScale(settings.scale));
    server = new EventServer(endpoint, Object.keys(P.STATES.states), event => { if (!currentRun) controller.set(event.state); });
    try { await server.start(process.env.MASCOTTE_PREVIEW ? 0 : 8766); }
    catch { notice = 'Server eventi non disponibile: controlla se la porta 8766 è occupata.'; }
    console.log('Mascotte Windows preview pronta. Nessuna richiesta IA automatica.');
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
      if (action === 'menu') { menu().popup({ window: mascot }); return; }
      if (action === 'drag-start') { detach(); drag = { position: mascot.getBounds(), cursor: screen.getCursorScreenPoint(), resume: controller.state }; controller.set('drag', true); mouseIgnored = false; mascot.setIgnoreMouseEvents(false); return; }
      if (action === 'drag-move' && drag && Number.isFinite(data?.x) && Number.isFinite(data?.y) && Math.abs(data.x) < 50000 && Math.abs(data.y) < 50000) { const pos = dragPosition(drag, screen.getCursorScreenPoint()); moveMascot(pos.x, pos.y); return; }
      if (action === 'drag-end' && drag) { const resume = drag.resume; drag = null; settings.position = clampPosition(mascot.getBounds(), mascot.getBounds().width, mascot.getBounds().height, displayAreas()); moveMascot(settings.position.x, settings.position.y); saveSettings(); controller.set(currentRun ? 'thinking' : resume === 'sleep' ? 'idle' : resume, Boolean(currentRun)); updateHit(); return; }
    }
    if (chatting) {
      if (action === 'snapshot') return chatSnapshot();
      if (action === 'engine' && !currentRun && CLI.ENGINES.includes(data)) { engine = data; notice = ''; return chatSnapshot(); }
      if (action === 'new' && !currentRun) { store.set(engine, []); notice = ''; return chatSnapshot(); }
      if (action === 'stop') { currentRun?.stop(); return; }
      if (action === 'setup-preview') {
        if (process.platform !== 'win32' || !app.isPackaged) { notice = 'Configurazione hook disponibile nel pacchetto Windows.'; return chatSnapshot(); }
        try {
          const paths = Setup.configPaths(), before = Setup.snapshot(paths);
          const after = Setup.prepareHooks(before.claude.text, before.codex.text, process.execPath);
          setupPreview = { paths, before, after }; notice = '';
        } catch (e) { notice = e.message; }
        return chatSnapshot();
      }
      if (action === 'setup-apply' && setupPreview) {
        try { Setup.applyHooks(setupPreview.paths, setupPreview.before, setupPreview.after, path.join(dataDirectory, 'hook-installation.json')); notice = 'Hook installati con backup. Mantieni il pacchetto qui e riapri le sessioni IA.'; setupPreview = null; }
        catch (e) { notice = e.message; }
        return chatSnapshot();
      }
      if (action === 'setup-dismiss') { setupPreview = null; return chatSnapshot(); }
      if (action === 'send') {
        if (currentRun || typeof data !== 'string' || !data.trim() || data.length > 8000 || Buffer.byteLength(data) > 32768) return;
        const command = CLI.findCLI(engine);
        if (!command) { notice = 'CLI non trovata. Installa e accedi a ' + engine + ' sul tuo PC.'; broadcast(); return; }
        const selected = engine, prompt = data.trim(), history = store.get(selected);
        store.set(selected, [...history, { role: 'user', text: prompt }]); notice = '';
        const run = CLI.runCLI(command, CLI.argumentsFor(selected), CLI.promptWithHistory(history, prompt), path.join(dataDirectory, 'chat'));
        currentRun = run; controller.set('thinking', true); broadcast();
        try {
          const output = await run.promise;
          const text = CLI.decodeOutput(selected, output.stdout, output.code, output.stderr);
          store.set(selected, [...store.get(selected), { role: 'assistant', text }]); controller.set('talk');
        } catch (e) {
          notice = e.message.slice(0, 1500); controller.set('error');
        } finally { currentRun = null; broadcast(); }
        return;
      }
    }
    throw new Error('Azione non valida.');
  });
}
