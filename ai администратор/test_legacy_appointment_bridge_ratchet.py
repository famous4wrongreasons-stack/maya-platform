import ast
import unittest
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = ROOT.parent
PRODUCTION_CALLERS = (
    "client_record_actions.py",
    "webhook_server.py",
    "bot.py",
    "claude_ai.py",
)
EXPECTED_ORIGINS = Counter(
    {
        "client_record_actions": 2,
        "webhook.loyalty": 1,
        "webhook.chat": 1,
        "webhook.panel": 3,
        "telegram.bot": 2,
        "claude_ai": 2,
    }
)
EXPECTED_ENTRY_POINTS = Counter(
    {
        ("cancel_booking", "client_record_actions"): 1,
        ("reschedule_booking", "client_record_actions"): 1,
        ("create_booking", "webhook.loyalty"): 1,
        ("create_booking", "webhook.chat"): 1,
        ("create_record_admin", "webhook.panel"): 1,
        ("reschedule_booking", "webhook.panel"): 1,
        ("cancel_booking", "webhook.panel"): 1,
        ("create_booking", "telegram.bot"): 1,
        ("cancel_booking", "telegram.bot"): 1,
        ("reschedule_booking", "claude_ai"): 1,
        ("cancel_booking", "claude_ai"): 1,
    }
)
WRAPPERS = {
    "create_booking": "_create_booking_direct",
    "create_record_admin": "_create_record_admin_direct",
    "reschedule_booking": "_reschedule_booking_direct",
    "cancel_booking": "_cancel_booking_direct",
}

EXPECTED_RECORD_PUT_OWNERS = Counter(
    {
        ("yclients.py", "update_booking"): 1,
        ("yclients.py", "set_record_attendance"): 1,
        ("yclients.py", "_reschedule_booking_direct"): 1,
        ("yclients.py", "set_record_notify_by_sms"): 1,
        ("yclients.py", "add_services_to_record"): 1,
        ("yclients.py", "set_record_services"): 1,
        ("yclients.py", "set_record_duration"): 1,
        ("yclients.py", "set_record_client_name"): 1,
        ("yclients.py", "mark_record_loyalty_redemption"): 1,
        ("yclients.py", "append_record_comment"): 1,
        ("yclients.py", "set_record_paid"): 3,
    }
)


def parsed(path):
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def class_methods(tree, class_name):
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            return {
                item.name: item
                for item in node.body
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))
            }
    raise AssertionError(f"class {class_name} not found")


def call_name(call):
    if isinstance(call.func, ast.Attribute):
        return call.func.attr
    if isinstance(call.func, ast.Name):
        return call.func.id
    return None


def entry_point_name(call):
    name = call_name(call)
    if name == "to_thread" and call.args:
        target = call.args[0]
        if isinstance(target, ast.Attribute):
            return target.attr
        if isinstance(target, ast.Name):
            return target.id
    return name


def production_python_paths():
    """Return active legacy runtime modules, excluding tests and blueprints."""
    return tuple(
        path
        for path in sorted(ROOT.glob("*.py"))
        if not path.name.startswith("test_")
    )


def function_nodes(tree):
    return tuple(
        node
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    )


class LegacyAppointmentBridgeRatchetTests(unittest.TestCase):
    def test_all_eleven_production_entry_points_declare_a_known_origin(self):
        origins = Counter()
        entry_points = Counter()
        for filename in PRODUCTION_CALLERS:
            tree = parsed(ROOT / filename)
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                for keyword in node.keywords:
                    if keyword.arg != "bridge_origin":
                        continue
                    self.assertIsInstance(keyword.value, ast.Constant)
                    self.assertIsInstance(keyword.value.value, str)
                    origins[keyword.value.value] += 1
                    entry_points[(entry_point_name(node), keyword.value.value)] += 1

        self.assertEqual(origins, EXPECTED_ORIGINS)
        self.assertEqual(entry_points, EXPECTED_ENTRY_POINTS)
        self.assertEqual(sum(origins.values()), 11)

    def test_four_legacy_write_owners_are_private_dispatcher_closures_only(self):
        tree = parsed(ROOT / "yclients.py")
        methods = class_methods(tree, "YClientsAPI")
        direct_names = set(WRAPPERS.values())

        self.assertTrue(direct_names.issubset(methods))
        for wrapper, direct_name in WRAPPERS.items():
            node = methods[wrapper]
            dispatches = [
                call
                for call in ast.walk(node)
                if isinstance(call, ast.Call)
                and isinstance(call.func, ast.Name)
                and call.func.id == "dispatch_appointment_action"
            ]
            self.assertEqual(len(dispatches), 1, wrapper)
            direct_keywords = [
                keyword
                for keyword in dispatches[0].keywords
                if keyword.arg == "direct_call"
            ]
            self.assertEqual(len(direct_keywords), 1, wrapper)
            self.assertIsInstance(direct_keywords[0].value, ast.Lambda)
            self.assertTrue(
                any(
                    isinstance(item, ast.Attribute) and item.attr == direct_name
                    for item in ast.walk(direct_keywords[0].value)
                ),
                wrapper,
            )

        external_references = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr in direct_names:
                owner = next(
                    (
                        wrapper
                        for wrapper, direct in WRAPPERS.items()
                        if direct == node.attr
                    ),
                    None,
                )
                external_references.append(owner)
        self.assertEqual(
            Counter(external_references),
            Counter({wrapper: 1 for wrapper in WRAPPERS}),
        )

    def test_direct_provider_calls_remain_exactly_four_until_cutover_removal(self):
        methods = class_methods(parsed(ROOT / "yclients.py"), "YClientsAPI")

        expected = {
            "_create_booking_direct": ("post", "book_record"),
            "_create_record_admin_direct": ("_post", "records/"),
            "_reschedule_booking_direct": ("_put", "record/"),
            "_cancel_booking_direct": ("_delete", "record/"),
        }
        for method_name, (call_name, endpoint_marker) in expected.items():
            node = methods[method_name]
            calls = [
                call
                for call in ast.walk(node)
                if isinstance(call, ast.Call)
                and (
                    (isinstance(call.func, ast.Attribute) and call.func.attr == call_name)
                    or (isinstance(call.func, ast.Name) and call.func.id == call_name)
                )
            ]
            self.assertEqual(len(calls), 1, method_name)
            method_source = ast.unparse(node)
            self.assertIn(endpoint_marker, method_source, method_name)

    def test_actual_appointment_write_endpoints_have_only_the_four_known_owners(self):
        methods = class_methods(parsed(ROOT / "yclients.py"), "YClientsAPI")
        create_client_owners = []
        create_admin_owners = []
        cancel_owners = []
        reschedule_owners = []

        for method_name, node in methods.items():
            method_source = ast.unparse(node)
            parameters = {
                argument.arg
                for argument in [*node.args.posonlyargs, *node.args.args]
            }
            for call in ast.walk(node):
                if not isinstance(call, ast.Call):
                    continue
                name = call_name(call)
                call_source = ast.unparse(call)
                if name == "post" and "book_record" in method_source:
                    create_client_owners.append(method_name)
                if name == "_post" and "records/" in call_source:
                    create_admin_owners.append(method_name)
                if name == "_delete" and "record/" in call_source:
                    cancel_owners.append(method_name)
                if (
                    name == "_put"
                    and "record/" in call_source
                    and "new_datetime_str" in parameters
                ):
                    reschedule_owners.append(method_name)

        self.assertEqual(create_client_owners, ["_create_booking_direct"])
        self.assertEqual(create_admin_owners, ["_create_record_admin_direct"])
        self.assertEqual(cancel_owners, ["_cancel_booking_direct"])
        self.assertEqual(reschedule_owners, ["_reschedule_booking_direct"])

        for wrapper in WRAPPERS:
            wrapper_source = ast.unparse(methods[wrapper])
            self.assertNotIn("requests.post", wrapper_source, wrapper)
            self.assertNotIn("self._post(", wrapper_source, wrapper)
            self.assertNotIn("self._put(", wrapper_source, wrapper)
            self.assertNotIn("self._delete(", wrapper_source, wrapper)

    def test_repository_wide_provider_endpoint_ratchet_has_no_hidden_owner(self):
        """Snapshot actual CRM write endpoints across active Python runtime.

        The broader record PUT snapshot includes deferred/non-migrated action
        families. Its purpose is to make every new direct provider owner an
        explicit architecture decision instead of letting a renamed helper
        bypass the migrated create/reschedule/cancel boundary.
        """
        create_client = Counter()
        create_admin = Counter()
        cancel = Counter()
        record_put = Counter()

        for path in production_python_paths():
            tree = parsed(path)
            for function in function_nodes(tree):
                function_source = ast.unparse(function)
                for call in ast.walk(function):
                    if not isinstance(call, ast.Call):
                        continue
                    transport = call_name(call)
                    call_source = ast.unparse(call)
                    owner = (path.name, function.name)
                    if transport == "post" and "book_record/" in function_source:
                        create_client[owner] += 1
                    if transport == "_post" and "records/" in call_source:
                        create_admin[owner] += 1
                    if transport == "_delete" and "record/" in call_source:
                        cancel[owner] += 1
                    if transport == "_put" and "record/" in call_source:
                        record_put[owner] += 1

        self.assertEqual(
            create_client,
            Counter({("yclients.py", "_create_booking_direct"): 1}),
        )
        self.assertEqual(
            create_admin,
            Counter({("yclients.py", "_create_record_admin_direct"): 1}),
        )
        self.assertEqual(
            cancel,
            Counter({("yclients.py", "_cancel_booking_direct"): 1}),
        )
        self.assertEqual(record_put, EXPECTED_RECORD_PUT_OWNERS)

    def test_historical_blueprint_cannot_become_a_silent_third_runtime(self):
        audit = (
            REPOSITORY_ROOT / "docs/architecture/current-state-audit.md"
        ).read_text(encoding="utf-8")
        self.assertIn("reference implementation", audit)
        self.assertIn("не третий runtime", audit)

        imported_blueprint_from = []
        for path in production_python_paths():
            tree = parsed(path)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom):
                    modules = [node.module or ""]
                else:
                    continue
                if any(
                    module == "saas_blueprint"
                    or module.startswith("saas_blueprint.")
                    for module in modules
                ):
                    imported_blueprint_from.append(path.name)

        self.assertEqual(imported_blueprint_from, [])

    def test_bridge_action_surface_excludes_attendance(self):
        bridge_source = (ROOT / "legacy_appointment_bridge.py").read_text(
            encoding="utf-8"
        ).lower()
        self.assertNotIn("attendance", bridge_source)

        for filename in (
            "client_record_actions.py",
            "webhook_server.py",
            "bot.py",
            "claude_ai.py",
        ):
            tree = parsed(ROOT / filename)
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                action_classes = [
                    keyword.value.value
                    for keyword in node.keywords
                    if keyword.arg == "action_class"
                    and isinstance(keyword.value, ast.Constant)
                    and isinstance(keyword.value.value, str)
                ]
                self.assertNotIn("attendance", action_classes)


if __name__ == "__main__":
    unittest.main()
