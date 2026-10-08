# Linux OCR execution preflight and independent continuation — 2026-10-08

**Linux execution remains blocked by the absence of an installed/reachable local runtime.** Read-only checks on the Mac found no Docker, Podman, Colima/Lima, nerdctl, Apple container CLI, QEMU, Multipass, Tart, OrbStack, Parallels CLI or VMware CLI in PATH; no corresponding common application/Cask installations, Docker/Colima sockets or runtime processes were found. This is a bounded inventory of standard locations and running processes, not a claim about every arbitrary directory. No runtime was installed or started; no system network, security setting, permission, foreign process or working database was changed.

The accepted prior checkpoint remains `a80018042f1774a2923ef63d2fded2015765d860`; its code/native/current-chat qualification is unchanged. Mac Tesseract is not Linux proof. There is no newly qualified Linux image or digest.

## Measured resources and finite future plan

At the read-only observation around **2026-10-08 14:02–14:03 UTC**, hardware reports **128 GiB RAM / 16 logical and physical CPUs**. `vm_stat` has 3,169,450 free 16-KiB pages (about **48.36 GiB**); load averages are **2.85 / 4.02 / 3.16**. This is a snapshot, not reserved capacity. Other PostgreSQL processes exist and were left untouched. Sandbox denied the first sysctl/ps reads; the tool explicitly allowed read-only hardware/process metadata access. Process arguments were never read. The initial narrow ps column was truncated; the wide name-only pass supersedes its process-name conclusion.

If a permitted runtime becomes available, the finite qualification plan is:

1. Verify it targets a local engine; record daemon/VM, architecture and exact image digest. Do not use a remote Docker context or reconfigure a shared daemon/VM. Image build/pull prerequisites and download sizes need their own bounded preflight; the current mutable Node/APK resolution is not silently treated as a pinned image.
2. One own container, serial only: **one CPU, 2 GiB memory, 96 PIDs**, Node heap at most **1024 MiB**; read-only root filesystem, own bounded 64-MiB temporary space, no privileged mode/devices, all capabilities dropped. Apply restrictions only to that container; no host security/network changes.
3. Execute the fixed OCR harness by overriding the image command with Node. **Do not run the normal backend CMD**, which starts Prisma migrations and the app. No AppModule, database URL, credential environment, Docker socket, host home, production/repository/database mount or published port. Supply only copied, hashed synthetic fixtures in the own image/input bundle; container network disabled during recognition.
4. Run the existing eleven fixed images serially, one worker at a time; 15-second native deadline and 180-second whole-harness deadline. Preserve partial/null/refusal categories, record actual Linux TSV/rows, asset/package/binary hashes, measured resource and cleanup results. A Mac expected-output corpus is a comparison, never injected OCR output.
5. Stop/remove only the exact owned container/temp artifacts; do not prune shared images, stop other services or change system permissions. A failure remains a failure. Runtime installation or a new VM is not authorized by this plan.

No such run was attempted because step 1 has no available execution target.

## Independent useful fix

Code **`da3f65dd2512101100457ac08b9bd2815e12412b`** fixes a current manual goods-photo review dead end. YCLIENTS projects sale/write-off unit IDs and labels independently. Previously, equal IDs suppressed the write-off option even if the sale label was missing and the write-off label was known. The React form now first collects available labeled catalog units, then deduplicates those choices by ID. It does not map an OCR abbreviation, choose a unit automatically, prefill a price or grant provider authority. Both labels absent still means no selectable unit.

**12 React presentation tests, 21 headless workflow/transport tests, current React types and build pass.** New regressions require an explicit click on the one known catalog unit and preserve refusal when neither label exists. Independent static review found no blocker. All four owned test/build groups are closed/absent. This small delta has synthetic presentation/headless evidence; it does not refresh the previous HTTP/native/Linux acceptance scope. No backend, CRM writer, schema, retention or website change.

## Exact authority clarification

F32b/GR-PC1 is the separately named MONEY family **`inventory_receipt_purchase_cost`**: C9 `inventory.goods.receipt.prepare` → AE `crm.goods.receipt.create.v1`, action `create_crm_goods_receipt`, target `crm_goods_receipt`. One existing physical item, one company/store, one reviewed line, positive fractional quantity in one explicitly selected catalog unit and reviewed purchase cost/currency/date. It excludes sale-price edits, payments, new SKUs, batches and background effects.

F74b admits the exact canonical-chat provenance for that same existing outer `AiApprovalRequest`: authenticated owner turn, immutable payload hash/requester/source/expiry and the named APPROVAL pairing. Only that named lane has null producing REQUEST_APPROVAL refs. Presentation/OCR never provides authority; current checks and one-attempt/UNKNOWN-no-resend behavior remain.

The [canonical decision record](MAYA-GOODS-RECEIPT-CARRIER-DELTA-PROPOSAL-20261007.md) states that the owner answered **«да» on 2026-10-07 at 09:57:42 UTC** to the one-owner/one-existing-item/one-store purchase-cost confirmation proposal, relayed by parent with transcript evidence. F32b/F74b in the current contract implement that exact recorded decision. The original question/reply message IDs/thread were **not recovered** by this follow-up's bounded read-only history search. The quote and timestamp are attributed to the canonical record; no original transcript or wording is fabricated. This does not request the goods decision again or extend it to another capability.

**Service rename receives no goods exception.** Its proposed `YC-SR1-CHAT-1` / F74c direct-chat origin remains separate and unapproved. The genuine AE REQUIRED + consumed REQUEST_APPROVAL alternative is allowed by the existing general contract but still lacks finite service owner/registrations. The [service admission document](MAYA-YCLIENTS-SERVICE-RENAME-ADMISSION-20261008.md) now spells out the fourteen-field provider PATCH and the distinct inherited online/printed-title effects. Neither an owner semantic choice nor carrier approval proves provider preservation.

[Evidence and exact authority research](evidence/maya-development-integration-20261006/linux-ocr-followup-20261008/README.md). No Linux, live provider/model, production, SSH, phone, multi-company migration, push/merge, background C10 or completion certificate. `NOT_ISSUED`.
