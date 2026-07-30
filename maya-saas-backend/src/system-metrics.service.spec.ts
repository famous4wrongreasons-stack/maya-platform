import { SystemMetricsService } from './system-metrics.service';

describe('SystemMetricsService', () => {
  it('aggregates route templates without tenant or customer identifiers', () => {
    const metrics = new SystemMetricsService();
    metrics.startRequest();
    metrics.finishRequest({
      method: 'get',
      route: '/api/appointments/:id',
      statusCode: 200,
      durationMs: 12.5,
    });
    metrics.startRequest();
    metrics.finishRequest({
      method: 'GET',
      route: '/api/appointments/:id',
      statusCode: 500,
      durationMs: 22.5,
    });

    expect(metrics.snapshot()).toMatchObject({
      active_requests: 0,
      routes: [
        {
          route: 'GET /api/appointments/:id',
          requests: 2,
          errors: 1,
          average_duration_ms: 17.5,
          max_duration_ms: 22.5,
        },
      ],
    });
  });
});
