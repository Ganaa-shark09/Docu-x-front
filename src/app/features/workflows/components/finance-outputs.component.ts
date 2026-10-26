import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FinanceWorkspaceStore, FinanceCollection } from '../services/finance-workspace.store';
import { FinanceOutput, FinanceVersion } from '../models/finance.model';
import { FinanceValueComponent } from './finance-value.component';
import { FinancePagerComponent } from './finance-pager.component';
@Component({
  selector: 'app-finance-outputs',
  standalone: true,
  imports: [DatePipe, FinanceValueComponent, FinancePagerComponent],
  styleUrls: ['../workflow.scss', './finance.scss'],
  template: `<section class="card">
    <h2>Immutable audit outputs</h2>
    <p>
      Assistive financial review only. No statutory opinion or financial-statement assurance is
      provided.
    </p>
    @for (o of outputs.rows(); track o.uuid) {
      <article class="source">
        <h3>
          Version {{ o.number }} ?
          {{ o.number === outputs.count ? 'Latest recorded output' : 'Historical output' }}
        </h3>
        <p>{{ o.created_at | date: 'medium' }}</p>
        <button (click)="open(o.uuid)" [disabled]="s.pending()">Inspect approved output</button>
      </article>
    } @empty {
      <p>
        No finalized output on this page. Complete the existing workflow review and approval first.
      </p>
    }
    <app-finance-pager
      [page]="outputs.page"
      [next]="outputs.next"
      [previous]="outputs.previous"
      [count]="outputs.count"
      [busy]="outputs.loading() || s.pending()"
      (changed)="outputs.load($event)"
    />
    @if (selected(); as output) {
      <h3>Read-only output version {{ output.number }}</h3>
      <p>
        Historical scope, population, calculations, samples, findings, management responses and
        approval identifiers are preserved exactly as finalized.
      </p>
      <app-finance-value [value]="output.data" /><button
        class="primary"
        (click)="download()"
        [disabled]="s.pending() || s.loading()"
      >
        Download structured JSON
      </button>
      <p>Export permission is rechecked for every source by the server.</p>
    }
  </section>`,
})
export class FinanceOutputsComponent {
  readonly s = inject(FinanceWorkspaceStore);
  readonly outputs = new FinanceCollection<FinanceVersion>(this.s, 'outputs/');
  readonly selected = signal<FinanceOutput | null>(null);
  private destroy = inject(DestroyRef);
  private urls = new Set<string>();
  private request = 0;
  constructor() {
    this.outputs.load();
    this.s.refreshed$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.selected.set(null);
      this.outputs.load(this.outputs.page);
    });
    this.destroy.onDestroy(() => {
      this.selected.set(null);
      for (const url of this.urls) URL.revokeObjectURL(url);
      this.urls.clear();
    });
  }
  open(uuid: string) {
    const request = ++this.request;
    this.selected.set(null);
    this.s.read(this.s.api.output(this.s.id, uuid), (o) => {
      if (request === this.request) this.selected.set(o);
    });
  }
  download() {
    const output = this.selected();
    if (!output || this.s.pending()) return;
    this.s.mutate(
      () => this.s.api.export(this.s.id, output.uuid),
      (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        this.urls.add(url);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'finance-audit-output.json';
        link.click();
        URL.revokeObjectURL(url);
        this.urls.delete(url);
      },
    );
  }
}
