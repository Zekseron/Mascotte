import AppKit
import QuartzCore

/// `Mascotte --self-test`: controlla la logica senza aprire finestre e senza
/// XCTest. Stampa un esito per ogni verifica e termina con 0 (tutto bene) o 1.
@MainActor
final class SelfTest {
    private var passed = 0
    private var failed = 0

    static func run() -> Int32 {
        let t = SelfTest()
        t.runAll()
        print("")
        print("Self-test: \(t.passed + t.failed) verifiche, \(t.failed) fallite → \(t.failed == 0 ? "OK" : "FALLITO")")
        return t.failed == 0 ? 0 : 1
    }

    // MARK: strumenti

    private func check(_ name: String, _ ok: @autoclosure () -> Bool, _ detail: @autoclosure () -> String = "") {
        if ok() {
            passed += 1
            print("  ok     \(name)")
        } else {
            failed += 1
            let d = detail()
            print("  FALLITA \(name)\(d.isEmpty ? "" : " — \(d)")")
        }
    }

    private func section(_ title: String) { print("\n\(title)") }

    /// Fa girare il run loop finché la condizione è vera o scade il tempo.
    private func spin(timeout: TimeInterval, until condition: () -> Bool) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while !condition(), Date() < end {
            RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.005))
        }
        return condition()
    }

    private func wait(_ seconds: TimeInterval) {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end { RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.005)) }
    }

    // Pacchetto minimo valido: foglio 32×32 con fotogrammi 16×16.
    private let baseJSON = #"{"format":"mascotte-pack/1","name":"Prova","sheet":"s.png","frame":{"width":16,"height":16},"animations":{"idle":{"row":0,"frames":2}}}"#

    private func validate(_ mutate: (inout [String: Any]) -> Void = { _ in },
                          sheet: (Int, Int)? = (32, 32), spec: StatesSpec) -> PackValidation {
        var dict = (try? JSONSerialization.jsonObject(with: Data(baseJSON.utf8))) as? [String: Any] ?? [:]
        mutate(&dict)
        let data = (try? JSONSerialization.data(withJSONObject: dict)) ?? Data()
        let parsed = PackValidator.parseJSON(data)
        return PackValidator.validate(parsed.json ?? NSNull(), sheetWidth: sheet?.0, sheetHeight: sheet?.1,
                                      folderName: "cartella", spec: spec)
    }

    private func has(_ list: [String], _ fragment: String) -> Bool { list.contains { $0.contains(fragment) } }

    // MARK: tutto

    private func runAll() {
        let spec = testStates()
        let rosso = testRosso(spec: spec)
        testValidation(spec: spec)
        testFallbacks(spec: spec, rosso: rosso)
        testSchedule(rosso: rosso)
        testAnimator()
        if let rosso { testRendering(rosso) }
        if let rosso { testViewAndWindow(rosso) }
        testStateController(spec: spec, rosso: rosso)
        testLibrary(spec: spec)
        let catalog = CharacterLibrary.discover(sources:[CharacterLibrary.developmentSource()],spec:spec)
        check("categoria Cat trovata",catalog.character(id:"rosso")?.category == "Cat")
        testEventProtocol(spec: spec)
        section("Aggancio a Dock / finestra")
        check("cambio a personaggio alto mantiene tutta la figura nello schermo",MascotWindowController.containedOrigin(frame:CGRect(x:989,y:757,width:224,height:448),area:CGRect(x:0,y:40,width:1440,height:900)) == CGPoint(x:989,y:492))
        let area = CGRect(x: -1200, y: 40, width: 1200, height: 800)
        let edge = CGRect(x: -1100, y: 100, width: 600, height: 400)
        check("segue il bordo superiore su monitor a sinistra", AttachmentGeometry.origin(size: CGSize(width: 128,height: 128), edge: edge, area: area, fraction: 0.5) == CGPoint(x: -864,y: 500))
        check("finestra massimizzata: mascotte resta visibile", AttachmentGeometry.origin(size: CGSize(width: 128,height: 128), edge: area, area: area, fraction: 1) == CGPoint(x: -128,y: 712))
        check("coordinate Quartz convertite anche sopra il monitor principale", AttachmentGeometry.appKitRect(CGRect(x: -500,y: -300,width: 400,height: 200),primaryHeight: 900) == CGRect(x: -500,y: 1000,width: 400,height: 200))
        section("Micro chat (CLI simulate, nessuna chiamata alle IA)")
        for (name, success) in ChatSelfTest.run() { check(name, success) }
    }

    // MARK: 1. states.json

    private func testStates() -> StatesSpec {
        section("states.json")
        let expected = ["idle", "sleep", "listening", "thinking", "working", "reading", "writing",
                        "running", "waiting", "done", "celebrate", "error", "talk", "look", "drag"]
        let embedded = try? StatesSpec.parse(Data(StatesSpec.embeddedJSON.utf8), origin: "incorporata")
        check("copia incorporata valida, 15 stati nell'ordine del file",
              embedded?.order == expected, "ordine: \(embedded?.order ?? [])")

        let loaded = StatesSpec.load()
        print("         (letto da: \(loaded.origin))")
        check("states.json caricato: 15 stati, idle obbligatorio senza ripiego",
              loaded.order.count == 15 && loaded.required == ["idle"] && loaded.defaultFallback(of: "idle") == nil)
        check("ripieghi predefiniti: reading→working, celebrate→done, look→thinking",
              loaded.defaultFallback(of: "reading") == "working"
              && loaded.defaultFallback(of: "celebrate") == "done"
              && loaded.defaultFallback(of: "look") == "thinking")

        // La copia incorporata deve restare uguale al file, se il file si trova.
        for (label, url) in StatesSpec.candidateFiles() where FileManager.default.fileExists(atPath: url.path) {
            if let data = try? Data(contentsOf: url), let file = try? StatesSpec.parse(data, origin: label) {
                var same = embedded != nil && file.order == embedded!.order
                if let e = embedded {
                    for name in file.order where e.states[name]?.fallback != file.states[name]?.fallback
                        || e.states[name]?.description != file.states[name]?.description { same = false }
                }
                check("copia incorporata identica a \(label)", same)
            }
        }
        return loaded
    }

    // MARK: 2. Rosso

    private func testRosso(spec: StatesSpec) -> LoadedCharacter? {
        section("Personaggio rosso")
        let lib = CharacterLibrary.discover(spec: spec)
        for m in lib.messages where m.level != .info { print("         (\(m.text))") }
        let rosso = lib.character(id: "rosso")
        check("rosso trovato e caricato (\(rosso?.directory.path ?? "mancante"))", rosso != nil)
        guard let rosso else { return nil }
        let p = rosso.pack
        check("id, nome, fotogramma 32×32, scala 4",
              p.id == "rosso" && p.name == "Rosso" && p.frame == FrameSize(width: 32, height: 32) && p.scale == 4)
        check("foglio 192×480 (6 colonne, 15 righe)", rosso.sheetSize.width == 192 && rosso.sheetSize.height == 480)
        check("fumetto a (16, 7)", p.bubble == Bubble(x: 16, y: 7))
        check("15 animazioni, una per stato", p.animations.count == 15 && spec.order.allSatisfy { p.animations[$0] != nil })
        check("nessun avviso di validazione", rosso.warnings.isEmpty, rosso.warnings.joined(separator: "; "))
        check("idle: riga 0, 44 colonne in lista, 6 fps, loop",
              p.animations["idle"]?.row == 0 && p.animations["idle"]?.frames.count == 44
              && p.animations["idle"]?.fps == 6 && p.animations["idle"]?.loop == true)
        check("celebrate: loop false, 6 durate", p.animations["celebrate"]?.loop == false
              && p.animations["celebrate"]?.durations?.count == 6)
        check("indice: predefinito rosso", lib.defaultID == "rosso")
        if let data = try? Data(contentsOf: rosso.directory.appendingPathComponent("sprites.png")) {
            let size = PackValidator.pngSize(data)
            check("pngSize legge l'intestazione IHDR di sprites.png (192×480)", size?.width == 192 && size?.height == 480)
        }

        // Trasparenza (per i clic che attraversano): angolo vuoto, qualche pixel pieno.
        let m = rosso.mask
        let fw = p.frame.width, fh = p.frame.height
        var opaque = 0
        for y in 0..<fh { for x in 0..<fw where m.alpha(x: x, y: y) > 0 { opaque += 1 } }
        check("maschera: angolo (0,0) trasparente, fotogramma idle con pixel pieni (\(opaque))",
              m.alpha(x: 0, y: 0) == 0 && opaque > 20 && opaque < fw * fh)
        return rosso
    }

    // MARK: 3. validazione

    private func testValidation(spec: StatesSpec) {
        section("Validazione del pacchetto (stesse regole del visore)")
        let ok = validate(spec: spec)
        check("pacchetto minimo valido", ok.errors.isEmpty && ok.pack != nil, ok.errors.joined(separator: "; "))
        if let p = ok.pack {
            check("default: scale 4, fps 8, loop true, id = cartella, fumetto al centro in alto",
                  p.scale == 4 && p.animations["idle"]?.fps == 8 && p.animations["idle"]?.loop == true
                  && p.id == "cartella" && p.bubble == Bubble(x: 8, y: 0))
            check("frames numero 2 → [0, 1]", p.animations["idle"]?.frames == [0, 1])
        }
        let list = validate({ d in
            d["animations"] = ["idle": ["row": 1, "frames": [0, 0, 1], "fps": 12, "loop": false]]
        }, spec: spec)
        check("frames come lista, fps e loop letti",
              list.pack?.animations["idle"]?.frames == [0, 0, 1] && list.pack?.animations["idle"]?.fps == 12
              && list.pack?.animations["idle"]?.loop == false, list.errors.joined(separator: "; "))

        func fails(_ name: String, _ fragment: String, sheet: (Int, Int)? = (32, 32),
                   _ mutate: @escaping (inout [String: Any]) -> Void) {
            let r = validate(mutate, sheet: sheet, spec: spec)
            check(name, has(r.errors, fragment) && r.pack == nil, "errori: \(r.errors)")
        }
        fails("senza idle: errore", "animations.idle: obbligatorio") { $0["animations"] = ["working": ["row": 0, "frames": 1]] }
        fails("format sbagliato", "format: deve essere") { $0["format"] = "altro/1" }
        fails("nome mancante", "name: obbligatorio") { $0.removeValue(forKey: "name") }
        fails("colonna fuori dal foglio", "fuori dal foglio") { $0["animations"] = ["idle": ["row": 0, "frames": [0, 5]]] }
        fails("troppi fotogrammi per le colonne", "fotogrammi richiesti ma il foglio ha 2 colonne") {
            $0["animations"] = ["idle": ["row": 0, "frames": 3]] }
        fails("riga fuori dal foglio", "riga 2 fuori dal foglio") { $0["animations"] = ["idle": ["row": 2, "frames": 1]] }
        fails("fps fuori intervallo (0)", "fuori dall'intervallo 1-30") { $0["animations"] = ["idle": ["row": 0, "frames": 1, "fps": 0]] }
        fails("fps fuori intervallo (31)", "fuori dall'intervallo 1-30") { $0["animations"] = ["idle": ["row": 0, "frames": 1, "fps": 31]] }
        fails("durations di lunghezza diversa da frames", "devono avere la stessa lunghezza") {
            $0["animations"] = ["idle": ["row": 0, "frames": 2, "durations": [100]]] }
        fails("durations non positive", "numero positivo di millisecondi") {
            $0["animations"] = ["idle": ["row": 0, "frames": 1, "durations": [0]]] }
        fails("foglio fuori dal pacchetto (..)", "niente \"..\"") { $0["sheet"] = "../x.png" }
        fails("foglio come indirizzo", "non un indirizzo") { $0["sheet"] = "https://esempio.it/x.png" }
        fails("foglio con percorso assoluto", "non assoluto") { $0["sheet"] = "/tmp/x.png" }
        fails("larghezza del PNG non multipla", "non è un multiplo della larghezza", sheet: (30, 32)) { _ in }
        fails("scale non intero", "scale: deve essere un intero") { $0["scale"] = 2.5 }
        fails("scale vero/falso", "scale: deve essere un intero") { $0["scale"] = true }
        fails("frames enorme", "troppi fotogrammi") { $0["animations"] = ["idle": ["row": 0, "frames": 1_000_000_000]] }
        fails("frames vuoto", "la lista è vuota") { $0["animations"] = ["idle": ["row": 0, "frames": []]] }
        fails("ripiego verso stato sconosciuto", "non è uno stato noto") { $0["fallbacks"] = ["celebrate": "boh"] }
        fails("stato che è il proprio ripiego", "non può essere il proprio ripiego") { $0["fallbacks"] = ["talk": "talk"] }

        let w = validate({ d in
            d["extra"] = 1
            d["animations"] = ["idle": ["row": 0, "frames": 1, "bonus": true], "stato-nuovo": ["row": 0, "frames": 1]]
            d["fallbacks"] = ["celebrate": "talk", "talk": "celebrate"]
        }, spec: spec)
        check("stati e campi sconosciuti: solo avvisi, pacchetto valido",
              w.pack != nil && has(w.warnings, "extra: campo sconosciuto") && has(w.warnings, "stato-nuovo: stato sconosciuto")
              && has(w.warnings, "bonus: campo sconosciuto"), "avvisi: \(w.warnings) errori: \(w.errors)")
        check("ripiego circolare: avviso", has(w.warnings, "ripiego circolare"), "avvisi: \(w.warnings)")

        check("JSON rotto: messaggio, nessun crash", PackValidator.parseJSON(Data("{ non json".utf8)).error != nil)
        check("JSON non oggetto: errore", PackValidator.validate([1, 2], sheetWidth: nil, sheetHeight: nil, folderName: nil, spec: spec).pack == nil)
        check("senza misura del foglio i controlli sul foglio si saltano",
              validate({ $0["animations"] = ["idle": ["row": 9, "frames": 9]] }, sheet: nil, spec: spec).errors.isEmpty)
        check("slug: \"Città Bella!\" → citta-bella", PackValidator.slug("Città Bella!") == "citta-bella")
        check("pngSize: un file che non è PNG dà nil", PackValidator.pngSize(Data("non sono un png, ma sono lungo abbastanza".utf8)) == nil)
        check("scale enorme rifiutata prima di calcolare la finestra",
              validate({ $0["scale"] = 9_007_199_254_740_991 }, spec: spec).pack == nil)
        check("fotogramma enorme rifiutato anche senza misura del PNG",
              validate({ $0["frame"] = ["width": 9_007_199_254_740_991, "height": 16] }, sheet: nil, spec: spec).pack == nil)
        check("finestra oltre 2048 punti rifiutata",
              validate({ $0["frame"] = ["width": 512, "height": 512]; $0["scale"] = 8 }, sheet: nil, spec: spec).pack == nil)
    }

    // MARK: 4. ripieghi

    private func pack(_ states: [String], fallbacks: [String: String] = [:], spec: StatesSpec) -> CharacterPack? {
        let r = validate({ d in
            var a: [String: Any] = [:]
            for s in states { a[s] = ["row": 0, "frames": 1] }
            d["animations"] = a
            if !fallbacks.isEmpty { d["fallbacks"] = fallbacks }
        }, spec: spec)
        return r.pack
    }

    private func testFallbacks(spec: StatesSpec, rosso: LoadedCharacter?) {
        section("Ripieghi degli stati")
        if let only = pack(["idle"], spec: spec) {
            let r = StateResolver.resolve("reading", pack: only, spec: spec)
            check("solo idle: reading → working → thinking → idle", r.used == "idle" && r.chain == ["reading", "working", "thinking", "idle"], "\(r)")
            check("solo idle: tutti i 15 stati si risolvono in idle",
                  spec.order.allSatisfy { StateResolver.resolve($0, pack: only, spec: spec).used == "idle" })
            check("stato sconosciuto → idle", StateResolver.resolve("boh", pack: only, spec: spec).used == "idle")
        } else { check("pacchetto di prova solo idle", false) }

        if let p = pack(["idle", "working"], spec: spec) {
            let r = StateResolver.resolve("reading", pack: p, spec: spec)
            check("con working: reading → working", r.used == "working" && r.chain == ["reading", "working"], "\(r)")
        }
        if let p = pack(["idle", "thinking"], spec: spec) {
            check("con thinking: listening → thinking", StateResolver.resolve("listening", pack: p, spec: spec).used == "thinking")
            check("con thinking: celebrate → done → idle",
                  StateResolver.resolve("celebrate", pack: p, spec: spec).chain == ["celebrate", "done", "idle"])
        }
        if let p = pack(["idle", "talk"], fallbacks: ["celebrate": "talk"], spec: spec) {
            check("ripiego del pacchetto: celebrate → talk", StateResolver.resolve("celebrate", pack: p, spec: spec).used == "talk")
        }
        if let p = pack(["idle"], fallbacks: ["celebrate": "talk", "talk": "celebrate"], spec: spec) {
            let w = StateResolver.walk("celebrate", animations: Set(p.animations.keys), fallbacks: p.fallbacks, spec: spec)
            check("ripiego circolare: si usa idle", w.used == "idle" && w.cycle != nil)
        }
        if let rosso {
            // Rosso senza `reading`: reading → working (esempio del progetto).
            let p = rosso.pack
            var anims = p.animations
            anims.removeValue(forKey: "reading")
            let cut = CharacterPack(id: p.id, name: p.name, author: p.author, license: p.license, sheet: p.sheet,
                                    frame: p.frame, scale: p.scale, bubble: p.bubble, animations: anims, fallbacks: p.fallbacks)
            let r = StateResolver.resolve("reading", pack: cut, spec: spec)
            check("rosso senza reading: reading → working", r.used == "working" && r.chain == ["reading", "working"], "\(r)")
            check("rosso completo: ogni stato usa se stesso",
                  spec.order.allSatisfy { StateResolver.resolve($0, pack: p, spec: spec).used == $0 })
        }
    }

    // MARK: 5. calendario dei fotogrammi

    private func testSchedule(rosso: LoadedCharacter?) {
        section("Calendario dei fotogrammi")
        guard let rosso, let idle = rosso.pack.animations["idle"], let sleep = rosso.pack.animations["sleep"],
              let cel = rosso.pack.animations["celebrate"] else { check("animazioni di rosso", false); return }

        let si = FrameSchedule(idle)
        check("idle: 44 fotogrammi, 1000/6 ms ciascuno (fps 6)",
              si.count == 44 && si.entries.allSatisfy { abs($0.ms - 1000.0 / 6) < 1e-9 && $0.row == 0 })
        check("idle: colonne in lista (0,0,0,3,3,3…)", Array(si.entries.prefix(6).map(\.col)) == [0, 0, 0, 3, 3, 3])
        let ss = FrameSchedule(sleep)
        check("sleep: durations (600 ms) prevalgono su fps 8 (125 ms)", ss.entries.map(\.ms) == [600, 600, 600, 600] && ss.totalMs == 2400)
        let sc = FrameSchedule(cel)
        check("celebrate: durate 160,100,100,100,120,400 (totale 980)", sc.entries.map(\.ms) == [160, 100, 100, 100, 120, 400] && sc.totalMs == 980)
        check("celebrate: riga 10", sc.entries.allSatisfy { $0.row == 10 })
        check("start(of:) cumulativo", sc.start(of: 0) == 0 && sc.start(of: 3) == 360 && sc.start(of: 6) == 980)

        check("frame(at:) senza loop: 0 ms → 0, 159 → 0, 160 → 1, 979 → 5",
              sc.frame(at: 0, loop: false).index == 0 && sc.frame(at: 159, loop: false).index == 0
              && sc.frame(at: 160, loop: false).index == 1 && sc.frame(at: 979, loop: false) == (5, false))
        check("senza loop: a 980 ms e oltre resta sull'ultimo (finito)",
              sc.frame(at: 980, loop: false) == (5, true) && sc.frame(at: 99_999, loop: false) == (5, true))
        check("con loop: a 980 ms riparte da 0, a 1140 mostra il 2°",
              sc.frame(at: 980, loop: true) == (0, false) && sc.frame(at: 980 + 160, loop: true).index == 1)
        check("tempo negativo o NaN → primo fotogramma",
              sc.frame(at: -5, loop: true).index == 0 && sc.frame(at: .nan, loop: true).index == 0)

        let bad = Animation(row: 3, frames: [0, 1, 2], fps: 10, durations: [50, 50], loop: true)
        check("durations di lunghezza sbagliata → si usa fps (100 ms)", FrameSchedule(bad).entries.map(\.ms) == [100, 100, 100])
        let def = Animation(row: 0, frames: [0], fps: 8, durations: nil, loop: true)
        check("fps 8 → 125 ms", FrameSchedule(def).entries.first?.ms == 125)
        check("calendario vuoto: nessun crash", FrameSchedule(entries: []).frame(at: 10, loop: true) == (0, true))
    }

    // MARK: 6. animatore (tempo reale, breve)

    private func testAnimator() {
        section("Animatore (timer)")
        let a = Animator()
        var seen: [Int] = []
        a.onFrame = { seen.append($0.col) }

        a.play(Animation(row: 1, frames: [0, 1, 2], fps: 20, durations: nil, loop: false))
        _ = spin(timeout: 1.0) { seen.count >= 3 }
        wait(0.2)
        check("loop false: fotogrammi 0,1,2 una volta sola, poi fermo", seen == [0, 1, 2] && !a.isRunning, "visti: \(seen)")

        seen = []
        a.play(Animation(row: 0, frames: [0, 1], fps: 25, durations: [40, 40], loop: true))
        _ = spin(timeout: 1.0) { seen.count >= 7 }
        a.stop()
        check("loop true: alterna 0,1,0,1… (\(seen.count) cambi in ≈0,3 s)",
              seen.count >= 7 && zip(seen, seen.dropFirst()).allSatisfy { $0 != $1 }, "visti: \(seen)")

        seen = []
        a.play(Animation(row: 0, frames: [4], fps: 8, durations: nil, loop: true))
        wait(0.1)
        check("un solo fotogramma: mostrato una volta, nessun timer", seen == [4] && !a.isRunning)
        a.stop()
    }

    // MARK: 7. disegno (CALayer + contentsRect)

    private func bytes(of image: CGImage, width: Int, height: Int) -> [UInt8]? {
        var buf = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = buf.withUnsafeMutableBytes { raw -> Bool in
            guard let ctx = CGContext(data: raw.baseAddress, width: width, height: height, bitsPerComponent: 8,
                                      bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.interpolationQuality = .none
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        return drawn ? buf : nil
    }

    private func renderLayer(sheet: CGImage, rect: CGRect, width: Int, height: Int) -> [UInt8]? {
        let layer = CALayer()
        layer.frame = CGRect(x: 0, y: 0, width: width, height: height)
        layer.contents = sheet
        layer.contentsGravity = .resize
        layer.magnificationFilter = .nearest
        layer.minificationFilter = .nearest
        layer.contentsRect = rect
        var buf = [UInt8](repeating: 0, count: width * height * 4)
        let ok = buf.withUnsafeMutableBytes { raw -> Bool in
            guard let ctx = CGContext(data: raw.baseAddress, width: width, height: height, bitsPerComponent: 8,
                                      bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            layer.render(in: ctx)
            return true
        }
        return ok ? buf : nil
    }

    private func close(_ a: [UInt8], _ b: [UInt8], tolerance: Int = 2) -> Bool {
        a.count == b.count && zip(a, b).allSatisfy { abs(Int($0) - Int($1)) <= tolerance }
    }

    private func testRendering(_ rosso: LoadedCharacter) {
        section("Disegno: contentsRect sul foglio sprite")
        let fw = rosso.pack.frame.width, fh = rosso.pack.frame.height
        let sheet = rosso.sheet
        var allMatch = true
        var detail = ""
        var rendered: [String: [UInt8]] = [:]
        for (col, row) in [(0, 0), (3, 0), (2, 10), (5, 10), (0, 14), (3, 5)] {
            let rect = MascotView.contentsRect(col: col, row: row, frame: rosso.pack.frame,
                                               sheetWidth: sheet.width, sheetHeight: sheet.height)
            guard let crop = sheet.cropping(to: CGRect(x: col * fw, y: row * fh, width: fw, height: fh)),
                  let expected = bytes(of: crop, width: fw, height: fh),
                  let got = renderLayer(sheet: sheet, rect: rect, width: fw, height: fh) else {
                allMatch = false; detail += " impossibile renderizzare (\(col),\(row));"; continue
            }
            rendered["\(col),\(row)"] = got
            if !close(expected, got) { allMatch = false; detail += " (colonna \(col), riga \(row)) diverso;" }
        }
        check("il layer mostra esattamente il fotogramma (colonna, riga) richiesto (6 fotogrammi confrontati pixel per pixel)",
              allMatch, detail)
        if let a = rendered["0,0"], let b = rendered["0,14"] {
            check("fotogrammi di righe diverse sono davvero diversi (il confronto non è banale)", !close(a, b))
        }
        let r = MascotView.contentsRect(col: 5, row: 14, frame: rosso.pack.frame, sheetWidth: 192, sheetHeight: 480)
        check("contentsRect dell'ultima cella: x 5/6, y 0, 1/6 × 1/15",
              abs(r.minX - 5.0 / 6) < 1e-9 && abs(r.minY) < 1e-9 && abs(r.width - 1.0 / 6) < 1e-9 && abs(r.height - 1.0 / 15) < 1e-9, "\(r)")
    }

    // MARK: 7b. vista e finestra reali (solo con una sessione grafica, senza mostrare nulla)

    private func testViewAndWindow(_ rosso: LoadedCharacter) {
        section("Vista e finestra (senza mostrarle)")
        guard CGSessionCopyCurrentDictionary() != nil else {
            print("         (nessuna sessione grafica: controlli sulla vista e sulla finestra saltati)")
            return
        }
        NSApplication.shared.setActivationPolicy(.prohibited)   // nessuna icona nel Dock durante il test
        let scale = 4
        let fw = rosso.pack.frame.width, fh = rosso.pack.frame.height

        // La vista vera, con la sua gerarchia di layer. Il disegno offscreen
        // (CALayer.render) interpola quando ingrandisce, ignorando il filtro
        // `nearest` che invece vale sullo schermo: quindi qui si confronta a 1×
        // (stessa gerarchia, contentsRect e orientamento) e del filtro si
        // controlla la sola impostazione.
        let view = MascotView(frame: .zero)
        view.configure(character: rosso, scale: scale)
        view.layoutSubtreeIfNeeded()
        check("la vista è grande fotogramma × scala (32×4 = 128)",
              view.frame.size == NSSize(width: fw * scale, height: fh * scale), "\(view.frame.size)")
        let sl = view.spriteLayer
        check("layer: filtro nearest in ingrandimento e riduzione, niente antialiasing dei bordi, gravità resize",
              sl.magnificationFilter == .nearest && sl.minificationFilter == .nearest
              && !sl.allowsEdgeAntialiasing && sl.contentsGravity == .resize)
        check("layer: contents è il foglio sprite (192×480)",
              (sl.contents as! CGImage?).map { $0.width == 192 && $0.height == 480 } == true)

        let small = MascotView(frame: .zero)
        small.configure(character: rosso, scale: 1)
        small.layoutSubtreeIfNeeded()
        var allMatch = true
        var detail = ""
        for (col, row) in [(0, 0), (3, 0), (4, 11), (2, 14), (5, 10)] {
            small.show(FrameSchedule.Entry(col: col, row: row, ms: 100))
            guard let root = small.layer,
                  let crop = rosso.sheet.cropping(to: CGRect(x: col * fw, y: row * fh, width: fw, height: fh)),
                  let expected = bytes(of: crop, width: fw, height: fh) else { allMatch = false; continue }
            var got = [UInt8](repeating: 0, count: fw * fh * 4)
            let rendered = got.withUnsafeMutableBytes { raw -> Bool in
                guard let ctx = CGContext(data: raw.baseAddress, width: fw, height: fh, bitsPerComponent: 8,
                                          bytesPerRow: fw * 4, space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
                root.render(in: ctx)
                return true
            }
            if !rendered || !close(expected, got) { allMatch = false; detail += " (colonna \(col), riga \(row));" }
        }
        check("la vista vera (1×) mostra esattamente il fotogramma (colonna, riga) richiesto: 5 fotogrammi", allMatch, detail)

        // Zone trasparenti: coordinate della vista (origine in basso a sinistra).
        view.show(FrameSchedule.Entry(col: 0, row: 0, ms: 100))
        var opaquePoint: NSPoint?
        var mirroredTransparent = false
        for sy in 0..<fh { for sx in 0..<fw where rosso.mask.alpha(x: sx, y: sy) > 0 && opaquePoint == nil {
            if rosso.mask.alpha(x: sx, y: fh - 1 - sy) == 0 {
                opaquePoint = NSPoint(x: (CGFloat(sx) + 0.5) * CGFloat(scale),
                                      y: view.bounds.height - (CGFloat(sy) + 0.5) * CGFloat(scale))
                mirroredTransparent = true
            }
        } }
        check("isOpaque(at:) sì su un pixel pieno (con la y capovolta giusta)",
              opaquePoint.map { view.isOpaque(at: $0) } == true && mirroredTransparent)
        check("isOpaque(at:) no nell'angolo vuoto in alto a sinistra e fuori dalla vista",
              !view.isOpaque(at: NSPoint(x: 1, y: view.bounds.height - 1)) && !view.isOpaque(at: NSPoint(x: -5, y: 5)))

        // La finestra vera (non viene mostrata).
        let wc = MascotWindowController()
        wc.configure(character: rosso, scale: scale, savedOrigin: nil)
        let p = wc.panel
        check("finestra: NSPanel senza bordi e non attivante",
              p.styleMask.contains(.borderless) && p.styleMask.contains(.nonactivatingPanel) && p.isFloatingPanel)
        check("finestra: trasparente, senza ombra, sfondo clear",
              !p.isOpaque && p.backgroundColor == .clear && !p.hasShadow)
        check("finestra: livello ≥ floating (\(p.level.rawValue))", p.level.rawValue >= NSWindow.Level.floating.rawValue)
        check("finestra: su tutte le scrivanie e sopra le app a tutto schermo",
              p.collectionBehavior.contains(.canJoinAllSpaces) && p.collectionBehavior.contains(.fullScreenAuxiliary))
        check("finestra: non diventa mai key/main e non si nasconde se l'app non è attiva",
              !p.canBecomeKey && !p.canBecomeMain && !p.hidesOnDeactivate)
        check("finestra: 128×128 pt", p.frame.size == NSSize(width: 128, height: 128), "\(p.frame.size)")
        if let screen = NSScreen.screens.first {
            let v = screen.visibleFrame
            check("posizione iniziale: in basso a destra dello schermo principale, margine 24",
                  p.frame.maxX == v.maxX - 24 && p.frame.minY == v.minY + 24, "finestra \(p.frame), schermo \(v)")
        }
        wc.configure(character: rosso, scale: 6, savedOrigin: nil)
        check("cambio grandezza a 6×: 192×192, base (centro del bordo inferiore) ferma",
              p.frame.size == NSSize(width: 192, height: 192) && p.frame.minY == NSScreen.screens.first!.visibleFrame.minY + 24)
        check("la finestra non è stata mostrata dal test", !p.isVisible)
    }

    // MARK: 8. StateController (tempi ridotti)

    private func testStateController(spec: StatesSpec, rosso: LoadedCharacter?) {
        section("StateController (tempi ridotti a 1/250)")
        guard let rosso, let only = pack(["idle"], spec: spec) else { check("pacchetti di prova", false); return }
        StateController.timeScale = 0.004
        defer { StateController.timeScale = 1 }

        let c = StateController(spec: spec, pack: rosso.pack)
        var log: [String] = []
        c.onDisplay = { log.append("\($0.requested)>\($0.used)") }
        let t = StateController.shortHold   // 4 s ×0,004 = 16 ms

        c.set("reading", source: "test")
        check("set(reading): richiesto e mostrato reading", c.requested == "reading" && c.used == "reading")
        check("stato temporaneo (5 s) torna a idle da solo", spin(timeout: 2) { c.requested == "idle" }, "stato: \(c.requested)")
        c.set("done", source: "test")
        check("done torna a idle (4 s)", spin(timeout: 2) { c.requested == "idle" })
        c.set("celebrate", source: "test")
        check("celebrate resta durante l'animazione + 1 s, poi idle",
              c.requested == "celebrate" && spin(timeout: 2) { c.requested == "idle" })
        c.set("error", source: "test")
        check("error torna a idle (4 s)", spin(timeout: 2) { c.requested == "idle" })
        c.set("talk", source: "test")
        check("talk torna a idle (4 s)", spin(timeout: 2) { c.requested == "idle" })
        _ = t

        c.set("sleep", source: "test")
        wait(0.15)
        check("sleep resta finché non succede qualcosa", c.requested == "sleep")
        c.reactToClick()
        check("un clic sveglia: sleep → idle", c.requested == "idle")

        c.reactToClick()
        check("clic su idle: reazione listening", c.requested == "listening")
        check("la reazione (1,5 s) finisce e torna a idle", spin(timeout: 2) { c.requested == "idle" })

        c.set("working", source: "test")
        c.beginDrag()
        check("trascinamento: stato drag", c.requested == "drag" && c.used == "drag")
        wait(0.1)
        check("durante il trascinamento nessun timer lo interrompe", c.requested == "drag")
        c.endDrag()
        check("al rilascio torna allo stato di prima (working)", c.requested == "working")
        check("…che a sua volta torna a idle", spin(timeout: 2) { c.requested == "idle" })

        c.set("idle", source: "test")
        check("5 minuti di idle senza interazioni → sleep", spin(timeout: 4) { c.requested == "sleep" }, "stato: \(c.requested)")

        c.set("inesistente", source: "test")
        check("stato sconosciuto ignorato", c.requested == "sleep")

        c.set("working", source: "test", hold: .forever)
        wait(0.2)
        check("hold .forever: nessun ritorno automatico", c.requested == "working")
        c.set("idle", source: "test")

        check("il registro dei cambi contiene reading>reading e drag>drag", log.contains("reading>reading") && log.contains("drag>drag"))

        let o = StateController(spec: spec, pack: only)
        var shown: Display? = nil
        o.onDisplay = { shown = Display(requested: $0.requested, used: $0.used) }
        o.set("reading", source: "test")
        check("personaggio con solo idle: reading mostra idle (ripiego)", shown?.requested == "reading" && shown?.used == "idle")
        o.setPack(rosso.pack)
        check("cambio personaggio: lo stato corrente passa alle nuove animazioni", shown?.used == "reading")
        o.set("idle", source: "test")
    }

    private struct Display { let requested: String; let used: String }

    // MARK: 9. ricerca dei personaggi

    private func testLibrary(spec: StatesSpec) {
        section("Ricerca dei personaggi")
        let std = CharacterLibrary.discover(spec: spec)
        guard let rosso = std.character(id: "rosso") else { check("ricerca standard trova rosso", false); return }
        let parent = rosso.directory.deletingLastPathComponent()
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("mascotte-pack-test-\(UUID().uuidString)")
        do {
            try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: temporary) }
            let data = try Data(contentsOf: rosso.directory.appendingPathComponent("character.json"))
            try data.write(to: temporary.appendingPathComponent("character.json"))
            let sheet = temporary.appendingPathComponent("sprites.png")
            try FileManager.default.createSymbolicLink(at: sheet, withDestinationURL: rosso.directory.appendingPathComponent("sprites.png"))
            let rejected = CharacterLoader.load(directory: temporary, source: "test", spec: spec)
            check("PNG simbolico esterno al pacchetto rifiutato", rejected.character == nil && has(rejected.errors, "restare nel pacchetto"))
            try FileManager.default.removeItem(at: sheet)
            try FileManager.default.copyItem(at: rosso.directory.appendingPathComponent("sprites.png"), to: sheet)
            check("stesso pacchetto con PNG locale accettato", CharacterLoader.load(directory: temporary, source: "test", spec: spec).character != nil)
        } catch { check("fixture per il controllo dei symlink", false, error.localizedDescription) }
        let missing = URL(fileURLWithPath: "/percorso/che/non/esiste/characters")

        let lib = CharacterLibrary.discover(sources: [
            CharacterLibrary.Source(label: "assente", url: missing),
            CharacterLibrary.Source(label: "prima", url: parent),
            CharacterLibrary.Source(label: "seconda", url: parent),
        ], spec: spec)
        check("cartella inesistente ignorata senza errori", !lib.messages.contains { $0.level == .error })
        check("stesso id in due elenchi: rosso una volta sola, vince il primo",
              lib.characters.filter { $0.id == "rosso" }.count == 1 && lib.character(id: "rosso")?.source == "prima")
        check("il duplicato è segnalato nel log", lib.messages.contains { $0.text.contains("c'è già quello") })

        let file = rosso.directory.appendingPathComponent("sprites.png")
        let odd = CharacterLibrary.discover(sources: [CharacterLibrary.Source(label: "file", url: file)], spec: spec)
        check("un file al posto di una cartella: nessun personaggio, nessun crash", odd.characters.isEmpty)

        let r1 = CharacterLoader.load(directory: missing, source: "x", spec: spec)
        check("cartella senza character.json: errore, non crash", r1.character == nil && !r1.errors.isEmpty)
        let r2 = CharacterLoader.load(directory: parent, source: "x", spec: spec)
        check("cartella genitore (senza character.json): errore, non crash", r2.character == nil && !r2.errors.isEmpty)

        // index.json: ordine e predefinito (si legge quello vero, se c'è).
        let indexURL = parent.appendingPathComponent("index.json")
        if FileManager.default.fileExists(atPath: indexURL.path) {
            var msgs: [CharacterLibrary.Message] = []
            let idx = CharacterLibrary.readIndex(indexURL, messages: &msgs)
            check("index.json letto: predefinito e percorsi", idx?.defaultID == "rosso" && idx?.paths.contains("Cat/rosso/") == true, "\(msgs.map(\.text))")
        } else {
            print("         (nessun index.json accanto a rosso: controllo saltato)")
        }
        check("ordine delle sorgenti standard: MASCOTTE_CHARACTERS, cartella utente, risorse (quando esistono)",
              CharacterLibrary.standardSources().map(\.label).contains("cartella dell'utente"))
    }

    private func testEventProtocol(spec: StatesSpec) {
        section("Protocollo eventi locale")
        let token = String(repeating: "a", count: 64)
        func request(body: String = #"{"state":"reading","source":"claude"}"#,
                     auth: String? = nil, extra: String = "", method: String = "POST", path: String = "/event") -> Data {
            Data("\(method) \(path) HTTP/1.1\r\nAuthorization: Bearer \(auth ?? token)\r\nContent-Type: application/json\r\nContent-Length: \(body.utf8.count)\r\n\(extra)\r\n\(body)".utf8)
        }
        func status(_ data: Data) -> Int {
            if case .response(let code, _) = EventHTTP.parse(data, token: token, states: Set(spec.order)) { return code }
            return 0
        }
        check("evento valido accettato", status(request()) == 204)
        check("token errato rifiutato", status(request(auth: "wrong")) == 401)
        check("origine browser rifiutata", status(request(extra: "Origin: http://example.test\r\n")) == 403)
        check("header duplicati rifiutati", status(request(extra: "Content-Length: 2\r\n")) == 400)
        check("transfer encoding rifiutato", status(request(extra: "Transfer-Encoding: chunked\r\n")) == 400)
        check("GET rifiutato", status(request(method: "GET")) == 405)
        check("percorso diverso rifiutato", status(request(path: "/other")) == 404)
        check("stato sconosciuto rifiutato", status(request(body: #"{"state":"unknown","source":"claude"}"#)) == 400)
        check("campi aggiuntivi rifiutati", status(request(body: #"{"state":"idle","source":"claude","prompt":"private"}"#)) == 400)
        check("richieste concatenate rifiutate", status(request() + request()) == 400)
        check("richiesta enorme rifiutata", status(Data(repeating: 65, count: 4097)) == 413)
        if case .incomplete = EventHTTP.parse(request().dropLast(3), token: token, states: Set(spec.order)) {
            check("corpo spezzato attende altri byte", true)
        } else { check("corpo spezzato attende altri byte", false) }
    }
}
