import AppKit

/// Pannello senza bordi che non ruba mai il focus.
final class MascotPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// La finestra trasparente, sempre in primo piano, che contiene la mascotte.
@MainActor
final class MascotWindowController {
    /// Distanza dai bordi dello schermo nella posizione iniziale (punti).
    static let margin: CGFloat = 24
    static let level = NSWindow.Level.statusBar

    let panel: MascotPanel
    let view = MascotView(frame: .zero)
    let animator = Animator()

    var onMoved: ((CGPoint) -> Void)?       // posizione da salvare
    var onDragBegan: (() -> Void)?
    var onDragEnded: (() -> Void)?
    var onClick: (() -> Void)?
    var onContextMenu: ((NSEvent, MascotView) -> Void)?

    private var lastAnimation: Animation?
    private var hasBeenPlaced = false
    private var globalMonitor: Any?
    private var localMonitor: Any?
    private var passThroughTimer: Timer?
    private var perch: Perch?
    private var perchScale: CGFloat = 1
    private var perching = false
    private(set) var isSinging = false
    func setSinging(_ value: Bool) {
        isSinging = value && perching && perch?.singing != nil
        if let animation = lastAnimation { play(animation) }
    }
    var attachmentAnchor: CGPoint? {
        guard perching, let perch else { return nil }
        return CGPoint(x:perch.anchor.x*perchScale,y:panel.frame.height-perch.anchor.y*perchScale)
    }
    func setPerching(_ value: Bool) {
        perching = value
        if !value { isSinging = false }
        if !value { keepOnScreen() }
        if let animation = lastAnimation { play(animation) }
    }

    init() {
        panel = MascotPanel(contentRect: NSRect(x: 0, y: 0, width: 128, height: 128),
                            styleMask: [.borderless, .nonactivatingPanel],
                            backing: .buffered, defer: false)
        panel.contentView = view
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.isFloatingPanel = true          // prima del livello: questa riga lo riporta a .floating
        panel.level = Self.level
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.worksWhenModal = true
        panel.isReleasedWhenClosed = false
        panel.isMovableByWindowBackground = false
        panel.isExcludedFromWindowsMenu = true
        panel.acceptsMouseMovedEvents = true
        panel.animationBehavior = .none
        panel.title = "Mascotte"

        animator.onFrame = { [weak self] entry in
            self?.view.show(entry)
            self?.updateMouseTransparency()
        }
        view.onDragBegan = { [weak self] in self?.onDragBegan?() }
        view.onDragEnded = { [weak self] in
            guard let self else { return }
            self.keepOnScreen()
            self.onMoved?(self.panel.frame.origin)
            self.onDragEnded?()
        }
        view.onClick = { [weak self] in self?.onClick?() }
        view.onContextMenu = { [weak self] e in
            guard let self else { return }
            self.onContextMenu?(e, self.view)
        }
        view.onMouseMoved = { [weak self] in self?.updateMouseTransparency() }

        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.keepOnScreen() }
        }
        installMouseMonitors()
    }

    // MARK: personaggio, grandezza, posizione

    /// Imposta personaggio e grandezza. Se la finestra c'è già, resta ferma la base
    /// (centro del bordo inferiore), così il personaggio non "salta".
    func configure(character: LoadedCharacter, scale: Int, savedOrigin: CGPoint?) {
        perch = character.pack.perch; perchScale = CGFloat(scale)/CGFloat(character.pack.pixelRatio)
        if perch?.singing == nil { isSinging = false }
        let old = panel.frame
        view.configure(character: character, scale: scale)
        let size = NSSize(width: CGFloat(character.pack.frame.width)*perchScale, height: CGFloat(character.pack.frame.height)*perchScale)

        if hasBeenPlaced {
            let origin = NSPoint(x: (old.midX - size.width / 2).rounded(), y: old.minY.rounded())
            panel.setFrame(NSRect(origin: origin, size: size), display: true)
            keepOnScreen()
        } else {
            let origin: NSPoint
            if let saved = savedOrigin, Self.isReasonablyVisible(NSRect(origin: saved, size: size)) {
                origin = saved
            } else {
                origin = Self.defaultOrigin(for: size)
            }
            panel.setFrame(NSRect(origin: origin, size: size), display: true)
            hasBeenPlaced = true
        }
        keepOnScreen()
        onMoved?(panel.frame.origin)
    }

    /// In basso a destra dello schermo principale (quello con la barra dei menu), con un margine.
    static func defaultOrigin(for size: NSSize) -> NSPoint {
        let area = (NSScreen.screens.first ?? NSScreen.main)?.visibleFrame
            ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        return NSPoint(x: area.maxX - size.width - margin, y: area.minY + margin)
    }

    /// Almeno metà della finestra deve cadere su uno schermo.
    static func isReasonablyVisible(_ frame: NSRect) -> Bool {
        let total = frame.width * frame.height
        guard total > 0 else { return false }
        for s in NSScreen.screens {
            let i = s.frame.intersection(frame)
            if !i.isNull, i.width * i.height >= total / 2 { return true }
        }
        return false
    }

    /// Se uno schermo è stato scollegato, riporta la finestra in posizione iniziale.
    func keepOnScreen() {
        let frame = panel.frame
        let screen = NSScreen.screens.max {
            let a = $0.visibleFrame.intersection(frame), b = $1.visibleFrame.intersection(frame)
            return (a.isNull ? 0 : a.width*a.height) < (b.isNull ? 0 : b.width*b.height)
        }
        guard let area = screen?.visibleFrame else { return }
        let origin = Self.isReasonablyVisible(frame)
            ? Self.containedOrigin(frame:frame,area:area) : Self.defaultOrigin(for:frame.size)
        if origin != frame.origin { panel.setFrameOrigin(origin); onMoved?(origin) }
    }
    static func containedOrigin(frame: CGRect, area: CGRect) -> CGPoint {
        CGPoint(x:min(max(frame.minX,area.minX),max(area.minX,area.maxX-frame.width)),
                y:min(max(frame.minY,area.minY),max(area.minY,area.maxY-frame.height)))
    }

    // MARK: animazione e visibilità

    func play(_ animation: Animation) {
        lastAnimation = animation
        if panel.isVisible { animator.play(perching ? perch?.displayed(singing:isSinging) ?? animation : animation) }
    }

    var isShown: Bool { panel.isVisible }

    func show() {
        panel.orderFrontRegardless()           // senza attivare l'app
        if let a = lastAnimation { play(a) }
        updateMouseTransparency()
    }

    func hide() {
        animator.stop()
        panel.orderOut(nil)
        panel.ignoresMouseEvents = false
        updatePassThroughTimer()
    }

    // MARK: clic che attraversano le zone trasparenti

    /// Le zone senza pixel lasciano passare il mouse alle finestre sotto: quando
    /// il cursore è sopra un pixel vuoto del fotogramma la finestra ignora il
    /// mouse, appena torna sopra il personaggio lo riprende. Serve osservare i
    /// movimenti del mouse anche quando la finestra non li riceve.
    func updateMouseTransparency() {
        guard panel.isVisible else { return }
        // Un cambio di fotogramma non deve interrompere il trascinamento in corso.
        if view.isDragging {
            panel.ignoresMouseEvents = false
            updatePassThroughTimer()
            return
        }
        let p = NSEvent.mouseLocation
        if panel.frame.contains(p) {
            let inView = view.convert(panel.convertPoint(fromScreen: p), from: nil)
            let ignore = !view.isOpaque(at: inView)
            if panel.ignoresMouseEvents != ignore { panel.ignoresMouseEvents = ignore }
        } else if panel.ignoresMouseEvents {
            panel.ignoresMouseEvents = false
        }
        updatePassThroughTimer()
    }

    /// Finché la finestra ignora il mouse non è detto che gli eventi di
    /// movimento arrivino (dipende dal sistema): per non restare mai "sorda" sopra
    /// il personaggio, in quel solo caso si controlla la posizione 20 volte al secondo.
    private func updatePassThroughTimer() {
        if panel.ignoresMouseEvents && panel.isVisible {
            guard passThroughTimer == nil else { return }
            let t = Timer(timeInterval: 0.05, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.updateMouseTransparency() }
            }
            RunLoop.main.add(t, forMode: .common)
            passThroughTimer = t
        } else {
            passThroughTimer?.invalidate()
            passThroughTimer = nil
        }
    }

    private func installMouseMonitors() {
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved]) { [weak self] _ in
            MainActor.assumeIsolated { self?.updateMouseTransparency() }
        }
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved]) { [weak self] event in
            MainActor.assumeIsolated { self?.updateMouseTransparency() }
            return event
        }
    }
}
