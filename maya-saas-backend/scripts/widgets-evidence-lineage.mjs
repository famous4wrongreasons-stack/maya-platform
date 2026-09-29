// §0.5: a successor qualifies only through a captured, durable predecessor at the SAME entry/process.
export const productionTriggers = new Set(['T-2b', 'T-2a', 'T-1', 'T-3']);
export function qualifiedMint(mint, byHash, durable, seen = new Set()) {
  if (!mint || !mint.request_id || !durable.has(mint.intent_token_hash) ||
      byHash.get(mint.intent_token_hash)?.length !== 1 || seen.has(mint.widget_id)) return false;
  if (productionTriggers.has(mint.trigger)) return mint.predecessor_widget_id === undefined;
  if (mint.trigger !== 'successor' || !mint.predecessor_widget_id || mint.predecessor_widget_id === mint.widget_id) return false;
  const parents = [...byHash.values()].flat().filter(p => p.widget_id === mint.predecessor_widget_id);
  if (!parents.length) return false;
  const trail = new Set([...seen, mint.widget_id]);
  return parents.every(p => p.pid === mint.pid && qualifiedMint(p, byHash, durable, trail));
}
