"""Narrow B22 overlays for the published PWA/proxy; no whole-bundle replacement."""
from pathlib import Path
import argparse
import ast
import re

PROXY_CASE = '''    case 'tip_sent':
        // p5_b22_unverified_tip_signal_retired: no upstream call or payload authority.
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'tip_signal_retired',
            'payment_confirmed' => false, 'external_payment_available' => true,
            'business_mutations' => 0]);
        break;
'''


def align_python(source, reference, names):
    """Replace only named B22 functions; retain active request-only overlays."""
    ref_lines = reference.splitlines(keepends=True)
    replacements = {n.name: ''.join(ref_lines[n.lineno-1:n.end_lineno]) for n in ast.parse(reference).body
                    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names}
    if set(replacements) != set(names):
        raise ValueError('Missing B22 reference function')
    nodes = [n for n in ast.parse(source).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    if len(nodes) != len(names):
        raise ValueError('Unexpected active B22 function inventory')
    lines = source.splitlines(keepends=True)
    for node in sorted(nodes, key=lambda n: n.lineno, reverse=True):
        lines[node.lineno-1:node.end_lineno] = [replacements[node.name]]
    result = ''.join(lines)
    ast.parse(result)
    return result


def align_proxy(source):
    pattern = r"    case 'tip_sent':.*?        break;\n(?=\s*(?://[^\n]*\n\s*)*(?:case |default:))"
    result, count = re.subn(pattern, lambda _: PROXY_CASE, source, flags=re.S)
    if count != 1:
        raise ValueError('Expected exactly one tip_sent proxy case')
    return result


def align_pwa(source):
    start = source.index('  window.__tipsSend = function')
    end = source.index('  // ?tips=', start)
    helper = source[start:end]
    if 'tip_sent' in helper:
        # Keep staff/company selection and the exact existing payment URL.
        signal_start = helper.index('    try {')
        url_start = helper.index('    var url = ')
        helper = helper[:signal_start] + helper[url_start:]
        helper = re.sub(r'(window\.(?:__meExt|Telegram.WebApp.openLink)\(url\);)\s*return;', r'\1 return { opened: true };', helper)
        helper = helper.replace("    window.open(url, '_blank');", "    return { opened: !!window.open(url, '_blank') };")
    helper = helper.replace('  window.__tipsSend = function', '  // p5_b22_external_payment_only: opening a page never confirms payment.\n  window.__tipsSend = function') if 'p5_b22_external_payment_only' not in source else helper
    source = source[:start] + helper + source[end:]
    source = re.sub(r'// Tips: [^\n]*', '// Tips: external payment only; no self-report or notification.', source)
    source = re.sub(r'  var TIPS_PROXY = [^\n]*\n', '', source)
    # Old published card assumed payment success after a timer.
    old = '  function doSend() { if (s.busy) return; patch({ busy: true }); try { if (window.__tipsSend) window.__tipsSend(s.mi, s.amt, noteLabel || undefined); } catch (er) {} setTimeout(function () { patch({ busy: false, sent: true }); }, 350); }'
    new = '''  function doSend() {
    if (s.busy) return;
    patch({ busy: true, sent: false, status: '' });
    var operation;
    try {
      if (!window.__tipsSend) throw new Error('tips_unavailable');
      operation = window.__tipsSend(s.mi, s.amt);
    } catch (err) { operation = Promise.reject(err); }
    Promise.resolve(operation).then(function (result) {
      patch({ busy: false, sent: true, status: result && result.opened
        ? 'Продолжите оплату на странице YClients. MAYA не подтверждает перевод.'
        : 'Не удалось открыть оплату. Попробуйте ещё раз.' });
    }).catch(function () { patch({ busy: false, sent: true, status: 'Не удалось открыть оплату. Попробуйте ещё раз.' }); });
  }'''
    source = source.replace(old, new)
    if "'Чаевые отправлены'" in source:
        start = source.index('  if (s.sent) {', source.index('function doSend()'))
        end = source.index('  var masterRow = ', start)
        source = source[:start] + '''  if (s.sent) {
    return e('div', { style: wrap },
      e('div', { style: { fontSize: 13, color: c.muted, lineHeight: 1.5 } }, s.status),
      e('button', { style: prim, onClick: function () { patch({ sent: false }); } }, 'Вернуться'));
  }
''' + source[end:]
    source = source.replace("'Страница оплаты открыта в Safari. После перевода вернитесь в MAYA.'", "'Продолжите оплату на странице YClients. MAYA не подтверждает перевод.'")
    source = source.replace("'Проверяю оплату…'", "'Открываю оплату…'")
    source = source.replace("('Отправить · ' + money(s.amt)", "('Перейти к оплате · ' + money(s.amt)")
    source = re.sub(r'    // 1\) intent signal[^\n]*\n', '', source)
    # No gratitude message is sent; don't offer this retired control.
    source = re.sub(r"    e\('div', \{ style: lab \}, 'Благодарность · по желанию'\), noteChips,\n", '', source)
    if 'tip_sent' in source or 'Чаевые отправлены' in source:
        raise ValueError('Unverified tip signal remains in PWA')
    return source


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('kind', choices=('pwa', 'proxy'))
    parser.add_argument('file', type=Path)
    args = parser.parse_args()
    args.file.write_text((align_pwa if args.kind == 'pwa' else align_proxy)(args.file.read_text()))
