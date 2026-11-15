import {createHash,randomBytes} from 'node:crypto';
export class AppError extends Error{constructor(status,message,code='request_failed'){super(message);this.status=status;this.code=code}}
const fields=['title','category','kind','status','body','code','trigger','population','layout','variants','rewards','context','family','facing','version','scale','choices'];
const hash=x=>createHash('sha256').update(x).digest('hex');
const encPath=p=>p.split('/').map(encodeURIComponent).join('/');
export function createProviders(config,fetcher=fetch){
 async function call(url,token,{notion=false,method='GET',body,raw=false}={}){
  let r;try{r=await fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'User-Agent':'development-codex','Accept':'application/vnd.github+json',...(notion?{'Notion-Version':'2026-03-11','Accept':'application/json'}:{'X-GitHub-Api-Version':'2022-11-28'}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})}catch{throw new AppError(503,'Provider request failed. Refresh before trying again.','provider_unavailable')}
  if(!r.ok){const status=[401,403,404,409,422,429].includes(r.status)?r.status:503;throw new AppError(status,status===429?'Provider rate limit reached. Wait before refreshing.':'The source is unavailable or access was denied.','provider_error')}
  if(raw)return r;
  try{return await r.json()}catch{throw new AppError(503,'Invalid provider response.','provider_error')}
 }
 const gh=(path,token,opts)=>call('https://api.github.com'+path,token,opts);
 const notion=(path,opts)=>call('https://api.notion.com/v1'+path,config.notionToken,{...opts,notion:true});
 async function user(token){const u=await gh('/user',token);if(typeof u.login!=='string'||u.login.toLowerCase()!==config.owner)throw new AppError(403,'This account is not allowed to access the project.','account_denied');return {login:u.login,displayName:u.name||u.login}}
 async function raw(s,token,ref){
  if(s.provider==='notion'){
   const page=await notion(`/pages/${s.pageId}`);
   if(page.archived||page.in_trash)throw new AppError(404,'Source is archived.');
   const md=await notion(`/pages/${s.pageId}/markdown?markdown_version=v2`);
   if(typeof md.markdown!=='string')throw new AppError(503,'Source response is invalid.');
   const title=Object.values(page.properties||{}).find(x=>x?.type==='title')?.title?.map(x=>x.plain_text||x.text?.content||'').join('')||s.title||'Untitled page';
   return {text:md.markdown,title,revision:page.last_edited_time+':'+hash(md.markdown),updated:page.last_edited_time,source:page.url,complete:!!md.markdown.trim()&&!/<unknown(?:\s|>)/i.test(md.markdown)&&!md.truncated&&!md.unknown_block_ids?.length&&!md.warnings?.length};
  }
  const repo='/repos/'+s.repository;
  const data=await gh(`${repo}/contents/${encPath(s.path)}?ref=${encodeURIComponent(ref||s.branch)}`,token);
  if(Array.isArray(data)||data.type!=='file'||data.encoding!=='base64'||typeof data.content!=='string'||data.size>2_000_000)throw new AppError(422,'Source must be a supported file smaller than 2 MB.');
  const bytes=Buffer.from(data.content.replace(/\s/g,''),'base64');
  return {text:bytes.toString('utf8'),bytes,title:s.title||s.path.split('/').at(-1),revision:data.sha,source:data.html_url,complete:true};
 }
 function project(s,data){
  let structured={};
  if(s.format==='record-json'){
   let text=data.text.trim();if(text.startsWith('```json\n')&&text.endsWith('\n```'))text=text.slice(8,-4);
   try{structured=JSON.parse(text)}catch{throw new AppError(422,'Structured source must contain a JSON record.')}
   if(!structured||typeof structured!=='object'||Array.isArray(structured))throw new AppError(422,'Structured source must be a JSON object.');
   structured=Object.fromEntries(fields.filter(k=>k in structured).map(k=>[k,structured[k]]));
   validateFields(structured);
  }
  const record={title:data.title,category:s.category,kind:s.kind||'Document',status:'Reference',body:s.format==='asset'?'Source-owned asset file.':data.text,...structured,id:s.id,revision:data.revision,source:data.source,updated:data.updated,provider:s.provider,format:s.format,canEdit:s.writable&&data.complete&&s.format!=='asset',canHistory:s.provider==='github',provenance:`Live ${s.provider} source`,...((s.format==='asset'||s.assetId)?{...(s.format==='asset'?{kind:'Asset'}:{}),image:`${config.origin}/api/assets/${s.format==='asset'?s.id:s.assetId}`}:{})};
  return record;
 }
 async function read(s,token,ref){return project(s,await raw(s,token,ref))}
 async function history(s,token){
  if(s.provider==='notion')return {records:[],historyAvailable:false,message:'Open Notion to review its native page history.'};
  const commits=await gh(`/repos/${s.repository}/commits?path=${encodeURIComponent(s.path)}&sha=${encodeURIComponent(s.branch)}&per_page=10`,token);
  const records=[];for(const c of commits){const r=await read(s,token,c.sha);r.updated=c.commit?.committer?.date;r.version=c.sha;if(r.image)r.image+=`?revision=${c.sha}`;records.push(r)}
  return {records,historyAvailable:true};
 }
 async function write(s,token,expected,changes){
  if(!s.writable||s.format==='asset')throw new AppError(403,'This source is read-only.');
  validateFields(changes);
  if(s.format==='text'&&Object.keys(changes).some(k=>k!=='body'))throw new AppError(400,'This text source supports content edits only.');
  const current=await raw(s,token);if(current.revision!==expected)throw new AppError(409,'The source changed. Refresh and compare before saving.','source_conflict');
  if(!current.complete)throw new AppError(409,'Incomplete or unsupported source content cannot be edited here.');
  let text;
  if(s.format==='record-json'){
   let rawJson=current.text.trim();if(rawJson.startsWith('```json\n')&&rawJson.endsWith('\n```'))rawJson=rawJson.slice(8,-4);const next={...JSON.parse(rawJson),...changes};text=JSON.stringify(next,null,2)+'\n';
   if(s.provider==='notion')text='```json\n'+text.trimEnd()+'\n```';
  }else text=changes.body;
  if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>150000)throw new AppError(400,'Content must be non-empty and smaller than 150 KB.');
  if(text===current.text)return {outcome:'unchanged',record:project(s,current)};
  if(s.provider==='notion'){
   const result=await notion(`/pages/${s.pageId}/markdown`,{method:'PATCH',body:{type:'update_content',markdown_version:'v2',allow_async:false,update_content:{allow_deleting_content:false,content_updates:[{old_str:current.text,new_str:text}]}}});
   if(result.warnings?.length||result.object==='async_task')throw new AppError(503,'The provider returned a warning. Inspect the source before any further edit.','write_uncertain');
   const record=await read(s,token);
   // A source readback, not HTTP 200 alone, confirms the requested content.
   if((await raw(s,token)).text.trim()!==text.trim())throw new AppError(503,'The write could not be verified. Inspect the source before retrying.','write_uncertain');
   return {outcome:'saved',record};
  }
  const repo='/repos/'+s.repository;
  const base=await gh(`${repo}/git/ref/heads/${encPath(s.branch)}`,token);
  const branch='codex/edit-'+randomBytes(12).toString('hex');
  await gh(repo+'/git/refs',token,{method:'POST',body:{ref:'refs/heads/'+branch,sha:base.object.sha}});
  // Confirm the branch still contains the exact source version reviewed.
  const branchFile=await raw(s,token,branch);if(branchFile.revision!==expected)throw new AppError(409,'The source changed while preparing the branch. Review the source.','source_conflict');
  await gh(`${repo}/contents/${encPath(s.path)}`,token,{method:'PUT',body:{message:'Update source record from development codex',branch,sha:expected,content:Buffer.from(text).toString('base64')}});
  const pr=await gh(repo+'/pulls',token,{method:'POST',body:{title:'Codex: update '+s.path,head:branch,base:s.branch,body:'Source change submitted through the authenticated development codex. Review the diff before merging.'}});
  return {outcome:'pull_request',url:pr.html_url,record:project(s,current)};
 }
 return {user,read,raw,history,write};
}
export function validateFields(changes){
 if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new AppError(400,'Invalid edit fields.');
 for(const [k,v]of Object.entries(changes)){
  if(!fields.includes(k))throw new AppError(400,'Unsupported edit field.');
  if(k==='choices'){if(!Array.isArray(v)||v.length>20||v.some(x=>!x||typeof x.text!=='string'||typeof x.next!=='string'))throw new AppError(400,'Invalid interview choices.');}
  else if(typeof v!=='string'||v.length>150000)throw new AppError(400,'Invalid text field.');
 }
 if(Object.keys(changes).length===0)throw new AppError(400,'No changes were submitted.');
}
export const editableFields=fields;
