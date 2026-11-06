import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const root=process.cwd();
const out=root+'/.tmp/lifecycle-review-evidence/review3';
await fs.mkdir(out,{recursive:true});
const env={...process.env,DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
const udid=(await exec('xcrun',['simctl','create','Agent Device Review Inventory','com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro','com.apple.CoreSimulator.SimRuntime.iOS-26-4'],{env})).stdout.trim();
const stateDir=out+'/state-unallocated-sdk';
const {createAgentDeviceClient}=await import(root+'/dist/src/index.js');
const report={sha:(await exec('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim(),udid,steps:[]};
async function save(){await fs.writeFile(out+'/unallocated.json',JSON.stringify(report,null,2));}
async function nativeState(){const all=JSON.parse((await exec('xcrun',['simctl','list','devices','-j'],{env})).stdout);return Object.values(all.devices).flat().find(d=>d.udid===udid).state;}
try {
 await exec('xcrun',['simctl','boot',udid],{env});
 await exec('xcrun',['simctl','bootstatus',udid,'-b'],{env,timeout:180000});
 for(const platform of ['ios','android']) {
  const client=createAgentDeviceClient({stateDir,session:'unallocated-'+platform,leaseProvider:'limrun',platform});
  for(const [name,run] of [
   ['boot',()=>client.devices.boot()],
   ['headless-boot',()=>client.devices.boot({headless:true})],
   ['open',()=>client.apps.open({app:platform==='ios'?'com.apple.Preferences':'com.android.settings'})],
   ['shutdown',()=>client.devices.shutdown()],
  ]) {
   try {await run();assert.fail(platform+' '+name+' unexpectedly succeeded');}
   catch(e){assert.equal(e.code,'DEVICE_NOT_FOUND',name+': '+e.message);assert.equal(e.details?.reason,'provider_instance_unallocated');assert.match(e.hint??e.details?.hint??'',/leases.allocate/);report.steps.push({platform,name,code:e.code,reason:e.details.reason,hint:e.hint??e.details.hint});await save();console.log('PASS',platform,name);}
  }
 }
 assert.equal(await nativeState(),'Booted');report.localDeviceSurvived=true;
} finally {
 await exec('node',[root+'/bin/agent-device.mjs','daemon','stop','--clean','--state-dir',stateDir,'--json'],{env,timeout:30000}).catch(()=>{});
 await exec('xcrun',['simctl','shutdown',udid],{env}).catch(()=>{});
 await exec('xcrun',['simctl','delete',udid],{env});
 report.cleanedUp=true;await save();
}
