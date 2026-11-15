import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {withStaticFrontend} from '../backend/static.mjs';
import {loadConfig} from '../backend/config.mjs';
test('same host serves public assets without weakening API/auth routing',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'codex-public-')),dist=path.join(root,'dist');await mkdir(path.join(dist,'assets'),{recursive:true});await writeFile(path.join(dist,'index.html'),'<div>Public shell</div>');await writeFile(path.join(dist,'assets','app.js'),'console.log("public shell")');await writeFile(path.join(root,'private.txt'),'fixture-private');await symlink(path.join(root,'private.txt'),path.join(dist,'escape.html'));
 const seen=[];const serve=withStaticFrontend(async req=>{seen.push(new URL(req.url).pathname);return new Response('protected',{status:401})},dist);
 const request=(p,method='GET')=>new Request('https://example.com'+p,{method});
 try{
  const index=await serve(request('/'));assert.equal(index.status,200);assert.match(await index.text(),/Public shell/);assert.equal(index.headers.get('cache-control'),'no-cache');assert.match(index.headers.get('content-security-policy'),/connect-src 'self'/);
  assert.equal((await serve(request('/assets/app.js'))).status,200);const head=await serve(request('/assets/app.js','HEAD'));assert.equal(await head.text(),'');
  for(const p of ['/api/records','/auth/login','/health'])assert.equal((await serve(request(p))).status,401);assert.equal(seen.length,3);
  for(const p of ['/backend/config.mjs','/.env','/assets/%2e%2e%2f%2e%2e%2fprivate.txt','/escape.html','/missing.js'])assert.equal((await serve(request(p))).status,404);
  assert.equal((await serve(request('/','POST'))).status,405);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('deployment configuration enforces one origin and supports Render automatic URL',()=>{
 const env={RENDER_EXTERNAL_URL:'https://example.com',CODEX_OWNER_LOGIN:'owner',GITHUB_CLIENT_ID:'fixture-id',GITHUB_CLIENT_SECRET:'fixture-value'};
 const c=loadConfig(env);assert.equal(c.origin,'https://example.com');assert.equal(c.frontendOrigin,c.origin);assert.equal(c.crossSite,false);
 assert.throws(()=>loadConfig({...env,CODEX_FRONTEND_URL:'https://different.example.com'}),/same origin/);
});
