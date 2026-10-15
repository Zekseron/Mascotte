// swift-tools-version:5.9
import PackageDescription

// Mascotte: app macOS nativa (pezzo 2). Nessuna dipendenza esterna.
// Modalità linguaggio Swift 5 per non dover annotare tutto per la concorrenza
// stretta; le classi di interfaccia sono comunque @MainActor.
let package = Package(
    name: "Mascotte",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "Mascotte",
            path: "Sources/Mascotte"
        )
    ],
    swiftLanguageVersions: [.v5]
)
