import { Injectable } from '@nestjs/common';

interface RouteMetric {
  count: number;
  errors: number;
  durationTotalMs: number;
  durationMaxMs: number;
}

@Injectable()
export class SystemMetricsService {
  private readonly startedAt = new Date();
  private readonly routes = new Map<string, RouteMetric>();
  private activeRequests = 0;

  startRequest(): void {
    this.activeRequests += 1;
  }

  finishRequest(params: {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  }): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    const key = `${params.method.toUpperCase()} ${params.route}`;
    const metric = this.routes.get(key) ?? {
      count: 0,
      errors: 0,
      durationTotalMs: 0,
      durationMaxMs: 0,
    };
    metric.count += 1;
    metric.errors += params.statusCode >= 400 ? 1 : 0;
    metric.durationTotalMs += params.durationMs;
    metric.durationMaxMs = Math.max(metric.durationMaxMs, params.durationMs);
    this.routes.set(key, metric);
  }

  snapshot() {
    const routes = [...this.routes.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([route, metric]) => ({
        route,
        requests: metric.count,
        errors: metric.errors,
        average_duration_ms:
          metric.count > 0
            ? Number((metric.durationTotalMs / metric.count).toFixed(2))
            : 0,
        max_duration_ms: Number(metric.durationMaxMs.toFixed(2)),
      }));

    return {
      service: 'maya-saas-backend',
      started_at: this.startedAt.toISOString(),
      uptime_seconds: Math.floor(
        (Date.now() - this.startedAt.getTime()) / 1000,
      ),
      active_requests: this.activeRequests,
      routes,
    };
  }
}
