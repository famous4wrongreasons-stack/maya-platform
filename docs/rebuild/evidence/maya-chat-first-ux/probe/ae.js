const {ActionCapabilityRegistry}=require('/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/maya-saas-backend/src/action-engine/action-engine.registry');
const r=new ActionCapabilityRegistry().list().find(x=>x.capability==='communication.bulk-campaign.admit.v2');
console.log(JSON.stringify({found:!!r,policyDecision:r&&r.policyDecision,approvalRequirement:r&&r.approvalRequirement,
  actionClass:r&&r.actionClass,targetKind:r&&r.targetKind,sources:r&&r.allowedSourceTypes}));
