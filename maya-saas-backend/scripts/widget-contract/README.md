# Regenerating the compiled Widget Contract

The fenced modules and derived tables in `src/widget-contract` are generated from the
certified contract. The directory also contains hand-maintained runtime/projection files.
`emit.mjs` clears its output directory: emit into a fresh temporary directory and copy only
the emitted files back, preserving those other files. Run from `maya-saas-backend`:

```sh
contract_tmp=$(mktemp -d)
node scripts/widget-contract/extract.mjs "$contract_tmp/blocks.json"
node scripts/widget-contract/emit.mjs "$contract_tmp/blocks.json" "$contract_tmp/modules"
node scripts/widget-contract/build-tables.mjs "$contract_tmp/modules/tables.ts"
cp scripts/widget-contract/derived-shapes.ts.tmpl "$contract_tmp/modules/derived-shapes.ts"
node scripts/widget-contract/postprocess.mjs "$contract_tmp/modules"
npx prettier --config .prettierrc --write "$contract_tmp/modules/"*.ts
cp "$contract_tmp/modules/"*.ts src/widget-contract/
node scripts/widget-contract/emit-runtime-floor.mjs
node scripts/widget-contract/emit-confirmation-guard.mjs
node scripts/widget-contract/emit-ledgers.mjs
node scripts/widget-contract/emit-runtime-floor.mjs --check
npx tsc --noEmit --project tsconfig.widget-contract.json
node scripts/widget-contract-check.mjs
```

Three things the generator cannot take from the contract, and why each is written down here
rather than inferred:

* **`tables.ts`** — five floor tables, the control registry and the family predicates are stated
  in the contract as **markdown tables**, not fenced TypeScript. `build-tables.mjs` parses them.
* **`derived-shapes.ts`** — five shapes the contract NAMES and declares nowhere. Each carries the
  clause that fixes it and the package that must build it. None adds a semantic.
* **`ambient.ts`** — the refusal, lookup and render surface the contract's pseudo-code calls.
  Each is a K3 or K5 deliverable, declared so that a rule citing one is a rule against a typed
  thing rather than a free name.

Two kinds of contract text are preserved as comments rather than emitted as code, because they
are specification and not TypeScript: `// [SPEC, not code]` for set-notation derivations, and
`// [MEMBER FRAGMENT]` for members quoted from a shape declared elsewhere.
