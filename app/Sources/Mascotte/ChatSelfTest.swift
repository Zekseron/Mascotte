import Foundation

@MainActor
enum ChatSelfTest {
    static func run() -> [(String, Bool)] {
        var results: [(String, Bool)] = []
        let id = "00000000-0000-0000-0000-000000000001"
        let codex = Data("{\"type\":\"thread.started\",\"thread_id\":\"\(id)\"}\n{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"Ciao!\"}}\n{\"type\":\"turn.completed\"}\n".utf8)
        if case .success(let answer) = ChatProtocol.decode(codex, engine: .codex, exitCode: 0, stderr: Data()) {
            results.append(("Codex JSONL: risposta e sessione recuperate", answer.text == "Ciao!" && answer.sessionID == id))
        } else { results.append(("Codex JSONL: risposta e sessione recuperate", false)) }
        if case .failure = ChatProtocol.decode(Data(codex.dropLast(27)), engine: .codex, exitCode: 0, stderr: Data()) {
            results.append(("Codex senza completamento non diventa una risposta riuscita", true))
        } else { results.append(("Codex senza completamento non diventa una risposta riuscita", false)) }
        let failed = Data("{\"type\":\"turn.failed\",\"error\":{\"message\":\"Limite raggiunto\"}}\n".utf8)
        if case .failure(.service(let error)) = ChatProtocol.decode(failed, engine: .codex, exitCode: 1, stderr: Data()) {
            results.append(("errore/limite Codex mostrato correttamente", error == "Limite raggiunto"))
        } else { results.append(("errore/limite Codex mostrato correttamente", false)) }
        let claude = Data("{\"session_id\":\"\(id)\",\"result\":\"Ciao Claude\",\"is_error\":false}".utf8)
        if case .success(let answer) = ChatProtocol.decode(claude, engine: .claude, exitCode: 0, stderr: Data()) {
            results.append(("Claude JSON: risposta e sessione recuperate", answer.text == "Ciao Claude" && answer.sessionID == id))
        } else { results.append(("Claude JSON: risposta e sessione recuperate", false)) }
        if case .failure = ChatProtocol.decode(Data("{\"result\":\"Errore\",\"is_error\":true}".utf8), engine: .claude, exitCode: 0, stderr: Data()) {
            results.append(("errore Claude non confuso con una risposta", true))
        } else { results.append(("errore Claude non confuso con una risposta", false)) }
        results.append(("resume Codex usa l'id esplicito, senza --last", ChatProtocol.arguments(engine: .codex, sessionID: id).contains(id) && !ChatProtocol.arguments(engine: .codex, sessionID: id).contains("--last")))
        results.append(("resume Claude usa l'id esplicito", ChatProtocol.arguments(engine: .claude, sessionID: id).suffix(2) == ["--resume", id]))
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("mascotte-chat-test-\(UUID().uuidString)")
        do {
            try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: temporary) }
            let store = ChatStore(directory: temporary)
            try store.save(ChatConversation(sessionID: id, messages: [ChatMessage(role: "user", text: "ciao")]), for: .codex)
            try store.save(ChatConversation(messages: [ChatMessage(role: "assistant", text: "Claude")]), for: .claude)
            let loaded = ChatStore(directory: temporary)
            results.append(("conversazioni per IA separate e recuperate alla riapertura", loaded.conversation(for: .codex).sessionID == id && loaded.conversation(for: .claude).messages.first?.text == "Claude"))
            let mode = (try FileManager.default.attributesOfItem(atPath: temporary.appendingPathComponent("history.json").path)[.posixPermissions] as? NSNumber)?.intValue
            results.append(("cronologia locale leggibile solo dall'utente (0600)", mode == 0o600))
            try store.save(ChatConversation(), for: .codex)
            results.append(("Nuova chat cancella il riferimento della sola IA scelta", ChatStore(directory: temporary).conversation(for: .codex).sessionID == nil && ChatStore(directory: temporary).conversation(for: .claude).messages.count == 1))

            let fixture = StatesSpec.projectRoot().appendingPathComponent("tools/test/fixtures/chat_cli.py")
            guard FileManager.default.isExecutableFile(atPath: fixture.path) else {
                print("         (fixture CLI assente: controlli dei processi simulati saltati)")
                return results
            }
            let capture = temporary.appendingPathComponent("capture.json")
            func run(_ scenario: String, engine: ChatEngine = .codex, timeout: Double = 3, interrupt: Bool = false, prompt: String = "Ciao $(touch non-creare-questo-file)") -> Result<ChatAnswer, ChatFailure>? {
                let request = ChatRun()
                var answer: Result<ChatAnswer, ChatFailure>?
                var env = ChatCLI.environment(for: fixture)
                env["MASCOTTE_CHAT_SCENARIO"] = scenario
                env["MASCOTTE_CHAT_CAPTURE"] = capture.path
                request.start(executable: fixture, arguments: ChatProtocol.arguments(engine: engine, sessionID: id), environment: env,
                              directory: temporary, input: prompt, engine: engine, timeout: timeout) { answer = $0 }
                if interrupt { DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { request.cancel() } }
                let end = Date().addingTimeInterval(5)
                while answer == nil && Date() < end { RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01)) }
                if answer == nil { request.stopImmediately() }
                return answer
            }
            if case .success(let answer)? = run("success") {
                results.append(("processo Codex simulato risponde attraverso stdin", answer.text.contains("$(touch")))
            } else { results.append(("processo Codex simulato risponde attraverso stdin", false)) }
            let captured = (try? JSONSerialization.jsonObject(with: Data(contentsOf: capture))) as? [String: Any]
            results.append(("prompt non presente negli argomenti e non eseguito come shell", !(captured?["arguments"] as? [String] ?? []).contains("Ciao $(touch non-creare-questo-file)") && !FileManager.default.fileExists(atPath: temporary.appendingPathComponent("non-creare-questo-file").path)))
            if case .success? = run("success", engine: .claude) { results.append(("processo Claude simulato risponde", true)) }
            else { results.append(("processo Claude simulato risponde", false)) }
            if case .failure(.cancelled)? = run("slow", interrupt: true) { results.append(("Interrompi ferma il processo senza bloccare l'interfaccia", true)) }
            else { results.append(("Interrompi ferma il processo senza bloccare l'interfaccia", false)) }
            if case .failure(.timeout)? = run("slow", timeout: 0.05) { results.append(("timeout di una CLI bloccata", true)) }
            else { results.append(("timeout di una CLI bloccata", false)) }
            let oversized = run("oversize")
            if case .failure(.outputLimit)? = oversized { results.append(("output enorme fermato e memoria limitata", true)) }
            else {
                if case .failure(let error)? = oversized { print("         output enorme: \(error.localizedDescription)") }
                if oversized == nil { print("         output enorme: completamento non ricevuto") }
                results.append(("output enorme fermato e memoria limitata", false))
            }
            if case .failure? = run("early-exit", prompt: String(repeating: "x", count: 32768)) { results.append(("CLI che chiude stdin: errore gestito senza SIGPIPE", true)) }
            else { results.append(("CLI che chiude stdin: errore gestito senza SIGPIPE", false)) }
        } catch { results.append(("preparazione dei test micro chat", false)) }
        return results
    }
}
