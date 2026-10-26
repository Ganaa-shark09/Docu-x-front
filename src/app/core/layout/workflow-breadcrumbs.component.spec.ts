import { describe, expect, it } from 'vitest';
import { workflowBreadcrumbs } from './workflow-breadcrumbs.component';

describe('Workflow breadcrumb destinations', () => {
  it('keeps the canonical hub and run history reachable from a deep link', () => {
    expect(workflowBreadcrumbs('/workflows/runs/run-id?tab=output')).toEqual([
      { label: 'All Workflows', path: '/workflows' },
      { label: 'Workflow runs', path: '/workflows/runs' },
      { label: 'Run workspace', path: '/workflows/runs/run-id' },
    ]);
  });
  it('uses existing compliance collection and detail routes', () => {
    expect(
      workflowBreadcrumbs('/workflows/compliance/assessments/assessment-id').map((c) => c.path),
    ).toEqual([
      '/workflows',
      '/workflows/compliance',
      '/workflows/compliance/assessments',
      '/workflows/compliance/assessments/assessment-id',
    ]);
  });
  it('omits workflow breadcrumbs outside workflows', () => {
    expect(workflowBreadcrumbs('/documents/internal')).toEqual([]);
  });
});
