import Foundation

/// Trova i personaggi installati e li ordina.
///
/// Elenchi, in quest'ordine (stesso id: vince il primo):
///  a. cartella indicata da MASCOTTE_CHARACTERS (se impostata);
///  b. ~/Library/Application Support/Mascotte/characters/;
///  c. characters dentro le risorse dell'app (Contents/Resources/characters).
/// Solo se non si trova nessun personaggio: cartella `characters` del
/// progetto (MASCOTTE_ROOT o percorso di compilazione), utile con `swift run`.
///
/// Un pacchetto è una cartella con character.json. `index.json`, se c'è,
/// dà solo l'ordine e il predefinito.
struct CharacterLibrary {
    struct Source {
        let label: String
        let url: URL
    }

    struct Message {
        enum Level { case info, warn, error }
        let level: Level
        let text: String
    }

    private(set) var characters: [LoadedCharacter] = []
    private(set) var defaultID: String?
    private(set) var messages: [Message] = []

    /// Cartella dove chiunque può aggiungere il proprio personaggio.
    static var userDirectory: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Mascotte/characters", isDirectory: true)
    }

    /// La crea se manca. Da chiamare all'avvio dell'app (non nei test).
    @discardableResult
    static func ensureUserDirectory() -> Bool {
        do {
            try FileManager.default.createDirectory(at: userDirectory, withIntermediateDirectories: true)
            return true
        } catch {
            Log.warn("Non riesco a creare \(userDirectory.path): \(error.localizedDescription)")
            return false
        }
    }

    static func standardSources() -> [Source] {
        var list: [Source] = []
        if let env = ProcessInfo.processInfo.environment["MASCOTTE_CHARACTERS"], !env.isEmpty {
            list.append(Source(label: "MASCOTTE_CHARACTERS",
                               url: URL(fileURLWithPath: (env as NSString).expandingTildeInPath, isDirectory: true)))
        }
        list.append(Source(label: "cartella dell'utente", url: userDirectory))
        if let res = Bundle.main.resourceURL {
            list.append(Source(label: "risorse dell'app", url: res.appendingPathComponent("characters", isDirectory: true)))
        }
        return list
    }

    static func developmentSource() -> Source {
        var root = StatesSpec.projectRoot()
        if let r = ProcessInfo.processInfo.environment["MASCOTTE_ROOT"], !r.isEmpty {
            root = URL(fileURLWithPath: (r as NSString).expandingTildeInPath, isDirectory: true)
        }
        return Source(label: "progetto (solo sviluppo)", url: root.appendingPathComponent("characters", isDirectory: true))
    }

    // MARK: ricerca

    static func discover(sources: [Source]? = nil, spec: StatesSpec) -> CharacterLibrary {
        var lib = CharacterLibrary()
        let list = sources ?? standardSources()
        var indexDefault: String?
        for s in list { lib.scan(s, spec: spec, indexDefault: &indexDefault) }
        if lib.characters.isEmpty, sources == nil {
            let dev = developmentSource()
            lib.messages.append(Message(level: .info,
                text: "Nessun personaggio negli elenchi standard: provo \(dev.url.path)"))
            lib.scan(dev, spec: spec, indexDefault: &indexDefault)
        }
        if let d = indexDefault, lib.characters.contains(where: { $0.id == d }) {
            lib.defaultID = d
        } else {
            lib.defaultID = lib.characters.first?.id
        }
        return lib
    }

    func character(id: String?) -> LoadedCharacter? {
        guard let id else { return nil }
        return characters.first { $0.id == id }
    }

    private mutating func scan(_ source: Source, spec: StatesSpec, indexDefault: inout String?) {
        let fm = FileManager.default
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: source.url.path, isDirectory: &isDir), isDir.boolValue else {
            return    // elenco assente: normale, non è un errore
        }

        // La cartella stessa è un pacchetto?
        if fm.fileExists(atPath: source.url.appendingPathComponent("character.json").path) {
            add(directory: source.url, source: source, spec: spec)
            return
        }

        let entries = (try? fm.contentsOfDirectory(at: source.url, includingPropertiesForKeys: [.isDirectoryKey],
                                                   options: [.skipsHiddenFiles])) ?? []
        var folders = entries.filter {
            ((try? $0.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false)
                && fm.fileExists(atPath: $0.appendingPathComponent("character.json").path)
        }
        // One category level; old flat packs still work. Never traverse symlinks.
        for category in entries where !folders.contains(category) {
            guard let values = try? category.resourceValues(forKeys: [.isDirectoryKey,.isSymbolicLinkKey]), values.isDirectory == true, values.isSymbolicLink != true else { continue }
            let nested = (try? fm.contentsOfDirectory(at: category, includingPropertiesForKeys: [.isDirectoryKey,.isSymbolicLinkKey], options: [.skipsHiddenFiles])) ?? []
            folders += nested.filter {
                let values = try? $0.resourceValues(forKeys: [.isDirectoryKey,.isSymbolicLinkKey])
                return values?.isDirectory == true && values?.isSymbolicLink != true && fm.fileExists(atPath:$0.appendingPathComponent("character.json").path)
            }
        }
        folders.sort { $0.lastPathComponent.localizedCaseInsensitiveCompare($1.lastPathComponent) == .orderedAscending }

        // index.json: ordine e predefinito.
        var ordered: [URL] = []
        let indexURL = source.url.appendingPathComponent("index.json")
        if fm.fileExists(atPath: indexURL.path) {
            if let idx = Self.readIndex(indexURL, messages: &messages) {
                if indexDefault == nil { indexDefault = idx.defaultID }
                for rel in idx.paths {
                    let url = source.url.appendingPathComponent(rel, isDirectory: true).standardizedFileURL
                    if let match = folders.first(where: { $0.standardizedFileURL.path == url.path }) {
                        if !ordered.contains(match) { ordered.append(match) }
                    } else {
                        messages.append(Message(level: .warn,
                            text: "\(indexURL.path): \"\(rel)\" non è una cartella con character.json, ignorato"))
                    }
                }
            }
        }
        for f in folders where !ordered.contains(f) { ordered.append(f) }
        for dir in ordered { add(directory: dir, source: source, spec: spec) }
    }

    private mutating func add(directory: URL, source: Source, spec: StatesSpec) {
        let r = CharacterLoader.load(directory: directory, source: source.label, spec: spec)
        for w in r.warnings {
            messages.append(Message(level: .warn, text: "\(directory.path): \(w)"))
        }
        guard let c = r.character else {
            messages.append(Message(level: .error,
                text: "Pacchetto ignorato \(directory.path): " + r.errors.joined(separator: "; ")))
            return
        }
        if let first = characters.first(where: { $0.id == c.id }) {
            messages.append(Message(level: .info,
                text: "Personaggio \"\(c.id)\" in \(directory.path) ignorato: c'è già quello di \(first.directory.path)"))
            return
        }
        characters.append(c)
        messages.append(Message(level: .info,
            text: "Personaggio \"\(c.id)\" (\(c.name)) caricato da \(directory.path) [\(source.label)]"))
    }

    // MARK: index.json (mascotte-index/1)

    struct Index {
        let defaultID: String?
        let paths: [String]
    }

    /// Regole: format "mascotte-index/1"; `path` relativo a characters/, senza "..".
    static func readIndex(_ url: URL, messages: inout [Message]) -> Index? {
        guard let data = try? Data(contentsOf: url),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            messages.append(Message(level: .warn, text: "\(url.path) non è un JSON valido: ordine alfabetico"))
            return nil
        }
        guard json["format"] as? String == "mascotte-index/1" else {
            messages.append(Message(level: .warn, text: "\(url.path): format deve essere \"mascotte-index/1\": ordine alfabetico"))
            return nil
        }
        var paths: [String] = []
        for case let entry as [String: Any] in (json["characters"] as? [Any]) ?? [] {
            guard let p = entry["path"] as? String, !p.isEmpty, !p.hasPrefix("/"),
                  !p.split(separator: "/").contains("..") else {
                messages.append(Message(level: .warn, text: "\(url.path): path non valido (\(entry["path"] ?? "mancante")), ignorato"))
                continue
            }
            paths.append(p)
        }
        return Index(defaultID: json["default"] as? String, paths: paths)
    }
}

/// `Mascotte --list-characters`: utile per capire perché un personaggio non compare.
@MainActor
enum CharacterListing {
    static func run() -> Int32 {
        let spec = StatesSpec.load()
        print("states.json: \(spec.origin)")
        print("Elenchi (in ordine di priorità):")
        for s in CharacterLibrary.standardSources() {
            var isDir: ObjCBool = false
            let exists = FileManager.default.fileExists(atPath: s.url.path, isDirectory: &isDir) && isDir.boolValue
            print("  - \(s.label): \(s.url.path)\(exists ? "" : "  (non esiste)")")
        }
        let lib = CharacterLibrary.discover(spec: spec)
        print("Messaggi:")
        for m in lib.messages {
            let tag: String
            switch m.level { case .info: tag = "info  "; case .warn: tag = "avviso"; case .error: tag = "ERRORE" }
            print("  [\(tag)] \(m.text)")
        }
        print("Personaggi (\(lib.characters.count)), predefinito: \(lib.defaultID ?? "nessuno"):")
        for c in lib.characters { print("  - \(c.id)  \"\(c.name)\"  \(c.directory.path)  [\(c.source)]") }
        return lib.characters.isEmpty ? 1 : 0
    }
}
