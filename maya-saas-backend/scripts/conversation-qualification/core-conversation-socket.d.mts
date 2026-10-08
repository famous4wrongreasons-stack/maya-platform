export type CoreSocketTarget = Readonly<{
  brokerUid: number;
  runnerUid: number;
  brokerSocket: Readonly<{ path: string; gid: number }>;
}>;
export type CoreSocketRequestInit = Pick<
  RequestInit,
  'method' | 'body' | 'headers' | 'signal' | 'redirect'
> & {
  timeoutMs?: number;
};
/** OS metadata only. Never creates, deletes, changes permissions or grants model authority. */
export function assertCoreSocket(
  target: CoreSocketTarget,
  options?: { beforeListen?: boolean },
): void;
/** Only string request bodies are accepted at runtime. Redirects are returned, never followed. */
export function socketRequest(
  target: CoreSocketTarget,
  route: '/status' | '/chat/completions' | '/finish',
  init?: CoreSocketRequestInit,
): Promise<Response>;
