import { DatePipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { ApprovalDocument, ApprovalRequest } from '../../models/approval.model';
import { ApprovalService } from '../../services/approval.service';
import { ApprovalStatusBadgeComponent } from '../../components/approval-status-badge/approval-status-badge.component';

@Component({
  selector: 'app-approval-list-page',
  standalone: true,
  imports: [
    ApprovalStatusBadgeComponent,
    DatePipe,
    NgFor,
    NgIf,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './approval-list-page.component.html',
  styleUrl: './approval-list-page.component.scss',
})
export class ApprovalListPageComponent implements OnInit {
  private readonly approvalService = inject(ApprovalService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  approvals: ApprovalRequest[] = [];
  isLoading = false;
  errorMessage = '';

  filtersForm = this.fb.nonNullable.group({
    search: [''],
    status: [''],
  });

  ngOnInit(): void {
    this.loadApprovals();
  }

  loadApprovals(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    this.approvalService
      .getApprovals(this.filtersForm.getRawValue())
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (approvals) => {
          console.log('Approvals loaded:', approvals);
          this.approvals = approvals;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Approval list error:', error);
          this.errorMessage = 'Unable to load approval requests.';
          this.approvals = [];
          this.cdr.markForCheck();
        },
      });
  }

  resetFilters(): void {
    this.filtersForm.reset({
      search: '',
      status: '',
    });

    this.loadApprovals();
  }

  getDocumentTitle(approval: ApprovalRequest): string {
    const document = this.getDocumentObject(approval);

    return (
      document?.title ||
      approval.document_title ||
      approval.title ||
      'Untitled approval'
    );
  }

  getDocumentFileLabel(approval: ApprovalRequest): string {
    const document = this.getDocumentObject(approval);

    return (
      document?.original_filename ||
      approval.document_uuid ||
      approval.description ||
      'Approval request'
    );
  }

  private getDocumentObject(approval: ApprovalRequest): ApprovalDocument | null {
    if (approval.document && typeof approval.document === 'object') {
      return approval.document;
    }

    return null;
  }
}
