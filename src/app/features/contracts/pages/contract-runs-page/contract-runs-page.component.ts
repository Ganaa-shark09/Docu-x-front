import { ContractAreaNavComponent } from '../../components/contract-area-nav.component';
import { DatePipe, NgFor, NgIf, TitleCasePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContractRegisterRow } from '../../models/contract.model';
import { ContractService } from '../../services/contract.service';

/** Permission-scoped contract review runs, using the contract register rather than unfiltered global runs. */
@Component({
  selector: 'app-contract-runs-page',
  standalone: true,
  imports: [ContractAreaNavComponent, DatePipe, NgFor, NgIf, TitleCasePipe, FormsModule, RouterLink],
  templateUrl: './contract-runs-page.component.html',
  styleUrl: './contract-runs-page.component.scss',
})
export class ContractRunsPageComponent implements OnInit {
  private readonly service = inject(ContractService);
  private readonly destroyRef = inject(DestroyRef);
  rows: ContractRegisterRow[] = [];
  page = 1;
  count = 0;
  next: string | null = null;
  previous: string | null = null;
  search = '';
  status = '';
  draftSearch = '';
  draftStatus = '';
  loading = false;
  error = '';
  private requestSequence = 0;
  readonly statuses = [
    { value: 'review_required', label: 'Review required' },
    { value: 'approval_required', label: 'Approval required' },
    { value: 'processing', label: 'Processing' },
    { value: 'completed', label: 'Completed' },
    { value: 'exception', label: 'Exception' },
    { value: 'failed', label: 'Failed' },
  ];

  ngOnInit(): void { this.load(); }

  load(page = this.page): void {
    if (page < 1) return;
    const sequence = ++this.requestSequence;
    this.page = page;
    this.loading = true;
    this.error = '';
    this.service.list({ page, page_size: 20, search: this.search, status: this.status })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (sequence !== this.requestSequence) return;
          this.rows = result.results ?? [];
          this.count = result.count ?? 0;
          this.next = result.next;
          this.previous = result.previous;
          this.loading = false;
        },
        error: (response) => {
          if (sequence !== this.requestSequence) return;
          this.rows = [];
          this.count = 0;
          this.next = this.previous = null;
          this.error = response?.status === 403 || response?.status === 404
            ? 'You do not have access to these contract review records.'
            : 'Could not load contract review runs. Please retry.';
          this.loading = false;
        },
      });
  }

  applyFilters(): void {
    this.search = this.draftSearch.trim().slice(0, 100);
    this.status = this.draftStatus;
    this.load(1);
  }

  resetFilters(): void {
    this.draftSearch = this.search = '';
    this.draftStatus = this.status = '';
    this.load(1);
  }

  trackRow(_index: number, row: ContractRegisterRow): string { return row.uuid; }
  statusLabel(value: string): string { return value.replace(/_/g, ' '); }
  get firstRecord(): number { return this.count ? (this.page - 1) * 20 + 1 : 0; }
  get lastRecord(): number { return Math.min(this.page * 20, this.count); }
}
