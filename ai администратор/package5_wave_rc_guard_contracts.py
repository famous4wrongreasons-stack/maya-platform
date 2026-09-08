"""Pinned approved R-C boundaries; shipped with standalone production ratchets.

These literals mirror the reviewed package overlays. Updating runtime alone cannot
change the expected contract. The cross-check test verifies overlay parity.
"""
from types import SimpleNamespace

_CONTRACTS = {'r06': {'BODIES': {'bot.py': {'_dual_role_guard_job': 'return '
                                                       "{'status':'retired_identity_alert_not_authority','messages':0}",
                               '_god_watch_job': 'return '
                                                 "{'status':'retired_no_canonical_operational_occurrence','messages':0}",
                               '_schedule_reminder': '# Existing B25 scheduler owns canonical Appointment '
                                                     'reminder plans.\n'
                                                     'return None',
                               '_send_reminder': 'return '
                                                 "{'status':'canonical_B25_owner_required','messages':0}"},
                    'freed_slot.py': {'alert_admins_new_waitlist': 'from canonical_operational_alerts import '
                                                                   'trigger\n'
                                                                   'triggered = await trigger()\n'
                                                                   'return '
                                                                   "{'triggered':triggered,'pending':0,'alerted':0,'authority':'canonical_wanted_interest_only'}"},
                    'lead_alerts.py': {'scan_and_alert': 'return '
                                                         "{'checked':0,'alerted':0,'status':'retired_unverified_lead_occurrence'}"},
                    'maya_inbox_bridge.py': {'publish_inbox_item': '# A generic payload cannot prove its '
                                                                   'business owner or delivery authority.\n'
                                                                   'return False',
                                             'publish_owner_message': 'return False'},
                    'site_community.py': {'notify_owner': 'return False'},
                    'webhook_server.py': {'_process_record_create': 'from canonical_operational_alerts '
                                                                    'import trigger\n'
                                                                    'await trigger()\n'
                                                                    'return '
                                                                    "{'status':'canonical_event_owner_pending','record_id':record_id}",
                                          '_process_record_delete': 'from canonical_operational_alerts '
                                                                    'import trigger\n'
                                                                    'await trigger()\n'
                                                                    'return '
                                                                    "{'status':'canonical_event_owner_pending','record_id':record_id}",
                                          '_process_record_update': 'from canonical_operational_alerts '
                                                                    'import trigger\n'
                                                                    'await trigger()\n'
                                                                    'return '
                                                                    "{'status':'canonical_event_owner_pending','record_id':record_id}",
                                          '_send_shift_reminders_once': 'from canonical_operational_alerts '
                                                                        'import trigger\n'
                                                                        'await trigger()\n'
                                                                        'return 0'}}},
 'r08': {'BODIES': {'bot.py': {'_reviews_job': 'return '
                                               "{'status':'canonical_admitted_request_scheduler','messages':0}",
                               'cmd_reviews_now': "await update.effective_message.reply_text('Запрос отзыва "
                                                  'доступен для отмеченного визита в MAYA: '
                                                  "https://malesthetic.pro/app/?native_feedback=management')",
                               'cmd_reviews_stats': "await update.effective_message.reply_text('Проверенные "
                                                    'ответы клиентов доступны в MAYA: '
                                                    "https://malesthetic.pro/app/?native_feedback=management')"},
                    'database.py': {'expire_stale_review_requests': 'raise '
                                                                    "PermissionError('canonical_native_feedback_executor_required')",
                                    'get_review_request_by_id': 'return None',
                                    'list_recent_reviews': 'return []',
                                    'mark_review_request_failed': 'raise '
                                                                  "PermissionError('canonical_native_feedback_executor_required')",
                                    'mark_review_request_sent': 'raise '
                                                                "PermissionError('canonical_native_feedback_executor_required')",
                                    'pending_review_requests_to_send': 'return []',
                                    'record_review_response': 'raise '
                                                              "PermissionError('canonical_native_feedback_executor_required')",
                                    'review_stats': 'return '
                                                    "{'available':False,'source':'quarantined_legacy_feedback','avg_rating':None,'total_rated':None,'requested':None,'responded':None}",
                                    'reviews_by_master': 'return {}',
                                    'schedule_review_request': 'raise '
                                                               "PermissionError('canonical_native_feedback_executor_required')"},
                    'reviews.py': {'_fetch_client_minimal': 'return None',
                                   '_notify_admins_negative': 'return None',
                                   '_notify_admins_positive': 'return None',
                                   'handle_negative_comment': '# An unrelated next message never establishes '
                                                              'feedback intent or authority.\n'
                                                              'return False',
                                   'handle_rating_callback': 'query = update.callback_query\n'
                                                             'if not query or not str(query.data or '
                                                             "'').startswith('rev_'):\n"
                                                             '    return False\n'
                                                             "await query.answer('Оставьте или исправьте "
                                                             "отзыв в личном кабинете MAYA.')\n"
                                                             'return True',
                                   'schedule_after_close': '# A payment/record update cannot attest arrived '
                                                           'attendance or admit feedback.\n'
                                                           'return False',
                                   'send_pending_review_requests': 'return '
                                                                   "{'status':'retired_canonical_explicit_request_required','checked':0,'sent':0,'blocked':0,'skipped_no_consent':0}"}},
         'HANDLER': 'async def client_native_feedback_handler(request: web.Request) -> web.Response:\n'
                    '    """R08 verified-channel initiator. No local request/revision/send owner."""\n'
                    '    import legacy_client_command_bridge as client_commands\n'
                    '    try:\n'
                    '        body = await request.json()\n'
                    "        if not isinstance(body, dict) or set(body) - {'operation', 'command', "
                    "'idempotencyKey', 'auth_data', 'maya_token'}:\n"
                    "            raise ValueError('invalid_feedback_envelope')\n"
                    "        operation = body.get('operation')\n"
                    "        if operation not in {'projection', 'response', 'withdraw'}:\n"
                    "            raise ValueError('invalid_feedback_operation')\n"
                    '        proof = client_commands.channel_proof(request.headers, body)\n'
                    "        if operation == 'projection':\n"
                    "            if 'command' in body or 'idempotencyKey' in body:\n"
                    "                raise ValueError('feedback_read_has_no_command')\n"
                    '            payload = {}\n'
                    '        else:\n'
                    "            payload = {'command': body.get('command'), 'idempotencyKey': "
                    "body.get('idempotencyKey')}\n"
                    "        result = await asyncio.to_thread(client_commands.command, 'feedback-' + "
                    'operation, proof, payload)\n'
                    '        return _cabinet_response(result)\n'
                    '    except ValueError as error:\n'
                    '        code = str(error)\n'
                    "        return _cabinet_response({'error': 'IDEMPOTENCY_CONFLICT' if code == "
                    "'IDEMPOTENCY_CONFLICT' else 'feedback_identity_or_command_rejected'}, status=409 if "
                    "code == 'IDEMPOTENCY_CONFLICT' else 403)\n"
                    '    except Exception:\n'
                    '        return '
                    "_cabinet_response({'error':'feedback_outcome_unconfirmed','retry':'same_command_identity'}, "
                    'status=503)\n'
                    '\n'
                    '\n'},
 'r09': {'BODIES': {'site_community.py': {'comment_result': 'raise '
                                                            "PermissionError('canonical_public_community_owner_required')",
                                          'init_schema': 'return None',
                                          'mark_review': 'raise '
                                                         "PermissionError('canonical_public_community_owner_required')",
                                          'notify_owner': 'return False',
                                          'process_comment': 'return None',
                                          'public_status': 'raise '
                                                           "PermissionError('canonical_public_community_owner_required')",
                                          'reserve_comment': 'raise '
                                                             "PermissionError('canonical_public_community_owner_required')",
                                          'resolve_comment': 'raise '
                                                             "PermissionError('canonical_public_community_owner_required')",
                                          'review_queue': 'raise '
                                                          "PermissionError('canonical_public_community_owner_required')",
                                          'set_like': 'raise '
                                                      "PermissionError('canonical_public_community_owner_required')",
                                          'spend_limits': '# Existing durable protocol limit table only; no '
                                                          'community business writer.\n'
                                                          'import sqlite3\n'
                                                          'from contextlib import closing\n'
                                                          'now = now or time.time()\n'
                                                          'with closing(sqlite3.connect(events.DB_PATH, '
                                                          'timeout=30)) as db:\n'
                                                          '    with db:\n'
                                                          "        db.execute('BEGIN IMMEDIATE')\n"
                                                          "        db.execute('DELETE FROM "
                                                          "site_community_limits WHERE created < ?', (now - "
                                                          '86400,))\n'
                                                          '        for bucket, seconds, maximum in limits:\n'
                                                          "            count = db.execute('SELECT COUNT(*) "
                                                          'FROM site_community_limits WHERE bucket=? AND '
                                                          "created>?', (bucket, now - "
                                                          'seconds)).fetchone()[0]\n'
                                                          '            if count >= maximum:\n'
                                                          '                raise '
                                                          "CommunityError('rate_limited', 'Слишком много "
                                                          "запросов. Попробуйте позже.', 429)\n"
                                                          "        db.executemany('INSERT INTO "
                                                          "site_community_limits VALUES (?,?)', [(item[0], "
                                                          'now) for item in limits])'},
                    'site_engagement.py': {'_connect': 'raise '
                                                       "PermissionError('canonical_public_community_owner_required')",
                                           '_maya_text': 'raise '
                                                         "PermissionError('canonical_public_community_owner_required')",
                                           'add_brand_reply': 'raise '
                                                              "PermissionError('canonical_public_community_owner_required')",
                                           'add_comment': 'raise '
                                                          "PermissionError('canonical_public_community_owner_required')",
                                           'event_status': 'raise '
                                                           "PermissionError('canonical_public_community_owner_required')",
                                           'generate_brand_reply': "return ''",
                                           'init_schema': 'return None',
                                           'moderate_comment': "return 'review', 'human_moderation_required'",
                                           'record_view': 'raise '
                                                          "PermissionError('canonical_public_community_owner_required')",
                                           'toggle_like': 'raise '
                                                          "PermissionError('canonical_public_community_owner_required')"}},
         'REGISTER': 'from config import TELEGRAM_TOKEN\n'
                     'from site_guest_chat import GuestError, guest_chat\n'
                     'import canonical_public_community as canonical\n'
                     '\n'
                     'secret = TELEGRAM_TOKEN\n'
                     '\n'
                     'async def handler(request):\n'
                     '    try:\n'
                     '        raw = await request.text()\n'
                     '        if len(raw) > 12000:\n'
                     "            raise CommunityError('too_large', 'Сообщение слишком длинное.', 413)\n"
                     "        action = request.match_info['action']\n"
                     '        body = verify_gateway(raw, request.headers, secret)\n'
                     "        if body.get('gateway_action') != action:\n"
                     "            raise CommunityError('forbidden', 'Исходное действие не подтверждено.', "
                     '403)\n'
                     "        visitor, network = body['visitor'], body['network']\n"
                     "        if action in {'moderation', 'resolve'}:\n"
                     '            # Raw Telegram/session/gateway identity cannot be a moderator.\n'
                     '            return '
                     "response({'ok':False,'error':'canonical_moderation_required','url':'https://malesthetic.pro/app/?community_moderation=1'}, "
                     '410)\n'
                     "        if action == 'guest-chat':\n"
                     "            await asyncio.to_thread(spend_limits, [('chat-ip:' + network, 60, 12), "
                     "('chat-day:' + network, 86400, 80), ('chat-global', 86400, 400)])\n"
                     '            return response(await guest_chat.send(body))\n'
                     "        if action not in {'status', 'comment', 'view', 'like'}:\n"
                     "            raise CommunityError('not_found', 'Не найдено.', 404)\n"
                     '        # Ignore legacy optional auth/session metadata: every source is anonymous.\n'
                     "        slug = events.normalize_slug(body.get('slug'))\n"
                     '        if not slug:\n'
                     "            raise CommunityError('event_not_found', 'Публикация не найдена.', 404)\n"
                     '        command, key = {}, None\n'
                     "        if action != 'status':\n"
                     "            key = str(body.get('request_key', ''))\n"
                     '            if not REQUEST_ID.fullmatch(key):\n'
                     "                raise CommunityError('invalid_request', 'Обновите страницу.', 400)\n"
                     "        if action == 'comment':\n"
                     "            if body.get('consent') is not True or body.get('consent_policy_version') "
                     "!= 'public-comment-consent/1':\n"
                     "                raise CommunityError('consent_required', 'Подтвердите согласие перед "
                     "публикацией.', 403)\n"
                     "            check_form(secret, visitor, body.get('form_token'))\n"
                     "            if body.get('website'):\n"
                     "                raise CommunityError('spam', 'Не удалось отправить комментарий.', "
                     '422)\n'
                     "            text = events.normalize_comment(body.get('text'))\n"
                     "            author = check_author(body.get('display_name'))\n"
                     "            if events.deterministic_moderation(text)[0] == 'reject':\n"
                     "                raise CommunityError('moderation_rejected', 'Уберите личные данные, "
                     "оскорбления или спам.', 422)\n"
                     "            await asyncio.to_thread(spend_limits, [('comment-ip:' + network, 60, 3), "
                     "('comment-day:' + network, 86400, 20), ('comment-guest:' + visitor, 60, 2)])\n"
                     "            command = {'author': author, 'text': text, 'publicationConsent': True, "
                     "'consentPolicyVersion': body['consent_policy_version']}\n"
                     "        elif action == 'like':\n"
                     "            version = body.get('expected_version')\n"
                     "            if not isinstance(body.get('liked'), bool) or isinstance(version, bool) or "
                     'not isinstance(version, int) or version < 0:\n'
                     "                raise CommunityError('invalid_like', 'Обновите обсуждение.', 400)\n"
                     "            await asyncio.to_thread(spend_limits, [('like:' + network, 60, 30)])\n"
                     "            command = {'desiredLiked': body['liked'], 'expectedVersion': version}\n"
                     "        elif action == 'view':\n"
                     "            await asyncio.to_thread(spend_limits, [('view:' + network, 60, 90)])\n"
                     '        result = await canonical.request(action, slug, visitor, command, key)\n'
                     "        if action == 'status':\n"
                     "            result['comments'] = [{'id': item['id'], 'author': item['author'], 'text': "
                     "item['text'], 'is_guest': item['sourceKind'] == 'GUEST', 'is_brand_reply': "
                     "item['sourceKind'] == 'BRAND', 'parent_id': item['parentId'], 'created_at': "
                     "item['createdAt'], 'date_label': item['createdAt'][:10]} for item in "
                     "result['comments']]\n"
                     "        if action == 'comment':\n"
                     "            result['comment_id'] = result['commentId']; result['status'] = "
                     "result['status'].lower()\n"
                     '        result.update(ok=True, form_token=form_token(secret, visitor))\n'
                     "        return response(result, 202 if action == 'comment' and result['status'] == "
                     "'pending' else 200)\n"
                     '    except canonical.CommunityReceiptError as error:\n'
                     "        return response({'ok':False, 'error':error.code, "
                     "'retry':'same_command_identity' if error.status >= 500 else None}, error.status)\n"
                     '    except (CommunityError, GuestError) as error:\n'
                     "        return response({'ok':False,'error':error.code,'message':getattr(error, "
                     "'message', 'Запрос не принят.')}, error.status)\n"
                     '    except (ValueError, TypeError, json.JSONDecodeError):\n'
                     "        return response({'ok':False,'error':'invalid_request','message':'Проверьте "
                     "поля сообщения.'}, 400)\n"
                     '    except Exception as error:\n'
                     "        logger.warning('Canonical community source request: %s', "
                     'type(error).__name__)\n'
                     '        return '
                     "response({'ok':False,'error':'community_receipt_unconfirmed','retry':'same_command_identity'}, "
                     '503)\n'
                     '\n'
                     "app.router.add_post('/api/site/community/{action}', handler)\n"
                     "if not any(route.resource.canonical == '/api/site/posts' for route in "
                     'app.router.routes()):\n'
                     '    publications.register_routes(app)\n'},
 'r12': {'BODIES': {'bot.py': {'cmd_clear': 'async def cmd_clear(update: Update, context: '
                                            'ContextTypes.DEFAULT_TYPE):\n'
                                            '    await update.effective_message.reply_text("Серверная '
                                            'история сохранена. Удаление общей истории через /clear '
                                            'недоступно.")'},
                    'database.py': {'_staff_messages_ensure': 'def _staff_messages_ensure(*args, **kwargs):\n'
                                                              '    raise '
                                                              "PermissionError('canonical_TeamMessage_owner_required')",
                                    'add_staff_message': 'def add_staff_message(*args, **kwargs):\n'
                                                         '    raise '
                                                         "PermissionError('canonical_TeamMessage_owner_required')",
                                    'delete_staff_message': 'def delete_staff_message(*args, **kwargs):\n'
                                                            '    raise '
                                                            "PermissionError('canonical_TeamMessage_owner_required')",
                                    'get_staff_latest_message_id': 'def get_staff_latest_message_id(*args, '
                                                                   '**kwargs):\n'
                                                                   '    raise '
                                                                   "PermissionError('canonical_TeamMessage_owner_required')",
                                    'get_staff_messages_recent': 'def get_staff_messages_recent(*args, '
                                                                 '**kwargs):\n'
                                                                 '    raise '
                                                                 "PermissionError('canonical_TeamMessage_owner_required')",
                                    'get_staff_messages_since': 'def get_staff_messages_since(*args, '
                                                                '**kwargs):\n'
                                                                '    raise '
                                                                "PermissionError('canonical_TeamMessage_owner_required')"},
                    'webhook_server.py': {'_push_team_message': 'async def _push_team_message(*args, '
                                                                '**kwargs):\n'
                                                                '    raise '
                                                                "PermissionError('canonical_TeamMessage_Communication_Delivery_required')",
                                          '_team_chat_mark_media_expiry': 'def '
                                                                          '_team_chat_mark_media_expiry(messages):\n'
                                                                          '    raise '
                                                                          "PermissionError('canonical_private_team_media_required')",
                                          'team_chat_delete_handler': 'async def '
                                                                      'team_chat_delete_handler(request: '
                                                                      'web.Request) -> web.Response:\n'
                                                                      '    from '
                                                                      'canonical_team_communications import '
                                                                      'handle\n'
                                                                      '    return await handle(request, '
                                                                      "'withdraw')",
                                          'team_chat_fetch_handler': 'async def '
                                                                     'team_chat_fetch_handler(request: '
                                                                     'web.Request) -> web.Response:\n'
                                                                     '    from canonical_team_communications '
                                                                     'import handle\n'
                                                                     '    return await handle(request, '
                                                                     "'feed')",
                                          'team_chat_normalize_voice_handler': 'async def '
                                                                               'team_chat_normalize_voice_handler(request: '
                                                                               'web.Request) -> '
                                                                               'web.Response:\n'
                                                                               '    from '
                                                                               'canonical_team_communications '
                                                                               'import retired\n'
                                                                               '    return '
                                                                               '_cabinet_response(retired(), '
                                                                               'status=410)',
                                          'team_chat_send_handler': 'async def '
                                                                    'team_chat_send_handler(request: '
                                                                    'web.Request) -> web.Response:\n'
                                                                    '    from canonical_team_communications '
                                                                    'import handle\n'
                                                                    '    return await handle(request, '
                                                                    "'send')",
                                          'team_chat_upload_auth_handler': 'async def '
                                                                           'team_chat_upload_auth_handler(request: '
                                                                           'web.Request) -> web.Response:\n'
                                                                           '    from '
                                                                           'canonical_team_communications '
                                                                           'import handle\n'
                                                                           '    return await handle(request, '
                                                                           "'reserve')"}}},
 'r13': {'BODIES': {'bot.py': {'_anton_expense_reminder_job': 'async def _anton_expense_reminder_job(*args, '
                                                              '**kwargs):\n'
                                                              '    raise '
                                                              "PermissionError('ExpenseReminderRun_A13_owner_required')",
                               '_parse_anton_expenses': 'def _parse_anton_expenses(*args, **kwargs):\n'
                                                        '    raise '
                                                        "PermissionError('canonical_expense_card_validation_required')",
                               '_save_anton_expenses': 'async def _save_anton_expenses(*args, **kwargs):\n'
                                                       '    raise '
                                                       "PermissionError('confirmed_P407_expense_owner_required')",
                               'cmd_rashod': 'async def cmd_rashod(update: Update, context: '
                                             'ContextTypes.DEFAULT_TYPE):\n'
                                             '    from canonical_expense_intake import initiate\n'
                                             '    await initiate(update)',
                               'handle_message': 'async def handle_message(update: Update, context: '
                                                 'ContextTypes.DEFAULT_TYPE):\n'
                                                 '    from canonical_expense_intake import expense_reply, '
                                                 'initiate\n'
                                                 '    if expense_reply(update.effective_message):\n'
                                                 '        await initiate(update)\n'
                                                 '        return\n'
                                                 '    await process_message(update, context, '
                                                 'update.message.text)'},
                    'database.py': {'add_salon_expense': 'def add_salon_expense(*args, **kwargs):\n'
                                                         '    raise '
                                                         "PermissionError('canonical_P407_expense_owner_required')",
                                    'clear_salon_expenses': 'def clear_salon_expenses(*args, **kwargs):\n'
                                                            '    raise '
                                                            "PermissionError('canonical_P407_expense_owner_required')",
                                    'get_salon_expenses': 'def get_salon_expenses(*args, **kwargs):\n'
                                                          '    raise '
                                                          "PermissionError('canonical_P407_expense_owner_required')",
                                    'sum_salon_expenses': 'def sum_salon_expenses(*args, **kwargs):\n'
                                                          '    raise '
                                                          "PermissionError('canonical_P407_expense_owner_required')"},
                    'webhook_server.py': {}}}}

def contract(package):
    return SimpleNamespace(**_CONTRACTS[package])
