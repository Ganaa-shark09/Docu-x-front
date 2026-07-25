import { NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { DepartmentOption } from '../models/document.model';
import { DocumentsService } from '../services/documents.service';

@Component({
  selector: 'app-document-upload-form',
  standalone: true,
  imports: [NgFor, NgIf, ReactiveFormsModule],
  templateUrl: './document-upload-form.component.html',
  styleUrls: ['./document-upload-form.component.scss'],
})
export class DocumentUploadFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly documentsService = inject(DocumentsService);

  @Input() departments: DepartmentOption[] = [];
  @Output() uploaded = new EventEmitter<void>();

  selectedFile: File | null = null;
  isUploading = false;
  errorMessage = '';

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
    description: [''],
    document_type: ['invoice', [Validators.required]],
    sensitivity_label: ['internal', [Validators.required]],
    department: [''],
  });

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;

    if (this.selectedFile && !this.form.controls.title.value.trim()) {
      const title = this.selectedFile.name.replace(/\.[^/.]+$/, '');
      this.form.controls.title.setValue(title);
    }
  }

  submit(): void {
    if (this.form.invalid || !this.selectedFile || this.isUploading) {
      this.form.markAllAsTouched();
      return;
    }

    this.isUploading = true;
    this.errorMessage = '';

    const values = this.form.getRawValue();

    this.documentsService
      .uploadDocument({
        title: values.title,
        description: values.description,
        document_type: values.document_type,
        sensitivity_label: values.sensitivity_label,
        department: values.department,
        file: this.selectedFile,
      })
      .pipe(
        finalize(() => {
          this.isUploading = false;
        }),
      )
      .subscribe({
        next: () => {
          this.form.reset({
            title: '',
            description: '',
            document_type: 'invoice',
            sensitivity_label: 'internal',
            department: '',
          });

          this.selectedFile = null;
          this.uploaded.emit();
        },
        error: (error) => {
          console.error('Document upload failed:', error);

          this.errorMessage =
            error?.error?.detail ||
            error?.error?.file?.[0] ||
            error?.error?.document_type?.[0] ||
            error?.error?.sensitivity_label?.[0] ||
            'Document upload failed. Please verify the backend and file type.';
        },
      });
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
