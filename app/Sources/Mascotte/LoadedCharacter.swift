import Foundation
import CoreGraphics
import ImageIO

/// Un personaggio caricato e pronto: pacchetto validato + foglio sprite.
struct LoadedCharacter {
    let pack: CharacterPack
    let directory: URL
    let sheet: CGImage
    let mask: AlphaMask
    /// Da quale elenco di cartelle viene (per il log).
    let source: String
    let warnings: [String]

    var id: String { pack.id }
    var name: String { pack.name }
    var category: String {
        let parent = directory.deletingLastPathComponent().lastPathComponent
        if ["Cat","Game"].contains(parent) { return parent }
        return id == "rosso" ? "Cat" : "Altro"
    }
    var sheetSize: (width: Int, height: Int) { (sheet.width, sheet.height) }
}

/// Trasparenza del foglio, per far passare i clic attraverso le zone vuote.
struct AlphaMask {
    let width: Int
    let height: Int
    private let alpha: [UInt8]

    init?(image: CGImage) {
        let w = image.width, h = image.height
        guard w > 0, h > 0 else { return nil }
        var rgba = [UInt8](repeating: 0, count: w * h * 4)
        let ok = rgba.withUnsafeMutableBytes { buf -> Bool in
            guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8,
                                      bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard ok else { return nil }
        var a = [UInt8](repeating: 0, count: w * h)
        for i in 0..<(w * h) { a[i] = rgba[i * 4 + 3] }
        width = w; height = h; alpha = a
    }

    /// Alpha (0-255) del pixel (x, y) del foglio, con y dall'alto.
    func alpha(x: Int, y: Int) -> UInt8 {
        guard x >= 0, y >= 0, x < width, y < height else { return 0 }
        return alpha[y * width + x]
    }
}

enum CharacterLoader {
    struct Result {
        var character: LoadedCharacter?
        var errors: [String] = []
        var warnings: [String] = []
    }

    /// Carica la cartella di un pacchetto (character.json + foglio). Mai un
    /// crash: ogni problema diventa un messaggio in `errors`.
    static func load(directory: URL, source: String, spec: StatesSpec) -> Result {
        var result = Result()
        let jsonURL = directory.appendingPathComponent("character.json")
        guard containedFile(jsonURL, in: directory, maxBytes: 262_144) else {
            result.errors = ["character.json deve essere un file del pacchetto di massimo 256 KiB"]
            return result
        }
        guard let data = try? Data(contentsOf: jsonURL) else {
            result.errors = ["character.json non si può leggere"]
            return result
        }
        let parsed = PackValidator.parseJSON(data)
        guard let json = parsed.json else {
            result.errors = [parsed.error ?? "character.json non è un JSON valido"]
            return result
        }

        // Misura del foglio, per i controlli su righe e colonne. Il nome del
        // foglio va controllato prima di toccare il disco (niente "..").
        var sheetData: Data?
        var size: (width: Int, height: Int)?
        var sheetProblem: String?
        if let dict = json as? [String: Any], let name = (dict["sheet"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty,
           PackValidator.sheetPathProblem(name) == nil {
            let url = directory.appendingPathComponent(name)
            if !containedFile(url, in: directory, maxBytes: 16_777_216) {
                sheetProblem = "sheet: il PNG deve restare nel pacchetto e non superare 16 MiB"
            } else if let d = try? Data(contentsOf: url) {
                sheetData = d
                size = PackValidator.pngSize(d)
                if size == nil { sheetProblem = "sheet: \"\(name)\" non è un file PNG valido" }
                else if let s = size, s.width < 1 || s.height < 1 || s.width > 8192 || s.height > 8192 || s.width*s.height > 33_554_432 {
                    sheetProblem = "sheet: il PNG deve misurare da 1 a 8192 pixel per lato e non superare 32 megapixel"
                }
            } else {
                sheetProblem = "sheet: il file \"\(name)\" non è nella cartella del pacchetto"
            }
        }

        let v = PackValidator.validate(json, sheetWidth: size?.width, sheetHeight: size?.height,
                                       folderName: directory.lastPathComponent, spec: spec)
        result.errors = v.errors
        result.warnings = v.warnings
        if let sheetProblem { result.errors.append(sheetProblem) }
        guard result.errors.isEmpty, let pack = v.pack, let sheetData else { return result }

        guard let src = CGImageSourceCreateWithData(sheetData as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
            result.errors.append("sheet: il PNG non si riesce a decodificare")
            return result
        }
        guard image.width == size?.width, image.height == size?.height else {
            result.errors.append("sheet: la misura letta dal PNG (\(image.width)×\(image.height)) non coincide con l'intestazione")
            return result
        }
        guard let mask = AlphaMask(image: image) else {
            result.errors.append("sheet: impossibile leggere la trasparenza del PNG")
            return result
        }
        result.character = LoadedCharacter(pack: pack, directory: directory, sheet: image, mask: mask,
                                     source: source, warnings: v.warnings)
        return result
    }

    /// Controlla anche il percorso reale: un link simbolico non può uscire dal pacchetto.
    private static func containedFile(_ url: URL, in directory: URL, maxBytes: Int) -> Bool {
        let root = directory.resolvingSymlinksInPath().standardizedFileURL.path + "/"
        let real = url.resolvingSymlinksInPath().standardizedFileURL
        guard real.path.hasPrefix(root),
              let values = try? real.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
              values.isRegularFile == true, let size = values.fileSize, size <= maxBytes else { return false }
        return true
    }
}
