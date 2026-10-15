import Foundation

/// Calendario dei fotogrammi di un'animazione: quale cella del foglio si
/// mostra e per quanti millisecondi. Porta di `frameSchedule`/`frameAt` di viewer/pack.js.
struct FrameSchedule {
    struct Entry: Equatable {
        let col: Int
        let row: Int
        let ms: Double
    }

    let entries: [Entry]

    init(entries: [Entry]) { self.entries = entries }

    /// `durations` (se ha la lunghezza giusta) prevale su `fps`.
    init(_ animation: Animation) {
        let fps = animation.fps.isFinite && animation.fps > 0 ? animation.fps : CharacterPack.defaultFps
        let durations = animation.durations?.count == animation.frames.count ? animation.durations : nil
        let rows = animation.frameRows?.count == animation.frames.count ? animation.frameRows : nil
        entries = animation.frames.enumerated().map { i, col in
            let d = durations?[i] ?? .nan
            return Entry(col: col, row: rows?[i] ?? animation.row, ms: d.isFinite && d > 0 ? d : 1000 / fps)
        }
    }

    var count: Int { entries.count }
    var isEmpty: Bool { entries.isEmpty }

    /// Durata di un giro completo, in ms.
    var totalMs: Double { entries.reduce(0) { $0 + $1.ms } }

    /// Istante (ms dall'inizio) in cui comincia il fotogramma `index`
    /// (per `index == count` è la durata totale).
    func start(of index: Int) -> Double {
        var t = 0.0
        for i in 0..<min(max(index, 0), entries.count) { t += entries[i].ms }
        return t
    }

    /// Quale fotogramma si vede dopo `elapsedMs`. Con `loop == false` si ferma
    /// sull'ultimo (`finished == true`).
    func frame(at elapsedMs: Double, loop: Bool) -> (index: Int, finished: Bool) {
        let n = entries.count
        if n == 0 { return (0, true) }
        let total = totalMs
        if !(total > 0) { return (0, !loop) }
        var t = max(0, elapsedMs.isFinite ? elapsedMs : 0)
        if t >= total {
            if !loop { return (n - 1, true) }
            t = t.truncatingRemainder(dividingBy: total)
        }
        var acc = 0.0
        for i in 0..<n {
            acc += entries[i].ms
            if t < acc { return (i, false) }
        }
        return (n - 1, !loop)
    }
}
