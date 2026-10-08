/** Local process-memory parameters only; no model budget, permit or authority.
 * No environment or filesystem is read, and no process is started here.
 */
function heap(value, minimum, maximum, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9][0-9]{1,3}$/.test(value))
    throw new Error('core_runner_resource_invalid');
  const number = Number(value);
  if (
    !Number.isSafeInteger(number) ||
    String(number) !== value ||
    number < minimum ||
    number > maximum
  )
    throw new Error('core_runner_resource_invalid');
  return number;
}

export function coreConversationResources(options = {}) {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some(
      (key) => !['nodeHeapMb', 'brokerHeapMb'].includes(key),
    )
  )
    throw new Error('core_runner_resource_invalid');
  const nodeHeapMb = heap(options.nodeHeapMb, 256, 3072, 3072);
  const brokerHeapMb = heap(options.brokerHeapMb, 32, 256, 256);
  return Object.freeze({
    nodeHeapMb,
    brokerHeapMb,
    nodeOptions: `--max-old-space-size=${nodeHeapMb}`,
    brokerNodeOptions: `--max-old-space-size=${brokerHeapMb}`,
  });
}
