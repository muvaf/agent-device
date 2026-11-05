import json,os,subprocess
from pathlib import Path
root=Path('/private/tmp/agent-device-sync-review6-experiment')
evidence=Path('/private/tmp/agent-device-sync-review6')
source=Path('/Users/muvaf/github.com/callstack/agent-device-sync-upstream')
env={**os.environ,'PATH':'/private/tmp/agent-device-pnpm-bin:'+os.environ['PATH']}
license_test='scripts/__tests__/bundled-license-notices.test.ts'
cache_test='packages/provider-limrun/src/sync-cache.test.ts'
lookup_test='packages/platform-apple/src/launch-confirmation.test.ts'
notices='scripts/lib/bundled-license-notices.ts'
cache='packages/provider-limrun/src/sync-cache.ts'
original={p:subprocess.check_output(['git','show','HEAD:'+p],cwd=root) for p in [license_test,cache_test,lookup_test,notices,cache,'LICENSES/Apache-2.0.txt']}
results=[]
def put(p,data): (root/p).write_bytes(data if isinstance(data,bytes) else data.encode())
def newtest(p): put(p,(source/p).read_bytes())
def run(label,paths,pattern,expected,diagnostic=None):
 cmd=['pnpm','exec','vitest','run','--project','unit-core',*paths]
 if pattern:cmd+=['-t',pattern]
 with (evidence/(label+'.log')).open('w') as f:r=subprocess.run(cmd,cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT)
 text=(evidence/(label+'.log')).read_text()
 results.append({'case':label,'exitCode':r.returncode,'expectedExit':expected,'command':cmd})
 (evidence/'experiments.json').write_text(json.dumps(results,indent=2)+'\n')
 print(label,r.returncode,flush=True)
 assert r.returncode==expected, label
 if diagnostic:assert diagnostic in text,(label,'missing diagnostic')
 assert 'Test timed out' not in text,label
for p in [license_test,cache_test,lookup_test]:newtest(p)
run('focused-isolated',[license_test,cache_test,lookup_test],None,0)
# A checkout with CRLF in its retained Apache license used to break the assertion.
put('LICENSES/Apache-2.0.txt',original['LICENSES/Apache-2.0.txt'].replace(b'\r\n',b'\n').replace(b'\n',b'\r\n'))
put(license_test,original[license_test])
run('crlf-before',[license_test],'bundled xdelta',1,'apacheLicense.trim()')
newtest(license_test)
run('crlf-after',[license_test],'bundled xdelta',0)
put('LICENSES/Apache-2.0.txt',original['LICENSES/Apache-2.0.txt'])
# Keep the one copyright assertion but drop the remainder of the source notice.
mutant=original[notices].decode().replace("return notices + '\\n' + fs.readFileSync", "return notices.split('\\n').filter((line) => line.includes('Copyright 2016 Joshua MacDonald')).join('\\n') + '\\n' + fs.readFileSync")
assert mutant!=original[notices].decode();put(notices,mutant)
put(license_test,original[license_test]);run('truncated-notice-old-test',[license_test],'bundled xdelta',0)
newtest(license_test);run('truncated-notice-new-test',[license_test],'bundled xdelta',1,'sourceNotices.replaceAll')
put(notices,original[notices])
# Delete the current APK basis as if it were a removed resource.
mutant=original[cache].decode().replace('if (!stat && entry.name !== fileName)', 'if (!stat)')
assert mutant!=original[cache].decode();put(cache,mutant)
put(cache_test,original[cache_test]);run('pruned-apk-old-test',[cache_test],None,0)
newtest(cache_test);run('pruned-apk-new-test',[cache_test],None,1,'ENOENT')
put(cache,original[cache])
# Withhold the command-start notification while the production timeout remains frozen.
p=lookup_test;newtest(p);text=(root/p).read_text();assert 'if (count === 2) signalLookupStarted();' in text
put(p,text.replace('if (count === 2) signalLookupStarted();','if (count === 3) signalLookupStarted();'))
run('missing-lookup-notification',[p],'owner lookup is bounded as a whole',1,'Owner lookup did not start its second command')
newtest(p)
run('focused-isolated-restored',[license_test,cache_test,lookup_test],None,0)
print('All expected detections proved; production mutations restored.',flush=True)
