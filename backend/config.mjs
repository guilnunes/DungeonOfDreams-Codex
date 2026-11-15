const categories=new Set(['Gameplay','Room taxonomy','Character creation','Worldbuilding','Narrative','Art direction','Implementation','Decisions','Templates']);
export function loadConfig(env=process.env){
 const required=['CODEX_OWNER_LOGIN','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET'];
 for(const k of required)if(!env[k]?.trim())throw Error(`Missing server setting: ${k}`);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(env.CODEX_OWNER_LOGIN))throw Error('Invalid owner login.');
 const appOrigin=env.CODEX_APP_ORIGIN||env.CODEX_BACKEND_ORIGIN||env.RENDER_EXTERNAL_URL;
 if(!appOrigin)throw Error('Missing server setting: CODEX_APP_ORIGIN');
 const origin=new URL(appOrigin),frontend=new URL(env.CODEX_FRONTEND_URL||origin.origin+'/');
 if(frontend.origin!==origin.origin)throw Error('Frontend and backend must share the same origin.');
 for(const u of [origin,frontend])if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('Public URLs must use HTTPS without credentials, query, or fragment.');
 if(origin.pathname!=='/')throw Error('Backend URL must be an origin.');
 let sources;try{sources=JSON.parse(env.CODEX_SOURCES_JSON||'[]')}catch{throw Error('CODEX_SOURCES_JSON must be valid JSON.')}
 if(!Array.isArray(sources)||sources.length>100)throw Error('Configure at most 100 sources.');
 const ids=new Set();
 for(const s of sources){
  if(!s||typeof s!=='object'||!/^[a-zA-Z0-9_-]{1,80}$/.test(s.id)||ids.has(s.id))throw Error('Source IDs must be unique safe identifiers.');ids.add(s.id);
  if(!categories.has(s.category)||!['text','record-json','asset'].includes(s.format)||typeof s.writable!=='boolean')throw Error('Invalid source category, format, or write policy.');
  if(s.provider==='notion'){
   if(!/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(s.pageId)||s.format==='asset')throw Error('Invalid Notion source.');
   if(!env.NOTION_TOKEN)throw Error('NOTION_TOKEN is required for Notion sources.');
  }else if(s.provider==='github'){
   if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repository)||s.repository.split('/').some(x=>x==='.'||x==='..')||typeof s.branch!=='string'||!s.branch||s.branch.includes('..')||/[~^:?*\[\\]/.test(s.branch)||s.branch.startsWith('/')||s.branch.endsWith('/')||s.branch.includes('//')||typeof s.path!=='string'||!s.path||s.path.startsWith('/')||s.path.includes('\\')||s.path.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Invalid GitHub source.');
   if(s.format==='asset'&&!/\.(png|jpe?g|webp|gif|svg)$/i.test(s.path))throw Error('Unsupported asset type.');
   if(s.format==='asset'&&s.writable)throw Error('Binary asset changes require an asset-specific workflow; configure read-only.');
  }else throw Error('Unknown source provider.');
 }
 for(const s of sources)if(s.assetId&&!sources.some(x=>x.id===s.assetId&&x.provider==='github'&&x.format==='asset'))throw Error('Asset links must reference a configured GitHub asset.');
 const hours=Number(env.CODEX_SESSION_HOURS||8);if(!Number.isFinite(hours)||hours<=0)throw Error('Invalid session lifetime.');
 return {origin:origin.origin,frontendUrl:frontend.href,frontendOrigin:frontend.origin,owner:env.CODEX_OWNER_LOGIN.toLowerCase(),clientId:env.GITHUB_CLIENT_ID,clientSecret:env.GITHUB_CLIENT_SECRET,notionToken:env.NOTION_TOKEN||'',sources,crossSite:false,sessionMs:Math.min(hours,8)*3600000};
}
