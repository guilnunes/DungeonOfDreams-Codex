import {fileURLToPath} from 'node:url';
import {withStaticFrontend} from './static.mjs';
import {loadConfig} from './config.mjs';
import {createApp} from './app.mjs';
import {createHttpServer} from './http.mjs';
const config=loadConfig();
const server=createHttpServer(config,withStaticFrontend(createApp(config),fileURLToPath(new URL('../dist/',import.meta.url))));
server.listen(Number(process.env.PORT||8787),process.env.HOST||'127.0.0.1',()=>console.log('Codex backend listening. TLS termination is required at the configured HTTPS origin.'));
