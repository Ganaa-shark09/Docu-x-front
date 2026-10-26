export interface WorkflowNotification {
  uuid: string;
  notification_type: string;
  status: string;
  priority: string;
  title: string;
  message: string;
  resource_type: string;
  resource_uuid: string;
  action_url: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
export function notificationPath(n: WorkflowNotification): string | null {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n.resource_uuid))
    return null;
  const base: Record<string, string> = {
    workflow_run: '/workflows/runs',
    document: '/documents/detail',
    approval_request: '/approvals',
    extraction_run: '/workflows/extractions',
  };
  return base[n.resource_type] ? `${base[n.resource_type]}/${n.resource_uuid}` : null;
}
