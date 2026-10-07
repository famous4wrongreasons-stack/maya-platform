// Jest adapter only: execute the existing finite ESM budget/manifest modules
// unchanged in its CommonJS test VM. No copied budget logic or live transport.
const ts = require('typescript');
module.exports = {
  process(sourceText, sourcePath) {
    if (
      !/\/scripts\/conversation-qualification\/current-candidate(?:-budget|-keyless-profile|-profile-metadata)?\.mjs$/.test(
        sourcePath,
      )
    ) {
      throw new Error('candidate_mjs_transform_outside_finite_modules');
    }
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
