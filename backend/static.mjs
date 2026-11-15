import {readFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff2':'font/woff2'};
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
/** Serve only built public artifacts. Never fall back to backend/source files. */
export function withStaticFrontend(api,distDirectory){
 const root=path.resolve(distDirectory);
 return async request=>{
  const pathname=new URL(request.url).pathname;
  if(pathname==='/health'||/^\/(api|auth)(?:\/|$)/.test(pathname))return api(request);
  const fail=(status,message)=>new Response(message,{status,headers:{...security,'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});
  if(!['GET','HEAD'].includes(request.method))return fail(405,'Method not allowed.');
  let decoded;try{decoded=decodeURIComponent(pathname)}catch{return fail(400,'Invalid path.')}
  if(decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').some(x=>x.startsWith('.')))return fail(404,'Not found.');
  const relative=decoded==='/'?'index.html':decoded.slice(1),ext=path.extname(relative);
  if(!mime[ext])return fail(404,'Not found.');
  try{
   const realRoot=await realpath(root),file=await realpath(path.resolve(root,relative));
   if(!file.startsWith(realRoot+path.sep)||!(await stat(file)).isFile())return fail(404,'Not found.');
   const bytes=request.method==='HEAD'?null:await readFile(file);
   return new Response(bytes,{headers:{...security,'Content-Type':mime[ext],'Cache-Control':ext==='.html'?'no-cache':'public, max-age=31536000, immutable'}});
  }catch{return fail(404,'Not found.')}
 };
}
