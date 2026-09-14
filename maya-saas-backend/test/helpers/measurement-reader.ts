import { MeasurementReadService } from '../../src/measurement/measurement.read.service';
import { MeasurementReportReader } from '../../src/measurement/measurement.report';
import { presentMeasurement } from '../../src/measurement/measurement.presentation';
import {
  MeasurementIntent,
  MeasurementResult,
} from '../../src/measurement/measurement.contract';

/** Boundary double for pre-C7 consumer tests. Real membership/source/security proofs live in measurement/*.spec.ts. */
export const unavailableMeasurement = (
  query: { from?: string; to?: string } = {},
) => {
  const from = new Date(query.from ?? '2026-01-01T00:00:00Z');
  const to = new Date(query.to ?? '2026-01-02T00:00:00Z');
  const intent: MeasurementIntent = {
    kind: 'business_period',
    periodFrom: from,
    periodTo: to,
    asOf: new Date(),
    timezone: 'UTC',
    scope: {
      version: 1,
      capabilityKey: 'analytics.business.finance.read',
      branchIds: [],
      dimensions: {},
      sourceQuery: {},
    },
  };
  const result: MeasurementResult = {
    sources: [],
    dependencies: [],
    metrics: [
      {
        key: 'net_profit',
        dimensions: {},
        unit: 'status',
        currency: null,
        basis: 'confirmed_net',
        state: 'NOT_MEASURED',
        value: null,
        sourceRefs: [],
      },
    ],
    reasons: ['crm_finance_unavailable', 'refund_support_unknown'],
    completeness: 'NOT_MEASURED',
    qualification: 'UNQUALIFIED',
    attributionStatus: 'NOT_APPLICABLE',
    creditedExecutionId: null,
    creditedAttemptId: null,
  };
  return presentMeasurement('tenant-a', intent, result);
};
export function measurementReaderDouble() {
  return {
    viewer: jest.fn(() =>
      Promise.resolve({
        id: 'membership',
        role: 'tenant_owner',
        branchId: null,
      }),
    ),
    readPeriod: jest.fn(
      (
        _tenant: string,
        _user: string,
        _kind: string,
        query: { from: string; to: string },
      ) => Promise.resolve(unavailableMeasurement(query)),
    ),
    reputationMonths: jest.fn(() =>
      Promise.resolve({
        contract: 'c7.reputation-months/1',
        items: [],
        limitations: ['sources_and_scales_are_not_pooled'],
      }),
    ),
    reviewScope: jest.fn(() =>
      Promise.resolve({
        registryAllowed: true,
        branchId: undefined,
      }),
    ),
    teamGoals: jest.fn(() =>
      Promise.resolve({
        items: [],
        limitations: ['no_target_no_progress'],
      }),
    ),
  } as unknown as MeasurementReadService;
}
export function measurementReportDouble() {
  return {
    observe: jest.fn(() => Promise.resolve(unavailableMeasurement())),
    snapshot: jest.fn(() =>
      Promise.resolve({
        ...unavailableMeasurement(),
        mode: 'as_reported',
        revisionId: 'receipt',
        snapshotHash: 'a'.repeat(64),
        revision: 1,
        expiresAt: '2027-01-01T00:00:00Z',
      }),
    ),
  } as unknown as MeasurementReportReader;
}
