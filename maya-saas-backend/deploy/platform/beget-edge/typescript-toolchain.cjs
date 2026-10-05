/** The R01 source scanner is shared by backend releases and the React-only carrier build. */
const fs = require('node:fs');
const path = require('node:path');

const backend = path.resolve(__dirname, '../../../node_modules/typescript');
const carrier = path.resolve(__dirname, '../../../../maya-carrier-react/node_modules/typescript');
const selected = fs.existsSync(path.join(backend, 'package.json')) ? backend : carrier;
if (!fs.existsSync(path.join(selected, 'package.json')))
  throw Error('TypeScript is required for R01 inspection (install backend or React carrier dependencies)');
const ts = require(selected);
if (ts.version !== '5.9.3') throw Error('R01 inspection requires TypeScript 5.9.3');
module.exports = ts;
