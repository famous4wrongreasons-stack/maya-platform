from run import *
from concurrent.futures import ThreadPoolExecutor
# Original worker mix: five full live controls and three full backend unit controls.
# This external observer stops each stock runner after its first unmutated Jest step.
gates=['AR','NS','BS','1-5','TURN','SB1','SBV','SV2']
def one(i):
 return run('corpus-'+str(i+1),'native',root/('work/final-certification-fed5f7df/mutation-isolated-worker-'+str(i+1)+'/maya-saas-backend'),gate=gates[i])
with ThreadPoolExecutor(max_workers=8) as p:
 results=list(p.map(one,range(8)))
(out/'corpus-summary.json').write_text(json.dumps(results,indent=2)+'\n')
