#!/bin/sh
set -eu
cd '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-pricing-semantic-integration/maya-saas-backend'
exec env -i PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/stanislavmosin TMPDIR=/tmp TZ=UTC '/usr/local/bin/node' '--max-old-space-size=256' 'scripts/conversation-qualification/core-ui-local.mjs' '--run' '--plan' '/private/tmp/maya-ui-recovery-20261010/local-plan.json' '--plan-sha256' '971b83a49d7af193c626ee10cbef4352ab8c14ae56b2ee4dfbdc3a995e172b1a'
