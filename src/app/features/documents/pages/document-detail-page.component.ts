import { DatePipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, finalize, interval } from 'rxjs';

import { DocumentDetail, DocumentProcessingJob } from '../models/document.model';
import { DocumentProcessingPipelineComponent } from '../components/document-processing-pipeline.component';
import { DocumentStatusBadgeComponent } from '../components/document-status-badge.component';
import { DocumentsService } from '../services/documents.service';

@Component({
  selector: 'app-document-detail-page',
  standalone: true,
  imports: [
    DatePipe,
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

  private pollingSubscription?: Subscription;

  document: DocumentDetail | null = null;
  processingJobs: DocumentProcessingJob[] = [];

  isLoading = false;
  isRetrying = false;
  isDeleting = false;
  errorMessage = '';
  successMessage = '';

  private readonly uuid = this.route.snapshot.paramMap.get('uuid') || '';

  constructor() {
    if (!this.uuid) {
      this.errorMessage = 'Document id is missing.';
      return;
    }

    this.loadDocument();
    this.loadProcessingJobs();
  }

  ngOnDestroy(): void {
    this.stopProcessingPolling();
  }

  loadDocument(showLoader = true): void {
    if (!this.uuid) {
      return;
    }

    if (showLoader) {
      this.isLoading = true;
    }

    this.errorMessage = '';

    this.documentsService
      .getDocument(this.uuid)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (document) => {
          this.document = { ...document };
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Document detail API failed:', error);

          if (showLoader) {
            this.document = null;
          }

          this.errorMessage =
            error?.error?.detail ||
            error?.error?.message ||
            'Unable to load document detail.';

          this.cdr.markForCheck();
        },
      });
  }

  loadProcessingJobs(showLoader = true): void {
    if (!this.uuid) {
      return;
    }

    this.documentsService.getProcessingJobs(this.uuid).subscribe({
      next: (jobs) => {
        this.processingJobs = Array.isArray(jobs) ? [...jobs] : [];

        if (this.shouldPollProcessing()) {
          this.startProcessingPolling();
        } else {
          this.stopProcessingPolling();
        }

        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Processing jobs API failed:', error);

        if (showLoader) {
          this.processingJobs = [];
        }

        this.stopProcessingPolling();
        this.cdr.markForCheck();
      },
    });
  }

  retryProcessing(): void {
    if (!this.uuid) {
      return;
    }

    this.isRetrying = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.documentsService
      .retryProcessing(this.uuid)
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
          this.loadProcessingJobs();
          this.startProcessingPolling();
        },
        error: (error) => {
          this.errorMessage =
            error?.error?.detail ||
            'Unable to retry processing.';
        },
      });
  }

  deleteDocument(): void {
    const confirmed = window.confirm(
      'Delete this document? This action will remove it from the document list.',
    );

    if (!confirmed || !this.uuid) {
      return;
    }

    this.isDeleting = true;
    this.errorMessage = '';

    this.documentsService
      .deleteDocument(this.uuid)
      .pipe(
        finalize(() => {
          this.isDeleting = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.router.navigate(['/documents', 'internal']);
        },
        error: (error) => {
          this.errorMessage =
            error?.error?.detail ||
            'Unable to delete document.';
        },
      });
  }

  startProcessingPolling(): void {
    if (this.pollingSubscription) {
      return;
    }

    this.pollingSubscription = interval(5000).subscribe(() => {
      this.loadDocument(false);
      this.loadProcessingJobs(false);
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

  getDocumentTitle(): string {
    return this.document?.title ||
      this.document?.original_filename ||
      'Document Detail';
  }

  getDocumentFilename(): string {
    return this.document?.original_filename || 'Document';
  }

  getDocumentFileUrl(): string | null {
    const document = this.document as any;

    return document?.file ||
      document?.file_url ||
      document?.download_url ||
      document?.document_url ||
      null;
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
    const index = Math.min(
      Math.floor(Math.log(size) / Math.log(1024)),
      units.length - 1,
    );

    return `${(size / Math.pow(1024, index)).toFixed(2)} ${units[index]}`;
  }
}
