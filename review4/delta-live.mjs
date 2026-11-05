import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
async function main() {
const root=process.env.REVIEW_ROOT??'/Users/muvaf/github.com/callstack/agent-device-sync-upstream';
const out='/private/tmp/agent-device-review4-evidence';
const platform=process.argv[2];const require=createRequire(root+'/package.json');
const config=require('yaml').parse(await fs.readFile('/Users/muvaf/.lim/config.yaml','utf8'));
const {default:Limrun}=await import(root+'/node_modules/@limrun/api/index.mjs');
const api=new Limrun({apiKey:config['api-key'],...(config['api-endpoint']?{baseURL:config['api-endpoint']}:{})});
const instance=JSON.parse(await fs.readFile(out+'/'+platform+'-private.json','utf8'));
if(platform==='android')await fs.writeFile(out+'/android-private.json',JSON.stringify(instance),{mode:0o600});
const {status}=instance;
Object.assign(process.env,{LIMRUN_API_KEY:config['api-key'],NODE_OPTIONS:'--import='+out+'/observe-sync.mjs'});
if(config['api-endpoint'])process.env.LIMRUN_BASE_URL=config['api-endpoint'];
if(platform==='ios')Object.assign(process.env,{LIM_IOS_INSTANCE_URL:status.apiUrl,LIM_IOS_INSTANCE_TOKEN:status.token,AGENT_DEVICE_LIMRUN_IOS_RUNNER_APP:'/private/tmp/agent-device-remaining-evidence/runner/agent-device-ios-runner-0.0.0-dev.app'});
else Object.assign(process.env,{LIM_ANDROID_INSTANCE_URL:status.apiUrl,LIM_ANDROID_INSTANCE_TOKEN:status.token,LIM_ANDROID_INSTANCE_ADB_URL:status.adbWebSocketUrl});
const {createAgentDeviceClient}=await import(root+'/dist/src/index.js');
const {createInstanceClient}=await import(root+'/node_modules/@limrun/api/'+(platform==='ios'?'ios-client':'instance-client')+'.mjs');
const remote=await createInstanceClient({apiUrl:status.apiUrl,token:status.token,...(platform==='android'?{adbUrl:status.adbWebSocketUrl}:{}),logLevel:'error'});
const stateDir=out+'/delta-'+platform+'-'+(process.env.REVIEW_LABEL??'head')+'-state';
const scope={tenant:'limrun',runId:'delta-review',leaseBackend:platform+'-instance',leaseProvider:'limrun',platform};
const manager=createAgentDeviceClient({stateDir,session:'delta-lease'});const lease=await manager.leases.allocate({...scope,retainOnClose:true});
const client=createAgentDeviceClient({stateDir,session:'delta-app',...scope,leaseId:lease.leaseId,sessionIsolation:'tenant'});
const app=platform==='ios'?'com.limrun.e2e-fixture':'com.limrun.e2e.fixture';
const name=platform==='ios'?'E2EFixture.app':'fixture.apk';const working=out+'/delta-working-'+platform;await fs.mkdir(working,{recursive:true});const appPath=working+'/'+name;
console.log('source',execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),'instance',instance.metadata.id);
try{
 await client.apps.uninstall({app});
 for(const [version,operation] of [['one','install'],['two','install'],['one','reinstall']]){
  await fs.rm(appPath,{recursive:true,force:true});await fs.cp(out+'/fixtures/'+platform+'/'+version+'/'+name,appPath,{recursive:true});
  const binary=await fs.readFile(platform==='ios'?appPath+'/E2EFixture':appPath);assert.ok(binary.length>=65536);console.log('binary',version,binary.length,crypto.createHash('sha256').update(binary).digest('hex'));
  console.log(operation,await client.apps[operation]({app,appPath}));
  if(platform==='ios')assert.notEqual((await remote.simctl(['terminate','booted',app]).wait()).code,0,'install must leave app stopped');
  else assert.notEqual((await remote.adbShell('pidof',[app])).exitCode,0,'install must leave app stopped');
  console.log('PASS stopped after',operation,version);
  await client.apps.open({app});
  if(platform==='ios' && process.env.REVIEW_LABEL==='base') {
   const installed=await remote.pullFile('E2EFixture',{bundleId:app,containerType:'app'});
   assert.equal(crypto.createHash('sha256').update(installed).digest('hex'),crypto.createHash('sha256').update(binary).digest('hex'));
   console.log('PASS installed iOS bytes match rebuilt binary',version);
  } else if(platform==='ios') {
   const snapshot=await client.capture.snapshot({interactiveOnly:false});
   assert.ok(JSON.stringify(snapshot).includes('Delta '+version),'installed version title missing');
   console.log('PASS rebuilt UI',version);
  } else {
   const packages=await remote.adbShell('pm',['path',app]);
   assert.equal(packages.exitCode,0);
   const installedPath=packages.stdout.trim().replace(/^package:/,'');
   const hash=await remote.adbShell('sha256sum',[installedPath]);
   assert.equal(hash.exitCode,0);assert.equal(hash.stdout.split(/\s/)[0],crypto.createHash('sha256').update(binary).digest('hex'));
   console.log('PASS installed APK bytes match rebuilt binary',version);
  }
  await client.apps.close();
 }
 console.log('PASS',platform,'dist changed-binary install/reinstall');
}finally{
 await manager.leases.release({...scope,leaseId:lease.leaseId}).catch(e=>console.error('release',e.message));remote.disconnect();
 console.log('cleanup',execFileSync('node',[root+'/bin/agent-device.mjs','daemon','stop','--clean','--state-dir',stateDir,'--json'],{cwd:root,encoding:'utf8'}));
}

}
main().catch(error=>{console.error(JSON.stringify({error:error.message,code:error.code,details:error.details,cause:error.cause}));process.exitCode=1;});
