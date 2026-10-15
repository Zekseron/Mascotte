import Foundation

/// Ripiego degli stati: segue prima i `fallbacks` del pacchetto, poi quelli di
/// states.json, fino a uno stato presente nel pacchetto (idle in ultima istanza).
/// Stessa logica di `walk`/`resolveState` in viewer/pack.js.
enum StateResolver {
    struct Walk {
        let used: String
        /// Stati provati, nell'ordine (finisce con `used`; con ripiego a vuoto si aggiunge idle).
        let chain: [String]
        /// Stati di un eventuale giro (ripiego circolare).
        let cycle: [String]?
    }

    static func walk(_ state: String, animations: Set<String>, fallbacks: [String: String], spec: StatesSpec) -> Walk {
        var chain: [String] = []
        var cycle: [String]?
        var current = state
        while true {
            if let i = chain.firstIndex(of: current) {
                cycle = Array(chain[i...])
                break
            }
            chain.append(current)
            if animations.contains(current) { return Walk(used: current, chain: chain, cycle: nil) }
            let own = fallbacks[current].flatMap { $0.isEmpty ? nil : $0 }
            guard let next = own ?? spec.defaultFallback(of: current) else { break }
            current = next
        }
        if !chain.contains("idle") { chain.append("idle") }
        return Walk(used: "idle", chain: chain, cycle: cycle)
    }

    static func resolve(_ state: String, pack: CharacterPack, spec: StatesSpec) -> (used: String, chain: [String]) {
        let w = walk(state, animations: Set(pack.animations.keys), fallbacks: pack.fallbacks, spec: spec)
        return (w.used, w.chain)
    }
}
