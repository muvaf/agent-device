import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import Limrun from '@limrun/api';
const exec=promisify(execFile);
const root=process.cwd();
const out=root+'/.tmp/lifecycle-review-evidence';
await fs.mkdir(out,{recursive:true});
const platform=process.argv[2]??'android';
const attached=process.argv[3]!=='created';
const kind=attached?'attached':'created';
const stateDir=out+'/state-'+platform+'-'+kind;
const apiKey=process.env.LIMRUN_API_KEY;
for(const k of Object.keys(process.env)) if(/^LIM_(IOS|ANDROID)_INSTANCE_/.test(k)) delete process.env[k];
process.env.ANDROID_HOME=process.env.ANDROID_HOME;
const api=new Limrun({apiKey});
const resource=platform==='ios'?api.iosInstances:api.androidInstances;
let instance;
if(attached){
 instance=await resource.create({wait:true,metadata:{displayName:'agent-device-lifecycle-'+platform,labels:{purpose:'agent-device-lifecycle'}},spec:{inactivityTimeout:'10m',hardTimeout:'1h'}},{maxRetries:0});
 delete process.env.LIMRUN_API_KEY;
 Object.assign(process.env,platform==='ios'?{LIM_IOS_INSTANCE_URL:instance.status.apiUrl,LIM_IOS_INSTANCE_TOKEN:instance.status.token}:{LIM_ANDROID_INSTANCE_URL:instance.status.apiUrl,LIM_ANDROID_INSTANCE_TOKEN:instance.status.token,LIM_ANDROID_INSTANCE_ADB_URL:instance.status.adbWebSocketUrl});
}else process.env.LIMRUN_API_KEY=apiKey;
const report={sha:(await exec('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim(),platform,kind,steps:[]};
async function step(name,fn){const value=await fn();report.steps.push({name,result:value});await fs.writeFile(out+'/retained-'+platform+'-'+kind+'.json',JSON.stringify(report,null,2));console.log('PASS',platform,kind,name);return value;}
const {createAgentDeviceClient}=await import(root+'/dist/src/index.js');
const scope={tenant:'limrun',runId:'lifecycle-'+kind,leaseBackend:platform==='ios'?'ios-instance':'android-instance',leaseProvider:'limrun',platform};
const manager=createAgentDeviceClient({stateDir,session:'manager'});
let lease;
try{
 lease=await step('allocate-retained',()=>manager.leases.allocate({...scope,retainOnClose:true}));
 const client=createAgentDeviceClient({stateDir,session:'retained-test',...scope,leaseId:lease.leaseId,sessionIsolation:'tenant'});
 if(!attached){const listed=(await resource.list({labelSelector:'provider=limrun,leaseId='+lease.leaseId})).getPaginatedItems();assert.equal(listed.length,1);instance=listed[0];}
 await step('boot',()=>client.devices.boot());
 await step('open',()=>client.apps.open({app:platform==='ios'?'com.apple.Preferences':'com.android.settings'}));
 const snap=await step('snapshot',()=>client.capture.snapshot({interactive:true}));
 if(platform==='android'){assert.equal(snap.androidSnapshot.backend,'android-helper');assert.equal(snap.androidSnapshot.helperVersion,'0.21.37-dev');}
 const closed=await step('close-shutdown',()=>client.apps.close({shutdown:true}));assert.equal(closed.shutdown.success,true);
 assert.equal((await step('lease-already-released',()=>manager.leases.release({...scope,leaseId:lease.leaseId}))).released,false);
 if(attached){
  assert.equal((await resource.get(instance.metadata.id)).status.state,'ready');
  lease=await step('reattach',()=>manager.leases.allocate({...scope,retainOnClose:true}));
  const second=createAgentDeviceClient({stateDir,session:'standalone-test',...scope,leaseId:lease.leaseId,sessionIsolation:'tenant'});
  await step('attached-boot',()=>second.devices.boot());
  assert.equal((await step('shutdown-detach',()=>second.devices.shutdown())).shutdown.success,true);
  assert.equal((await resource.get(instance.metadata.id)).status.state,'ready');
  await step('attached-instance-still-ready',async()=>({instanceId:instance.metadata.id,state:'ready'}));
 }else{
  for(let i=0;i<40;i++){let x;try{x=await resource.get(instance.metadata.id);}catch(e){if(e.status===404)break;throw e;}if(x.status.state==='terminated')break;if(i===39)throw new Error('Instance not terminated');await new Promise(r=>setTimeout(r,500));}
  await step('owned-instance-terminated',async()=>({instanceId:instance.metadata.id}));
 }
}finally{
 if(lease)await manager.leases.release({...scope,leaseId:lease.leaseId}).catch(e=>console.log('release-cleanup',e.message));
 await exec('node',[root+'/bin/agent-device.mjs','daemon','stop','--clean','--state-dir',stateDir,'--json'],{cwd:root}).catch(e=>console.log('daemon-cleanup',e.code));
 if(instance){await resource.delete(instance.metadata.id).catch(e=>{if(e.status!==404)throw e;});console.log('cleanup-instance',instance.metadata.id);}
}
