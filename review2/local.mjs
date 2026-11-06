import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const root=process.cwd();
const out=root+'/.tmp/lifecycle-review-evidence';
await fs.mkdir(out,{recursive:true});
const platform=process.argv[2];assert.ok(['ios','android'].includes(platform));
const env={...process.env,ANDROID_HOME:process.env.ANDROID_HOME,ANDROID_AVD_HOME:out+'/avd',DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer',AGENT_DEVICE_IOS_RUNNER_DERIVED_PATH:out+'/derived'};
for(const k of Object.keys(env))if(k==='LIMRUN_API_KEY'||/^LIM_(IOS|ANDROID)_INSTANCE_/.test(k))delete env[k];
const apiKey=process.env.LIMRUN_API_KEY;
const adb=env.ANDROID_HOME+'/platform-tools/adb';
const udid=platform==='ios'?(await exec('xcrun',['simctl','create','Agent Device Review Lifecycle','com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro','com.apple.CoreSimulator.SimRuntime.iOS-26-4'],{env})).stdout.trim():'emulator-5568';
const report={sha:(await exec('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim(),platform,udid,steps:[]};
const state=out+'/state-local-'+platform;
async function save(){await fs.writeFile(out+'/local-'+platform+'.json',JSON.stringify(report,null,2));}
async function step(name,fn){const result=await fn();report.steps.push({name,result});await save();console.log('PASS',platform,name);return result;}
async function cli(args,{connection=false,ok=true}={}){
 const opts=['--state-dir',connection?out+'/state-unallocated-'+platform:state,'--json',...(args[0]==='daemon'?[]:connection?['--session','unallocated-provider']:['--session','local-review','--platform',platform,platform==='ios'?'--udid':'--serial',udid])];
 let stdout;try{({stdout}=await exec('node',[root+'/bin/agent-device.mjs',...args,...opts],{cwd:root,env:connection?{...env,LIMRUN_API_KEY:apiKey}:env,timeout:300000,maxBuffer:8e6}));}catch(e){stdout=e.stdout;}
 const r=JSON.parse(stdout);assert.equal(r.success,ok,JSON.stringify(r.error));return r;
}
async function nativeState(){if(platform==='ios'){const all=JSON.parse((await exec('xcrun',['simctl','list','devices','-j'],{env})).stdout);return Object.values(all.devices).flat().find(d=>d.udid===udid).state;}const devices=(await exec(adb,['devices'],{env})).stdout;return devices.includes(udid+'\tdevice')?'Booted':'Shutdown';}
async function shutdownConfirmed(){for(let i=0;i<60;i++){const s=await nativeState();if(s==='Shutdown')return {state:s};await new Promise(r=>setTimeout(r,500));}throw new Error('Device stayed booted');}
try{
 if(platform==='android')await exec(adb,['-s',udid,'wait-for-device'],{env,timeout:180000});
 await step('boot',()=>cli(['boot']));
 await step('connect-empty-provider',()=>cli(['connect','limrun','--platform',platform],{connection:true}));
 const refused=await step('unallocated-provider-shutdown',()=>cli(['shutdown'],{connection:true,ok:false}));
 assert.ok(refused.error.details?.reason==='provider_instance_unallocated'||(refused.error.code==='INVALID_ARGS'&&refused.error.message==='tenant isolation requires lease id.'));
 const {createAgentDeviceClient}=await import(root+'/dist/src/index.js');
 const unallocated=createAgentDeviceClient({stateDir:state,session:'unallocated-sdk',leaseProvider:'limrun',platform});
 await step('unallocated-sdk-provider-shutdown',async()=>{
  try{await unallocated.devices.shutdown();assert.fail('Unallocated shutdown succeeded');}catch(e){assert.equal(e.details?.reason,'provider_instance_unallocated');return {code:e.code,details:e.details};}
 });
 await step('local-survives-provider-shutdown',async()=>{const state=await nativeState();assert.equal(state,'Booted');return {state};});
 await step('disconnect-empty-provider',()=>cli(['disconnect'],{connection:true}));
 await step('open',()=>cli(['open',platform==='ios'?'com.apple.Preferences':'com.android.settings']));
 await step('snapshot',()=>cli(['snapshot','-i']));
 const close=await step('close-shutdown',()=>cli(['close','--shutdown']));assert.equal(close.data.shutdown.success,true);
 await step('close-native-state',shutdownConfirmed);
 if(platform==='android'){
  const {spawn}=await import('node:child_process');const log=await fs.open(out+'/emulator-standalone.log','w');
  const child=spawn(env.ANDROID_HOME+'/emulator/emulator',['-avd','AgentDeviceLifecycleReview','-port','5568','-no-window','-no-audio','-no-snapshot','-gpu','swiftshader_indirect'],{env,detached:true,stdio:['ignore',log.fd,log.fd]});child.unref();await log.close();
  await exec(adb,['-s',udid,'wait-for-device'],{env,timeout:180000});
 }
 await step('boot-for-standalone',()=>cli(['boot']));
 const stopped=await step('standalone-shutdown',()=>cli(['shutdown']));assert.equal(stopped.data.shutdown.success,true);
 await step('standalone-native-state',shutdownConfirmed);
}finally{
 await cli(['disconnect'],{connection:true}).catch(()=>{});
 await cli(['close','--shutdown']).catch(()=>{});
 await cli(['daemon','stop','--clean']).catch(()=>{});
 await cli(['daemon','stop','--clean'],{connection:true}).catch(()=>{});
 if(platform==='ios'){await exec('xcrun',['simctl','shutdown',udid],{env}).catch(()=>{});await exec('xcrun',['simctl','delete',udid],{env});}else await exec(adb,['-s',udid,'emu','kill'],{env}).catch(()=>{});
 report.cleanedUp=true;await save();
}
