import ast
import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock
from package5_loyalty_read_guard import scan_loyalty_reads

ROOT = Path(__file__).parent


class LoyaltyReadBoundaryTest(unittest.TestCase):
    def test_real_ai_query_branch_uses_only_verified_query(self):
        source = ast.parse((ROOT/'claude_ai.py').read_text())
        branch = next(n for n in ast.walk(source) if isinstance(n, ast.If) and ast.unparse(n.test) == "tool_name == 'check_loyalty_balance'")
        wrapper = ast.FunctionDef(name='query', args=ast.arguments(posonlyargs=[],args=[ast.arg(arg='tool_input')],kwonlyargs=[],kw_defaults=[],defaults=[]),body=branch.body+[ast.Return(ast.Name(id='result',ctx=ast.Load()))],decorator_list=[])
        module = ast.fix_missing_locations(ast.Module(body=[wrapper],type_ignores=[]))
        public_catalog = SimpleNamespace(_normalize_service_title=lambda s:s, current_care_services=lambda:[{'title':'care','price':50}])
        env={'json':json}
        with patch.dict('sys.modules',{'loyalty':public_catalog, 'legacy_client_command_bridge':SimpleNamespace(loyalty_projection=Mock())}):
            exec(compile(module,'real-ai-loyalty-branch','exec'),env)
            for balance in (0,40,100):
                with patch('legacy_client_command_bridge.loyalty_projection',return_value={'balance':balance}) as query:
                    result=env['query']({'current_service_names':['care'],'clientId':'forged','phone':'forged'})
                    self.assertEqual(result['balance'],balance)
                    query.assert_called_once_with()
            for reason in ('missing','ambiguous','revoked','wrong-tenant','CRM-failure'):
                with patch('legacy_client_command_bridge.loyalty_projection',side_effect=ValueError(reason)):
                    result=json.loads(env['query']({}))
                    self.assertIsNone(result['balance'])
                    self.assertFalse(result['can_redeem'])

    def test_snapshot_handler_is_inert_for_all_requests(self):
        node=next(n for n in ast.parse((ROOT/'webhook_server.py').read_text()).body if isinstance(n,ast.AsyncFunctionDef) and n.name=='internal_loyalty_snapshot_handler')
        env={'web':SimpleNamespace(json_response=lambda data,status:(status,data))}
        exec(compile(ast.Module(body=[node],type_ignores=[]),'retired-snapshot','exec'),env)
        async def run():
            return await asyncio.gather(*(env['internal_loyalty_snapshot_handler'](object()) for _ in range(20)))
        self.assertEqual(asyncio.run(run()),[(410,{'error':'FEATURE_NOT_AVAILABLE'})]*20)

    def test_permanent_guard_rejects_restored_identity_and_value_bypasses(self):
        self.assertEqual(scan_loyalty_reads(ROOT),[])
        source=(ROOT/'claude_ai.py').read_text()
        for forbidden in ('database.get_client(user_id)','database.loyalty_balance(1)','database.get_or_create_client(user_id)','_loy._yc_loyalty_card("synthetic")'):
            changed=source.replace('balance = loyalty_projection()["balance"]','balance = '+forbidden)
            self.assertTrue(scan_loyalty_reads(ROOT,{'claude_ai.py':changed}))
        web=(ROOT/'webhook_server.py').read_text().replace('return web.json_response({"error": "FEATURE_NOT_AVAILABLE"}, status=410)','return web.json_response({"balance": 1}, status=410)')
        self.assertTrue(scan_loyalty_reads(ROOT,{'webhook_server.py':web}))

    def test_transport_requires_current_authenticated_context(self):
        node=next(n for n in ast.parse((ROOT/'legacy_client_command_bridge.py').read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='loyalty_projection')
        command=Mock(return_value={'balance':640})
        env={'command':command}
        exec(compile(ast.Module(body=[node],type_ignores=[]),'real-loyalty-transport','exec'),env)
        habits=SimpleNamespace(current_context=lambda:None)
        with patch.dict('sys.modules',{'legacy_client_habits_bridge':habits}):
            with self.assertRaises(ValueError): env['loyalty_projection']()
            command.assert_not_called()
            habits.current_context=lambda:SimpleNamespace(proof='synthetic-proof')
            self.assertEqual(env['loyalty_projection'](),{'balance':640})
            command.assert_called_once_with('loyalty-projection','synthetic-proof',{})



if __name__ == '__main__':
    unittest.main()
