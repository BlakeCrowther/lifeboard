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
final class App: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var status: NSStatusItem!
    var tick: Timer?
    var nextBreak = Date()
    var breakEnds: Date?
    var breakStarted = Date()
    var postponesLeft = 0
    var pausedUntil: Date?
    var windows: [NSWindow] = []
    var web: WKWebView?
    var countdown: NSTextField?
    var skipButton: NSButton?
    var postponeButton: NSButton?
    var keyMonitor: Any?

    func applicationDidFinishLaunching(_ n: Notification) {
        Settings.register()
        NSApp.setActivationPolicy(.accessory)
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        buildMenu()
        resetWorkTimer()
        let ws = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didWakeNotification, NSWorkspace.screensDidWakeNotification] {
            ws.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { if self?.breakEnds == nil { self?.resetWorkTimer() } }
            }
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

    func onTick() {
        let now = Date()
        if let end = breakEnds {
            let left = end.timeIntervalSince(now)
            if left <= 0 { endBreak(reason: "done"); return }
            countdown?.stringValue = fmt(left)
            let skipIn = Settings.skipDelay - now.timeIntervalSince(breakStarted)
            skipButton?.isEnabled = skipIn <= 0
            skipButton?.title = skipIn > 0 ? "Skip (\(Int(skipIn.rounded(.up))))" : "Skip"
            web?.evaluateJavaScript("window.lifeboardBreak && window.lifeboardBreak._tick(\(Int(left)))")
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
        status.button?.title = "🐟 \(Int((left / 60).rounded(.up)))m"
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
        m.addItem(withTitle: "Quit", action: #selector(quit), keyEquivalent: "q")
        for i in m.items { i.target = self }
        status.menu = m
    }
    @objc func breakNow() { startBreak() }
    @objc func resetNow() { pausedUntil = nil; resetWorkTimer() }
    @objc func pauseHour() { pausedUntil = Date().addingTimeInterval(3600) }
    @objc func quit() { NSApp.terminate(nil) }

    // MARK: overlay

    func startBreak() {
        guard breakEnds == nil else { return }
        breakStarted = Date()
        breakEnds = breakStarted.addingTimeInterval(Settings.brk)
        status.button?.title = "🐟 break"

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
        web?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('lifeboardbreakend',{detail:'\(reason)'}))")
        breakEnds = nil
        if let m = keyMonitor { NSEvent.removeMonitor(m); keyMonitor = nil }
        NSApp.presentationOptions = []
        web?.configuration.userContentController.removeScriptMessageHandler(forName: "lifeboardBreak")
        for w in windows { w.orderOut(nil) }
        windows.removeAll()
        web = nil; countdown = nil; skipButton = nil; postponeButton = nil
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

    // MARK: JS bridge — page can call window.lifeboardBreak.skip() / .postpone() / .done()

    static let bridgeJS = """
    window.lifeboardBreak = {
      active: true, secondsLeft: null,
      skip() { webkit.messageHandlers.lifeboardBreak.postMessage('skip') },
      postpone() { webkit.messageHandlers.lifeboardBreak.postMessage('postpone') },
      done() { webkit.messageHandlers.lifeboardBreak.postMessage('done') },
      _tick(s) { this.secondsLeft = s; window.dispatchEvent(new CustomEvent('lifeboardbreaktick', {detail: s})) }
    };
    """

    func userContentController(_ c: WKUserContentController, didReceive msg: WKScriptMessage) {
        switch msg.body as? String ?? "" {
        case "skip": endBreak(reason: "skip-page")
        case "postpone": postponeBreak()
        case "done": endBreak(reason: "done-page")
        default: break
        }
    }
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = App()
    app.delegate = delegate
    app.run()
}
