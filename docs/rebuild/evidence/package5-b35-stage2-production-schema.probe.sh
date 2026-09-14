set -euo pipefail
cd /opt/maya-saas/current
export PATH=/opt/node-v24/bin:$PATH
set -a
. <(sudo -n cat /etc/maya-saas/live-widgets.env)
set +a
node <<'JS'
const {Client}=require('pg');
const fs=require('node:fs'), crypto=require('node:crypto');
const tables=['MarketingCampaign','MarketingAudience','MarketingAudienceRecipient','MarketingCampaignRecipient','MarketingDeliveryAttempt','MarketingConsentEvidence','MarketingPolicy','ActionExecution','ActionExecutionIdempotencyBinding','ActionAttempt','InboxItem','Client','Membership','ClientChannelLink','ClientWebPushEndpoint','DevicePushToken','CustomerProfile','ClientConsentFact'];
const db=new Client({connectionString:process.env.DATABASE_URL});
(async()=>{
 await db.connect();
 await db.query('BEGIN READ ONLY');
 await db.query("SET LOCAL statement_timeout = '20s'");
 await db.query("SET LOCAL lock_timeout = '2s'");
 const query=(sql)=>db.query(sql,[tables]).then(r=>r.rows);
 const columns=await query(`SELECT c.table_name,c.column_name,c.data_type,c.udt_name,c.is_nullable,c.column_default FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=ANY($1::text[]) ORDER BY c.table_name,c.ordinal_position`);
 const constraints=await query(`SELECT r.relname AS table_name,c.conname,c.contype,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname=ANY($1::text[]) ORDER BY r.relname,c.conname`);
 const indexes=await query(`SELECT tablename AS table_name,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1::text[]) ORDER BY tablename,indexname`);
 const triggers=await query(`SELECT r.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition,p.proname,pg_get_functiondef(p.oid) AS function_definition FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal AND r.relname=ANY($1::text[]) ORDER BY r.relname,t.tgname`);
 const readOnly=(await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
 await db.query('ROLLBACK');
 console.log(JSON.stringify({inspection:'PostgreSQL metadata only; explicit READ ONLY transaction; no business rows or DDL',capturedAt:new Date().toISOString(),readOnly,release:fs.realpathSync('/opt/maya-saas/current'),schemaSha256:crypto.createHash('sha256').update(fs.readFileSync('prisma/schema.prisma')).digest('hex'),tables,columns,constraints,indexes,triggers,productionMessages:0,productionBusinessRowsRead:0,mutations:0},null,2));
})().catch(e=>{console.error(JSON.stringify({error:'schema_metadata_read_failed',code:e.code||'unknown'}));process.exitCode=1}).finally(()=>db.end());
JS
