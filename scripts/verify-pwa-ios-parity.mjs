import { readFileSync } from "node:fs";

const [pwaFile, iosFile, generatedIosFile] = process.argv.slice(2);

if (!pwaFile || !iosFile) {
  throw new Error(
    "Usage: node scripts/verify-pwa-ios-parity.mjs <pwa.html> <ios-source.html> [ios-generated.html]",
  );
}

const pwa = readFileSync(pwaFile, "utf8");
const ios = readFileSync(iosFile, "utf8");

function requireInBoth(marker, description) {
  for (const [file, source] of [
    [pwaFile, pwa],
    [iosFile, ios],
  ]) {
    if (!source.includes(marker)) {
      throw new Error(`${file}: missing ${description}`);
    }
  }
}

function extractExportedComponent(source, name, file) {
  const start = source.indexOf(`function ${name}(`);
  const endMarker = `window.${name} = ${name};`;
  const end = source.indexOf(endMarker, start);

  if (start < 0 || end < 0) {
    throw new Error(`${file}: cannot extract ${name}`);
  }

  return source
    .slice(start, end + endMarker.length)
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function namesMatching(source, pattern) {
  return new Set(Array.from(source.matchAll(pattern), (match) => match[1]));
}

function unexpectedDifference(left, right, allowed) {
  return [...left].filter((name) => !right.has(name) && !allowed.has(name)).sort();
}

for (const [marker, description] of [
  ["client_book_loyalty", "loyalty-aware booking"],
  ["function usualPrefillData(", "usual booking prefill"],
  ["function meContactAdmin(", "administrator contact action"],
  ["var catalog = window.APP_DATA || {};", "dynamic shop catalog"],
  ["function appendChatWidget(", "deduplicated chat widgets"],
  ["function chatMessageWidgetKind(", "chat widget identity"],
  ["function meConfirmDialog(", "branded confirmation dialog"],
  ["CHAT_HISTORY_CACHE + ':saas:' + ctx.ns", "tenant-scoped chat cache"],
  ["window.__SAAS_FEATURES_EFFECTIVE === true", "authenticated feature gate"],
]) {
  requireInBoth(marker, description);
}

if (!pwa.includes("apiBase = location.origin + '/api'")) {
  throw new Error(`${pwaFile}: missing same-origin PWA API boot`);
}
if (!ios.includes("var trustedBoot = !!(srvBoot")) {
  throw new Error(`${iosFile}: missing trusted native boot`);
}
if (!ios.includes("window.__ME_MAYA_OS_PREVIEW === true && isNativeApp()")) {
  throw new Error(`${iosFile}: missing native-only owner preview`);
}

const sharedComponents = [
  "ABookFlow",
  "ABookCard",
  "AMyBookingsCard",
  "ALoyaltyCard",
  "AProfileCard",
  "AShopCard",
  "AReferralCard",
  "AHistoryCard",
  "ANotifyCard",
  "ATipsCard",
  "AOwnerMorningBrief",
  "AMayaIntro",
];

for (const name of sharedComponents) {
  const pwaComponent = extractExportedComponent(pwa, name, pwaFile);
  const iosComponent = extractExportedComponent(ios, name, iosFile);
  if (pwaComponent !== iosComponent) {
    throw new Error(`${name}: shared PWA and iOS implementations differ`);
  }
}

const functionPattern = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
const pwaFunctions = namesMatching(pwa, functionPattern);
const iosFunctions = namesMatching(ios, functionPattern);
const pwaOnlyAllowed = new Set(["onShow"]);
const iosOnlyAllowed = new Set([
  "allowedPreviewApi",
  "beginComposerKeyboardMotion",
  "cancelKeyboardBottomMotion",
  "clampMicPoint",
  "endComposerKeyboardMotion",
  "glideChatToLatest",
  "isNativeApp",
  "measureAppViewport",
  "micHintPoint",
  "micPointerDown",
  "micPointerEnd",
  "micPointerMove",
  "micViewportBox",
  "onDidShow",
  "onHide",
  "onWillShow",
  "persistMicPoint",
  "readMicPosition",
  "rememberKeyboardHeight",
  "settleComposerKeyboardMotion",
]);

const unexpectedPwaFunctions = unexpectedDifference(
  pwaFunctions,
  iosFunctions,
  pwaOnlyAllowed,
);
const unexpectedIosFunctions = unexpectedDifference(
  iosFunctions,
  pwaFunctions,
  iosOnlyAllowed,
);

if (unexpectedPwaFunctions.length || unexpectedIosFunctions.length) {
  throw new Error(
    `Unexpected function drift. PWA-only: ${unexpectedPwaFunctions.join(", ") || "none"}; ` +
      `iOS-only: ${unexpectedIosFunctions.join(", ") || "none"}`,
  );
}

const exportPattern = /\bwindow\.([A-Za-z_$][\w$]*)\s*=/g;
const pwaExports = namesMatching(pwa, exportPattern);
const iosExports = namesMatching(ios, exportPattern);
const iosOnlyExportsAllowed = new Set([
  "__ME_MAYA_OS_API_BASE",
  "__ME_MAYA_OS_API_CANDIDATES",
  "__meChatOnly",
  "__meResolveMayaOsApi",
]);

const unexpectedPwaExports = unexpectedDifference(
  pwaExports,
  iosExports,
  new Set(),
);
const unexpectedIosExports = unexpectedDifference(
  iosExports,
  pwaExports,
  iosOnlyExportsAllowed,
);

if (unexpectedPwaExports.length || unexpectedIosExports.length) {
  throw new Error(
    `Unexpected global export drift. PWA-only: ${unexpectedPwaExports.join(", ") || "none"}; ` +
      `iOS-only: ${unexpectedIosExports.join(", ") || "none"}`,
  );
}

if (generatedIosFile) {
  const generatedIos = readFileSync(generatedIosFile);
  const iosSource = readFileSync(iosFile);
  if (!generatedIos.equals(iosSource)) {
    throw new Error(
      `${generatedIosFile}: generated Capacitor bundle differs from ${iosFile}`,
    );
  }
}

process.stdout.write(
  `PWA/iOS parity OK: ${sharedComponents.length} shared components, ` +
    `${pwaFunctions.size} PWA functions, ${iosFunctions.size} iOS functions.\n`,
);
