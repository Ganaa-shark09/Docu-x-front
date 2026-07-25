import { DatePipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
// import { finalize } from 'rxjs';

import {
  DepartmentOption,
  DocumentFilters,
  DocumentListItem,
} from '../models/document.model';
import { DocumentStatusBadgeComponent } from '../components/document-status-badge.component';
import { DocumentUploadFormComponent } from '../components/document-upload-form.component';
import { DocumentsService } from '../services/documents.service';

@Component({
  selector: 'app-document-list-page',
  standalone: true,
  imports: [
    DatePipe,
    DocumentStatusBadgeComponent,
    DocumentUploadFormComponent,
    NgFor,
    NgIf,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './document-list-page.component.html',
  styleUrls: ['./document-list-page.component.scss'],
})
export class DocumentListPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly documentsService = inject(DocumentsService);
  private readonly cdr = inject(ChangeDetectorRef);

  documents: DocumentListItem[] = [];
  departments: DepartmentOption[] = [];

  isLoading = false;
  showUpload = false;
  errorMessage = '';

  totalCount = 0;
  nextUrl: string | null = null;
  previousUrl: string | null = null;
  currentPage = 1;

  readonly filtersForm = this.fb.nonNullable.group({
    search: [''],
    status: [''],
    document_type: [''],
    sensitivity_label: [''],
    is_ai_ready: [''],
  });

  constructor() {
    this.loadDepartments();
    this.loadDocuments();
  }

  toggleUpload(): void {
    this.showUpload = !this.showUpload;
  }

  handleUploaded(): void {
    this.showUpload = false;
    this.currentPage = 1;
    this.loadDocuments();
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.loadDocuments();
  }

  resetFilters(): void {
    this.filtersForm.reset({
      search: '',
      status: '',
      document_type: '',
      sensitivity_label: '',
      is_ai_ready: '',
    });
    this.currentPage = 1;
    this.loadDocuments();
  }

  nextPage(): void {
    if (!this.nextUrl) {
      return;
    }

    this.currentPage += 1;
    this.loadDocuments();
  }

  previousPage(): void {
    if (!this.previousUrl || this.currentPage <= 1) {
      return;
    }

    this.currentPage -= 1;
    this.loadDocuments();
  }

  loadDocuments(): void {
  this.isLoading = true;
  this.errorMessage = '';

  const filters: DocumentFilters = {
    ...this.filtersForm.getRawValue(),
    page: this.currentPage,
    ordering: '-created_at',
  };

  this.documentsService.listDocuments(filters).subscribe({
    next: (response) => {
      console.log('Documents loaded:', response);

      this.documents = Array.isArray(response.results) ? [...response.results] : [];
      this.totalCount = Number(response.count || this.documents.length || 0);
      this.nextUrl = response.next ?? null;
      this.previousUrl = response.previous ?? null;
      this.isLoading = false;

      this.cdr.detectChanges();
    },
    error: (error) => {
      console.error('Document list API failed:', error);

      this.documents = [];
      this.totalCount = 0;
      this.nextUrl = null;
      this.previousUrl = null;
      this.isLoading = false;

      this.errorMessage =
        error?.error?.detail ||
        JSON.stringify(error?.error || {}) ||
        'Unable to load documents. Please confirm backend is running.';

      this.cdr.detectChanges();
    },
  });
}

  private loadDepartments(): void {
    this.documentsService.listDepartments().subscribe({
      next: (response) => {
        this.departments = response.results;
      },
      error: () => {
        this.departments = [];
      },
    });
  }

  formatLabel(value: string): string {
    return value
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  formatFileSize(size: number): string {
    if (!size) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.floor(Math.log(size) / Math.log(1024));
    return `${(size / Math.pow(1024, index)).toFixed(2)} ${units[index]}`;
  }
}
