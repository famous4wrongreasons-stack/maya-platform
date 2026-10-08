// Only adapt existing finite ESM helpers for this separate Jest probe. Runtime,
// replay, serializer, budget and admission logic are executed unchanged.
const ts = require('typescript');
module.exports = {
  process(sourceText, sourcePath) {
    if (
      !/\/scripts\/conversation-qualification\/(?:replay|current-candidate-budget|core-conversation-admission)\.mjs$/.test(
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
