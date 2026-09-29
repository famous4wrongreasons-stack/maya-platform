import type { ConfigService } from '@nestjs/config';

/** Matches the existing proof harness fence, including its foreign-worktree exclusion. */
export function widgetProofEnvironment(config: ConfigService): boolean {
  try {
    if (config.get<string>('NODE_ENV') !== 'test') return false;
    const db = new URL(config.get<string>('DATABASE_URL') ?? 'invalid:');
    const name = decodeURIComponent(db.pathname.slice(1));
    if (
      !['postgres:', 'postgresql:'].includes(db.protocol) ||
      db.hostname !== '127.0.0.1' ||
      !db.port ||
      [...db.searchParams.keys()].some((k) => k !== 'schema') ||
      name === 'maya_widget_gate_proof_local' ||
      /prod|clone|maya_saas|postgres/.test(name.toLowerCase())
    )
      return false;
    const ci =
      config.get<string>('CI') === 'true' &&
      config.get<string>('GITHUB_ACTIONS') === 'true' &&
      config.get<string>('WIDGET_GATEWAY_PG') === 'required';
    return ci
      ? name === 'maya_ci'
      : db.port !== '5432' && /^maya_widget_gate_proof_[a-z0-9_]+$/.test(name);
  } catch {
    return false;
  }
}
