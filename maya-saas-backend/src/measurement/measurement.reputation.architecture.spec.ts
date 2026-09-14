import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanReviewAuthority } from '../business-content/review-authority.architecture';
import { MEASUREMENT_SOURCE_KINDS } from './measurement.contract';
const source = readFileSync(
  join(__dirname, 'measurement.reputation.ts'),
  'utf8',
);

describe('C7 P05 permanent reputation owner boundaries', () => {
  it('retains the existing shared closed evidence contract', () => {
    expect(MEASUREMENT_SOURCE_KINDS.get('BusinessReview')).toContain(
      'reputation_review_query',
    );
    expect(MEASUREMENT_SOURCE_KINDS.get('NativeFeedbackRequest')).toContain(
      'reputation_native_query',
    );
  });
  it('has no review/native/business action, consent, provider or parallel revision writer', () => {
    expect(
      scanReviewAuthority('measurement/measurement.reputation.ts', source),
    ).toEqual([]);
    expect(source).not.toMatch(
      /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany|execute|dispatch|send)\s*\(/,
    );
    expect(source).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE\s+"|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE)\b/i,
    );
    expect(source).not.toMatch(
      /from ['"].*(?:action-engine|native-feedback|communication-delivery|encryption|openai|anthropic)[^'"]*['"]/,
    );
  });
  it('does not read review text, anonymous community or infer author from legacy PII', () => {
    expect(source).not.toMatch(
      /PublicCommunityComment|encryptedText|commentEncrypted|phoneHash|customerProfile|staffExternalId|userId/,
    );
    expect(source).toContain(
      'legacy_reviews_have_no_verified_client_or_appointment_authority',
    );
  });
  it('selects exact R08 current revision with stable first-response month and current retention', () => {
    expect(source).toContain('latest.version=q."latestResponseVersion"');
    expect(source).toContain('first.version=1');
    expect(source).toContain('latest."clientId"=q."clientId"');
    expect(source).toContain('a."mayaClientId"=q."clientId"');
    expect(source).toContain("q.state='RESPONDED'");
    expect(source).toContain('q."retentionUntil"<=observed.at');
    expect(source).toContain('WHERE valid AND NOT expired');
    expect(source).not.toMatch(
      /orderBy:.*version|version.*desc|MAX\(version\)/i,
    );
  });
  it('bounds source aggregate groups and metrics instead of retaining review copies', () => {
    expect(source).toContain('const MAX_SOURCES = 16');
    expect(source).toContain('LIMIT 34');
    expect(source).toContain('measurement_reputation_source_bound_exceeded');
    expect(source).toContain('GROUP BY source, period');
    expect(source).not.toMatch(
      /businessReview\.findMany|nativeFeedbackRevision\.findMany|sources:\s*rows\.map/,
    );
  });
});
