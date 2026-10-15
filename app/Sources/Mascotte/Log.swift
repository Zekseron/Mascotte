import Foundation

/// Log semplice: stderr + file in ~/Library/Logs/Mascotte/mascotte.log.
/// Non lancia mai errori: se il file non è scrivibile si continua su stderr.
enum Log {
    static let directory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Logs/Mascotte", isDirectory: true)
    static let fileURL = directory.appendingPathComponent("mascotte.log")

    /// Se `false` (per esempio in --self-test) non scrive il file.
    static var writesFile = true
    /// Se `false` non stampa su stderr.
    static var writesStderr = true
    private static var handle: FileHandle?
    private static var opened = false
    private static let lock = NSLock()

    private static let formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static func info(_ message: String) { write("INFO ", message) }
    static func warn(_ message: String) { write("AVVISO", message) }
    static func error(_ message: String) { write("ERRORE", message) }

    private static func write(_ level: String, _ message: String) {
        lock.lock()
        defer { lock.unlock() }
        let line = "\(formatter.string(from: Date())) \(level) \(message)\n"
        // try?: un errore di scrittura (disco pieno…) non deve mai fermare l'app.
        if writesStderr { try? FileHandle.standardError.write(contentsOf: Data(line.utf8)) }
        guard writesFile else { return }
        openIfNeeded()
        try? handle?.write(contentsOf: Data(line.utf8))
    }

    private static func openIfNeeded() {
        if opened { return }
        opened = true
        let fm = FileManager.default
        do {
            try fm.createDirectory(at: directory, withIntermediateDirectories: true)
            // Niente file infiniti: oltre 1 MB si tiene una sola copia vecchia.
            if let size = (try? fm.attributesOfItem(atPath: fileURL.path))?[.size] as? NSNumber,
               size.intValue > 1_000_000 {
                let old = directory.appendingPathComponent("mascotte.log.old")
                try? fm.removeItem(at: old)
                try? fm.moveItem(at: fileURL, to: old)
            }
            if !fm.fileExists(atPath: fileURL.path) {
                fm.createFile(atPath: fileURL.path, contents: nil)
            }
            let h = try FileHandle(forWritingTo: fileURL)
            try h.seekToEnd()
            handle = h
        } catch {
            try? FileHandle.standardError.write(contentsOf: Data("Log su file non disponibile: \(error)\n".utf8))
        }
    }
}
