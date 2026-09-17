# Regenerating the compiled Widget Contract

`src/widget-contract` is **generated from the certified contract**, not hand-maintained. The
contract is the source, so nothing here can drift from it.

```sh
node scripts/widget-contract/extract.mjs      /tmp/blocks.json
node scripts/widget-contract/emit.mjs         /tmp/blocks.json src/widget-contract
node scripts/widget-contract/build-tables.mjs src/widget-contract/tables.ts
cp   scripts/widget-contract/derived-shapes.ts.tmpl src/widget-contract/derived-shapes.ts
node scripts/widget-contract/postprocess.mjs  src/widget-contract
npx prettier --write 'src/widget-contract/**/*.ts'
node scripts/widget-contract/emit-runtime-floor.mjs
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
