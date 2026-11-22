// Lifeboard Break: menu-bar timer that covers every screen with the lifeboard during breaks.
// Build: break/build.sh. Settings: `defaults write com.lifeboard.break <key> <value>` (see Settings).
import AppKit
import WebKit

enum Settings {
    static let d = UserDefaults.standard
    static func register() {
        d.register(defaults: [
            "workMinutes": 50.0,
            "breakMinutes": 5.0,
            "postponeMinutes": 5.0,
            "maxPostpones": 2,
            "skipDelaySeconds": 15.0,
            "url": "",  // empty = bundled placeholder.html
        ])
    }
    static var work: TimeInterval { d.double(forKey: "workMinutes") * 60 }
    static var brk: TimeInterval { d.double(forKey: "breakMinutes") * 60 }
    static var postpone: TimeInterval { d.double(forKey: "postponeMinutes") * 60 }
    static var maxPostpones: Int { d.integer(forKey: "maxPostpones") }
    static var skipDelay: TimeInterval { d.double(forKey: "skipDelaySeconds") }
    static var url: String { d.string(forKey: "url") ?? "" }
}

final class OverlayWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

@MainActor
final class App: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {
    var status: NSStatusItem!
    var tick: Timer?
    var nextBreak = Date()
    var breakEnds: Date?
    var breakStarted = Date()
    var postponesLeft = 0
    var pausedUntil: Date?
    var windows: [NSWindow] = []
    var web: WKWebView?
    var popup: WKWebView?
    var homeRedirects = 0
    var frames: [WKFrameInfo] = []  // every frame that loaded the bridge (the lifeboard runs in an iframe)
    var countdown: NSTextField?
    var skipButton: NSButton?
    var postponeButton: NSButton?
    var keyMonitor: Any?
    var lastTick = Date()
    var awaySince: Date?  // set while asleep/locked; no break may start until the Mac is back

    /* menu-bar clownfish: a template image (follows light/dark menu bar). Stripes and eye are holes (even-odd). */
    static let clownfish: NSImage? = {
        let svg = """
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="16" viewBox="0 0 22 16">
        <path fill="black" fill-rule="evenodd" d="M2 8.5C2 5 5.4 2.6 9.5 2.6c1.2-1.4 3-2 4.4-1.4-.6.7-.9 1.5-.9 2.3C14.6 4.4 15.8 5.6 16.6 6.8L20.6 3.4c.5 1.6.5 3.3 0 4.9.5 1.6.5 3.3 0 4.9L16.6 9.8C15.4 12 12.6 13.9 9.5 13.9 5.4 13.9 2 11.6 2 8.5Z
          M6 4.4c.9 1.1 1.3 2.6 1.3 4.1s-.4 3-1.3 4.1c-.9-.4-1.5-.9-1.5-.9.6-.9.9-2 .9-3.2s-.3-2.3-.9-3.2c0 0 .6-.5 1.5-.9Z
          M11.2 3.1c1 1.4 1.5 3.4 1.5 5.4s-.5 4-1.5 5.4h-1.8c1-1.4 1.6-3.4 1.6-5.4s-.6-4-1.6-5.4Z
          M4 7.2a.9.9 0 1 0 0 .01Z"/>
        <path fill="black" d="M8 13.6c.6 1.2 1.6 1.8 2.8 1.6-.5-.5-.8-1-.9-1.7Z"/>
        </svg>
        """
        guard let img = NSImage(data: Data(svg.utf8)) else { return nil }
        img.size = NSSize(width: 22, height: 16)
        img.isTemplate = true
        return img
    }()

    func applicationDidFinishLaunching(_ n: Notification) {
        Settings.register()
        NSApp.setActivationPolicy(.accessory)
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        status.button?.image = Self.clownfish
        status.button?.imagePosition = .imageLeft
        buildMenu()
        resetWorkTimer()
        let ws = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.willSleepNotification, NSWorkspace.screensDidSleepNotification,
                     NSWorkspace.sessionDidResignActiveNotification] {
            ws.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.leave() }
            }
        }
        for name in [NSWorkspace.didWakeNotification, NSWorkspace.screensDidWakeNotification,
                     NSWorkspace.sessionDidBecomeActiveNotification] {
            ws.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.returned() }
            }
        }
        let dn = DistributedNotificationCenter.default()
        dn.addObserver(forName: .init("com.apple.screenIsLocked"), object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.leave() }
        }
        dn.addObserver(forName: .init("com.apple.screenIsUnlocked"), object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.returned() }
        }
        tick = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.onTick() }
        }
        if CommandLine.arguments.contains("--now") { startBreak() }
    }

    // MARK: timer

    func resetWorkTimer() {
        nextBreak = Date().addingTimeInterval(Settings.work)
        postponesLeft = Settings.maxPostpones
    }

    /// Mac went away (sleep, lock, fast user switch). Overlapping signals keep the earliest time.
    func leave() { if awaySince == nil { awaySince = Date() } }

    /// Mac is back, or the tick loop noticed it was suspended: decide what the away time means.
    func returned(from: Date? = nil) {
        let now = Date()
        guard let since = awaySince ?? from else { return }
        awaySince = nil
        lastTick = now
        let away = now.timeIntervalSince(since)
        switch Pacing.afterAway(away: away, breakLength: Settings.brk, onBreak: breakEnds != nil) {
        case .resetWork: resetWorkTimer()
        case .endBreak: endBreak(reason: "away")
        case .resume(let shift):
            nextBreak = nextBreak.addingTimeInterval(shift)
            breakEnds = breakEnds?.addingTimeInterval(shift)
        }
        log("away\t\(Int(away))s")
    }

    func onTick() {
        let now = Date()
        // A gap far over 1s means the process was suspended (sleep) without a notification first.
        if now.timeIntervalSince(lastTick) > Pacing.suspendGap { returned(from: awaySince ?? lastTick) }
        lastTick = now
        if awaySince != nil { return }  // asleep or locked: never start a break
        if let end = breakEnds {
            let left = end.timeIntervalSince(now)
            if left <= 0 { endBreak(reason: "done"); return }
            countdown?.stringValue = fmt(left)
            let skipIn = Settings.skipDelay - now.timeIntervalSince(breakStarted)
            skipButton?.isEnabled = skipIn <= 0
            skipButton?.title = skipIn > 0 ? "Skip (\(Int(skipIn.rounded(.up))))" : "Skip"
            toFrames("window.lifeboardBreak && window.lifeboardBreak._tick(\(Int(left)))")
            return
        }
        if let p = pausedUntil {
            if now < p { status.button?.title = "⏸"; return }
            pausedUntil = nil
            resetWorkTimer()
        }
        // Away from the keyboard for a break's length counts as a break.
        let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState,
                                                           eventType: CGEventType(rawValue: ~0)!)
        if idle >= Settings.brk { resetWorkTimer() }
        let left = nextBreak.timeIntervalSince(now)
        status.button?.title = " \(Int((left / 60).rounded(.up)))m"
        if left <= 0 { startBreak() }
    }

    func fmt(_ s: TimeInterval) -> String {
        let t = Int(s.rounded(.up)); return String(format: "%d:%02d", t / 60, t % 60)
    }

    // MARK: menu

    func buildMenu() {
        let m = NSMenu()
        m.addItem(withTitle: "Break now", action: #selector(breakNow), keyEquivalent: "b")
        m.addItem(withTitle: "Reset timer", action: #selector(resetNow), keyEquivalent: "r")
        m.addItem(withTitle: "Pause 1 hour", action: #selector(pauseHour), keyEquivalent: "p")
        m.addItem(.separator())
        m.addItem(choiceMenu("Work", key: "workMinutes", options: [25, 30, 45, 50, 60, 90]))
        m.addItem(choiceMenu("Break", key: "breakMinutes", options: [2, 3, 5, 10, 15]))
        m.addItem(.separator())
        m.addItem(withTitle: "Quit", action: #selector(quit), keyEquivalent: "q")
        for i in m.items where i.submenu == nil { i.target = self }
        status.menu = m
    }

    func choiceMenu(_ title: String, key: String, options: [Double]) -> NSMenuItem {
        let cur = Settings.d.double(forKey: key)
        let item = NSMenuItem(title: "\(title): \(Int(cur)) min", action: nil, keyEquivalent: "")
        let sub = NSMenu()
        for o in options {
            let i = NSMenuItem(title: "\(Int(o)) min", action: #selector(choose(_:)), keyEquivalent: "")
            i.target = self
            i.representedObject = [key: o]
            i.state = o == cur ? .on : .off
            sub.addItem(i)
        }
        item.submenu = sub
        return item
    }

    @objc func choose(_ i: NSMenuItem) {
        guard let kv = i.representedObject as? [String: Double], let (k, v) = kv.first else { return }
        Settings.d.set(v, forKey: k)
        if k == "workMinutes" { resetWorkTimer() }
        buildMenu()
    }
    @objc func breakNow() { startBreak() }
    @objc func resetNow() { pausedUntil = nil; resetWorkTimer() }
    @objc func pauseHour() { pausedUntil = Date().addingTimeInterval(3600) }
    @objc func quit() { NSApp.terminate(nil) }

    // MARK: overlay

    func startBreak() {
        guard breakEnds == nil else { return }
        breakStarted = Date()
        homeRedirects = 0
        breakEnds = breakStarted.addingTimeInterval(Settings.brk)
        status.button?.title = " break"

        let main = NSScreen.main ?? NSScreen.screens[0]
        for screen in NSScreen.screens {
            let w = OverlayWindow(contentRect: screen.frame, styleMask: .borderless,
                                  backing: .buffered, defer: false, screen: screen)
            w.level = .screenSaver
            w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
            w.isReleasedWhenClosed = false
            w.backgroundColor = NSColor(calibratedWhite: 0.07, alpha: 1)
            w.setFrame(screen.frame, display: true)
            if screen == main { w.contentView = mainContent(frame: screen.frame) }
            w.orderFrontRegardless()
            windows.append(w)
        }
        NSApp.activate(ignoringOtherApps: true)
        windows.first(where: { $0.screen == main })?.makeKeyAndOrderFront(nil)
        NSApp.presentationOptions = [.hideDock, .hideMenuBar, .disableProcessSwitching,
                                     .disableHideApplication, .disableAppleMenu]
        // Escape hatch: ⌃⌥⌘B ends the break immediately.
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
            let mods = e.modifierFlags.intersection([.control, .option, .command])
            if mods == [.control, .option, .command], e.charactersIgnoringModifiers == "b" {
                self?.endBreak(reason: "escape"); return nil
            }
            return e
        }
        onTick()
    }

    func mainContent(frame: NSRect) -> NSView {
        let root = NSView(frame: NSRect(origin: .zero, size: frame.size))
        let barH: CGFloat = 64

        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()  // persistent cookies: sign in once
        let uc = cfg.userContentController
        uc.add(self, name: "lifeboardBreak")
        uc.addUserScript(WKUserScript(source: Self.bridgeJS, injectionTime: .atDocumentStart,
                                      forMainFrameOnly: false))
        let wv = WKWebView(frame: NSRect(x: 0, y: barH, width: frame.width, height: frame.height - barH),
                           configuration: cfg)
        wv.autoresizingMask = [.width, .height]
        // Look like Safari so sign-in pages don't reject the embedded view.
        wv.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
        wv.uiDelegate = self
        wv.navigationDelegate = self
        wv.setValue(false, forKey: "drawsBackground")
        if let u = URL(string: Settings.url), !Settings.url.isEmpty {
            wv.load(URLRequest(url: u))
        } else if let p = Bundle.main.url(forResource: "placeholder", withExtension: "html") {
            wv.loadFileURL(p, allowingReadAccessTo: p.deletingLastPathComponent())
        }
        root.addSubview(wv)
        web = wv

        let bar = NSStackView()
        bar.orientation = .horizontal
        bar.spacing = 16
        let cd = NSTextField(labelWithString: "")
        cd.font = .monospacedDigitSystemFont(ofSize: 22, weight: .semibold)
        cd.textColor = .white
        let post = NSButton(title: "", target: self, action: #selector(postponeClicked))
        let skip = NSButton(title: "Skip", target: self, action: #selector(skipClicked))
        post.bezelStyle = .rounded; skip.bezelStyle = .rounded
        bar.addArrangedSubview(cd); bar.addArrangedSubview(post); bar.addArrangedSubview(skip)
        bar.frame = NSRect(x: 0, y: 0, width: frame.width, height: barH)
        bar.autoresizingMask = [.width]
        bar.alignment = .centerY
        bar.distribution = .gravityAreas
        bar.edgeInsets = NSEdgeInsets(top: 0, left: 24, bottom: 0, right: 24)
        root.addSubview(bar)
        countdown = cd; skipButton = skip; postponeButton = post
        refreshPostpone()
        return root
    }

    func refreshPostpone() {
        postponeButton?.title = "\(Int(Settings.postpone / 60)) more min (\(postponesLeft) left)"
        postponeButton?.isEnabled = postponesLeft > 0
    }

    @objc func skipClicked() { endBreak(reason: "skip") }
    @objc func postponeClicked() { postponeBreak() }

    func postponeBreak() {
        guard postponesLeft > 0 else { return }
        let left = postponesLeft - 1
        endBreak(reason: "postpone")
        nextBreak = Date().addingTimeInterval(Settings.postpone)
        postponesLeft = left
    }

    func endBreak(reason: String) {
        guard breakEnds != nil else { return }
        toFrames("window.dispatchEvent(new CustomEvent('lifeboardbreakend',{detail:'\(reason)'}))")
        breakEnds = nil
        if let m = keyMonitor { NSEvent.removeMonitor(m); keyMonitor = nil }
        NSApp.presentationOptions = []
        for w in windows { w.orderOut(nil) }
        let old = windows, oldWeb = web
        windows.removeAll(); frames.removeAll()
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {  // let the page save the end event first
            oldWeb?.configuration.userContentController.removeScriptMessageHandler(forName: "lifeboardBreak")
            _ = old
        }
        popup = nil; web = nil; countdown = nil; skipButton = nil; postponeButton = nil
        log(reason)
        resetWorkTimer()
    }

    func log(_ reason: String) {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LifeboardBreak")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let f = dir.appendingPathComponent("log.tsv")
        let line = "\(ISO8601DateFormatter().string(from: Date()))\t\(reason)\n"
        if let h = try? FileHandle(forWritingTo: f) { h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); try? h.close() }
        else { try? line.write(to: f, atomically: true, encoding: .utf8) }
    }

    // Sign-in popups (window.open): real child view on top, so window.opener works.
    func webView(_ wv: WKWebView, createWebViewWith c: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures f: WKWindowFeatures) -> WKWebView? {
        popup?.removeFromSuperview()
        let p = WKWebView(frame: wv.frame.insetBy(dx: wv.frame.width * 0.25, dy: wv.frame.height * 0.1),
                          configuration: c)
        p.customUserAgent = wv.customUserAgent
        p.uiDelegate = self
        p.navigationDelegate = self
        p.autoresizingMask = [.minXMargin, .maxXMargin, .minYMargin, .maxYMargin]
        wv.superview?.addSubview(p)
        popup = p
        return p
    }

    func webViewDidClose(_ wv: WKWebView) {
        guard wv == popup else { return }
        wv.removeFromSuperview(); popup = nil
        goHomeIfLost()
    }

    // After sign-in claude.ai lands somewhere other than the lifeboard: go back to it.
    func webView(_ wv: WKWebView, didFinish nav: WKNavigation!) {
        log("nav\t\(wv == web ? "main" : "popup")\t\(wv.url?.absoluteString ?? "-")")
        if wv == web { goHomeIfLost() }
    }

    func goHomeIfLost() {
        guard let wv = web, let target = URL(string: Settings.url), !Settings.url.isEmpty,
              let cur = wv.url, cur.host == target.host else { return }
        let path = cur.path.lowercased()
        let authy = ["login", "logout", "auth", "oauth", "magic", "verify", "callback", "sso"]
        if path.contains("artifact") || authy.contains(where: { path.contains($0) }) { return }
        guard homeRedirects < 2 else { return }  // never loop
        homeRedirects += 1
        log("redirect-home\t\(cur.absoluteString)")
        wv.load(URLRequest(url: target))
    }

    // MARK: JS bridge — page can call window.lifeboardBreak.skip() / .postpone() / .done()

    static let bridgeJS = """
    window.lifeboardBreak = {
      active: true, secondsLeft: null,
      skip() { webkit.messageHandlers.lifeboardBreak.postMessage('skip') },
      postpone() { webkit.messageHandlers.lifeboardBreak.postMessage('postpone') },
      done() { webkit.messageHandlers.lifeboardBreak.postMessage('done') },
      _tick(s) { this.secondsLeft = s; window.dispatchEvent(new CustomEvent('lifeboardbreaktick', {detail: s})) }
    };
    webkit.messageHandlers.lifeboardBreak.postMessage('hello');
    """

    func toFrames(_ js: String) {
        guard let wv = web else { return }
        if frames.isEmpty { wv.evaluateJavaScript(js); return }
        for f in frames { wv.evaluateJavaScript(js, in: f, in: .page, completionHandler: nil) }
    }

    func userContentController(_ c: WKUserContentController, didReceive msg: WKScriptMessage) {
        switch msg.body as? String ?? "" {
        case "hello":
            frames.removeAll { $0.request.url == msg.frameInfo.request.url && $0.isMainFrame == msg.frameInfo.isMainFrame }
            frames.append(msg.frameInfo)
        case "skip": endBreak(reason: "skip-page")
        case "postpone": postponeBreak()
        case "done": endBreak(reason: "done-page")
        default: break
        }
    }
}

@main
struct Main {
    static func main() {
        MainActor.assumeIsolated {
            let app = NSApplication.shared
            let delegate = App()
            app.delegate = delegate
            app.run()
        }
    }
}
