// Metadata-only audit. No credential bytes requested; exact two approved items.
import Foundation
import Security
import Darwin
let services = ["ru.mayaos.dev.local-model.deepseek.v1", "ru.mayaos.dev.local-read.yclients-partner.v1"]
guard getuid() > 0, SecKeychainSetUserInteractionAllowed(false) == errSecSuccess else { exit(71) }
var keychain: SecKeychain?
let openStatus = SecKeychainOpen(NSHomeDirectory() + "/Library/Keychains/login.keychain-db", &keychain)
guard openStatus == errSecSuccess, let keychain else { print("{\"error\":\"keychain_open_refused\"}"); exit(72) }
var rows: [[String: Any]] = []
for service in services {
    let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: "local-owner-\(getuid())", kSecMatchSearchList: [keychain], kSecMatchLimit: kSecMatchLimitOne, kSecReturnRef: true]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    var row: [String: Any] = ["service": service, "status": status, "present": status == errSecSuccess]
    if status == errSecSuccess, let result {
        let item = result as! SecKeychainItem
        var access: SecAccess?
        let accessStatus = SecKeychainItemCopyAccess(item, &access)
        row["accessStatus"] = accessStatus
        if accessStatus == errSecSuccess, let access {
            var list: CFArray?
            let listStatus = SecAccessCopyACLList(access, &list)
            row["aclListStatus"] = listStatus
            var aclRows: [[String: Any]] = []
            if listStatus == errSecSuccess, let list {
                for acl in list as! [SecACL] {
                    var apps: CFArray?, description: CFString?
                    var selector = SecKeychainPromptSelector()
                    let contentStatus = SecACLCopyContents(acl, &apps, &description, &selector)
                    var details: [String: Any] = ["contentsStatus": contentStatus, "allApplications": apps == nil]
                    let authorizations = SecACLCopyAuthorizations(acl)
                    details["authorizations"] = authorizations as NSArray
                    if let apps {
                        var paths: [String] = []
                        for app in apps as! [SecTrustedApplication] {
                            var data: CFData?
                            if SecTrustedApplicationCopyData(app, &data) == errSecSuccess, let data, let path = String(data: data as Data, encoding: .utf8) {
                                paths.append(path.trimmingCharacters(in: .controlCharacters))
                            }
                        }
                        details["trustedApplicationCount"] = CFArrayGetCount(apps)
                        details["trustedApplicationPaths"] = paths
                    }
                    aclRows.append(details)
                }
            }
            row["acls"] = aclRows
        }
    }
    rows.append(row)
}
let data = try JSONSerialization.data(withJSONObject: ["credentialDataRequested": false, "items": rows], options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write(Data("\n".utf8))
if rows.contains(where: { ($0["status"] as! Int32) != errSecSuccess && ($0["status"] as! Int32) != errSecItemNotFound }) { exit(73) }
