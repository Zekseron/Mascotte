import Foundation
import Darwin

enum ChatEngine: String, CaseIterable, Codable {
    case codex, claude
    var title: String { self == .codex ? "Codex" : "Claude" }
}

struct ChatAnswer {
    let text: String
    let sessionID: String
}

enum ChatFailure: Error, LocalizedError, Equatable {
    case unavailable(String), service(String), cancelled, timeout, outputLimit
    var errorDescription: String? {
        switch self {
        case .unavailable(let engine): return "\(engine) non è disponibile. Apri la sua app o CLI e verifica l’accesso."
        case .service(let message): return message
        case .cancelled: return "Risposta interrotta."
        case .timeout: return "La risposta ha impiegato troppo tempo. Puoi riprovare."
        case .outputLimit: return "La risposta è troppo grande per questa chat. Prova una domanda più breve."
        }
    }
}

enum ChatProtocol {
    static let instructions = "Sei l’assistente nella micro chat Mascotte. Rispondi nella lingua dell’utente, in modo chiaro e conciso. È una chat per domande e risposte: non eseguire comandi, non modificare file e non avviare altri agenti."

    static func arguments(engine: ChatEngine, sessionID: String?) -> [String] {
        switch engine {
        case .claude:
            var args = ["--print", "--output-format", "json", "--tools", "", "--permission-mode", "dontAsk",
                        "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--disable-slash-commands",
                        "--append-system-prompt", instructions]
            if let sessionID { args += ["--resume", sessionID] }
            return args
        case .codex:
            var args = ["exec"]
            if sessionID != nil { args += ["resume"] }
            args += ["--json", "--skip-git-repo-check", "--config", "approval_policy=\"never\"",
                     "--config", "sandbox_mode=\"read-only\"", "--config", "developer_instructions=" + jsonString(instructions)]
            if sessionID == nil { args += ["--sandbox", "read-only"] }
            if let sessionID { args += [sessionID] }
            args += ["-"]
            return args
        }
    }

    private static func jsonString(_ value: String) -> String {
        String(decoding: try! JSONSerialization.data(withJSONObject: value, options: .fragmentsAllowed), as: UTF8.self)
    }

    static func decode(_ data: Data, engine: ChatEngine, exitCode: Int32, stderr: Data) -> Result<ChatAnswer, ChatFailure> {
        var message: String?
        var sessionID: String?
        var failure: String?
        var completed = false
        if engine == .claude {
            if let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                sessionID = value["session_id"] as? String
                message = value["result"] as? String
                if value["is_error"] as? Bool == true {
                    failure = message ?? (value["errors"] as? [String])?.joined(separator: "\n") ?? "Claude non ha completato la risposta."
                } else { completed = true }
            }
        } else {
            for line in data.split(separator: 10) {
                guard let value = (try? JSONSerialization.jsonObject(with: Data(line))) as? [String: Any] else { continue }
                switch value["type"] as? String {
                case "thread.started": sessionID = value["thread_id"] as? String
                case "item.completed":
                    if let item = value["item"] as? [String: Any], item["type"] as? String == "agent_message" {
                        message = item["text"] as? String
                    }
                case "turn.completed": completed = true
                case "turn.failed":
                    failure = (value["error"] as? [String: Any])?["message"] as? String ?? "Codex non ha completato la risposta."
                case "error": failure = value["message"] as? String ?? "Codex ha restituito un errore."
                default: break
                }
            }
        }
        if let failure { return .failure(.service(String(failure.prefix(1500)))) }
        guard exitCode == 0 else {
            let detail = String(decoding: stderr, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            return .failure(.service(detail.isEmpty ? "\(engine.title) non ha risposto. Verifica l’accesso e i limiti del tuo account." : String(detail.suffix(1500))))
        }
        guard completed, let message, !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let sessionID, UUID(uuidString: sessionID) != nil else {
            return .failure(.service("Non ho ricevuto una risposta completa da \(engine.title). Puoi riprovare."))
        }
        return .success(ChatAnswer(text: String(message.prefix(100_000)), sessionID: sessionID))
    }
}

enum ChatCLI {
    static func find(_ engine: ChatEngine, environment: [String: String] = ProcessInfo.processInfo.environment) -> URL? {
        let fm = FileManager.default
        if let override = environment["MASCOTTE_CHAT_" + engine.rawValue.uppercased()], fm.isExecutableFile(atPath: override) {
            return URL(fileURLWithPath: override)
        }
        var candidates = (environment["PATH"] ?? "/usr/bin:/bin").split(separator: ":").map { String($0) + "/" + engine.rawValue }
        let home = fm.homeDirectoryForCurrentUser
        candidates += [home.appendingPathComponent(".local/bin/\(engine.rawValue)").path,
                       "/opt/homebrew/bin/\(engine.rawValue)", "/usr/local/bin/\(engine.rawValue)"]
        if engine == .claude {
            let versions = home.appendingPathComponent(".nvm/versions/node")
            let folders = (try? fm.contentsOfDirectory(at: versions, includingPropertiesForKeys: nil)) ?? []
            candidates += folders.sorted { $0.lastPathComponent.compare($1.lastPathComponent, options: .numeric) == .orderedDescending }
                .map { $0.appendingPathComponent("bin/claude").path }
        } else {
            for app in ["ChatGPT", "Codex"] {
                candidates += ["/Applications/\(app).app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
                               "/Applications/\(app).app/Contents/Resources/codex"]
            }
        }
        return candidates.first(where: { fm.isExecutableFile(atPath: $0) }).map { URL(fileURLWithPath: $0) }
    }

    static func environment(for executable: URL) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = executable.deletingLastPathComponent().path + ":" + (env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin")
        // Le CLI usano il login già salvato; nessuna API key viene aggiunta o richiesta.
        for name in ["OPENAI_API_KEY", "CODEX_API_KEY", "ANTHROPIC_API_KEY"] { env.removeValue(forKey: name) }
        return env
    }
}

/// Il processo e le sue pipe vivono fuori dal main thread. Il prompt passa solo su stdin.
final class ChatRun {
    private let lock = NSLock()
    private var process: Process?
    private var reason: ChatFailure?
    private var ownsGroup = false
    private var output = Data()
    private var diagnostic = Data()
    private let limit = 2_097_152

    func cancel(_ why: ChatFailure = .cancelled) {
        lock.lock()
        if reason == nil { reason = why }
        let active = process
        let group = ownsGroup
        lock.unlock()
        guard let active, active.isRunning else { return }
        signal(active, group: group, value: SIGINT)
        DispatchQueue.global().asyncAfter(deadline: .now() + 1) { [weak self, weak active] in
            guard let active, active.isRunning else { return }
            self?.signal(active, group: group, value: SIGTERM)
            DispatchQueue.global().asyncAfter(deadline: .now() + 1) { [weak self, weak active] in
                guard let active, active.isRunning else { return }
                self?.signal(active, group: group, value: SIGKILL)
            }
        }
    }

    private func signal(_ p: Process, group: Bool, value: Int32) {
        let pid = p.processIdentifier
        if pid > 0 { _ = kill(group ? -pid : pid, value) }
    }

    func stopImmediately() {
        cancel()
        lock.lock(); let active = process, group = ownsGroup; lock.unlock()
        if let active, active.isRunning { signal(active, group: group, value: SIGTERM) }
    }

    func start(executable: URL, arguments: [String], environment: [String: String], directory: URL,
               input: String, engine: ChatEngine, timeout: TimeInterval = 180,
               completion: @escaping (Result<ChatAnswer, ChatFailure>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            let p = Process(), stdout = Pipe(), stderr = Pipe(), stdin = Pipe()
            p.executableURL = executable; p.arguments = arguments; p.environment = environment
            p.currentDirectoryURL = directory
            p.standardOutput = stdout; p.standardError = stderr; p.standardInput = stdin
            do {
                lock.lock()
                if let reason { lock.unlock(); finish(.failure(reason), completion); return }
                do { try p.run() } catch { lock.unlock(); throw error }
                process = p; ownsGroup = getpgid(p.processIdentifier) == p.processIdentifier
                lock.unlock()
            } catch {
                finish(.failure(.service("Non riesco ad avviare \(engine.title): \(error.localizedDescription)")), completion)
                return
            }
            let readers = DispatchGroup()
            for (handle, isOutput) in [(stdout.fileHandleForReading, true), (stderr.fileHandleForReading, false)] {
                readers.enter()
                DispatchQueue.global().async { [self] in
                    defer { readers.leave() }
                    while true {
                        // Al limite basta un byte in più: una lettura da 8 KiB
                        // potrebbe attendere altri dati invece di fermare subito la CLI.
                        lock.lock()
                        let amount = isOutput ? min(8192, limit - output.count + 1) : 8192
                        lock.unlock()
                        guard let data = try? handle.read(upToCount: amount), !data.isEmpty else { break }
                        lock.lock()
                        if isOutput {
                            if output.count + data.count <= limit { output.append(data) }
                            else { lock.unlock(); cancel(.outputLimit); break }
                        } else if diagnostic.count < 32_768 {
                            diagnostic.append(data.prefix(32_768 - diagnostic.count))
                        }
                        lock.unlock()
                    }
                }
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak self, weak p] in
                if p?.isRunning == true { self?.cancel(.timeout) }
            }
            do { try stdin.fileHandleForWriting.write(contentsOf: Data(input.utf8)); try stdin.fileHandleForWriting.close() }
            catch { try? stdin.fileHandleForWriting.close(); cancel(.service("Non riesco a inviare il messaggio.")) }
            p.waitUntilExit()
            if readers.wait(timeout: .now() + 2) == .timedOut {
                if ownsGroup { _ = kill(-p.processIdentifier, SIGTERM) }
                cancel(.service("Il processo non ha chiuso la risposta correttamente."))
            }
            try? stdout.fileHandleForReading.close(); try? stderr.fileHandleForReading.close()
            lock.lock()
            let data = output, errors = diagnostic, failure = reason
            process = nil
            lock.unlock()
            let result = failure.map { Result<ChatAnswer, ChatFailure>.failure($0) }
                ?? ChatProtocol.decode(data, engine: engine, exitCode: p.terminationStatus, stderr: errors)
            finish(result, completion)
        }
    }

    private func finish(_ result: Result<ChatAnswer, ChatFailure>, _ completion: @escaping (Result<ChatAnswer, ChatFailure>) -> Void) {
        DispatchQueue.main.async { completion(result) }
    }
}
