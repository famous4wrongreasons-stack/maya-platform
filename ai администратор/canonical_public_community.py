"""R09 source initiator: verified gateway scope, no User/Client/SQL owner.

The caller validates the existing source signature, publication visibility,
form consent and protocol limits before invoking this finite bridge.
"""
import hashlib
import hmac
import json
import os
import time


class CommunityReceiptError(Exception):
    def __init__(self, code, status):
        self.code, self.status = code, status


def signed_source(operation, publication, visitor, command, request_key):
    gateway = os.environ.get('PUBLIC_COMMUNITY_GATEWAY_ID', '').strip()
    secret = os.environ.get('MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN', '').strip()
    if not gateway or len(secret) < 24:
        raise CommunityReceiptError('community_source_not_configured', 503)
    if operation not in {'status', 'comment', 'view', 'like'}:
        raise CommunityReceiptError('community_source_has_no_moderation_authority', 403)
    body = {'sourceGatewayId': gateway, 'operation': operation,
            'publicationKey': publication, 'publicationPublished': True,
            'visitorSubjectHash': visitor, 'command': command, 'requestKey': request_key}
    # Named protocol envelope: sorted UTF-8 object keys match stableActionJson.
    # Source fact fingerprints are normalized separately by the canonical owner.
    raw = json.dumps(body, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    stamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), ('maya.community-source/1:' + stamp + ':' + raw).encode(), hashlib.sha256).hexdigest()
    return raw, {'Content-Type': 'application/json', 'X-Community-Time': stamp, 'X-Community-Signature': signature}


async def request(operation, publication, visitor, command, request_key):
    import aiohttp
    raw, headers = signed_source(operation, publication, visitor, command, request_key)
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as session:
            async with session.post('http://127.0.0.1:3107/api/public-community/source', data=raw.encode(), headers=headers) as response:
                result = await response.json()
                if not 200 <= response.status < 300:
                    message = result.get('message', '') if isinstance(result, dict) else ''
                    code = message if message in {'IDEMPOTENCY_CONFLICT', 'STALE_COMMUNITY_OBSERVATION', 'DAILY_VIEW_ALREADY_RECORDED'} else 'community_command_rejected'
                    raise CommunityReceiptError(code, response.status if response.status < 500 else 503)
                if not isinstance(result, dict) or result.get('contract') != 'maya.public-community/1':
                    raise CommunityReceiptError('community_receipt_unconfirmed', 503)
                return result
    except CommunityReceiptError:
        raise
    except Exception as error:
        # No blind retry: the browser retains the original key and command.
        raise CommunityReceiptError('community_receipt_unconfirmed', 503) from error
