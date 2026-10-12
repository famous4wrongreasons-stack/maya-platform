// Compile-only UI preparation. Never launched; no Keychain or network APIs.
import AppKit
@MainActor final class OwnerCredentialPanel: NSViewController {
    private let partner = NSSecureTextField()
    private let deepseek = NSSecureTextField()
    override func loadView() {
        let title = NSTextField(labelWithString: "Ключи для локальных проверок Maya")
        partner.placeholderString = "Партнёрский токен YCLIENTS"
        deepseek.placeholderString = "API-ключ DeepSeek"
        let notice = NSTextField(wrappingLabelWithString: "Сохранение не запускает платные запросы. Оба ключа предназначены только для разрешённых локальных проверок на этом Mac.")
        let save = NSButton(title: "Сохранить два ключа", target: nil, action: nil)
        save.isEnabled = false // Native store/signing/admission are not connected.
        let stack = NSStackView(views: [title,partner,deepseek,notice,save])
        stack.orientation = .vertical
        stack.spacing = 14
        stack.edgeInsets = NSEdgeInsets(top:24,left:24,bottom:24,right:24)
        stack.frame = NSRect(x:0,y:0,width:540,height:280)
        view = stack
    }
}
