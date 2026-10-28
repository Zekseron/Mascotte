// Helper Mac per l'aggancio alla finestra attiva. Stesso protocollo di window-helper.ps1:
// righe JSON {status,x,y,width,height} su stdout (circa 30 Hz, solo quando cambiano);
// su stdin accetta pause / resume / stop. Legge solo ID, PID, stato e bounds delle finestre
// (CGWindowList senza nomi né immagini): non serve il permesso «Registrazione schermo».
// Le coordinate CG sono in punti con origine in alto a sinistra dello schermo principale,
// le stesse del modulo `screen` di Electron. Opzione --once: una sola lettura, per i test.
import AppKit
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
let hostPID = Int32(ProcessInfo.processInfo.environment["MASCOTTE_HOST_PID"] ?? "") ?? 0
let ownPID = ProcessInfo.processInfo.processIdentifier
let once = CommandLine.arguments.contains("--once")

func emit(_ json: String) { print(json); fflush(stdout) }
func number(_ info: [String: Any], _ key: CFString) -> Int? { (info[key as String] as? NSNumber)?.intValue }
func bounds(_ info: [String: Any]) -> CGRect? {
    guard let dict = info[kCGWindowBounds as String] as? [String: Any],
          let rect = CGRect(dictionaryRepresentation: dict as CFDictionary), rect.width > 0, rect.height > 0 else { return nil }
    return rect
}
func isOwn(_ pid: Int32) -> Bool { pid == hostPID || pid == ownPID }

/// Finestra normale (layer 0) più in alto dell'app in primo piano, esclusa Mascotte stessa.
func pickTarget() -> (id: Int, pid: Int32)? {
    let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
    guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
    for info in list {
        guard let pid = number(info, kCGWindowOwnerPID).map({ Int32($0) }), !isOwn(pid), number(info, kCGWindowLayer) == 0,
              let id = number(info, kCGWindowNumber), let rect = bounds(info), rect.width > 100, rect.height > 60 else { continue }
        if let front, !isOwn(front), pid != front { continue }
        return (id, pid)
    }
    return nil
}

/// Stato della finestra scelta: closed (sparita o PID diverso), hidden (ridotta, nascosta, su un'altra scrivania), visible.
/// Con «Nascondi» (Cmd+H) la finestra sparisce dall'elenco finché l'app non torna: si guarda l'app, altrimenti si aggancerebbe una chiusura falsa.
func state(of target: (id: Int, pid: Int32)) -> String {
    guard let list = CGWindowListCopyWindowInfo(.optionIncludingWindow, CGWindowID(target.id)) as? [[String: Any]],
          let info = list.first(where: { number($0, kCGWindowNumber) == target.id }),
          number(info, kCGWindowOwnerPID).map({ Int32($0) }) == target.pid else {
        if let app = NSRunningApplication(processIdentifier: target.pid), !app.isTerminated, app.isHidden { return "{\"status\":\"hidden\"}" }
        return "{\"status\":\"closed\"}"
    }
    guard (info[kCGWindowIsOnscreen as String] as? Bool) == true, let r = bounds(info) else { return "{\"status\":\"hidden\"}" }
    return "{\"status\":\"visible\",\"x\":\(Int(r.minX.rounded())),\"y\":\(Int(r.minY.rounded())),\"width\":\(Int(r.width.rounded())),\"height\":\(Int(r.height.rounded()))}"
}

// Opzione --list: elenco delle finestre normali visibili (ID, nome dell'app e dimensioni, senza titoli né immagini),
// per filtrare l'elenco dell'osservazione: scarta le miniature di Stage Manager e le finestre di servizio.
if CommandLine.arguments.contains("--list") {
    let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    var rows: [String] = []
    for info in list {
        guard number(info, kCGWindowLayer) == 0, let id = number(info, kCGWindowNumber), let r = bounds(info),
              let pid = number(info, kCGWindowOwnerPID).map({ Int32($0) }), !isOwn(pid) else { continue }
        let owner = (info[kCGWindowOwnerName as String] as? String) ?? ""
        let data = try? JSONSerialization.data(withJSONObject: ["id": id, "owner": owner, "width": Int(r.width), "height": Int(r.height)])
        if let data, let row = String(data: data, encoding: .utf8) { rows.append(row) }
    }
    emit("[" + rows.joined(separator: ",") + "]")
    exit(0)
}

if once {
    if let t = pickTarget() { emit(state(of: t)) } else { emit("{\"status\":\"unavailable\"}") }
    exit(0)
}

// Dopo la chiusura del menu di Mascotte il primo piano può passare un attimo a Mascotte o al Dock:
// si aspetta (fino a 5 s) che torni l'app dell'utente, invece di considerarlo un aggancio fallito.
var target: (id: Int, pid: Int32)?
for _ in 0..<50 {
    // frontmostApplication si aggiorna solo con il run loop attivo.
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
    if let t = pickTarget() { target = t; break }
}
guard let target else { emit("{\"status\":\"unavailable\"}"); exit(0) }

nonisolated(unsafe) var paused = false
nonisolated(unsafe) var stopped = false
let lock = NSLock()
Thread.detachNewThread {
    while let line = readLine() {
        lock.lock()
        if line == "stop" { stopped = true } else if line == "pause" { paused = true } else if line == "resume" { paused = false }
        lock.unlock()
        if line == "stop" { return }
    }
    lock.lock(); stopped = true; lock.unlock()   // stdin chiuso: il processo padre è terminato
}

var previous = ""
while true {
    lock.lock(); let stop = stopped, pause = paused; lock.unlock()
    if stop { exit(0) }
    if !pause {
        let json = state(of: target)
        if json != previous { emit(json); previous = json }
        if json.contains("\"closed\"") { exit(0) }
    }
    Thread.sleep(forTimeInterval: 1.0 / 30.0)
}
