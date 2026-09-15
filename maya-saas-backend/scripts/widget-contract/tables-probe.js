const t=require('../../src/widget-contract/tables');
const n=o=>Object.keys(o).length;
console.log(JSON.stringify({
  EFFECT_FLOOR:n(t.EFFECT_FLOOR), KIND_FLOOR:n(t.KIND_FLOOR), RISK_FLOOR:n(t.RISK_FLOOR),
  CONSENT_CLASS_FLOOR:n(t.CONSENT_CLASS_FLOOR), TARGET_FLOOR:n(t.TARGET_FLOOR),
  CONTROL_REGISTRY:n(t.CONTROL_REGISTRY),
  restricted:t.RISK_FLOOR.restricted, controlEffect:t.EFFECT_FLOOR.CONTROL,
  runCancel:t.CONTROL_FLOOR['control.run.cancel'],
}));
