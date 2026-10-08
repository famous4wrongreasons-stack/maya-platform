// Finite scratch supervisor adapted from the reviewed canonical-smoke launcher.
// Only the process group created by this exact spawn is signalled; no PID discovery.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function runOwnedStage(spec, env, output, control, evidence) {
  if (control.cancelled) throw new Error('owned_stage_cancelled_before_spawn');
  assert.ok(process.platform !== 'win32');
  assert.ok(Number.isSafeInteger(spec.timeoutMs) && spec.timeoutMs > 0 && spec.timeoutMs <= 720000);
  assert.equal(control.terminateActive, null);
  const fd = fs.openSync(path.join(output, spec.name + '.log'), 'wx', 0o600);
  let child = null, pgid = null, closed = false, childError = null;
  let closeResolve;
  const close = new Promise((resolve) => { closeResolve = resolve; });
  let interruptResolve;
  const interrupted = new Promise((resolve) => { interruptResolve = resolve; });
  let interruption = null, timer = null, stopPromise = null;
  evidence.groups ??= {};
  evidence.groups[spec.name] = {
    detached: true, pid: null, pgid: null, closed: false, groupAbsent: false,
    exitCode: null, signal: null, error: null, termSent: false, killSent: false,
  };
  const state = evidence.groups[spec.name];
  const groupAlive = () => {
    if (pgid === null) return false;
    try { process.kill(-pgid, 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  };
  const signalGroup = (signal) => {
    if (!groupAlive()) return;
    try {
      process.kill(-pgid, signal);
      state[signal === 'SIGTERM' ? 'termSent' : 'killSent'] = true;
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  const waitGone = async (ms) => {
    const deadline = performance.now() + ms;
    do {
      state.groupAbsent = !groupAlive();
      if (closed && state.groupAbsent) return true;
      await sleep(Math.min(25, Math.max(1, deadline - performance.now())));
    } while (performance.now() < deadline);
    state.groupAbsent = !groupAlive();
    return closed && state.groupAbsent;
  };
  const stop = () => {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      if (child === null) return; // synchronous spawn refusal created no child
      if (closed && !groupAlive()) { state.groupAbsent = true; return; }
      signalGroup('SIGTERM');
      if (!await waitGone(3000)) {
        signalGroup('SIGKILL');
        assert.ok(await waitGone(1000), 'owned_owned_stage_group_cleanup_unconfirmed');
      }
      assert.ok(state.closed && state.groupAbsent, 'owned_owned_stage_group_cleanup_unconfirmed');
    })();
    return stopPromise;
  };
  const interrupt = (reason = control.cancelled ?? 'owned_stage_interrupted') => {
    if (interruption !== null) return;
    interruption = reason;
    interruptResolve(reason);
  };
  control.terminateActive = interrupt;
  try {
    try {
      child = spawn(spec.command, spec.args, {
        cwd: spec.cwd, env: { ...env, ...spec.env }, detached: true, stdio: ['ignore', fd, fd],
      });
      // Listeners are registered immediately; callbacks perform no file I/O.
      child.on('error', (error) => { childError = error; state.error = error.message; });
      child.once('close', (code, signal) => {
        closed = true; state.closed = true; state.exitCode = code; state.signal = signal;
        closeResolve();
      });
      if (child.pid !== undefined) {
        assert.ok(Number.isSafeInteger(child.pid) && child.pid > 1, 'owned_owned_stage_pid_invalid');
        pgid = child.pid; state.pid = child.pid; state.pgid = pgid;
      }
    } finally { fs.closeSync(fd); }
    timer = setTimeout(() => interrupt('owned_stage_timeout'), spec.timeoutMs);
    await Promise.race([close, interrupted]);
    if (interruption !== null) throw new Error(interruption);
    if (childError !== null) throw childError;
    assert.equal(state.exitCode, 0, `canonical_owned_stage_exit_${state.exitCode}_${state.signal}`);
  } finally {
    clearTimeout(timer);
    // Even a normal smoke exit is insufficient while a member of its group lives.
    try { await stop(); }
    finally { if (control.terminateActive === interrupt) control.terminateActive = null; }
  }
  if (control.cancelled || interruption) throw new Error(control.cancelled ?? interruption);
}

