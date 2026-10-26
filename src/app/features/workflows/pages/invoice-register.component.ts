import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { combineLatest, forkJoin, of, Subject } from 'rxjs';
import { catchError, distinctUntilChanged, map, startWith, switchMap, tap } from 'rxjs/operators';
import { invoiceConfidence, invoiceMoney } from '../models/invoice.model';
import { InvoiceRegisterPage, InvoiceRegisterQuery, InvoiceRegisterSummary } from '../models/invoice-register.model';
import { RUN_STATUSES, RunStatus } from '../models/workflow.model';
import { InvoiceRegisterService } from '../services/invoice-register.service';

type RegisterFilters = Required<Pick<InvoiceRegisterQuery, 'page' | 'status' | 'search'>>;

function parseFilters(params: ParamMap): RegisterFilters {
  const rawPage = Number(params.get('page') ?? '1');
  const status = params.get('status') ?? '';
  return {
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    status: RUN_STATUSES.includes(status as RunStatus) ? status as RunStatus : '',
    search: (params.get('search') ?? '').trim().slice(0, 100),
  };
}

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './invoice-register.component.html',
  styleUrls: ['../workflow.scss', './invoice-register.component.scss'],
})
export class InvoiceRegisterComponent {
  private readonly api = inject(InvoiceRegisterService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly refreshRequests = new Subject<void>();

  readonly pageData = signal<InvoiceRegisterPage | null>(null);
  readonly summaryData = signal<InvoiceRegisterSummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly summaryError = signal(false);
  readonly currentPage = signal(1);
  readonly selectedStatus = signal<RunStatus | ''>('');
  readonly currentSearch = signal('');
  readonly statusOptions = RUN_STATUSES;
  searchDraft = '';

  readonly money = invoiceMoney;
  readonly confidence = invoiceConfidence;

  constructor() {
    const filters$ = this.route.queryParamMap.pipe(
      map(parseFilters),
      distinctUntilChanged((a, b) =>
        a.page === b.page && a.status === b.status && a.search === b.search),
    );
    combineLatest([filters$, this.refreshRequests.pipe(startWith(undefined))]).pipe(
      tap(([filters]) => {
        this.currentPage.set(filters.page);
        this.selectedStatus.set(filters.status);
        this.currentSearch.set(filters.search);
        this.searchDraft = filters.search;
        // Never retain confidential rows when a filter, permission, or refresh changes.
        this.pageData.set(null);
        this.summaryData.set(null);
        this.error.set('');
        this.summaryError.set(false);
        this.loading.set(true);
      }),
      switchMap(([filters]) => forkJoin({
        page: this.api.list(filters),
        summary: this.api.summary({ search: filters.search }).pipe(
          catchError(() => {
            this.summaryError.set(true);
            return of(null);
          }),
        ),
      }).pipe(
        catchError((error: unknown) => {
          this.error.set(this.message(error));
          return of(null);
        }),
      )),
      takeUntilDestroyed(this.destroy),
    ).subscribe((result) => {
      this.pageData.set(result?.page ?? null);
      this.summaryData.set(result?.summary ?? null);
      this.loading.set(false);
    });
  }

  search(): void {
    void this.navigate({ page: 1, search: this.searchDraft.trim().slice(0, 100) });
  }

  changeStatus(value: string): void {
    const status = RUN_STATUSES.includes(value as RunStatus) ? value as RunStatus : '';
    void this.navigate({ page: 1, status });
  }

  changePage(page: number): void {
    if (!Number.isSafeInteger(page) || page < 1 || this.loading()) return;
    void this.navigate({ page });
  }

  refresh(): void {
    this.refreshRequests.next();
  }

  count(...statuses: RunStatus[]): number | null {
    const summary = this.summaryData();
    return summary ? statuses.reduce((total, status) => total + (summary.by_status[status] ?? 0), 0) : null;
  }

  private navigate(params: Partial<RegisterFilters>): Promise<boolean> {
    const queryParams: { page?: number; status?: RunStatus | null; search?: string | null } = {};
    if (params.page !== undefined) queryParams.page = params.page;
    if (params.status !== undefined) queryParams.status = params.status || null;
    if (params.search !== undefined) queryParams.search = params.search || null;
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }

  private message(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Your session has expired. Sign in again.';
      if (error.status === 403 || error.status === 404)
        return 'Invoice records are unavailable with your current permissions.';
      if (error.status === 400) return 'The invoice filter is invalid. Clear your search and try again.';
    }
    return 'Unable to load the invoice register. Refresh to retry.';
  }
}
