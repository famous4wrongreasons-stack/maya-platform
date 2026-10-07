"""No inventory/network/service; fake commands plus one owned local fork proof."""

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location(
    "diagnostic_inventory", Path(__file__).with_name("diagnostic-readonly-inventory.py"))
inventory = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(inventory)


class FakeExecutor:
    def __init__(self, unit_text=None):
        self.calls = []
        self.unit_text = unit_text or "User=maya-booking-broker\nMainPID=123\nEnvironmentFiles=/etc/proof/model.env (ignore_errors=no)\nLoadCredential=model:/etc/proof/model.key\n"

    def __call__(self, argv, timeout):
        self.calls.append((argv, timeout))
        if argv[0] == "/usr/bin/systemctl":
            value = self.unit_text
        elif argv[0] == "/usr/bin/stat":
            value = "996|996|600|regular file"
        elif argv[0] == "/usr/bin/id":
            value = "996"
        elif argv[0] == "/usr/bin/uname":
            value = "Linux 5.15.0-191-generic x86_64"
        elif argv[0] == "/usr/bin/getconf":
            value = "glibc 2.35"
        elif argv[0] == "/opt/node-v24/bin/node":
            value = "v24.18.0"
        elif argv[0] == "/usr/bin/free":
            value = "total used free shared buff/cache available\nMem: 1000 100 800 0 100 900\nSwap: 200 0 200"
        elif argv[0] == "/usr/bin/df":
            value = "1B-blocks Used Avail Use%\n1000 100 900 10%"
        elif argv[0] == "/usr/bin/ps":
            value = "123 996 996 8192 16384 45"
        else:
            raise AssertionError("Unexpected command in fake executor")
        return {"status": "ok", "text": value}


class InventoryTests(unittest.TestCase):
    def test_default_and_explicit_describe_never_construct_collector(self):
        for args in ([], ["--describe"]):
            output = io.StringIO()
            with mock.patch.object(inventory, "Collector", side_effect=AssertionError), mock.patch.object(inventory.subprocess, "Popen", side_effect=AssertionError), mock.patch.object(inventory.shutil, "which", side_effect=AssertionError), mock.patch.object(inventory.os, "stat", side_effect=AssertionError), contextlib.redirect_stdout(output):
                inventory.main(args)
            result = json.loads(output.getvalue())
            self.assertFalse(result["execution"])
            self.assertEqual(result["usd"], 0)
            self.assertEqual(result["providerCalls"], 0)

    def test_exact_scope_excludes_unsafe_properties_and_other_units(self):
        description = inventory.describe()
        self.assertEqual(len(description["units"]), 3)
        self.assertTrue(all(x.startswith("maya-booking-proof-") for x in description["units"]))
        self.assertFalse(set(("Environment", "SetCredential", "SetCredentialEncrypted", "ExecStart")) & set(description["unitProperties"]))
        self.assertNotIn("maya-saas.service", description["units"])
        self.assertEqual(description["limits"]["totalSeconds"], 600)
        self.assertLessEqual(description["limits"]["commandSeconds"], 10)

    def test_unknown_arguments_do_not_execute_or_echo(self):
        output = io.StringIO()
        with mock.patch.object(inventory, "Collector", side_effect=AssertionError), contextlib.redirect_stdout(output):
            code = inventory.main(["--collect", "CANARY"])
        self.assertEqual(code, 2)
        self.assertNotIn("CANARY", output.getvalue())
        self.assertFalse(json.loads(output.getvalue())["execution"])

    def test_reference_acceptance_is_paths_and_ids_only(self):
        self.assertEqual(inventory.references("LoadCredential", "model:/etc/proof/key"), [{"id": "model", "path": "/etc/proof/key"}])
        self.assertEqual(inventory.references("EnvironmentFiles", "/etc/proof/a.env (ignore_errors=no) /etc/proof/b.env (ignore_errors=yes)"), [
            {"path": "/etc/proof/a.env", "ignoreErrors": False},
            {"path": "/etc/proof/b.env", "ignoreErrors": True},
        ])
        for value in ("model:INLINE_CANARY", "model", "model:relative", "model:/etc/../secret", "model:/etc/key:INLINE", "model:/etc/key\nCANARY", "model:/etc/escaped\\x20key"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                inventory.references("LoadCredential", value)
        for value in ("/etc/key", "INLINE /etc/key (ignore_errors=no)", "/etc/key (ignore_errors=no) CANARY", "/etc/key (ignore_errors=maybe)"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                inventory.references("EnvironmentFiles", value)

    def test_unknown_property_envelope_and_duplicates_fail_closed(self):
        for value in ("Environment=CANARY", "ExecStart=CANARY", "MainPID=1\nMainPID=2", "not a property"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                inventory.parse_properties(value)

    def test_unrecognized_value_is_never_echoed(self):
        result = inventory.parse_properties("LoadCredential=id:CANARY\nUser=CANARY=value\nMainPID=7")
        self.assertEqual(result["MainPID"]["value"], 7)
        self.assertEqual(result["LoadCredential"]["status"], "unknown_unrecognized")
        self.assertNotIn("CANARY", json.dumps(result))

    def test_fake_collection_has_only_finite_commands_and_metadata(self):
        execute = FakeExecutor()
        result = inventory.Collector(execute=execute, which=lambda *a, **k: None).collect()
        observed = result["observations"]
        self.assertEqual(len(observed["pathMetadata"]), 5)
        self.assertEqual(observed["processes"]["123"]["value"][3], 8192)
        self.assertIn("NOT_COLLECTED", observed["aclAndEffectiveReadAccess"])
        self.assertFalse(result["targetVerified"])
        for argv, timeout in execute.calls:
            self.assertIsInstance(argv, list)
            self.assertLessEqual(timeout, 10)
            self.assertFalse(any(x in argv for x in ("sudo", "cat", "start", "restart", "stop", "journalctl")))
            self.assertFalse(any("permit.json" in x or "/proc/" in x for x in argv))
        self.assertEqual(sum(argv[0] == "/usr/bin/systemctl" for argv, _ in execute.calls), 3)

    def test_reference_stat_budget_deduplicates_and_caps_total_paths(self):
        references = " ".join(f"key{i}:/etc/proof/key{i}" for i in range(16))
        execute = FakeExecutor("LoadCredential=" + references)
        result = inventory.Collector(execute=execute, which=lambda *a, **k: None).collect()
        stats = [argv for argv, _ in execute.calls if argv[0] == "/usr/bin/stat"]
        self.assertEqual(len(stats), 16)
        self.assertEqual(len({x[-1] for x in stats}), 16)
        self.assertTrue(result["observations"]["pathLimitReached"])

    def test_permission_failure_and_unrecognized_stdout_do_not_escape(self):
        for fake_result in ({"status": "permission_denied", "text": "CANARY", "stderr": "CANARY"},
                            {"status": "CANARY", "text": "CANARY"},
                            {"status": "ok", "text": "CANARY"},
                            {"status": "ok", "text": "X" * (inventory.OUTPUT_BYTES + 1)}):
            collector = inventory.Collector(execute=lambda *a: fake_result)
            result = collector.read(["/usr/bin/id", "-u", "botadmin"], lambda x: inventory.numbers(x, 1))
            self.assertNotIn("CANARY", json.dumps(result))
            self.assertNotEqual(result["status"], "observed")

    def test_whole_deadline_prevents_further_execution(self):
        now = [0]
        execute = mock.Mock(side_effect=AssertionError)
        collector = inventory.Collector(execute=execute, clock=lambda: now[0])
        now[0] = 600
        self.assertEqual(collector.read(["unused"], str), {"status": "deadline_exceeded"})
        execute.assert_not_called()

    def test_pg_discovery_requires_absolute_bindir(self):
        execute = FakeExecutor()
        calls = []
        def fake(argv, timeout):
            calls.append(argv)
            if argv == ["/usr/bin/pg_config", "--bindir"]:
                return {"status": "ok", "text": "relative/CANARY"}
            return execute(argv, timeout)
        result = inventory.Collector(execute=fake, which=lambda *a, **k: "/usr/bin/pg_config", realpath=lambda x: x).runtime()
        self.assertEqual(result["postgresBindir"]["status"], "unknown_unrecognized")
        self.assertFalse(any(x[-1] == "--version" and "postgres" in x[0] for x in calls))
        self.assertNotIn("CANARY", json.dumps(result))

    def test_pg_binary_symlink_escape_is_not_executed(self):
        execute = FakeExecutor()
        calls = []
        def fake(argv, timeout):
            calls.append(argv)
            if argv == ["/usr/bin/pg_config", "--bindir"]:
                return {"status": "ok", "text": "/usr/lib/postgresql/16/bin"}
            if argv[0].startswith("/usr/lib/postgresql/16/bin/"):
                return {"status": "ok", "text": argv[0].split("/")[-1] + " (PostgreSQL) 16.14"}
            return execute(argv, timeout)
        def resolved(value):
            return "/outside/postgres" if value.endswith("/bin/postgres") else value
        result = inventory.Collector(execute=fake, which=lambda *a, **k: "/usr/bin/pg_config", realpath=resolved).runtime()
        self.assertEqual(result["postgres"]["postgres"]["status"], "unknown_binary_outside_bindir")
        self.assertFalse(any(x[0] == "/outside/postgres" for x in calls))

    def test_stat_reports_numeric_metadata_without_following_link(self):
        self.assertEqual(inventory.parse_stat("996|996|640|symbolic link"), {
            "uid": 996, "gid": 996, "mode": "640", "type": "symbolic link", "followsSymlink": False})
        with self.assertRaises(ValueError):
            inventory.parse_stat("owner-secret|group|600|regular file")


class FakePipe:
    def __init__(self, number):
        self.number = number
    def fileno(self):
        return self.number
    def close(self):
        pass


class FakeSelector:
    def __init__(self):
        self.keys = {}
    def register(self, pipe, event, data):
        self.keys[pipe.number] = SimpleNamespace(fileobj=pipe, data=data)
    def unregister(self, pipe):
        del self.keys[pipe.number]
    def get_map(self):
        return self.keys
    def select(self, timeout):
        return [(next(iter(self.keys.values())), None)]
    def close(self):
        pass


class BoundedExecutorTests(unittest.TestCase):
    def fake_process(self, code):
        return SimpleNamespace(stdout=FakePipe(1), stderr=FakePipe(2), pid=900,
                               wait=mock.Mock(return_value=code), poll=mock.Mock(return_value=None))

    def test_failed_command_discards_both_streams_and_uses_scrubbed_environment(self):
        process = self.fake_process(1)
        streams = {1: iter((b"CANARY_stdout", b"")), 2: iter((b"Permission denied CANARY_stderr", b""))}
        with mock.patch.object(inventory.subprocess, "Popen", return_value=process) as spawn, mock.patch.object(inventory.selectors, "DefaultSelector", FakeSelector), mock.patch.object(inventory.os, "read", side_effect=lambda fd, size: next(streams[fd])), mock.patch.object(inventory.os, "killpg"):
            result = inventory.run_bounded(["/usr/bin/id", "-u", "botadmin"], 10)
        self.assertEqual(result, {"status": "permission_denied"})
        self.assertFalse(spawn.call_args.kwargs["shell"])
        self.assertEqual(set(spawn.call_args.kwargs["env"]), {"PATH", "LANG", "LC_ALL", "TZ"})
        self.assertEqual(spawn.call_args.kwargs["stdin"], inventory.subprocess.DEVNULL)

    def test_combined_pipe_output_is_bounded_and_owned_process_killed(self):
        process = self.fake_process(0)
        with mock.patch.object(inventory.subprocess, "Popen", return_value=process), mock.patch.object(inventory.selectors, "DefaultSelector", FakeSelector), mock.patch.object(inventory.os, "read", side_effect=lambda fd, size: b"X" * size) as read, mock.patch.object(inventory.os, "killpg") as kill:
            result = inventory.run_bounded(["/usr/bin/id", "-u", "botadmin"], 10)
        self.assertEqual(result, {"status": "output_limit"})
        self.assertLessEqual(sum(call.args[1] for call in read.call_args_list), inventory.OUTPUT_BYTES + 1)
        kill.assert_called_once_with(900, inventory.signal.SIGKILL)

    def test_command_timeout_returns_only_status(self):
        process = self.fake_process(0)
        process.poll.return_value = 0
        with mock.patch.object(inventory.subprocess, "Popen", return_value=process), mock.patch.object(inventory.selectors, "DefaultSelector", FakeSelector), mock.patch.object(inventory.time, "monotonic", side_effect=(0, 11, 11)), mock.patch.object(inventory.os, "killpg") as kill:
            result = inventory.run_bounded(["/usr/bin/id", "-u", "botadmin"], 10)
        self.assertEqual(result, {"status": "timeout"})
        kill.assert_called_once()

    def test_interrupted_read_cleans_group_with_exited_leader(self):
        process = self.fake_process(0)
        process.poll.return_value = 0
        with mock.patch.object(inventory.subprocess, "Popen", return_value=process), mock.patch.object(inventory.selectors, "DefaultSelector", FakeSelector), mock.patch.object(inventory.os, "read", side_effect=KeyboardInterrupt), mock.patch.object(inventory.os, "killpg") as kill:
            with self.assertRaises(KeyboardInterrupt):
                inventory.run_bounded(["/usr/bin/id", "-u", "botadmin"], 10)
        kill.assert_called_once_with(900, inventory.signal.SIGKILL)

    @unittest.skipUnless(hasattr(os, "fork"), "POSIX owned-process lifecycle proof")
    def test_real_owned_parent_exit_and_child_held_pipe_is_killed(self):
        # Explicitly authorized local lifecycle proof only. No inventory, network
        # or service runs. The child also self-expires if cleanup regresses.
        program = """import os, signal, sys, time
child = os.fork()
if child == 0:
    signal.alarm(4)
    time.sleep(4)
    os._exit(0)
with open(sys.argv[1], 'w') as out:
    out.write(str(child))
os._exit(0)
"""
        original_spawn, original_kill = inventory.subprocess.Popen, os.killpg
        owned = []
        killed_after_leader_exit = []
        def spawn(*args, **kwargs):
            process = original_spawn(*args, **kwargs)
            owned.append(process)
            return process
        def kill(group, sig):
            self.assertEqual(group, owned[0].pid)
            killed_after_leader_exit.append(owned[0].poll() == 0)
            return original_kill(group, sig)
        with tempfile.TemporaryDirectory(prefix="maya-inventory-lifecycle-") as root:
            child_record = Path(root) / "child.pid"
            started = time.monotonic()
            try:
                with mock.patch.object(inventory.subprocess, "Popen", side_effect=spawn), mock.patch.object(inventory.os, "killpg", side_effect=kill):
                    result = inventory.run_bounded([sys.executable, "-B", "-c", program, str(child_record)], 0.8)
                self.assertEqual(result, {"status": "timeout"})
                self.assertEqual(killed_after_leader_exit, [True])
                self.assertEqual(owned[0].returncode, 0)  # leader reaped
                child = int(child_record.read_text())
                deadline = time.monotonic() + 1.5
                while time.monotonic() < deadline:
                    try:
                        os.kill(child, 0)
                    except ProcessLookupError:
                        break
                    time.sleep(0.02)
                else:
                    self.fail("owned child was not reaped after group termination")
                self.assertLess(time.monotonic() - started, 2.5)
            finally:
                for process in owned:
                    try:
                        original_kill(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait(timeout=0.2)


if __name__ == "__main__":
    unittest.main()
