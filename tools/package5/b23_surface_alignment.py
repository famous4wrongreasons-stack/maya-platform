"""B23 approved retirement overlays; preserve unrelated active production code."""
import argparse
import re
from pathlib import Path

PROXY_CASE = '''    case 'chat_delete':
        // p5_b23_server_history_delete_retired: no identity, storage or upstream access.
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'FEATURE_NOT_AVAILABLE']);
        break;
'''


def align_proxy(source):
    pattern = r"    case 'chat_delete':.*?        break;\n(?=\s*(?://[^\n]*\n\s*)*(?:case |default:))"
    result, count = re.subn(pattern, lambda _: PROXY_CASE, source, flags=re.S)
    if count != 1:
        raise ValueError('Expected exactly one chat_delete compatibility case')
    return result


def verify_proxy(source):
    start = source.index("    case 'chat_delete':")
    end = source.index('        break;', start) + len('        break;')
    if source[start:end].strip() != PROXY_CASE.strip():
        raise ValueError('B23 proxy must return only the fixed unsupported outcome')
    if '/api/chat/delete' in source:
        raise ValueError('B23 proxy must not forward server history deletion')


def verify_pwa(source):
    if re.search(r'action=chat_delete\b|/api/chat/delete', source):
        raise ValueError('B23 PWA calls retired server delete')
    start = source.index('  function canHideLocalChatMessage')
    end = source.index('  function clearLongPress()', start)
    functions = source[start:end]
    if re.search(r'fetch\(|authPayload|applyServerChatMessages', functions):
        raise ValueError('B23 local hiding accesses server identity/history')
    for marker in [
        "async function deleteChatMessage(m, i) {\n    if (!canHideLocalChatMessage(m)) return { ok: false, error: 'FEATURE_NOT_AVAILABLE' };",
        "async function clearMayaChat() {\n    if (!window.__ME_SAAS_CTX) return { ok: false, error: 'FEATURE_NOT_AVAILABLE' };",
        'function canHideLocalChatMessage(m) { return !!(window.__ME_SAAS_CTX || (m && m.inbox_id)); }',
        'const canClearChat = !!window.__ME_SAAS_CTX &&',
        'const canDeleteMsg = canHideLocalChatMessage(m) &&',
        'История на сервере сохранится.',
    ]:
        if marker not in source:
            raise ValueError('B23 PWA local/unsupported boundary missing')
    if "{ id: 'delete', label: 'Удалить'" in source:
        raise ValueError('B23 legacy delete context control remains')


def align_pwa(source):
    if 'p5_b23_server_history_delete_retired' in source:
        return source
    start = source.index('  async function deleteChatMessage(m, i) {')
    middle = source.index('  async function clearMayaChat()', start)
    end = source.index('  function clearLongPress()', middle)
    one = source[start:middle]
    all_messages = source[middle:end]
    one = one.replace('  async function deleteChatMessage(m, i) {', '''  // p5_b23_server_history_delete_retired: retain only existing local SaaS/inbox hiding.
  function canHideLocalChatMessage(m) { return !!(window.__ME_SAAS_CTX || (m && m.inbox_id)); }
  async function deleteChatMessage(m, i) {
    if (!canHideLocalChatMessage(m)) return { ok: false, error: 'FEATURE_NOT_AVAILABLE' };''')
    boundary = one.index('    if (window.__ME_SAAS_CTX)')
    one = one[:boundary] + '    setDeleteMode(false);\n\t  }\n\t'
    one = one.replace('const mutationRevision = protectLocalChat(8000);', 'protectLocalChat(8000);')
    one = one.replace("title: 'Удалить сообщение?', message: 'Это действие нельзя отменить.', confirmLabel: 'Удалить'", "title: 'Скрыть сообщение?', message: 'Сообщение будет скрыто на этом устройстве. История на сервере сохранится.', confirmLabel: 'Скрыть'")
    all_messages = all_messages.replace('  async function clearMayaChat() {', '''  async function clearMayaChat() {
    if (!window.__ME_SAAS_CTX) return { ok: false, error: 'FEATURE_NOT_AVAILABLE' };''')
    boundary = all_messages.index('    if (window.__ME_SAAS_CTX)')
    all_messages = all_messages[:boundary] + '''    chatMutationRef.current.clearPending = false;
    protectLocalChat(1200);
    setDeleteMode(false);
  }
  '''
    all_messages = all_messages.replace("title: 'Удалить переписку?', message: 'Вся история чата с MAYA будет удалена.', confirmLabel: 'Удалить'", "title: 'Скрыть переписку?', message: 'Лента будет скрыта на этом устройстве. История на сервере сохранится.', confirmLabel: 'Скрыть'")
    source = source[:start] + one + all_messages + source[end:]
    # Restrict existing controls before any optimistic UI/cache mutation.
    source = source.replace('const canDeleteMsg = ', 'const canDeleteMsg = canHideLocalChatMessage(m) && ')
    source = source.replace('const canClearChat = ', 'const canClearChat = !!window.__ME_SAAS_CTX && ')
    # Modern context-menu bundle; old bundle uses canDeleteMsg/long press only.
    source = source.replace("{ id: 'delete', label: 'Удалить', danger: true }", "...(canHideLocalChatMessage(msgMenu.message) ? [{ id: 'delete', label: 'Скрыть на устройстве', danger: true }] : [])")
    # Only the MAYA chat section; team chat retains its independently scoped UI.
    chat_end = source.index('window.AChat = AChat;')
    chat = source[:chat_end].replace("title: 'Удалить сообщение'", "title: 'Скрыть сообщение на устройстве'")
    chat = chat.replace("'Удалить всю переписку'", "'Скрыть переписку на устройстве'")
    source = chat + source[chat_end:]
    if re.search(r'action=chat_delete\b|/api/chat/delete', source):
        raise ValueError('Legacy history delete call remains')
    return source


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('kind', choices=('pwa', 'proxy'))
    parser.add_argument('file', type=Path)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.verify:
        (verify_pwa if args.kind == 'pwa' else verify_proxy)(args.file.read_text())
    else:
        args.file.write_text((align_pwa if args.kind == 'pwa' else align_proxy)(args.file.read_text()))
