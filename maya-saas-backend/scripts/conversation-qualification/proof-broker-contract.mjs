export const PROOF_BROKER_BODY_MAX = 98304;
export function assertProofBrokerBody(body) {
  if (typeof body !== 'string' || !body.length || Buffer.byteLength(body, 'utf8') > PROOF_BROKER_BODY_MAX)
    throw new Error('proof_broker_body_limit');
}
