import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../backend/app.mjs';
import {loadConfig} from '../backend/config.mjs';
const origin='https://backend.example.com',frontend='https://app.example.com';
const pageId='a'.repeat(32),fileSha='b'.repeat(40),commitSha='c'.repeat(40);
const notionSource={id:'design',provider:'notion',pageId,category:'Gameplay',kind:'Document',format:'text',writable:true};
const gitSource={id:'implementation',provider:'github',repository:'owner/game',branch:'main',path:'docs/rule.md',category:'Implementation',kind:'Document',format:'text',writable:true};
const base={origin,frontendUrl:frontend+'/',frontendOrigin:frontend,owner:'owner',clientId:'client',clientSecret:'server-only-value',notionToken:'server-only-notion',sources:[],crossSite:false,sessionMs:3600000};
function harness(sources=[],options={}){
 let markdown=options.markdown||'# Example source\n',login=options.login||'owner',currentSha=fileSha,time=0;const calls=[];
 const fetcher=async(input,init={})=>{
  const url=String(input);calls.push({url,init});const body=init.body?JSON.parse(init.body):null;
  const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
  if(url==='https://github.com/login/oauth/access_token')return json({access_token:'fixture-access',expires_in:3600});
  if(url==='https://api.github.com/user')return json({login,name:'Fixture User'});
  if(url.startsWith('https://api.notion.com/v1/pages/')){
   if(url.includes('/markdown')){
    if(init.method==='PATCH'){
     if(options.failWrite)throw Error('network interrupted');
     const edit=body.update_content.content_updates[0];assert.equal(edit.old_str,markdown);markdown=edit.new_str;return json({object:'page_markdown',markdown});
    }
    return json({object:'page_markdown',markdown,truncated:Boolean(options.truncated),unknown_block_ids:[]});
   }
   return json({properties:{title:{type:'title',title:[{plain_text:'Example source'}]}},last_edited_time:'2026-01-01T00:00:00.000Z',url:'https://www.notion.so/'+pageId});
  }
  if(url.includes('/git/ref/heads/'))return json({object:{sha:commitSha}});
  if(url.endsWith('/git/refs'))return json({ref:body.ref});
  if(url.endsWith('/pulls'))return json({html_url:'https://github.com/owner/game/pull/1'});
  if(url.includes('/contents/')){
   if(init.method==='PUT')return json({content:{sha:'d'.repeat(40)}});
   if(options.sourceFailure)return json({},403);
   return json({type:'file',encoding:'base64',size:30,sha:currentSha,content:Buffer.from(options.gitText||'Example implementation\n').toString('base64'),html_url:'https://github.com/owner/game/blob/main/docs/rule.md'});
  }
  throw Error('Unexpected fixture request: '+url);
 };
 const app=createApp({...base,sources},{fetcher,now:()=>time});
 async function call(path,init={}){return app(new Request(origin+path,init))}
 async function auth(){
  const start=await call('/auth/login');assert.equal(start.status,303);const target=new URL(start.headers.get('location'));
  assert.equal(target.searchParams.get('code_challenge_method'),'S256');assert.ok(target.searchParams.get('code_challenge'));
  const flow=start.headers.get('set-cookie').split(';')[0];
  const callback=await call('/auth/callback?code=fixture-code&state='+target.searchParams.get('state'),{headers:{cookie:flow}});
  const cookie=callback.headers.getSetCookie().find(x=>x.startsWith('__Host-codex-session='))?.split(';')[0];
  if(callback.status!==303)return {callback,cookie};
  const identity=await call('/api/session',{headers:{cookie}});const session=await identity.json();
  return {callback,cookie,session,headers:{cookie,Origin:frontend,'Content-Type':'application/json','X-CSRF-Token':session.csrfToken,'X-Request-ID':'fixture-request-key-001'}};
 }
 return {call,auth,calls,changeSha:()=>currentSha='d'.repeat(40),setTime:n=>time=n,getMarkdown:()=>markdown,setLogin:n=>login=n};
}
test('anonymous source and asset requests never reach a provider',async()=>{const h=harness([notionSource]);for(const p of ['/api/records','/api/sources','/api/assets/design'])assert.equal((await h.call(p)).status,401);assert.equal(h.calls.length,0);assert.deepEqual(await(await h.call('/api/session')).json(),{user:null})});
test('OAuth state is required and one-use; untrusted return URLs are ignored',async()=>{const h=harness();const r=await h.call('/auth/login?return_to=https://evil.test');const state=new URL(r.headers.get('location')).searchParams.get('state');const cookie=r.headers.get('set-cookie').split(';')[0];assert.equal((await h.call('/auth/callback?code=x&state=wrong',{headers:{cookie}})).status,400);assert.equal((await h.call('/auth/callback?code=x&state='+state,{headers:{cookie}})).status,400);assert.equal(h.calls.length,0)});
test('owner login establishes an opaque secure HttpOnly cookie and PKCE exchange',async()=>{const h=harness();const a=await h.auth();assert.equal(a.callback.status,303);assert.equal(a.callback.headers.get('location'),frontend+'/');const c=a.callback.headers.getSetCookie().join(';');assert.match(c,/HttpOnly/);assert.match(c,/Secure/);assert.match(c,/SameSite=Lax/);assert.ok(!c.includes('fixture-access'));const exchange=JSON.parse(h.calls[0].init.body);assert.ok(exchange.code_verifier);assert.ok(!JSON.stringify(a.session).includes('fixture-access'))});
test('a different GitHub account is denied even after a valid OAuth exchange',async()=>{const h=harness([],{login:'someone-else'});const a=await h.auth();assert.equal(a.callback.status,403);assert.equal(a.cookie,undefined)});
test('expired sessions and changed account authorization cannot read content',async()=>{const h=harness([notionSource]);const a=await h.auth();h.setLogin('another-account');assert.equal((await h.call('/api/records',{headers:{cookie:a.cookie}})).status,403);const h2=harness();const b=await h2.auth();h2.setTime(3600001);assert.equal((await h2.call('/api/records',{headers:{cookie:b.cookie}})).status,401)});
test('CORS is exact and credentialed; arbitrary origins fail before provider access',async()=>{const h=harness();const r=await h.call('/api/session',{headers:{Origin:frontend}});assert.equal(r.headers.get('access-control-allow-origin'),frontend);assert.equal(r.headers.get('access-control-allow-credentials'),'true');assert.equal((await h.call('/api/session',{headers:{Origin:'https://evil.test'}})).status,403);assert.equal(h.calls.length,0)});
test('live reads return source-owned records and independent source failures',async()=>{const h=harness([notionSource,gitSource],{sourceFailure:true});const a=await h.auth();const r=await h.call('/api/records',{headers:{cookie:a.cookie}});const data=await r.json();assert.equal(data.records.length,1);assert.equal(data.errors.length,1);assert.equal(data.records[0].body,'# Example source\n');assert.equal(data.records[0].provider,'notion');assert.equal(r.headers.get('cache-control'),'private, no-store')});
test('CSRF, unknown targets, and read-only sources cannot mutate data',async()=>{const h=harness([{...notionSource,writable:false}]);const a=await h.auth();const body=JSON.stringify({id:'design',revision:'old',changes:{body:'Changed'}});assert.equal((await h.call('/api/records',{method:'POST',headers:{...a.headers,'X-CSRF-Token':'wrong'},body})).status,403);assert.equal((await h.call('/api/records',{method:'POST',headers:a.headers,body:JSON.stringify({id:'arbitrary',revision:'x',changes:{body:'Changed'}})})).status,404);const list=await(await h.call('/api/records',{headers:{cookie:a.cookie}})).json();assert.equal(list.records[0].canEdit,false);assert.equal((await h.call('/api/records',{method:'POST',headers:a.headers,body:JSON.stringify({id:'design',revision:list.records[0].revision,changes:{body:'Changed'}})})).status,403);assert.equal(h.calls.filter(c=>c.init.method==='PATCH').length,0)});
test('revision conflicts never write to the provider',async()=>{const h=harness([gitSource]);const a=await h.auth();const r=await h.call('/api/records',{method:'POST',headers:a.headers,body:JSON.stringify({id:'implementation',revision:'stale',changes:{body:'Changed'}})});assert.equal(r.status,409);assert.equal(h.calls.filter(c=>['PUT','PATCH','POST'].includes(c.init.method)&&!c.url.includes('oauth')).length,0)});
test('Notion saves are checked, written to the original, and confirmed by readback',async()=>{const h=harness([notionSource]);const a=await h.auth();const data=await(await h.call('/api/records',{headers:{cookie:a.cookie}})).json();const body=JSON.stringify({id:'design',revision:data.records[0].revision,changes:{body:'# Changed source\n'}});const r=await h.call('/api/records',{method:'POST',headers:a.headers,body});assert.equal(r.status,200);assert.equal((await r.json()).outcome,'saved');assert.equal(h.getMarkdown(),'# Changed source\n');assert.equal(h.calls.filter(x=>x.init.method==='PATCH').length,1);const repeat=await h.call('/api/records',{method:'POST',headers:a.headers,body});assert.equal(repeat.status,200);assert.equal(h.calls.filter(x=>x.init.method==='PATCH').length,1)});
test('an uncertain write cannot be replayed or replaced under its request ID',async()=>{const h=harness([notionSource],{failWrite:true});const a=await h.auth();const d=await(await h.call('/api/records',{headers:{cookie:a.cookie}})).json();const body=JSON.stringify({id:'design',revision:d.records[0].revision,changes:{body:'Changed'}});assert.equal((await h.call('/api/records',{method:'POST',headers:a.headers,body})).status,503);const retry=await h.call('/api/records',{method:'POST',headers:a.headers,body});assert.equal(retry.status,409);assert.equal((await retry.json()).code,'write_uncertain');assert.equal(h.calls.filter(x=>x.init.method==='PATCH').length,1)});
test('GitHub edits create a branch and PR without writing the default branch',async()=>{const h=harness([gitSource]);const a=await h.auth();const r=await h.call('/api/records',{method:'POST',headers:a.headers,body:JSON.stringify({id:'implementation',revision:fileSha,changes:{body:'Changed implementation'}})});assert.equal(r.status,200);const result=await r.json();assert.equal(result.outcome,'pull_request');assert.equal(result.record.revision,fileSha);const put=h.calls.find(x=>x.init.method==='PUT');const body=JSON.parse(put.init.body);assert.notEqual(body.branch,'main');assert.match(body.branch,/^codex\/edit-/);assert.equal(body.sha,fileSha);assert.equal(h.calls.filter(x=>x.url.endsWith('/pulls')).length,1)});
test('truncated Notion content is readable but cannot be written',async()=>{const h=harness([notionSource],{truncated:true});const a=await h.auth();const d=await(await h.call('/api/records',{headers:{cookie:a.cookie}})).json();assert.equal(d.records[0].canEdit,false)});
test('structured source updates preserve unknown JSON fields',async()=>{const text='```json\n'+JSON.stringify({title:'Example',body:'Initial',customExtension:{keep:true}})+'\n```';const h=harness([{...notionSource,format:'record-json'}],{markdown:text});const a=await h.auth();const d=await(await h.call('/api/records',{headers:{cookie:a.cookie}})).json();const r=await h.call('/api/records',{method:'POST',headers:a.headers,body:JSON.stringify({id:'design',revision:d.records[0].revision,changes:{body:'Updated'}})});assert.equal(r.status,200);assert.ok(h.getMarkdown().includes('customExtension'));assert.ok(h.getMarkdown().includes('Updated'))});
test('logout requires explicit CSRF-protected POST and clears the session',async()=>{const h=harness();const a=await h.auth();const get=await h.call('/auth/logout',{headers:{cookie:a.cookie}});assert.equal(get.status,200);assert.ok((await(await h.call('/api/session',{headers:{cookie:a.cookie}})).json()).user);const r=await h.call('/auth/logout',{method:'POST',headers:{cookie:a.cookie,Origin:origin},body:'csrf='+a.session.csrfToken});assert.equal(r.status,303);assert.deepEqual(await(await h.call('/api/session',{headers:{cookie:a.cookie}})).json(),{user:null})});
test('configuration fails closed with missing identity settings and unsafe source paths',()=>{assert.throws(()=>loadConfig({}),/Missing/);const env={CODEX_BACKEND_ORIGIN:origin,CODEX_FRONTEND_URL:origin,CODEX_OWNER_LOGIN:'owner',GITHUB_CLIENT_ID:'client',GITHUB_CLIENT_SECRET:'value'};assert.equal(loadConfig(env).sources.length,0);assert.throws(()=>loadConfig({...env,CODEX_SOURCES_JSON:JSON.stringify([{...gitSource,path:'../secret'}])}),/Invalid/)});

test('unknown markdown markers disable edits even without truncation flags',async()=>{const h=harness([notionSource],{markdown:'<unknown alt="unsupported"/>'});const a=await h.auth();const data=await(await h.call('/api/records',{headers:{cookie:a.cookie}})).json();assert.equal(data.records[0].canEdit,false)});
