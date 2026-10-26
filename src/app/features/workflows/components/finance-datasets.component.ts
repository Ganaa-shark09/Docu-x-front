import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, of, tap } from 'rxjs';
import { FinanceCollection, FinanceWorkspaceStore } from '../services/finance-workspace.store';
import { DocumentsService } from '../../documents/services/documents.service';
import { DocumentListRecord } from '../../documents/models/document.model';
import { FINANCE_FIELDS, FinanceDataset } from '../models/finance.model';
import { FinanceValueComponent } from './finance-value.component';
import { FinanceSourceComponent } from './finance-source.component';
import { FinancePagerComponent } from './finance-pager.component';
@Component({
  selector: 'app-finance-datasets',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    FinanceValueComponent,
    FinanceSourceComponent,
    FinancePagerComponent,
  ],
  styleUrls: ['../workflow.scss', './finance.scss'],
  template: ` <section class="card">
    <h2>Finance datasets</h2>
    <p>
      CSV / JSON only | up to 8 MiB and 10,000 rows per import. Money must be exact decimal strings.
      Reporting period: {{ s.audit()?.scope?.start }} | {{ s.audit()?.scope?.end }}.
    </p>
    @if (s.canEdit()) {
      <fieldset [disabled]="s.pending() || s.loading()">
        <legend>Upload or select an existing internal source</legend>
        <label
          >CSV / JSON file<input type="file" accept=".csv,.json" (change)="choose($event)"
        /></label>
        @if (file) {
          <p>Selected: {{ file.name }} | {{ file.size }} bytes</p>
        }
        <button (click)="loadDocs(1)">Choose registered internal source</button>
        @if (docs().length) {
          <label
            >Source<select [(ngModel)]="documentUuid" (ngModelChange)="file = null">
              <option value="">Choose source</option>
              @for (d of docs(); track d.uuid) {
                <option [value]="d.uuid">{{ d.title || d.original_filename }}</option>
              }
            </select></label
          ><app-finance-pager
            [page]="docPage"
            [next]="docNext"
            [previous]="docPrevious"
            [busy]="s.pending()"
            (changed)="loadDocs($event)"
          />
        }
        @if (documentUuid) {
          <p>Registered source: {{ documentUuid }}</p>
        }
        <label
          >Dataset format<select [(ngModel)]="kind">
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select></label
        >
        <h3>Schema mapping</h3>
        <p>
          Leave mapping empty when source fields already use canonical names. Map source columns
          directly; transformations are unsupported.
        </p>
        @for (row of mapping; track $index) {
          <div class="grid">
            <label>Source column<input [(ngModel)]="row.source" maxlength="150" /></label
            ><label
              >Canonical field<select [(ngModel)]="row.target">
                @for (field of fields; track field) {
                  <option [value]="field">{{ field }}</option>
                }
              </select></label
            ><button (click)="mapping.splice($index, 1)">Remove mapping</button>
          </div>
        }
        <button (click)="mapping.push({ source: '', target: 'transaction_id' })">
          Add mapping
        </button>
        <details>
          <summary>Optional control totals</summary>
          @for (row of controls; track $index) {
            <div class="grid">
              <label>Currency<input [(ngModel)]="row.currency" maxlength="3" /></label
              ><label
                >Total<select [(ngModel)]="row.field">
                  <option value="gross_amount">Gross amount</option>
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select></label
              ><label
                >Exact control total<input [(ngModel)]="row.amount" inputmode="decimal" /></label
              ><button (click)="controls.splice($index, 1)">Remove total</button>
            </div>
          }
          <button (click)="controls.push({ currency: '', field: 'gross_amount', amount: '' })">
            Add control total
          </button>
        </details>
        <button
          class="primary"
          (click)="importSource()"
          [disabled]="(!file && !documentUuid) || s.pending() || s.loading()"
        >
          Import dataset
        </button>
      </fieldset>
    }
    @if (state()) {
      <p role="status">
        {{
          s.error() && !s.pending()
            ? 'Import failed or interrupted. Review the error and retry.'
            : state()
        }}
      </p>
    }
    <p class="muted">
      Import is validated synchronously by the server. Registered documents are retained when an
      import fails; correct the mapping and retry without uploading again.
    </p>
    @for (d of datasets.rows(); track d.uuid) {
      <article class="source">
        <h3>Dataset {{ d.number }} | Ready</h3>
        <p>
          {{ d.kind.toUpperCase() }} | {{ d.row_count }} rows | {{ d.created_at | date: 'medium' }}
        </p>
        <p class="pre">SHA-256: {{ d.checksum }}</p>
        <details>
          <summary>Mapping and exact control totals</summary>
          <app-finance-value [value]="d.mapping" /><app-finance-value [value]="d.totals" />
        </details>
        <app-finance-source [document]="d.document_uuid" />
      </article>
    } @empty {
      <p>No imported datasets on this page.</p>
    }
    <app-finance-pager
      [page]="datasets.page"
      [next]="datasets.next"
      [previous]="datasets.previous"
      [count]="datasets.count"
      [busy]="datasets.loading() || s.pending()"
      (changed)="datasets.load($event)"
    />
  </section>`,
})
export class FinanceDatasetsComponent {
  readonly s = inject(FinanceWorkspaceStore);
  private documents = inject(DocumentsService);
  readonly datasets = new FinanceCollection<FinanceDataset>(this.s, 'datasets/');
  readonly fields = FINANCE_FIELDS;
  readonly docs = signal<DocumentListRecord[]>([]);
  readonly state = signal('');
  file: File | null = null;
  documentUuid = '';
  kind: 'csv' | 'json' = 'csv';
  mapping: { source: string; target: string }[] = [];
  controls: { currency: string; field: string; amount: string }[] = [];
  docPage = 1;
  docNext = false;
  docPrevious = false;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.docs.set([]);
      this.file = null;
      this.documentUuid = '';
      this.mapping = [];
      this.controls = [];
      this.state.set('');
    });
    this.datasets.load();
    this.s.refreshed$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.datasets.load(this.datasets.page));
  }
  choose(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.file = null;
    this.documentUuid = '';
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'json'].includes(extension || '') || file.size > 8388608 || file.size === 0) {
      this.s.error.set('Choose a nonempty CSV or JSON file up to 8 MiB.');
      (event.target as HTMLInputElement).value = '';
      return;
    }
    this.file = file;
    this.kind = extension as 'csv' | 'json';
    this.state.set('File selected; not yet uploaded.');
  }
  loadDocs(page: number) {
    this.docPage = page;
    this.s.read(this.documents.getInternalDocumentPage(page), (p) => {
      this.docs.set(p.results);
      this.docNext = !!p.next;
      this.docPrevious = !!p.previous;
    });
  }
  importSource() {
    if (!this.s.canEdit() || this.s.pending() || this.s.loading()) return;
    const mapping: Record<string, string> = {};
    const targets = new Set<string>();
    for (const row of this.mapping) {
      if (
        !row.source.trim() ||
        mapping[row.source] ||
        targets.has(row.target) ||
        !this.fields.includes(row.target as (typeof FINANCE_FIELDS)[number])
      ) {
        this.s.error.set(
          'Each mapping needs a unique source column and supported canonical field.',
        );
        return;
      }
      mapping[row.source] = row.target;
      targets.add(row.target);
    }
    const totals: Record<string, Record<string, string>> = {};
    for (const row of this.controls) {
      if (
        !/^[A-Z]{3}$/.test(row.currency) ||
        !/^[-]?\d+(?:\.\d{1,8})?$/.test(row.amount) ||
        totals[row.currency]?.[row.field]
      ) {
        this.s.error.set(
          'Control totals require a unique currency/field pair and an exact decimal string.',
        );
        return;
      }
      (totals[row.currency] ??= {})[row.field] = row.amount;
    }
    const form = new FormData();
    if (this.file) {
      form.append('title', this.file.name);
      form.append('file', this.file);
    }
    this.s.mutate(
      () => {
        this.state.set(
          this.documentUuid
            ? 'Validating and importing registered source...'
            : 'Uploading internal source...',
        );
        return (
          this.documentUuid
            ? of({ uuid: this.documentUuid })
            : this.documents.uploadInternalDocument(form)
        ).pipe(
          tap((d) => {
            this.documentUuid = d.uuid;
            this.file = null;
            this.state.set('Source uploaded. Server validation and import in progress...');
          }),
          switchMap((d) => {
            const value = {
              revision: this.s.revision(),
              document_uuid: d.uuid,
              kind: this.kind,
              mapping,
              ...(this.controls.length ? { control_totals: totals } : {}),
            };
            return this.s.api.import(this.s.id, {
              ...value,
              idempotency_key: this.s.key('import', value),
            });
          }),
        );
      },
      () => {
        this.state.set('Import ready. Row count, provenance and validated totals are shown below.');
        this.documentUuid = '';
      },
    );
  }
}
