// Transient owner input to an anonymous pipe. No Keychain, file, clipboard read,
// network destination, credential log or ability to reveal the secure field.
import AppKit
import Foundation
import Darwin

func validSecret(_ s: String) -> Bool {
    guard s.range(of: "^[\\x21-\\x7e]{16,4096}$", options: .regularExpression) == s.startIndex..<s.endIndex else { return false }
    return s.range(of: "^[0-9]+:[A-Za-z0-9_-]+$", options: .regularExpression) == nil
}
func privatePipe(_ fd: Int32) -> Bool {
    var info = stat()
    return fstat(fd, &info) == 0 && [S_IFIFO, S_IFSOCK].contains(info.st_mode & S_IFMT)
}
@MainActor func inputMenu() -> NSMenu {
    let menu = NSMenu(), appItem = NSMenuItem(title: "Maya", action: nil, keyEquivalent: "")
    let appMenu = NSMenu(title: "Maya")
    appMenu.addItem(withTitle: "Закрыть", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu; menu.addItem(appItem)
    let editItem = NSMenuItem(title: "Правка", action: nil, keyEquivalent: ""), edit = NSMenu(title: "Правка")
    edit.addItem(withTitle: "Вставить", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Выделить всё", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = edit; menu.addItem(editItem); return menu
}
@MainActor final class Input: NSObject, NSApplicationDelegate {
    var window: NSWindow!; let field = NSSecureTextField(); var button: NSButton!; var used = false
    let status = NSTextField(wrappingLabelWithString: "BotFather → мини-приложение → @mayaos_login_bot → Login Widget → Client Secret.\n\nНЕ API Token бота. Временная передача только на phone-test.mayaos.ru (Beget, 45.67.56.4). До 30 минут, затем удаление. На Mac ключ не сохраняется.")
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.mainMenu = inputMenu()
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 610, height: 310), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Maya — Telegram для тестового iPhone"
        field.placeholderString = "Login Widget Client Secret"; field.setAccessibilityLabel("Telegram Login Widget Client Secret")
        button = NSButton(title: "Передать на тестовый стенд и начать сеанс", target: self, action: #selector(submit))
        let stack = NSStackView(views: [status, field, button]); stack.orientation = .vertical; stack.spacing = 18
        stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24); stack.frame = window.contentView!.bounds; stack.autoresizingMask = [.width, .height]
        window.contentView!.addSubview(stack); window.center(); window.makeKeyAndOrderFront(nil); window.makeFirstResponder(field); NSApp.activate(ignoringOtherApps: true)
    }
    @objc func submit() {
        guard !used else { return }
        guard validSecret(field.stringValue) else { status.stringValue = "Вставьте Client Secret из Login Widget. API Token с основной страницы бота сюда не подходит. Значение не отправлено."; return }
        guard privatePipe(3) && privatePipe(0) else { field.stringValue = ""; status.stringValue = "Защищённый канал недоступен. Ничего не отправлено."; return }
        used = true; button.isEnabled = false; var data = Data(field.stringValue.utf8); field.stringValue = ""; field.isEnabled = false
        defer { data.resetBytes(in: 0..<data.count); close(3) }
        signal(SIGPIPE, SIG_IGN)
        let sent = data.withUnsafeBytes { bytes -> Bool in
            var offset = 0
            while offset < bytes.count {
                let count = Darwin.write(3, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
                if count < 0 && errno == EINTR { continue }
                if count <= 0 { return false }; offset += count
            }
            return true
        }
        guard sent else { status.stringValue = "Передача не подтверждена. Ключ не записан на Mac."; return }
        status.stringValue = "Защищённая передача выполняется. Пожалуйста, дождитесь результата."
        DispatchQueue.global().async {
            let result = FileHandle.standardInput.readDataToEndOfFile()
            let accepted = String(data: result, encoding: .utf8) == "TRANSFERRED\n"
            DispatchQueue.main.async { self.status.stringValue = accepted ? "Сеанс запущен. Client Secret временно подключён к тестовому стенду. Можно закрыть это окно и вернуться к Maya." : "Запуск не подтверждён. Не вводите ключ повторно: Codex проверит точную причину." }
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
if CommandLine.arguments == [CommandLine.arguments[0], "--self-test"] {
    precondition(validSecret("synthetic-secret-not-real")); precondition(!validSecret("123456789:synthetic-bot-token")); precondition(!validSecret("short")); precondition(!validSecret("synthetic secret with spaces")); precondition(!validSecret("synthetic-secret\n"))
    MainActor.assumeIsolated { let m = inputMenu(); precondition(m.item(withTitle: "Правка")?.submenu?.item(withTitle: "Вставить")?.action == #selector(NSText.paste(_:))) }
    print("SYNTHETIC INPUT CHECKS PASS")
} else {
    guard CommandLine.arguments.count == 1 && privatePipe(3) && privatePipe(0) else { exit(1) }
    MainActor.assumeIsolated { let app = NSApplication.shared; app.setActivationPolicy(.regular); let delegate = Input(); app.delegate = delegate; app.run() }
}
