import json, os, socket, subprocess
from pathlib import Path
root=Path('/private/tmp/agent-device-review2/android-live')
sdk=Path('/Users/muvaf/Library/Android/sdk')
avdhome=root/'avd'
avd=avdhome/'AgentDeviceReview4194.avd'
avd.mkdir(parents=True,exist_ok=True)
for port in (5588,5589):
 s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('127.0.0.1',port));s.close()
config={
 'AvdId':'AgentDeviceReview4194','avd.ini.displayname':'Agent Device Review 4194',
 'avd.ini.encoding':'UTF-8','PlayStore.enabled':'true','abi.type':'arm64-v8a',
 'image.sysdir.1':'system-images/android-36.1/google_apis_playstore/arm64-v8a/',
 'target':'android-36.1','tag.id':'google_apis_playstore','tag.display':'Google Play',
 'hw.cpu.arch':'arm64','hw.cpu.ncore':'2','hw.ramSize':'2048','vm.heapSize':'256',
 'hw.lcd.width':'720','hw.lcd.height':'1280','hw.lcd.density':'320',
 'hw.gpu.enabled':'yes','hw.gpu.mode':'auto','hw.keyboard':'yes','hw.mainKeys':'no',
 'disk.dataPartition.size':'3G','hw.sdCard':'no','fastboot.forceColdBoot':'yes',
 'hw.camera.back':'none','hw.camera.front':'none','showDeviceFrame':'no',
}
(avd/'config.ini').write_text(''.join(f'{k}={v}\n' for k,v in config.items()))
(avdhome/'AgentDeviceReview4194.ini').write_text(f'avd.ini.encoding=UTF-8\npath={avd}\npath.rel=AgentDeviceReview4194.avd\ntarget=android-36.1\n')
env=os.environ|{'ANDROID_HOME':str(sdk),'ANDROID_SDK_ROOT':str(sdk),'ANDROID_AVD_HOME':str(avdhome)}
cmd=[str(sdk/'emulator/emulator'),'-avd','AgentDeviceReview4194','-port','5588','-wipe-data','-no-window','-no-audio','-no-boot-anim','-no-snapshot','-gpu','swiftshader_indirect']
with (root/'emulator.log').open('w') as log:
 p=subprocess.Popen(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
record={'pid':p.pid,'serial':'emulator-5588','avd':str(avd),'avdHome':str(avdhome),'command':cmd}
(root/'emulator-owned.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
