import AppKit
import QuartzCore

/// Disegna il personaggio: un CALayer con il foglio sprite come `contents`
/// e `contentsRect` sul fotogramma corrente, ingrandito senza sfocature
/// (filtro `nearest`). Gestisce anche mouse: trascinamento, clic, clic destro.
@MainActor
final class MascotView: NSView {
    // Eventi verso la finestra / l'app.
    var onDragBegan: (() -> Void)?
    var onDragEnded: (() -> Void)?
    var onClick: (() -> Void)?
    var onContextMenu: ((NSEvent) -> Void)?
    var onMouseMoved: (() -> Void)?

    let spriteLayer = CALayer()
    private var mask: AlphaMask?
    private var frameSize = FrameSize(width: 1, height: 1)
    private var sheetSize = (width: 1, height: 1)
    private(set) var currentEntry: FrameSchedule.Entry?

    // Trascinamento
    private var mouseDownScreen = NSPoint.zero
    private var originAtMouseDown = NSPoint.zero
    private(set) var isDragging = false
    private static let dragThreshold: CGFloat = 3

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layerContentsRedrawPolicy = .never
        configureLayer(spriteLayer)
        layer?.addSublayer(spriteLayer)
        addTrackingArea(NSTrackingArea(rect: .zero,
                                       options: [.mouseMoved, .mouseEnteredAndExited, .activeAlways, .inVisibleRect],
                                       owner: self, userInfo: nil))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("non usato") }

    private func configureLayer(_ l: CALayer) {
        l.magnificationFilter = .nearest     // pixel nitidi
        l.minificationFilter = .nearest
        l.contentsGravity = .resize
        l.allowsEdgeAntialiasing = false
        l.isOpaque = false
        l.backgroundColor = nil
        l.anchorPoint = .zero
    }

    override var isOpaque: Bool { false }
    override var mouseDownCanMoveWindow: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    // MARK: personaggio e fotogramma

    /// Imposta foglio, misura del fotogramma e ingrandimento (dimensione = fotogramma × scala).
    func configure(character: LoadedCharacter, scale: Int) {
        frameSize = character.pack.frame
        sheetSize = (character.sheet.width, character.sheet.height)
        mask = character.mask
        let unit = CGFloat(scale)/CGFloat(character.pack.pixelRatio)
        setFrameSize(NSSize(width: CGFloat(frameSize.width)*unit, height: CGFloat(frameSize.height)*unit))
        withoutAnimation {
            spriteLayer.contents = character.sheet
            spriteLayer.frame = bounds
            if let e = currentEntry { spriteLayer.contentsRect = contentsRect(for: e) }
        }
    }

    func show(_ entry: FrameSchedule.Entry) {
        currentEntry = entry
        withoutAnimation { spriteLayer.contentsRect = contentsRect(for: entry) }
    }

    /// Rettangolo del fotogramma nel foglio, in coordinate unitarie del layer
    /// (origine in basso a sinistra, y verso l'alto: la riga 0 è in cima al PNG).
    func contentsRect(for e: FrameSchedule.Entry) -> CGRect {
        Self.contentsRect(col: e.col, row: e.row, frame: frameSize,
                          sheetWidth: sheetSize.width, sheetHeight: sheetSize.height)
    }

    static func contentsRect(col: Int, row: Int, frame: FrameSize, sheetWidth: Int, sheetHeight: Int) -> CGRect {
        let w = CGFloat(sheetWidth), h = CGFloat(sheetHeight)
        let fw = CGFloat(frame.width), fh = CGFloat(frame.height)
        return CGRect(x: CGFloat(col) * fw / w,
                      y: 1 - CGFloat(row + 1) * fh / h,
                      width: fw / w,
                      height: fh / h)
    }

    private func withoutAnimation(_ body: () -> Void) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        body()
        CATransaction.commit()
    }

    override func layout() {
        super.layout()
        withoutAnimation { spriteLayer.frame = bounds }
    }

    override func viewDidChangeBackingProperties() {
        super.viewDidChangeBackingProperties()
        spriteLayer.contentsScale = window?.backingScaleFactor ?? 2
    }

    // MARK: zone trasparenti

    /// Il punto (coordinate della vista) cade su un pixel non trasparente del fotogramma corrente?
    func isOpaque(at p: NSPoint) -> Bool {
        guard let mask, let e = currentEntry, bounds.width > 0, bounds.height > 0,
              bounds.contains(p) else { return false }
        let sx = Int(p.x / bounds.width * CGFloat(frameSize.width))
        let sy = Int((bounds.height - p.y) / bounds.height * CGFloat(frameSize.height))
        guard sx >= 0, sy >= 0, sx < frameSize.width, sy < frameSize.height else { return false }
        return mask.alpha(x: e.col * frameSize.width + sx, y: e.row * frameSize.height + sy) > 0
    }

    // MARK: mouse

    override func mouseDown(with event: NSEvent) {
        if event.modifierFlags.contains(.control) {          // Ctrl+clic = clic destro
            onContextMenu?(event)
            return
        }
        isDragging = false
        mouseDownScreen = NSEvent.mouseLocation
        originAtMouseDown = window?.frame.origin ?? .zero
    }

    override func mouseDragged(with event: NSEvent) {
        guard let window else { return }
        let m = NSEvent.mouseLocation
        let dx = m.x - mouseDownScreen.x
        let dy = m.y - mouseDownScreen.y
        if !isDragging {
            guard hypot(dx, dy) >= Self.dragThreshold else { return }
            isDragging = true
            onDragBegan?()
        }
        // Posizione intera in punti: i pixel restano nitidi.
        window.setFrameOrigin(NSPoint(x: (originAtMouseDown.x + dx).rounded(),
                                      y: (originAtMouseDown.y + dy).rounded()))
    }

    override func mouseUp(with event: NSEvent) {
        if isDragging {
            isDragging = false
            onDragEnded?()
        } else if !event.modifierFlags.contains(.control) {
            onClick?()
        }
    }

    override func rightMouseDown(with event: NSEvent) {
        onContextMenu?(event)
    }

    override func mouseMoved(with event: NSEvent) { onMouseMoved?() }
    override func mouseEntered(with event: NSEvent) { onMouseMoved?() }
}
