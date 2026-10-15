import Foundation
import Network
import Darwin

/// Server locale. Tutto il trasporto vive sulla coda privata; l'evento arriva sul main thread.
final class EventServer {
    static let defaultPort: UInt16 = 8766
    static var endpointURL: URL {
        CharacterLibrary.userDirectory.deletingLastPathComponent().appendingPathComponent("events.json")
    }

    private let queue = DispatchQueue(label: "local.mascotte.events")
    private let port: UInt16
    private let endpointURL: URL
    private let states: Set<String>
    private let onEvent: (MascotEvent) -> Void
    private let onReady: ((UInt16) -> Void)?
    private let token = (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "").lowercased()
    private var listener: NWListener?
    private var clients: [UUID: Client] = [:]
    private var requestTimes: [TimeInterval] = []

    init(port: UInt16 = EventServer.defaultPort, endpointURL: URL = EventServer.endpointURL,
         states: Set<String>, onReady: ((UInt16) -> Void)? = nil, onEvent: @escaping (MascotEvent) -> Void) {
        self.port = port
        self.endpointURL = endpointURL
        self.states = states
        self.onReady = onReady
        self.onEvent = onEvent
    }

    func start() {
        queue.async { [weak self] in self?.listen() }
    }

    func stop() {
        queue.sync { shutdown() }
    }

    private func listen() {
        guard listener == nil else { return }
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
            let newListener = try NWListener(using: parameters)
            listener = newListener
            newListener.stateUpdateHandler = { [weak self, weak newListener] state in
                guard let self else { return }
                switch state {
                case .ready:
                    guard let boundPort = newListener?.port?.rawValue else { self.shutdown(); return }
                    do {
                        try self.writeEndpoint(port: boundPort)
                        Log.info("Server eventi pronto su 127.0.0.1:\(boundPort)")
                        DispatchQueue.main.async { self.onReady?(boundPort) }
                    } catch {
                        Log.error("Server eventi: impossibile salvare le credenziali (\(error.localizedDescription))")
                        self.shutdown()
                    }
                case .failed(let error):
                    Log.warn("Server eventi non disponibile: \(error.localizedDescription)")
                    self.shutdown()
                case .waiting(let error):
                    Log.warn("Server eventi in attesa: \(error.localizedDescription)")
                    self.shutdown()
                default: break
                }
            }
            newListener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
            newListener.start(queue: queue)
        } catch {
            Log.warn("Server eventi non avviato: \(error.localizedDescription)")
            shutdown()
        }
    }

    private func accept(_ connection: NWConnection) {
        guard clients.count < 16 else { connection.cancel(); return }
        let id = UUID()
        let client = Client(connection: connection, queue: queue, token: token, states: states,
            received: { [weak self] event in
                guard let self else { return false }
                let now = ProcessInfo.processInfo.systemUptime
                self.requestTimes.removeAll { now - $0 >= 1 }
                guard self.requestTimes.count < 50 else { return false }
                self.requestTimes.append(now)
                DispatchQueue.main.async { self.onEvent(event) }
                return true
            }, closed: { [weak self] in self?.clients.removeValue(forKey: id) })
        clients[id] = client
        client.start()
    }

    private func writeEndpoint(port: UInt16) throws {
        let fm = FileManager.default
        let directory = endpointURL.deletingLastPathComponent()
        try fm.createDirectory(at: directory, withIntermediateDirectories: true,
                               attributes: [.posixPermissions: 0o700])
        let temporary = directory.appendingPathComponent(".events-\(UUID().uuidString)")
        let fd = open(temporary.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw POSIXError(.EACCES) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close(); try? fm.removeItem(at: temporary) }
        let data = try JSONSerialization.data(withJSONObject: ["port": Int(port), "token": token])
        try handle.write(contentsOf: data)
        try handle.synchronize()
        guard rename(temporary.path, endpointURL.path) == 0 else { throw POSIXError(.EACCES) }
    }

    private func shutdown() {
        listener?.stateUpdateHandler = nil
        listener?.newConnectionHandler = nil
        listener?.cancel()
        listener = nil
        let active = Array(clients.values)
        clients.removeAll()
        for client in active { client.close() }
        // Una seconda istanza non deve cancellare il file della prima.
        if let data = try? Data(contentsOf: endpointURL),
           let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
           object["token"] as? String == token {
            try? FileManager.default.removeItem(at: endpointURL)
        }
    }

    private final class Client {
        let connection: NWConnection
        let queue: DispatchQueue
        let token: String
        let states: Set<String>
        let received: (MascotEvent) -> Bool
        let closed: () -> Void
        var data = Data()
        var timeout: DispatchSourceTimer?
        var finished = false

        init(connection: NWConnection, queue: DispatchQueue, token: String, states: Set<String>,
             received: @escaping (MascotEvent) -> Bool, closed: @escaping () -> Void) {
            self.connection = connection; self.queue = queue; self.token = token
            self.states = states; self.received = received; self.closed = closed
        }

        func start() {
            let timer = DispatchSource.makeTimerSource(queue: queue)
            timer.schedule(deadline: .now() + 1)
            timer.setEventHandler { [weak self] in self?.close() }
            timeout = timer
            timer.resume()
            connection.stateUpdateHandler = { [weak self] state in
                if case .failed = state { self?.close() }
            }
            connection.start(queue: queue)
            read()
        }

        func read() {
            connection.receive(minimumIncompleteLength: 1, maximumLength: EventHTTP.maxRequestBytes + 1) { [weak self] bytes, _, complete, error in
                guard let self, !self.finished else { return }
                if let bytes { self.data.append(bytes) }
                switch EventHTTP.parse(self.data, token: self.token, states: self.states) {
                case .incomplete:
                    if complete || error != nil { self.reply(400) } else { self.read() }
                case .response(let status, let event):
                    if let event, !self.received(event) { self.reply(429) }
                    else { self.reply(status) }
                }
            }
        }

        func reply(_ status: Int) {
            connection.send(content: EventHTTP.response(status), completion: .contentProcessed { [weak self] _ in self?.close() })
        }

        func close() {
            guard !finished else { return }
            finished = true
            timeout?.cancel(); timeout = nil
            connection.stateUpdateHandler = nil
            connection.cancel()
            closed()
        }
    }
}
