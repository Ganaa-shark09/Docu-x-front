import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { LegalClauseService } from '../services/legal-clause.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { Playbook, PlaybookVersion } from '../models/legal-clause.model';
@Component({
  selector: 'app-legal-playbook-picker',
  standalone: true,
  imports: [FormsModule],
  styleUrls: ['../workflow.scss', './legal.scss'],
  template: ` <section class="card">
    <h3>Pin a published legal playbook</h3>
    <p class="muted">
      Select an authorized active playbook and immutable version. Existing runs never follow later
      policy changes.
    </p>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (loading()) {
      <p role="status">Loading playbooks…</p>
    }
    <label
      >Playbook<select
        [ngModel]="book"
        (ngModelChange)="chooseBook($event)"
        [ngModelOptions]="{ standalone: true }"
        [disabled]="disabled() || loading()"
      >
        <option value="">Choose playbook</option>
        @for (b of books(); track b.uuid) {
          <option [value]="b.uuid" [disabled]="!b.is_active">
            {{ b.name }} ·
            {{ b.department_id ? 'Department ' + b.department_id : 'Company wide' }} ·
            {{ b.is_active ? 'Active' : 'Inactive' }}
          </option>
        }
      </select></label
    >
    <div class="actions">
      <button
        type="button"
        (click)="load(page - 1)"
        [disabled]="!previous || disabled() || loading()"
      >
        Previous playbooks</button
      ><span>Page {{ page }}</span
      ><button type="button" (click)="load(page + 1)" [disabled]="!next || disabled() || loading()">
        Next playbooks
      </button>
    </div>
    @if (book) {
      <label
        >Published version<select
          [ngModel]="version"
          (ngModelChange)="select($event)"
          [ngModelOptions]="{ standalone: true }"
          [disabled]="disabled() || loading()"
        >
          <option value="">Choose published version</option>
          @for (v of versions(); track v.uuid) {
            <option [value]="v.uuid">
              Version {{ v.number }} · {{ v.uuid === active ? 'Current active' : 'Historical' }} ·
              {{ v.document_types.join(', ') }} · {{ v.effective_from }}
            </option>
          }
        </select></label
      >
      <div class="actions">
        <button
          type="button"
          (click)="loadVersions(versionPage - 1)"
          [disabled]="!versionPrevious || disabled() || loading()"
        >
          Previous versions</button
        ><button
          type="button"
          (click)="loadVersions(versionPage + 1)"
          [disabled]="!versionNext || disabled() || loading()"
        >
          Next versions
        </button>
      </div>
    }
  </section>`,
})
export class LegalPlaybookPickerComponent {
  readonly disabled = input(false);
  readonly changed = output<string | null>();
  readonly denied = output<void>();
  private readonly api = inject(LegalClauseService);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly destroy = inject(DestroyRef);
  readonly books = signal<Playbook[]>([]);
  readonly versions = signal<PlaybookVersion[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  page = 1;
  next = false;
  previous = false;
  versionPage = 1;
  versionNext = false;
  versionPrevious = false;
  book = '';
  version = '';
  active: string | null = null;
  private readonly cancel = new Subject<void>();
  constructor() {
    this.load(1);
    for (const events of [this.governance.changes$, this.api.revoked$])
      events.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
        this.cancel.next();
        this.books.set([]);
        this.versions.set([]);
        this.book = '';
        this.version = '';
        this.active = null;
        this.changed.emit(null);
        this.loading.set(false);
        this.denied.emit();
      });
    this.destroy.onDestroy(() => {
      this.cancel.next();
      this.cancel.complete();
    });
  }
  load(page: number): void {
    if (page < 1 || this.disabled() || this.loading()) return;
    this.loading.set(true);
    this.page = page;
    this.api
      .playbooks(page)
      .pipe(takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (p) => {
          this.books.set(p.results);
          this.next = !!p.next;
          this.previous = !!p.previous;
          this.loading.set(false);
        },
        error: (e) => {
          this.fail(e);
        },
      });
  }
  chooseBook(uuid: string): void {
    if (this.disabled()) return;
    this.cancel.next();
    this.loading.set(false);
    this.book = uuid;
    this.version = '';
    this.changed.emit(null);
    this.versions.set([]);
    this.active = this.books().find((b) => b.uuid === uuid)?.active_version_uuid || null;
    if (uuid) this.loadVersions(1);
  }
  loadVersions(page: number): void {
    if (!this.book || page < 1 || this.disabled() || this.loading()) return;
    this.loading.set(true);
    this.versionPage = page;
    this.api
      .versions(this.book, page)
      .pipe(takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (p) => {
          this.versions.set(p.results);
          this.versionNext = !!p.next;
          this.versionPrevious = !!p.previous;
          this.loading.set(false);
        },
        error: (e) => {
          this.fail(e);
        },
      });
  }
  fail(error: unknown): void {
    this.loading.set(false);
    this.error.set(this.api.message(error));
    if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) {
      this.cancel.next();
      this.books.set([]);
      this.versions.set([]);
      this.book = '';
      this.version = '';
      this.active = null;
      this.changed.emit(null);
      this.denied.emit();
    }
  }
  select(uuid: string): void {
    if (this.disabled() || !this.versions().some((v) => v.uuid === uuid)) return;
    this.version = uuid;
    this.changed.emit(uuid);
  }
}
