// Track at spawn time: a failed spawn emits error/close, but need not emit exit.
export function trackOwnedChild(child) {
  let settled = false;
  const finished = new Promise((resolve) => {
    const done = () => {
      settled = true;
      resolve();
    };
    child.once('close', done);
    child.once('error', done);
  });
  return async function stop({ graceMs = 5000, killWaitMs = 1000 } = {}) {
    if (settled || child.exitCode !== null || child.signalCode !== null) return;
    const wait = async (ms) => {
      let timer;
      try {
        await Promise.race([
          finished,
          new Promise((resolve) => {
            timer = setTimeout(resolve, ms);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    child.kill('SIGTERM');
    await wait(graceMs);
    if (settled || child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGKILL');
    await wait(killWaitMs);
    if (!settled && child.exitCode === null && child.signalCode === null)
      throw new Error('owned_child_cleanup_unconfirmed');
  };
}
