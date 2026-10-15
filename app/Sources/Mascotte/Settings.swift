import Foundation
import CoreGraphics

/// Scelte dell'utente, ricordate in UserDefaults.
struct Settings {
    static let scaleChoices = [1, 2, 3, 4, 5, 6]

    private static let defaults = UserDefaults.standard
    private enum Key {
        static let characterID = "mascotte.characterID"
        static let scale = "mascotte.scale"
        static let visible = "mascotte.visible"
        static let origin = "mascotte.windowOrigin"
        static let chatEngine = "mascotte.chatEngine"
        static let dockAttachment = "mascotte.dockAttachment"
    }

    /// Id dell'ultimo personaggio scelto (nil: usa il predefinito).
    static var characterID: String? {
        get { defaults.string(forKey: Key.characterID) }
        set { defaults.set(newValue, forKey: Key.characterID) }
    }

    static var chatEngine: ChatEngine {
        get { defaults.string(forKey: Key.chatEngine).flatMap(ChatEngine.init(rawValue:)) ?? .codex }
        set { defaults.set(newValue.rawValue, forKey: Key.chatEngine) }
    }
    static var dockAttachment: Bool {
        get { defaults.bool(forKey: Key.dockAttachment) }
        set { defaults.set(newValue, forKey: Key.dockAttachment) }
    }

    /// Grandezza scelta dall'utente (nil: usa quella suggerita dal personaggio).
    static var scale: Int? {
        get {
            let v = defaults.integer(forKey: Key.scale)
            return (1...CharacterPack.maxScale).contains(v) ? v : nil
        }
        set { defaults.set(newValue, forKey: Key.scale) }
    }

    static func scale(for pack: CharacterPack) -> Int {
        let stored = (defaults.dictionary(forKey:"mascotte.characterScales")?[pack.id] as? Int)
        let chosen = stored.flatMap { scaleChoices.contains($0) ? $0 : nil } ?? (pack.id == "rosso" ? scale : nil) ?? pack.scale
        return min(chosen, CharacterPack.maxDisplaySize * pack.pixelRatio / max(pack.frame.width, pack.frame.height))
    }
    static func setScale(_ scale: Int, for pack: CharacterPack) {
        var values = defaults.dictionary(forKey:"mascotte.characterScales") ?? [:]
        values[pack.id] = scale; defaults.set(values,forKey:"mascotte.characterScales")
        if pack.id == "rosso" { self.scale = scale }
    }

    static var isVisible: Bool {
        get { defaults.object(forKey: Key.visible) as? Bool ?? true }
        set { defaults.set(newValue, forKey: Key.visible) }
    }

    /// Angolo in basso a sinistra della finestra, in coordinate dello schermo.
    static var windowOrigin: CGPoint? {
        get {
            guard let a = defaults.array(forKey: Key.origin) as? [Double], a.count == 2 else { return nil }
            return CGPoint(x: a[0], y: a[1])
        }
        set {
            if let p = newValue { defaults.set([Double(p.x), Double(p.y)], forKey: Key.origin) }
            else { defaults.removeObject(forKey: Key.origin) }
        }
    }
}
