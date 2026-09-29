import UIKit
import Capacitor

/// The carrier's ONLY product-adjacent code, and it is deliberately not product code.
///
/// After Telegram's consent the provider sends the browser to
/// `https://mayaos.ru/api/auth/oauth/native/callback?state=…&code=…`. That path is claimed by this
/// app as a **Universal Link**, so iOS opens MAYA on it instead of letting the request go out. This
/// file checks the URL's SHAPE, lifts the three opaque values out of it, and hands them to the
/// shared shell, which owns the whole of the login. It does not know what a state is, cannot tell a
/// real code from a fabricated one, never reads or writes a session, and never decides that anybody
/// is signed in. Every such decision belongs to `maya-chat-shell`, once, for both carriers.
///
/// **Universal Links, and only Universal Links.** The app previously also claimed a custom
/// `mayaos://` scheme, and the backend still redirects to it when the link is not intercepted. A
/// custom scheme is not exclusive — any app may declare the same one, iOS's tie-break is undefined,
/// and since the PKCE verifier lives on the server, `state` + `code` together are a bearer
/// credential for a session. An `applinks:` association is bound to the domain by a file only that
/// domain can serve, so it cannot be claimed by another app. The scheme is gone from `Info.plist`,
/// and there is no fallback to it here: if the association ever fails, this app is simply not
/// opened, which is a failure somebody can see rather than one that quietly works anyway.
///
/// Why the shell is still loaded when this arrives: Capacitor's own navigation policy
/// (`WebViewDelegationHandler.decidePolicyFor`) CANCELS a top-level navigation to a non-application
/// URL and hands it to `UIApplication.open` instead. So `location.assign(<telegram>)` from the shell
/// opens Safari and leaves this WebView exactly where it was — with the in-memory record of the
/// login it started still intact. That record is what makes an unsolicited callback refusable, and
/// it is why this is delivered as an event rather than written into the page's URL.
///
/// A COLD launch is deliberately not handled. If iOS has killed MAYA, the in-memory record is gone
/// and no callback can be trusted any more: the app opens at its first screen and the person starts
/// again. Accepting a callback in that state is exactly the attack the record exists to stop.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    /// The one URL this app is associated with, spelled out so nothing else can be mistaken for it.
    private static let callbackScheme = "https"
    private static let callbackHost = "mayaos.ru"
    private static let callbackPath = "/api/auth/oauth/native/callback"
    /// The event the shared shell listens for. It carries opaque strings and no meaning.
    private static let callbackEvent = "maya:oauth-callback"

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        deliverCallback(userActivity)
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // MARK: - the hand-off

    /// Refuse anything that is not exactly the associated callback URL, and pass on the three values
    /// the flow can carry. Anything else never reaches the shell at all.
    private func deliverCallback(_ userActivity: NSUserActivity) {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb else { return }
        guard let url = userActivity.webpageURL else { return }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        guard components.scheme?.lowercased() == Self.callbackScheme else { return }
        guard components.host?.lowercased() == Self.callbackHost else { return }
        guard components.path == Self.callbackPath else { return }
        guard components.user == nil, components.password == nil, components.port == nil else { return }
        guard let items = components.queryItems, !items.isEmpty else { return }

        // Exactly the three names, each at most once. A repeated name is how a smuggled second value
        // rides in behind the first, so a duplicate makes the whole callback invalid rather than
        // letting either value be picked.
        var carried: [String: String] = [:]
        for item in items {
            guard ["state", "code", "error"].contains(item.name) else { return }
            guard carried[item.name] == nil else { return }
            guard let value = item.value, !value.isEmpty, value.count <= 4096 else { return }
            carried[item.name] = value
        }
        // The backend never emits one without the other, and the shell cannot use a callback that
        // names neither an outcome nor the login it belongs to.
        guard carried["state"] != nil, carried["code"] != nil || carried["error"] != nil else { return }

        guard let payload = try? JSONSerialization.data(withJSONObject: carried, options: []),
              let json = String(data: payload, encoding: .utf8) else { return }
        guard let controller = window?.rootViewController as? CAPBridgeViewController,
              let webView = controller.webView else { return }

        // JSONSerialization does the escaping, so no value here can end the string literal or run as
        // code — the values stay data on the way into the page, the same as they are on the way out.
        let script = "window.dispatchEvent(new CustomEvent(\(Self.callbackEvent.javaScriptStringLiteral), { detail: \(json) }))"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(script, completionHandler: nil)
        }
    }
}

private extension String {
    /// A JSON string is a JavaScript string literal, so this borrows the same escaping.
    var javaScriptStringLiteral: String {
        guard let data = try? JSONSerialization.data(withJSONObject: [self], options: []),
              let array = String(data: data, encoding: .utf8) else { return "\"\"" }
        return String(array.dropFirst().dropLast())
    }
}
