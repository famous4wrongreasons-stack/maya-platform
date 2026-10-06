#!/bin/bash
set -euo pipefail
out=/tmp/maya-unified-gate-20261006
node "$out/launch.cjs" node node_modules/jest/bin/jest.js --config test/jest-widgets-live.json --runInBand --runTestsByPath test/widgets-live/service-price.live-spec.ts test/widgets-live/schedule-chat.live-spec.ts test/widgets-live/c9-chat-reads.live-spec.ts test/widgets-live/conversation-history.live-spec.ts test/widgets-live/business-rules.live-spec.ts test/widgets-live/profile-isolation.live-spec.ts test/widgets-live/development-integration.live-spec.ts --json --outputFile="$out/http-cohort-attempt1.json" > "$out/http-cohort-attempt1.log" 2>&1
