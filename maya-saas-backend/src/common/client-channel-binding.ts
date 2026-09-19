/** Shared A18 evidence descriptor only. Verification and writes remain with
 * ClientChannelLink/consent owners; importing this type grants no authority. */
export type ClientChannelProvider = 'maya_user' | 'telegram';

export interface ConsentChannelBinding {
  linkId: string;
  provider: ClientChannelProvider;
  providerSubjectHash: string;
  verificationEvidenceHash: string;
}
