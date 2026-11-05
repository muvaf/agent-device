import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const root='/Users/muvaf/github.com/callstack/agent-device-sync-upstream';
const out='/private/tmp/agent-device-review4-evidence';
const source='/Users/muvaf/.codex/worktrees/sync-install-only/limrun/test/e2e/fixtures-src';
const require=createRequire(root+'/package.json');
const config=require('yaml').parse(await fs.readFile('/Users/muvaf/.lim/config.yaml','utf8'));
const {default: Limrun}=await import(root+'/node_modules/@limrun/api/index.mjs');
const api=new Limrun({apiKey:config['api-key'],...(config['api-endpoint']?{baseURL:config['api-endpoint']}:{})});
const platform=process.argv[2];
const resource=platform==='ios'?api.xcodeInstances:api.gradleInstances;
const instance=await resource.create({wait:true,metadata:{displayName:'agent-device review changed-binary '+platform},spec:{region:'eu-north1',hardTimeout:'1h',inactivityTimeout:'20m'}});
await fs.writeFile(out+'/'+platform+'-builder-private.json',JSON.stringify(instance),{mode:0o600});
console.log('builder',instance.metadata.id);
const client=await resource.createClient({instance,logLevel:'error'});
const input=out+'/fixture-source-'+platform;
await fs.mkdir(input,{recursive:true});
await fs.cp(source+'/'+platform,input,{recursive:true});
if(platform==='android'){
 // A stored 128KiB resource makes both APKs large enough for the SDK's delta path.
 await fs.writeFile(input+'/padding.bin',Buffer.from(Array.from({length:131072},(_,i)=>(i*73+19)%256)));
}
const sourceFile=platform==='ios'?'main.swift':'MainActivity.java';
const original=await fs.readFile(input+'/'+sourceFile,'utf8');
const iosBuild=`set -eu
mkdir -p E2EFixture.app
xcrun -sdk iphonesimulator swiftc -O -parse-as-library -target arm64-apple-ios16.0-simulator main.swift -o E2EFixture.app/E2EFixture
cp Info.plist E2EFixture.app/Info.plist
codesign --force --sign - E2EFixture.app
tar -czf app.tar.gz E2EFixture.app`;
const androidBuild=`set -eu
TOOLS=$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)
JAR=$(find "$ANDROID_HOME/platforms" -name android.jar | sort -V | tail -1)
mkdir -p work/classes
javac --release 11 -classpath "$JAR" -d work/classes MainActivity.java
"$TOOLS/d8" --lib "$JAR" --release --output work work/classes/com/limrun/e2e/fixture/*.class
"$TOOLS/aapt2" link --manifest AndroidManifest.xml -I "$JAR" -o work/unsigned.apk
cp padding.bin work/padding.bin
(cd work && jar uf0 unsigned.apk classes.dex padding.bin)
"$TOOLS/zipalign" -f 4 work/unsigned.apk work/aligned.apk
"$TOOLS/apksigner" sign --ks debug.keystore --ks-pass pass:android --ks-key-alias e2e --out fixture.apk work/aligned.apk`;
try{
 for(const version of ['one','two']){
  await fs.writeFile(input+'/'+sourceFile,original.replace('E2E Fixture','Delta '+version));
  await client.sync(input,{watch:false});
  const run=client.run(platform==='ios'?iosBuild:androidBuild,{timeoutSeconds:600});
  run.stdout.on('data',b=>process.stdout.write(b));run.stderr.on('data',b=>process.stderr.write(b));
  if((await run).exitCode!==0)throw new Error('fixture build failed');
  const destination=out+'/fixtures/'+platform+'/'+version;await fs.mkdir(destination,{recursive:true});
  if(platform==='ios'){
   await client.pullFile('app.tar.gz',destination+'/app.tar.gz');
   execFileSync('tar',['-xzf',destination+'/app.tar.gz','-C',destination]);
  }else await client.pullFile('fixture.apk',destination+'/fixture.apk');
  console.log('PASS built',platform,version);
 }
}finally{await resource.delete(instance.metadata.id);console.log('deleted builder',instance.metadata.id);}
