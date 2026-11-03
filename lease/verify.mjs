import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  assert.ok(process.argv[i]?.startsWith('--') && process.argv[i + 1], 'Use --name value arguments');
  args.set(process.argv[i].slice(2), process.argv[i + 1]);
}
function required(name) {
  const value = args.get(name);
  assert.ok(value, `Missing --${name}`);
  return value;
}
const root = path.resolve(required('root'));
const expectedSha = required('expected-sha');
const label = required('label');
assert.match(label, /^[a-z0-9-]+$/);
const output = path.resolve(required('output'));
await fs.mkdir(output);
const stateDir = path.join(output, 'state');
const derived = path.join(output, 'derived');
const runnerLeaseDir = path.join(output, 'runner-leases');
const session = `lifecycle-${label}-${randomBytes(4).toString('hex')}`;
const simulatorName = args.get('simulator-name') ?? `agent-device-lifecycle-${label}`;
const developerDir = args.get('developer-dir') ?? '/Applications/Xcode-27.1.app/Contents/Developer';
const runtimeId = args.get('runtime') ?? 'com.apple.CoreSimulator.SimRuntime.iOS-26-4';
const deviceType = args.get('device-type') ?? 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro';
for (const key of Object.keys(process.env)) {
  if (key.startsWith('AGENT_DEVICE_')) delete process.env[key];
}
Object.assign(process.env, {
  DEVELOPER_DIR: developerDir,
  AGENT_DEVICE_STATE_DIR: stateDir,
  AGENT_DEVICE_IOS_RUNNER_DERIVED_PATH: derived,
  AGENT_DEVICE_IOS_RUNNER_LEASE_DIR: runnerLeaseDir,
  AGENT_DEVICE_IOS_RUNNER_IDLE_STOP_MS: '0',
  AGENT_DEVICE_LEASE_MIN_TTL_MS: '1000',
});
process.chdir(root);
const commands = [];
const calls = [];
const rounds = [];
const cleanup = [];
let udid;
let activeLease;
let client;
let opened = false;
let failure;
const config = { root, expectedSha, label, output, stateDir, derived, runnerLeaseDir, session, simulatorName, developerDir, runtimeId, deviceType };
async function save() {
  await fs.writeFile(path.join(output, 'transcript.json'), JSON.stringify({ config, commands, calls, rounds, cleanup }, null, 2));
}
function serializeError(error) {
  return { name: error.name, message: error.message, code: error.code, details: error.details, stack: error.stack };
}
async function command(file, argv, options = {}) {
  const start = new Date().toISOString();
  try {
    const result = await exec(file, argv, { cwd: root, env: process.env, maxBuffer: 8 * 1024 * 1024, timeout: 60000, ...options });
    commands.push({ command: [file, ...argv], start, end: new Date().toISOString(), exit: 0, ...result });
    await save();
    return result.stdout;
  } catch (error) {
    commands.push({ command: [file, ...argv], start, end: new Date().toISOString(), exit: error.code, stdout: error.stdout, stderr: error.stderr, error: serializeError(error) });
    await save();
    throw error;
  }
}
async function invoke(method, options, operation, timeoutMs = 180000) {
  const requestId = randomBytes(8).toString('hex');
  const requestOptions = { ...options, requestId };
  const start = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await operation({ ...requestOptions, signal: controller.signal });
    calls.push({ method, requestId, options: requestOptions, start, end: new Date().toISOString(), ok: true, result });
    await save();
    console.log(JSON.stringify({ method, requestId, ok: true }));
    return { result, requestId };
  } catch (error) {
    calls.push({ method, requestId, options: requestOptions, start, end: new Date().toISOString(), ok: false, error: serializeError(error) });
    await save();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function requestEvents(requestId) {
  const file = path.join(stateDir, 'sessions', session, 'requests', `${requestId}.ndjson`);
  const events = (await fs.readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.ok(events.length > 0);
  assert.ok(events.every(event => event.requestId === requestId), 'Only the named request supplies generation evidence');
  return events;
}
async function deviceState(phase) {
  const data = JSON.parse(await command('xcrun', ['simctl', 'list', 'devices', '--json']));
  const device = Object.values(data.devices).flat().find(value => value.udid === udid);
  const observation = { phase, at: new Date().toISOString(), device };
  await fs.appendFile(path.join(output, 'device-states.jsonl'), `${JSON.stringify(observation)}\n`);
  return device;
}
try {
  const sha = (await command('git', ['rev-parse', 'HEAD'])).trim();
  assert.equal(sha, expectedSha);
  assert.equal((await command('git', ['status', '--porcelain'])).trim(), '', 'Source must be clean');
  const runtimes = JSON.parse(await command('xcrun', ['simctl', 'list', 'runtimes', '--json']));
  const runtime = runtimes.runtimes.find(value => value.identifier === runtimeId);
  assert.ok(runtime?.isAvailable, 'Requested simulator runtime must be available');
  config.runtime = { identifier: runtime.identifier, version: runtime.version, buildversion: runtime.buildversion };
  config.xcode = (await command('xcodebuild', ['-version'])).trim();
  udid = (await command('xcrun', ['simctl', 'create', simulatorName, deviceType, runtimeId])).trim();
  config.udid = udid;
  const { createAgentDeviceClient } = await import(pathToFileURL(path.join(root, 'dist/src/index.js')));
  const selection = { platform: 'ios', udid };
  const common = {
    stateDir, session, cwd: root, debug: true,
    tenant: `proof-${label}`,
    clientId: `proof-${label}`,
    leaseBackend: 'ios-simulator',
    deviceKey: `ios:mobile:${udid}`,
    iosXctestDerivedDataPath: derived,
  };
  const admin = createAgentDeviceClient(common);
  async function runnerLease() {
    for (const name of await fs.readdir(runnerLeaseDir).catch(() => [])) {
      if (!name.endsWith('.json')) continue;
      const value = JSON.parse(await fs.readFile(path.join(runnerLeaseDir, name), 'utf8'));
      if (value.deviceId === udid) {
        const { runnerToken, ...safe } = value;
        return safe;
      }
    }
  }
  function listening(port) {
    return new Promise(resolve => {
      const socket = net.connect({ host: '127.0.0.1', port });
      let done = false;
      const finish = result => { if (!done) { done=true; socket.destroy(); resolve(result); } };
      socket.setTimeout(1000);
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.once('timeout', () => finish(false));
    });
  }
  function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
  async function observe(phase, generation, shouldRun, daemonShouldRun = true) {
    const deadline = Date.now() + 20000;
    let value;
    do {
      const lease = await runnerLease();
      value = { phase, at: new Date().toISOString(), lease, listening: await listening(generation.port), runnerProcessAlive: alive(generation.runnerPid), daemonAlive: alive(generation.ownerPid) };
      if (value.listening === shouldRun && (shouldRun ? lease?.sessionId === generation.sessionId : !lease)) break;
      await new Promise(resolve => setTimeout(resolve, 300));
    } while (Date.now() < deadline);
    rounds.push(value); await save();
    assert.equal(value.listening, shouldRun, phase + ': listener');
    assert.equal(Boolean(value.lease), shouldRun, phase + ': runner lease file');
    assert.equal(value.daemonAlive, daemonShouldRun, phase + ': daemon liveness');
  }
  async function served(mode) {
    const prepared = await invoke('command.prepare:' + mode, { ...selection, action: 'ios-runner', timeoutMs: 420000 }, options => client.command.prepare(options), 450000);
    assert.equal(typeof prepared.result.runner?.currentUptimeMs, 'number');
    const swipe = await invoke('interactions.swipe:' + mode, { ...selection, from: {x: 200, y: 600}, to: {x: 200, y: 350} }, options => client.interactions.swipe(options));
    const events = await requestEvents(swipe.requestId);
    assert.ok(events.some(event => event.phase === 'ios_runner_command_send' && event.data?.command !== 'health'), 'Successful routed swipe must send a native runner command');
    const generation = await runnerLease();
    assert.ok(generation?.sessionId);
    rounds.push({ mode, servedRequestId: swipe.requestId, servedEvents: events.filter(event => event.phase.startsWith('ios_runner')), generation });
    await save();
    return generation;
  }
  for (const mode of ['release', 'expiry', 'shutdown', 'nonretained', 'daemon-shutdown']) {
    const runId = `${label}-${mode}`;
    const retainOnClose = mode !== 'nonretained';
    const allocated = await invoke('leases.allocate:' + mode, { ...selection, tenant: common.tenant, clientId: common.clientId, runId, leaseBackend: common.leaseBackend, deviceKey: common.deviceKey, ttlMs: 600000, retainOnClose }, options => admin.leases.allocate(options));
    activeLease = allocated.result;
    client = createAgentDeviceClient({ ...common, runId, leaseId: activeLease.leaseId });
    await invoke('devices.boot:' + mode, selection, options => client.devices.boot(options));
    await invoke('apps.open:' + mode, { ...selection, app: 'com.apple.Preferences' }, options => client.apps.open(options));
    opened = true;
    const generation = await served(mode);
    await invoke('sessions.close:' + mode, { ...selection, ...(mode === 'shutdown' ? { shutdown: true } : {}) }, options => client.sessions.close(options));
    opened = false;
    const sessions = await invoke('sessions.list:' + mode, {}, options => admin.sessions.list(options));
    assert.equal(sessions.result.length, 0, 'No session survives close');
    if (mode === 'nonretained' || mode === 'shutdown') {
      await observe(mode + ':after-close', generation, false);
      await deviceState(mode + ':after-close');
      const release = await invoke('leases.release:' + mode, { leaseId: activeLease.leaseId }, options => client.leases.release(options));
      assert.equal(release.result.released, mode === 'shutdown');
      activeLease = undefined;
    } else {
      await observe(mode + ':retained-after-close', generation, true);
      await invoke('leases.heartbeat:' + mode, { leaseId: activeLease.leaseId, ttlMs: mode === 'expiry' ? 2000 : 600000 }, options => client.leases.heartbeat(options));
      if (mode === 'release') {
        await invoke('apps.open:reopen', { ...selection, app: 'com.apple.Preferences' }, options => client.apps.open(options));
        opened = true;
        const reopened = await served('reopened');
        assert.equal(reopened.sessionId, generation.sessionId, 'Reopen reuses retained runner generation');
        await invoke('sessions.close:reopened', selection, options => client.sessions.close(options));
        opened = false;
        await invoke('leases.release:after-second-close', { leaseId: activeLease.leaseId }, options => client.leases.release(options));
        activeLease = undefined;
        await observe('release:daemon-stays-running', generation, false);
      } else if (mode === 'expiry') {
        await observe('expiry:daemon-stays-running', generation, false);
        activeLease = undefined;
      } else {
        await command(process.execPath, [path.join(root, 'bin/agent-device.mjs'), 'daemon', 'stop', '--state-dir', stateDir]);
        await observe('graceful-daemon-shutdown', generation, false, false);
        activeLease = undefined;
      }
    }
  }
  assert.equal((await command('git', ['rev-parse', 'HEAD'])).trim(), expectedSha);
  assert.equal((await command('git', ['status', '--porcelain'])).trim(), '');
} catch (error) {
  failure = serializeError(error);
  console.error(JSON.stringify(failure, null, 2));
} finally {
  if (client && opened) {
    try {
      await invoke('sessions.close:cleanup', { platform: 'ios', udid, shutdown: true }, options => client.sessions.close(options));
      cleanup.push({ action: 'session-close', ok: true });
    } catch (error) {
      cleanup.push({ action: 'session-close', ok: false, error: serializeError(error) });
    }
  }
  if (client && activeLease) {
    try {
      await invoke('leases.release:cleanup', { leaseId: activeLease.leaseId }, options => client.leases.release(options));
      cleanup.push({ action: 'lease-release', ok: true });
    } catch (error) {
      cleanup.push({ action: 'lease-release', ok: false, error: serializeError(error) });
    }
  }
  try {
    await command(process.execPath, [path.join(root, 'bin/agent-device.mjs'), 'daemon', 'stop', '--state-dir', stateDir, '--clean']);
    cleanup.push({ action: 'daemon-stop-clean', ok: true });
  } catch (error) {
    cleanup.push({ action: 'daemon-stop-clean', ok: false, error: serializeError(error) });
  }
  if (udid) {
    try {
      await command('xcrun', ['simctl', 'delete', udid]);
      cleanup.push({ action: 'simulator-delete', udid, ok: true });
    } catch (error) {
      cleanup.push({ action: 'simulator-delete', udid, ok: false, error: serializeError(error) });
    }
  }
  for (const name of ['daemon.log', 'daemon-shutdown.json']) {
    await fs.copyFile(path.join(stateDir, name), path.join(output, name)).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  await fs.cp(path.join(stateDir, 'sessions'), path.join(output, 'diagnostics'), { recursive: true }).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  await save();
  const passed = !failure && cleanup.every(item => item.ok);
  const summary = { ...config, passed, failure, observations: rounds, cleanup };
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ label, passed, summary: path.join(output, 'summary.json') }));
  process.exitCode = passed ? 0 : 1;
}
