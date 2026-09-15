const {ActionCapabilityRegistry}=require('../../src/action-engine/action-engine.registry');
const {canonicalProductionPolicyDefinitions}=require('../../src/action-engine/action-engine.policy-registry');
const {MAYA_AI_TOOL_CATALOG}=require('../../src/ai-tools/ai-tool.catalog');
const {C9_CAPABILITIES}=require('../../src/orchestration/c9.registry');
console.log([new ActionCapabilityRegistry().list().length, canonicalProductionPolicyDefinitions().length,
             MAYA_AI_TOOL_CATALOG.length, C9_CAPABILITIES.length].join('/'));
