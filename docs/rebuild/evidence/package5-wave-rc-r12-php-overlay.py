"""R12 removal of the exact inventoried PHP storage owner, both aliases.
Unrelated relay/auth/payment/community cases are byte-preserved.
"""
import re

HELPERS = ['team_media_dir','team_media_upload_dir','team_media_ext_map','team_media_prepare_dirs',
 'team_media_rm_tree','team_media_cleanup_if_due','team_media_detect','team_media_mime_from_name',
 'team_media_proxy_url','stream_team_media_file','team_json','team_upload_id_ok','team_upload_path',
 'team_load_upload_meta','team_staff_auth_ok']
CASES = ['team_chat_media','team_chat_upload_init','team_chat_upload_chunk','team_chat_upload_finish',
         'team_chat_upload_abort','team_chat_send','team_chat_fetch']
BODY = '''
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'canonical_team_owner_required',
            'url' => 'https://malesthetic.pro/app/?team=main', 'business_mutations' => 0,
            'legacy_files_changed' => 0]);
        break;

'''


def transform(source):
    start=source.index('function team_media_dir(): string {');end=source.index('$action =',start)
    if re.findall(r'function\s+(\w+)\s*\(',source[start:end])!=HELPERS:
        raise ValueError('R12 exact known PHP helper span required')
    source=source[:start]+'// R12: private TeamAttachment storage is owned by the canonical executor/AC6.\n\n'+source[end:]
    for name in CASES:
        matches=list(re.finditer(r"(?m)^[ \t]*case '"+name+r"':",source))
        if len(matches)!=1:raise ValueError('R12 exact case required: '+name)
        m=matches[0];n=re.search(r"(?m)^[ \t]*(?:case '[^']+':|default:)",source[m.end():])
        if not n:raise ValueError('R12 next case boundary required')
        source=source[:m.end()]+BODY+source[m.end()+n.start():]
    for helper in HELPERS:
        if re.search(r'\b'+helper+r'\s*\(',source):raise ValueError('R12 residual PHP storage helper: '+helper)
    return source


if __name__=='__main__':
    import argparse
    from pathlib import Path
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('target');a=p.parse_args()
    Path(a.target).write_text(transform(Path(a.source).read_text()))
