import Foundation
import Darwin

struct ChatMessage: Codable {
    let role: String
    let text: String
}

struct ChatConversation: Codable {
    var sessionID: String?
    var messages: [ChatMessage] = []
}

final class ChatStore {
    static var directory: URL {
        if let override = ProcessInfo.processInfo.environment["MASCOTTE_CHAT_DATA_DIR"] {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        return CharacterLibrary.userDirectory.deletingLastPathComponent().appendingPathComponent("chat", isDirectory: true)
    }
    let directory: URL
    private let file: URL
    private(set) var conversations: [String: ChatConversation]

    init(directory: URL = ChatStore.directory) {
        self.directory = directory
        file = directory.appendingPathComponent("history.json")
        if let size = (try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize, size <= 1_048_576,
           let data = try? Data(contentsOf: file),
           let saved = try? JSONDecoder().decode([String: ChatConversation].self, from: data) {
            conversations = saved.filter { ChatEngine(rawValue: $0.key) != nil }
            for key in Array(conversations.keys) {
                var conversation = conversations[key]!
                if let id = conversation.sessionID, UUID(uuidString: id) == nil { conversation.sessionID = nil }
                conversation.messages = Array(conversation.messages.suffix(60))
                conversations[key] = conversation
            }
        } else { conversations = [:] }
    }

    func conversation(for engine: ChatEngine) -> ChatConversation { conversations[engine.rawValue] ?? ChatConversation() }

    func prepareDirectory() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    }

    func save(_ conversation: ChatConversation, for engine: ChatEngine) throws {
        var reduced = conversation
        reduced.messages = Array(conversation.messages.suffix(60)).map { ChatMessage(role: $0.role, text: String($0.text.prefix(8000))) }
        conversations[engine.rawValue] = reduced
        var encoded = try JSONEncoder().encode(conversations)
        while encoded.count > 1_048_576 {
            guard let key = conversations.keys.filter({ !(conversations[$0]?.messages.isEmpty ?? true) })
                .max(by: { (conversations[$0]?.messages.count ?? 0) < (conversations[$1]?.messages.count ?? 0) }) else { break }
            conversations[key]?.messages.removeFirst()
            encoded = try JSONEncoder().encode(conversations)
        }
        try prepareDirectory()
        let temporary = directory.appendingPathComponent(".history-\(UUID().uuidString)")
        let fd = open(temporary.path, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw POSIXError(.EACCES) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close(); try? FileManager.default.removeItem(at: temporary) }
        try handle.write(contentsOf: encoded)
        try handle.synchronize()
        guard rename(temporary.path, file.path) == 0 else { throw POSIXError(.EACCES) }
    }
}
