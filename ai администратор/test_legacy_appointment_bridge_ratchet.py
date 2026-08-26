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
        "telegram.bot": 3,
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
        ("pay_visit", "telegram.bot"): 1,
        ("reschedule_booking", "claude_ai"): 1,
        ("cancel_booking", "claude_ai"): 1,
    }
)
MIGRATED_WRAPPERS = (
    "create_booking",
    "create_record_admin",
    "reschedule_booking",
    "cancel_booking",
)
WRITE_FREE_TOMBSTONES = (
    "pay_visit",
)
WRAPPERS = MIGRATED_WRAPPERS + WRITE_FREE_TOMBSTONES

EXPECTED_RECORD_PUT_OWNERS = Counter(
    {
        ("yclients.py", "update_booking"): 1,
        ("yclients.py", "set_record_attendance"): 1,
        ("yclients.py", "set_record_notify_by_sms"): 1,
        ("yclients.py", "add_services_to_record"): 1,
        ("yclients.py", "set_record_services"): 1,
        ("yclients.py", "set_record_duration"): 1,
        ("yclients.py", "set_record_client_name"): 1,
        ("yclients.py", "mark_record_loyalty_redemption"): 1,
        ("yclients.py", "append_record_comment"): 1,
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
    def test_all_twelve_production_entry_points_declare_a_known_origin(self):
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
        self.assertEqual(sum(origins.values()), 12)

    def test_migrated_wrappers_have_exactly_one_bridge_dispatch(self):
        tree = parsed(ROOT / "yclients.py")
        methods = class_methods(tree, "YClientsAPI")

        for wrapper in MIGRATED_WRAPPERS:
            node = methods[wrapper]
            dispatches = [
                call
                for call in ast.walk(node)
                if isinstance(call, ast.Call)
                and isinstance(call.func, ast.Name)
                and call.func.id == "dispatch_appointment_action"
            ]
            self.assertEqual(len(dispatches), 1, wrapper)
            keyword_names = {keyword.arg for keyword in dispatches[0].keywords}
            self.assertNotIn("direct_call", keyword_names, wrapper)

    def test_pay_visit_is_a_write_free_provider_deferred_tombstone(self):
        source = (ROOT / "yclients.py").read_text(encoding="utf-8")
        methods = class_methods(parsed(ROOT / "yclients.py"), "YClientsAPI")
        payment = ast.unparse(methods["pay_visit"])

        self.assertNotIn("dispatch_appointment_action", payment)
        self.assertNotIn("self._put", payment)
        self.assertNotIn("self._post", payment)
        self.assertNotIn("create_finance_transaction", payment)
        self.assertIn("visit_payment_write_provider_contract_deferred", payment)
        self.assertNotIn("_a08_pay_visit_allowed", source)
        self.assertNotIn("MAYA_A08_PAY_VISIT_SCOPE", source)
        self.assertNotIn("MAYA_A08_PAY_VISIT_PROOF_RECORD_IDS", source)

    def test_removed_direct_write_owners_cannot_return(self):
        methods = class_methods(parsed(ROOT / "yclients.py"), "YClientsAPI")
        removed = {
            "_create_booking_direct",
            "_create_record_admin_direct",
            "_reschedule_booking_direct",
            "_cancel_booking_direct",
        }
        self.assertTrue(removed.isdisjoint(methods))

        source = (ROOT / "yclients.py").read_text(encoding="utf-8")
        for name in removed:
            self.assertNotIn(name, source)

        tombstone = ast.unparse(methods["set_record_paid"])
        self.assertNotIn("self._put", tombstone)
        self.assertNotIn("create_finance_transaction", tombstone)
        self.assertNotIn("_find_payment_transaction", methods)
        self.assertNotIn("_payment_outcome_unknown", methods)
        self.assertNotIn("close_appointment_payment", source)

        for filename in PRODUCTION_CALLERS:
            tree = parsed(ROOT / filename)
            calls = {
                call_name(call)
                for call in ast.walk(tree)
                if isinstance(call, ast.Call)
            }
            self.assertNotIn("set_record_paid", calls, filename)

    def test_telegram_payment_checks_record_ownership_before_dispatch(self):
        tree = parsed(ROOT / "bot.py")
        close_booking = next(
            node
            for node in tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "_close_master_booking"
        )
        source = ast.unparse(close_booking)

        self.assertIn("record.get('staff_id')", source)
        self.assertIn("master.get('yclients_staff_id')", source)
        self.assertIn("record_staff_id != master_staff_id", source)
        self.assertIn("yc.pay_visit", source)
        self.assertLess(
            source.index("record_staff_id != master_staff_id"),
            source.index("yc.pay_visit"),
        )

    def test_actual_migrated_appointment_write_endpoints_have_no_python_owner(self):
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

        self.assertEqual(create_client_owners, [])
        self.assertEqual(create_admin_owners, [])
        self.assertEqual(cancel_owners, [])
        self.assertEqual(reschedule_owners, [])

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

        self.assertEqual(create_client, Counter())
        self.assertEqual(create_admin, Counter())
        self.assertEqual(cancel, Counter())
        self.assertEqual(record_put, EXPECTED_RECORD_PUT_OWNERS)

    def test_bridge_dispatcher_has_no_runtime_direct_or_shadow_path(self):
        source = (ROOT / "legacy_appointment_bridge.py").read_text(
            encoding="utf-8"
        )
        tree = parsed(ROOT / "legacy_appointment_bridge.py")
        dispatch = next(
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "dispatch_appointment_action"
        )
        dispatch_source = ast.unparse(dispatch)

        self.assertNotIn("direct_call", dispatch_source)
        self.assertNotIn("legacy_outcome", dispatch_source)
        self.assertNotIn('"shadow"', dispatch_source)
        self.assertNotIn('"off"', dispatch_source)
        self.assertIn('VALID_MODES = frozenset({"cutover"})', source)

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

    def test_bridge_execute_surface_excludes_residual_appointment_actions(self):
        bridge_tree = parsed(ROOT / "legacy_appointment_bridge.py")
        dispatch = next(
            node
            for node in bridge_tree.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "dispatch_appointment_action"
        )
        dispatch_source = ast.unparse(dispatch).lower()
        for action in (
            "set_appointment_attendance",
            "set_appointment_duration",
            "set_appointment_services",
            "set_appointment_fields",
            "close_appointment_payment",
        ):
            self.assertNotIn(action, dispatch_source)

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
                self.assertNotIn("set_appointment_attendance", action_classes)

    def test_attendance_remains_a_separate_deferred_direct_owner(self):
        methods = class_methods(parsed(ROOT / "yclients.py"), "YClientsAPI")
        attendance = methods["set_record_attendance"]
        attendance_source = ast.unparse(attendance)

        self.assertIn("self._put", attendance_source)
        self.assertIn("attendance", attendance_source)
        self.assertNotIn("dispatch_appointment_action", attendance_source)
        self.assertIn("_observe_residual_appointment_action", attendance_source)

    def test_residual_direct_owners_are_passive_shadow_producers(self):
        methods = class_methods(parsed(ROOT / "yclients.py"), "YClientsAPI")
        residual_actions = {
            "set_appointment_attendance",
            "set_appointment_duration",
            "set_appointment_services",
            "set_appointment_fields",
        }
        observed = set()
        for _filename, method_name in EXPECTED_RECORD_PUT_OWNERS:
            method_source = ast.unparse(methods[method_name])
            self.assertNotIn("dispatch_appointment_action", method_source, method_name)
            self.assertTrue(
                "_observe_residual_appointment_action" in method_source
                or "_observe_sensitive_appointment_action" in method_source,
                method_name,
            )
            observed.update(
                action for action in residual_actions if action in method_source
            )

        self.assertEqual(observed, residual_actions)

    def test_sensitive_field_observers_use_registered_contract_kinds(self):
        source = (ROOT / "yclients.py").read_text(encoding="utf-8")

        self.assertNotIn('"client_identity"', source)
        for field_kind in ("client_name", "comment", "sms_flag"):
            self.assertIn(f'"{field_kind}"', source)

    def test_unrelated_record_updates_never_default_attendance_to_zero(self):
        source = (ROOT / "yclients.py").read_text(encoding="utf-8")
        self.assertNotIn(
            '.get("attendance", 0)',
            source[source.find("def update_booking") :],
        )

        methods = class_methods(parsed(ROOT / "yclients.py"), "YClientsAPI")
        preserve = methods["_preserve_attendance"]
        preserve_source = ast.unparse(preserve)
        self.assertIn("{-1, 0, 1, 2}", preserve_source)
        self.assertIn("type(raw) is bool", preserve_source)


if __name__ == "__main__":
    unittest.main()
