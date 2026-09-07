"""Read-only schema proposal inventory validation; no database/DDL/runtime import."""
import json
import re
from pathlib import Path

base = Path(__file__).resolve().parent
report = (base.parent / 'package5-b35-exact-schema-mapping-v1-proposal.md').read_text()
inventory = json.loads((base / 'package5-b35-stage2-schema-inventory.json').read_text())
catalog = json.loads((base / 'package5-b35-stage2-production-schema.json').read_text())
assert catalog['readOnly'] == 'on' and catalog['mutations'] == 0
assert len(catalog['models']) == 18
requirements = [int(v) for v in re.findall(r'^\| (\d+) \|', report, re.M)]
assert requirements == list(range(1, 26))
fields = inventory['newPersistedFields']
assert len(fields) == 12 and len({(f['model'], f['column']) for f in fields}) == 12
for field in fields:
    assert field['model'] in catalog['models']
    assert field['column'] not in catalog['models'][field['model']]['columns']
    assert f"| {field['model']} | `{field['column']}` |" in report
for field in inventory['alteredExistingFields']:
    old = catalog['models'][field['model']]['columns'][field['column']]
    assert old['type'] == 'text' and not old['nullable']
assert len(inventory['alteredExistingFields']) == 2
for field in ('channel', 'provider'):
    assert {f['column'] for f in inventory['alteredExistingFields']} >= {field}
for group, count in [('newUniqueConstraints', 3), ('newNonUniqueIndexes', 2), ('newForeignKeys', 3)]:
    assert len(inventory[group]) == count
    for item in inventory[group]:
        assert len(item['name'].encode()) <= 63 and item['name'] in report
        existing = set(catalog['models'][item['model']]['columns'])
        proposed = {f['column'] for f in fields if f['model'] == item['model']}
        assert set(item['columns']) <= existing | proposed
        if group == 'newForeignKeys':
            target = catalog['models'][item['target']]
            assert set(item['targetColumns']) <= set(target['columns'])
            assert any('UNIQUE INDEX' in sql and '(id, "tenantId")' in sql for sql in target['indexes'].values())
assert inventory['newPhysicalIndexesIncludingUniqueBacking'] == 5
assert inventory['newModels'] == inventory['newActionClasses'] == inventory['newEnumTypes'] == inventory['newEnumValues'] == 0
assert inventory['migrationRequired'] and not inventory['backfillRequired']
print(json.dumps({
    'result': 'PASS — metadata and proposal inventory only',
    'requirementsMapped': 25, 'newModels': 0, 'newColumns': 12,
    'alteredExistingColumns': 2, 'newUniqueConstraints': 3,
    'newNonUniqueIndexes': 2, 'newForeignKeys': 3, 'newActionClasses': 0,
    'postgresBehaviorProofExecuted': False, 'ddlExecuted': False,
    'databaseConnections': 0, 'productionMessages': 0,
}, indent=2))
