from pathlib import Path
import json
m=[]
def add(i,file,find,replace,killer,expect='live-killed'):
 assert Path(file).read_text().count(find)==1,(i,find)
 m.append(dict(id=i,file=file,find=find,replace=replace,killers=[killer],expect=expect))
add('NS-M01','src/widgets/projection/rows/initial-projector.rows.ts',"intent_template_key: 'navigate.journal.detail@1'","intent_template_key: 'navigate.schedule@1'",'NS-SOURCE')
add('NS-M02','src/widgets/routing/effect-router.service.ts',"!range.from.startsWith(date + 'T')",'false','NS-REFUSE date')
add('NS-M03','src/widgets/resolve/thread-page.service.ts','widgetId: input.widgetId,\n          erasedAt: null,','widgetId: input.widgetId,','NS-PARENT')
add('NS-M04','src/widgets/resolve/thread-page.service.ts','stableActionJson(envelope.body) !== stableActionJson(row.bodyJson)','false','NS-REFUSE body')
add('NS-M05','src/widgets/emission/intent-template.registry.ts',"ref: args.journalParentWidgetId!","ref: '00000000-0000-4000-8000-000000000001'",'NS-SOURCE')
Path('test/widgets-live/mutations/gateNS.json').write_text(json.dumps(m,indent=2)+'\n')
m=[]
add('BS-M01','src/widgets/owner-ports/personal-schedule.adapter.ts',"const personal = await this.contexts.select(actor, 'personal_client');","const personal = { revalidate: () => Promise.resolve() };",'BS-REVOKED','build-killed')
add('BS-M02','src/widgets/owner-ports/personal-schedule.adapter.ts','ids.has(v.id)','true','BS-IDENTITY','build-killed')
add('BS-M03','src/widgets/owner-ports/personal-schedule.adapter.ts','v.id === row.id','true','BS-CHANGED','build-killed')
add('BS-M04','src/widgets/booking/personal-schedule.presenter.ts','ownerRef: source.appointmentId,',"ownerRef: 'foreign-appointment',",'BS-SOURCE')
add('BS-M05','src/widgets/owner-ports/personal-schedule.adapter.ts',"s.staff_id === row.staff_external_id &&","true &&",'BS-AVAILABILITY','build-killed')
Path('test/widgets-live/mutations/gateBS.json').write_text(json.dumps(m,indent=2)+'\n')
p=Path('scripts/widgets-mutation-ci.test.mjs');s=p.read_text().replace('42 batteries, 63 jobs: profile isolation and canonical turn scope covers 492 declarations','44 batteries, 65 jobs: profile, turn and approved source scope covers 502 declarations').replace('p.gates.length, 42','p.gates.length, 44').replace('p.matrix.include.length, 63','p.matrix.include.length, 65').replace('r.length, 42','r.length, 44').replace('0), 492','0), 502').replace('head).length, 42','head).length, 44');p.write_text(s)
