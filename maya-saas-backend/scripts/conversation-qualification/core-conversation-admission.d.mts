export type CoreAdmissionBinding = Readonly<{
  candidateCommit: string;
  manifestSha256: string;
  profile: string;
  limitsSha256: string;
}>;
export type CoreTarget = Readonly<{
  host: string;
  workDirectory: string;
  brokerUid: number;
  runnerUid: number;
  brokerSocket: Readonly<{
    path: string;
    gid: number;
  }>;
}>;
export type CoreCredentialReference = Readonly<{
  kind: 'file';
  reference: string;
  owner: number;
  reader: number;
}>;
export type CoreManifest = CoreAdmissionBinding &
  Readonly<{
    contract: 'maya.core-conversation-run/1';
    mode: 'DRY_HTTP' | 'ADMITTED_MODEL_HTTP';
    sourceHashes: Readonly<Record<string, string>>;
    datasetSha256: string;
    dialogs: 3;
    userTurns: 5;
    cases: ReadonlyArray<
      Readonly<{
        id: string;
        role: string;
        runtimeRole: string;
        audience: string;
        group: string;
        userTurns: readonly string[];
        [key: string]: unknown;
      }>
    >;
    limits: Readonly<Record<string, string | number>>;
    runId: string;
    createdAt: string;
    paidAuthorized: false;
    upstreamAllowed: false;
    credentialAdmission: false;
    admissionContext: null | Readonly<{
      target: CoreTarget;
      credentialSource: CoreCredentialReference;
    }>;
  }>;
export type CoreAdmissionOptions = Readonly<{
  path: string;
  sha256: string;
  manifest: CoreManifest;
  claimPath: string;
  role: 'broker' | 'runner';
  target: CoreTarget;
  credentialSource: CoreCredentialReference;
  ownerApprovalRef: string;
}>;
export type CoreAdmissionAssertion = ((binding: CoreAdmissionBinding) => void) &
  Readonly<{
    startsAt: number;
    expiresAt: number;
  }>;
/** Reads only a bounded, pinned nonsecret declaration; grants no authority. */
export function readCoreManifest(path: string, sha256: string): CoreManifest;
/** Observe an already created claim, including from the separate runner UID. */
export function assertCoreAdmission(
  options: CoreAdmissionOptions,
): CoreAdmissionAssertion;
/** Broker only: durable exclusive claim, no reset or resume. */
export function claimCorePermit(
  options: CoreAdmissionOptions,
): CoreAdmissionAssertion;
