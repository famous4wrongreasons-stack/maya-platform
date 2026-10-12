// Compile/typecheck only. No top-level execution; no Keychain is opened.
import Foundation
import Security
enum MayaCredentialKind { case deepseek, yclientsPartner }
func exactQuery(_ keychain: SecKeychain, service: String, account: String) -> CFDictionary {
    return [kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecMatchSearchList: [keychain],
            kSecMatchLimit: kSecMatchLimitOne,
            kSecReturnData: true] as CFDictionary
}
// These references prove SDK availability, not successful storage or ACL behavior.
func compileOnlyAPIs(_ query: CFDictionary, _ helperPath: String) -> OSStatus {
    var result: CFTypeRef?
    var trusted: SecTrustedApplication?
    var access: SecAccess?
    let first = SecTrustedApplicationCreateFromPath(helperPath, &trusted)
    guard first == errSecSuccess, let trusted else { return first }
    let acl = SecAccessCreate("Maya local credentials" as CFString, [trusted] as CFArray, &access)
    guard acl == errSecSuccess else { return acl }
    _ = SecKeychainSetUserInteractionAllowed(false)
    return SecItemCopyMatching(query, &result)
}
