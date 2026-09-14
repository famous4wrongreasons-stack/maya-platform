/* Local synthetic reproduction only: real compiled controller/service/repository;
 * in-memory DB and CRM boundary, zero network and zero real DB mutations. */
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(process.argv[2]);
const {AppointmentsController}=require(path.join(root,'dist/src/appointments/appointments.controller'));
const {AppointmentsService}=require(path.join(root,'dist/src/appointments/appointments.service'));
const {TenantAppointmentRepository}=require(path.join(root,'dist/src/appointments/tenant-appointment.repository'));
async function probe(existingMirror=false){
  const tenantId='synthetic-tenant',userId='synthetic-user-without-client-link';
  const startAt=new Date('2030-01-01T11:00:00Z'),endAt=new Date('2030-01-01T12:00:00Z');
  const base={id:'synthetic-appointment',tenantId,clientId:null,mayaClientId:existingMirror?'different-canonical-client':null,branchId:null,branch:null,crmExternalId:'synthetic-record',crmProvider:'yclients',source:'external',staffExternalId:'synthetic-staff',serviceIds:['synthetic-service'],startAt,endAt,blockedStartAt:startAt,blockedEndAt:endAt,status:'confirmed',notes:null,totalPriceKopecks:230000,currency:'RUB',providerPayload:{provider:'yclients',imported:true,attendance:0},createdAt:startAt,updatedAt:startAt};
  let row=existingMirror?{...base}:null,creates=0,updates=0,authorityReads=0,crmPhoneLookups=0;
  const forbidden=new Proxy({},{get(){authorityReads++;throw new Error('unexpected canonical identity lookup');}});
  const matches=where=>row && Object.entries(where).every(([k,v])=>row[k]===v);
  const prisma={client:forbidden,clientChannelLink:forbidden,clientConsentFact:forbidden,customerProfile:forbidden,appointment:{
    findFirst:async({where})=>matches(where)?{...row}:null,
    findMany:async({where})=>matches(where)?[{...row}]:[],
    create:async({data})=>{creates++;row={...base,...data};return {...row};},
    update:async({where,data})=>{updates++;assert.ok(row);if(where.id_tenantId_clientId)assert.ok(matches(where.id_tenantId_clientId));row={...row,...data,updatedAt:new Date()};return {...row};},
  }};
  const context={assertTenantId:id=>{assert.equal(id,tenantId);return id;},requireTenantId:()=>tenantId};
  const crm={getCalendarSource:async()=> 'external',getExternalProviderKey:async()=> 'yclients',
    getClientAppointments:async(t,phone)=>{assert.equal(t,tenantId);assert.equal(phone,'+79995550101');crmPhoneLookups++;return[{external_id:'synthetic-record',staff_id:'synthetic-staff',service_ids:['synthetic-service'],start:startAt.toISOString(),end:endAt.toISOString(),status:'confirmed',total_price:2300,currency:'RUB',raw:{provider:'yclients',imported:true,attendance:0}}];},
    resolveStaffIdForBooking:async()=>null,
    getServices:async()=>[{id:'synthetic-service',name:'Synthetic private service',price:2300,duration_minutes:60,currency:'RUB'}],
    getStaff:async()=>[{id:'synthetic-staff',name:'Synthetic staff'}],
  };
  const users={getTenantUserOrThrow:async(u,t)=>{assert.equal(u,userId);assert.equal(t,tenantId);return{id:userId,phone:'+79995550101'};},serializeUser:u=>u};
  const repo=new TenantAppointmentRepository(prisma,context);
  const controller=new AppointmentsController(new AppointmentsService(prisma,context,repo,crm,{}, {},users,{},{}));
  const before=JSON.stringify(row);
  const first=await controller.listMyAppointments({tenantId,userId,role:'client'});
  const second=await controller.listMyAppointments({tenantId,userId,role:'client'});
  assert.equal(first.length,1);assert.equal(second.length,1);assert.equal(authorityReads,0);assert.equal(crmPhoneLookups,2);
  assert.equal(first[0].client_id,userId);assert.equal(first[0].services[0].name,'Synthetic private service');assert.equal(first[0].total_price,2300);
  assert.notEqual(JSON.stringify(row),before);assert.equal(creates,existingMirror?0:1);assert.equal(updates,existingMirror?2:1);
  if(existingMirror)assert.equal(row.mayaClientId,'different-canonical-client');
  return{fixture:existingMirror?'canonical mirror has another Client and no User association':'missing local mirror',verifiedClientLinks:0,canonicalAuthorityReads:authorityReads,phoneLookups:crmPhoneLookups,appointmentCreatesFromTwoReads:creates,appointmentUpdatesFromTwoReads:updates,privateAppointmentProjectionReturned:true,userAssociationSetByRead:row.clientId===userId,canonicalClientNotChecked:true,realDbMutations:0,realProviderCalls:0};
}
(async()=>console.log(JSON.stringify({reproduced:true,scope:'GET /api/appointments/my; authenticated same-tenant account and booking access assumed, no authentication bypass claimed',execution:'real compiled AppointmentsController / AppointmentsService / TenantAppointmentRepository; synthetic CRM and in-memory DB',cases:[await probe(false),await probe(true)],productionPiiEndpointsCalled:0,realProductionMutations:0},null,2)))().catch(e=>{console.error(e.message);process.exitCode=1;});
