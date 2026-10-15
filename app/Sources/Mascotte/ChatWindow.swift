import AppKit

final class MicroChatPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class ChatWindowController: NSObject, NSWindowDelegate, NSTextViewDelegate {
    let panel: MicroChatPanel
    private let store: ChatStore
    private let picker = NSPopUpButton(frame: .zero, pullsDown: false)
    private let transcript = NSTextView()
    private let input = NSTextView()
    private let placeholder = NSTextField(labelWithString: "Scrivi un messaggio…")
    private let status = NSTextField(labelWithString: "")
    private let spinner = NSProgressIndicator()
    private let sendButton = NSButton(title: "Invia", target: nil, action: nil)
    private let newButton = NSButton(title: "Nuova", target: nil, action: nil)
    private var engine: ChatEngine
    private var conversation: ChatConversation
    private var drafts: [ChatEngine: String] = [:]
    private var currentRun: ChatRun?
    var onActivity: ((String) -> Void)?
    var isBusy: Bool { currentRun != nil }

    init(store: ChatStore = ChatStore()) {
        self.store = store
        engine = Settings.chatEngine
        conversation = store.conversation(for: Settings.chatEngine)
        panel = MicroChatPanel(contentRect: NSRect(x: 0, y: 0, width: 380, height: 430),
                               styleMask: [.titled, .closable, .resizable, .utilityWindow], backing: .buffered, defer: false)
        super.init()
        panel.title = "Mascotte · micro chat"
        panel.minSize = NSSize(width: 340, height: 370)
        panel.maxSize = NSSize(width: 640, height: 760)
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.delegate = self
        buildUI()
        render()
        updateControls()
    }

    private func buildUI() {
        let background = NSVisualEffectView()
        background.material = .popover
        background.blendingMode = .behindWindow
        background.state = .active
        panel.contentView = background
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        background.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: background.leadingAnchor, constant: 14),
            stack.trailingAnchor.constraint(equalTo: background.trailingAnchor, constant: -14),
            stack.topAnchor.constraint(equalTo: background.topAnchor, constant: 12),
            stack.bottomAnchor.constraint(equalTo: background.bottomAnchor, constant: -12)
        ])
        let label = NSTextField(labelWithString: "Chat con")
        label.font = .systemFont(ofSize: 13, weight: .medium)
        picker.addItems(withTitles: ChatEngine.allCases.map(\.title))
        picker.selectItem(at: ChatEngine.allCases.firstIndex(of: engine) ?? 0)
        picker.target = self; picker.action = #selector(changeEngine)
        picker.setAccessibilityLabel("Intelligenza artificiale")
        newButton.bezelStyle = .rounded
        newButton.controlSize = .small
        newButton.target = self; newButton.action = #selector(newChat)
        newButton.toolTip = "Inizia una nuova conversazione con questa IA"
        newButton.setAccessibilityLabel("Nuova chat")
        let header = NSStackView(views: [label, picker, NSView(), newButton])
        header.orientation = .horizontal; header.spacing = 8
        stack.addArrangedSubview(header)
        header.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        picker.widthAnchor.constraint(equalToConstant: 125).isActive = true

        transcript.isEditable = false; transcript.isSelectable = true
        transcript.isRichText = false
        transcript.drawsBackground = false
        transcript.font = .systemFont(ofSize: 14)
        transcript.textContainerInset = NSSize(width: 10, height: 10)
        transcript.setAccessibilityLabel("Conversazione")
        let history = scrollView(for: transcript)
        history.drawsBackground = true
        history.backgroundColor = .textBackgroundColor
        history.wantsLayer = true; history.layer?.cornerRadius = 9; history.layer?.masksToBounds = true
        stack.addArrangedSubview(history)
        history.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        history.heightAnchor.constraint(greaterThanOrEqualToConstant: 140).isActive = true

        input.isRichText = false; input.font = .systemFont(ofSize: 14)
        input.drawsBackground = false
        input.textContainerInset = NSSize(width: 8, height: 8)
        input.delegate = self
        input.setAccessibilityLabel("Messaggio")
        let editor = scrollView(for: input)
        editor.drawsBackground = true; editor.backgroundColor = .textBackgroundColor
        editor.wantsLayer = true; editor.layer?.cornerRadius = 8; editor.layer?.masksToBounds = true
        stack.addArrangedSubview(editor)
        editor.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        editor.heightAnchor.constraint(equalToConstant: 68).isActive = true
        placeholder.font = .systemFont(ofSize: 14)
        placeholder.textColor = .placeholderTextColor
        placeholder.translatesAutoresizingMaskIntoConstraints = false
        editor.addSubview(placeholder)
        NSLayoutConstraint.activate([
            placeholder.leadingAnchor.constraint(equalTo: editor.leadingAnchor, constant: 13),
            placeholder.topAnchor.constraint(equalTo: editor.topAnchor, constant: 9)
        ])

        spinner.style = .spinning; spinner.controlSize = .small
        spinner.isDisplayedWhenStopped = false
        status.font = .systemFont(ofSize: 11)
        status.textColor = .secondaryLabelColor
        status.lineBreakMode = .byTruncatingTail
        sendButton.bezelStyle = .rounded
        sendButton.target = self; sendButton.action = #selector(sendOrStop)
        sendButton.setAccessibilityLabel("Invia messaggio")
        let controls = NSStackView(views: [spinner, status, NSView(), sendButton])
        controls.orientation = .horizontal; controls.spacing = 6
        stack.addArrangedSubview(controls)
        controls.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        sendButton.widthAnchor.constraint(equalToConstant: 94).isActive = true
        status.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        let hint = NSTextField(wrappingLabelWithString: "Usa il tuo account · Invio per inviare, ⇧Invio per andare a capo")
        hint.font = .systemFont(ofSize: 10)
        hint.textColor = .tertiaryLabelColor
        stack.addArrangedSubview(hint)
        hint.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
    }

    private func scrollView(for view: NSTextView) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true
        scroll.borderType = .noBorder
        view.isVerticallyResizable = true; view.isHorizontallyResizable = false
        view.autoresizingMask = [.width]
        view.textContainer?.widthTracksTextView = true
        view.textContainer?.containerSize = NSSize(width: 340, height: CGFloat.greatestFiniteMagnitude)
        scroll.documentView = view
        return scroll
    }

    func show(near mascot: NSRect) {
        if !panel.isVisible {
            let screen = NSScreen.screens.first { $0.frame.contains(NSPoint(x: mascot.midX, y: mascot.midY)) } ?? NSScreen.main
            let area = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
            let size = panel.frame.size
            var x = mascot.maxX + 10
            if x + size.width > area.maxX - 10 { x = mascot.minX - size.width - 10 }
            x = max(area.minX + 10, min(x, area.maxX - size.width - 10))
            let y = max(area.minY + 10, min(mascot.minY, area.maxY - size.height - 10))
            panel.setFrameOrigin(NSPoint(x: x, y: y))
        }
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        panel.makeFirstResponder(input)
    }

    @objc private func changeEngine() {
        guard !isBusy else { return }
        drafts[engine] = input.string
        engine = ChatEngine.allCases[max(0, picker.indexOfSelectedItem)]
        Settings.chatEngine = engine
        conversation = store.conversation(for: engine)
        input.string = drafts[engine] ?? ""
        render(); updateControls()
        panel.makeFirstResponder(input)
    }

    @objc private func newChat() {
        guard !isBusy else { return }
        conversation = ChatConversation()
        input.string = ""; drafts[engine] = ""
        save(); render(); updateControls()
        panel.makeFirstResponder(input)
    }

    @objc private func sendOrStop() {
        if let currentRun { currentRun.cancel(); status.stringValue = "Interruzione…"; sendButton.isEnabled = false; return }
        send()
    }

    private func send() {
        guard !isBusy else { return }
        let prompt = input.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else { return }
        guard prompt.count <= 8000, prompt.utf8.count <= 32_768 else { status.stringValue = "Messaggio troppo lungo (massimo 8.000 caratteri)."; return }
        guard let executable = ChatCLI.find(engine) else { status.stringValue = ChatFailure.unavailable(engine.title).localizedDescription; return }
        do { try store.prepareDirectory() }
        catch { status.stringValue = "Non riesco a preparare la conversazione."; return }
        conversation.messages.append(ChatMessage(role: "user", text: prompt))
        input.string = ""; drafts[engine] = ""
        save(); render()
        let run = ChatRun()
        currentRun = run
        updateControls()
        onActivity?("thinking")
        run.start(executable: executable, arguments: ChatProtocol.arguments(engine: engine, sessionID: conversation.sessionID),
                  environment: ChatCLI.environment(for: executable), directory: store.directory,
                  input: prompt, engine: engine) { [weak self] result in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.currentRun = nil
                switch result {
                case .success(let answer):
                    self.conversation.sessionID = answer.sessionID
                    self.conversation.messages.append(ChatMessage(role: "assistant", text: answer.text))
                    self.onActivity?("talk")
                case .failure(let error):
                    self.conversation.messages.append(ChatMessage(role: "notice", text: error.localizedDescription))
                    // Il testo resta recuperabile per un nuovo tentativo dopo errori o limiti.
                    self.input.string = prompt
                    self.onActivity?(error == .cancelled ? "idle" : "error")
                }
                self.save(); self.render(); self.updateControls()
                if self.panel.isVisible { self.panel.makeFirstResponder(self.input) }
            }
        }
    }

    private func save() {
        do { try store.save(conversation, for: engine) }
        catch { Log.warn("Micro chat: cronologia locale non salvata") }
    }

    private func render() {
        let text = NSMutableAttributedString(string: "")
        let body: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 14), .foregroundColor: NSColor.labelColor]
        if conversation.messages.isEmpty {
            text.append(NSAttributedString(string: "Ciao! Scegli un’IA e scrivimi qui.", attributes: [.font: NSFont.systemFont(ofSize: 14), .foregroundColor: NSColor.secondaryLabelColor]))
        }
        for message in conversation.messages {
            let title = message.role == "user" ? "Tu" : message.role == "assistant" ? engine.title : "Mascotte"
            let color: NSColor = message.role == "user" ? .systemBlue : message.role == "notice" ? .secondaryLabelColor : .labelColor
            text.append(NSAttributedString(string: title + "\n", attributes: [.font: NSFont.systemFont(ofSize: 12, weight: .semibold), .foregroundColor: color]))
            text.append(NSAttributedString(string: message.text + "\n\n", attributes: body))
        }
        transcript.textStorage?.setAttributedString(text)
        transcript.scrollRangeToVisible(NSRange(location: text.length, length: 0))
    }

    private func updateControls() {
        picker.isEnabled = !isBusy
        newButton.isEnabled = !isBusy
        input.isEditable = !isBusy
        placeholder.isHidden = !input.string.isEmpty
        sendButton.title = isBusy ? "Interrompi" : "Invia"
        sendButton.setAccessibilityLabel(isBusy ? "Interrompi risposta" : "Invia messaggio")
        sendButton.isEnabled = isBusy || (!input.string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && ChatCLI.find(engine) != nil)
        if isBusy { spinner.startAnimation(nil); status.stringValue = "\(engine.title) sta rispondendo…" }
        else {
            spinner.stopAnimation(nil)
            status.stringValue = ChatCLI.find(engine) == nil ? "\(engine.title) non disponibile" : "Pronto · \(engine.title)"
        }
    }

    func textDidChange(_ notification: Notification) { updateControls() }

    func textView(_ textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.insertNewline(_:)), !NSEvent.modifierFlags.contains(.shift) {
            send(); return true
        }
        if commandSelector == #selector(NSResponder.cancelOperation(_:)) { panel.close(); return true }
        return false
    }

    func windowWillClose(_ notification: Notification) { currentRun?.cancel() }
    func shutdown() { currentRun?.stopImmediately() }
}
