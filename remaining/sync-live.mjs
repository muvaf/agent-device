import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const root='/Users/muvaf/github.com/callstack/agent-device-sync-upstream';
const require=createRequire(root+'/package.json');
const {parse}=require('yaml');
const config=parse(await fs.readFile('/Users/muvaf/.lim/config.yaml','utf8'));
const platform=process.argv[2];
const instance=JSON.parse(await fs.readFile(`/private/tmp/agent-device-remaining-evidence/${platform}-private.json`,'utf8'));
const {status}=instance;
process.env.LIMRUN_API_KEY=config['api-key'];
if(config['api-endpoint']) process.env.LIMRUN_BASE_URL=config['api-endpoint'];
if(platform==='ios') Object.assign(process.env,{LIM_IOS_INSTANCE_URL:status.apiUrl,LIM_IOS_INSTANCE_TOKEN:status.token,AGENT_DEVICE_LIMRUN_IOS_RUNNER_APP:'/private/tmp/agent-device-remaining-evidence/runner/agent-device-ios-runner-0.0.0-dev.app'});
else Object.assign(process.env,{LIM_ANDROID_INSTANCE_URL:status.apiUrl,LIM_ANDROID_INSTANCE_TOKEN:status.token,LIM_ANDROID_INSTANCE_ADB_URL:status.adbWebSocketUrl});
const {createAgentDeviceClient}=await import(root+'/dist/src/index.js');
const {createInstanceClient}=await import(`${root}/node_modules/@limrun/api/${platform==='ios'?'ios-client':'instance-client'}.mjs`);
const remote=await createInstanceClient({apiUrl:status.apiUrl,token:status.token,...(platform==='android'?{adbUrl:status.adbWebSocketUrl}:{}),logLevel:'error'});
const stateDir=`/private/tmp/agent-device-remaining-evidence/sync-${platform}-state`;
const scope={tenant:'limrun',runId:'remaining-sync',leaseBackend:`${platform}-instance`,leaseProvider:'limrun',platform};
const manager=createAgentDeviceClient({stateDir,session:`${platform}-lease`});
const lease=await manager.leases.allocate({...scope,retainOnClose:true});
const client=createAgentDeviceClient({stateDir,session:`${platform}-app`,...scope,leaseId:lease.leaseId,sessionIsolation:'tenant'});
const app=platform==='ios'?'com.limrun.e2e-fixture':'com.limrun.e2e.fixture';
const appPath=`/Users/muvaf/github.com/limrun/limrun/test/e2e/testdata/fixtures/${platform==='ios'?'ios/E2EFixture.app':'android/e2e-fixture.apk'}`;
const simctl=async(args)=>remote.simctl(args).wait();
async function assertStopped() {
 if(platform==='ios') assert.notEqual((await simctl(['terminate','booted',app])).code,0,'install launched app');
 else assert.notEqual((await remote.adbShell('pidof',[app])).exitCode,0,'install launched app');
 console.log('install-only leaves app stopped');
}
try {
 console.log('instance',instance.metadata.id,'lease',lease.leaseId);
 console.log('source',require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim());
 console.log('install',await client.apps.install({app,appPath}));
 await assertStopped();
 await client.apps.open({app});
 console.log('open passed');
 if(platform==='ios') {
   console.log('Checking app data replacement');
   await fs.writeFile('/private/tmp/agent-device-remaining-evidence/sync-marker','present');
   await remote.pushFile('/private/tmp/agent-device-remaining-evidence/sync-marker','Documents/convergence-marker',{bundleId:app,containerType:'data'});
   assert.equal((await remote.pullFile('Documents/convergence-marker',{bundleId:app,containerType:'data'})).toString(),'present');
   console.log('iOS app-container marker written');
 } else {
   const marker=await remote.adbShell('sh',['-c',`mkdir -p /sdcard/Android/data/${app}/files && echo present > /sdcard/Android/data/${app}/files/convergence-marker`]);
   assert.equal(marker.exitCode,0,JSON.stringify(marker));console.log('Android data marker written');
 }
 console.log('reinstall',await client.apps.reinstall({app,appPath}));
 await assertStopped();
 if(platform==='ios') {const files=await remote.listFiles('Documents',{bundleId:app,containerType:'data'});assert.equal(files.some(f=>JSON.stringify(f).includes('convergence-marker')),false);}
 else {const marker=await remote.adbShell('cat',[`/sdcard/Android/data/${app}/files/convergence-marker`]);assert.notEqual(marker.exitCode,0,JSON.stringify(marker));}
 console.log('reinstall removed old app data');
 await client.apps.open({app});console.log('reinstalled app launched');
 console.log('uninstall',await client.apps.uninstall({app}));
 if(platform==='ios') assert.equal((await remote.listApps()).some(a=>a.bundleId===app),false);
 else {const packages=await remote.adbShell('pm',['list','packages',app]);assert.equal(packages.stdout.trim(),'');}
 console.log('uninstall verified');
 console.log('missing uninstall',await client.apps.uninstall({app}));
 await client.apps.close();
 console.log('PASS',platform);
} finally {
 await manager.leases.release({...scope,leaseId:lease.leaseId}).catch(e=>console.error('release failed',e.message));
 remote.disconnect();
 console.log('closed session and released lease');
}
