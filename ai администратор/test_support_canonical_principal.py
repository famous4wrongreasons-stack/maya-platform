"""Unit fixture at the existing R02 authentication port, never a raw-ID grant.

The real request middleware validates context, exact channel and scope lifetime.
Only the authenticated backend response is synthetic; raw-ID denial tests do not
use this fixture. Full reader/tenant/revocation proof remains test_package5_wave_ra_r02.
"""
import asyncio
from functools import wraps
from unittest.mock import patch
import canonical_staff_access as access


def verified_request(role, telegram_id, *, staff_id=None):
    def decorate(test):
        @wraps(test)
        def invoke(*args, **kwargs):
            principal = dict(contract='maya.canonical-staff-principal/1',
                userId='synthetic-user', tenantId='synthetic-tenant',
                membershipId='synthetic-membership', role=role,
                platform=role == 'platform_owner', telegramId=str(telegram_id),
                authIdentityId='synthetic-identity', staffId='synthetic-staff' if staff_id else None,
                externalStaffId=str(staff_id) if staff_id else None, businessMutations=0)
            class Request:
                method = 'POST'
                path = '/api/chat'
                can_read_body = True
                headers = {'Authorization': 'Bearer synthetic-proof-session'}
                async def json(self):
                    return {'mode': 'staff', 'user_id': telegram_id}
            async def run():
                async def handler(_request):
                    assert access.current(telegram_id) == principal
                    return test(*args, **kwargs)
                with patch.object(access, 'read_principal', return_value=principal):
                    result = await access.middleware(Request(), handler)
                assert access.current() is None
                return result
            return asyncio.run(run())
        return invoke
    return decorate
