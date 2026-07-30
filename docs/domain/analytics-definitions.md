# Analytics Definitions

## Common rules

- All metrics are calculated in the tenant/location timezone and explicit period `[start, end)`.
- Currency values are integer minor units and are not combined across currencies without an explicit FX policy.
- Completed booking is the default population for realized revenue/customer metrics.
- Cancelled/test/import-error records are excluded unless a metric explicitly says otherwise.
- Dimensions are provider, location, organization, tenant and platform; platform results require privileged aggregation.

## Financial metrics

| Metric | Definition |
|---|---|
| revenue | Sum of recognized completed-sale transaction amounts in the period, net of recorded refunds |
| gross profit | revenue minus direct service/product cost for the same recognized sales |
| net profit | gross profit minus attributable operating expenses under the tenant accounting policy |
| average check | recognized revenue divided by distinct completed paid orders/bookings; zero when denominator is zero |
| customer lifetime value | recognized customer revenue minus direct/refund cost over configured observation horizon; predictive LTV is a separate model |

## Customer metrics

| Metric | Definition |
|---|---|
| new customer | Customer whose first completed booking occurred in the selected period |
| returning customer | Customer with a completed booking in the period and at least one earlier completed booking |
| retained customer | Customer active in the comparison cohort who also completed the configured return event/window |
| loyal customer | Customer satisfying tenant rule, default at least 3 completed visits and at least 2 in trailing 90 days |
| lost customer | Previously completed customer with no completed visit for tenant-configured inactivity days |
| repeat rate | Customers with at least a second completed visit divided by customers eligible for the repeat window |

Thresholds and cohort windows are versioned tenant configuration so historical reports remain reproducible.

## Booking metrics

| Metric | Definition |
|---|---|
| booking conversion | Confirmed bookings divided by eligible booking starts/leads for the same source and attribution window |
| cancellation rate | Cancelled bookings divided by bookings confirmed for the measured service period |
| provider utilization | Booked service minutes divided by available bookable minutes after breaks/closures |

No-show is a separate status and metric; it is not silently merged into cancellation.

## Comparison

Percentage change is `(current - previous) / abs(previous)`. If previous is zero, return absolute delta and `percentage_change = null`, not infinity. Partial current periods compare against an equally elapsed previous period unless explicitly requested otherwise.

## Data quality

Every response includes source freshness, ownership source, excluded-record count and metric definition version. CRM reconciliation gaps must be visible, not treated as zero.
