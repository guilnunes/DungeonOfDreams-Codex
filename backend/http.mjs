import {createServer} from 'node:http';
export function createHttpServer(config,handle){
 const server=createServer(async(req,res)=>{
  try{
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>180000){res.writeHead(413,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Request too large.'}));return}chunks.push(chunk)}
   const url=new URL(req.url,config.origin);if(url.origin!==config.origin){res.writeHead(400);res.end();return}
   const response=await handle(new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}));
   const headers=Object.fromEntries([...response.headers].filter(([k])=>k!=='set-cookie'));const setCookies=response.headers.getSetCookie();if(setCookies.length)headers['Set-Cookie']=setCookies;
   res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.headersSent)res.writeHead(500,{'Cache-Control':'no-store'});res.end('Request failed.');}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;
 return server;
}
