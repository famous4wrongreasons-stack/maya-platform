const {C9_CAPABILITIES}=require('/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/maya-saas-backend/src/orchestration/c9.registry');
const c=C9_CAPABILITIES.find(x=>x.capabilityKey==='b35.confirm');
console.log(JSON.stringify({total:C9_CAPABILITIES.length,found:!!c,mode:c&&c.mode,resourceClass:c&&c.resourceClass,riskTier:c&&c.riskTier}));
