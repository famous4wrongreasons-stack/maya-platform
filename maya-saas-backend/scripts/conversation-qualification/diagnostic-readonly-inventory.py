#!/usr/bin/env python3
"""Finite metadata inventory. Default is describe; no SSH/network/setup code."""

import datetime
import ipaddress
import json
import os
import re
import selectors
import shutil
import signal
import subprocess
import sys
import time

CONTRACT = "maya.diagnostic-readonly-inventory/1"
TARGET = "botadmin@api.mayaos.ru"
UNITS = (
    "maya-booking-proof-db.service",
    "maya-booking-proof-broker.service",
    "maya-booking-proof-followup-paid-followup-2.service",
)
PRINCIPALS = ("botadmin", "maya-booking-proof", "maya-booking-broker")
BASE_PATHS = (
    "/srv/maya-booking-proof",
    "/srv/maya-booking-proof/control",
    "/srv/maya-booking-proof/evidence",
)
PROPERTIES = (
    "FragmentPath", "User", "Group", "SupplementaryGroups",
    "EnvironmentFiles", "LoadCredential", "ActiveState", "SubState", "MainPID",
    "PrivateNetwork", "JoinsNamespaceOf", "ProtectSystem", "NoNewPrivileges",
    "ReadOnlyPaths", "ReadWritePaths", "IPAddressAllow", "IPAddressDeny",
    "MemoryMax", "TasksMax",
)
SEARCH_PATH = "/usr/sbin:/usr/bin:/sbin:/bin"
COMMAND_SECONDS = 10
TOTAL_SECONDS = 600
OUTPUT_BYTES = 32768  # stdout and stderr combined, per command
MAX_PATHS = 16
IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_.-]{0,63}|[0-9]{1,10}")
ABSOLUTE = re.compile(r"/[A-Za-z0-9_./@+-]{0,239}")


def absolute_path(value):
    if (not isinstance(value, str) or not ABSOLUTE.fullmatch(value)
            or "//" in value or any(p in (".", "..") for p in value.split("/"))):
        raise ValueError("unrecognized_absolute_path")
    return value


def identifier(value):
    if not IDENTIFIER.fullmatch(value):
        raise ValueError("unrecognized_identifier")
    return value


def numbers(value, count=None):
    items = value.split()
    if (not items or len(items) > 32 or (count is not None and len(items) != count)
            or any(not re.fullmatch(r"[0-9]{1,20}", x) for x in items)):
        raise ValueError("unrecognized_numbers")
    return [int(x) for x in items]


def references(prop, value):
    """Never accept credential contents, relative sources, escaping or inline data."""
    if not value:
        return []
    if prop == "EnvironmentFiles":
        pattern = r"(/[^\s]+) \(ignore_errors=(yes|no)\)(?: |$)"
        matches = list(re.finditer(pattern, value))
        if not matches or "".join(m.group(0) for m in matches) != value:
            raise ValueError("unrecognized_environment_reference")
        result = [{"path": absolute_path(m.group(1)),
                   "ignoreErrors": m.group(2) == "yes"} for m in matches]
    elif prop == "LoadCredential":
        result = []
        for item in value.split(" "):
            name, separator, source = item.partition(":")
            if not separator:
                raise ValueError("unrecognized_credential_reference")
            result.append({"id": identifier(name), "path": absolute_path(source)})
    else:
        raise ValueError("unrecognized_reference_property")
    if len(result) > MAX_PATHS:
        raise ValueError("too_many_references")
    return result


def property_value(prop, value):
    if prop in ("EnvironmentFiles", "LoadCredential"):
        return references(prop, value)
    if not value:
        return None
    if prop == "FragmentPath":
        return absolute_path(value)
    if prop in ("User", "Group"):
        return identifier(value)
    if prop in ("SupplementaryGroups", "JoinsNamespaceOf"):
        items = value.split(" ")
        if len(items) > MAX_PATHS:
            raise ValueError("too_many_identifiers")
        if prop == "JoinsNamespaceOf":
            if any(not re.fullmatch(r"[A-Za-z0-9_.@-]{1,128}\.service", x) for x in items):
                raise ValueError("unrecognized_unit_reference")
            return items
        return [identifier(x) for x in items]
    enums = {
        "ActiveState": ("active", "inactive", "failed", "activating", "deactivating", "reloading", "maintenance"),
        "SubState": ("dead", "running", "exited", "failed", "auto-restart", "start", "start-pre", "start-post", "stop", "stop-sigterm", "stop-sigkill", "stop-post", "condition", "reload"),
        "PrivateNetwork": ("yes", "no"),
        "NoNewPrivileges": ("yes", "no"),
        "ProtectSystem": ("yes", "no", "full", "strict"),
    }
    if prop in enums:
        if value not in enums[prop]:
            raise ValueError("unrecognized_enum")
        return value
    if prop in ("MainPID", "MemoryMax", "TasksMax"):
        if value == "infinity" and prop != "MainPID":
            return value
        return numbers(value, 1)[0]
    if prop in ("ReadOnlyPaths", "ReadWritePaths"):
        items = value.split(" ")
        if len(items) > MAX_PATHS:
            raise ValueError("too_many_paths")
        return [{"path": absolute_path(x.lstrip("-+")),
                 "prefix": x[:len(x) - len(x.lstrip("-+"))]} for x in items]
    if prop in ("IPAddressAllow", "IPAddressDeny"):
        items = value.split()
        if len(items) > MAX_PATHS:
            raise ValueError("too_many_networks")
        return [x if x in ("any", "localhost", "link-local", "multicast")
                else str(ipaddress.ip_network(x, strict=False)) for x in items]
    raise ValueError("unrecognized_property")


def parse_properties(text):
    parsed = {}
    for line in text.splitlines():
        key, separator, value = line.partition("=")
        if not separator or key not in PROPERTIES or key in parsed:
            raise ValueError("unrecognized_property_envelope")
        try:
            parsed[key] = {"status": "observed", "value": property_value(key, value)}
        except ValueError:
            # Neither unrecognized values nor exception messages escape.
            parsed[key] = {"status": "unknown_unrecognized"}
    return {key: parsed.get(key, {"status": "unknown_absent"}) for key in PROPERTIES}


def run_bounded(argv, timeout):
    """Read both pipes incrementally. Never return stderr or failed stdout."""
    if timeout <= 0:
        return {"status": "deadline_exceeded"}
    command_deadline = time.monotonic() + min(timeout, COMMAND_SECONDS)
    process = None
    selector = selectors.DefaultSelector()
    output = bytearray()
    error = bytearray()
    status = "ok"
    finished = False
    try:
        process = subprocess.Popen(
            argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, shell=False, start_new_session=True,
            env={"PATH": SEARCH_PATH, "LANG": "C", "LC_ALL": "C", "TZ": "UTC"},
        )
        selector.register(process.stdout, selectors.EVENT_READ, output)
        selector.register(process.stderr, selectors.EVENT_READ, error)
        # Reserve bounded cleanup time inside the per-command ceiling.
        deadline = command_deadline - min(0.2, timeout / 10)
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                status = "timeout"
                break
            for key, _ in selector.select(min(remaining, 0.1)):
                chunk = os.read(key.fileobj.fileno(), min(4096, OUTPUT_BYTES + 1 - len(output) - len(error)))
                if not chunk:
                    selector.unregister(key.fileobj)
                else:
                    key.data.extend(chunk)
                if len(output) + len(error) > OUTPUT_BYTES:
                    status = "output_limit"
                    break
            if status != "ok":
                break
        if status == "ok":
            try:
                code = process.wait(timeout=max(0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                status = "timeout"
            else:
                if code != 0:
                    status = "permission_denied" if any(x in error for x in (
                        b"Permission denied", b"Access denied", b"Operation not permitted")) else "command_failed"
        if status != "ok":
            return {"status": status}
        try:
            text = output.decode("utf-8", errors="strict")
            finished = True
            return {"status": "ok", "text": text}
        except UnicodeDecodeError:
            return {"status": "unrecognized_encoding"}
    except PermissionError:
        return {"status": "permission_denied"}
    except OSError:
        return {"status": "command_unavailable"}
    finally:
        selector.close()
        if process is not None:
            # The session leader may already have exited while a child still
            # holds a pipe. Cleanup targets only the group created above.
            if not finished or process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                try:
                    process.wait(timeout=max(0, command_deadline - time.monotonic()))
                except subprocess.TimeoutExpired:
                    pass
            for pipe in (process.stdout, process.stderr):
                if pipe is not None:
                    pipe.close()


def describe():
    return {
        "contract": CONTRACT, "mode": "DESCRIBE_ONLY", "execution": False,
        "historicalTarget": TARGET, "targetVerified": False,
        "readOnly": True, "usd": 0, "providerCalls": 0, "setupActions": [],
        "units": list(UNITS), "principals": list(PRINCIPALS),
        "basePaths": list(BASE_PATHS), "unitProperties": list(PROPERTIES),
        "pathMetadata": "numeric uid/gid/mode/type via stat; at most 16 base/declared reference paths",
        "limits": {"totalSeconds": TOTAL_SECONDS, "commandSeconds": COMMAND_SECONDS,
                   "commandOutputBytes": OUTPUT_BYTES, "metadataPaths": MAX_PATHS},
        "runtime": "uname/getconf, exact /opt/node-v24/bin/node --version; pg_config from fixed system PATH, validated absolute bindir, four --version calls",
        "headroom": "free -b, df for proof root, numeric ps fields for observed proof MainPID only",
        "notVerified": ["current target identity", "authorization", "ACL/effective credential read access",
                        "LoadCredentialEncrypted/ImportCredential (not collected)",
                        "DeepSeek credential presence or entitlement", "runtime isolation effectiveness",
                        "peak load admission", "reusability of historical proof resources"],
        "exclusions": ["SSH/network code", "sudo", "raw command output", "Environment/SetCredential/ExecStart",
                       "unit/config/environment/credential/log contents", "permit reads", "recursive scans",
                       "production/website units", "service starts/stops", "setup", "paid calls"],
    }


class Collector:
    def __init__(self, execute=run_bounded, clock=time.monotonic,
                 which=shutil.which, realpath=os.path.realpath):
        self.execute, self.clock, self.which, self.realpath = execute, clock, which, realpath
        self.deadline = clock() + TOTAL_SECONDS

    def read(self, argv, parse):
        remaining = self.deadline - self.clock()
        if remaining <= 0:
            return {"status": "deadline_exceeded"}
        result = self.execute(argv, min(COMMAND_SECONDS, remaining))
        if result.get("status") != "ok":
            allowed = ("deadline_exceeded", "timeout", "output_limit", "permission_denied", "command_failed", "command_unavailable", "unrecognized_encoding")
            status = result.get("status")
            return {"status": status if status in allowed else "unknown_failure"}
        try:
            raw = result["text"]
            if not isinstance(raw, str) or len(raw.encode("utf-8")) > OUTPUT_BYTES:
                raise ValueError("output_limit")
            return {"status": "observed", "value": parse(raw.strip())}
        except (ValueError, KeyError, TypeError, IndexError):
            return {"status": "unknown_unrecognized"}

    def collect(self):
        report = describe()
        report.update(mode="READ_ONLY_METADATA", execution=True,
                      observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
        units, paths, pids = {}, list(BASE_PATHS), set()
        overflow = False
        for unit in UNITS:
            entry = self.read(["/usr/bin/systemctl", "show", unit, "--no-pager",
                               "--property=" + ",".join(PROPERTIES)], parse_properties)
            units[unit] = entry
            if entry["status"] != "observed":
                continue
            props = entry["value"]
            for prop in ("EnvironmentFiles", "LoadCredential"):
                for item in props[prop].get("value", []):
                    candidate = item["path"]
                    if candidate not in paths:
                        if len(paths) < MAX_PATHS:
                            paths.append(candidate)
                        else:
                            overflow = True
            pid = props["MainPID"].get("value")
            if isinstance(pid, int) and 0 < pid <= 2147483647:
                pids.add(pid)
        report["observations"] = {
            "units": units,
            "principals": {name: self.principal(name) for name in PRINCIPALS},
            "pathMetadata": {p: self.read(["/usr/bin/stat", "--format=%u|%g|%a|%F", "--", p], parse_stat) for p in paths},
            "pathLimitReached": overflow,
            "aclAndEffectiveReadAccess": "NOT_COLLECTED_NOT_A_PERMISSION_GRANT",
            "runtime": self.runtime(),
            "memory": self.read(["/usr/bin/free", "-b"], parse_free),
            "disk": self.read(["/usr/bin/df", "-B1", "--output=size,used,avail,pcent", "--", BASE_PATHS[0]], parse_df),
            "processes": {str(pid): self.read(["/usr/bin/ps", "-p", str(pid), "-o", "pid=,uid=,gid=,rss=,vsz=,etimes="], lambda x: numbers(x, 6)) for pid in sorted(pids)},
        }
        report["deadlineReached"] = self.clock() >= self.deadline
        return report

    def principal(self, name):
        return {"uid": self.read(["/usr/bin/id", "-u", name], lambda x: numbers(x, 1)[0]),
                "gid": self.read(["/usr/bin/id", "-g", name], lambda x: numbers(x, 1)[0]),
                "groups": self.read(["/usr/bin/id", "-G", name], numbers)}

    def runtime(self):
        runtime = {
            "kernel": self.read(["/usr/bin/uname", "-srm"], lambda x: matched(x, r"Linux [A-Za-z0-9_.+-]{1,80} [A-Za-z0-9_]{1,24}")),
            "libc": self.read(["/usr/bin/getconf", "GNU_LIBC_VERSION"], lambda x: matched(x, r"glibc [0-9]+\.[0-9]+")),
            "node": self.read(["/opt/node-v24/bin/node", "--version"], lambda x: matched(x, r"v[0-9]+\.[0-9]+\.[0-9]+")),
        }
        try:
            config = self.which("pg_config", path=SEARCH_PATH)
            if config is None:
                runtime["postgres"] = {"status": "command_unavailable"}
                return runtime
            config = absolute_path(self.realpath(config))
            bindir = self.read([config, "--bindir"], absolute_path)
            runtime["postgresBindir"] = bindir
            if bindir["status"] == "observed":
                directory = absolute_path(self.realpath(bindir["value"]))
                binaries = {}
                for name in ("postgres", "initdb", "pg_ctl", "createdb"):
                    binary = absolute_path(self.realpath(directory + "/" + name))
                    if os.path.dirname(binary) != directory:
                        binaries[name] = {"status": "unknown_binary_outside_bindir"}
                    else:
                        binaries[name] = {"path": binary, **self.read([binary, "--version"], lambda x, n=name: matched(x, re.escape(n) + r" \(PostgreSQL\) [0-9]+\.[0-9]+(?: \([A-Za-z0-9 .+~:-]{1,100}\))?"))}
                runtime["postgres"] = binaries
        except (ValueError, OSError):
            runtime["postgres"] = {"status": "unknown_unrecognized"}
        return runtime


def matched(value, pattern):
    if not re.fullmatch(pattern, value):
        raise ValueError("unrecognized_value")
    return value


def parse_stat(value):
    uid, gid, mode, kind = value.split("|")
    if not re.fullmatch(r"[0-7]{1,4}", mode) or kind not in ("directory", "regular file", "regular empty file", "symbolic link", "socket"):
        raise ValueError("unrecognized_stat")
    return {"uid": numbers(uid, 1)[0], "gid": numbers(gid, 1)[0], "mode": mode, "type": kind, "followsSymlink": False}


def parse_free(value):
    lines = value.splitlines()
    if len(lines) != 3 or lines[1].split()[0] != "Mem:" or lines[2].split()[0] != "Swap:":
        raise ValueError("unrecognized_memory")
    return {"memoryBytes": dict(zip(("total", "used", "free", "shared", "buffCache", "available"), numbers(" ".join(lines[1].split()[1:]), 6))),
            "swapBytes": dict(zip(("total", "used", "free"), numbers(" ".join(lines[2].split()[1:]), 3)))}


def parse_df(value):
    lines = value.splitlines()
    if len(lines) != 2:
        raise ValueError("unrecognized_disk")
    items = lines[1].split()
    if len(items) != 4 or not re.fullmatch(r"[0-9]{1,3}%", items[3]):
        raise ValueError("unrecognized_disk")
    size, used, available = numbers(" ".join(items[:3]), 3)
    return {"sizeBytes": size, "usedBytes": used, "availableBytes": available, "usedPercent": int(items[3][:-1])}


def main(argv=None):
    # Three finite forms avoid argparse/gettext locale-file discovery even in
    # describe mode. Unknown arguments are never copied into error output.
    argv = sys.argv[1:] if argv is None else argv
    if argv in ([], ["--describe"], ["--help"]):
        result = describe()
    elif argv != ["--collect"]:
        print(json.dumps({"contract": CONTRACT, "status": "unknown_arguments", "execution": False}))
        return 2
    elif sys.platform != "linux":
        result = {"contract": CONTRACT, "status": "linux_target_required", "execution": False}
    else:
        result = Collector().collect()
    print(json.dumps(result, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
