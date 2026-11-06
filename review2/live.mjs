import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import Limrun from '@limrun/api';
const exec=promisify(execFile);
const root=process.cwd();
const out=root+'/.tmp/lifecycle-review-evidence';
await fs.mkdir(out,{recursive:true});
const apiKey=process.env.LIMRUN_API_KEY;
const env={...process.env,LIMRUN_API_KEY:apiKey,ANDROID_HOME:process.env.ANDROID_HOME};
for(const k of Object.keys(env)) if(/^LIM_(IOS|ANDROID)_INSTANCE_/.test(k)) delete env[k];
const api=new Limrun({apiKey});
const sha=(await exec('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();
const report={sha,startedAt:new Date().toISOString(),steps:[]};
async function save(){await fs.writeFile(out+'/live-'+(process.argv[2]??'all')+'.json',JSON.stringify(report,null,2));}
async function cli(platform,name,args,expected=true){
 const base=['--state-dir',out+'/state-'+platform,...(args[0]==='daemon'?[]:['--session','lifecycle-'+platform]),'--json'];
 let stdout; let exitCode=0;
 try{({stdout}=await exec('node',[root+'/bin/agent-device.mjs',...args,...base],{cwd:root,env,timeout:240000,maxBuffer:8e6}));}
 catch(e){stdout=e.stdout;exitCode=e.code;}
 let result;try{result=JSON.parse(stdout);}catch{throw new Error(name+' invalid JSON, exit '+exitCode+': '+String(stdout).slice(0,300));}
 report.steps.push({platform,name,exitCode,result});await save();
 console.log(platform,name,exitCode,result.success,result.error?.code??'');
 if(expected)assert.equal(result.success,true,JSON.stringify(result.error));else assert.equal(result.success,false);
 return result.data;
}
async function ended(resource,id){for(let i=0;i<40;i++){try{const x=await resource.get(id);if(x.status?.state==='terminated') return;}catch(e){if(e.status===404)return;throw e;}await new Promise(r=>setTimeout(r,500));}throw new Error('Instance not terminated '+id);}
for(const platform of (process.argv[2]?[process.argv[2]]:['android','ios'])){
 const resource=platform==='ios'?api.iosInstances:api.androidInstances;
 const owned=new Set();
 try{
 await cli(platform,'connect',['connect','limrun','--platform',platform]);
 await cli(platform,'shutdown-unallocated',['shutdown'],false);
 const first=await cli(platform,'boot',['boot']);
 const leaseId=first.id.split(':').at(-1);
 const listed=await resource.list({labelSelector:'provider=limrun,leaseId='+leaseId});
 const instances=listed.getPaginatedItems();assert.equal(instances.length,1);const id=instances[0].metadata.id;owned.add(id);
 assert.equal((await cli(platform,'boot-reuse',['boot'])).id,first.id);
 await cli(platform,'shutdown-delete',['shutdown']);await ended(resource,id);owned.delete(id);
 const second=await cli(platform,'boot-recreate',['boot']);assert.notEqual(second.id,first.id);
 const secondLease=second.id.split(':').at(-1);
 const next=(await resource.list({labelSelector:'provider=limrun,leaseId='+secondLease})).getPaginatedItems();assert.equal(next.length,1);const nextId=next[0].metadata.id;owned.add(nextId);
 await cli(platform,'open',['open',platform==='ios'?'com.apple.Preferences':'com.android.settings']);
 await cli(platform,'snapshot',['snapshot','-i']);
 await cli(platform,'shutdown-active-refusal',['shutdown'],false);
 await cli(platform,'close-shutdown',['close','--shutdown']);await ended(resource,nextId);owned.delete(nextId);
 report.steps.push({platform,name:'deletion-confirmed',instanceIds:[id,nextId]});await save();
 }finally{
 await cli(platform,'disconnect',['disconnect']).catch(e=>console.log('disconnect',e.message));
 await cli(platform,'daemon-stop',['daemon','stop','--clean']).catch(e=>console.log('daemon-stop',e.message));
 for(const id of owned){await resource.delete(id);await ended(resource,id);console.log('cleanup-deleted',id);}
 }
}
