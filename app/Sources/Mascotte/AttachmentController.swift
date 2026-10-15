import AppKit

/// Placement is separate from animation: future seated sprites can use the same anchor.
enum AttachmentGeometry {
    static func origin(size: CGSize, edge: CGRect, area: CGRect, fraction: CGFloat, anchor: CGPoint? = nil) -> CGPoint {
        let x = edge.minX + edge.width * min(1, max(0, fraction)) - (anchor?.x ?? size.width / 2)
        let below = anchor?.y ?? 0
        return CGPoint(x: min(max(x, area.minX), max(area.minX, area.maxX - size.width)).rounded(),
                       y: min(max(edge.maxY-below, area.minY-below), max(area.minY-below, area.maxY - size.height)).rounded())
    }
    static func appKitRect(_ quartz: CGRect, primaryHeight: CGFloat) -> CGRect {
        CGRect(x: quartz.minX, y: primaryHeight - quartz.maxY, width: quartz.width, height: quartz.height)
    }
}

@MainActor
final class AttachmentController {
    enum Mode: String { case free, dock, window }
    private(set) var mode: Mode = .free
    private weak var window: MascotWindowController?
    private var target: CGWindowID?
    private var targetPID: pid_t?
    private var fraction: CGFloat = 0.8
    private var screenID: CGDirectDisplayID?
    private var timer: Timer?
    private var concealed = false
    private var lastExternalPID: pid_t?
    private var activationObserver: NSObjectProtocol?
    var onChanged: ((Mode) -> Void)?

    init(window: MascotWindowController) {
        self.window = window
        let ownPID = ProcessInfo.processInfo.processIdentifier
        if let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier, pid != ownPID { lastExternalPID = pid }
        activationObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] notification in
            guard let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  application.processIdentifier != ownPID else { return }
            MainActor.assumeIsolated { self?.lastExternalPID = application.processIdentifier }
        }
    }
    deinit { if let activationObserver { NSWorkspace.shared.notificationCenter.removeObserver(activationObserver) } }

    func dock() {
        detach()
        guard let panel = window?.panel else { return }
        let screen = panel.screen ?? NSScreen.main ?? NSScreen.screens.first
        screenID = (screen?.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
        if let area = screen?.visibleFrame { fraction = min(1, max(0, (panel.frame.midX-area.minX)/area.width)) }
        mode = .dock; onChanged?(mode); resume()
    }

    /// The frontmost application's topmost normal window. No pixels or window titles are read.
    func activeWindow() -> Bool {
        let ownPID = ProcessInfo.processInfo.processIdentifier
        let frontPID = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let desiredPID = frontPID == ownPID ? lastExternalPID : frontPID
        guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]],
              let info = list.first(where: {
                  let pid = ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value
                  return pid != nil && pid != ownPID && (desiredPID == nil || pid == desiredPID) &&
                  ($0[kCGWindowLayer as String] as? NSNumber)?.intValue == 0 &&
                  Self.bounds($0).map { $0.width > 100 && $0.height > 60 } == true
              }), let id = info[kCGWindowNumber as String] as? NSNumber,
              let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value, let rect = Self.bounds(info)
        else { return false }
        detach()
        target = id.uint32Value; targetPID = pid
        if let panel = window?.panel { fraction = min(1, max(0, (panel.frame.midX-rect.minX)/rect.width)) }
        mode = .window; onChanged?(mode); resume(); return true
    }

    func detach() {
        timer?.invalidate(); timer = nil; target = nil; targetPID = nil
        if concealed, Settings.isVisible { window?.show() }
        concealed = false; mode = .free; onChanged?(mode)
    }

    func suspend() { timer?.invalidate(); timer = nil }
    func resume() {
        guard mode != .free, Settings.isVisible else { return }
        update()
        guard mode != .free, timer == nil else { return }
        let t = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.update() }
        }
        t.tolerance = 0.04; RunLoop.main.add(t, forMode: .common); timer = t
    }

    private static func bounds(_ info: [String: Any]) -> CGRect? {
        guard let dict = info[kCGWindowBounds as String] as? [String: Any],
              let rect = CGRect(dictionaryRepresentation: dict as CFDictionary), rect.width > 0, rect.height > 0 else { return nil }
        return AttachmentGeometry.appKitRect(rect, primaryHeight: NSScreen.screens.first?.frame.height ?? 0)
    }

    private func update() {
        guard let w = window, Settings.isVisible else { suspend(); return }
        var edge: CGRect
        var screen: NSScreen?
        if mode == .dock {
            screen = NSScreen.screens.first { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == screenID }
                ?? w.panel.screen ?? NSScreen.main
            guard let area = screen?.visibleFrame else { return }
            edge = CGRect(x: area.minX, y: area.minY, width: area.width, height: 0)
        } else if mode == .window, let id = target {
            guard let list = CGWindowListCopyWindowInfo(.optionIncludingWindow, id) as? [[String: Any]],
                  let info = list.first(where: { ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value == id }),
                  (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == targetPID
            else { detach(); return }
            guard (info[kCGWindowIsOnscreen as String] as? Bool) == true, let rect = Self.bounds(info),
                  let matched = NSScreen.screens.max(by: { $0.frame.intersection(rect).area < $1.frame.intersection(rect).area }),
                  matched.frame.intersects(rect)
            else { if w.isShown { w.hide() }; concealed = true; return }
            screen = matched; edge = rect
        } else { return }
        guard let area = screen?.visibleFrame else { return }
        let origin = AttachmentGeometry.origin(size: w.panel.frame.size, edge: edge, area: area, fraction: fraction, anchor:w.attachmentAnchor)
        if w.panel.frame.origin != origin { w.panel.setFrameOrigin(origin); w.updateMouseTransparency() }
        if concealed { w.show(); concealed = false }
    }
}

private extension CGRect {
    var area: CGFloat { isNull ? 0 : width * height }
}
