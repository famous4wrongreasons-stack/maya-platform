import asyncio
import ast
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import canonical_team_communications as bridge
import package5_team_communications_runtime_guard as guard


class TeamProof(unittest.TestCase):
 def test_all_known_python_writers_and_indirect_mutants(self):
    root=Path(os.environ.get('MAYA_RC_PYTHON_CANDIDATE',Path(__file__).parent));self.assertEqual(guard.scan(root),[])
    for filename,bad in [('database.py',"def new_writer(c):\n c.execute('UPDATE staff_messages SET text=1')\n"),('webhook_server.py','def indirect():\n return database.add_staff_message\n'),('bot.py','async def cmd_clear(update, context):\n save_conversations(conversations)\n')]:self.assertTrue(guard.scan(root,{filename:(root/filename).read_text()+'\n'+bad}))
 def test_clear_is_protocol_reply_with_no_history_effect(self):
    body=guard.overlay().BODIES['bot.py']['cmd_clear'];tree=ast.parse(body);tree.body[0].args.args[0].annotation=None;tree.body[0].args.args[1].annotation=None
    namespace={};exec(compile(tree,'clear-proof','exec'),namespace);messages=[]
    class Message:
     async def reply_text(self,text):messages.append(text)
    asyncio.run(namespace['cmd_clear'](types.SimpleNamespace(effective_message=Message()),object()));self.assertEqual(len(messages),1);self.assertIn('сохранена',messages[0])
 def test_adapter_lost_response_never_allocates_new_identity(self):
    calls=[]
    class RequestError(Exception):pass
    def request(method,url,**kwargs):calls.append((method,url,kwargs));raise RequestError('synthetic lost response')
    fake=types.SimpleNamespace(request=request,RequestException=RequestError,ConnectionError=RequestError)
    with patch.dict(sys.modules,{'requests':fake}):
     for _ in range(2):self.assertTrue(bridge._request('synthetic','send',{'text':'same'},'same-key')['unknown'])
    self.assertEqual(calls[0],calls[1]);self.assertEqual(len(calls),2)
 def test_raw_legacy_projection_is_not_canonical_command_authority(self):
    class Request:
     headers={}
     async def json(self):return {'text':'legacy','auth_data':{'id':123},'session_token':'legacy'}
    principal={'role':'staff','platform':False}
    aiohttp=types.SimpleNamespace(web=types.SimpleNamespace(json_response=lambda value,status=200:types.SimpleNamespace(status=status,value=value)))
    with patch.dict(sys.modules,{'aiohttp':aiohttp}),patch.object(bridge.canonical_staff_access,'current',return_value=principal),patch.object(bridge.canonical_staff_access,'bearer',return_value='synthetic'):
     result=asyncio.run(bridge.handle(Request(),'send'));self.assertEqual(result.status,400)


if __name__=='__main__':unittest.main()
