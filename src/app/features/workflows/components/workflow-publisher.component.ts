import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { EMPTY, expand, map, reduce, timeout } from 'rxjs';
import { WorkflowService } from '../services/workflow.service';
import { Json } from '../models/workflow.model';
import { Membership } from '../../documents/models/governance.model';
import {
  Principal,
  PublishInput,
  StepInput,
  StepType,
  Transition,
  Version,
} from '../models/workflow.model';
import { WorkflowAssignmentComponent } from './workflow-assignment.component';
import { AiApiErrorMessageService } from '../../ai-chat/services/ai-api-error-message.service';
interface DraftStep {
  key: string;
  name: string;
  type: StepType;
  instruction: string;
  template: string;
  assignment: Principal | null;
  source: string;
  path: string;
  operator: string;
  value: string;
  terminal: string;
  targets: Record<string, string>;
  exception: boolean;
}
@Component({
  selector: 'app-workflow-publisher',
  standalone: true,
  imports: [FormsModule, WorkflowAssignmentComponent],
  templateUrl: './workflow-publisher.component.html',
  styleUrls: ['../workflow.scss'],
})
export class WorkflowPublisherComponent {
  readonly definition = input.required<string>();
  readonly memberships = input<Membership[]>([]);
  readonly published = output<Version>();
  readonly accessDenied = output<void>();
  private readonly api = inject(WorkflowService);
  private readonly destroy = inject(DestroyRef);
  private readonly errors = inject(AiApiErrorMessageService);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly templates = signal<{ uuid: string; name: string }[]>([]);
  readonly types: StepType[] = [
    'ai',
    'extraction',
    'rule',
    'validation',
    'human_review',
    'approval',
    'assignment',
    'notification',
    'terminal',
  ];
  steps: DraftStep[] = [];
  entry = '';
  allowed = '';
  attempts = 4;
  reviewed = false;
  constructor() {
    this.add();
    this.api
      .templates()
      .pipe(
        expand((p, i) => (p.next ? this.api.templates(i + 2) : EMPTY)),
        map((p) => p.results.filter((t) => t.is_active && !t.is_system)),
        reduce((all, rows) => [...all, ...rows], [] as { uuid: string; name: string }[]),
        timeout(15000),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({ next: (t) => this.templates.set(t), error: () => {} });
  }
  add(): void {
    this.steps.push({
      key: 'step_' + (this.steps.length + 1),
      name: '',
      type: 'notification',
      instruction: '',
      template: '',
      assignment: null,
      source: '',
      path: '',
      operator: 'exists',
      value: 'null',
      terminal: 'completed',
      targets: {},
      exception: false,
    });
    if (!this.entry) this.entry = this.steps[0].key;
    this.reviewed = false;
  }
  outcomes(s: DraftStep): string[] {
    const normal =
      s.type === 'terminal'
        ? []
        : s.type === 'human_review'
          ? ['accepted', 'rejected']
          : s.type === 'approval'
            ? ['approved', 'rejected']
            : ['rule', 'validation'].includes(s.type)
              ? ['pass', 'fail']
              : ['success'];
    return s.exception && ['human_review', 'approval', 'extraction'].includes(s.type)
      ? [...normal, 'exception']
      : normal;
  }
  payload(): PublishInput {
    const steps: StepInput[] = this.steps.map((s) => {
      let configuration: Record<string, Json> = {};
      if (s.type === 'ai') configuration = { instruction: s.instruction };
      if (s.type === 'extraction') {
        if (!this.templates().some((t) => t.uuid === s.template))
          throw Error('Choose an available company extraction template.');
        configuration = { template: s.template };
      }
      if (['human_review', 'approval', 'assignment'].includes(s.type)) {
        if (!s.assignment) throw Error('Choose an available assignment target.');
        configuration = { assignment: { ...s.assignment } as Record<string, Json> };
      }
      if (['rule', 'validation'].includes(s.type))
        configuration = {
          source_step: s.source,
          path: s.path,
          operator: s.operator,
          ...(s.operator === 'exists' ? {} : { value: JSON.parse(s.value) as Json }),
        };
      if (s.type === 'terminal') configuration = { status: s.terminal };
      return { key: s.key, name: s.name, step_type: s.type, configuration };
    });
    const transitions: Transition[] = this.steps.flatMap((s) =>
      this.outcomes(s).map((outcome) => ({
        source: s.key,
        target: s.targets[outcome] || '',
        outcome,
      })),
    );
    if (
      !steps.length ||
      steps.some((s) => !s.name.trim() || !/^[-a-zA-Z0-9_]{1,80}$/.test(s.key)) ||
      new Set(steps.map((s) => s.key)).size !== steps.length ||
      !steps.some((s) => s.key === this.entry) ||
      transitions.some((t) => !steps.some((s) => s.key === t.target))
    )
      throw Error(
        'Provide unique step keys, names, an entry step and a destination for every outcome.',
      );
    return {
      entry_step: this.entry,
      steps,
      transitions,
      allowed_document_types: this.allowed
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      configuration: { max_attempts: this.attempts },
    };
  }
  publish(): void {
    if (this.pending() || !this.reviewed) return;
    let body: PublishInput;
    try {
      body = this.payload();
    } catch {
      this.error.set(
        'Check step names, unique keys, assignments, rule values and all transition destinations.',
      );
      return;
    }
    this.pending.set(true);
    this.error.set('');
    this.api
      .publish(this.definition(), body)
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (v) => {
          this.pending.set(false);
          this.published.emit(v);
        },
        error: (e) => {
          this.pending.set(false);
          this.reviewed = false;
          if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status))
            this.accessDenied.emit();
          this.error.set(
            this.errors.getMessage(
              e,
              'Unable to publish this version. Refresh versions before retrying if the outcome is unknown.',
            ),
          );
        },
      });
  }
}
