import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {withStaticFrontend} from '../backend/static.mjs';
import {createApp} from '../backend/app.mjs';
import {createHttpServer} from '../backend/http.mjs';
test('one HTTP origin serves the frontend, login, cookies, and protected API',async()=>{
 const config={origin:'https://backend.example.com',frontendUrl:'https://backend.example.com/',frontendOrigin:'https://backend.example.com',owner:'owner',clientId:'fixture-client',clientSecret:'fixture-server-value',sources:[],sessionMs:3600000,crossSite:false};
 const fetcher=async url=>new Response(JSON.stringify(String(url).includes('/access_token')?{access_token:'fixture-access',expires_in:3600}:{login:'owner',name:'Fixture User'}),{headers:{'Content-Type':'application/json'}});
 const dist=await mkdtemp(path.join(tmpdir(),'codex-http-'));await writeFile(path.join(dist,'index.html'),'<h1>Public app shell</h1>');
 const server=createHttpServer(config,withStaticFrontend(createApp(config,{fetcher}),dist));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const frontend=await fetch(base+'/');assert.equal(frontend.status,200);assert.match(await frontend.text(),/Public app shell/);
  const health=await fetch(base+'/health');assert.equal(health.status,200);
  const unauthorized=await fetch(base+'/api/records');assert.equal(unauthorized.status,401);assert.equal(unauthorized.headers.get('cache-control'),'private, no-store');
  const login=await fetch(base+'/auth/login',{redirect:'manual'});assert.equal(login.status,303);
  const state=new URL(login.headers.get('location')).searchParams.get('state'),flow=login.headers.getSetCookie()[0].split(';')[0];
  const callback=await fetch(base+'/auth/callback?code=fixture&state='+state,{redirect:'manual',headers:{cookie:flow}});
  assert.equal(callback.status,303);assert.equal(callback.headers.getSetCookie().length,2);assert.ok(callback.headers.getSetCookie()[0].includes('HttpOnly'));
  const cookie=callback.headers.getSetCookie()[0].split(';')[0];
  const session=await fetch(base+'/api/session',{headers:{cookie}});assert.equal((await session.json()).user.login,'owner');
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dist,{recursive:true,force:true})}
});
