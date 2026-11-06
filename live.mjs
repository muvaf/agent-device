import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root='/Users/muvaf/github.com/callstack/agent-device-android-parity';
const out='/private/tmp/agent-device-android-parity-evidence';
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(sha,'be921a195914e10bca4f78440cc0406b1d91a0db');
console.log('SOURCE',sha);
await fs.writeFile(out+'/live-source.json',JSON.stringify({sha,startedAt:new Date().toISOString()},null,2));
const {status}=JSON.parse(await fs.readFile(out+'/instance-private.json','utf8'));
Object.assign(process.env,{LIM_ANDROID_INSTANCE_URL:status.apiUrl,LIM_ANDROID_INSTANCE_TOKEN:status.token,LIM_ANDROID_INSTANCE_ADB_URL:status.adbWebSocketUrl,AGENT_DEVICE_STATE_DIR:out+'/state',ANDROID_HOME:'/Users/muvaf/Library/Android/sdk'});
const {createAgentDeviceClient}=await import(root+'/dist/src/index.js');
const scope={tenant:'limrun',runId:'android-parity',leaseBackend:'android-instance',leaseProvider:'limrun',platform:'android'};
const manager=createAgentDeviceClient({stateDir:out+'/state',session:'parity-manager'});
const lease=await manager.leases.allocate({...scope,retainOnClose:true});
const client=createAgentDeviceClient({stateDir:out+'/state',session:'parity-app',...scope,leaseId:lease.leaseId,sessionIsolation:'tenant'});
const app='com.agentdevice.installerreview';
async function step(name,fn){try{const result=await fn();await fs.writeFile(out+'/'+name+'.json',JSON.stringify(result,null,2));console.log('PASS',name,JSON.stringify(result).slice(0,1300));return result;}catch(error){console.log('FAIL',name,JSON.stringify({message:error.message,code:error.code,details:error.details}));throw error;}}
try{
 await step('install',()=>client.apps.install({app,appPath:'/private/tmp/agent-device-review2/android-live/fixtures/v3/installer-review.apk'}));
 await step('open',()=>client.apps.open({app}));
 const snap=await step('snapshot',()=>client.capture.snapshot({interactiveOnly:true}));
 assert.equal(snap.androidSnapshot.backend,'android-helper');
 const text=await step('get-text',()=>client.interactions.get({format:'text',target:{kind:'ref',ref:'@'+snap.nodes[0].ref}}));
 assert.ok(JSON.stringify(text).toLowerCase().includes('installer review version 3')); 
 const memory=await step('memory',()=>client.observability.perf({area:'memory',action:'sample'}));
 assert.equal(memory.metrics.memory.available,true);assert.ok(memory.metrics.memory.totalPssKb>0);
 const frames=await step('frames',()=>client.observability.perf({area:'frames',action:'sample'}));
 assert.equal(frames.metrics.fps.available,true);assert.ok(frames.metrics.fps.totalFrameCount>0);
 const heap=await step('heap',()=>client.observability.perf({area:'memory',action:'snapshot',kind:'android-hprof',out:out+'/heap.hprof'}));
 assert.equal(heap.artifact.available,true);const bytes=await fs.readFile(heap.artifact.path);assert.equal(bytes.length,heap.artifact.sizeBytes);assert.ok(bytes.subarray(0,19).toString().startsWith('JAVA PROFILE 1.0.3')); 

}finally{
 await client.apps.close().catch(e=>console.log('close',e.message));
 await manager.leases.release({...scope,leaseId:lease.leaseId});
 execFileSync('node',[root+'/bin/agent-device.mjs','daemon','stop','--clean','--state-dir',out+'/state','--json'],{cwd:root});
}
