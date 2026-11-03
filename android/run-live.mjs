import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = '/private/tmp/agent-device-review2/android-live';
const repo = '/Users/muvaf/github.com/callstack/agent-device';
const expectedSha = '4d65affa7cddbb7ad0a3340a4dc36c12b9c13aea';
const sdk = '/Users/muvaf/Library/Android/sdk';
const adb = `${sdk}/platform-tools/adb`;
const serial = 'emulator-5588';
const session = 'android-installer-review4194';
const stateDir = `${root}/state`;
const tmpDir = `${root}/tmp`;
const packageName = 'com.agentdevice.installerreview';
const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, ANDROID_AVD_HOME: `${root}/avd`, AGENT_DEVICE_STATE_DIR: stateDir, TMPDIR: tmpDir };
const results = { expectedSha, serial, session, stateDir, steps: [], artifactsObserved: [] };
const commandsFile = `${root}/commands.ndjson`;
let client;
let monitor;
let step = 0;
const observed = new Set();
await fs.mkdir(tmpDir, { recursive: true });
await fs.mkdir(`${root}/commands`, { recursive: true });
await fs.writeFile(commandsFile, '');
async function save() { await fs.writeFile(`${root}/result.json`, JSON.stringify(results, null, 2) + '\n'); }
async function run(label, cmd, args, options = {}) {
  const id = `${String(++step).padStart(2, '0')}-${label}`;
  const start = Date.now();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: repo, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs ?? 600000);
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject);
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
    child.stdin.end(options.input);
  });
  await fs.writeFile(`${root}/commands/${id}.stdout`, result.stdout);
  await fs.writeFile(`${root}/commands/${id}.stderr`, result.stderr);
  const record = { id, command: [cmd, ...args], cwd: repo, code: result.code, signal: result.signal, durationMs: Date.now() - start };
  await fs.appendFile(commandsFile, JSON.stringify(record) + '\n');
  console.log(JSON.stringify(record));
  if (!options.allowFailure) assert.equal(result.code, 0, `${label}: ${result.stderr || result.stdout}`);
  return result;
}
async function call(label, options, action) {
  const start = Date.now();
  console.log(`SDK ${label} ${JSON.stringify(options)}`);
  const value = await action(options);
  const record = { kind: 'sdk', method: label, options, durationMs: Date.now() - start, result: value };
  results.steps.push(record);
  await fs.writeFile(`${root}/${label.replaceAll('.', '-')}-${results.steps.length}.json`, JSON.stringify(record, null, 2) + '\n');
  await save();
  return value;
}
async function probeTemps() {
  const entries = await fs.readdir(tmpDir);
  for (const entry of entries) {
    if (entry.startsWith('agent-device-archive-') || entry.startsWith('agent-device-source-')) {
      const p = path.join(tmpDir, entry);
      if (!observed.has(p)) { observed.add(p); results.artifactsObserved.push({ path: p, seenAt: new Date().toISOString() }); }
    }
  }
}
const selection = { platform: 'android', serial };
async function snapshot(version) {
  const r = await run(`snapshot-v${version}`, process.execPath, [`${repo}/bin/agent-device.mjs`, 'snapshot', '-i', '--json', '--platform', 'android', '--serial', serial, '--session', session, '--state-dir', stateDir]);
  const json = JSON.parse(r.stdout);
  assert.equal(json.success, true, JSON.stringify(json));
  assert.equal(json.data.androidSnapshot.backend, 'android-helper');
  assert.equal(json.data.androidSnapshot.helperVersion, results.packageVersion);
  // The native app title proves that the matching binary is running, not a launcher or stale version.
  assert.match(JSON.stringify(json.data), new RegExp(`Installer review version ${version}`, 'i'));
  results.steps.push({ kind: 'snapshot', version, backend: json.data.androidSnapshot.backend, helperVersion: json.data.androidSnapshot.helperVersion });
  await save();
}
async function verifyInstalled(version) {
  const inventory = await run(`package-v${version}`, adb, ['-s', serial, 'shell', 'dumpsys', 'package', packageName]);
  assert.match(inventory.stdout, new RegExp(`versionCode=${version}\\b`));
  const opened = await call('apps.open', { ...selection, app: packageName }, o => client.apps.open(o));
  assert.equal(opened.appId, packageName);
  const activity = await run(`activity-v${version}`, adb, ['-s', serial, 'shell', 'dumpsys', 'activity', 'activities']);
  assert.match(activity.stdout, /(?:topResumedActivity|mResumedActivity|ResumedActivity)[^\n]*com\.agentdevice\.installerreview\/\.MainActivity/);
  await snapshot(version);
}
try {
  results.actualSha = (await run('source-sha', 'git', ['rev-parse', 'HEAD'])).stdout.trim();
  assert.equal(results.actualSha, expectedSha);
  assert.equal((await run('tracked-source-status', 'git', ['status', '--porcelain', '--untracked-files=no'])).stdout.trim(), '');
  results.packageVersion = JSON.parse(await fs.readFile(`${repo}/package.json`, 'utf8')).version;
  for (const [key, val] of Object.entries(env)) process.env[key] = val;
  await run('clean-own-daemon', 'pnpm', ['clean:daemon']);
  const end = Date.now() + 240000;
  let booted = false;
  while (Date.now() < end) {
    const r = await run('wait-own-boot', adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], { allowFailure: true, timeoutMs: 10000 });
    if (r.code === 0 && r.stdout.trim() === '1') { booted = true; break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert.ok(booted, 'Owned emulator did not boot');
  await run('unlock-own-emulator', adb, ['-s', serial, 'shell', 'input', 'keyevent', '82']);
  await run('owned-device-properties', adb, ['-s', serial, 'shell', 'getprop']);
  const { createAgentDeviceClient } = await import(pathToFileURL(`${repo}/dist/src/index.js`).href);
  client = createAgentDeviceClient({ session, stateDir, debug: true });
  monitor = setInterval(() => { void probeTemps(); }, 20);

  const install = await call('apps.install', { ...selection, appPath: `${root}/fixtures/v1/installer-review.apk` }, o => client.apps.install(o));
  assert.equal(install.appId, packageName); assert.equal(install.package, packageName);
  await verifyInstalled(1);
  await run('create-private-directory', adb, ['-s', serial, 'shell', 'run-as', packageName, 'mkdir', '-p', 'files']);
  await run('create-pre-reinstall-marker', adb, ['-s', serial, 'shell', 'run-as', packageName, 'touch', 'files/pre-reinstall-marker']);
  await run('prove-pre-reinstall-marker', adb, ['-s', serial, 'shell', 'run-as', packageName, 'ls', 'files/pre-reinstall-marker']);

  const reinstall = await call('apps.reinstall', { ...selection, app: packageName, appPath: `${root}/fixtures/v2/installer-review.apk` }, o => client.apps.reinstall(o));
  assert.equal(reinstall.appId, packageName); assert.equal(reinstall.package, packageName);
  const removedMarker = await run('prove-reinstall-data-removed', adb, ['-s', serial, 'shell', 'run-as', packageName, 'ls', 'files/pre-reinstall-marker'], { allowFailure: true });
  assert.notEqual(removedMarker.code, 0); assert.match(removedMarker.stderr + removedMarker.stdout, /No such file or directory/);
  results.reinstallDataRemoved = true;
  await verifyInstalled(2);
  await run('create-post-reinstall-directory', adb, ['-s', serial, 'shell', 'run-as', packageName, 'mkdir', '-p', 'files']);
  await run('create-source-update-marker', adb, ['-s', serial, 'shell', 'run-as', packageName, 'touch', 'files/source-update-marker']);

  const source = await call('apps.installFromSource', { ...selection, source: { kind: 'path', path: `${root}/fixtures/source-v3.zip` } }, o => client.apps.installFromSource(o));
  assert.equal(source.packageName, packageName); assert.equal(source.appId, packageName); assert.equal(source.launchTarget, packageName);
  await probeTemps();
  assert.ok(results.artifactsObserved.length > 0, 'No materialization temporary directory was observed');
  for (const artifact of results.artifactsObserved) {
    const remains = await fs.stat(artifact.path).then(() => true, () => false);
    assert.equal(remains, false, `Temporary artifact remains: ${artifact.path}`);
    artifact.removedAfterInstall = true;
  }
  assert.ok(await fs.stat(`${root}/fixtures/source-v3.zip`));
  results.sourceArchivePreserved = true;
  await run('prove-source-install-preserves-data', adb, ['-s', serial, 'shell', 'run-as', packageName, 'ls', 'files/source-update-marker']);
  await verifyInstalled(3);
  results.passed = true;
} catch (error) {
  results.passed = false; results.error = { message: error.message, stack: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  if (monitor) clearInterval(monitor);
  await save();
  if (client) {
    try { await run('close-owned-session', process.execPath, [`${repo}/bin/agent-device.mjs`, 'close', '--shutdown', '--json', '--platform', 'android', '--serial', serial, '--session', session, '--state-dir', stateDir]); }
    catch (error) { results.closeError = error.message; }
  }
  try { await run('stop-own-daemon', process.execPath, [`${repo}/bin/agent-device.mjs`, 'daemon', 'stop', '--clean', '--json', '--state-dir', stateDir]); }
  catch (error) { results.daemonStopError = error.message; }
  // The serial belongs to the AVD created by setup-avd.py; no other device is terminated.
  const devices = await run('remaining-devices-before-cleanup', adb, ['devices', '-l'], { allowFailure: true });
  if (devices.stdout.includes(serial)) await run('stop-owned-emulator', adb, ['-s', serial, 'emu', 'kill'], { allowFailure: true });
  await new Promise(resolve => setTimeout(resolve, 1500));
  const final = await run('remaining-devices-after-cleanup', adb, ['devices', '-l'], { allowFailure: true });
  results.ownedEmulatorStopped = !final.stdout.includes(serial);
  await save();
}
