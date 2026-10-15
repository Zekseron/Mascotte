import AppKit

enum AppInfo {
    static var version: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "0.1 (sviluppo)"
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, MenuHost {
    private(set) var statesSpec = StatesSpec.load()
    private var library = CharacterLibrary()
    private var loggedMessages = Set<String>()

    private(set) var currentCharacter: LoadedCharacter?
    private var stateController: StateController?
    private var windowController: MascotWindowController?
    private var menuController: MenuController?
    private var eventServer: EventServer?
    private var chatController: ChatWindowController?
    private var attachment: AttachmentController?

    // MARK: ciclo di vita

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)        // niente icona nel Dock (vale anche con `swift run`)
        Log.info("Mascotte \(AppInfo.version) avviata (pid \(ProcessInfo.processInfo.processIdentifier))")
        Log.info("States letto da: \(statesSpec.origin) (\(statesSpec.order.count) stati)")

        AppBootstrap.prepare()
        refreshCharacters()

        let chosen = library.character(id: Settings.characterID) ?? library.character(id: library.defaultID)
        if let chosen {
            start(with: chosen)
        } else {
            Log.error("Nessun personaggio valido trovato. Metti un pacchetto in \(CharacterLibrary.userDirectory.path)")
        }
        menuController = MenuController(host: self)
        wireMenuToWindow()
        Log.info("Menu nella barra creato")
        let server = EventServer(states: Set(statesSpec.order)) { [weak self] event in
            MainActor.assumeIsolated { self?.receive(event) }
        }
        eventServer = server
        server.start()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationWillTerminate(_ notification: Notification) {
        chatController?.shutdown()
        attachment?.suspend()
        eventServer?.stop()
        if let w = windowController { Settings.windowOrigin = w.panel.frame.origin }
        Log.info("Mascotte chiusa")
    }

    private func start(with character: LoadedCharacter) {
        currentCharacter = character
        let scale = Settings.scale(for: character.pack)
        let controller = StateController(spec: statesSpec, pack: character.pack)
        let window = MascotWindowController()
        stateController = controller
        windowController = window
        let anchor = AttachmentController(window: window)
        attachment = anchor
        anchor.onChanged = { [weak window] mode in Settings.dockAttachment = mode == .dock; window?.setPerching(mode != .free) }

        controller.onDisplay = { [weak window] d in window?.play(d.animation) }
        window.onMoved = { Settings.windowOrigin = $0 }
        window.onDragBegan = { [weak controller, weak anchor] in anchor?.detach(); controller?.beginDrag() }
        window.onDragEnded = { [weak self, weak controller] in
            controller?.endDrag()
            if self?.chatController?.isBusy == true { controller?.set("thinking", source: "microchat", hold: .forever) }
        }
        window.onClick = { [weak self, weak controller] in
            if self?.chatController?.isBusy != true { controller?.reactToClick() }
            self?.openChat()
        }

        window.configure(character: character, scale: scale, savedOrigin: Settings.windowOrigin)
        controller.set("idle", source: "avvio")       // prepara la prima animazione
        if Settings.isVisible { window.show() }
        if Settings.dockAttachment { anchor.dock() }

        let f = window.panel.frame
        Log.info("Finestra: \(Int(f.width))×\(Int(f.height)) pt in (\(Int(f.minX)), \(Int(f.minY))), "
                 + "livello \(window.panel.level.rawValue), visibile \(window.panel.isVisible), "
                 + "scala \(scale), personaggio \(character.id)")
    }

    private func wireMenuToWindow() {
        windowController?.onContextMenu = { [weak self] event, view in
            guard let menu = self?.menuController?.contextMenu else { return }
            NSMenu.popUpContextMenu(menu, with: event, for: view)
        }
    }

    private func receive(_ event: MascotEvent) {
        guard chatController?.isBusy != true else { return }
        if stateController == nil {
            refreshCharacters()
            if let id = library.defaultID { chooseCharacter(id: id) }
        }
        stateController?.set(event.state, source: event.source)
    }

    // MARK: MenuHost

    func openChat() {
        if chatController == nil {
            let chat = ChatWindowController()
            chat.onActivity = { [weak self] state in
                self?.stateController?.set(state, source: "microchat", hold: state == "thinking" ? .forever : .automatic)
            }
            chatController = chat
        }
        chatController?.show(near: windowController?.panel.frame ?? NSRect(x: 100, y: 100, width: 100, height: 100))
    }

    var characters: [LoadedCharacter] { library.characters }

    var currentScale: Int { currentCharacter.map { Settings.scale(for: $0.pack) } ?? CharacterPack.defaultScale }

    var isMascotVisible: Bool { windowController != nil && Settings.isVisible }

    var requestedState: String { stateController?.requested ?? "idle" }
    var attachmentMode: AttachmentController.Mode { attachment?.mode ?? .free }
    var isSinging: Bool { windowController?.isSinging ?? false }
    func toggleSinging() { windowController?.setSinging(!isSinging) }
    func attachToDock() { attachment?.dock() }
    func detachMascot() { attachment?.detach() }
    func attachToWindow() {
        if attachment?.activeWindow() != true {
            let alert = NSAlert()
            alert.messageText = "Nessuna finestra agganciabile"
            alert.informativeText = "Porta in primo piano la finestra desiderata, poi usa il menu della zampa → Aggancio → Aggancia alla finestra attiva."
            alert.runModal()
        }
    }

    /// Rilegge le cartelle (i personaggi aggiunti mentre l'app è aperta compaiono nel menu).
    func refreshCharacters() {
        library = CharacterLibrary.discover(spec: statesSpec)
        for m in library.messages where loggedMessages.insert(m.text).inserted {
            switch m.level {
            case .info: Log.info(m.text)
            case .warn: Log.warn(m.text)
            case .error: Log.error(m.text)
            }
        }
    }

    func chooseCharacter(id: String) {
        guard let c = library.character(id: id) else { return }
        Settings.characterID = id
        if let window = windowController, let controller = stateController {
            currentCharacter = c
            window.setSinging(false)
            window.configure(character: c, scale: Settings.scale(for: c.pack), savedOrigin: nil)
            controller.setPack(c.pack)
            controller.noteInteraction()
        } else {
            start(with: c)
            wireMenuToWindow()
        }
        Log.info("Personaggio scelto: \(c.id)")
    }

    func chooseScale(_ scale: Int) {
        guard Settings.scaleChoices.contains(scale) else { return }
        guard let c = currentCharacter, let window = windowController else { return }
        guard max(c.pack.frame.width, c.pack.frame.height) * scale / c.pack.pixelRatio <= CharacterPack.maxDisplaySize else { return }
        Settings.setScale(scale, for:c.pack)
        window.configure(character: c, scale: scale, savedOrigin: nil)
        stateController?.noteInteraction()
        Log.info("Grandezza scelta: \(scale)×")
    }

    func tryState(_ state: String) {
        guard let controller = stateController else { return }
        if let w = windowController, !w.isShown { toggleVisibility() }    // provare uno stato la rimette in vista
        controller.set(state, source: "menu")
    }

    func toggleVisibility() {
        guard let w = windowController else { return }
        if Settings.isVisible {
            w.hide()
            Settings.isVisible = false
            attachment?.suspend()
        } else {
            w.show()
            Settings.isVisible = true
            attachment?.resume()
        }
        stateController?.noteInteraction()
    }

    func openCharactersFolder() {
        CharacterLibrary.ensureUserDirectory()
        NSWorkspace.shared.open(CharacterLibrary.userDirectory)
    }

    func quit() { NSApp.terminate(nil) }
}

/// Preparazione all'avvio (non nei test): crea la cartella dei personaggi dell'utente.
enum AppBootstrap {
    static func prepare() {
        if CharacterLibrary.ensureUserDirectory() {
            Log.info("Cartella dei personaggi: \(CharacterLibrary.userDirectory.path)")
        }
    }
}
