import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {createProviders,AppError} from './providers.mjs';
const random=()=>randomBytes(32).toString('base64url');
const digest=x=>createHash('sha256').update(x).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const cookies=req=>Object.fromEntries((req.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2));
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sessionCookie='__Host-codex-session',flowCookie='__Host-codex-flow';
export function createApp(config,{fetcher=fetch,now=Date.now}={}){
 const sessions=new Map(),flows=new Map(),operations=new Map(),locks=new Map();
 const provider=createProviders(config,fetcher);
 const cookie=(name,value,seconds,sameSite='Lax')=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${Math.floor(seconds)}`;
 const clearFlow=()=>cookie(flowCookie,'',0);
 const sessionHeader=(id,ms=config.sessionMs)=>cookie(sessionCookie,id,ms/1000,config.crossSite?'None':'Lax');
 function cleanup(){for(const map of [sessions,flows,operations])for(const [k,v]of map)if(v.expires<=now())map.delete(k)}
 function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...extra}})}
 function redirect(url,extra={}){return new Response(null,{status:303,headers:{Location:url,...extra}})}
 function source(id){const s=config.sources.find(s=>s.id===id);if(!s)throw new AppError(404,'Source not found.');return s}
 async function session(req){const id=cookies(req)[sessionCookie],s=sessions.get(id);if(!s||s.expires<=now())throw new AppError(401,'Sign in to access your project.');
  try{s.user=await provider.user(s.token)}catch(e){if([401,403].includes(e.status))sessions.delete(id);throw e}return {id,...s};}
 function csrf(req,s){const origin=req.headers.get('origin');if(![config.origin,config.frontendOrigin].includes(origin)||!equal(req.headers.get('x-csrf-token'),s.csrfToken))throw new AppError(403,'Invalid request origin or CSRF token.');}
 async function payload(req){const text=await req.text();if(Buffer.byteLength(text)>180000)throw new AppError(413,'Request too large.');try{return JSON.parse(text)}catch{throw new AppError(400,'Invalid JSON request.')}}
 async function locked(id,fn){if(locks.has(id))throw new AppError(409,'A source update is already in progress.');locks.set(id,true);try{return await fn()}finally{locks.delete(id)}}
 async function route(req){
  cleanup();const url=new URL(req.url),path=url.pathname,origin=req.headers.get('origin');
  if(origin&&![config.origin,config.frontendOrigin].includes(origin))throw new AppError(403,'Origin is not allowed.');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-CSRF-Token, X-Request-ID','Access-Control-Max-Age':'600'}});
  if(path==='/health'&&req.method==='GET')return json({ok:true});
  if(path==='/auth/login'&&req.method==='GET'){
   if(flows.size>=100)throw new AppError(429,'Too many login attempts. Try again shortly.');
   const id=random(),state=random(),verifier=random();flows.set(id,{state,verifier,expires:now()+600000});
   const auth=new URL('https://github.com/login/oauth/authorize');auth.searchParams.set('client_id',config.clientId);auth.searchParams.set('redirect_uri',config.origin+'/auth/callback');auth.searchParams.set('state',state);auth.searchParams.set('code_challenge',createHash('sha256').update(verifier).digest('base64url'));auth.searchParams.set('code_challenge_method','S256');
   return redirect(auth.href,{'Set-Cookie':cookie(flowCookie,id,600)});
  }
  if(path==='/auth/callback'&&req.method==='GET'){
   const id=cookies(req)[flowCookie],flow=flows.get(id);flows.delete(id);
   if(!flow||flow.expires<=now()||!equal(flow.state,url.searchParams.get('state'))||!url.searchParams.get('code')||url.searchParams.has('error'))throw new AppError(400,'The sign-in request is invalid or expired. Start sign-in again.');
   let r;try{r=await fetcher('https://github.com/login/oauth/access_token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.origin+'/auth/callback',code:url.searchParams.get('code'),state:flow.state,code_verifier:flow.verifier})})}catch{throw new AppError(503,'Sign-in provider is unavailable. Start sign-in again.')}
   let data;try{data=await r.json()}catch{throw new AppError(503,'Sign-in provider returned an invalid response.')}
   if(!r.ok||typeof data.access_token!=='string'||data.error)throw new AppError(401,'GitHub sign-in failed. Start sign-in again.');
   const user=await provider.user(data.access_token);
   if(sessions.size>=100)throw new AppError(429,'Too many active sessions.');
   const sid=random(),ttl=Math.min(config.sessionMs,Number(data.expires_in||28800)*1000);if(!Number.isFinite(ttl)||ttl<=0)throw new AppError(401,'The provider token is expired.');
   sessions.delete(cookies(req)[sessionCookie]);sessions.set(sid,{token:data.access_token,user,csrfToken:random(),expires:now()+ttl});
   const response=redirect(config.frontendUrl,{'Set-Cookie':sessionHeader(sid,ttl)});response.headers.append('Set-Cookie',clearFlow());return response;
  }
  if(path==='/api/session'&&req.method==='GET'){
   if(!sessions.has(cookies(req)[sessionCookie]))return json({user:null});
   const s=await session(req);return json({user:s.user,csrfToken:s.csrfToken});
  }
  if(path==='/auth/logout'){
   const s=await session(req);
   if(req.method==='GET')return new Response(`<!doctype html><html><head><meta name="referrer" content="no-referrer"><title>Sign out</title></head><body><h1>Sign out of the development codex?</h1><form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="${escape(s.csrfToken)}"><button>Sign out</button></form></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8'}});
   if(req.method==='POST'){
    if(![config.origin,config.frontendOrigin].includes(origin))throw new AppError(403,'Invalid logout origin.');
    const body=await req.text();if(body.length>1000||!equal(new URLSearchParams(body).get('csrf'),s.csrfToken))throw new AppError(403,'Invalid CSRF token.');
    sessions.delete(s.id);return redirect(config.frontendUrl,{'Set-Cookie':sessionHeader('',0)});
   }
  }
  if(path==='/api/sources'&&req.method==='GET'){await session(req);return json({sources:config.sources.map(({id,provider,category,format,writable})=>({id,provider,category,format,writable}))})}
  if(path==='/api/records'&&req.method==='GET'){
   const s=await session(req);if(url.searchParams.has('history'))return json(await provider.history(source(url.searchParams.get('history')),s.token));
   const records=[],errors=[];
   for(let i=0;i<config.sources.length;i+=4){const group=config.sources.slice(i,i+4);const results=await Promise.allSettled(group.map(x=>provider.read(x,s.token)));results.forEach((r,j)=>{if(r.status==='fulfilled')records.push(r.value);else errors.push({id:group[j].id,status:r.reason.status||503,message:'Source unavailable or permission denied.'})})}
   return json({records,errors,interviewRootId:config.sources.find(x=>x.interviewRoot)?.id||null,refreshedAt:new Date(now()).toISOString()});
  }
  if(path.startsWith('/api/assets/')&&req.method==='GET'){
   const auth=await session(req),binding=source(path.slice('/api/assets/'.length));if(binding.provider!=='github'||binding.format!=='asset')throw new AppError(404,'Asset not found.');
   const ref=url.searchParams.get('revision');if(ref&&!/^[a-f0-9]{40}$/.test(ref))throw new AppError(400,'Invalid asset revision.');
   const data=await provider.raw(binding,auth.token,ref);const ext=binding.path.split('.').at(-1).toLowerCase();
   return new Response(data.bytes,{headers:{'Content-Type':({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml'})[ext],'Content-Security-Policy':"default-src 'none'; sandbox"}});
  }
  if(path==='/api/records'&&req.method==='POST'){
   const auth=await session(req);csrf(req,auth);const body=await payload(req);
   const binding=source(body.id);if(typeof body.revision!=='string')throw new AppError(400,'Expected source revision is required.');
   const key=req.headers.get('x-request-id');if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key||''))throw new AppError(400,'A request ID is required.');
   const opKey=auth.id+':'+key,fingerprint=digest(JSON.stringify(body));
   if(operations.has(opKey)){const op=operations.get(opKey);if(op.fingerprint!==fingerprint||!op.result)throw new AppError(409,'This write may already have reached the source. Inspect it before making another request.','write_uncertain');const visible=await provider.read(binding,auth.token);return json({...op.result,record:visible})}
   return locked(binding.id,async()=>{
    // Preflight is read-only. Do not consume the idempotency key for a known conflict.
    const current=await provider.read(binding,auth.token);if(current.revision!==body.revision)throw new AppError(409,'The source changed. Refresh and compare before saving.','source_conflict');
    if(!current.canEdit)throw new AppError(403,'This source is read-only or incomplete.');
    if(operations.size>=1000)throw new AppError(429,'Write limit reached for this process. Try again later.');
    const op={fingerprint,expires:auth.expires};operations.set(opKey,op);
    try{op.result=await provider.write(binding,auth.token,body.revision,body.changes);const visible=await provider.read(binding,auth.token);return json({...op.result,record:visible})}catch(e){
     if(e.status===400||e.status===403||e.status===409)throw e;
     throw new AppError(503,'Write completion is uncertain. Inspect the canonical source before retrying.','write_uncertain');
    }
   });
  }
  throw new AppError(404,'Endpoint not found.');
 }
 return async function handle(req){
  let response;try{response=await route(req)}catch(e){response=json({error:e instanceof AppError?e.message:'Request failed.',code:e.code||'request_failed'},e.status||500);if(new URL(req.url).pathname==='/auth/callback')response.headers.append('Set-Cookie',clearFlow())}
  const origin=req.headers.get('origin');if([config.frontendOrigin,config.origin].includes(origin)){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Access-Control-Allow-Credentials','true')}
  response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Origin, Cookie');response.headers.set('Referrer-Policy','no-referrer');response.headers.set('X-Content-Type-Options','nosniff');
  if(!response.headers.has('Content-Security-Policy'))response.headers.set('Content-Security-Policy',"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  return response;
 };
}
