import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import Limrun from '@limrun/api';
const root=process.cwd();
const out=root+'/.tmp/limrun-review-evidence';
await fs.mkdir(out,{recursive:true});
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(sha,'3848d114b36d6de352ee20827fbb8e4cda9996c1');
const apiKey=process.env.LIMRUN_API_KEY;
const api=new Limrun({apiKey});
const report={sha,startedAt:new Date().toISOString(),steps:[]};
async function save(){await fs.writeFile(out+'/live.json',JSON.stringify(report,null,2));}
let instance,manager,client,lease;
const scope={tenant:'limrun',runId:'android-review',leaseBackend:'android-instance',leaseProvider:'limrun',platform:'android'};
async function step(name,fn){const result=await fn();report.steps.push({name,result});await save();console.log('PASS',name);return result;}
try{
 instance=await api.androidInstances.create({wait:true,metadata:{displayName:'agent-device Android review verification'},spec:{inactivityTimeout:'10m',hardTimeout:'1h'}},{maxRetries:0});
 const {status}=instance;report.instanceId=instance.metadata.id;await save();
 Object.assign(process.env,{LIM_ANDROID_INSTANCE_URL:status.apiUrl,LIM_ANDROID_INSTANCE_TOKEN:status.token,LIM_ANDROID_INSTANCE_ADB_URL:status.adbWebSocketUrl,ANDROID_HOME:process.env.ANDROID_HOME});
 delete process.env.LIMRUN_API_KEY;
 const {createAgentDeviceClient}=await import(root+'/dist/src/index.js');
 manager=createAgentDeviceClient({stateDir:out+'/state',session:'parity-manager'});
 lease=await manager.leases.allocate({...scope,retainOnClose:true});
 client=createAgentDeviceClient({stateDir:out+'/state',session:'parity-app',...scope,leaseId:lease.leaseId,sessionIsolation:'tenant'});
 const app='com.agentdevice.installerreview';
 await step('install',()=>client.apps.install({app,appPath:out+'/fixture/installer-review.apk'}));
 await step('open',()=>client.apps.open({app}));
 const snap=await step('snapshot',()=>client.capture.snapshot({interactiveOnly:true}));
 assert.equal(snap.androidSnapshot.backend,'android-helper');
 assert.equal(snap.androidSnapshot.helperVersion,JSON.parse(await fs.readFile(root+'/package.json','utf8')).version);
 const text=await step('get-text',()=>client.interactions.get({format:'text',debug:true,target:{kind:'ref',ref:'@'+snap.nodes[0].ref}}));
 assert.ok(JSON.stringify(text).toLowerCase().includes('installer review version 3'));
 const memory=await step('memory',()=>client.observability.perf({area:'memory',action:'sample'}));
 assert.equal(memory.metrics.memory.available,true);assert.ok(memory.metrics.memory.totalPssKb>0);
 const frames=await step('frames',()=>client.observability.perf({area:'frames',action:'sample'}));
 assert.equal(frames.metrics.fps.available,true);assert.ok(frames.metrics.fps.totalFrameCount>0);
 const heap=await step('heap',()=>client.observability.perf({area:'memory',action:'snapshot',kind:'android-hprof',out:out+'/heap.hprof'}));
 assert.equal(heap.artifact.available,true);const bytes=await fs.readFile(heap.artifact.path);assert.equal(bytes.length,heap.artifact.sizeBytes);assert.ok(bytes.subarray(0,19).toString().startsWith('JAVA PROFILE 1.0.3'));
 report.heap={bytes:bytes.length,header:bytes.subarray(0,19).toString()};await save();
}finally{
 if(client)await step('close',()=>client.apps.close());
 if(lease)await step('release',()=>manager.leases.release({...scope,leaseId:lease.leaseId}));
 if(manager)execFileSync('node',[root+'/bin/agent-device.mjs','daemon','stop','--clean','--state-dir',out+'/state','--json'],{cwd:root});
 if(instance){await api.androidInstances.delete(instance.metadata.id);report.instanceDeleted=true;await save();console.log('PASS instance-deleted');}
}
async function diagnostics(dir){const events=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory())events.push(...await diagnostics(file));else if(entry.name.endsWith('.ndjson'))for(const line of (await fs.readFile(file,'utf8')).split('\n')){if(!line.trim())continue;try{const event=JSON.parse(line);if(event.phase)events.push(event);}catch{}}}return events;}
const events=await diagnostics(out+'/state');
const getEvents=events.filter(event=>event.command==='get');
report.getTextDiagnosticEventCount=getEvents.length;
report.getTextDiagnosticPhases=[...new Set(getEvents.map(event=>event.phase))];
assert.ok(getEvents.length>0,'The get request must retain a debug diagnostic trace');
report.interactionReadFallbackCount=getEvents.filter(event=>event.phase==='interaction_read_fallback').length;
assert.equal(report.interactionReadFallbackCount,0);
report.completedAt=new Date().toISOString();await save();console.log('PASS zero-text-fallbacks-with-trace');
