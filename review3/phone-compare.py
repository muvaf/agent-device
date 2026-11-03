import subprocess,json,pathlib,time,os,sys
mode=sys.argv[1]
assert mode in ['base','head']
repo=pathlib.Path('/private/tmp/agent-device-review3-base' if mode=='base' else '/Users/muvaf/github.com/callstack/agent-device')
root=pathlib.Path('/private/tmp/agent-device-review3/phone-comparison')/mode
root.mkdir(parents=True,exist_ok=True)
state=str(root/'state');udid=os.environ['PHONE_UDID']
expected='a2c169fa502a53f1f2a1da25b1cd16b9c731af39' if mode=='base' else 'ea3dbea24f2f71f631226c0ced937f7ab37cb505'
env=dict(os.environ,AGENT_DEVICE_STATE_DIR=state,AGENT_DEVICE_IOS_TEAM_ID=os.environ['AGENT_DEVICE_IOS_TEAM_ID'],AGENT_DEVICE_IOS_RUNNER_DERIVED_PATH=str(root/'derived'))
summary={'sha':expected,'device':'iPhone 14 Pro','os':'iOS 27.0.1 (24A446)','xcode':'27.1 (27A9269)','commands':[],'suites':{}}
def save(): (root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
def cli(label,args,session=None,ok=True):
 cmd=['node','bin/agent-device.mjs',*args,'--state-dir',state,'--json','--debug']
 if session:cmd+=['--platform','ios','--udid',udid,'--session',session]
 print(mode,label,flush=True);start=time.monotonic()
 r=subprocess.run(cmd,cwd=repo,env=env,capture_output=True,text=True,timeout=600)
 (root/(label+'.stdout')).write_text(r.stdout);(root/(label+'.stderr')).write_text(r.stderr)
 data=json.loads(r.stdout) if r.stdout.strip() else {}
 summary['commands'].append({'label':label,'command':cmd,'exitCode':r.returncode,'durationMs':round((time.monotonic()-start)*1000),'success':data.get('success')});save()
 if ok:assert r.returncode==0 and data.get('success'),(label,r.returncode,data)
 return data,r.returncode
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==expected
assert not subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=repo,text=True).strip()
try:
 cli('clean-start',['daemon','stop','--clean'])
 cli('prepare',['prepare','ios-runner','--platform','ios','--udid',udid,'--timeout','420000'])
 subprocess.run(['node','-e','0'],check=True,cwd=repo,env=env)
 for label,flow in [('stock','test/integration/replays/ios/device'),('scroll','/private/tmp/agent-device-review3/physical-scroll-lifecycle.ad')]:
  cli(label+'-normalize-open',['open','com.apple.Preferences','--foreground'],session='review3-normalize')
  cli(label+'-normalize-top',['scroll','top'],session='review3-normalize')
  cli(label+'-normalize-close',['close'],session='review3-normalize')
  data,code=cli(label,['test',flow,'--artifacts-dir',str(root/(label+'-artifacts')),'--reporter','junit:'+str(root/(label+'.xml'))],session='review3-'+label,ok=False)
  d=data.get('data',{})
  result={k:d.get(k) for k in ['total','passed','failed','skipped','durationMs']}
  result['exitCode']=code
  result['failures']=[{'code':f.get('error',{}).get('code'),'step':f.get('error',{}).get('details',{}).get('step'),'reason':f.get('error',{}).get('details',{}).get('reason'),'message':f.get('error',{}).get('message')} for f in d.get('failures',[])]
  result['snapshotBackends']=[x.get('snapshotDiagnostics',{}).get('stats',{}).get('backends') for x in d.get('tests',[])]
  summary['suites'][label]=result;save()
  if label=='scroll':assert code==0 and d.get('passed')==1 and d.get('failed')==0,result
finally:
 for session in ['review3-normalize','review3-stock','review3-scroll']:
  cli('final-close-'+session,['close'],session=session,ok=False)
 cleanup,_=cli('final-daemon-clean',['daemon','stop','--clean'],ok=False)
 summary['cleanupSucceeded']=cleanup.get('success') is True
 status,_=cli('final-device-status',['device','status','--platform','ios','--udid',udid],ok=False)
 summary['remainingClaims']=len(status.get('data',{}).get('claims',[]));save()
print(json.dumps({k:v for k,v in summary.items() if k!='commands'},indent=2),flush=True)
