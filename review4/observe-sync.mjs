import fs from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 if(String(input).endsWith('/sync')&&init?.body){
  const chunks=[];for await(const chunk of init.body)chunks.push(Buffer.from(chunk));
  const wire=Buffer.concat(chunks);let payload=wire;
  const encoding=new Headers(init.headers).get('content-encoding');
  if(encoding==='gzip')payload=zlib.gunzipSync(wire);
  if(encoding==='zstd')payload=zlib.zstdDecompressSync(wire);
  const n=payload.readUInt32BE();const m=JSON.parse(payload.subarray(4,4+n));
  fs.appendFileSync('/private/tmp/agent-device-review4-evidence/sync-wire.jsonl',JSON.stringify({rootName:m.rootName,launchMode:m.launchMode,files:m.files.map(f=>({path:f.path,size:f.size,sha256:f.sha256})),payloads:m.payloads})+'\n');
  init={...init,body:Readable.from([wire])};
 }
 return original(input,init);
};
