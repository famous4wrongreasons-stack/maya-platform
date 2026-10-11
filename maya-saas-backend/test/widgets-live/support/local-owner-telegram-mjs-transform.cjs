// Execute these exact launcher modules in Jest's CJS VM. No copied guard logic.
const ts = require('typescript');
module.exports = {
  process(sourceText, sourcePath) {
    if (
      !/\/scripts\/(?:local-owner-telegram-(?:policy|transport|runtime)|local-owner-scope|local-onboarding-profile|local-yclients-read-status)\.mjs$/.test(
        sourcePath,
      )
    )
      throw new Error('local_telegram_transform_outside_scope');
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
