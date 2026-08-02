export const FINANCE_DASHBOARD_WIDGETS = [
  'summary',
  'cash_accounts',
  'sales_types',
  'daily',
  'staff_results',
  'payroll',
  'plans',
] as const;

export type FinanceDashboardWidget = (typeof FINANCE_DASHBOARD_WIDGETS)[number];

export const DEFAULT_FINANCE_DASHBOARD_WIDGETS: FinanceDashboardWidget[] = [
  ...FINANCE_DASHBOARD_WIDGETS,
];
