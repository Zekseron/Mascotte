import Foundation
import QuartzCore

/// Fa avanzare i fotogrammi di un'animazione usando un timer che scatta
/// esattamente quando cambia il fotogramma (rispetta `durations`).
/// Con `loop == false` si ferma sull'ultimo fotogramma.
@MainActor
final class Animator {
    /// Chiamato quando va mostrato un nuovo fotogramma.
    var onFrame: ((FrameSchedule.Entry) -> Void)?

    private var schedule = FrameSchedule(entries: [])
    private var loop = true
    private var startedAt: TimeInterval = 0
    private var shownIndex = -1
    private var timer: Timer?

    private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }

    var isRunning: Bool { timer != nil }

    func play(_ animation: Animation) {
        stop()
        schedule = FrameSchedule(animation)
        loop = animation.loop
        startedAt = now
        shownIndex = -1
        tick()
    }

    /// Ferma il timer (finestra nascosta). `play` ricomincia dal primo fotogramma.
    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        timer?.invalidate()
        timer = nil
        guard !schedule.isEmpty else { return }

        let elapsed = (now - startedAt) * 1000
        let r = schedule.frame(at: elapsed, loop: loop)
        if r.index != shownIndex {
            shownIndex = r.index
            onFrame?(schedule.entries[r.index])
        }
        if r.finished { return }                      // loop == false: resta sull'ultimo
        if loop && schedule.count == 1 { return }     // un solo fotogramma: niente da animare

        let total = schedule.totalMs
        let inCycle = loop ? elapsed.truncatingRemainder(dividingBy: total) : elapsed
        let nextStart = schedule.start(of: r.index + 1)
        let delay = max(0.004, (nextStart - inCycle) / 1000)
        let t = Timer(timeInterval: delay, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        t.tolerance = 0.002
        RunLoop.main.add(t, forMode: .common)   // .common: continua anche mentre un menu è aperto
        timer = t
    }
}
