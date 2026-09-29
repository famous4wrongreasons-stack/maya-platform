import UIKit
import Capacitor

/// The carrier's ONLY product-adjacent code, and it is deliberately not product code.
///
/// After Telegram's consent the backend redirects to `mayaos://oauth-callback/?state=…&code=…`
/// (or `…&error=…`). iOS hands that URL to this scene. This file checks the URL's SHAPE, lifts the
/// three opaque values out of it, and hands them to the shared shell, which owns the whole of the
/// login. It does not know what a state is, cannot tell a real code from a fabricated one, never
/// reads or writes a session, and never decides that anybody is signed in. Every such decision
/// belongs to `maya-chat-shell`, once, for both carriers.
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

    /// The shape the backend emits, and nothing else.
    private static let callbackScheme = "mayaos"
    private static let callbackHost = "oauth-callback"
    /// The event the shared shell listens for. It carries opaque strings and no meaning.
    private static let callbackEvent = "maya:oauth-callback"

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            deliverCallback(context.url)
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // MARK: - the hand-off

    /// Refuse anything that is not exactly `mayaos://oauth-callback[/]` and pass on the three values
    /// the flow can carry. Any other scheme, host, path or parameter is dropped without a trace in
    /// the web layer: a URL that is not this shape never reaches the shell at all.
    private func deliverCallback(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        guard components.scheme?.lowercased() == Self.callbackScheme else { return }
        guard components.host?.lowercased() == Self.callbackHost else { return }
        guard components.path.isEmpty || components.path == "/" else { return }
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
