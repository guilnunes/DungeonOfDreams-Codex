import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
const excluded=new Set(['.git','node_modules','coverage']);
const forbiddenFiles=/^(sources\.json|references\.json|interview\.json|seed\.ts|hosting\.json|\.dev\.vars.*|.*\.(?:pem|key))$/i;
const findings=[];
const patterns=[
 ['credential', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|art_v\d_[A-Za-z0-9_]{20,}|secret_[A-Za-z0-9]{25,}|ntn_[A-Za-z0-9]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/],
 ['private source link', /https?:\/\/(?:app\.)?notion\.(?:so|com)\/[^\s"'<>]+/i],
 ['Site deployment identifier', /(?:appgprj|appgdep|appgver|appgrepo)_[a-z0-9]{20,}/i],
 ['email address', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
 ['private UUID', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i]
];
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){if(excluded.has(item.name))continue;const p=path.join(dir,item.name);if(item.isSymbolicLink()){findings.push(`${p}: symlink outside review scope`);continue;}if(item.isDirectory()){await walk(p);continue;}if(forbiddenFiles.test(item.name)||(/^\.env(?:\.|$)/.test(item.name)&&item.name!=='.env.example'))findings.push(`${p}: forbidden private file`);const text=await readFile(p,'utf8');for(const [label,pattern]of patterns)if(pattern.test(text))findings.push(`${p}: ${label}`);}}
await walk('.');
if(findings.length){console.error(findings.join('\n'));process.exitCode=1;}else console.log('Public-source audit passed: no forbidden data files, credentials, private links, or deployment identifiers detected.');
