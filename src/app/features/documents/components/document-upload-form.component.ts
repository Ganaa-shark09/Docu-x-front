import { NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-document-upload-form',
  standalone: true,
  imports: [NgFor, NgIf, ReactiveFormsModule],
  templateUrl: './document-upload-form.component.html',
  styleUrl: './document-upload-form.component.scss',
})
export class DocumentUploadFormComponent {
  @Input() isUploading = false;
  @Input() errorMessage = '';
  @Input() departments: Array<{ uuid: string; name: string }> = [];

  @Output() upload = new EventEmitter<FormData>();
  @Output() cancelled = new EventEmitter<void>();

  selectedFile: File | null = null;

  private readonly fb = new FormBuilder();

  form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
    description: [''],
    document_type: ['other', [Validators.required]],
    sensitivity_label: ['internal', [Validators.required]],
    department: [''],
  });

  onFileSelected(event: Event): void {
    this.handleFileChange(event);
  }

  handleFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;

    if (this.selectedFile && !this.form.controls.title.value) {
      this.form.controls.title.setValue(this.selectedFile.name);
    }
  }

  submit(): void {
    if (this.form.invalid || !this.selectedFile || this.isUploading) {
      this.form.markAllAsTouched();
      return;
    }

    const values = this.form.getRawValue();

    const formData = new FormData();
    formData.append('title', values.title);

    if (values.description) {
      formData.append('description', values.description);
    }
    formData.append('document_type', values.document_type);
    formData.append('sensitivity_label', values.sensitivity_label);
    formData.append('file', this.selectedFile);

    const departmentUuid = values.department;

    // Backend expects department UUID only.
    // Do not send empty string.
    if (departmentUuid) {
      formData.append('department', departmentUuid);
    }

    this.upload.emit(formData);
  }

  cancel(): void {
    this.cancelled.emit();
  }

  formatFileSize(size: number): string {
    if (!size) {
      return '0 B';
    }

    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
}
