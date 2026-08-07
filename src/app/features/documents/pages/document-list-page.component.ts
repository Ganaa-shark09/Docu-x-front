import { DatePipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { DocumentsService } from '../services/documents.service';

type DocumentScope = 'internal' | 'external';

@Component({
  selector: 'app-document-list-page',
  standalone: true,
  imports: [DatePipe, NgFor, NgIf, ReactiveFormsModule],
  templateUrl: './document-list-page.component.html',
  styleUrl: './document-list-page.component.scss',
})
export class DocumentListPageComponent implements OnInit {
  private readonly documentsService = inject(DocumentsService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  documents: any[] = [];
  isLoading = false;
  errorMessage = '';

  scope: DocumentScope = 'internal';

  filtersForm = this.fb.nonNullable.group({
    search: [''],
    status: [''],
    document_type: [''],
    sensitivity_label: [''],
    ai_ready: [''],
  });

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.scope = (data['scope'] || 'internal') as DocumentScope;
      this.loadDocuments();
    });
  }

  get isInternalScope(): boolean {
    return this.scope === 'internal';
  }

  get isExternalScope(): boolean {
    return this.scope === 'external';
  }

  switchScope(scope: DocumentScope): void {
    this.router.navigate(['/documents', scope]);
  }

  loadDocuments(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    const rawFilters = this.filtersForm.getRawValue();
    const filters: Record<string, string> = {};

    Object.entries(rawFilters).forEach(([key, value]) => {
      if (value) {
        filters[key] = value;
      }
    });

    this.documentsService
      .getDocuments(this.scope, filters)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (documents) => {
          this.documents = documents;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Documents load error:', error);
          this.errorMessage = 'Unable to load documents.';
          this.documents = [];
          this.cdr.markForCheck();
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

    this.router.navigate(['/documents/detail', document.uuid]);
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
    return document.status || document.processing_status || 'ready';
  }

  getAiStatus(document: any): string {
    if (document.ai_ready === true || document.is_indexed === true) {
      return 'Ready';
    }

    if (document.ai_ready === false || document.is_indexed === false) {
      return 'Pending';
    }

    return 'Ready';
  }
}
