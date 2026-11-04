import subprocess,json,pathlib,time,os,sys
repo=pathlib.Path(sys.argv[1]);root=pathlib.Path(sys.argv[2]);expected=sys.argv[3]
root.mkdir(parents=True,exist_ok=True)
state=str(root/'state');udid=os.environ['PHONE_UDID']
env=dict(os.environ,AGENT_DEVICE_STATE_DIR=state,AGENT_DEVICE_IOS_RUNNER_DERIVED_PATH=str(root/'derived'))
summary={'sha':expected,'device':'iPhone 14 Pro','commands':[]}
def save(): (root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
def cli(label,args,session=None,ok=True):
 cmd=['node','bin/agent-device.mjs',*args,*([] if args[0]=='device' else ['--state-dir',state]),'--json','--debug']
 if session:cmd+=['--platform','ios','--udid',udid,'--session',session]
 print(label,flush=True);start=time.monotonic()
 r=subprocess.run(cmd,cwd=repo,env=env,capture_output=True,text=True,timeout=600)
 (root/(label+'.stdout')).write_text(r.stdout);(root/(label+'.stderr')).write_text(r.stderr)
 data=json.loads(r.stdout) if r.stdout.strip() else {}
 safe_cmd=[x.replace(udid,'<phone-udid>') for x in cmd]
 summary['commands'].append({'label':label,'command':safe_cmd,'exitCode':r.returncode,'durationMs':round((time.monotonic()-start)*1000),'success':data.get('success')});save()
 if ok:assert r.returncode==0 and data.get('success'),(label,r.returncode,data)
 return data,r.returncode
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==expected
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
status,_=cli('initial-device-status',['device','status','--platform','ios','--udid',udid])
assert not status.get('data',{}).get('claims'),status
try:
 cli('clean-start',['daemon','stop','--clean'])
 cli('prepare',['prepare','ios-runner','--platform','ios','--udid',udid,'--timeout','420000'])
 subprocess.run(['node','-e','0'],check=True,cwd=repo,env=env)
 cli('normalize-open',['open','com.apple.Preferences','--foreground'],session='apple-tools-normalize')
 cli('normalize-top',['scroll','top'],session='apple-tools-normalize')
 cli('normalize-close',['close'],session='apple-tools-normalize')
 data,_=cli('scroll',['test',str(pathlib.Path(__file__).with_name('physical-scroll-lifecycle.ad')),'--artifacts-dir',str(root/'artifacts'),'--reporter','junit:'+str(root/'results.xml')],session='apple-tools-phone')
 d=data.get('data',{});summary['result']={k:d.get(k) for k in ['total','passed','failed','skipped','durationMs']}
 summary['result']['snapshotBackends']=[x.get('snapshotDiagnostics',{}).get('stats',{}).get('backends') for x in d.get('tests',[])]
 save();assert d.get('passed')==1 and d.get('failed')==0,d
finally:
 for session in ['apple-tools-normalize','apple-tools-phone']:
  cli('final-close-'+session,['close'],session=session,ok=False)
 cleanup,_=cli('final-daemon-clean',['daemon','stop','--clean'],ok=False)
 summary['cleanupSucceeded']=cleanup.get('success') is True
 status,_=cli('final-device-status',['device','status','--platform','ios','--udid',udid],ok=False)
 summary['remainingClaims']=len(status.get('data',{}).get('claims',[]));save()
print(json.dumps({k:v for k,v in summary.items() if k!='commands'},indent=2),flush=True)
