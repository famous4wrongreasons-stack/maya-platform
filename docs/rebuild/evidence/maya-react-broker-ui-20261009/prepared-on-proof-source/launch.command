#!/bin/sh
set -eu
cd '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-pricing-semantic-integration/maya-saas-backend'
exec env -i PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/stanislavmosin TMPDIR=/tmp TZ=UTC '/usr/local/bin/node' '--max-old-space-size=256' 'scripts/conversation-qualification/core-ui-local.mjs' '--run' '--plan' '/private/tmp/maya-ui-1bad-20261009-r1/local-plan.json' '--plan-sha256' '33a9175e1c786be71866f7d5167e1edec55143f24974f23ed63fbf1966c05ace'
