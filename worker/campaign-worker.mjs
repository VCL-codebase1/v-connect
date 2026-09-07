import pg from 'pg';
import { readFileSync } from 'node:fs';
import { providerMessageId, renderMessage, retryableStatus } from './campaign-helpers.mjs';

const required=['DATABASE_URL','EVOLUTION_API_URL','EVOLUTION_API_KEY'];
for(const name of required) if(!process.env[name]) throw new Error(`Missing ${name}`);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('./prod-ca-2021.crt',import.meta.url),'utf8')},max:3,application_name:'v-connect-campaign-worker'});
const workerId=(process.env.WORKER_ID??`worker-${process.pid}`).slice(0,80);
const interval=Math.max(1000,Number(process.env.SEND_INTERVAL_MS??3000));
const pollInterval=Math.max(1000,Number(process.env.POLL_INTERVAL_MS??2500));
let stopping=false;

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function prepareQueue() {
  await pool.query("update public.vc_campaigns set status='queued' where status='scheduled' and scheduled_for<=now()");
  await pool.query("update public.vc_campaign_recipients set status='failed',error_code='worker_interrupted',locked_at=null,worker_id=null where status='processing' and locked_at<now()-interval '15 minutes'");
  await pool.query(`update public.vc_campaigns c set
    queued_count=(select count(*) from public.vc_campaign_recipients r where r.campaign_id=c.id and r.status in('queued','processing')),
    failed_count=(select count(*) from public.vc_campaign_recipients r where r.campaign_id=c.id and r.status='failed')
    where c.status in('queued','sending','paused')`);
}

async function claim() {
  const client=await pool.connect();
  try {
    await client.query('begin');
    const result=await client.query(`select r.id,r.campaign_id,r.phone,r.name,r.variables,r.attempts,c.message_template,c.number_id,n.instance_name
      from public.vc_campaign_recipients r
      join public.vc_campaigns c on c.id=r.campaign_id
      join public.vc_numbers n on n.id=c.number_id
      where r.status='queued' and c.status in('queued','sending') and (c.scheduled_for is null or c.scheduled_for<=now())
      order by c.created_at,r.created_at
      for update of r skip locked limit 1`);
    const item=result.rows[0];
    if(!item){await client.query('commit');return null;}
    await client.query("update public.vc_campaign_recipients set status='processing',attempts=attempts+1,locked_at=now(),worker_id=$2 where id=$1",[item.id,workerId]);
    await client.query("update public.vc_campaigns set status='sending',started_at=coalesce(started_at,now()),queued_count=greatest(queued_count-1,0) where id=$1",[item.campaign_id]);
    await client.query('commit');
    return item;
  } catch(error){await client.query('rollback');throw error;} finally{client.release();}
}

async function send(item) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(`${process.env.EVOLUTION_API_URL.replace(/\/$/,'')}/message/sendText/${encodeURIComponent(item.instance_name)}`,{method:'POST',headers:{apikey:process.env.EVOLUTION_API_KEY,Origin:process.env.EVOLUTION_API_ORIGIN??'https://v-connect-blond.vercel.app','Content-Type':'application/json'},body:JSON.stringify({number:item.phone,text:renderMessage(item.message_template,item)}),redirect:'error',signal:controller.signal});
    if(!response.ok) return {ok:false,retry:retryableStatus(response.status),code:`evolution_${response.status}`};
    const payload=await response.json().catch(()=>({}));
    return {ok:true,id:providerMessageId(payload)};
  } catch(error) {
    // A timeout can be ambiguous: do not retry it automatically and risk a duplicate.
    return {ok:false,retry:false,code:error?.name==='AbortError'?'timeout_unknown':'network_error'};
  } finally{clearTimeout(timer);}
}

async function finish(item,result) {
  const client=await pool.connect();
  try {
    await client.query('begin');
    const mayRetry=!result.ok&&result.retry&&item.attempts+1<3;
    await client.query(`update public.vc_campaign_recipients set status=$2,provider_message_id=$3,error_code=$4,sent_at=case when $2='sent' then now() else null end,locked_at=null,worker_id=null where id=$1 and worker_id=$5`,[item.id,result.ok?'sent':mayRetry?'queued':'failed',result.ok?result.id:null,result.ok?null:result.code,workerId]);
    const counts=await client.query(`select count(*) filter(where status in('queued','processing'))::int pending,count(*) filter(where status='sent')::int sent,count(*) filter(where status='failed')::int failed,count(*) filter(where status='suppressed')::int suppressed from public.vc_campaign_recipients where campaign_id=$1`,[item.campaign_id]);
    const count=counts.rows[0];
    await client.query(`update public.vc_campaigns set queued_count=$2,sent_count=$3,failed_count=$4,suppressed_count=$5,status=case when $2=0 and status not in('paused','cancelled') then case when $3=0 and $4>0 then 'failed' else 'completed' end else status end,completed_at=case when $2=0 and status not in('paused','cancelled') then now() else completed_at end where id=$1`,[item.campaign_id,count.pending,count.sent,count.failed,count.suppressed]);
    await client.query('commit');
  } catch(error){await client.query('rollback');throw error;} finally{client.release();}
}

async function main(){
  await prepareQueue();
  console.log(`Campaign worker ${workerId} started`);
  while(!stopping){
    try{const item=await claim();if(!item){await prepareQueue();await sleep(pollInterval);continue;}const result=await send(item);await finish(item,result);await sleep(interval);}catch(error){console.error('Campaign worker cycle failed',error instanceof Error?error.message:'unknown error');await sleep(pollInterval);}
  }
}

for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{stopping=true;});
await main();
await pool.end();
