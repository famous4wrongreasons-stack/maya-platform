"""R06 trigger-only source binding. No caller audience/content/delivery state."""
import os


async def trigger():
    import aiohttp
    from maya_inbox_bridge import _external_company_id, _PROVIDER
    token=(os.environ.get('MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN') or '').strip()
    company=_external_company_id()
    if len(token)<24 or not company:return False
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8)) as session:
            async with session.post('http://127.0.0.1:3107/api/internal/legacy/operational-alerts/tick',headers={'x-maya-legacy-bridge':token},json={'provider':_PROVIDER,'externalCompanyId':company}) as response:
                return 200<=response.status<300
    except Exception:
        # Lost trigger reply neither proves delivery nor permits a provider retry.
        return False
