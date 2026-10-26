export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
export const RUN_STATUSES = [
  'draft',
  'queued',
  'processing',
  'review_required',
  'approval_required',
  'approved',
  'rejected',
  'exception',
  'completed',
  'failed',
  'cancelled',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export type StepType =
  | 'ai'
  | 'extraction'
  | 'validation'
  | 'rule'
  | 'human_review'
  | 'approval'
  | 'assignment'
  | 'integration'
  | 'processing'
  | 'notification'
  | 'terminal';
export type StepStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting' | 'cancelled';
export type Principal =
  | { user: number; department?: never; role?: never }
  | { user?: never; department?: number; role?: string };
export interface Assignment {
  user: number | null;
  department: number | null;
  role: string;
}
export interface Definition {
  uuid: string;
  name: string;
  code: string;
  description: string;
  workflow_type: string;
  department: number | null;
  is_active: boolean;
  latest_version: { uuid: string; number: number } | null;
  capabilities: { administer: boolean; start: boolean };
}
export interface DefinitionInput {
  name: string;
  code: string;
  description: string;
  workflow_type: string;
  department: number | null;
  is_active: boolean;
}
export interface StepInput {
  key: string;
  name: string;
  step_type: StepType;
  configuration: Record<string, Json>;
}
export interface StepDefinition extends StepInput {
  uuid: string;
}
export interface Transition {
  source: string;
  target: string;
  outcome: string;
}
export interface PublishInput {
  entry_step: string;
  steps: StepInput[];
  transitions: Transition[];
  allowed_document_types: string[];
  configuration: { max_attempts: number };
}
export interface Version {
  uuid: string;
  definition: number;
  number: number;
  entry_step: string;
  steps: StepDefinition[];
  transitions: Transition[];
  allowed_document_types: string[];
  configuration: Record<string, Json>;
}
export type Capability =
  | 'view'
  | 'cancel'
  | 'assign'
  | 'review'
  | 'approve'
  | 'reject'
  | 'resolve_exception'
  | 'comment'
  | 'administer'
  | 'request_changes';
export interface Run {
  uuid: string;
  definition_uuid: string;
  version_uuid: string;
  department: number | null;
  initiated_by: number | null;
  status: RunStatus;
  current_step: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_type: string;
  error_message: string;
  correlation_id: string;
  revision: number;
  documents: string[];
  capabilities: Record<Capability, boolean>;
}
export interface StepRun {
  uuid: string;
  key: string;
  step_type: StepType;
  status: StepStatus;
  started_at: string | null;
  completed_at: string | null;
  attempt: number;
  error_type: string;
  error_message: string;
  assignment: Assignment | null;
  approval_uuid: string | null;
}
export interface StartInput {
  version: string;
  documents: string[];
  idempotency_key: string;
}
export type CommandInput =
  | { action: 'cancel' }
  | { action: 'assign'; assignment: Principal }
  | { action: 'accept' | 'approve' | 'reject' | 'request_changes'; comment?: string }
  | { action: 'comment'; comment: string }
  | { action: 'resolve_exception'; exception: string; resolution: string; outcome?: 'exception' };
export type Command = CommandInput & { expected_revision: number; idempotency_key: string };
export interface Finding {
  uuid: string;
  step_run: number;
  /** Read-only backend step metadata; absent values must not grant review access. */
  step_key?: string;
  step_run_status?: StepStatus;
  category: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'accepted' | 'dismissed' | 'resolved';
  title: string;
  description: string;
  data: Json;
  confidence: number | null;
  evidence: Json[];
  review_state: 'unreviewed' | 'reviewed';
  owner: number | null;
}
export type FindingDecision = 'accepted' | 'dismissed' | 'resolved';
export interface Exception {
  uuid: string;
  step_run: number;
  category: string;
  status: 'open' | 'resolved';
  safe_message: string;
  owner: number | null;
  resolved_by: number | null;
  resolved_at: string | null;
  resolution: string;
}
export interface WorkflowComment {
  uuid: string;
  step_run: number | null;
  author: number | null;
  body: string;
  created_at: string;
}
export interface Artifact {
  uuid: string;
  step_run: number;
  kind: string;
  data: Json;
  evidence: Json[];
  created_at: string;
}
export function closed(run: Run): boolean {
  return ['approved', 'rejected', 'completed', 'failed', 'cancelled'].includes(run.status);
}
export function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
}
