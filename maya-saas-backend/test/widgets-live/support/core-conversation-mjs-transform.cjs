// Only adapt existing finite ESM helpers for this separate Jest probe. Runtime,
// replay, serializer, budget and admission logic are executed unchanged.
const ts = require('typescript');
module.exports = {
  process(sourceText, sourcePath) {
    const ownerLocal = /\/scripts\/(?:local-owner-chat-policy|local-owner-chat-runtime|local-owner-history-review-policy|local-owner-scope|local-owner-history-policy|local-owner-telegram-policy|local-onboarding-profile|local-yclients-read-transport|local-yclients-read-profile|local-yclients-read-status)\.mjs$/.test(sourcePath);
    if (
      !ownerLocal &&
      !/\/scripts\/conversation-qualification\/(?:replay|current-candidate-budget|core-conversation-profile|core-react-bridge|owned-child-cleanup|core-conversation-admission|core-conversation-socket|core-conversation-assessment|core-full-offline-model|core-full-offline-assessment)\.mjs$/.test(
        sourcePath,
      )
    )
      throw new Error('core_conversation_transform_outside_finite_modules');
    return {
      code: ts.transpileModule(sourceText, {
        fileName: sourcePath + '.ts',
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
    };
  },
};
