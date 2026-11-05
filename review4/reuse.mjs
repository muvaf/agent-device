import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root=process.env.REVIEW_ROOT??'/private/tmp/agent-device-review4-base';
const evidence='/private/tmp/agent-device-review4-evidence';
const require=createRequire(root+'/package.json');
const config=require('yaml').parse(await fs.readFile('/Users/muvaf/.lim/config.yaml','utf8'));
const instance=JSON.parse(await fs.readFile(evidence+'/ios-private.json','utf8'));
Object.assign(process.env,{LIMRUN_API_KEY:config['api-key'],LIM_IOS_INSTANCE_URL:instance.status.apiUrl,LIM_IOS_INSTANCE_TOKEN:instance.status.token,AGENT_DEVICE_LIMRUN_IOS_RUNNER_APP:'/private/tmp/agent-device-remaining-evidence/runner/agent-device-ios-runner-0.0.0-dev.app'});
if(config['api-endpoint'])process.env.LIMRUN_BASE_URL=config['api-endpoint'];
const {createAgentDeviceClient}=await import(root+'/dist/src/index.js');
const stateDir=evidence+'/'+(process.env.REVIEW_LABEL??'base')+'-state';
const scope={tenant:'limrun',runId:'review-reuse',leaseBackend:'ios-instance',leaseProvider:'limrun',platform:'ios'};
const cli=(...args)=>JSON.parse(execFileSync('node',[root+'/bin/agent-device.mjs',...args,'--state-dir',stateDir,'--json'],{cwd:root,encoding:'utf8'}));
console.log('source',execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),'instance',instance.metadata.id);
for(let round=1;round<=3;round++){
 const manager=createAgentDeviceClient({debug:true,stateDir,session:'reuse-lease-'+round});
 const lease=await manager.leases.allocate({...scope,retainOnClose:true});
 const client=createAgentDeviceClient({debug:true,stateDir,session:'reuse-app-'+round,...scope,leaseId:lease.leaseId,sessionIsolation:'tenant'});
 try{
  if(round===1)await client.apps.install({app:'com.limrun.e2e-fixture',appPath:'/Users/muvaf/github.com/limrun/limrun/test/e2e/testdata/fixtures/ios/E2EFixture.app'});
  await client.apps.open({app:'com.limrun.e2e-fixture'});
  console.log('open',round);
  const snapshot=await client.capture.snapshot({interactiveOnly:true});assert.ok(snapshot.nodes.length>0);console.log('snapshot -i',round,snapshot.nodes.length);
  await fs.writeFile(evidence+'/'+(process.env.REVIEW_LABEL??'base')+'-snapshot-'+round+'.json',JSON.stringify(snapshot,null,2));
 }catch(e){console.error('FAIL',round,e.code,e.message,JSON.stringify(e.details));process.exitCode=1;}
 finally{
  if (!(process.env.KILL_ACTIVE === '1' && round === 2)) {
  await client.apps.close().catch(e=>console.error('close failed',e.message));
  await manager.leases.release({...scope,leaseId:lease.leaseId}).catch(e=>console.error('release failed',e.message));
  }
 }
 if(round===2){const status=cli('daemon','status');console.log('daemon status before kill',JSON.stringify(status));const pid=status.data?.pid??status.data?.daemon?.pid;if(!pid)throw new Error('No owned daemon PID');process.kill(pid,'SIGKILL');console.log('killed owned daemon',pid);}
}
console.log('cleanup',JSON.stringify(cli('daemon','stop','--clean')));
