import Foundation

/// Il ponte trasmette solo questi due campi: nessun prompt, percorso o risultato degli strumenti.
struct MascotEvent: Equatable {
    let state: String
    let source: String
}

enum EventHTTP {
    static let maxRequestBytes = 4096
    static let maxBodyBytes = 512

    enum Result {
        case incomplete
        case response(Int, MascotEvent?)
    }

    /// Una richiesta per connessione. Niente chunked, richieste concatenate o header duplicati.
    static func parse(_ data: Data, token: String, states: Set<String>) -> Result {
        guard data.count <= maxRequestBytes else { return .response(413, nil) }
        guard let boundary = data.range(of: Data("\r\n\r\n".utf8)) else { return .incomplete }
        guard let text = String(data: data[..<boundary.lowerBound], encoding: .utf8) else { return .response(400, nil) }
        let lines = text.components(separatedBy: "\r\n")
        let request = (lines.first ?? "").split(separator: " ", omittingEmptySubsequences: false)
        guard request.count == 3, ["HTTP/1.0", "HTTP/1.1"].contains(String(request[2])) else { return .response(400, nil) }
        guard request[1] == "/event" else { return .response(404, nil) }
        guard request[0] == "POST" else { return .response(405, nil) }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":"), !line.hasPrefix(" "), !line.hasPrefix("\t") else { return .response(400, nil) }
            let key = String(line[..<colon]).lowercased()
            guard !key.isEmpty, key.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }), headers[key] == nil else { return .response(400, nil) }
            headers[key] = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
        }
        guard headers["origin"] == nil else { return .response(403, nil) }
        guard headers["transfer-encoding"] == nil else { return .response(400, nil) }
        guard equal(headers["authorization"] ?? "", "Bearer " + token) else { return .response(401, nil) }
        guard headers["content-type"]?.lowercased().split(separator: ";").first == "application/json" else { return .response(415, nil) }
        guard let rawLength = headers["content-length"], !rawLength.isEmpty,
              rawLength.allSatisfy({ $0 >= "0" && $0 <= "9" }), let length = Int(rawLength) else { return .response(400, nil) }
        guard length > 0, length <= maxBodyBytes else { return .response(413, nil) }
        let body = data[boundary.upperBound...]
        if body.count < length { return .incomplete }
        guard body.count == length,
              let object = (try? JSONSerialization.jsonObject(with: Data(body))) as? [String: Any],
              Set(object.keys) == ["state", "source"],
              let state = object["state"] as? String, states.contains(state),
              let source = object["source"] as? String, ["claude", "codex", "manual"].contains(source) else { return .response(400, nil) }
        return .response(204, MascotEvent(state: state, source: source))
    }

    private static func equal(_ a: String, _ b: String) -> Bool {
        let left = Array(a.utf8), right = Array(b.utf8)
        guard left.count == right.count else { return false }
        var different: UInt8 = 0
        for i in left.indices { different |= left[i] ^ right[i] }
        return different == 0
    }

    static func response(_ status: Int) -> Data {
        let reason = [204: "No Content", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
                      404: "Not Found", 405: "Method Not Allowed", 413: "Payload Too Large",
                      415: "Unsupported Media Type", 429: "Too Many Requests"][status] ?? "Error"
        return Data("HTTP/1.1 \(status) \(reason)\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8)
    }
}
