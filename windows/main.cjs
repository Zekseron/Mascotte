'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, session, dialog, desktopCapturer, shell, systemPreferences, Notification, powerMonitor } = require('electron');
const Platform = require('./lib/platform.cjs');
const Capture = require('./lib/capture.cjs');
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
  const LocalAI = require('./lib/local-ai.cjs'), LocalEngines = require('./lib/local-engines.cjs');
  const { StateController, clampPosition } = require('./lib/state.cjs');
  const { EventServer } = require('./lib/events.cjs');
  const Setup = require('./lib/setup.cjs');
  const Updater = require('./lib/updater.cjs');
  const Releases = require('./lib/releases.cjs');
  const Attachment = require('./lib/attachment.cjs'), { sendRefusal } = require('./lib/send-guard.cjs');
  const LocalCommands = require('./lib/local-commands.cjs'), FolderView = require('./lib/folder-view.cjs'), ExtraFolders = require('./lib/extra-folders.cjs');
  const { mascotSize, maskHit, dragPosition, barEdge, barHit } = require('./lib/geometry.cjs');
  const P = require('./resources/pack.js');
  const Characters = require('./lib/characters.cjs');
  let mascot, chat, tray, controller, server, store, memory, pack, imageData, currentRun, hitMask, mouseTimer;
  let settings, engine = 'codex', engineTouched = false, notice = '', setupPreview, drag, quitting = false, mouseIgnored = true, localAvailable = false, managedOllama = null, installedCache = null, localScanning = false, engineStatus = null;
  let characters = [], includedCharacters = [], characterWarnings = [], characterStatus = '', characterStatusFailed = false;
  let attachment = 'free', singing = false, follower, captureFollower, captureTimer, anchorTimer, anchorDisplay, anchorFraction = .8, targetBounds, concealed = false, userVisible = true;
  let watchSource = null, activeShareDirectory = null, pendingAction = null;
  // Secondo parere: l'ultimo fotogramma analizzato dal modello locale resta solo in memoria per 10 minuti
  // (o fino a «Nuova» nella chat locale o alla chiusura), per poterlo mandare a Codex o Claude dopo conferma.
  const FRAME_TTL = 10 * 60 * 1000;
  let lastFrame = null, lastFrameTimer = null;
  // Promemoria e sveglie impostati dalla chat locale: notifica di sistema alla scadenza, anche per quelli scaduti ad app chiusa.
  const Reminders = require('./lib/reminders.cjs'), AlarmSound = require('./lib/alarm-sound.cjs'), { createScheduler } = require('./lib/reminder-scheduler.cjs');
  let reminders = null, reminderScheduler = null, activeAlarm = null, alarmTimer = null;
  const ALARM_RING = 3 * 60 * 1000, SNOOZE = 5 * 60 * 1000;
  function stopAlarm() { clearTimeout(alarmTimer); alarmTimer = null; activeAlarm = null; }
  function fireReminder(item) {
    const late = Date.now() - item.when > 60000;
    const body = item.text + (late ? ` (era per ${Reminders.formatWhen(item.when)})` : '');
    // Una notifica che non si può mostrare non blocca il resto: un promemoria ricade sull'avviso in chat, una sveglia suona comunque.
    let shown = false;
    try { if (Notification.isSupported()) { new Notification({ title: item.alarm ? 'Mascotte · sveglia' : 'Mascotte · promemoria', body, silent: false }).show(); shown = true; } } catch {}
    if (!shown && !item.alarm) { notice = `⏰ ${body}`; showChat(); broadcast(); }
    // Sveglia (non troppo in ritardo): finestra con «Ferma» e «Rimanda», suono a ripetizione nella chat per al massimo 3 minuti, gattino in attesa.
    if (item.alarm && Date.now() - item.when < 10 * 60000) {
      stopAlarm(); activeAlarm = { id: item.id, text: item.text, when: item.when };
      alarmTimer = setTimeout(() => { if (activeAlarm) notice = `La sveglia «${activeAlarm.text}» si è spenta da sola dopo 3 minuti.`; stopAlarm(); broadcast(); }, ALARM_RING);
      if (!currentRun) controller.set('waiting'); showChat(); broadcast();
    }
  }
  // Il pianificatore parte solo a fine avvio: prima dello start, reschedule non fa nulla.
  function scheduleReminders() { reminderScheduler?.reschedule(); }
  // Un promemoria che non si è potuto mostrare è già stato tolto dall'elenco: resta almeno un avviso in chat col suo testo.
  function reminderFailed(item, error) {
    console.error('Promemoria non mostrato:', error?.message || error);
    notice = item ? `Non sono riuscito a mostrare ${item.alarm ? 'la sveglia' : 'il promemoria'} «${item.text}» (era per ${Reminders.formatWhen(item.when)}): ${error?.message || 'errore sconosciuto'}.` : `Non riesco a controllare i promemoria: ${error?.message || 'errore sconosciuto'}.`;
    try { showChat(); } catch {}
    try { broadcast(); } catch {}
  }
  function clearLastFrame() { clearTimeout(lastFrameTimer); lastFrameTimer = null; if (lastFrame) { lastFrame.bytes.fill(0); lastFrame = null; } }
  function keepLastFrame(bytes, name, message, reply) {
    clearLastFrame(); lastFrame = { bytes: Buffer.from(bytes), name, message, reply: String(reply).slice(0, 80), expiresAt: Date.now() + FRAME_TTL };
    lastFrameTimer = setTimeout(() => { clearLastFrame(); broadcast(); }, FRAME_TTL); lastFrameTimer.unref?.();
  }
  let localDownload = null, localDownloadStatus = '', folderStatus = '', folderStatusFailed = false;
  let updateRunning = false, updateStatus = '', updateFailed = false, updateAbort = null;
  const stateFile = path.join(dataDirectory, 'settings.json');
  const views = name => path.join(__dirname, 'renderer', name + '.html');
  const broadcast = () => { if (chat && !chat.isDestroyed()) chat.webContents.send('mascotte-chat', chatSnapshot()); };
  const chatSnapshot = () => ({ engine, messages: store.get(engine), busy: Boolean(currentRun || localDownload), localDownloading: Boolean(localDownload), localDownloadStatus, notice, available: [...CLI.ENGINES.filter(e => CLI.findCLI(e)), ...(localAvailable ? ['locale'] : [])], localModel: settings?.localModel || LocalAI.defaultModel(), localInstalledSource: !LocalAI.isModel(settings?.localModel), localVision: localVision(), localEngine: settings?.localEngine || 'ollama', localEngineLabel: LocalEngines.label(settings?.localEngine), localManaged: LocalEngines.get(LocalEngines.MANAGED).status(), localEngines: engineStatus ? engineStatus.map(({ id, label, state, count, message }) => ({ id, label, state, count, message: message || '' })) : null, localEngineModels: settings?.localEngine && settings.localEngine !== 'ollama' ? engineStatus?.find(item => item.id === settings.localEngine) || null : null, localCatalog: LocalAI.uiCatalog(), localInstalled: installedCache, localScanning, deviceName: can.deviceName, memories: memory.list(), pendingAction: pendingAction && { id: pendingAction.id, description: pendingAction.description }, setup: setupPreview ? { claude: setupPreview.after.claude, codex: setupPreview.after.codex } : null, alarmSettings: { sound: settings?.alarmSound || 'beep', name: settings?.alarmSoundName || '', volume: settings?.alarmVolume ?? 0.8 }, reminders: reminders ? reminders.list().map((item, index) => ({ id: item.id, index: index + 1, text: item.text, when: Reminders.formatWhen(item.when), alarm: item.alarm })) : [], alarm: activeAlarm && { text: activeAlarm.text, time: new Date(activeAlarm.when).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) }, secondOpinionFrame: lastFrame && { name: lastFrame.name, message: lastFrame.message, reply: lastFrame.reply, expiresAt: lastFrame.expiresAt }, watchAvailable: can.watch, hooksAvailable: can.hooks && app.isPackaged, watching: Boolean(watchSource), watchName: watchSource?.name || '', characters: pack ? { current: pack.id, scale: settings?.scale, scales: Characters.allowedScales(pack), list: characters.map(c => ({ id: c.id, name: c.name, category: c.category, personal: c.personal })), warnings: characterWarnings, max: Characters.MAX_PERSONAL, status: characterStatus, failed: characterStatusFailed } : null, management: { available: can.management && app.isPackaged, packageName: can.packageName, version: app.getVersion(), repoPath: settings?.updateRepoPath || '', hooks: hooksState(), running: updateRunning, status: updateStatus, failed: updateFailed, folders: { defaults: FolderView.viewableFolders().map(folder => ({ name: folder.display, path: folder.target })), extra: (settings?.extraFolders || []).map(folder => ({ name: folder.name, path: folder.path })), max: ExtraFolders.MAX_EXTRA, status: folderStatus, failed: folderStatusFailed } } });
  // Immagini: Ollama le legge dal modello; gli altri motori solo se il server le dichiara (altrimenti allegati disattivati).
  const localVision = () => settings?.localEngine && settings.localEngine !== 'ollama' ? LocalEngines.supportsVision(settings.localEngine, settings.localModel) : LocalAI.supportsVision(settings?.localModel);
  const saveSettings = () => atomicJSON(stateFile, settings);
  // Opzioni del modello scelto: un modello fuori catalogo vale solo se approvato come «già presente» (localModelSource).
  const modelOptions = () => ({ model: settings.localModel, installed: !LocalAI.isModel(settings.localModel) });
  // Il modello già presente scelto (o il motore) non è più disponibile: si torna a Ollama e al predefinito e si spiega perché.
  function fallbackToDefault(reason) {
    const other = settings.localEngine !== 'ollama';
    settings.localEngine = 'ollama'; settings.localModel = LocalAI.defaultModel(); settings.localModelSource = 'catalog'; saveSettings(); installedCache = null; localAvailable = false;
    return other ? `${reason} Sono tornato a Ollama e al modello predefinito (${settings.localModel}).` : `${reason} Sono tornato al modello predefinito (${settings.localModel}).`;
  }
  // Restituisce '' se il modello è valido, oppure il messaggio del ritorno al predefinito (se poi anche questo è valido).
  async function checkOllama() {
    try { await LocalAI.checkModel(modelOptions()); return ''; }
    catch (error) {
      if (error.code !== 'MODEL_INVALID') throw error;
      const message = fallbackToDefault(error.message);
      try { await LocalAI.checkModel(modelOptions()); } catch (next) { next.message = `${message} ${next.message}`; throw next; }
      return message;
    }
  }
  // Altri motori: server già avviato dall'utente. Se non risponde, non è quello atteso o il modello non c'è più, si torna a Ollama.
  async function checkSelected() {
    if (settings.localEngine === 'ollama') return checkOllama();
    const other = LocalEngines.get(settings.localEngine);
    try { await other.checkModel(settings.localModel); return ''; }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      const message = fallbackToDefault(error.message);
      try { return [message, await checkOllama()].filter(Boolean).join(' '); } catch (next) { next.message = `${message} ${next.message}`; throw next; }
    }
  }
  async function prepareLocal() {
    try { return await checkSelected(); }
    catch (error) {
      if (error.code !== 'ECONNREFUSED' || managedOllama || !can.managedOllama) throw error;
      managedOllama = LocalAI.startManaged(dataDirectory);
      if (!managedOllama) throw error;
      for (let i = 0; i < 30; i++) {
        if (quitting) throw new Error('Avvio locale interrotto.');
        await new Promise(resolve => setTimeout(resolve, 500));
        try { return await checkSelected(); }
        catch (next) { if (next.code !== 'ECONNREFUSED') throw next; }
      }
      throw new Error('Il servizio locale non si è avviato in tempo.');
    }
  }
  // Nota sul percorso: se l'app in esecuzione sta altrove rispetto alla destinazione, gli hook vanno ricollegati.
  const movedNote = (installDir, text) => Updater.currentLocation(process.execPath).toLowerCase() !== installDir.toLowerCase() ? text : '';
  // Mac: la vecchia app Swift in Applicazioni (altro identificativo) viene salvata in un ZIP prima di essere sostituita.
  const backupNote = installDir => process.platform === 'darwin' && fs.existsSync(installDir) && installDir !== Updater.currentLocation(process.execPath) ? `\n\nSe in ${installDir} c’è un’altra app Mascotte (per esempio la vecchia app Swift), ne viene fatto prima un backup ZIP in ${path.join(dataDirectory, 'backup')}.` : '';
  async function installRepositoryUpdate(repo) {
    const installDir = Updater.installationDirectory(process.execPath, repo.root, dataDirectory);
    const resultFile = path.join(dataDirectory, 'update-result.json');
    const logFile = path.join(dataDirectory, 'update.log');
    const result = await Updater.updateFromRepository(repo.root, message => { updateStatus = message; broadcast(); }, updateAbort.signal);
    updateStatus = 'Pacchetto pronto. Chiudo Mascotte per installare e riavviare…'; broadcast();
    // Run the helper from the NEW unpacked build, so no process locks the installed runtime.
    await Updater.launchInstaller({ ...result, installDir, resultFile, logFile, previousExe: process.execPath, parentPid: process.pid, dataDir: dataDirectory, helperScript: path.join(process.resourcesPath, 'mascotte-updater.cjs') });
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
        previousExe: process.execPath, parentPid: process.pid, dataDir: dataDirectory, helperScript: path.join(process.resourcesPath, 'mascotte-updater.cjs') });
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
      setScale(settings.scale);controller.set(currentRun?'thinking':'idle',Boolean(currentRun));saveSettings();broadcast();
    }
  }
  const personalDirectory = path.join(dataDirectory, 'characters');
  // Inclusi nell'app (una sola volta, un errore blocca l'avvio) + mascotte personali (riletti ogni volta; quelle non valide si saltano con un avviso).
  function readCharacters(reloadIncluded = false) {
    if (reloadIncluded || !includedCharacters.length) includedCharacters = Characters.readIncluded(P, path.join(__dirname, 'resources/characters'));
    const personal = Characters.readPersonal(P, personalDirectory, includedCharacters.map(c => c.id));
    characterWarnings = personal.warnings; for (const warning of personal.warnings) console.warn(warning);
    return [...includedCharacters, ...personal.characters];
  }
  // Stato dei collegamenti agli hook, ricavato dal file di registrazione: 'active', 'moved' (app spostata) oppure 'none'.
  function hooksState() {
    try {
      const record = path.join(dataDirectory, 'hook-installation.json');
      if (!fs.existsSync(record)) return 'none';
      return Setup.hooksPointElsewhere(record, process.execPath) ? 'moved' : 'active';
    } catch { return 'none'; }
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
  // Su Mac la cattura richiede il permesso «Registrazione schermo» (Privacy e sicurezza). Su Windows non serve.
  const screenPermission = () => process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted';
  const permissionMessage = status => status === 'restricted'
    ? 'La registrazione dello schermo è bloccata da un profilo o da Tempo di utilizzo su questo Mac.'
    : 'Mascotte non ha il permesso «Registrazione schermo». Attivalo in Impostazioni di Sistema > Privacy e sicurezza > Registrazione schermo, poi esci da Mascotte e riaprila.';
  async function watchSources() {
    let status = screenPermission();
    // Prima richiesta: getSources fa comparire la domanda di macOS. Il permesso vale di solito solo dopo il riavvio dell'app.
    if (status === 'not-determined') { try { await windowSources(); } catch {} status = screenPermission(); }
    if (status !== 'granted') return { permission: status, message: permissionMessage(status) };
    return windowSources();
  }
  async function windowSources() {
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    const ownHandles = new Set([mascot?.getMediaSourceId(), chat?.getMediaSourceId()].filter(Boolean).map(id => id.split(':')[1]));
    const list = sources.filter(source => source.name?.trim() && /^window:/.test(source.id) && !ownHandles.has(source.id.split(':')[1]))
      .map(source => ({ id: source.id, name: source.name.slice(0, 160) }));
    if (process.platform !== 'darwin') return list;
    // Mac: via le anteprime di Stage Manager e le finestre di servizio. Senza helper si mostra l'elenco completo.
    const windows = await Capture.listMacWindows(Platform.macHelperPath(), process.pid);
    return windows ? Capture.filterMacWindows(list, windows) : list;
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
    placeAttachment(); broadcast();
  }
  function menu() {
    return Menu.buildFromTemplate([
      { label: 'Apri micro chat', click: showChat },
      {label:'Personaggio',submenu:[...new Set(characters.map(c=>c.category))].map(category=>({label:category,submenu:characters.filter(c=>c.category===category).map(c=>({label:c.name,type:'radio',checked:c.id===pack.id,click:()=>selectCharacter(c.id)}))}))},
      { label: 'Grandezza', submenu: Characters.allowedScales(pack).map(scale => ({ label: `${scale}×`, type: 'radio', checked: scale === settings.scale, click: () => setScale(scale) })) },
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
    quitting = true; reminderScheduler?.stop(); stopAlarm(); localDownload?.abort(); LocalEngines.shutdown(); currentRun?.stop('Risposta interrotta.', true); controller?.close(); clearInterval(mouseTimer);
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
    LocalEngines.configureManaged({ dataDir: dataDirectory });
    // Mac: al primo avvio importa una sola volta impostazioni e cronologia della vecchia app Swift (in sola lettura).
    let legacyImport = null;
    try { legacyImport = require('./lib/legacy-mac.cjs').importLegacy(dataDirectory, { characters: JSON.parse(fs.readFileSync(path.join(__dirname, 'resources/characters/index.json'), 'utf8')).characters.map(c => c.id) }); } catch {}
    // The updater may still be exiting from its temporary runtime after the restart.
    setTimeout(clearReleaseDownloads, 15000).unref();
    const chatDirectory = path.join(dataDirectory, 'chat'); prepareDirectory(chatDirectory);
    store = new ChatStore(chatDirectory);
    memory = new LocalAI.LocalMemory(chatDirectory);
    reminders = new Reminders.ReminderStore(path.join(dataDirectory, 'reminders.json'));
    reminderScheduler = createScheduler({ store: reminders, fire: fireReminder, onError: reminderFailed });
    const raw = readJSON(stateFile, {});
    // Motore: un valore sconosciuto, o un modello di un altro motore senza nome valido, torna a Ollama e al predefinito.
    let startEngine = LocalEngines.normalizeEngine(raw.localEngine);
    if (startEngine !== 'ollama' && !(raw.localModelSource === 'installed' && LocalAI.validName(raw.localModel))) startEngine = 'ollama';
    const startModel = startEngine === 'ollama' ? LocalAI.normalizeModel(raw.localModel, undefined, raw.localModelSource) : raw.localModel;
    settings = {scale:[1,2,3,4,5,6].includes(raw.scale)?raw.scale:6,scales:raw.scales&&typeof raw.scales==='object'?raw.scales:{},position:raw.position,attachment:raw.attachment==='bar'?'bar':'free',updateRepoPath:typeof raw.updateRepoPath==='string'?raw.updateRepoPath:'',localEngine:startEngine,localModel:startModel,localModelSource:startEngine==='ollama'&&LocalAI.isModel(startModel)?'catalog':'installed',extraFolders:ExtraFolders.normalizeExtraFolders(raw.extraFolders,ExtraFolders.realOpts({platform:process.platform,home:os.homedir(),dataDir:dataDirectory})),alarmSound:raw.alarmSound==='custom'?'custom':'beep',alarmSoundName:typeof raw.alarmSoundName==='string'?raw.alarmSoundName.slice(0,120):'',alarmVolume:AlarmSound.normalizeVolume(raw.alarmVolume)};
    if (legacyImport) {
      const count = Object.values(legacyImport.messages).reduce((sum, n) => sum + n, 0);
      notice = `Importato dalla vecchia Mascotte per Mac: ${[legacyImport.settings.length ? 'impostazioni' : '', count ? `${count} messaggi` : ''].filter(Boolean).join(' e ') || 'nessun dato da trasferire'}. La vecchia app e i suoi dati restano invariati.`;
    }
    prepareLocal().then(note => { localAvailable = true; if (note) notice = note; if (!currentRun && !engineTouched) engine = 'locale'; broadcast(); }).catch(() => { localAvailable = false; broadcast(); });
    const resultFile = path.join(dataDirectory, 'update-result.json'), updateResult = Updater.takeUpdateResult(resultFile);
    if (updateResult) {
      updateStatus = updateResult.message.slice(0, 2000); updateFailed = !updateResult.ok;
      // Mac: se gli hook installati puntano a un'altra posizione dell'app, solo un avviso (mai applicare senza conferma).
      try { if (updateResult.ok && process.platform === 'darwin' && Setup.hooksPointElsewhere(path.join(dataDirectory, 'hook-installation.json'), process.execPath) && !/hook/i.test(updateStatus)) updateStatus += ' Premi Crea / aggiorna hook in Impostazioni: l’app è stata spostata.'; } catch {}
    }
    characters=readCharacters();selectCharacter(characters.some(c=>c.id===raw.character)?raw.character:'rosso',true);
    Capture.configureDisplayCapture(session.defaultSession, {
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
    // Solo ora esistono controllo degli stati, finestre e tray: le sveglie scadute ad app chiusa possono reagire (B1).
    reminderScheduler.start(); powerMonitor.on('resume', scheduleReminders);
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
      if (action === 'local-scan') {
        if (localDownload || currentRun || updateRunning || localScanning) return chatSnapshot();
        // Solo su richiesta dell'utente (apertura delle Impostazioni o pulsante): legge /api/tags e /api/show su 127.0.0.1 e ricorda il risultato.
        localScanning = true; broadcast();
        // Rileva Ollama e gli altri motori già avviati (solo 127.0.0.1, GET /v1/models); nessun avvio, chiusura o download.
        try { engineStatus = await LocalEngines.detectAll(); } catch { engineStatus = null; }
        // Il motore scelto non risponde più o il modello non c'è più (anche se le ultime risposte non sono passate dal modello): torna a Ollama.
        if (settings.localEngine !== 'ollama' && settings.localEngine !== LocalEngines.MANAGED && engineStatus) {
          const current = engineStatus.find(item => item.id === settings.localEngine);
          if (!current?.available) notice = fallbackToDefault(`${LocalEngines.label(settings.localEngine)}: ${current?.message === 'non avviato' ? 'non è avviato.' : current?.message || 'non risponde.'}`);
          else if (!current.models.some(model => model.name === settings.localModel)) notice = fallbackToDefault(`Il modello ${settings.localModel} non è più disponibile in ${current.label} o non è idoneo.`);
        }
        try { installedCache = await LocalAI.discoverInstalled(); } catch (error) { installedCache = { models: [], excluded: [], error: error.code === 'ECONNREFUSED' ? 'Ollama non è avviato.' : 'Non riesco a leggere i modelli di Ollama.' }; }
        finally { localScanning = false; }
        // Il modello «già presente» scelto non compare più tra gli idonei (es. «ollama rm»): torna subito al predefinito,
        // anche se le ultime risposte (conteggi cartelle, note) non sono passate dal modello.
        if (!installedCache.error && settings.localEngine === 'ollama' && settings.localModelSource === 'installed' && !LocalAI.isModel(settings.localModel) && !installedCache.models.some(model => model.name === settings.localModel))
          notice = fallbackToDefault(`Il modello ${settings.localModel} non è più installato o idoneo.`);
        return chatSnapshot();
      }
      // Un modello fuori catalogo si sceglie solo se è nell'elenco idoneo restituito da Ollama alla scansione.
      const otherEngine = settings.localEngine !== 'ollama';
      const chosenInstalled = !otherEngine && typeof data === 'string' && !LocalAI.isModel(data) && installedCache?.models.some(model => model.name === data);
      // Un altro motore: il modello si sceglie solo dall'elenco che quel motore ha restituito alla ricerca.
      const chosenOther = otherEngine && typeof data === 'string' && Boolean(engineStatus?.find(item => item.id === settings.localEngine)?.models?.some(model => model.name === data));
      // Scelta del motore: solo uno rilevato alla ricerca con almeno un modello idoneo (il primo), oppure Ollama con il predefinito.
      if (action === 'local-engine' && !localDownload && !currentRun && !updateRunning && LocalEngines.isEngine(data)) {
        const found = data === 'ollama' ? null : engineStatus?.find(item => item.id === data);
        if (data === 'ollama') { settings.localEngine = 'ollama'; settings.localModel = LocalAI.defaultModel(); settings.localModelSource = 'catalog'; saveSettings(); localAvailable = false; localDownloadStatus = ''; notice = ''; }
        else if (data === LocalEngines.MANAGED) {
          // Motore gestito da Mascotte: si può scegliere anche prima del download (serve per scaricare); fallback a Ollama solo se poi non è pronto.
          settings.localEngine = data; settings.localModel = LocalEngines.get(data).status().model.id; settings.localModelSource = 'installed'; saveSettings(); localAvailable = false; localDownloadStatus = ''; notice = '';
          if (!LocalEngines.get(data).status().complete) { notice = 'Scarica llama.cpp e il modello da Impostazioni › IA locale (pulsante «Scarica llama.cpp e modello»).'; return chatSnapshot(); }
        }
        else if (found?.available && found.models?.length) { settings.localEngine = data; settings.localModel = found.models[0].name; settings.localModelSource = 'installed'; saveSettings(); localAvailable = false; localDownloadStatus = ''; notice = ''; }
        else { notice = `${LocalEngines.label(data)} non è disponibile: avvialo e premi «Cerca motori locali».`; return chatSnapshot(); }
      }
      if (action === 'local-model' && !localDownload && !currentRun && !updateRunning && (otherEngine ? chosenOther : (LocalAI.isModel(data) || chosenInstalled))) { settings.localModel = data; settings.localModelSource = chosenInstalled || chosenOther ? 'installed' : 'catalog'; saveSettings(); localAvailable = false; localDownloadStatus = ''; notice = ''; }
      if (action === 'local-download-cancel') { localDownload?.abort(); return chatSnapshot(); }
      if (action === 'local-managed-remove' && settings.localEngine === LocalEngines.MANAGED && !localDownload && !currentRun && !updateRunning && !setupPreview) {
        const confirmation = await dialog.showMessageBox(chat, { type: 'question', title: 'Elimina file di llama.cpp', message: 'Eliminare runtime e modello scaricati?', detail: 'Vengono cancellati solo i file che Mascotte ha scaricato per llama.cpp (cartella «llama» nella cartella dati) e il server, se acceso, viene chiuso. Per usarlo di nuovo dovrai riscaricarli.', buttons: ['Annulla', 'Elimina'], defaultId: 0, cancelId: 0 });
        if (confirmation.response === 1) {
          try { await LocalEngines.get(LocalEngines.MANAGED).remove(); localAvailable = false; notice = ''; localDownloadStatus = 'File di llama.cpp eliminati.'; } catch (error) { localDownloadStatus = error.message; }
        }
        return chatSnapshot();
      }
      if (action === 'local-download') {
        if (localDownload || currentRun || updateRunning || setupPreview) return chatSnapshot();
        if (settings.localEngine === LocalEngines.MANAGED) {
          const managed = LocalEngines.get(settings.localEngine);
          // Il controllo si riserva prima della finestra di conferma, come per gli aggiornamenti.
          localDownload = new AbortController(); localAvailable = false; localDownloadStatus = 'Controllo lo spazio libero...'; broadcast();
          try {
            const plan = await managed.plan();
            if (!plan.missingBytes) { localAvailable = true; localDownloadStatus = 'llama.cpp e modello sono già scaricati.'; }
            else if (!plan.enough) localDownloadStatus = `Spazio libero insufficiente: servono circa ${plan.text.required}, ne restano ${plan.text.free}.`;
            else {
              const confirmation = await dialog.showMessageBox(chat, { type: 'question', title: 'Scarica llama.cpp e modello', message: `Scaricare circa ${plan.text.missing}?`,
                detail: `Da github.com: llama.cpp build ${plan.build} (${plan.variant}, licenza MIT).\nDa huggingface.co: ${plan.model.label} (testo e immagini, licenza Apache 2.0).\n\nDa scaricare: ${plan.text.missing}. Spazio richiesto: circa ${plan.text.required} (liberi: ${plan.text.free}).\n\nOgni file è controllato con SHA-256 prima dell’uso e salvato nella cartella dati di Mascotte; nulla viene eseguito prima della verifica. Il server parte solo su 127.0.0.1 quando serve e si chiude dopo 2 minuti di inattività. Puoi annullare il download in qualsiasi momento.`,
                buttons: ['Annulla', 'Scarica'], defaultId: 0, cancelId: 0 });
              if (confirmation.response !== 1) localDownloadStatus = 'Download non avviato.';
              else {
                await managed.download({ signal: localDownload.signal, onProgress: progress => { localDownloadStatus = progress.text; broadcast(); } });
                localAvailable = true; notice = ''; localDownloadStatus = 'llama.cpp e modello scaricati e verificati: pronti per la chat.';
              }
            }
          } catch (error) { localDownloadStatus = error.name === 'AbortError' ? 'Download annullato. I file parziali sono stati eliminati; puoi ripartire con lo stesso pulsante.' : error.message; }
          finally { localDownload = null; broadcast(); }
          return chatSnapshot();
        }
        if (settings.localEngine !== 'ollama') { localDownloadStatus = `I modelli si gestiscono da ${LocalEngines.label(settings.localEngine)}: Mascotte non scarica nulla.`; return chatSnapshot(); }
        if (!LocalAI.isModel(settings.localModel)) { localDownloadStatus = 'Mascotte non scarica né aggiorna modelli fuori catalogo: aggiornalo da Ollama. Puoi verificarlo qui.'; return chatSnapshot(); }
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
      if ((action === 'local-check' || action === 'local-model' || action === 'local-engine') && !localDownload) { localDownloadStatus = ''; try { notice = (await prepareLocal()) || 'Modello locale pronto.'; localAvailable = true; } catch (error) { localAvailable = false; notice = error.message; } return chatSnapshot(); }
      if (action === 'memory-add' && !currentRun && !updateRunning) { try { memory.add(data?.text, data?.source); notice = `Nota salvata sul ${can.deviceName}.`; } catch (error) { notice = error.message; } return chatSnapshot(); }
      if (action === 'memory-remove' && !currentRun && !updateRunning && typeof data === 'string') { try { memory.remove(data); notice = 'Nota rimossa.'; } catch (error) { notice = error.message; } return chatSnapshot(); }
      if (action === 'pc-action-cancel') { pendingAction = null; notice = 'Azione annullata.'; return chatSnapshot(); }
      if (action === 'pc-action-confirm' && pendingAction && data === pendingAction.id) {
        const selectedAction = pendingAction; pendingAction = null;
        try {
          if (selectedAction.kind === 'remember') { memory.add(selectedAction.text, 'manuale'); notice = `Nota salvata sul ${can.deviceName}.`; }
          else if (selectedAction.kind === 'reminder') {
            if (selectedAction.when <= Date.now()) throw new Error('l’orario è già passato.');
            reminders.add(selectedAction); scheduleReminders(); notice = `${selectedAction.alarm ? 'Sveglia impostata' : 'Promemoria impostato'} per ${Reminders.formatWhen(selectedAction.when)}.`;
            // Notifica di conferma subito: la prima volta il sistema chiede qui il permesso, così quella alla scadenza non va persa.
            if (Notification.isSupported()) new Notification({ title: 'Mascotte', body: notice, silent: true }).show();
          }
          else {
            if (!LocalCommands.validateTarget(selectedAction.target, { extraFolders: settings.extraFolders, dataDir: dataDirectory })) throw new Error(selectedAction.extraName ? ExtraFolders.goneMessage(selectedAction.extraName) : 'l’app o la cartella non è più disponibile o non è in una posizione ammessa.');
            const error = await shell.openPath(selectedAction.target);
            if (error) throw new Error(error);
            notice = 'Azione completata.';
          }
        } catch (error) { notice = `Azione non riuscita: ${error.message}`; }
        return chatSnapshot();
      }
      if (action === 'cli-guide') {
        const guides = { characters: 'https://github.com/Zekseron/Mascotte/blob/main/PERSONAGGI.md', codex: 'https://developers.openai.com/codex/cli/', claude: 'https://code.claude.com/docs/en/setup', ollama: can.ollamaGuide,
          git: can.gitGuide, node: can.nodeGuide };
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
            detail: `Il pacchetto ${can.packageName} verrà scaricato dalla release ufficiale e verificato prima dell’installazione.\nDestinazione: ${installDir}\n\nMascotte si chiude e si riavvia; la versione precedente viene conservata come backup.${movedNote(installDir, '\n\nDopo il riavvio aggiorna gli hook per collegarli al nuovo percorso.')}${backupNote(installDir)}`,
            buttons: ['Annulla', 'Aggiorna e riavvia'], defaultId: 1, cancelId: 0 });
          if (confirmation.response !== 1) { updateRunning = false; updateAbort = null; updateStatus = 'Aggiornamento annullato.'; broadcast(); return chatSnapshot(); }
          void installPublishedRelease(release).catch(error => {
            updateRunning = false; updateFailed = true; updateStatus = `Aggiornamento non riuscito: ${error.message}`; broadcast();
          }).finally(() => { updateAbort = null; });
        } catch (error) { updateRunning = false; updateAbort = null; updateFailed = true; updateStatus = error.message; broadcast(); }
        return chatSnapshot();
      }
      if (action === 'character-select' && typeof data === 'string' && characters.some(c => c.id === data)) { selectCharacter(data); characterStatus = ''; characterStatusFailed = false; return chatSnapshot(); }
      // Stessi valori e limiti del menu «Grandezza» della mascotte.
      if (action === 'character-scale' && Characters.allowedScales(pack).includes(data)) { setScale(data); return chatSnapshot(); }
      if (action === 'character-add' && !currentRun && !localDownload && !updateRunning && !setupPreview) {
        // Mascotte personali: cartella scelta solo dal selettore di sistema, convalidata per intero prima di copiare solo character.json e sprites.png.
        try {
          const selected = await dialog.showOpenDialog(chat, { title: 'Scegli la cartella della mascotte (con character.json e sprites.png)', properties: ['openDirectory'], defaultPath: os.homedir() });
          if (!selected.canceled && selected.filePaths[0]) {
            const result = Characters.importFolder(P, selected.filePaths[0], personalDirectory, { includedIds: includedCharacters.map(c => c.id), personalIds: characters.filter(c => c.personal).map(c => c.id) });
            if (result.ok) { characters = readCharacters(); characterStatus = `Mascotte «${result.name}» aggiunta: la trovi nel selettore Personaggio e nel menu della mascotte.`; characterStatusFailed = false; }
            else { characterStatus = result.reason; characterStatusFailed = true; }
          }
        } catch { characterStatus = 'Non riesco ad aggiungere la mascotte.'; characterStatusFailed = true; }
        return chatSnapshot();
      }
      if (action === 'character-remove' && !currentRun && !localDownload && !updateRunning && !setupPreview && typeof data === 'string') {
        const target = characters.find(c => c.personal && c.id === data);
        if (target) {
          const confirmation = await dialog.showMessageBox(chat, { type: 'question', title: 'Rimuovi mascotte', message: `Rimuovere la mascotte «${target.name}»?`, detail: 'I suoi file vengono eliminati dalla cartella dati di Mascotte. I file originali che hai scelto non vengono toccati.', buttons: ['Annulla', 'Rimuovi'], defaultId: 0, cancelId: 0 });
          if (confirmation.response === 1) {
            const result = Characters.removePersonal(personalDirectory, target.id);
            if (result.ok) {
              const wasCurrent = pack.id === target.id;
              characters = readCharacters(); if (wasCurrent) selectCharacter('rosso');
              characterStatus = `Mascotte «${target.name}» rimossa${wasCurrent ? ': è tornato Rosso' : ''}.`; characterStatusFailed = false;
            } else { characterStatus = result.reason; characterStatusFailed = true; }
          }
        }
        return chatSnapshot();
      }
      if (action === 'folders-add' && !currentRun && !localDownload && !updateRunning && !setupPreview) {
        // Cartelle visibili alla chat locale: scelte solo dal selettore di sistema, risolte con realpath e validate. Il percorso non finisce nei log.
        try {
          const selected = await dialog.showOpenDialog(chat, { title: 'Scegli una cartella che la mascotte può vedere', properties: ['openDirectory'], defaultPath: os.homedir() });
          if (!selected.canceled && selected.filePaths[0]) {
            const result = ExtraFolders.addExtraFolder(settings.extraFolders, selected.filePaths[0], { platform: process.platform, home: os.homedir(), dataDir: dataDirectory });
            if (result.ok) { settings.extraFolders = result.list; saveSettings(); folderStatus = `Cartella «${result.name}» aggiunta. Ora puoi chiedere, per esempio, «che file ho in ${result.name}?».`; folderStatusFailed = false; }
            else { folderStatus = result.reason; folderStatusFailed = true; }
          }
        } catch { folderStatus = 'Non riesco ad aggiungere la cartella.'; folderStatusFailed = true; }
        return chatSnapshot();
      }
      if (action === 'folders-remove' && !currentRun && !localDownload && !updateRunning && !setupPreview) {
        // Accetta solo un indice o un percorso già presenti nell'elenco.
        const index = Number.isInteger(data) ? data : typeof data === 'string' ? settings.extraFolders.findIndex(folder => folder.path === data) : -1;
        if (index >= 0 && index < settings.extraFolders.length) {
          const [removed] = settings.extraFolders.splice(index, 1); saveSettings();
          if (pendingAction?.extraName === removed.name) pendingAction = null;
          folderStatus = `Cartella «${removed.name}» rimossa.`; folderStatusFailed = false;
        }
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
          const confirmation = await dialog.showMessageBox(chat, { type: 'question', title: 'Aggiorna Mascotte', message: 'Scaricare, compilare e installare l’aggiornamento?', detail: `Repo: ${repo.root}\nDestinazione: ${installDir}\n\nServono Git e Node.js 22+ con npm. La repo viene aggiornata con git pull --ff-only. A fine build Mascotte si chiude e si riavvia; la versione precedente viene conservata come backup.${movedNote(installDir, '\n\nL’app verrà installata in una cartella stabile: dopo il riavvio premi Crea / aggiorna hook per collegarli al nuovo percorso.')}${backupNote(installDir)}`, buttons: ['Annulla', 'Aggiorna e riavvia'], defaultId: 1, cancelId: 0 });
          if (confirmation.response !== 1) { updateRunning = false; broadcast(); return chatSnapshot(); }
          updateAbort = new AbortController();
          void installRepositoryUpdate(repo).catch(error => {
            updateRunning = false; updateFailed = true; updateStatus = `Aggiornamento non riuscito: ${error.message}`; broadcast();
          }).finally(() => { updateAbort = null; });
        } catch (error) { updateRunning = false; updateFailed = true; updateStatus = error.message; broadcast(); }
        return chatSnapshot();
      }
      if (action === 'watch-sources' && can.watch) return watchSources();
      if (action === 'watch-permission-settings' && can.watch && process.platform === 'darwin') { await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'); return; }
      if (action === 'watch-enable' && can.watch && typeof data?.id === 'string') {
        if (screenPermission() !== 'granted') { notice = permissionMessage(screenPermission()); return chatSnapshot(); }
        const sources = await windowSources(), source = sources.find(item => item.id === data.id);
        if (!source) { notice = 'La finestra non è più disponibile. Aggiorna l’elenco e riprova.'; return chatSnapshot(); }
        watchSource = source; notice = ''; broadcast(); return { id: source.id, name: source.name };
      }
      if (action === 'watch-disable') { stopWatching(); return chatSnapshot(); }
      if (action === 'engine' && !currentRun && [...CLI.ENGINES, 'locale'].includes(data)) { engine = data; engineTouched = true; notice = ''; return chatSnapshot(); }
      // Sveglie e promemoria nelle Impostazioni: elenco con eliminazione, suono (bip o file scelto dal selettore di sistema) e volume.
      if (action === 'reminder-remove' && typeof data === 'string') { reminders.remove(data); scheduleReminders(); return chatSnapshot(); }
      if (action === 'alarm-volume' && typeof data === 'number') { settings.alarmVolume = AlarmSound.normalizeVolume(data); saveSettings(); return chatSnapshot(); }
      if (action === 'alarm-sound-data') return settings.alarmSound === 'custom' ? AlarmSound.readSound(dataDirectory) : null;
      if (action === 'alarm-sound-remove') { AlarmSound.removeSound(dataDirectory); settings.alarmSound = 'beep'; settings.alarmSoundName = ''; saveSettings(); notice = 'Suono della sveglia: tornato al bip.'; return chatSnapshot(); }
      if (action === 'alarm-sound-choose') {
        const selected = await dialog.showOpenDialog(chat, { title: 'Scegli il suono della sveglia', properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }] });
        if (!selected.canceled && selected.filePaths[0]) {
          const result = AlarmSound.importSound(selected.filePaths[0], dataDirectory);
          if (result.ok) { settings.alarmSound = 'custom'; settings.alarmSoundName = result.name; saveSettings(); notice = `Suono della sveglia: «${result.name}».`; }
          else notice = result.reason;
        }
        return chatSnapshot();
      }
      if (action === 'alarm-stop') { stopAlarm(); if (!currentRun) controller.set('idle'); return chatSnapshot(); }
      if (action === 'alarm-snooze' && activeAlarm) {
        // Con l'elenco pieno l'aggiunta fallisce: avviso, e la sveglia resta attiva (Ferma continua a funzionare).
        const snoozed = Reminders.snoozeAlarm(reminders, activeAlarm, { delay: SNOOZE });
        if (snoozed.error) { notice = snoozed.error; return chatSnapshot(); }
        stopAlarm(); scheduleReminders();
        if (!currentRun) controller.set('idle'); notice = `Sveglia rimandata a ${Reminders.formatWhen(snoozed.item.when)}.`; return chatSnapshot();
      }
      if (action === 'new' && !currentRun) { store.set(engine, []); if (engine === 'locale') clearLastFrame(); notice = ''; return chatSnapshot(); }
      // Anteprima del fotogramma conservato, solo per la finestra di conferma del secondo parere.
      if (action === 'second-opinion-frame') return lastFrame ? 'data:image/jpeg;base64,' + lastFrame.bytes.toString('base64') : null;
      if (action === 'stop') { currentRun?.stop(); return; }
      if (action === 'setup-preview') {
        if (updateRunning || currentRun) return chatSnapshot();
        if (!can.hooks || !app.isPackaged) { notice = 'Configurazione hook disponibile solo nell’app installata dal pacchetto.'; return chatSnapshot(); }
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
        // Un rifiuto lascia un avviso (se c'è qualcosa da dire): la chat, vedendo il notice, rimette il testo nel campo.
        const refusal = sendRefusal(text, { localDownload, currentRun, updateRunning });
        if (refusal !== null) { if (refusal) { notice = refusal; broadcast(); } return; }
        if (pendingAction) { notice = 'Conferma o annulla prima l’azione proposta.'; broadcast(); return; }
        let folderRead = null;
        if (engine === 'locale' && !imageData) {
          const replyNow = answer => { store.set('locale', [...store.get('locale'), { role: 'user', text: text.trim() }, { role: 'assistant', text: answer }]); notice = ''; broadcast(); return chatSnapshot(); };
          // Promemoria e sveglie: orario calcolato da Mascotte, impostazione con conferma, elenco e cancellazione diretti.
          const reminderCommand = Reminders.parseReminderCommand(text);
          if (reminderCommand?.type === 'reminder-list') return replyNow(Reminders.describeReminders(reminders.list()));
          if (reminderCommand?.type === 'reminder-cancel') {
            const items = reminders.list();
            if (reminderCommand.all) { const count = reminders.clear(); scheduleReminders(); return replyNow(count ? `Ho cancellato ${count === 1 ? 'il promemoria' : `tutti i ${count} promemoria`}.` : 'Non avevi promemoria.'); }
            const index = reminderCommand.index ?? (items.length === 1 ? 1 : null);
            if (!index || !items[index - 1]) return replyNow(items.length ? 'Quale? Scrivi il numero, per esempio «cancella promemoria 1».\n\n' + Reminders.describeReminders(items) : 'Non hai promemoria da cancellare.');
            reminders.remove(items[index - 1].id); scheduleReminders();
            return replyNow(`Ho cancellato il promemoria ${index}: «${items[index - 1].text}» (${Reminders.formatWhen(items[index - 1].when)}).`);
          }
          const reminder = Reminders.parseReminder(text);
          if (reminder?.error) return replyNow(reminder.error);
          if (reminder) {
            store.set('locale', [...store.get('locale'), { role: 'user', text: text.trim() }, { role: 'assistant', text: 'Posso impostarlo: controlla e conferma.' }]); notice = '';
            pendingAction = { id: randomUUID(), kind: 'reminder', description: `Impostare ${reminder.alarm ? 'una sveglia' : 'un promemoria'} per ${Reminders.formatWhen(reminder.when)}: «${reminder.text}». Riceverai una notifica di sistema.`, when: reminder.when.getTime(), text: reminder.text, alarm: reminder.alarm };
            broadcast(); return chatSnapshot();
          }
          // Comandi gestiti da Mascotte, non dal modello: azioni predefinite e note, sempre con conferma.
          const command = LocalCommands.parseLocalCommand(text, { actions: can.localActions, extraFolders: settings.extraFolders });
          const reply = answer => { store.set('locale', [...store.get('locale'), { role: 'user', text: text.trim() }, { role: 'assistant', text: answer }]); notice = ''; };
          if (command?.type === 'list-notes') { reply(LocalCommands.describeNotes(memory.list())); broadcast(); return chatSnapshot(); }
          if (command?.type === 'reply') { reply(command.text); broadcast(); return chatSnapshot(); }
          if (command?.type === 'folder') {
            // Lettura di sola consultazione di una cartella conosciuta, solo con il motore locale e senza conferma: l'avviso apre la risposta.
            // L'elenco non entra nella cronologia (restano domanda e risposta) e non viene scritto nel log.
            let view; try { view = FolderView.readFolder(command.folder, { extraFolders: settings.extraFolders, dataDir: dataDirectory }); } catch (error) { reply(error.code === 'GONE' ? error.message : `Non riesco a leggere la cartella ${command.folder.display}.`); broadcast(); return chatSnapshot(); }
            if (command.question.kind !== 'model') { reply(FolderView.notice(view) + '\n\n' + FolderView.answer(view, command.question)); broadcast(); return chatSnapshot(); }
            folderRead = { notice: FolderView.notice(view), context: FolderView.modelContext(view) };
          }
          if (command?.type === 'open') {
            // Una cartella aggiunta dalle Impostazioni viene ricontrollata subito (e ancora alla conferma): se è sparita non si propone l'azione.
            if (command.extraName && !LocalCommands.validateTarget(command.target, { extraFolders: settings.extraFolders, dataDir: dataDirectory })) { reply(ExtraFolders.goneMessage(command.extraName)); broadcast(); return chatSnapshot(); }
            reply('Posso farlo: controlla e conferma l’azione.'); pendingAction = { id: randomUUID(), kind: 'open', description: command.description, target: command.target, extraName: command.extraName }; broadcast(); return chatSnapshot();
          }
          if (command?.type === 'remember') { reply('Posso salvarla tra le note: controlla e conferma.'); pendingAction = { id: randomUUID(), kind: 'remember', description: `Salvare questa nota sul ${can.deviceName}: «${command.text}»`, text: command.text }; broadcast(); return chatSnapshot(); }
        }
        let image = null, imagePath = null, imageDirectory = null;
        if (data?.useLastFrame === true) {
          if (engine === 'locale' || imageData !== null) return;
          if (!lastFrame) { notice = 'Il fotogramma per il secondo parere non è più disponibile (si conserva 10 minuti): allegane uno nuovo.'; broadcast(); return; }
          image = { bytes: Buffer.from(lastFrame.bytes), name: lastFrame.name };
        } else if (imageData !== null) {
          if (engine === 'locale' && !localVision()) { notice = settings.localEngine !== 'ollama' ? `${LocalEngines.label(settings.localEngine)} non dichiara il supporto alle immagini per questo modello: allegati disattivati.` : 'Il modello locale scelto è solo testuale.'; broadcast(); return; }
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
        const run = selected === 'locale' ? LocalEngines.run(settings.localEngine, history, prompt, memory.relevant(prompt), { ...modelOptions(), imageBase64: image?.bytes.toString('base64') || null, folderContext: folderRead?.context || null }) : CLI.runCLI(command, args, input, imageDirectory || path.join(dataDirectory, 'chat'));
        currentRun = run; controller.set('thinking', true); broadcast();
        try {
          const output = await run.promise;
          const text = selected === 'locale' ? (folderRead ? folderRead.notice + '\n\n' + output : output) : CLI.decodeOutput(selected, output.stdout, output.code, output.stderr);
          store.set(selected, [...store.get(selected), { role: 'assistant', text }]); controller.set('talk');
          if (selected === 'locale' && image) keepLastFrame(image.bytes, image.name, store.get('locale').length - 1, text);
        } catch (e) {
          notice = (e.name === 'AbortError' ? 'Risposta interrotta.' : selected === 'locale' && settings.localEngine !== 'ollama' && ['MODEL_INVALID', 'ECONNREFUSED', 'AUTH', 'UNRECOGNIZED', 'NOT_READY'].includes(e.code) ? fallbackToDefault(e.message) : e.code === 'MODEL_INVALID' && selected === 'locale' && !LocalAI.isModel(settings.localModel) ? fallbackToDefault(e.message) : e.message).slice(0, 1500); controller.set('error');
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
