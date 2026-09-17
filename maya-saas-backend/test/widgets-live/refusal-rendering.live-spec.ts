// R3.9.3 at the route: every refusal renders as a `reason_text` minted from its own table row, and
// no error token reaches the client (P-RENDER, IR-REN-4).
//
// Integrator-owned, pipeline-wide (§2.1): the claim is about the RESPONSE the controller returns for
// any refusal, not about one gate, so it cannot live in a gate's own live spec. P-RENDER owns
// `src/widgets/rendering/**` and its BUILD ratchets; this file is the one place the rendered answer is
// read back over HTTP.
//
// REN-5 is `[XF→U8b]` by the card, and the reason is worth stating: while slots 8, 9 and 10 are
// `pending()`, a conformant submission refuses `mechanism_absent`, which has NO row in the table
// (D-10 keeps the code out until U8b removes it), so the phrase it mints is P10(b)'s honest-unknown
// fallback rather than the code's own. The control below is what makes the failing test meaningful:
// a refusal whose code DOES carry a row already mints from that row today, so REN-5's red is about
// `mechanism_absent` alone and not about the mechanism being absent.
//
// Class: [HTTP]. Not evidence by itself — §0.5's L needs a BIN entry and a production-minted record,
// which E1 supplies. What is proved here is that the member exists on the wire and is table-derived.

import request from 'supertest';

import { UserRole } from '../../src/common/domain.enums';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import { LIMITATION_REASON_TABLE } from '../../src/widget-contract/reason-table';
import { WidgetEmitterService } from '../../src/widgets/emission/emitter.service';
import { WidgetStoresService } from '../../src/widgets/stores/widget-stores.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import { Fixtures, type TenantFixture } from './support/fixtures';
import { bootHttp, type HttpHarness } from './support/http-bootstrap';

const conformant = (over: Record<string, unknown> = {}) => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: '00000000-0000-4000-8000-000000000101',
  intent_token: 'ren5-unknown-intent-token-00000000',
  inputs: null,
  client_nonce: 'ren5-nonce-0001',
  profile_id: 'pwa.default',
  ...over,
});

interface IntentResponse {
  readonly code: string | null;
  readonly reason_text: { phrase_key: string; rendered: string } | null;
  readonly stopped_at_gate: string | null;
}

describe('R3.9.3 — the refusal the route returns is rendered from the table [HTTP]', () => {
  let http: HttpHarness;
  let ctx: FixtureContext;
  let fx: Fixtures;
  /** The same builder, with the application's own writers, so REN-5 can reach a slot past Gate 1. */
  let writerFixtures: Fixtures;
  let tenant: TenantFixture;
  let token: string;

  const post = (body: unknown) =>
    request(http.app.getHttpServer())
      .post('/api/widgets/intent')
      .set('authorization', `Bearer ${token}`)
      .send(body as object);

  beforeAll(async () => {
    http = await bootHttp();
    ctx = await bootFixtureContext();
    fx = new Fixtures(ctx, null);
    tenant = await fx.tenant('REN-5');
    writerFixtures = new Fixtures(ctx, {
      stores: http.app.get(WidgetStoresService),
      emitter: http.app.get(WidgetEmitterService),
    });
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    await fx.grantFeature(tenant, 'widgets.runtime');
    token = await http.login(tenant.slug, user.email, user.password);
  });
  afterEach(() => {
    http.recorder.clear();
  });
  afterAll(async () => {
    await writerFixtures?.teardown();
    await fx?.teardown();
    await http?.close();
    await ctx?.close();
  });

  it('REN-5a [HTTP] control: a refusal whose code carries a row renders from THAT row, and the response carries no error token', async () => {
    const res = await post(conformant());
    const body = res.body as IntentResponse;
    expect(res.status).toBe(200);
    expect(body.stopped_at_gate).toBe('1');
    expect(body.code).toBe('EXPIRED');
    expect(body.reason_text?.phrase_key).toBe(
      LIMITATION_REASON_TABLE.EXPIRED.text_key,
    );
    expect(body.reason_text?.rendered.length).toBeGreaterThan(0);
    expect(body.reason_text?.rendered.length).toBeLessThanOrEqual(400);
    expect(body.reason_text?.rendered).not.toMatch(
      /ошибк|error|fail|сбо[йя]|недоступн.*попроб/i,
    );
    expect(JSON.stringify(body)).not.toMatch(
      /role="alert"|destructive|stack|Exception/,
    );
  });

  it.failing(
    'REN-5 [HTTP][XF→U8b] every refusal carries a reason_text minted from its OWN row, and no error token',
    async () => {
      // A record that gets past Gates 1-7 reaches slot 8, which refuses `mechanism_absent` — a code
      // with NO row until U8b removes it from `RefusalCode` (D-10). The phrase it mints is therefore
      // P10(b)'s honest-unknown fallback, and the equality below is exactly what says so. It turns
      // green in U8b's merge, when the code leaves and REN-3 turns green with it.
      const user = await fx.user(tenant, UserRole.ADMINISTRATOR, 'ren5');
      const actor = await fx.actorFromAccessToken(
        await http.login(tenant.slug, user.email, user.password),
      );
      const widget = await writerFixtures.widget({
        tenant,
        actor,
        kind: 'METRIC',
        body: { value: 1 },
      });
      const res = await post(
        conformant({
          widget_id: widget.widgetId,
          intent_token: widget.intentToken,
        }),
      );
      const body = res.body as IntentResponse;
      expect(res.status).toBe(200);
      expect(body.stopped_at_gate).toBe('8');
      expect(body.code).toBe('mechanism_absent');
      expect(body.reason_text).not.toBeNull();
      expect(
        Object.prototype.hasOwnProperty.call(
          LIMITATION_REASON_TABLE,
          body.code as string,
        ),
      ).toBe(true);
      expect(body.reason_text?.phrase_key).toBe(
        LIMITATION_REASON_TABLE[body.code as string].text_key,
      );
    },
  );
});
