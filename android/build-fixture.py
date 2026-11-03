import hashlib,json,os,subprocess,zipfile
from pathlib import Path
root=Path('/private/tmp/agent-device-review2/android-live')
sdk=Path('/Users/muvaf/Library/Android/sdk')
jdk=Path('/Applications/Android Studio.app/Contents/jbr/Contents/Home')
bt=sdk/'build-tools/36.1.0'
repo=Path('/Users/muvaf/github.com/callstack/agent-device')
commands=[]
env=os.environ|{'JAVA_HOME':str(jdk),'PATH':str(jdk/'bin')+':'+os.environ['PATH']}
def run(args,cwd=None):
 args=[str(x) for x in args];print(' '.join(args),flush=True)
 r=subprocess.run(args,cwd=cwd,env=env,text=True,capture_output=True)
 commands.append({'command':args,'cwd':str(cwd) if cwd else None,'status':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 if r.returncode:raise RuntimeError(r.stdout+r.stderr)
try:
 for v in (1,2,3):
  d=root/'fixtures'/f'v{v}'
  for sub in ('classes','dex'): (d/sub).mkdir(parents=True,exist_ok=True)
  (d/'MainActivity.java').write_text('''package com.agentdevice.installerreview;
import android.app.Activity;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.TextView;
public class MainActivity extends Activity {
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  LinearLayout layout = new LinearLayout(this);
  layout.setOrientation(LinearLayout.VERTICAL);
  layout.setPadding(32, 64, 32, 32);
  android.widget.Button title = new android.widget.Button(this);
  title.setText("Installer review version '''+str(v)+'''");
  title.setTextSize(24);
  layout.addView(title);
  TextView message = new TextView(this);
  message.setText("Native Android install verification");
  message.setTextSize(18);
  layout.addView(message);
  setContentView(layout);
 }
}
''')
  (d/'AndroidManifest.xml').write_text('''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.agentdevice.installerreview"><application android:label="Installer Review" android:debuggable="true" android:theme="@android:style/Theme.Material.Light.NoActionBar"><activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>''')
  run([jdk/'bin/javac','--release','11','-classpath',sdk/'platforms/android-36/android.jar','-d',d/'classes',d/'MainActivity.java'])
  run([bt/'d8','--min-api','23','--classpath',sdk/'platforms/android-36/android.jar','--output',d/'dex',*list((d/'classes').rglob('*.class'))])
  run([bt/'aapt2','link','-o',d/'unsigned.apk','-I',sdk/'platforms/android-36/android.jar','--manifest',d/'AndroidManifest.xml','--min-sdk-version','23','--target-sdk-version','36','--version-code',str(v),'--version-name',str(v)])
  with zipfile.ZipFile(d/'unsigned.apk','a',zipfile.ZIP_DEFLATED) as z:z.write(d/'dex/classes.dex','classes.dex')
  run([bt/'zipalign','-f','4',d/'unsigned.apk',d/'aligned.apk'])
  run([bt/'apksigner','sign','--ks',repo/'android/snapshot-helper/debug.keystore','--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--out',d/'installer-review.apk',d/'aligned.apk'])
  run([bt/'apksigner','verify',d/'installer-review.apk'])
 with zipfile.ZipFile(root/'fixtures/source-v3.zip','w',zipfile.ZIP_DEFLATED) as z:z.write(root/'fixtures/v3/installer-review.apk','app/installer-review.apk')
 artifacts={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'fixtures').rglob('*') if p.suffix in ('.apk','.zip','.java','.xml')}
 (root/'fixture-sha256.json').write_text(json.dumps(artifacts,indent=2)+'\n')
finally:
 (root/'fixture-build-commands.json').write_text(json.dumps(commands,indent=2)+'\n')
