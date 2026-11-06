import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
const root=process.cwd();
const out=root+'/.tmp/lifecycle-evidence';
await fs.mkdir(out,{recursive:true});
const env={...process.env,DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer',AGENT_DEVICE_IOS_RUNNER_DERIVED_PATH:out+'/derived'};
const udid=(await exec('xcrun',['simctl','create','Agent Device Lifecycle Verification','com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro','com.apple.CoreSimulator.SimRuntime.iOS-26-4'],{env})).stdout.trim();
const report={sha:(await exec('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim(),udid,steps:[]};
async function cli(name,args){
 const base=['--state-dir',out+'/state-local-ios','--json',...(args[0]==='daemon'?[]:['--session','local-lifecycle','--platform','ios','--udid',udid])];
 let result;try{const {stdout}=await exec('node',[root+'/bin/agent-device.mjs',...args,...base],{cwd:root,env,timeout:240000,maxBuffer:8e6});result=JSON.parse(stdout);}catch(e){if(e.stdout)result=JSON.parse(e.stdout);else throw e;}
 report.steps.push({name,result});await fs.writeFile(out+'/local-ios.json',JSON.stringify(report,null,2));console.log(name,result.success,result.error?.code??'');assert.equal(result.success,true,JSON.stringify(result.error));return result.data;
}
try{
 await cli('boot',['boot']);
 await cli('open',['open','com.apple.Preferences']);
 await cli('snapshot',['snapshot','-i']);
 const closed=await cli('close-shutdown',['close','--shutdown']);assert.equal(closed.shutdown.success,true);
 const inventory=JSON.parse((await exec('xcrun',['simctl','list','devices','-j'],{env})).stdout);
 const device=Object.values(inventory.devices).flat().find(d=>d.udid===udid);assert.equal(device.state,'Shutdown');
 report.steps.push({name:'native-state',state:device.state});await fs.writeFile(out+'/local-ios.json',JSON.stringify(report,null,2));
}finally{
 await cli('cleanup-close',['close','--shutdown']).catch(()=>{});
 await cli('daemon-stop',['daemon','stop','--clean']).catch(()=>{});
 await exec('xcrun',['simctl','shutdown',udid],{env}).catch(()=>{});
 await exec('xcrun',['simctl','delete',udid],{env});console.log('cleanup-deleted',udid);
}
