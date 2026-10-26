import { SourceProofPanelComponent } from '../../source-proof/source-proof-panel.component';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DocumentGovernanceComponent } from '../components/document-governance.component';
import { DocumentGovernanceService } from '../services/document-governance.service';
import { AiApiErrorMessageService } from '../../ai-chat/services/ai-api-error-message.service';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, finalize, interval } from 'rxjs';

import { DocumentDetail, DocumentProcessingJob } from '../models/document.model';
import { InvoiceReadiness } from '../models/invoice-readiness.model';
import { DocumentProcessingPipelineComponent } from '../components/document-processing-pipeline.component';
import { DocumentStatusBadgeComponent } from '../components/document-status-badge.component';
import { DocumentsService } from '../services/documents.service';
import { ToastService } from '../../../core/notifications/toast.service';

@Component({
  selector: 'app-document-detail-page',
  standalone: true,
  imports: [SourceProofPanelComponent,
    DatePipe,
    DocumentGovernanceComponent,
    DocumentProcessingPipelineComponent,
    DocumentStatusBadgeComponent,
    NgFor,
    NgIf,
    RouterLink,
  ],
  templateUrl: './document-detail-page.component.html',
  styleUrls: ['./document-detail-page.component.scss'],
})
export class DocumentDetailPageComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly documentsService = inject(DocumentsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toasts = inject(ToastService);

  private readonly governanceService = inject(DocumentGovernanceService);
  private readonly errors = inject(AiApiErrorMessageService);
  private readonly sanitizer = inject(DomSanitizer);
  private detailSubscription?: Subscription;
  private metadataSubscription?: Subscription;
  private revocationSubscription?: Subscription;
  private readonly realtime = inject(DocumentRealtimeService);
  private changesSubscription?: Subscription;
  private fileSubscription?: Subscription;
  private previewUrl: string | null = null;
  previewSafeUrl: SafeResourceUrl | null = null;
  fileBusy = false;
  private pollingSubscription?: Subscription;
  private readinessSubscription?: Subscription;
  invoiceReadiness: InvoiceReadiness | null = null;
  readinessLoading = false;
  readinessError = '';
  private readinessRequest = 0;

  metadataOnly = false;
  policyAdministrator = false;
  document: DocumentDetail | null = null;
  processingJobs: DocumentProcessingJob[] = [];

  isLoading = false;
  isRetrying = false;
  isDeleting = false;
  governanceError = '';
  errorMessage = '';
  successMessage = '';

  readonly scope =
    this.route.snapshot.queryParamMap?.get('scope') === 'external' ? 'external' : 'internal';
  private readonly uuid = this.route.snapshot.paramMap.get('uuid') || '';

  constructor() {
    if (!this.uuid) {
      this.errorMessage = 'Document id is missing.';
      return;
    }

    this.changesSubscription = this.governanceService.changes$.subscribe((uuid) => {
      if (uuid !== '*' && uuid !== this.uuid) return;
      this.closePreview();
      this.clearInvoiceReadiness();
      this.document = null;
      this.policyAdministrator = false;
      this.processingJobs = [];
      this.loadDocument();
    });
    this.revocationSubscription = this.realtime.revoked$.subscribe((uuid) => {
      if (uuid !== this.uuid) return;
      this.closePreview();
      this.clearInvoiceReadiness();
      this.document = null;
      this.processingJobs = [];
      this.policyAdministrator = false;
      this.stopProcessingPolling();
      this.errorMessage = 'You no longer have access to this document.';
      this.cdr.markForCheck();
    });
    this.loadDocument();
  }

  ngOnDestroy(): void {
    this.stopProcessingPolling();
    this.changesSubscription?.unsubscribe();
    this.revocationSubscription?.unsubscribe();
    this.detailSubscription?.unsubscribe();
    this.metadataSubscription?.unsubscribe();
    this.clearInvoiceReadiness();
    this.closePreview();
  }

  loadDocument(showLoader = true): void {
    if (!this.uuid) {
      return;
    }

    if (showLoader) {
      this.isLoading = true;
    }

    this.errorMessage = '';

    this.detailSubscription?.unsubscribe();
    this.metadataSubscription?.unsubscribe();
    this.detailSubscription = this.documentsService
      .getDocument(this.uuid, this.scope)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (document) => {
          this.metadataOnly = false;
          this.document = { ...document };
          this.realtime.subscribeDocument(document.uuid);
          this.processingJobs = document.processing_jobs || [];
          this.loadInvoiceReadiness();
          if (this.shouldPollProcessing()) this.startProcessingPolling();
          else this.stopProcessingPolling();
          this.cdr.markForCheck();
        },
        error: (error) => {
          if (
            showLoader ||
            (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status))
          ) {
            this.document = null;
            this.processingJobs = [];
            this.clearInvoiceReadiness();
            this.closePreview();
            this.stopProcessingPolling();
          }

          this.errorMessage =
            error?.error?.detail || error?.error?.message || 'Unable to load document detail.';

          if (error instanceof HttpErrorResponse && [403, 404].includes(error.status))
            this.loadGovernanceMetadata();
          this.cdr.markForCheck();
        },
      });
  }

  private loadGovernanceMetadata(): void {
    this.metadataSubscription = this.governanceService.get(this.uuid, this.scope).subscribe({
      next: (governance) => {
        this.metadataOnly = true;
        this.errorMessage = '';
        this.document = {
          uuid: this.uuid,
          title: 'Document governance',
          document_type: '',
          status: '',
          sensitivity_label: governance.sensitivity_label,
          original_filename: '',
          file_size: 0,
          is_indexed: false,
          is_ocr_completed: false,
          is_ai_ready: false,
          created_at: '',
          updated_at: '',
          governance,
        };
        this.cdr.markForCheck();
      },
      error: () => {
        this.document = null;
        this.policyAdministrator = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadProcessingJobs(showLoader = true): void {
    // Detail responses are already field-redacted by the server. Do not fetch
    // a second unredacted copy of processing payloads for this page.
    this.loadDocument(showLoader);
  }

  retryProcessing(): void {
    if (!this.uuid || !this.canRetry) {
      return;
    }

    this.isRetrying = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.documentsService
      .retryProcessing(this.uuid, this.scope)
      .pipe(
        finalize(() => {
          this.isRetrying = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (response) => {
          this.successMessage = response?.detail || 'Processing restarted.';
          this.loadDocument();
          this.startProcessingPolling();
        },
        error: (error) => {
          this.errorMessage = error?.error?.detail || 'Unable to retry processing.';
        },
      });
  }

  deleteDocument(): void {
    if (!this.canDelete) return;
    const confirmed = window.confirm(
      'Delete this document? This action will remove it from the document list.',
    );

    if (!confirmed || !this.uuid) {
      return;
    }

    this.isDeleting = true;
    this.errorMessage = '';

    this.documentsService
      .deleteDocument(this.uuid, this.scope)
      .pipe(
        finalize(() => {
          this.isDeleting = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.router.navigate(['/documents', this.scope]);
        },
        error: (error) => {
          this.errorMessage = error?.error?.detail || 'Unable to delete document.';
        },
      });
  }

  startProcessingPolling(): void {
    if (this.pollingSubscription) {
      return;
    }

    this.pollingSubscription = interval(5000).subscribe(() => {
      this.loadDocument(false);
    });
  }

  stopProcessingPolling(): void {
    this.pollingSubscription?.unsubscribe();
    this.pollingSubscription = undefined;
  }

  shouldPollProcessing(): boolean {
    const documentStatus = String(this.document?.status || '').toLowerCase();

    if (['pending', 'processing', 'running', 'queued'].includes(documentStatus)) {
      return true;
    }

    return this.processingJobs.some((job) => {
      const status = String(job.status || '').toLowerCase();
      return ['pending', 'processing', 'running', 'queued', 'started'].includes(status);
    });
  }

  get canDelete(): boolean {
    return (
      (this.document?.current_user_access === 'admin' ||
        (this.metadataOnly && this.policyAdministrator)) &&
      this.document?.governance?.deletion_eligible === true &&
      this.document?.governance?.legal_hold === false
    );
  }
  private clearInvoiceReadiness(): void {
    ++this.readinessRequest;
    this.readinessSubscription?.unsubscribe();
    this.invoiceReadiness = null;
    this.readinessLoading = false;
    this.readinessError = '';
  }

  loadInvoiceReadiness(): void {
    this.clearInvoiceReadiness();
    const doc = this.document;
    if (this.scope !== 'internal' || this.metadataOnly || !doc ||
        doc.document_type !== 'invoice' ||
        !['edit', 'review', 'approve', 'admin'].includes(doc.current_user_access ?? '')) return;
    const request = this.readinessRequest;
    this.readinessLoading = true;
    this.readinessSubscription = this.documentsService.getInvoiceReadiness(doc.uuid).subscribe({
      next: (result) => {
        if (request !== this.readinessRequest || this.document?.uuid !== doc.uuid) return;
        this.invoiceReadiness = result;
        this.readinessLoading = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        if (request !== this.readinessRequest) return;
        this.invoiceReadiness = null;
        this.readinessLoading = false;
        this.readinessError = [401, 403, 404].includes(error.status)
          ? 'Invoice readiness is unavailable for your current permissions.'
          : 'Unable to verify invoice readiness. Retry before starting a workflow.';
        this.cdr.markForCheck();
      },
    });
  }

  invoiceSignalLabel(key: string): string {
    const labels: Record<string, string> = {
      invoice_number: 'Invoice number', invoice_date: 'Invoice date',
      vendor: 'Vendor', currency: 'Currency', subtotal: 'Subtotal',
      grand_total: 'Grand total',
    };
    return labels[key] ?? 'Other invoice signal';
  }

  /** A navigation affordance only. The batch endpoint remains the final permission authority. */
  get canPrepareInvoiceWorkflow(): boolean {
    const doc = this.document;
    return this.scope === 'internal' && !this.metadataOnly && !!doc &&
      doc.document_type === 'invoice' && doc.status === 'ready' &&
      this.invoiceReadiness?.can_start_invoice_workflow === true &&
      ['edit', 'review', 'approve', 'admin'].includes(doc.current_user_access ?? '');
  }

  prepareInvoiceWorkflow(): void {
    if (!this.canPrepareInvoiceWorkflow || !this.document) return;
    // Never send document bytes, extracted text, or tenant/security overrides in a URL.
    void this.router.navigate(['/workflows/invoice-batches'], {
      queryParams: { document: this.document.uuid },
    });
  }

  get canRetry(): boolean {
    return (
      ['edit', 'review', 'approve', 'admin'].includes(this.document?.current_user_access || '') &&
      this.document?.status !== 'archived'
    );
  }
  openFile(download = false): void {
    const doc = this.document;
    if (!doc?.file) return;
    this.closePreview();
    this.fileBusy = true;
    this.errorMessage = '';
    this.fileSubscription = this.documentsService
      .getFile(doc.uuid, download ? 'download' : 'preview', this.scope)
      .pipe(
        finalize(() => {
          this.fileBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          if (download) {
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.original_filename;
            a.click();
            URL.revokeObjectURL(url);
            this.toasts.success('Document downloaded.');
          } else if (
            blob.type === 'application/pdf' ||
            /^image\/(png|jpeg|webp|gif|bmp)$/.test(blob.type)
          ) {
            this.previewUrl = url;
            this.previewSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
          } else {
            URL.revokeObjectURL(url);
            this.errorMessage = 'Preview is unavailable for this file type. Use Download.';
          }
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          this.errorMessage = this.errors.getMessage(error, 'Unable to open this document.');
          if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) {
            this.document = null;
            this.processingJobs = [];
            this.stopProcessingPolling();
          }
        },
      });
  }
  closePreview(): void {
    this.fileSubscription?.unsubscribe();
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.previewSafeUrl = null;
  }

  getDocumentTitle(): string {
    return this.document?.title || this.document?.original_filename || 'Document Detail';
  }

  getDocumentFilename(): string {
    return this.document?.original_filename || 'Document';
  }

  getStatusLabel(value: boolean | undefined): string {
    return value ? 'Yes' : 'No';
  }

  formatLabel(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    return value
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  formatFileSize(size: number | null | undefined): string {
    if (!size) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);

    return `${(size / Math.pow(1024, index)).toFixed(2)} ${units[index]}`;
  }
}
