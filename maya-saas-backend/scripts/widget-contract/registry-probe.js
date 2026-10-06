const {ActionCapabilityRegistry}=require('../../src/action-engine/action-engine.registry');
const {canonicalProductionPolicyDefinitions}=require('../../src/action-engine/action-engine.policy-registry');
const {MAYA_AI_TOOL_CATALOG}=require('../../src/ai-tools/ai-tool.catalog');
const {C9_CAPABILITIES}=require('../../src/orchestration/c9.registry');
const {SERVICE_PRICE_CAPABILITY,SERVICE_PRICE_TOOL}=require('../../src/crm/yclients-service-price.contract');

// The former census remains an independent baseline. Exclude only the one exact
// approved pricing entry in each registry, then expose its identity separately.
const keys={
  AE:new ActionCapabilityRegistry().list().map(row=>row.capability),
  POLICY:canonicalProductionPolicyDefinitions().map(row=>row.capability),
  TOOL:MAYA_AI_TOOL_CATALOG.map(row=>row.name),
  C9:C9_CAPABILITIES.map(row=>row.capabilityKey),
};
const pricingKey={
  AE:SERVICE_PRICE_CAPABILITY,
  POLICY:SERVICE_PRICE_CAPABILITY,
  TOOL:SERVICE_PRICE_TOOL,
  C9:SERVICE_PRICE_TOOL,
};
console.log(JSON.stringify({
  current:Object.fromEntries(Object.entries(keys).map(([space,rows])=>[space,rows.length])),
  historical:Object.fromEntries(Object.entries(keys).map(([space,rows])=>[space,rows.filter(key=>key!==pricingKey[space]).length])),
  pricing:Object.fromEntries(Object.entries(keys).map(([space,rows])=>[space,rows.filter(key=>key===pricingKey[space])])),
}));
