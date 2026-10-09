// Owned browser child only. Never receives provider credentials or fabricates replies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { coreBackend } from './core-conversation-source.mjs';
import { trackOwnedChild } from './owned-child-cleanup.mjs';

export async function startCoreReactBridge(input) {
  const child = spawn(
    process.execPath,
    [
      path.resolve(
        coreBackend,
        '../maya-carrier-react/test/core-conversation-browser-probe.mjs',
      ),
    ],
    {
      cwd: coreBackend,
      env: {
        PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',
        TZ: 'UTC',
        TMPDIR: '/tmp',
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  );
  const stop = trackOwnedChild(child);
  let sequence = 0,
    closed = false;
  const pending = new Map();
  const rejectAll = () => {
    closed = true;
    for (const row of pending.values()) {
      clearTimeout(row.timer);
      row.reject(new Error('core_ui_child_closed'));
    }
    pending.clear();
  };
  child.on('error', rejectAll);
  child.on('close', rejectAll);
  child.on('message', (message) => {
    if (!message || typeof message !== 'object') return;
    const row = pending.get(message.id);
    if (!row) return;
    clearTimeout(row.timer);
    pending.delete(message.id);
    if (message.ok === true) row.resolve(message.value);
    else
      row.reject(
        Object.assign(new Error('core_ui_operation_failed'), {
          observed: message.observed ?? null,
        }),
      );
  });
  const rpc = (command, value) =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error('core_ui_child_closed'));
        return;
      }
      const id = ++sequence;
      const timer = setTimeout(
        () => {
          pending.delete(id);
          reject(new Error('core_ui_operation_timeout'));
          void stop();
        },
        command === 'chat' ? 150000 : 45000,
      );
      pending.set(id, { resolve, reject, timer });
      child.send({ id, command, value }, (error) => {
        if (error) rejectAll();
      });
    });
  try {
    await rpc('start', input);
  } catch (error) {
    await stop();
    throw error;
  }
  return {
    open: async (caseId) => {
      assert.equal(typeof caseId, 'string');
      await rpc('open', { caseId });
    },
    chat: (prompt) => rpc('chat', { prompt }),
    closeDialog: () => rpc('close-dialog', {}),
    close: async () => {
      try {
        if (!closed) await rpc('finish', {});
      } finally {
        await stop();
        rejectAll();
      }
    },
  };
}
