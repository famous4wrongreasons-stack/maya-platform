import ast
import asyncio
from pathlib import Path
import os
import types
import unittest
from unittest.mock import Mock,patch
import canonical_governed_settings as entry
import package5_governed_settings_runtime_guard as guard

ROOT=Path(os.environ.get('MAYA_R11_PROOF_ROOT',Path(__file__).parent))


class GovernedSettingsProof(unittest.TestCase):
    def test_runtime_guard_and_negative_writers_before_and_after_delegation(self):
        self.assertEqual(guard.scan(ROOT),[])
        original=(ROOT/'webhook_server.py').read_text()
        node=guard.functions(original)['_founder_learning_reply'];lines=original.splitlines(keepends=True)
        for position in [node.body[0].lineno-1,node.end_lineno]:
            changed=''.join(lines[:position])+"    from database import set_setting as writer\n    writer('masters_ai_provider', 'openai')\n"+''.join(lines[position:])
            self.assertTrue(guard.scan(ROOT,{'webhook_server.py':changed}))
        original=(ROOT/'canonical_governed_settings.py').read_text()
        self.assertTrue(guard.scan(ROOT,{'canonical_governed_settings.py':original.replace('requests.get(', 'requests.post(')}))
        original=(ROOT/'database.py').read_text()
        self.assertTrue(guard.scan(ROOT,{'database.py':original.replace('    reject_legacy_setting_key(key)\n','',1)}))

    def test_missing_and_platform_principal_never_gain_tenant_owner_authority(self):
        for principal in [None,{'role':'platform_owner'},{'role':'administrator'}]:
            with patch.object(entry.canonical_staff_access,'current',return_value=principal),patch.object(entry,'_read') as read:
                self.assertIn('владелец',entry.owner_command_reply('rules',('add','Новая инструкция')))
                read.assert_not_called()

    def test_mute_is_bounded_handoff_never_a_write(self):
        self.assertIn('proposal=120',entry.mute_link([]))
        self.assertIn('proposal=1440',entry.mute_link(['24h']))
        self.assertIn('proposal=off',entry.mute_link(['off']))
        for args in [['25h'],['0m'],['1.1m'],['nan'],['inf']]:
            self.assertNotIn('https://',entry.mute_link(args))

    def test_canonical_reads_have_no_global_defaults(self):
        with patch.object(entry.canonical_staff_access,'current',return_value=None),patch.object(entry,'_read') as read:
            self.assertEqual(entry.rules(),[]);self.assertIsNone(entry.provider());self.assertFalse(entry.client_history_enabled());self.assertTrue(entry.telegram_muted(1));read.assert_not_called()
        for key in ['masters_ai_provider','MASTERS_AI_PROVIDER','maya_capability:client_self_visit_history']:
            with self.assertRaises(PermissionError):entry.reject_legacy_setting_key(key)
        entry.reject_legacy_setting_key('unrelated_existing_setting')

    def test_expired_or_missing_principal_cannot_reuse_a_credential(self):
        with patch.object(entry.canonical_staff_access,'current_credential',return_value=None),patch.dict('sys.modules',{'requests':types.SimpleNamespace(get=Mock(side_effect=AssertionError('transport'))) }):
            with self.assertRaises(PermissionError):entry._read('personal')

    def test_mute_cannot_inherit_old_membership_or_unreadable_preference(self):
        with patch.object(entry.canonical_staff_access,'current',return_value={'membershipId':'current'}):
            for config in [None,{}, {'schema_version':1,'membershipId':'old','telegramMutedUntil':None},{'schema_version':1,'membershipId':'current','telegramMutedUntil':'invalid'}]:
                with patch.object(entry,'_read',return_value={'config':config}):self.assertTrue(entry.telegram_muted(1))
            with patch.object(entry,'_read',return_value={'config':{'schema_version':1,'membershipId':'current','telegramMutedUntil':None}}):self.assertFalse(entry.telegram_muted(1))


if __name__=='__main__':unittest.main()
