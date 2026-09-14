#!/usr/bin/env python3
"""Retired legacy staff-authority CLI.

Historical Telegram bindings remain read-only compatibility evidence. Current
staff access is assigned through canonical A16 ``configure_crm_staff_access``.
"""

from __future__ import annotations


def main() -> int:
    print(
        "Legacy Telegram bind codes are retired. "
        "Assign administrator/staff access through canonical A16."
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
