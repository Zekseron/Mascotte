import Foundation

/// Elenco degli stati e ripieghi predefiniti, letto da spec/states.json
/// (fonte unica, come per il visore).
struct StatesSpec {
    struct State {
        let name: String
        let fallback: String?
        let description: String
    }

    /// Stati nell'ordine in cui compaiono nel file.
    let order: [String]
    let states: [String: State]
    let required: [String]
    /// Da dove è stato letto (per il log).
    var origin: String = "?"

    func isKnown(_ name: String) -> Bool { states[name] != nil }

    func defaultFallback(of name: String) -> String? { states[name]?.fallback }

    // MARK: lettura

    enum ParseError: Error, CustomStringConvertible {
        case invalid(String)
        var description: String {
            switch self { case .invalid(let m): return m }
        }
    }

    static func parse(_ data: Data, origin: String) throws -> StatesSpec {
        struct Raw: Decodable {
            struct Entry: Decodable {
                let fallback: String?
                let description: String?
            }
            let format: String
            let required: [String]?
            let states: [String: Entry]
        }
        let raw: Raw
        do { raw = try JSONDecoder().decode(Raw.self, from: data) }
        catch { throw ParseError.invalid("states.json non valido: \(error)") }
        guard raw.format == "mascotte-states/1" else {
            throw ParseError.invalid("states.json: format deve essere \"mascotte-states/1\" (trovato: \"\(raw.format)\")")
        }
        guard !raw.states.isEmpty else { throw ParseError.invalid("states.json: nessuno stato") }
        let required = raw.required ?? ["idle"]
        for r in required where raw.states[r] == nil {
            throw ParseError.invalid("states.json: lo stato obbligatorio \"\(r)\" non è definito")
        }
        for (name, entry) in raw.states {
            if let fb = entry.fallback, raw.states[fb] == nil {
                throw ParseError.invalid("states.json: il ripiego \"\(fb)\" di \"\(name)\" non è uno stato noto")
            }
        }

        // L'ordine delle chiavi di un oggetto JSON non sopravvive al
        // decoder: lo recupero dal testo (chiavi seguite da "{").
        let text = String(decoding: data, as: UTF8.self)
        var order: [String] = []
        if let re = try? NSRegularExpression(pattern: "\"([A-Za-z0-9_-]+)\"\\s*:\\s*\\{") {
            let ns = text as NSString
            for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
                let key = ns.substring(with: m.range(at: 1))
                if raw.states[key] != nil, !order.contains(key) { order.append(key) }
            }
        }
        for key in raw.states.keys.sorted() where !order.contains(key) { order.append(key) }

        var states: [String: State] = [:]
        for (name, entry) in raw.states {
            states[name] = State(name: name, fallback: entry.fallback, description: entry.description ?? "")
        }
        return StatesSpec(order: order, states: states, required: required, origin: origin)
    }

    // MARK: dove si trova states.json

    /// Cerca states.json in quest'ordine: risorse dell'app, MASCOTTE_ROOT/spec,
    /// percorso del progetto da cui è stato compilato, copia incorporata.
    static func load() -> StatesSpec {
        for (label, url) in candidateFiles() {
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            do {
                let data = try Data(contentsOf: url)
                return try parse(data, origin: "\(label): \(url.path)")
            } catch {
                Log.warn("\(url.path): \(error). Passo alla fonte successiva.")
            }
        }
        // La copia incorporata è verificata da --self-test: se non si legge è un errore di programma.
        return try! parse(Data(embeddedJSON.utf8), origin: "copia incorporata")
    }

    static func candidateFiles() -> [(String, URL)] {
        var list: [(String, URL)] = []
        if let res = Bundle.main.resourceURL {
            list.append(("risorse dell'app", res.appendingPathComponent("states.json")))
        }
        if let root = ProcessInfo.processInfo.environment["MASCOTTE_ROOT"], !root.isEmpty {
            list.append(("MASCOTTE_ROOT", URL(fileURLWithPath: (root as NSString).expandingTildeInPath)
                .appendingPathComponent("spec/states.json")))
        }
        list.append(("percorso del progetto", projectRoot().appendingPathComponent("spec/states.json")))
        return list
    }

    /// Radice del progetto dedotta da questo file sorgente
    /// (ROOT/app/Sources/Mascotte/StatesSpec.swift → ROOT). Vale solo per
    /// `swift run` sulla macchina in cui è stato compilato.
    static func projectRoot(file: String = #filePath) -> URL {
        URL(fileURLWithPath: file).deletingLastPathComponent() // Mascotte
            .deletingLastPathComponent() // Sources
            .deletingLastPathComponent() // app
            .deletingLastPathComponent() // ROOT
    }

    // MARK: copia incorporata (identica a spec/states.json; la controlla --self-test)

    static let embeddedJSON = """
    {
      "format": "mascotte-states/1",
      "required": ["idle"],
      "states": {
        "idle":      { "fallback": null,       "description": "Riposo: nessuna attività in corso" },
        "sleep":     { "fallback": "idle",     "description": "Nessuna attività da un po' di tempo" },
        "listening": { "fallback": "thinking", "description": "Hai appena scritto all'IA" },
        "thinking":  { "fallback": "idle",     "description": "L'IA sta ragionando" },
        "working":   { "fallback": "thinking", "description": "L'IA usa uno strumento" },
        "reading":   { "fallback": "working",  "description": "L'IA legge o cerca nei file" },
        "writing":   { "fallback": "working",  "description": "L'IA scrive o modifica file" },
        "running":   { "fallback": "working",  "description": "L'IA esegue un comando" },
        "waiting":   { "fallback": "idle",     "description": "Serve la tua attenzione: permesso o domanda" },
        "done":      { "fallback": "idle",     "description": "L'IA ha finito il turno" },
        "celebrate": { "fallback": "done",     "description": "Successo esplicito, per esempio test passati" },
        "error":     { "fallback": "idle",     "description": "Qualcosa è andato storto" },
        "talk":      { "fallback": "idle",     "description": "Mostra un fumetto con una risposta" },
        "look":      { "fallback": "thinking", "description": "Sta facendo un controllo visivo dello schermo" },
        "drag":      { "fallback": "idle",     "description": "La stai trascinando" }
      }
    }
    """
}
