"""Forward-only fixed Client feedback route for both inventoried API aliases.
Apply to the independently verified CURRENT base at cutover, not an old relay.
"""
def transform(source):
    anchor = "    case 'notify_prefs':"
    if source.count(anchor) != 1 or "case 'native_feedback':" in source:
        raise ValueError('R08 exact known Client command switch required')
    return source.replace(anchor, "    case 'native_feedback':\n        require_once __DIR__ . '/package5-client-consent-proxy.php';\n        maya_client_consent_proxy($action, $input, $TG_CONFIG);\n        break;\n\n" + anchor)


if __name__ == '__main__':
    import argparse
    from pathlib import Path
    parser = argparse.ArgumentParser(); parser.add_argument('source'); parser.add_argument('target'); args = parser.parse_args()
    Path(args.target).write_text(transform(Path(args.source).read_text()))
