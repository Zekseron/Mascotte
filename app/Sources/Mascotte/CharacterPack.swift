import Foundation

// Modello del pacchetto personaggio `mascotte-pack/1` (vedi DESIGN.md).
// La validazione riproduce quella del visore (viewer/pack.js): stessi
// controlli, stessi default, stessi messaggi (in italiano).

struct FrameSize: Equatable {
    let width: Int
    let height: Int
}

struct Bubble: Equatable {
    let x: Double
    let y: Double
}

/// Un'animazione già normalizzata: `frames` è sempre una lista di colonne.
struct Animation: Equatable {
    let row: Int
    let frames: [Int]
    let fps: Double
    let durations: [Double]?
    let loop: Bool
    var frameRows: [Int]? = nil
}

struct Perch {
    let animation: Animation
    let anchor: Bubble
    var singing: Animation? = nil

    func displayed(singing enabled: Bool) -> Animation { enabled ? singing ?? animation : animation }
}

struct CharacterPack {
    static let format = "mascotte-pack/1"
    /// Default del formato (identici a quelli del visore).
    static let defaultScale = 4
    static let defaultFps = 8.0
    static let defaultLoop = true
    static let fpsRange = 1.0...30.0
    /// Protezione: "frames": 1000000000 non deve riempire la memoria.
    static let maxFrames = 1000
    static let maxScale = 8
    static let maxFrameSize = 512
    static let maxDisplaySize = 2048

    let id: String
    let name: String
    let author: String
    let license: String
    let sheet: String
    let frame: FrameSize
    let scale: Int
    let bubble: Bubble
    let animations: [String: Animation]
    let fallbacks: [String: String]
    var perch: Perch? = nil
    var pixelRatio: Int = 1
}

struct PackValidation {
    var errors: [String] = []
    var warnings: [String] = []
    /// Presente solo se non ci sono errori.
    var pack: CharacterPack?
}

enum PackValidator {
    private static let topFields: Set<String> = [
        "format", "id", "name", "author", "license", "sheet", "frame",
        "scale", "bubble", "animations", "fallbacks", "perch", "pixelRatio",
    ]
    private static let animFields: Set<String> = ["row", "frames", "fps", "durations", "loop", "frameRows"]

    // MARK: lettura del JSON

    /// Legge un character.json (toglie l'eventuale BOM). Ritorna il valore o il messaggio d'errore.
    static func parseJSON(_ data: Data) -> (json: Any?, error: String?) {
        var bytes = data
        if bytes.starts(with: [0xEF, 0xBB, 0xBF]) { bytes = bytes.dropFirst(3) }
        do {
            let value = try JSONSerialization.jsonObject(with: bytes, options: [.fragmentsAllowed])
            return (value, nil)
        } catch {
            return (nil, "character.json non è un JSON valido (\(error.localizedDescription))")
        }
    }

    /// Misura di un PNG dall'intestazione IHDR; nil se non è un PNG.
    static func pngSize(_ data: Data) -> (width: Int, height: Int)? {
        let b = [UInt8](data.prefix(24))
        guard b.count >= 24 else { return nil }
        let sig: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
        guard Array(b[0..<8]) == sig else { return nil }
        guard String(decoding: b[12..<16], as: UTF8.self) == "IHDR" else { return nil }
        func u32(_ o: Int) -> Int {
            (Int(b[o]) << 24) | (Int(b[o + 1]) << 16) | (Int(b[o + 2]) << 8) | Int(b[o + 3])
        }
        return (u32(16), u32(20))
    }

    // MARK: utilità sui valori JSON

    private enum Kind {
        case null, bool(Bool), number(Double), string(String), array([Any]), object([String: Any])
    }

    private static func kind(of v: Any) -> Kind {
        if v is NSNull { return .null }
        if let n = v as? NSNumber {
            if CFGetTypeID(n) == CFBooleanGetTypeID() { return .bool(n.boolValue) }
            return .number(n.doubleValue)
        }
        if let s = v as? String { return .string(s) }
        if let a = v as? [Any] { return .array(a) }
        if let o = v as? [String: Any] { return .object(o) }
        return .null
    }

    private static func kindName(_ v: Any) -> String {
        switch kind(of: v) {
        case .null: return "null"
        case .array: return "una lista"
        case .object: return "un oggetto"
        case .string: return "un testo"
        case .number: return "un numero"
        case .bool: return "vero/falso"
        }
    }

    /// Come mostrare un valore trovato nel file dentro un messaggio.
    private static func found(_ v: Any) -> String {
        let s: String
        switch kind(of: v) {
        case .null, .array, .object: return kindName(v)
        case .bool(let b): s = b ? "true" : "false"
        case .number(let d): s = number(d)
        case .string(let t):
            if let data = try? JSONSerialization.data(withJSONObject: t, options: [.fragmentsAllowed]) {
                s = String(decoding: data, as: UTF8.self)
            } else { s = "\"\(t)\"" }
        }
        return s.count > 40 ? String(s.prefix(37)) + "…" : s
    }

    private static func number(_ d: Double) -> String {
        if d.isFinite, d == d.rounded(), abs(d) < 1e15 { return String(Int(d)) }
        return "\(d)"
    }

    /// Intero "sicuro": finito, senza decimali e entro 2^53 (oltre non si arriva a un Int utile).
    private static func integer(_ v: Any) -> Int? {
        guard case .number(let d) = kind(of: v), d.isFinite, d == d.rounded(),
              abs(d) <= 9_007_199_254_740_991 else { return nil }
        return Int(d)
    }

    private static func rangeLabel(_ n: Int, _ one: String, _ many: String) -> String {
        if n <= 0 { return "nessuna \(one) intera" }
        if n == 1 { return "\(one) 0" }
        return "\(many) 0-\(n - 1)"
    }

    static func slug(_ text: String) -> String {
        let stripped = String(String.UnicodeScalarView(
            text.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x300...0x36F).contains($0.value) }))
        var out = ""
        var lastDash = true
        for ch in stripped.lowercased() {
            if ch.isASCII, ch.isLetter || ch.isNumber {
                out.append(ch); lastDash = false
            } else if !lastDash {
                out.append("-"); lastDash = true
            }
        }
        while out.hasSuffix("-") { out.removeLast() }
        return out
    }

    /// Il foglio deve stare nella cartella del pacchetto: niente indirizzi,
    /// percorsi assoluti o "..". Ritorna il problema, o nil se va bene.
    static func sheetPathProblem(_ sheet: String) -> String? {
        if sheet.range(of: "^[A-Za-z][A-Za-z0-9+.-]*:", options: .regularExpression) != nil || sheet.hasPrefix("//") {
            return "deve essere un nome di file relativo alla cartella del pacchetto, non un indirizzo"
        }
        if sheet.hasPrefix("/") || sheet.hasPrefix("\\") {
            return "deve essere un percorso relativo alla cartella del pacchetto, non assoluto"
        }
        if sheet.split(whereSeparator: { $0 == "/" || $0 == "\\" }).contains("..") {
            return "non può uscire dalla cartella del pacchetto (niente \"..\")"
        }
        return nil
    }

    // MARK: validazione

    /// Controlla un character.json già letto rispetto alla misura del foglio
    /// PNG e lo normalizza. Con `sheetWidth`/`sheetHeight` nil i controlli sul
    /// foglio vengono saltati. `folderName` serve come id se manca.
    static func validate(_ json: Any, sheetWidth: Int?, sheetHeight: Int?,
                         folderName: String?, spec: StatesSpec) -> PackValidation {
        var errors: [String] = []
        var warnings: [String] = []
        var result = PackValidation()

        guard case .object(let obj) = kind(of: json) else {
            result.errors = ["character.json: deve contenere un oggetto JSON (trovato: \(found(json)))"]
            return result
        }

        for key in obj.keys.sorted() where !topFields.contains(key) {
            warnings.append("\(key): campo sconosciuto, ignorato")
        }

        // format
        if let f = obj["format"] {
            if case .string(let s) = kind(of: f), s == CharacterPack.format {} else {
                errors.append("format: deve essere \"\(CharacterPack.format)\" (trovato: \(found(f)))")
            }
        } else {
            errors.append("format: obbligatorio (deve essere \"\(CharacterPack.format)\")")
        }

        // name, author, license, id
        var name = ""
        if let n = obj["name"] {
            if case .string(let s) = kind(of: n), !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                name = s.trimmingCharacters(in: .whitespacesAndNewlines)
            } else {
                errors.append("name: deve essere un testo non vuoto (trovato: \(found(n)))")
            }
        } else {
            errors.append("name: obbligatorio")
        }
        let author = optionalText(obj, "author", &warnings)
        let license = optionalText(obj, "license", &warnings)
        var id = optionalText(obj, "id", &warnings)
        if id.isEmpty {
            id = folderName.flatMap { $0.isEmpty ? nil : $0 } ?? { let s = slug(name); return s.isEmpty ? "personaggio" : s }()
        }

        // sheet
        var sheet = ""
        if let s = obj["sheet"] {
            if case .string(let t) = kind(of: s), !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                let trimmed = t.trimmingCharacters(in: .whitespacesAndNewlines)
                if let problem = sheetPathProblem(trimmed) {
                    errors.append("sheet: \(problem)")
                } else {
                    sheet = trimmed
                    if !sheet.lowercased().hasSuffix(".png") {
                        warnings.append("sheet: \"\(sheet)\" non ha l'estensione .png")
                    }
                }
            } else {
                errors.append("sheet: deve essere il nome di un file PNG (trovato: \(found(s)))")
            }
        } else {
            errors.append("sheet: obbligatorio (nome del PNG, relativo alla cartella)")
        }

        // frame e misura del foglio
        let frame = readFrame(obj, &errors, &warnings)
        var cols: Int?
        var rows: Int?
        if let frame, let w = sheetWidth, let h = sheetHeight, w > 0, h > 0 {
            if w % frame.width != 0 {
                errors.append("sheet: la larghezza del PNG (\(w) px) non è un multiplo della larghezza del fotogramma (\(frame.width) px)")
            }
            if h % frame.height != 0 {
                errors.append("sheet: l'altezza del PNG (\(h) px) non è un multiplo dell'altezza del fotogramma (\(frame.height) px)")
            }
            cols = w / frame.width
            rows = h / frame.height
        }

        // scale
        var pixelRatio = 1
        if let raw = obj["pixelRatio"] {
            if let value = integer(raw), (1...8).contains(value) { pixelRatio = value }
            else { errors.append("pixelRatio: deve essere un intero da 1 a 8") }
        }
        var scale = CharacterPack.defaultScale
        if let s = obj["scale"] {
            if let i = integer(s), (1...CharacterPack.maxScale).contains(i) { scale = i }
            else { errors.append("scale: deve essere un intero da 1 a \(CharacterPack.maxScale) (trovato: \(found(s)))") }
        }
        if let frame, max(frame.width, frame.height) * scale / pixelRatio > CharacterPack.maxDisplaySize {
            errors.append("scale: il fotogramma ingrandito non può superare \(CharacterPack.maxDisplaySize) punti per lato")
        }

        let bubble = readBubble(obj, frame, &errors, &warnings)

        // animations
        var animations: [String: Animation] = [:]
        if let a = obj["animations"] {
            if case .object(let dict) = kind(of: a) {
                for key in dict.keys.sorted() {
                    guard spec.isKnown(key) else {
                        warnings.append("animations.\(key): stato sconosciuto, ignorato")
                        continue
                    }
                    if let anim = readAnimation(key, dict[key]!, cols, rows, &errors, &warnings) {
                        animations[key] = anim
                    }
                }
                if dict["idle"] == nil {
                    errors.append("animations.idle: obbligatorio, senza lo stato \"idle\" il pacchetto non si carica")
                }
            } else {
                errors.append("animations: deve essere un oggetto {stato: animazione} (trovato: \(found(a)))")
            }
        } else {
            errors.append("animations: obbligatorio (almeno lo stato idle)")
        }

        // fallbacks
        var fallbacks: [String: String] = [:]
        if let f = obj["fallbacks"] {
            if case .object(let dict) = kind(of: f) {
                for key in dict.keys.sorted() {
                    let target = dict[key]!
                    if !spec.isKnown(key) {
                        warnings.append("fallbacks.\(key): stato sconosciuto, ignorato")
                    } else if key == "idle" {
                        warnings.append("fallbacks.idle: \"idle\" è lo stato di base e non ha ripiego, ignorato")
                    } else if case .string(let t) = kind(of: target), spec.isKnown(t) {
                        if t == key {
                            errors.append("fallbacks.\(key): uno stato non può essere il proprio ripiego")
                        } else {
                            fallbacks[key] = t
                        }
                    } else {
                        errors.append("fallbacks.\(key): \(found(target)) non è uno stato noto")
                    }
                }
                var reported = Set<String>()
                for key in fallbacks.keys.sorted() {
                    if animations[key] != nil {
                        warnings.append("fallbacks.\(key): lo stato esiste già nel pacchetto, il ripiego non verrà usato")
                        continue
                    }
                    let w = StateResolver.walk(key, animations: Set(animations.keys), fallbacks: fallbacks, spec: spec)
                    if let cycle = w.cycle {
                        let sig = cycle.sorted().joined(separator: ",")
                        if reported.insert(sig).inserted {
                            warnings.append("fallbacks.\(key): ripiego circolare (\((cycle + [cycle[0]]).joined(separator: " → "))), si userà idle")
                        }
                    }
                }
            } else {
                errors.append("fallbacks: deve essere un oggetto {stato: stato di ripiego} (trovato: \(found(f)))")
            }
        }

        var perch: Perch?
        if let raw = obj["perch"] {
            if let data = raw as? [String: Any], let animationRaw = data["animation"],
               let animation = readAnimation("idle", animationRaw, cols, rows, &errors, &warnings),
               let anchor = data["anchor"] as? [String: Any],
               let rawX=anchor["x"], let rawY=anchor["y"], case .number(let x)=kind(of:rawX), case .number(let y)=kind(of:rawY),
               x.isFinite, y.isFinite, let frame, x >= 0, x <= Double(frame.width), y >= 0, y <= Double(frame.height) {
                perch = Perch(animation: animation, anchor: Bubble(x: x,y: y))
                if let rawSinging = data["singing"] {
                    perch?.singing = readAnimation("perch.singing", rawSinging, cols, rows, &errors, &warnings)
                }
            } else { errors.append("perch: animazione o punto di appoggio non valido") }
        }
        result.errors = errors
        result.warnings = warnings
        if errors.isEmpty, let frame, let bubble {
            result.pack = CharacterPack(id: id, name: name, author: author, license: license, sheet: sheet,
                                        frame: frame, scale: scale, bubble: bubble,
                                        animations: animations, fallbacks: fallbacks)
            result.pack?.perch = perch
            result.pack?.pixelRatio = pixelRatio
        }
        return result
    }

    // MARK: parti

    private static func optionalText(_ obj: [String: Any], _ key: String, _ warnings: inout [String]) -> String {
        guard let v = obj[key] else { return "" }
        guard case .string(let s) = kind(of: v) else {
            warnings.append("\(key): deve essere un testo, ignorato (trovato: \(found(v)))")
            return ""
        }
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func readFrame(_ obj: [String: Any], _ errors: inout [String], _ warnings: inout [String]) -> FrameSize? {
        guard let f = obj["frame"] else {
            errors.append("frame: obbligatorio (con width e height in pixel)")
            return nil
        }
        guard case .object(let dict) = kind(of: f) else {
            errors.append("frame: deve essere un oggetto con width e height (trovato: \(found(f)))")
            return nil
        }
        for k in dict.keys.sorted() where k != "width" && k != "height" {
            warnings.append("frame.\(k): campo sconosciuto, ignorato")
        }
        var out: [String: Int] = [:]
        var ok = true
        for dim in ["width", "height"] {
            if let v = dict[dim] {
                if let i = integer(v), (1...CharacterPack.maxFrameSize).contains(i) { out[dim] = i }
                else {
                    errors.append("frame.\(dim): deve essere un intero da 1 a \(CharacterPack.maxFrameSize) pixel (trovato: \(found(v)))")
                    ok = false
                }
            } else {
                errors.append("frame.\(dim): obbligatorio")
                ok = false
            }
        }
        guard ok, let w = out["width"], let h = out["height"] else { return nil }
        return FrameSize(width: w, height: h)
    }

    private static func readBubble(_ obj: [String: Any], _ frame: FrameSize?,
                                   _ errors: inout [String], _ warnings: inout [String]) -> Bubble? {
        // Default: centro in alto del fotogramma. Se il fotogramma è invalido
        // l'errore è già stato segnalato e il pacchetto non verrà creato.
        let fallback = frame.map { Bubble(x: Double($0.width) / 2, y: 0) }
        guard let b = obj["bubble"] else { return fallback }
        guard case .object(let dict) = kind(of: b) else {
            errors.append("bubble: deve essere un oggetto con x e y in pixel (trovato: \(found(b)))")
            return fallback
        }
        for k in dict.keys.sorted() where k != "x" && k != "y" {
            warnings.append("bubble.\(k): campo sconosciuto, ignorato")
        }
        var out: [String: Double] = [:]
        var ok = true
        for axis in ["x", "y"] {
            if let v = dict[axis] {
                if case .number(let d) = kind(of: v), d.isFinite { out[axis] = d }
                else {
                    errors.append("bubble.\(axis): deve essere un numero di pixel (trovato: \(found(v)))")
                    ok = false
                }
            } else {
                errors.append("bubble.\(axis): obbligatorio se c'è bubble")
                ok = false
            }
        }
        guard ok, let x = out["x"], let y = out["y"] else { return fallback }
        if let frame {
            if x < 0 || x > Double(frame.width) {
                warnings.append("bubble.x: \(number(x)) è fuori dal fotogramma (0-\(frame.width))")
            }
            if y < 0 || y > Double(frame.height) {
                warnings.append("bubble.y: \(number(y)) è fuori dal fotogramma (0-\(frame.height))")
            }
        }
        return Bubble(x: x, y: y)
    }

    private static func readAnimation(_ state: String, _ a: Any, _ cols: Int?, _ rows: Int?,
                                      _ errors: inout [String], _ warnings: inout [String]) -> Animation? {
        let path = "animations.\(state)"
        guard case .object(let dict) = kind(of: a) else {
            errors.append("\(path): deve essere un oggetto con row e frames (trovato: \(found(a)))")
            return nil
        }
        for k in dict.keys.sorted() where !animFields.contains(k) {
            warnings.append("\(path).\(k): campo sconosciuto, ignorato")
        }

        // row
        var row: Int?
        if let r = dict["row"] {
            if let i = integer(r), i >= 0 {
                row = i
                if let rows, i >= rows {
                    errors.append("\(path).row: riga \(i) fuori dal foglio (\(rangeLabel(rows, "riga", "righe")))")
                }
            } else {
                errors.append("\(path).row: deve essere un intero da 0 in su (trovato: \(found(r)))")
            }
        } else {
            errors.append("\(path).row: obbligatorio")
        }

        // frames
        var frames: [Int]?
        if let f = dict["frames"] {
            switch kind(of: f) {
            case .number:
                if let n = integer(f), n >= 1 {
                    if n > CharacterPack.maxFrames {
                        errors.append("\(path).frames: troppi fotogrammi (massimo \(CharacterPack.maxFrames))")
                    } else {
                        frames = Array(0..<n)
                        if let cols, n > cols {
                            errors.append("\(path).frames: \(n) fotogrammi richiesti ma il foglio ha \(cols) colonne (\(rangeLabel(cols, "colonna", "colonne")))")
                        }
                    }
                } else {
                    errors.append("\(path).frames: deve essere un intero da 1 in su (trovato: \(found(f)))")
                }
            case .array(let list):
                if list.isEmpty {
                    errors.append("\(path).frames: la lista è vuota (serve almeno una colonna)")
                } else if list.count > CharacterPack.maxFrames {
                    errors.append("\(path).frames: troppe voci (massimo \(CharacterPack.maxFrames))")
                } else {
                    var ok = true
                    var parsed: [Int] = []
                    for (i, c) in list.enumerated() {
                        if let n = integer(c), n >= 0 { parsed.append(n) }
                        else {
                            errors.append("\(path).frames[\(i)]: deve essere una colonna intera da 0 in su (trovato: \(found(c)))")
                            ok = false
                        }
                    }
                    if ok {
                        frames = parsed
                        if let cols {
                            var seen = Set<Int>()
                            for c in parsed where c >= cols && seen.insert(c).inserted {
                                errors.append("\(path).frames: colonna \(c) fuori dal foglio (\(rangeLabel(cols, "colonna", "colonne")))")
                            }
                        }
                    }
                }
            default:
                errors.append("\(path).frames: deve essere un numero di fotogrammi o una lista di colonne (trovato: \(found(f)))")
            }
        } else {
            errors.append("\(path).frames: obbligatorio (un numero di fotogrammi o una lista di colonne)")
        }

        // fps
        var fps = CharacterPack.defaultFps
        if let v = dict["fps"] {
            if case .number(let d) = kind(of: v), d.isFinite {
                if CharacterPack.fpsRange.contains(d) { fps = d }
                else {
                    errors.append("\(path).fps: \(number(d)) fuori dall'intervallo \(Int(CharacterPack.fpsRange.lowerBound))-\(Int(CharacterPack.fpsRange.upperBound))")
                }
            } else {
                errors.append("\(path).fps: deve essere un numero da \(Int(CharacterPack.fpsRange.lowerBound)) a \(Int(CharacterPack.fpsRange.upperBound)) (trovato: \(found(v)))")
            }
        }

        // durations
        var durations: [Double]?
        if let v = dict["durations"] {
            if case .array(let list) = kind(of: v) {
                var ok = true
                var parsed: [Double] = []
                for (i, d) in list.enumerated() {
                    if case .number(let x) = kind(of: d), x.isFinite, x > 0 { parsed.append(x) }
                    else {
                        errors.append("\(path).durations[\(i)]: deve essere un numero positivo di millisecondi (trovato: \(found(d)))")
                        ok = false
                    }
                }
                if let frames, list.count != frames.count {
                    errors.append("\(path).durations: \(list.count) valori ma frames ne ha \(frames.count) (devono avere la stessa lunghezza)")
                    ok = false
                }
                if ok { durations = parsed }
            } else {
                errors.append("\(path).durations: deve essere una lista di millisecondi (trovato: \(found(v)))")
            }
        }

        // loop
        var loop = CharacterPack.defaultLoop
        if let v = dict["loop"] {
            if case .bool(let b) = kind(of: v) { loop = b }
            else { errors.append("\(path).loop: deve essere true o false (trovato: \(found(v)))") }
        }

        guard let row, let frames else { return nil }
        var result = Animation(row: row, frames: frames, fps: fps, durations: durations, loop: loop)
        if let raw = dict["frameRows"] {
            if let values = raw as? [Int], values.count == frames.count,
               values.allSatisfy({ $0 >= 0 && (rows == nil || $0 < rows!) }),
               case .array(let list) = kind(of: raw), list.allSatisfy({ integer($0) != nil }) {
                result.frameRows = values
            } else { errors.append("\(path).frameRows: serve una riga valida per ogni fotogramma") }
        }
        return result
    }
}
