import Foundation
import Security
import AppKit
import Darwin

enum Kind: String, CaseIterable {
    case deepseek, yclientsPartner
    var service: String { self == .deepseek ? "ru.mayaos.dev.local-model.deepseek.v1" : "ru.mayaos.dev.local-read.yclients-partner.v1" }
    var label: String { self == .deepseek ? "MAYA — локальные проверки DeepSeek" : "MAYA — локальное чтение YCLIENTS" }
    func valid(_ data: Data) -> Bool {
        guard let text = String(data: data, encoding: .utf8), Data(text.utf8) == data else { return false }
        let pattern = self == .deepseek ? "^[A-Za-z0-9_-]{16,512}$" : "^[\\x21-\\x2b\\x2d-\\x7e]{16,4096}$"
        return text.range(of: pattern, options: .regularExpression) == text.startIndex..<text.endIndex
    }
}
enum ClosedError: Error { case refused, duplicate, unavailable, rollback }
protocol CredentialStorage {
    func add(_ kind: Kind, _ value: Data) throws
    func read(_ kind: Kind) throws -> Data
    func delete(_ kind: Kind) throws
}
final class MemoryStorage: CredentialStorage {
    private var values: [Kind: Data] = [:]
    var locked = false
    func add(_ kind: Kind, _ value: Data) throws { guard !locked else { throw ClosedError.unavailable }; guard values[kind] == nil else { throw ClosedError.duplicate }; values[kind] = value }
    func read(_ kind: Kind) throws -> Data { guard !locked, let value = values[kind] else { throw ClosedError.unavailable }; return value }
    func delete(_ kind: Kind) throws { guard !locked else { throw ClosedError.unavailable }; if var value = values.removeValue(forKey: kind) { value.resetBytes(in: 0..<value.count) } }
}
final class LoginKeychainStorage: CredentialStorage {
    private let keychain: SecKeychain
    init(interactive: Bool) throws {
        guard getuid() > 0 else { throw ClosedError.refused }
        guard SecKeychainSetUserInteractionAllowed(interactive) == errSecSuccess else { throw ClosedError.unavailable }
        var opened: SecKeychain?
        let file = NSHomeDirectory() + "/Library/Keychains/login.keychain-db"
        guard SecKeychainOpen(file, &opened) == errSecSuccess, let opened else { throw ClosedError.unavailable }
        keychain = opened
    }
    private func query(_ kind: Kind) -> [CFString: Any] {
        [kSecClass: kSecClassGenericPassword, kSecAttrService: kind.service,
         kSecAttrAccount: "local-owner-\(getuid())", kSecMatchSearchList: [keychain]]
    }
    func add(_ kind: Kind, _ value: Data) throws {
        guard kind.valid(value), let executable = Bundle.main.executablePath else { throw ClosedError.refused }
        var trusted: SecTrustedApplication?
        var access: SecAccess?
        guard SecTrustedApplicationCreateFromPath(executable, &trusted) == errSecSuccess, let trusted,
              SecAccessCreate(kind.label as CFString, [trusted] as CFArray, &access) == errSecSuccess,
              let access else { throw ClosedError.unavailable }
        var q = query(kind); q.removeValue(forKey: kSecMatchSearchList)
        q[kSecUseKeychain] = keychain; q[kSecAttrAccess] = access
        q[kSecAttrLabel] = kind.label; q[kSecValueData] = value
        let status = SecItemAdd(q as CFDictionary, nil)
        if status == errSecDuplicateItem { throw ClosedError.duplicate }
        guard status == errSecSuccess else { throw ClosedError.unavailable }
    }
    func read(_ kind: Kind) throws -> Data {
        var q = query(kind); q[kSecMatchLimit] = kSecMatchLimitOne; q[kSecReturnData] = true
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data, kind.valid(data) else { throw ClosedError.unavailable }
        return data
    }
    func delete(_ kind: Kind) throws {
        let status = SecItemDelete(query(kind) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw ClosedError.unavailable }
    }
}
final class Vault {
    let storage: CredentialStorage
    init(_ storage: CredentialStorage) { self.storage = storage }
    func enroll(deepseek: Data, partner: Data) throws {
        guard Kind.deepseek.valid(deepseek), Kind.yclientsPartner.valid(partner) else { throw ClosedError.refused }
        try storage.add(.deepseek, deepseek)
        do { try storage.add(.yclientsPartner, partner) }
        catch { do { try storage.delete(.deepseek) } catch { throw ClosedError.rollback }; throw ClosedError.duplicate }
    }
    func forget() throws { for kind in Kind.allCases { try storage.delete(kind) } }
}
func selfIdentity() throws {
    var code: SecCode?
    var staticCode: SecStaticCode?
    var info: CFDictionary?
    guard SecCodeCopySelf([], &code) == errSecSuccess, let code,
          SecCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSStrictValidate), nil) == errSecSuccess,
          SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode,
          SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
          let details = info as? [String: Any], details[kSecCodeInfoIdentifier as String] as? String == "ru.mayaos.local.credentials" else { throw ClosedError.refused }
}
func pipeOutput(_ kind: Kind, store: CredentialStorage) throws {
    var statbuf = stat()
    guard fstat(3, &statbuf) == 0, [S_IFIFO, S_IFSOCK].contains(statbuf.st_mode & S_IFMT) else { throw ClosedError.refused }
    signal(SIGPIPE, SIG_IGN)
    var data = try store.read(kind)
    defer { data.resetBytes(in: 0..<data.count); close(3) }
    guard kind.valid(data) else { throw ClosedError.refused }
    try data.withUnsafeBytes { bytes in
        var offset = 0
        while offset < bytes.count {
            let count = Darwin.write(3, bytes.baseAddress!.advanced(by: offset), bytes.count-offset)
            if count < 0 && errno == EINTR { continue }
            guard count > 0 else { throw ClosedError.refused }; offset += count
        }
    }
}
// AppKit routes Command-V through the main menu's responder-chain action.
// A programmatically created app has no default Edit menu. Do not read the
// pasteboard ourselves or expose secure-field contents to implement paste.
@MainActor func credentialInputMenu() -> NSMenu {
    let menu = NSMenu()
    let application = NSMenuItem(title:"Maya",action:nil,keyEquivalent:"")
    let applicationMenu = NSMenu(title:"Maya")
    applicationMenu.addItem(withTitle:"Закрыть Maya",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
    application.submenu = applicationMenu; menu.addItem(application)
    let edit = NSMenuItem(title:"Правка",action:nil,keyEquivalent:"")
    let editMenu = NSMenu(title:"Правка")
    editMenu.addItem(withTitle:"Вставить",action:#selector(NSText.paste(_:)),keyEquivalent:"v")
    editMenu.addItem(withTitle:"Выделить всё",action:#selector(NSText.selectAll(_:)),keyEquivalent:"a")
    edit.submenu = editMenu; menu.addItem(edit)
    return menu
}
@MainActor final class Setup: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let partner = NSSecureTextField(), deepseek = NSSecureTextField()
    let status = NSTextField(wrappingLabelWithString: "Две записи в локальной Связке ключей. Сохранение не запускает модель или YCLIENTS. Существующие записи не перезаписываются.")
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.mainMenu = credentialInputMenu()
        window = NSWindow(contentRect: NSRect(x:0,y:0,width:570,height:330), styleMask:[.titled,.closable], backing:.buffered, defer:false)
        window.title = "Maya — ключи локальных проверок"
        partner.placeholderString = "Партнёрский токен YCLIENTS"; deepseek.placeholderString = "API-ключ DeepSeek"
        let save = NSButton(title:"Сохранить два ключа",target:self,action:#selector(saveKeys))
        let forget = NSButton(title:"Удалить только эти два ключа",target:self,action:#selector(forgetKeys))
        let stack = NSStackView(views:[status,partner,deepseek,save,forget]); stack.orientation = .vertical; stack.spacing = 15
        stack.edgeInsets = NSEdgeInsets(top:24,left:24,bottom:24,right:24); stack.frame = window.contentView!.bounds; stack.autoresizingMask = [.width,.height]
        window.contentView!.addSubview(stack); window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
    }
    @objc func saveKeys() {
        var one = Data(deepseek.stringValue.utf8), two = Data(partner.stringValue.utf8)
        defer { one.resetBytes(in:0..<one.count); two.resetBytes(in:0..<two.count) }
        guard !one.isEmpty, !two.isEmpty else { status.stringValue = "Заполните оба поля. Для вставки используйте ⌘V или меню Правка → Вставить."; return }
        deepseek.stringValue = ""; partner.stringValue = ""
        do { try selfIdentity(); let vault = Vault(try LoginKeychainStorage(interactive:true)); try vault.enroll(deepseek:one,partner:two); status.stringValue = "Оба ключа сохранены. Можно закрыть окно. Внешние запросы не выполнялись." }
        catch { status.stringValue = "Сохранение не подтверждено. Проверьте доступ к Связке ключей и отсутствие существующих записей. Значения не записаны в журнал." }
    }
    @objc func forgetKeys() {
        let alert = NSAlert(); alert.messageText = "Удалить два локальных ключа Maya?"; alert.informativeText = "Это запретит будущую загрузку ключей. Уже работающий сеанс нужно остановить отдельно."; alert.addButton(withTitle:"Удалить"); alert.addButton(withTitle:"Отмена")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        do { try selfIdentity(); try Vault(try LoginKeychainStorage(interactive:true)).forget(); status.stringValue = "Два ключа удалены. Другие записи не затронуты." } catch { status.stringValue = "Удаление не подтверждено. Проверьте Связку ключей." }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool { true }
}
func memoryProof() throws {
    try MainActor.assumeIsolated {
        let menu = credentialInputMenu()
        guard let edit = menu.item(withTitle:"Правка")?.submenu,
              let paste = edit.item(withTitle:"Вставить"),
              paste.action == #selector(NSText.paste(_:)), paste.keyEquivalent == "v",
              paste.keyEquivalentModifierMask == .command, paste.target == nil,
              let select = edit.item(withTitle:"Выделить всё"),
              select.action == #selector(NSText.selectAll(_:)), select.keyEquivalent == "a",
              select.keyEquivalentModifierMask == .command, select.target == nil else { throw ClosedError.refused }
    }
    let store = MemoryStorage(), vault = Vault(MemoryStorage())
    let a = Data("SYNTHETIC_DEEPSEEK_KEY_ONLY".utf8), b = Data("SYNTHETIC_PARTNER_KEY_ONLY".utf8)
    try Vault(store).enroll(deepseek:a,partner:b)
    guard try store.read(.deepseek) == a, try store.read(.yclientsPartner) == b else { throw ClosedError.refused }
    do { try Vault(store).enroll(deepseek:a,partner:b); throw ClosedError.refused } catch ClosedError.duplicate {}
    // New controller, same memory store: run restart without a second enrollment.
    guard try Vault(store).storage.read(.deepseek) == a else { throw ClosedError.refused }
    store.locked = true; do { _ = try store.read(.deepseek); throw ClosedError.refused } catch ClosedError.unavailable {}
    store.locked = false; try Vault(store).forget()
    do { _ = try store.read(.deepseek); throw ClosedError.refused } catch ClosedError.unavailable {}
    try vault.storage.add(.yclientsPartner,b)
    do { try vault.enroll(deepseek:a,partner:b); throw ClosedError.refused } catch ClosedError.duplicate {}
    do { _ = try vault.storage.read(.deepseek); throw ClosedError.refused } catch ClosedError.unavailable {}
}
do {
    let args = Array(CommandLine.arguments.dropFirst())
    if args == ["--self-test"] { try memoryProof(); print("MEMORY_ONLY_SETUP_RESTART_LOCK_DELETE_ROLLBACK_PASS"); exit(0) }
    try selfIdentity()
    if args == ["--setup"] {
        #if MAYA_SYNTHETIC_STORAGE
        throw ClosedError.refused
        #else
        MainActor.assumeIsolated { let app = NSApplication.shared; let setup = Setup(); app.delegate = setup; app.setActivationPolicy(.regular); app.run() }; exit(0)
        #endif
    }
    guard args.count == 2, args[0] == "--read", let kind = Kind(rawValue:args[1]) else { throw ClosedError.refused }
    #if MAYA_SYNTHETIC_STORAGE
    let fake = MemoryStorage(); try Vault(fake).enroll(deepseek:Data("SYNTHETIC_DEEPSEEK_KEY_ONLY".utf8),partner:Data("SYNTHETIC_PARTNER_KEY_ONLY".utf8)); try pipeOutput(kind,store:fake)
    #else
    try pipeOutput(kind,store:try LoginKeychainStorage(interactive:false))
    #endif
    exit(0)
} catch { exit(70) }
