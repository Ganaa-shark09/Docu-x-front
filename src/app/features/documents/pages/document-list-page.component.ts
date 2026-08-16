import { DatePipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';

import { DocumentUploadFormComponent } from '../components/document-upload-form.component';
import { DocumentsService } from '../services/documents.service';
import {
  DocumentProcessingStore,
} from '../../../core/realtime/document-processing.store';


type DocumentScope = 'internal' | 'external';

@Component({
  selector: 'app-document-list-page',
  standalone: true,
  imports: [DatePipe, DocumentUploadFormComponent, NgFor, NgIf, ReactiveFormsModule],
  templateUrl: './document-list-page.component.html',
  styleUrl: './document-list-page.component.scss',
})
export class DocumentListPageComponent implements OnInit, OnDestroy {
  private readonly documentsService = inject(DocumentsService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly processingStore =
    inject(DocumentProcessingStore);

  private processingStatesSubscription?: Subscription;

  documents: any[] = [];
  departments: any[] = [];

  isLoading = false;
  isUploadOpen = false;
  isUploadingDocument = false;

  errorMessage = '';
  uploadErrorMessage = '';

  scope: DocumentScope = 'internal';

  filtersForm = this.fb.nonNullable.group({
    search: [''],
    status: [''],
    document_type: [''],
    sensitivity_label: [''],
    ai_ready: [''],
  });

  get isInternalScope(): boolean {
    return this.scope === 'internal';
  }

  get isExternalScope(): boolean {
    return this.scope === 'external';
  }

  switchScope(scope: DocumentScope): void {
    this.router.navigate(['/documents', scope]);
  }

  openUploadModal(): void {
    if (!this.isInternalScope) {
      return;
    }

    this.uploadErrorMessage = '';
    this.isUploadOpen = true;
    this.cdr.markForCheck();
  }

  closeUploadModal(): void {
    this.isUploadOpen = false;
    this.uploadErrorMessage = '';
    this.cdr.markForCheck();
  }

  uploadInternalDocument(formData: FormData): void {
    this.isUploadingDocument = true;
    this.uploadErrorMessage = '';
    this.cdr.markForCheck();

    this.documentsService
      .uploadInternalDocument(formData)
      .pipe(
        finalize(() => {
          this.isUploadingDocument = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.isUploadOpen = false;
          this.loadDocuments();
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Internal document upload error:', error);
          this.uploadErrorMessage =
            error?.error?.department?.[0] ||
            error?.error?.file?.[0] ||
            error?.error?.detail ||
            'Unable to upload internal document.';
          this.cdr.markForCheck();
        },
      });
  }


  ngOnInit(): void {
    this.processingStatesSubscription =
      this.processingStore.states$
        .subscribe((states) => {
          if (!this.documents.length) {
            return;
          }

          let changed = false;

          const updatedDocuments =
            this.documents.map((document: any) => {
              const uuid =
                document?.uuid ||
                document?.id;

              if (!uuid) {
                return document;
              }

              const processingState =
                states.get(uuid);

              if (!processingState) {
                return document;
              }

              changed = true;

              return {
                ...document,

                status:
                  processingState.status ||
                  document.status,

                processing_stage:
                  processingState.stage,

                processing_progress:
                  processingState.progress,

                is_ai_ready:
                  processingState.isAiReady,

                is_indexed:
                  processingState.isIndexed,

                is_ocr_completed:
                  processingState.isOcrCompleted,

                processing_error:
                  processingState.error ??
                  document.processing_error,
              };
            });

          if (changed) {
            this.documents =
              updatedDocuments;

            this.cdr.detectChanges();
          }
        });

    this.route.data.subscribe((data) => {
    this.scope = (data['scope'] || 'internal') as DocumentScope;
    this.isUploadOpen = false;
    this.uploadErrorMessage = '';
    if (this.isInternalScope) {
    this.loadDepartments();
    }
    });

    // docuxInitialDocumentLoadFix: hard refresh can render before route/auth state settles.
    window.setTimeout(() => {
      this.loadDocuments();
    }, 180);
  }

  ngOnDestroy(): void {
    this.processingStatesSubscription?.unsubscribe();

    /*
     * IMPORTANT:
     * Do NOT close the global WebSocket here.
     * Other application features can still use it.
     */
  }

  loadDocuments(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.documents = [];
    this.cdr.detectChanges();

    const rawFilters = this.filtersForm.getRawValue();
    const filters: Record<string, string> = {};

    Object.entries(rawFilters).forEach(([key, value]) => {
      if (value) {
        filters[key] = value;
      }
    });

    this.documentsService.getDocuments(this.scope, filters).subscribe({
      next: (response: any) => {
        const documents = Array.isArray(response)
          ? response
          : response?.results ||
            response?.documents ||
            response?.data ||
            response?.items ||
            [];

        this.documents = documents;

        /*
         * HTTP response is authoritative initial state.
         *
         * The store seeds processing_stage/progress from DB,
         * then the global WebSocket keeps individual rows updated.
         */
        this.processingStore.subscribeDocuments(
          documents
            .filter(
              (document: any) =>
                !!(
                  document?.uuid ||
                  document?.id
                ),
            )
            .map(
              (document: any) => ({
                ...document,
                uuid:
                  document.uuid ||
                  document.id,
              }),
            ),
        );

        this.isLoading = false;
        this.errorMessage = '';
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        console.error('Documents load error:', error);
        this.documents = [];
        this.isLoading = false;
        this.errorMessage =
          error?.error?.detail ||
          error?.error?.message ||
          'Unable to load documents.';
        this.cdr.detectChanges();
      },
    });
  }

  resetFilters(): void {
    this.filtersForm.reset({
      search: '',
      status: '',
      document_type: '',
      sensitivity_label: '',
      ai_ready: '',
    });

    this.loadDocuments();
  }

  openDocument(document: any): void {
    if (this.isExternalScope) {
      return;
    }

    const uuid = document?.uuid || document?.id;

    if (!uuid) {
      this.errorMessage = 'Document id is missing. Unable to open details.';
      this.cdr.markForCheck();
      return;
    }

    this.router.navigate(['/documents', 'detail', uuid]);
  }

  getDocumentTitle(document: any): string {
    return document.title || document.document_title || document.original_filename || document.filename || 'Untitled document';
  }

  getDocumentFilename(document: any): string {
    return document.original_filename || document.filename || document.file_name || 'Document';
  }

  getDocumentSize(document: any): string {
    const size = document.file_size || document.size;

    if (!size) {
      return '';
    }

    if (size < 1024) {
      return `${size} B`;
    }

    return `${(size / 1024).toFixed(2)} KB`;
  }

  getDocumentStatus(document: any): string {
    const stage =
      String(
        document.processing_stage || '',
      ).toLowerCase();

    const labels:
      Record<string, string> = {
        queued: 'Queued',
        extracting: 'Extracting content',
        classifying: 'Analyzing document',
        firewall_scan: 'Security scan',
        chunking: 'Preparing content',
        embedding: 'Creating embeddings',
        indexing: 'Indexing document',
        ready: 'Ready',
        failed: 'Failed',
      };

    if (stage && labels[stage]) {
      return labels[stage];
    }

    const status =
      String(
        document.status ||
        document.processing_status ||
        '',
      ).toLowerCase();

    if (status === 'failed') {
      return 'Failed';
    }

    if (
      status === 'ready' ||
      document.is_ai_ready === true
    ) {
      return 'Ready';
    }

    if (
      status === 'processing' ||
      status === 'uploaded'
    ) {
      return 'Processing';
    }

    return status || 'Ready';
  }

  getDocumentProcessingProgress(
    document: any,
  ): number {
    const progress =
      Number(
        document.processing_progress ?? 0,
      );

    return Math.max(
      0,
      Math.min(100, progress),
    );
  }

  getAiStatus(document: any): string {
    if (document.ai_ready === true || document.is_indexed === true || document.is_ai_ready === true) {
      return 'Ready';
    }

    if (document.ai_ready === false || document.is_indexed === false || document.is_ai_ready === false) {
      return 'Pending';
    }

    return 'Ready';
  }

  private loadDepartments(): void {
    this.documentsService.getDepartments().subscribe({
      next: (departments) => {
        this.departments = departments;
        this.cdr.markForCheck();
      },
      error: () => {
        this.departments = [];
        this.cdr.markForCheck();
      },
    });
  }
}
