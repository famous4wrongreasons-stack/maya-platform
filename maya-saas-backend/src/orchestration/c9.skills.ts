import { C9Object, C9_TASKS, c9Hash, c9Deny } from './c9.contract';
import { C9_REGISTRY_HASH } from './c9.registry';

/**
 * Released reasoning bundles. These are **code artifacts with immutable digests**, not
 * runtime-editable rows: nothing here can be rewritten by a model, by a conversation or by
 * a tenant. A bundle names what a task is allowed to do and which evaluation manifest
 * certified it; changing any part changes its digest and therefore its identity.
 *
 * No prompt text, secret or provider credential is stored in the database — only digests.
 * There is no online training, no promotion of a bundle from production outcomes, and no
 * path by which a running agent can modify its own bundle.
 */
export type C9SkillBundle = {
  taskKey: (typeof C9_TASKS)[number];
  version: 1;
  /** What this reasoning task may do at all. Narrower than the registry, never wider. */
  allowedModes: readonly ('READ' | 'PROPOSE_ONLY' | 'OWNER_HANDOFF')[];
  maxFindings: number;
  maxProposedIntents: number;
  /** Released instruction identity. The text lives in the repository, not in a row. */
  instructionKey: string;
  evaluationManifestKey: string;
};
const BUNDLES: readonly C9SkillBundle[] = Object.freeze([
  {
    taskKey: 'c9.route',
    version: 1,
    allowedModes: ['READ'],
    maxFindings: 0,
    maxProposedIntents: 0,
    instructionKey: 'c9/route/deterministic-table',
    evaluationManifestKey: 'c9/eval/routing',
  },
  {
    taskKey: 'c9.bi',
    version: 1,
    allowedModes: ['READ'],
    maxFindings: 20,
    // Read-only by contract: a BI bundle cannot even express a proposal.
    maxProposedIntents: 0,
    instructionKey: 'c9/bi/grounded-read',
    evaluationManifestKey: 'c9/eval/business-intelligence',
  },
  {
    taskKey: 'c9.admin',
    version: 1,
    allowedModes: ['READ', 'PROPOSE_ONLY', 'OWNER_HANDOFF'],
    maxFindings: 20,
    maxProposedIntents: 12,
    instructionKey: 'c9/admin/operational-support',
    evaluationManifestKey: 'c9/eval/admin',
  },
  {
    taskKey: 'c9.client_lifecycle',
    version: 1,
    allowedModes: ['READ', 'PROPOSE_ONLY'],
    maxFindings: 20,
    maxProposedIntents: 12,
    instructionKey: 'c9/client-lifecycle/return-options',
    evaluationManifestKey: 'c9/eval/client-lifecycle',
  },
  {
    taskKey: 'c9.occupancy',
    version: 1,
    allowedModes: ['READ', 'PROPOSE_ONLY'],
    maxFindings: 20,
    maxProposedIntents: 12,
    instructionKey: 'c9/occupancy/capacity-options',
    evaluationManifestKey: 'c9/eval/occupancy',
  },
  {
    taskKey: 'c9.compose',
    version: 1,
    allowedModes: ['READ'],
    maxFindings: 20,
    maxProposedIntents: 0,
    instructionKey: 'c9/compose/grounded-answer',
    evaluationManifestKey: 'c9/eval/compose',
  },
]);

const digest = (bundle: C9SkillBundle, part: string) =>
  c9Hash('skill-bundle/1', [
    part,
    bundle.taskKey,
    bundle.version,
    bundle.allowedModes,
    bundle.maxFindings,
    bundle.maxProposedIntents,
    bundle.instructionKey,
    bundle.evaluationManifestKey,
    C9_REGISTRY_HASH,
  ]);

export const C9_SKILLS: readonly C9Object[] = Object.freeze(
  BUNDLES.map((bundle) =>
    Object.freeze({
      taskKey: bundle.taskKey,
      skillHash: digest(bundle, 'skill'),
      promptHash: digest(bundle, 'prompt'),
      modelConfigHash: digest(bundle, 'model-config'),
      evaluationManifestHash: digest(bundle, 'evaluation'),
    }),
  ),
);
export const C9_SKILL_MANIFEST_HASH = c9Hash('skill-manifest/1', [C9_SKILLS]);

export function c9Skill(taskKey: string): C9SkillBundle {
  const bundle = BUNDLES.find((b) => b.taskKey === taskKey);
  if (!bundle) c9Deny('unregistered_skill_bundle');
  return bundle;
}
export function c9SkillVersions(
  taskKeys: readonly string[],
): readonly C9Object[] {
  const seen = new Set<string>();
  const out: C9Object[] = [];
  for (const key of taskKeys) {
    c9Skill(key);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(C9_SKILLS.find((s) => s.taskKey === key)!);
  }
  if (out.length > 6) c9Deny('skill_bundle_bounds');
  return out;
}
