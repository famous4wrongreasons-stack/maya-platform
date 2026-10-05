from pathlib import Path
import collections, datetime, hashlib, json, re, subprocess

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
work = root / 'work/ar1-single-operator-final-20261005'
out = root / 'outputs/ar1-single-operator-final-20261005'
r = out / 'receipts'
candidate = (work / 'HEAD').read_text().strip()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
complete = read(out / 'COMPLETE-MUTATIONS.json')
assert complete['candidate'] == candidate and complete['status'] == 'PASS'
assert complete['applicableKills'] == 542 and complete['parts'] == 68

def save(name, data):
    (out / name).write_text(json.dumps({'candidate': candidate, **data}, ensure_ascii=False, indent=2) + '\n')

def ref(p):
    return {'path': str(p.relative_to(out)), 'sha256': sha(p)}

def receipt(name):
    p = r / (name + '.receipt.json')
    v = read(p)
    assert v['candidate'] == candidate and v['exit'] == 0, name
    return {'receipt': ref(p), 'log': ref(r / (name + '.log'))}

reports = {}
for p in (r / 'mutation-receipt').glob('widgets-mutation-report-*.json'):
    d = read(p)
    assert d['source_head'] == candidate and d['status'] == 'AS-DECLARED'
    assert d['baseline_red'] == [] and d['mismatches'] == 0
    reports[d['batteries'][0][4:-5]] = (p, d)
assert len(reports) == 47

def battery(gate, count=None):
    p, d = reports[gate]
    if count is not None: assert len(d['mutants']) == count, gate
    assert all(m['status'] in ['build-killed', 'live-killed'] for m in d['mutants']), gate
    return {'gate': gate, 'declarations': len(d['mutants']), 'receipt': ref(p),
            'mutants': d['mutants'], 'controls': d['baseline_controls']}

live, unit = read(r / 'widgets-live-full.json'), read(r / 'backend-full.json')
for d, n, suites in [(live, 443, 42), (unit, 5712, 592)]:
    assert d['success'] and d['numPassedTests'] == n and d['numFailedTests'] == 0
    assert d['numPassedTestSuites'] == suites and d['numFailedTestSuites'] == 0

def test_file(name):
    found = [t for t in live['testResults'] if Path(t['name']).name == name]
    assert len(found) == 1, name
    assertions = found[0]['assertionResults']
    assert assertions and all(a['status'] == 'passed' for a in assertions)
    return {'source': name, 'count': len(assertions), 'receipt': ref(r / 'widgets-live-full.json'),
            'assertions': assertions}

save('CURRENT-LIVE-PROOF-INDEX.json', {'status': 'PASS', 'wholeCorpusAdmission': 'PASS',
    'receipt': ref(r / 'widgets-live-full.json'),
    'tests': [{'source': Path(t['name']).name, 'assertions': t['assertionResults']} for t in live['testResults']]})
save('AR1-NATIVE-PROOF.json', {'status': 'PASS', 'battery': battery('AR', 19),
    'live': test_file('widget-release.live-spec.ts'), 'revocation': test_file('release-revocation.live-spec.ts'),
    'productionGrant': False, 'certificateIssued': False})
production_units = [a for t in unit['testResults'] if Path(t['name']).name == 'widget-release-production.spec.ts' for a in t['assertionResults']]
assert len(production_units) == 42 and all(a['status']=='passed' for a in production_units)
production_binary = read(r / 'release-binary.json')
assert production_binary['success'] and production_binary['numFailedTests']==0
production_assertions = [a for t in production_binary['testResults'] if Path(t['name']).name=='widget-production.binary-spec.ts' for a in t['assertionResults']]
assert len(production_assertions)==1 and all(a['status']=='passed' for a in production_assertions)
save('PRODUCTION-EXECUTION-PROOF.json', {'status':'PASS','contract':'maya.widget-release-production-authorization/1',
    'candidateSource':candidate,'profile':'closed-input.no-handoff@1','battery':battery('PU',12),
    'unit':{'receipt':ref(r/'backend-full.json'),'assertions':production_units},
    'live':test_file('widget-production.live-spec.ts'),
    'binary':{'receipt':receipt('release-binary'),'json':ref(r/'release-binary.json'),'assertions':production_assertions},
    'boundary':'Actual production mode and configuration validation on guarded loopback PostgreSQL, ephemeral test signers and synthetic subjects; no actual production authorization issued.',
    'productionAuthorizationIssued':False,'productionEffects':0,'planTrialBypass':'REFUSED',
    'handoff':'STOP; production mint/admission refusal proven; complete profile suite remains mandatory'})
so_units=[a for t in unit['testResults'] if Path(t['name']).name=='widget-release-single-operator.spec.ts' for a in t['assertionResults']]
so_binary=[a for t in production_binary['testResults'] if Path(t['name']).name=='widget-single-operator.binary-spec.ts' for a in t['assertionResults']]
assert len(so_units)==30 and len(so_binary)==1 and all(a['status']=='passed' for a in so_units+so_binary)
save('SINGLE-OPERATOR-NATIVE-PROOF.json',{'status':'PASS','contract':'maya.widget-release-production-authorization/2','governance':'single-operator','independentHumanReview':False,'reviewerId':None,'signatures':1,'multiTenantAuthorityPreserved':True,'battery':battery('SO',9),'unit':{'receipt':ref(r/'backend-full.json'),'assertions':so_units},'live':test_file('widget-single-operator.live-spec.ts'),'binary':{'receipt':ref(r/'release-binary.json'),'assertions':so_binary},'productionPrivateKeysGenerated':0,'productionAuthorizationIssued':False})
required_counterfactuals={
 'tenant_owner refused':['SO-ROLE'],
 'tenant session cannot replace global session':['SO-TENANT-SESSION'],
 'Tenant A authorization cannot act on Tenant B':['SO-TWO-TENANTS','SO-MULTITENANT'],
 'fabricated reviewer refused':['SO-CONTRACT','SO-BINDING'],
 'second self-signature never independent review':['SO-NO-SELF-SIGNATURE'],
 'independentHumanReview false mandatory':['SO-DISCLOSURE','SO-CONTRACT'],
 'V1 revoke V2 and V2 revoke V1 both refused':['SO-REVOKE-VERSION'],
 'stale CAS refused':['SO-STALE'],
 'expired authorization refused; revoked grant replay cannot re-enable':['SO-WINDOW','SO-LIFECYCLE'],
 'plan/trial bypass refused':['AR1-PLAN','AR1-TRIAL'],
 'HANDOFF STOP':['SO-HANDOFF'],
 'allowlist removal closes effective access':['SO-READER','SO-REVOKE-BOUND'],
 'revoke after allowlist removal and candidate replacement':['SO-REVOKE-BOUND'],
 'revoke after certificate expiry':['SO-REVOKE-EXPIRED-CERT'],
}
all_assertions=[{'source':Path(t['name']).name,**a} for data in [unit,live] for t in data['testResults'] for a in t['assertionResults']]
requirements=[]
for requirement,prefixes in required_counterfactuals.items():
 found=[]
 for prefix in prefixes:
  matches=[a for a in all_assertions if a['title'].startswith(prefix+' ')];assert matches and all(a['status']=='passed' for a in matches),(requirement,prefix)
  found.extend(matches)
 requirements.append({'requirement':requirement,'status':'PASS','assertions':found})
save('REQUIRED-COUNTERFACTUALS.json',{'status':'PASS','requirements':requirements,'unitReceipt':ref(r/'backend-full.json'),'liveReceipt':ref(r/'widgets-live-full.json'),'mutationReceipt':ref(out/'COMPLETE-MUTATIONS.json'),'revokedReplayMeaning':'Canonical idempotency may return the original historical receipt; it never re-applies or renews the revoked grant.'})
save('PROFILE-NATIVE-PROOF.json', {'status': 'PASS', 'profile': 'closed-input.no-handoff@1',
    'batteries': [battery('PI', 6), battery('PI-contract', 16)],
    'live': test_file('profile-isolation.live-spec.ts'), 'globalStops': ['G6-6', 'G13-R8'],
    'fullContractCertified': False})
save('SUCCESSOR-CURRENT-PROOF.json', {'status': 'PASS',
    'batteries': [battery(g) for g in ['SV2', 'SB1', 'SBV']],
    'live': test_file('sb1-successor.live-spec.ts'), 'realOtp': False,
    'boundary': 'Test transport only. No owner account or production binding episode changed.'})
save('9.6-CURRENT-PROOF.json', {'status': 'PASS', 'batteries': [battery('9', 35), battery('TURN', 14)],
    'live': [test_file('user-turn-identity.live-spec.ts'), test_file('user-turn-canonical.live-spec.ts')],
    'networkReceipt': receipt('fbe2e-canonical-net-turn'),
    'observations': ref(r / 'canonical-net-turn-observations.json'), 'mirrorWriter': False})
save('BS1-NS1-CURRENT-PROOF.json', {'status': 'PASS', 'batteries': [battery('BS'), battery('NS')],
    'live': [test_file(n) for n in ['personal-source.live-spec.ts', 'navigation-source.live-spec.ts', 'navigation-source-boundary.live-spec.ts']],
    'roundtrip': receipt('ns1-16-step'), 'compiledNetwork': receipt('fbe2e-compiled-net-bin'),
    'migrationScope': 'Existing NS-1 additive CHECK migration applied only in dedicated fresh proof databases; production not applied.'})
save('HTTP-HARNESS-NATIVE-PROOF.json', {'status': 'PASS', 'battery': battery('H-harness', 26),
    'independentRepeatedBaselines': read(out / 'REQUESTED-BASELINES-REPEATED.json'),
    'baselineRed': [], 'mismatches': 0})

extra = read(r / 'l27-runtime-mutations.json')
assert extra['candidate'] == candidate and extra['status'] == 'PASS'
assert len(extra['mutations']) == 8 and all(m['status'] == 'KILLED' and m['namedKillers'] for m in extra['mutations'])
save('L27-CURRENT-PROOF.json', {'status': 'PASS', 'runtimeCounterfactuals': ref(r / 'l27-runtime-mutations.json'),
    'canonicalReceipt': receipt('l27-17-step'), 'networkReceipt': receipt('fbe2e-l27-postcommit-dismiss'),
    'observations': ref(r / 'l27-postcommit-dismiss-observations.json')})

fb = battery('FB', 15)
save('FINAL-OWNER-DECISIONS-PROOF.json', {'status': 'PASS',
    'decisionSource': 'User FINAL FBE2E OWNER DECISIONS in this conversation',
    'decisionLedger': {'path': 'docs/rebuild/widget-release-programme/FINAL-FBE2E-DECISIONS.md',
        'sha256': sha(repo / 'docs/rebuild/widget-release-programme/FINAL-FBE2E-DECISIONS.md')},
    'counterfactuals': fb,
    'L2': {'status': 'PASS', 'proof': receipt('mutation-ci-integrity'), 'strictFinalAdmission': receipt('mutation-assemble'),
        'boundary': 'Blocking workflow commands and strict admission are proven locally; remote GitHub branch-protection configuration is not claimed.'},
    'L5/L24': {'status': 'PASS', 'proof': test_file('availability-calendar.live-spec.ts'),
        'boundary': 'One next local calendar day only; no widening/free-text/new input kinds.'},
    'L20': {'status': 'PASS', 'proof': test_file('provider-unknown.live-spec.ts'),
        'boundary': 'Test provider persisted one row then destroyed socket. Real AE derives UNKNOWN; ordinary and six concurrent retries dispatch no duplicate. Reconciliation read fault remains safely pending; successful production reconciliation is not claimed.'},
    'L23': {'status': 'ACCEPTED', 'exactCandidateOnly': candidate, 'ratchets': [receipt(n) for n in ['runtime-full', 'runtime-self-test', 'runtime-hash-check']],
        'boundary': 'Structural network test does not inspect every extra widget-path literal in all four network modules. Existing exact endpoint allowlist, single fetch site, build counterfactuals and network tests remain required.'},
    'L25': {'status': 'PASS', 'proof': test_file('selector-lifecycle.live-spec.ts'), 'browser': receipt('l25-browser'),
        'boundary': 'DELIVERED means server HTTP handoff; LIVE means authenticated post-mount carrier observation, not human attention. Observation grants no action/booking authority.'},
    'L26': {'status': 'ACCEPTED + ADMISSION REFUSAL PASS', 'proof': receipt('mutation-ci-integrity'), 'strictFinalAdmission': receipt('mutation-assemble'),
        'boundary': 'Historical/manual audit builder and all its reports are archival-only. Fresh complete raw native receipts alone enter release admission.'},
    'productionEffects': 0, 'realOtpEffects': 0, 'realYclientsEffects': 0})

def node_counts(name, passes, skips=0):
    receipt(name)
    s = (r / (name + '.log')).read_text()
    for key, value in [('pass', passes), ('fail', 0), ('skipped', skips)]:
        assert re.search(r'^(?:#|ℹ) ' + key + r'\s+' + str(value) + r'\s*$', s, re.M), (name, key)
    return {'pass': passes, 'skip': skips, 'fail': 0}

runtime = node_counts('runtime-full', 424, 7)
node_counts('node24-runtime-full', 424, 7)
carrier = node_counts('carrier-full', 93)
receipt('legacy-python-full')
python_log = (r / 'legacy-python-full.log').read_text()
assert re.search(r'Ran 613 tests', python_log) and re.search(r'^OK\s*$', python_log, re.M)
save('COMPONENT-RECEIPTS.json', {'backend': {'pass': 5712, 'fail': 0, 'suites': 592},
    'widgetsLive': {'pass': 443, 'fail': 0, 'suites': 42}, 'runtime': {**runtime, 'nodes': [22, 24]},
    'carrier': carrier, 'python': {'pass': 613, 'fail': 0}, 'extraRuntimeL27': '8/8 KILLED',
    'nativeMutationCorpus': '542/542 applicable kills; 47 batteries; 68 parts; 545 declarations',
    'nonKillDeclarations': complete['existingNonKillDeclarations'], 'historicalReceiptsAdmitted': 0})
# Re-evaluate the exact historical L12 delta with this compiler and candidate.
# Historical source commits identify the disputed delta; no old test receipts enter admission.
ports = 'maya-saas-backend/src/widgets/routing/effect-router.ports.ts'
delta = '6af72aa46e7eff80fa2a4f825ccb2c0c27a0d234'
node = '/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin/node'
compile_script = "const ts=require('typescript'),fs=require('fs'); process.stdout.write(ts.transpileModule(fs.readFileSync(0,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,removeComments:true,sourceMap:false}}).outputText)"
compiled = []
for revision in [delta + '^', delta, candidate]:
    source = subprocess.check_output(['git', 'show', revision + ':' + ports], cwd=repo)
    emitted = subprocess.check_output([node, '-e', compile_script], input=source, cwd=repo / 'maya-saas-backend')
    compiled.append({'ref': revision, 'sourceSha256': hashlib.sha256(source).hexdigest(),
        'emittedSha256': hashlib.sha256(emitted).hexdigest(), 'emittedBytes': len(emitted)})
assert len({x['emittedSha256'] for x in compiled}) == 1
sites = {'src/widgets/booking/booking-selector.presenter.ts': ['WR-M03', 'WR-M04', 'WR-M05'],
    'src/widgets/booking/booking-noun-identity.ts': ['WR-M20'],
    'src/widgets/owner-ports/booking-selector.adapter.ts': ['WR-M01', 'WR-M02'],
    'src/widgets/owner-ports/booking-preview.adapter.ts': ['WR-M21']}
wr = battery('WR', 23)
assert all(m in {x['id'] for x in wr['mutants']} for ids in sites.values() for m in ids)
save('L12-DELTA-PROOF.json', {'historicalDelta': delta, 'compiledFresh': compiled,
    'emittedRuntimeIdenticalAcrossAllThree': True, 'entireFileIsTypeOnly': False,
    'runtimeSites': [{'file': p, 'sourceSha256': sha(repo / 'maya-saas-backend' / p), 'mutationIds': ids} for p, ids in sites.items()],
    'nativeWRReceipt': wr['receipt'], 'newDecisionMutationReceipt': fb['receipt'],
    'scope': 'Exact historical uncovered-delta claim. Pre-existing runtime helper is not type-only. No exhaustive line mutation-coverage claim. New bounded decisions additionally covered by FB.'})

l14_unit = [a for t in unit['testResults'] for a in t['assertionResults'] if a['title'].startswith('WR-L22')]
l14_live = [a for t in live['testResults'] for a in t['assertionResults'] if a['title'].startswith('WR-H2')]
assert l14_unit and l14_live and all(a['status'] == 'passed' for a in l14_unit + l14_live)
save('receipts/l14-fresh-proofs.json', {'unit': l14_unit, 'live': l14_live,
    'unitReceipt': ref(r / 'backend-full.json'), 'liveReceipt': ref(r / 'widgets-live-full.json'),
    'nativeWR': wr['receipt'], 'l27': ref(r / 'l27-postcommit-dismiss-observations.json')})
store_path = 'maya-saas-backend/src/widgets/stores/intent-audit.store.ts'
assert not subprocess.check_output(['git', 'diff', '9085c2bbbe256c670a2836445a2c92265d139cb7', candidate, '--', store_path], cwd=repo)
save('L14-CURRENT-CLOSURE.json', {'status': 'PASS', 'canonicalStore': {'path': store_path, 'sha256': sha(repo / store_path)},
    'adjudicationProvenance': '9085c2bbbe256c670a2836445a2c92265d139cb7',
    'contract': 'Receipt upsert identity is tenant + intent token; empty update preserves its actionReceiptRef. Reconciliation only transitions ACCEPTED/null once under tenant CAS and AE COMMIT ownership.',
    'provenanceBoundary': '9085c2bb strengthened exclusive confirmed publication and AE COMMIT reconciliation. The empty idempotent upsert predates that commit.',
    'liveProof': 'Real HTTP/PG COMMIT then Dismiss preserves terminal line, reference, appointment and execution.',
    'defensiveProofBoundary': 'Injected second COMMIT and contradictory store retry are adversarial proofs, not claims that production can mint a second re-reference. Runtime double with changed reference proves identity behavior only.',
    'freshProof': ref(r / 'l14-fresh-proofs.json')})

pmint = [x for x in complete['nativeJobTimings'] if x['gate'] == 'P-mint']
assert len(pmint) == 4 and {x['partition'] for x in pmint} == {'1/4', '2/4', '3/4', '4/4'}
assert all(x['marginTo180Minutes'] > 0 for x in pmint)
assert 'timeout-minutes: 180' in (repo / '.github/workflows/widgets-mutation.yml').read_text()
save('L16-CURRENT-PLAN-PROOF.json', {'status': 'PASS', 'currentJobBudgetMinutes': 180,
    'priorApprovedRepair': 'e180086f', 'nativeReceipt': ref(reports['P-mint'][0]), 'observedHostedTimings': pmint,
    'scope': 'Four complete unfiltered parts pass on actual hosted runners below the unchanged 180-minute job budget. No future capacity guarantee is claimed.',
    'L25AnchorRebaseProvenance': 'MINT-M20 tap-driven catch-up superseded by approved L25 independent observation; same six-edge proof remains load-bearing.'})
print(json.dumps({'candidate': candidate, 'completeFreshProofIndexes': 'PASS'}))
