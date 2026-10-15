import AppKit
import Darwin

// Una CLI che chiude stdin non deve far terminare la mascotte durante una scrittura.
signal(SIGPIPE, SIG_IGN)

// Uso:
//   Mascotte                    avvia l'app (finestra + menu nella barra)
//   Mascotte --self-test        controlla la logica senza aprire finestre; esce con 0 (ok) o 1
//   Mascotte --list-characters  elenca i personaggi trovati e i messaggi della ricerca

// Server diagnostico isolato: endpoint fornito esplicitamente, porta casuale, niente GUI.
if let i = CommandLine.arguments.firstIndex(of: "--event-server-test"), i + 1 < CommandLine.arguments.count {
    Log.writesFile = false
    Log.writesStderr = false
    let path = CommandLine.arguments[i + 1]
    MainActor.assumeIsolated {
        let server = EventServer(port: 0, endpointURL: URL(fileURLWithPath: path), states: Set(StatesSpec.load().order)) { event in
            let data = try! JSONSerialization.data(withJSONObject: ["state": event.state, "source": event.source])
            print(String(decoding: data, as: UTF8.self))
            fflush(stdout)
        }
        signal(SIGTERM, SIG_IGN)
        let termination = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        termination.setEventHandler { server.stop(); exit(0) }
        termination.resume()
        server.start()
        withExtendedLifetime((server, termination)) { RunLoop.main.run() }
    }
    exit(0)
}

if CommandLine.arguments.contains("--self-test") {
    Log.writesFile = false
    Log.writesStderr = false
    exit(MainActor.assumeIsolated { SelfTest.run() })
}

if CommandLine.arguments.contains("--list-characters") {
    Log.writesFile = false
    exit(MainActor.assumeIsolated { CharacterListing.run() })
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.run()
}
