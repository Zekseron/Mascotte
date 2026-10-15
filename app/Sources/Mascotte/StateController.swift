import Foundation

/// Punto unico per cambiare lo stato della mascotte.
///
/// Il pezzo 3 (eventi dalle IA) chiamerà `set(_:source:hold:)`; adesso lo
/// chiamano il menu "Prova uno stato" (source "menu"), il mouse ("mouse"),
/// i timer interni ("timer") e l'avvio ("avvio").
///
/// Regole dei tempi (dichiarate qui, in un solo posto):
///  - `idle` e `sleep` restano finché non cambia qualcosa;
///  - dopo 5 minuti di `idle` senza interazioni si passa a `sleep`;
///  - gli altri stati tornano da soli a `idle`: `done`, `error`, `talk` dopo 4 s;
///    `celebrate` 1 s dopo la fine della sua animazione (se l'animazione non
///    è in ripetizione, altrimenti 5 s); tutti gli altri 5 s;
///  - `drag` dura quanto il trascinamento; la reazione al clic (`listening`)
///    dura 1,5 s e poi si torna allo stato di prima.
@MainActor
final class StateController {
    enum Hold {
        /// Regola predefinita dello stato (vedi sopra).
        case automatic
        case seconds(TimeInterval)
        /// Resta finché non arriva un altro `set`.
        case forever
    }

    /// Ciò che la finestra deve mostrare.
    struct Display {
        let requested: String
        let used: String
        let animation: Animation
        let source: String
    }

    /// Moltiplicatore di tutti i tempi: 1 in uso normale, più piccolo solo in --self-test.
    static var timeScale: Double = 1

    // Tempi (secondi).
    static let sleepAfterIdle: TimeInterval = 300
    static let clickReaction: TimeInterval = 1.5
    static let shortHold: TimeInterval = 4
    static let defaultHold: TimeInterval = 5
    static let celebrateExtra: TimeInterval = 1

    let spec: StatesSpec
    private(set) var pack: CharacterPack
    /// Stato richiesto (prima del ripiego) e stato effettivamente mostrato.
    private(set) var requested = "idle"
    private(set) var used = "idle"

    var onDisplay: ((Display) -> Void)?

    private var returnTimer: Timer?
    private var sleepTimer: Timer?
    private var dragging = false
    /// Stato da riprendere dopo trascinamento o reazione al clic.
    private var resumeState: String?

    init(spec: StatesSpec, pack: CharacterPack) {
        self.spec = spec
        self.pack = pack
    }

    // MARK: API pubblica

    /// Cambia stato. `source` è solo per il log ("menu", "mouse", "evento"…).
    func set(_ state: String, source: String, hold: Hold = .automatic) {
        guard spec.isKnown(state) else {
            Log.warn("Stato sconosciuto \"\(state)\" (da \(source)): ignorato")
            return
        }
        cancelTimers()
        resumeState = nil
        show(state, source: source)

        switch hold {
        case .forever:
            break
        case .seconds(let s):
            armReturn(after: s)
        case .automatic:
            if state == "idle" {
                armSleep()
            } else if let s = automaticHold(for: state) {
                armReturn(after: s)
            }
        }
    }

    /// Cambia il personaggio: lo stato corrente continua con le nuove animazioni.
    func setPack(_ newPack: CharacterPack) {
        pack = newPack
        show(requested, source: "personaggio")
    }

    /// Mostra di nuovo lo stato corrente (per esempio dopo aver riaperto la finestra).
    func refresh() { show(requested, source: "ripresa") }

    /// Un'azione dell'utente rimette a zero l'attesa per `sleep`.
    func noteInteraction() {
        if requested == "idle", !dragging { armSleep() }
    }

    // MARK: mouse

    func beginDrag() {
        guard !dragging else { return }
        dragging = true
        if requested != "drag", resumeState == nil { resumeState = requested }
        cancelTimers()
        show("drag", source: "mouse")
    }

    func endDrag() {
        guard dragging else { return }
        dragging = false
        // Se nel frattempo è arrivato un altro stato (evento), non lo sovrascrivo.
        guard requested == "drag" else { resumeState = nil; return }
        let back = resumeState ?? "idle"
        resumeState = nil
        // Trascinarla è un'interazione: se dormiva, si sveglia.
        set(back == "sleep" ? "idle" : back, source: "mouse")
    }

    /// Clic senza trascinamento: piccola reazione (`listening`, 1,5 s) e si torna
    /// allo stato di prima; se dormiva, la sveglia.
    func reactToClick() {
        if requested == "sleep" {
            set("idle", source: "mouse")
            return
        }
        let before = (requested == "drag") ? "idle" : requested
        cancelTimers()
        show("listening", source: "mouse")
        resumeState = before
        armReturn(after: Self.clickReaction, to: before)
    }

    // MARK: interno

    private func show(_ state: String, source: String) {
        requested = state
        let r = StateResolver.resolve(state, pack: pack, spec: spec)
        used = r.used
        guard let animation = pack.animations[r.used] else { return }   // idle è garantito dalla validazione
        if r.used != state {
            Log.info("Stato \(state) → \(r.used) (ripiego: \(r.chain.joined(separator: " → "))) [\(source)]")
        } else {
            Log.info("Stato \(state) [\(source)]")
        }
        onDisplay?(Display(requested: state, used: r.used, animation: animation, source: source))
    }

    private func automaticHold(for state: String) -> TimeInterval? {
        switch state {
        case "idle", "sleep", "drag":
            return nil
        case "done", "error", "talk":
            return Self.shortHold
        case "celebrate":
            if let a = pack.animations[used], !a.loop {
                return FrameSchedule(a).totalMs / 1000 + Self.celebrateExtra
            }
            return Self.defaultHold
        default:
            return Self.defaultHold
        }
    }

    private func armReturn(after seconds: TimeInterval, to target: String = "idle") {
        returnTimer?.invalidate()
        returnTimer = makeTimer(seconds) { [weak self] in
            self?.set(target, source: "timer")
        }
    }

    private func armSleep() {
        sleepTimer?.invalidate()
        sleepTimer = makeTimer(Self.sleepAfterIdle) { [weak self] in
            guard let self, self.requested == "idle" else { return }
            self.set("sleep", source: "timer")
        }
    }

    private func cancelTimers() {
        returnTimer?.invalidate(); returnTimer = nil
        sleepTimer?.invalidate(); sleepTimer = nil
    }

    private func makeTimer(_ seconds: TimeInterval, _ fire: @escaping @MainActor () -> Void) -> Timer {
        let t = Timer(timeInterval: max(0.002, seconds * Self.timeScale), repeats: false) { _ in
            MainActor.assumeIsolated { fire() }
        }
        RunLoop.main.add(t, forMode: .common)
        return t
    }
}
