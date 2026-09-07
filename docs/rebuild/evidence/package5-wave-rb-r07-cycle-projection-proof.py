"""Run the six existing cycle projection regressions without runtime imports.

Only actual function bodies and literal constants are loaded. Synthetic DB and
YClients doubles replace imports, and SQLite/network entry points are denied.
This verifies the preserved candidate projection, not a delivery capability.
"""
import argparse
import ast
from datetime import date, datetime, timedelta
import hashlib
import importlib.util
import json
import logging
from pathlib import Path
import socket
import sqlite3
import sys
import types
import unittest
from unittest.mock import Mock, patch

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('tests', type=Path)
args = parser.parse_args()
module = types.ModuleType('cycle_reminder')
module.__dict__.update(date=date, datetime=datetime, timedelta=timedelta,
    hashlib=hashlib, json=json, logging=logging, logger=Mock(),
    database=Mock(get_setting=Mock(return_value=None)), _yc=Mock())
body = []
for node in ast.parse((args.root / 'cycle_reminder.py').read_text()).body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        node.returns = None
        for arg in node.args.args + node.args.kwonlyargs:
            arg.annotation = None
        body.append(node)
    elif isinstance(node, ast.Assign):
        try:
            ast.literal_eval(node.value)
            body.append(node)
        except (ValueError, TypeError):
            pass
exec(compile(ast.Module(body=body, type_ignores=[]), 'cycle_reminder.py', 'exec'), module.__dict__)
sys.modules['cycle_reminder'] = module
spec = importlib.util.spec_from_file_location('test_cycle_reminder', args.tests)
tests = importlib.util.module_from_spec(spec)
with patch.object(socket, 'socket', side_effect=AssertionError('network forbidden')), patch.object(sqlite3, 'connect', side_effect=AssertionError('DB forbidden')):
    spec.loader.exec_module(tests)
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(tests))
raise SystemExit(not result.wasSuccessful())
