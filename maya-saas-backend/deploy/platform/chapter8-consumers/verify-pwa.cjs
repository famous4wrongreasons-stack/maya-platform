'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {verifyPwa:verifyC7}=require('../chapter7-consumers/verify-pwa.cjs');
function verifyPwa(source){
  const result=verifyC7(source);
  for(const marker of ['function AMayaValuationPanel','React.createElement(AMayaValuationPanel','c8.readiness/1','c8.valuation.read/1','c8.valuation.list/1','Нет подтверждённых данных','Прогноз и потенциал роста недоступны','data-c8-retired'])assert(source.includes(marker),marker);
  for(const forbidden of ['money(goal.forecast_rub ||','money(goal.potential_rub ||','Number(plan.potential_total_revenue_rub)'])assert(!source.includes(forbidden),forbidden);
  assert.equal((source.match(/function AMayaValuationPanel/g)||[]).length,1);
  return {...result,c8:'PASS',numericPredictions:false,legacyGrowthScorers:0};
}
module.exports={verifyPwa};
if(require.main===module)console.log(JSON.stringify(verifyPwa(fs.readFileSync(process.argv[2],'utf8'))));
