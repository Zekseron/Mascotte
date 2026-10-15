import AppKit

/// Ciò che il menu deve sapere dell'app e le azioni che può chiedere.
@MainActor
protocol MenuHost: AnyObject {
    var statesSpec: StatesSpec { get }
    var characters: [LoadedCharacter] { get }
    var currentCharacter: LoadedCharacter? { get }
    var currentScale: Int { get }
    var isMascotVisible: Bool { get }
    var requestedState: String { get }
    var attachmentMode: AttachmentController.Mode { get }
    var isSinging: Bool { get }
    func toggleSinging()
    func attachToDock()
    func attachToWindow()
    func detachMascot()

    func refreshCharacters()
    func chooseCharacter(id: String)
    func chooseScale(_ scale: Int)
    func tryState(_ state: String)
    func toggleVisibility()
    func openCharactersFolder()
    func quit()
    func openChat()
}

/// Menu nella barra in alto (NSStatusItem) e, con lo stesso contenuto, quello del
/// clic destro sul personaggio (sono due istanze di NSMenu costruite dallo stesso
/// codice: una stessa istanza non va condivisa tra barra e menu contestuale).
/// Si ricostruisce ogni volta che si apre, così riflette le scelte correnti e i
/// personaggi appena aggiunti alla cartella.
@MainActor
final class MenuController: NSObject, NSMenuDelegate {
    /// Menu del clic destro sul personaggio.
    let contextMenu = NSMenu(title: "Mascotte")
    private let statusMenu = NSMenu(title: "Mascotte")
    private let statusItem: NSStatusItem
    private unowned let host: MenuHost

    init(host: MenuHost) {
        self.host = host
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        super.init()
        for m in [statusMenu, contextMenu] {
            m.delegate = self
            m.autoenablesItems = false
        }
        if let button = statusItem.button {
            let image = NSImage(systemSymbolName: "pawprint.fill", accessibilityDescription: "Mascotte")
            image?.isTemplate = true
            button.image = image
            if image == nil { button.title = "M" }
            button.toolTip = "Mascotte"
        }
        statusItem.menu = statusMenu
        rebuild(statusMenu)
        rebuild(contextMenu)
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        host.refreshCharacters()
        rebuild(menu)
    }

    // MARK: costruzione

    private func rebuild(_ menu: NSMenu) {
        menu.removeAllItems()

        let chat = NSMenuItem(title: "Apri micro chat", action: #selector(openChat), keyEquivalent: "")
        chat.target = self
        menu.addItem(chat)
        menu.addItem(.separator())

        // Personaggio ▸
        let charactersMenu = NSMenu(title: "Personaggio")
        charactersMenu.autoenablesItems = false
        if host.characters.isEmpty {
            charactersMenu.addItem(disabled("Nessun personaggio trovato"))
        }
        var categories: [String: NSMenu] = [:]
        for c in host.characters {
            let group: NSMenu
            if let existing = categories[c.category] { group = existing }
            else {
                group = NSMenu(title:c.category); group.autoenablesItems = false
                categories[c.category] = group; charactersMenu.addItem(submenu(c.category,group))
            }
            let item = NSMenuItem(title: c.name, action: #selector(pickCharacter(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = c.id
            item.state = (c.id == host.currentCharacter?.id) ? .on : .off
            group.addItem(item)
        }
        menu.addItem(submenu("Personaggio", charactersMenu))

        // Grandezza ▸
        let sizeMenu = NSMenu(title: "Grandezza")
        sizeMenu.autoenablesItems = false
        for s in Settings.scaleChoices {
            let item = NSMenuItem(title: "\(s)×", action: #selector(pickScale(_:)), keyEquivalent: "")
            item.target = self
            item.tag = s
            item.state = (s == host.currentScale) ? .on : .off
            item.isEnabled = host.currentCharacter != nil
            if let frame = host.currentCharacter?.pack.frame {
                item.isEnabled = max(frame.width, frame.height) * s / (host.currentCharacter?.pack.pixelRatio ?? 1) <= CharacterPack.maxDisplaySize
            }
            sizeMenu.addItem(item)
        }
        menu.addItem(submenu("Grandezza", sizeMenu))

        let lockMenu = NSMenu(title: "Aggancio")
        lockMenu.autoenablesItems = false
        for (title, mode, action) in [("Libera / sgancia", AttachmentController.Mode.free, #selector(detach)),
                                      ("Aggancia al Dock", .dock, #selector(attachDock)),
                                      ("Aggancia alla finestra attiva", .window, #selector(attachWindow))] {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
            item.target = self; item.state = host.attachmentMode == mode ? .on : .off
            item.isEnabled = host.currentCharacter != nil; lockMenu.addItem(item)
        }
        menu.addItem(submenu("Aggancio", lockMenu))

        if host.currentCharacter?.pack.perch?.singing != nil {
            let sing = NSMenuItem(title:"Canta sul bordo (manuale)",action:#selector(toggleSinging),keyEquivalent:"")
            sing.target = self; sing.state = host.isSinging ? .on : .off
            sing.isEnabled = host.attachmentMode != .free
            sing.toolTip = "Aggancia il personaggio a una finestra o al Dock; premi di nuovo per tornare alla idle seduta."
            menu.addItem(sing)
        }

        // Prova uno stato ▸
        let statesMenu = NSMenu(title: "Prova uno stato")
        statesMenu.autoenablesItems = false
        let spec = host.statesSpec
        let pack = host.currentCharacter?.pack
        for name in spec.order {
            var title = name
            if let pack {
                let used = StateResolver.resolve(name, pack: pack, spec: spec).used
                if used != name { title += "  (ripiego: \(used))" }
                if host.attachmentMode != .free, pack.perch != nil { title += " · posa seduta" }
            }
            let item = NSMenuItem(title: title, action: #selector(pickState(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = name
            item.toolTip = spec.states[name]?.description
            item.state = (name == host.requestedState) ? .on : .off
            item.isEnabled = pack != nil
            statesMenu.addItem(item)
        }
        menu.addItem(submenu("Prova uno stato", statesMenu))

        menu.addItem(.separator())

        let toggle = NSMenuItem(title: host.isMascotVisible ? "Nascondi" : "Mostra",
                                action: #selector(toggleVisibility), keyEquivalent: "")
        toggle.target = self
        toggle.isEnabled = host.currentCharacter != nil
        menu.addItem(toggle)

        let folder = NSMenuItem(title: "Apri la cartella dei personaggi",
                                action: #selector(openFolder), keyEquivalent: "")
        folder.target = self
        menu.addItem(folder)

        menu.addItem(.separator())

        let quit = NSMenuItem(title: "Esci", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
    }

    private func submenu(_ title: String, _ sub: NSMenu) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.submenu = sub
        return item
    }

    private func disabled(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    // MARK: azioni

    @objc private func openChat() { host.openChat() }
    @objc private func attachDock() { host.attachToDock() }
    @objc private func attachWindow() { host.attachToWindow() }
    @objc private func detach() { host.detachMascot() }
    @objc private func toggleSinging() { host.toggleSinging() }

    @objc private func pickCharacter(_ sender: NSMenuItem) {
        if let id = sender.representedObject as? String { host.chooseCharacter(id: id) }
    }

    @objc private func pickScale(_ sender: NSMenuItem) { host.chooseScale(sender.tag) }

    @objc private func pickState(_ sender: NSMenuItem) {
        if let s = sender.representedObject as? String { host.tryState(s) }
    }

    @objc private func toggleVisibility() { host.toggleVisibility() }
    @objc private func openFolder() { host.openCharactersFolder() }
    @objc private func quit() { host.quit() }
}
