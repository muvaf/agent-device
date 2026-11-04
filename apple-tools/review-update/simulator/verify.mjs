import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
const exec = promisify(execFile);
const [repo, output, expectedSha] = process.argv.slice(2);
assert(repo && output && expectedSha);
await fs.mkdir(output, {recursive:true});
for (const key of Object.keys(process.env)) if(key.startsWith('AGENT_DEVICE_')) delete process.env[key];
Object.assign(process.env, {
 AGENT_DEVICE_STATE_DIR:path.join(output,'state'),
 AGENT_DEVICE_IOS_RUNNER_DERIVED_PATH:path.join(output,'derived'),
 AGENT_DEVICE_IOS_RUNNER_LEASE_DIR:path.join(output,'runner-leases'),
});
const transcript={sha:expectedSha,commands:[],observations:[],cleanup:[]};
const save=()=>fs.writeFile(path.join(output,'transcript.json'), JSON.stringify(transcript,null,2)+'\n');
async function cmd(file,args,allowFailure=false){
 const entry={command:[file,...args],start:new Date().toISOString()};
 try { const r=await exec(file,args,{cwd:repo,env:process.env,maxBuffer:8*1024*1024,timeout:600000}); Object.assign(entry,{exit:0,stdout:r.stdout,stderr:r.stderr}); }
 catch(e){Object.assign(entry,{exit:e.code,stdout:e.stdout,stderr:e.stderr});if(!allowFailure){transcript.commands.push(entry);await save();throw e;}}
 transcript.commands.push(entry);await save();console.log(JSON.stringify({command:[file,...args],exit:entry.exit}));return entry;
}
let udid;let runner;let sessionOpen=false;
const session='apple-tools-local';
async function cli(args,{sessionBound=true,allowFailure=false}={}){
 const r=await cmd('node',['bin/agent-device.mjs',...args,...(args[0]==='device'?[]:['--state-dir',process.env.AGENT_DEVICE_STATE_DIR]),'--json',...(sessionBound?['--platform','ios','--udid',udid,'--session',session]:[])],allowFailure);
 const data=JSON.parse(r.stdout||'{}');if(!allowFailure) assert.equal(data.success,true,JSON.stringify(data));return data;
}
const module=async(name)=>import(pathToFileURL(path.join(repo,'dist/src',name+'.js')));
try{
 assert.equal((await cmd('git',['rev-parse','HEAD'])).stdout.trim(),expectedSha);
 assert.equal((await cmd('git',['status','--porcelain'])).stdout.trim(),'');
 transcript.xcode=(await cmd('xcodebuild',['-version'])).stdout.trim();
 udid=(await cmd('xcrun',['simctl','create','agent-device-apple-tools-review','com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro','com.apple.CoreSimulator.SimRuntime.iOS-26-4'])).stdout.trim();
 transcript.device={id:udid,platform:'apple',appleOs:'ios',kind:'simulator',name:'iPhone 17 Pro',booted:true};await save();
 await cli(['daemon','stop','--clean'],{sessionBound:false});
 await cli(['prepare','ios-runner','--platform','ios','--udid',udid,'--timeout','420000'],{sessionBound:false});
 await cli(['apps','--all']);
 await cli(['open','com.apple.Preferences','--relaunch']);sessionOpen=true;
 await cli(['snapshot','-i']);
 await cli(['screenshot',path.join(output,'simctl.png'),'--screen-mask','black']);
 await cli(['close']);sessionOpen=false;
 await cli(['daemon','stop','--clean'],{sessionBound:false});
 const {createAppleInteractor}=await module('interactor');
 const {resolveAppleToolProvider,withAppleToolProvider}=await module('tool-provider-facade');
 const {resolveIosSimulatorDeepLinkBundleId}=await module('app-resolution-facade');
 runner=await module('runner-operations-facade');
 const {setAppleRunnerHostEnvironment,setRunnerLeaseOwnerStateDir}=await module('runner-owner-facade');
 setAppleRunnerHostEnvironment({env:process.env,cwd:repo});
 setRunnerLeaseOwnerStateDir(path.join(output,'direct-state'));
 const device=transcript.device;
 const local=resolveAppleToolProvider();
 const inventory=await local.simulatorApps.list(device,{timeoutMs:15000});
 assert.equal(inventory.type,'listed');assert(inventory.apps.some(x=>x.bundleId==='com.apple.Preferences'));
 transcript.observations.push({operation:'simulatorApps.list',count:inventory.apps.length,settingsFound:true});
 const info=await local.simulatorApps.readInfoPlist({device,bundleId:'com.apple.mobilesafari',timeoutMs:15000});
 assert.equal(info.CFBundleIdentifier,'com.apple.mobilesafari');
 const owner=await resolveIosSimulatorDeepLinkBundleId(device,'https://example.com',{timeoutMs:15000});
 assert.equal(owner,'com.apple.mobilesafari');transcript.observations.push({operation:'readInfoPlist/deepLinkOwner',bundleId:info.CFBundleIdentifier,owner});await save();
 const interactor=createAppleInteractor(device,{appBundleId:'com.apple.Preferences'},{env:process.env,cwd:repo});
 await interactor.open('com.apple.Preferences');
 const snapshot=await interactor.snapshot({appBundleId:'com.apple.Preferences'});assert.equal(snapshot.backend,'xctest');assert(snapshot.nodes.length>0);
 transcript.observations.push({operation:'snapshot',backend:snapshot.backend,nodeCount:snapshot.nodes.length});await save();
 await withAppleToolProvider({...local,simulatorScreenshotBackend:'runner'},async()=>{
  await interactor.screenshot(path.join(output,'runner.png'),{appBundleId:'com.apple.Preferences'});
  await assert.rejects(interactor.screenshot(path.join(output,'refused-mask.png'),{screenMask:'black'}),{code:'UNSUPPORTED_OPERATION'});
 });
 for(const name of ['simctl.png','runner.png']){
  const bytes=await fs.readFile(path.join(output,name));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  transcript.observations.push({operation:'screenshot',name,bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});
 }
 await runner.stopAllIosRunnerSessions();
 const runnerBundle='com.callstack.agentdevice.runner';
 const fixturePath=path.join(process.env.AGENT_DEVICE_IOS_RUNNER_DERIVED_PATH,'Build','Products','Debug-iphonesimulator','AgentDeviceRunner.app');
 await cli(['install',fixturePath]);
 const container=await local.simulatorFiles.openContainer({device,bundleId:runnerBundle,containerType:'data',timeoutMs:15000});
 assert(container?.path);await fs.writeFile(path.join(container.path,'Documents','proof.bin'),Buffer.from([0,128,255]));
 await local.simulatorFiles.copyToHost({device,bundleId:runnerBundle,containerType:'data',sourcePath:'Documents/proof.bin',destinationPath:path.join(output,'proof.bin'),timeoutMs:15000});
 assert.deepEqual(await fs.readFile(path.join(output,'proof.bin')),Buffer.from([0,128,255]));
 await interactor.setSetting('clear-app-state','clear',runnerBundle);
 const entries=await fs.readdir(container.path);assert(entries.includes('Documents'));assert(!await fs.stat(path.join(container.path,'Documents','proof.bin')).then(()=>true,()=>false));
 transcript.observations.push({operation:'container-copy-and-clear',bytesMatched:true,cleared:true,entries});
 await cli(['reinstall',runnerBundle,fixturePath]);
 transcript.passed=true;await save();
}finally{
 if(runner)await runner.stopAllIosRunnerSessions().catch(e=>transcript.cleanup.push({error:String(e)}));
 if(udid){
  if(sessionOpen)await cli(['close','--shutdown'],{allowFailure:true});
  await cli(['daemon','stop','--clean'],{sessionBound:false,allowFailure:true});
  const status=await cli(['device','status','--platform','ios','--udid',udid],{sessionBound:false,allowFailure:true});transcript.cleanup.push({claims:status.data?.claims});
  await cmd('xcrun',['simctl','shutdown',udid],true);
  const deleted=await cmd('xcrun',['simctl','delete',udid],true);transcript.cleanup.push({simulatorDeleted:deleted.exit===0});
 }
 await save();
}
