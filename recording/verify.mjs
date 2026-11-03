import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const root='/private/tmp/agent-device-review2-recording';
const platform=process.argv[2];
assert.ok(['android','ios'].includes(platform));
const out='/private/tmp/agent-device-review2/recording-live/'+platform;
await fs.mkdir(out,{recursive:true});
const require=createRequire(root+'/package.json');
const credentials=require('yaml').parse(await fs.readFile('/Users/muvaf/.lim/config.yaml','utf8'));
const sdkRequire=createRequire(await fs.realpath(root+'/node_modules/@limrun/api/package.json'));
const {WebSocket,WebSocketServer}=sdkRequire('ws');
const {Limrun}=await import(root+'/node_modules/@limrun/api/index.mjs');
const {createInstanceClient}=await import(root+'/node_modules/@limrun/api/'+(platform==='ios'?'ios-client.mjs':'instance-client.mjs'));
const api=new Limrun({apiKey:credentials['api-key'],...(credentials['api-endpoint']?{baseURL:credentials['api-endpoint']}: {})});
const resources=platform==='ios'?api.iosInstances:api.androidInstances;
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const initialStatus=execFileSync('git',['status','--porcelain=v1'],{cwd:root,encoding:'utf8'});
assert.equal(initialStatus,'');
const transcript=[],wire=[],proofs=[];
let instance,client,env,externalId,sessionOpen=false,proxy,failNextDownload=false,proxyOrigin,session='review2-recording-'+platform;
let sawUnexpectedFailure=false;
const stateDir=out+'/state';
const secretValues=()=>[credentials['api-key'],instance?.status?.token].filter(Boolean);
const redact=value=>secretValues().reduce((s,v)=>s.replaceAll(v,'[REDACTED]'),String(value)).replace(/([?&](?:token|access_token)=)[^&\s"<>]+/gi,'$1[REDACTED]');
const record=entry=>transcript.push({at:new Date().toISOString(),...entry});
const safe=value=>JSON.parse(redact(JSON.stringify(value)));
async function save(){
 await fs.writeFile(out+'/transcript.json',JSON.stringify(safe({sourceSha:sha,base:'a2c169fa5',platform,instanceId:instance?.metadata?.id,instanceSpec:instance?.spec,instanceState:instance?.status?.state,sourceUnchanged:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()===sha&&execFileSync('git',['status','--porcelain=v1'],{cwd:root,encoding:'utf8'})===initialStatus,transcript,wire,proofs}),null,2)+'\n');
}
function note(message){console.log(JSON.stringify({at:new Date().toISOString(),platform,...message}));}
function traceMessage(direction,data){
 try{
  const m=JSON.parse(data.toString());
  if(/^(start|stop)(Video)?Recording(Session)?(Result)?$/.test(m.type??'')||m.type==='error'){
   wire.push(safe({at:new Date().toISOString(),transport:'websocket',direction,message:m}));
  }
 }catch{}
}
async function startProxy(){
 const upstream=new URL(instance.status.apiUrl);
 const pairs=new Set();
 const server=http.createServer((req,res)=>{
  const suffix=req.url.startsWith('/api')?req.url.slice(4):req.url;
  const target=new URL(upstream.toString().replace(/\/$/,'')+suffix);
  const recordingFile=target.pathname.endsWith('/files')&&/recording_[a-z0-9_-]+\.mp4/.test(decodeURIComponent(target.search));
  const entry=recordingFile?{at:new Date().toISOString(),transport:'http',method:req.method,url:redact(`http://127.0.0.1:${server.address().port}${req.url}`),upstreamUrl:redact(target.toString())}:null;
  if(recordingFile&&failNextDownload){
   failNextDownload=false;entry.injected=true;entry.status=503;wire.push(entry);
   res.writeHead(503,{'content-type':'text/plain'});res.end('Injected one-shot download failure for PR4196 retry verification');return;
  }
  const forward=(target.protocol==='https:'?https:http).request(target,{method:req.method,headers:{...req.headers,host:target.host}},remote=>{
   if(entry){entry.status=remote.statusCode;wire.push(entry);}
   res.writeHead(remote.statusCode,remote.headers);remote.pipe(res);
  });
  forward.on('error',error=>{if(entry){entry.error=redact(error.message);wire.push(entry);}if(!res.headersSent)res.writeHead(502);res.end('Forwarding failed');});
  req.pipe(forward);
 });
 const wss=new WebSocketServer({noServer:true});
 server.on('upgrade',(req,socket,head)=>{
  const suffix=req.url.startsWith('/api')?req.url.slice(4):req.url;
  const target=new URL(upstream.toString().replace(/\/$/,'')+suffix);target.protocol=target.protocol==='https:'?'wss:':'ws:';
  wss.handleUpgrade(req,socket,head,downstream=>{
   const remote=new WebSocket(target);const pair={downstream,remote};pairs.add(pair);const queue=[];
   downstream.on('message',(data,isBinary)=>{traceMessage('client-to-server',data);if(remote.readyState===WebSocket.OPEN)remote.send(data,{binary:isBinary});else queue.push([data,isBinary]);});
   remote.on('open',()=>{for(const [data,isBinary] of queue)remote.send(data,{binary:isBinary});queue.length=0;});
   remote.on('message',(data,isBinary)=>{traceMessage('server-to-client',data);if(downstream.readyState===WebSocket.OPEN)downstream.send(data,{binary:isBinary});});
   remote.on('error',error=>{wire.push({at:new Date().toISOString(),transport:'proxy-error',message:redact(error.message)});downstream.close();});
   downstream.on('error',()=>remote.close());
   downstream.on('close',()=>{remote.close();pairs.delete(pair);});
   remote.on('close',()=>{downstream.close();pairs.delete(pair);});
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 proxyOrigin=`http://127.0.0.1:${server.address().port}/api`;
 return{close:async()=>{for(const p of pairs){p.downstream.terminate();p.remote.terminate();}wss.close();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
async function command(args,{expectFailure=false,scoped=true}={}){
 const full=[root+'/bin/agent-device.mjs',...args,'--state-dir',stateDir,...(scoped?['--session',session,'--platform',platform]:[]),'--json','--debug'];
 const at=new Date().toISOString();
 const child=spawn(process.execPath,full,{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const guard=setTimeout(()=>child.kill('SIGINT'),180000);
 const result=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}));});clearTimeout(guard);
 record({command:['node',...full],startedAt:at,...result,stdout:redact(stdout),stderr:redact(stderr),expectedFailure:expectFailure});await save();
 note({command:args,code:result.code,expectedFailure:expectFailure});
 if(expectFailure)assert.notEqual(result.code,0,'Injected download failure must fail the command');
 else assert.equal(result.code,0,redact(stderr||stdout));
 let parsed;try{parsed=JSON.parse(stdout);}catch{}
 return{...result,stdout,stderr,parsed};
}
function ownedMessages(type){return wire.filter(x=>x.transport==='websocket'&&x.direction==='client-to-server'&&x.message.type===type);}
function recordingId(message){return message.recordingId??message.payload?.recordingId;}
function outputUrl(id,base=instance.status.apiUrl){return platform==='ios'?`${base}/files?name=${encodeURIComponent('recording_'+id+'.mp4')}`:`${base}/files?path=${encodeURIComponent('/data/local/tmp/recordings/recording_'+id+'.mp4')}`;}
async function externalActive(label){
 if(platform==='android'){
  const response=await fetch(outputUrl(externalId),{headers:{Authorization:`Bearer ${instance.status.token}`},signal:AbortSignal.timeout(30000)});
  const body=await response.text();record({externalActive:{label,recordingId:externalId,method:'GET active recording file',status:response.status,body:redact(body)}});
  assert.equal(response.status,403,'Android active recording must remain protected until stopped');
 }
 const probeId='probe-'+Date.now()+'-'+Math.random().toString(16).slice(2,8);
 let rejected=false;
 try{await client.startRecordingSession({recordingId:probeId,quality:6});}
 catch(error){
  record({externalActive:{label,recordingId:externalId,method:'incompatible quality probe',probeId,rejected:true,error:redact(error.message)}});
  assert.match(error.message,/same quality|quality.*match|incompatible|quality.*active|concurrent.*quality/i);
  rejected=true;
 }
 if(!rejected){try{await client.stopRecordingSession(probeId);}finally{assert.fail('An incompatible-quality probe started; no quality5 recorder remained active');}}
 await save();
}
async function observableChange(label){
 if(platform==='android'){
  const r=await client.adbShell('am',['start','-a',label==='after-close'?'android.settings.DISPLAY_SETTINGS':'android.settings.SETTINGS']);
  assert.equal(r.exitCode,0);record({observableChange:label,sdk:'adbShell',result:r});
 }else{
  const r=await client.simctl(['ui','booted','appearance',label==='after-close'?'dark':'light']).wait();
  assert.equal(r.code,0);record({observableChange:label,sdk:'simctl',result:r});
 }
 await save();
}
async function probeVideo(name){
 const path=out+'/'+name;
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_name,width,height','-of','json',path],{encoding:'utf8'}));
 assert.ok(Number(probe.format.duration)>0);assert.ok(Number(probe.format.size)>0);assert.ok(probe.streams.some(x=>x.width>0&&x.height>0));
 record({file:name,probe});return probe;
}
try{
 instance=await resources.create({wait:true,metadata:{displayName:'agent-device PR4196 '+platform+' recording retry verification'},spec:{...(platform==='ios'?{clues:[{kind:'OSVersion',osVersion:'26'}]}:{}),hardTimeout:'45m',inactivityTimeout:'15m'}});
 await fs.writeFile(out+'/instance-private.json',JSON.stringify(instance,null,2),{mode:0o600});
 note({instance:instance.metadata.id,sourceSha:sha});record({instanceCreated:{id:instance.metadata.id,spec:instance.spec,state:instance.status.state}});await save();
 proxy=await startProxy();
 env={...process.env,LIMRUN_API_KEY:'',LIMRUN_KEEP_ALIVE:'1',PATH:'/private/tmp/agent-device-pnpm-bin:'+process.env.PATH,
  ...(platform==='ios'?{LIM_IOS_INSTANCE_URL:proxyOrigin,LIM_IOS_INSTANCE_TOKEN:instance.status.token}:{LIM_ANDROID_INSTANCE_URL:proxyOrigin,LIM_ANDROID_INSTANCE_TOKEN:instance.status.token,LIM_ANDROID_INSTANCE_ADB_URL:instance.status.adbWebSocketUrl})};
 record({transportInstrumentation:{proxyUrl:proxyOrigin,purpose:'Transparent recording control and download forwarding; inject one503 only when explicitly armed; no repository source changes.'}});
 client=await createInstanceClient({apiUrl:instance.status.apiUrl,token:instance.status.token,...(platform==='android'?{adbUrl:instance.status.adbWebSocketUrl}:{}),logLevel:'error'});
 if(platform==='android'){
  const runtime={};for(const prop of ['ro.build.version.release','ro.build.version.sdk','ro.product.model','ro.build.fingerprint']){const r=await client.adbShell('getprop',[prop]);assert.equal(r.exitCode,0);runtime[prop]=r.stdout.trim();}record({actualRuntime:runtime});
 }else{
  const r=await client.simctl(['list','devices','--json']).wait();assert.equal(r.code,0);record({actualRuntime:JSON.parse(r.stdout)});
 }
 await save();
 await command(['connect','limrun']);
 await command(['open',platform==='ios'?'com.apple.Preferences':'com.android.settings']);sessionOpen=true;
 await command(['screenshot',out+'/initial.png']);
 externalId=await client.startRecordingSession({recordingId:'external-'+platform+'-'+Date.now(),quality:5});
 record({sdk:'startRecordingSession',recordingId:externalId,quality:5});await save();
 await externalActive('before daemon recording');
 const startType=platform==='ios'?'startVideoRecordingSession':'startRecordingSession';
 const stopType=platform==='ios'?'stopVideoRecordingSession':'stopRecordingSession';
 await command(['record','start',out+'/normal.mp4']);
 await externalActive('after daemon record start');
 await command(['screenshot',out+'/during-normal.png']);
 await command(['record','stop']);
 await externalActive('after daemon record stop');
 await probeVideo('normal.mp4');
 await command(['record','start',out+'/retry.mp4']);
 const retryId=recordingId(ownedMessages(startType).at(-1).message);assert.ok(retryId);
 await command(['screenshot',out+'/during-retry.png']);
 failNextDownload=true;
 const failure=await command(['record','stop'],{expectFailure:true});
 assert.match(failure.stdout+failure.stderr,/503|Injected one-shot download failure/);
 await externalActive('after failed download');
 const stoppedBefore=ownedMessages(stopType).filter(x=>recordingId(x.message)===retryId).length;
 assert.equal(stoppedBefore,1);
 await command(['record','stop']);
 await externalActive('after record stop retry');
 const stoppedAfter=ownedMessages(stopType).filter(x=>recordingId(x.message)===retryId).length;
 assert.equal(stoppedAfter,1,'Retry must not send another remote stop');
 const downloads=wire.filter(x=>x.transport==='http'&&decodeURIComponent(x.url).includes('recording_'+retryId+'.mp4'));
 assert.equal(downloads.length,2);assert.equal(downloads[0].status,503);assert.equal(downloads[1].status,200);assert.equal(downloads[0].url,downloads[1].url);
 proofs.push({kind:'failed-download-retry',recordingId:retryId,stopRequestsBeforeRetry:stoppedBefore,stopRequestsAfterRetry:stoppedAfter,downloadAttempts:downloads,sameDownloadUrl:true,externalStillActive:true});
 await probeVideo('retry.mp4');
 await command(['record','start',out+'/close.mp4']);
 await externalActive('after cleanup recording start');
 await command(['screenshot',out+'/during-close.png']);
 const cleanupId=recordingId(ownedMessages(startType).at(-1).message);
 await command(['close']);sessionOpen=false;
 await externalActive('after session close cleanup');
 assert.equal(ownedMessages(stopType).filter(x=>recordingId(x.message)===cleanupId).length,1);
 proofs.push({kind:'close-cleanup',recordingId:cleanupId,remoteStops:1,externalStillActive:true});
 await probeVideo('close.mp4');
 await observableChange('after-close');
 await externalActive('after post-close visual change');
 const finalId=externalId;
 const url=await client.stopRecordingSession(externalId);externalId=undefined;
 record({sdk:'stopRecordingSession',recordingId:finalId,after:'all daemon start/stop/retry/close operations',downloadUrl:redact(url)});
 const response=await fetch(url,{headers:{Authorization:`Bearer ${instance.status.token}`},signal:AbortSignal.timeout(60000)});assert.equal(response.status,200);
 await pipeline(Readable.fromWeb(response.body),(await import('node:fs')).createWriteStream(out+'/external.mp4'));
 const externalProbe=await probeVideo('external.mp4');
 proofs.push({kind:'external-recording-isolation',recordingId:finalId,explicitStopSucceeded:true,downloadStatus:response.status,validMp4:true,probe:externalProbe});
 record({verification:'passed'});await save();
}catch(error){sawUnexpectedFailure=true;record({error:redact(error.stack??error)});await save();note({error:redact(error.message)});process.exitCode=1;}
finally{
 if(client&&externalId){try{await client.stopRecordingSession(externalId);record({externalCleanup:{recordingId:externalId,stopped:true}});externalId=undefined;}catch(error){record({externalCleanupError:redact(error.message)});sawUnexpectedFailure=true;}}
 client?.disconnect();
 if(env){
  if(sessionOpen){try{await command(['close']);sessionOpen=false;}catch(error){record({closeCleanupError:redact(error.message)});sawUnexpectedFailure=true;}}
  try{await command(['daemon','stop','--clean'],{scoped:false});record({daemonCleanup:'stopped'});}catch(error){record({daemonCleanupError:redact(error.message)});sawUnexpectedFailure=true;}
 }
 await proxy?.close();
 if(instance){
  try{
   await resources.delete(instance.metadata.id);let latest;const deadline=Date.now()+60000;
   do{latest=await resources.get(instance.metadata.id);if(latest.status.state==='terminated')break;await new Promise(r=>setTimeout(r,1000));}while(Date.now()<deadline);
   record({instanceCleanup:{id:instance.metadata.id,state:latest.status.state}});assert.equal(latest.status.state,'terminated');
  }catch(error){record({instanceCleanupError:redact(error.message)});sawUnexpectedFailure=true;}
 }
 await save();note({completed:true,unexpectedFailure:sawUnexpectedFailure,output:out});if(sawUnexpectedFailure)process.exitCode=1;
}
