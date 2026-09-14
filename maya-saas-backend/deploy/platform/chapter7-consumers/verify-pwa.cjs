'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
function verifyPwa(source) {
  let scripts = 0;
  for (const [, attrs, body] of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(attrs) || /application\/(?:ld\+)?json/.test(attrs)) continue;
    new Function(body); // Parse only: never execute browser code or requests.
    scripts++;
  }
  assert.ok(scripts > 0);
  for (const required of ['c7.measurement.read/1', 'function meMeasurementValue(', 'function meMeasurementNotice(',
    "localBookingFetch('/analytics/business/finance?' + measurementWindow", "meMeasurementValue(M, 'net_profit')", 'Number.isSafeInteger',
    'наблюдаемые операции; не чистая прибыль', 'отсутствие данных не означает ноль']) assert.ok(source.includes(required), required);
  for (const retired of ["moneyList(A.net)", "statCard('Поступления YClients'", 'function firstKopecks', 'var firstKopecks',
    "return '0';\n    return arr.map", "meta.push('выручка: '"]) assert.ok(!source.includes(retired), retired);
  if (source.includes('function ABusinessReportCard(')) {
    const card = source.split('function ABusinessReportCard(')[1].split('var rows =')[0];
    assert.ok(card.includes("d.measurement.contract === 'c7.measurement.read/1'"));
    assert.ok(card.includes('meMeasurementValue(measured, field[1])'));
  }
  return { status: 'PASS', scriptsParsed: scripts, sha256: crypto.createHash('sha256').update(source).digest('hex') };
}
module.exports = { verifyPwa };
if (require.main === module) console.log(JSON.stringify(verifyPwa(fs.readFileSync(process.argv[2], 'utf8'))));
