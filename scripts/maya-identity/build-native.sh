#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
NATIVE=${1:?Isolated native directory required}
OUTPUT=${2:?Owned build directory required}
cd "$NATIVE"
npx cap sync ios
node "$ROOT/scripts/maya-identity/verify-native.cjs" "$NATIVE"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=FF6F8003-99D2-5AED-A4CA-05BAE3877929' -derivedDataPath "$OUTPUT" \
  CURRENT_PROJECT_VERSION=11 -allowProvisioningUpdates build
node "$ROOT/scripts/maya-identity/verify-native.cjs" "$NATIVE" "$OUTPUT/Build/Products/Debug-iphoneos/App.app"
