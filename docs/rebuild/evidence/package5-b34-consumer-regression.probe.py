"""Existing consumer regressions; synthetic config/storage, external I/O forbidden.
Requires requests in the disposable test environment. No application DB is opened.
"""
import sys,types,unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'ai администратор'))
import requests

def no_write(*a,**kw): raise AssertionError('External I/O forbidden in consumer regression')
requests.sessions.Session.request=no_write
config=types.ModuleType('config');database=types.ModuleType('database')
database.get_setting=lambda key,default=None:default
database.set_setting=no_write
sys.modules['config']=config;sys.modules['database']=database
suite=unittest.TestSuite()
loader=unittest.TestLoader()
for name in ['test_market_intelligence','test_owner_ai']:
 suite.addTests(loader.loadTestsFromName(name))
result=unittest.TextTestRunner(verbosity=1).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)
