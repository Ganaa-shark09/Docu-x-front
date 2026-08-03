import { DatePipe, NgIf } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApprovalAction, ApprovalRequest } from '../../models/approval.model';
import { ApprovalService } from '../../services/approval.service';
import { ApprovalActionPanelComponent } from '../../components/approval-action-panel/approval-action-panel.component';
import { ApprovalCommentListComponent } from '../../components/approval-comment-list/approval-comment-list.component';
import { ApprovalStatusBadgeComponent } from '../../components/approval-status-badge/approval-status-badge.component';
import { ExtractionReviewPanelComponent } from '../../components/extraction-review-panel/extraction-review-panel.component';

@Component({
  selector: 'app-approval-detail-page',
  standalone: true,
  imports: [
    ApprovalActionPanelComponent,
    ApprovalCommentListComponent,
    ApprovalStatusBadgeComponent,
    DatePipe,
    ExtractionReviewPanelComponent,
    NgIf,
    RouterLink,
  ],
  templateUrl: './approval-detail-page.component.html',
  styleUrl: './approval-detail-page.component.scss',
})
export class ApprovalDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly approvalService = inject(ApprovalService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  approval: ApprovalRequest | null = null;
  isLoading = false;
  isSubmitting = false;
  errorMessage = '';

  ngOnInit(): void {
    this.loadApproval();
  }

  loadApproval(): void {
    const uuid = this.route.snapshot.paramMap.get('uuid');

    if (!uuid) {
      this.router.navigate(['/approvals']);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.approval = null;
    this.cdr.markForCheck();

    this.approvalService.getApproval(uuid).subscribe({
      next: (approval) => {
        this.ngZone.run(() => {
          console.log('Approval detail loaded:', approval);
          this.approval = approval;
          this.isLoading = false;
          this.errorMessage = '';
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Approval detail error:', error);
          this.approval = null;
          this.isLoading = false;
          this.errorMessage = 'Unable to load approval detail.';
          this.cdr.detectChanges();
        });
      },
    });
  }

  handleAction(event: { action: ApprovalAction; comment: string }): void {
    if (!this.approval) {
      return;
    }

    const payload = {
      comment: event.comment,
      reviewer_notes: event.comment,
    };

    this.isSubmitting = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    const request =
      event.action === 'approve'
        ? this.approvalService.approve(this.approval.uuid, payload)
        : event.action === 'reject'
          ? this.approvalService.reject(this.approval.uuid, payload)
          : this.approvalService.requestChanges(this.approval.uuid, payload);

    request.subscribe({
      next: (approval) => {
        this.ngZone.run(() => {
          this.approval = approval;
          this.isSubmitting = false;
          this.errorMessage = '';
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Approval action error:', error);
          this.isSubmitting = false;
          this.errorMessage = 'Unable to submit approval action.';
          this.cdr.detectChanges();
        });
      },
    });
  }

  get documentTitle(): string {
    return (
      this.approval?.document_title ||
      this.getDocumentObjectTitle() ||
      this.approval?.title ||
      'Approval detail'
    );
  }

  get documentFileLabel(): string {
    return (
      this.getDocumentObjectFilename() ||
      this.approval?.document_uuid ||
      'Document linked to approval'
    );
  }

  get requesterLabel(): string {
    return (
      this.approval?.requester_name ||
      this.approval?.requested_by_email ||
      this.approval?.created_by_name ||
      '-'
    );
  }

  get reviewerLabel(): string {
    return (
      this.approval?.assigned_reviewer_name ||
      this.approval?.assigned_to_email ||
      '-'
    );
  }

  get extractionData(): Record<string, unknown> | null {
    return (
      this.approval?.submitted_payload ||
      this.approval?.extracted_data ||
      this.approval?.reviewed_payload ||
      null
    );
  }

  get isFinalStatus(): boolean {
    return ['approved', 'rejected', 'cancelled'].includes(this.approval?.status || '');
  }

  private getDocumentObjectTitle(): string {
    const document = this.approval?.document;

    if (document && typeof document === 'object') {
      return document.title || '';
    }

    return '';
  }

  private getDocumentObjectFilename(): string {
    const document = this.approval?.document;

    if (document && typeof document === 'object') {
      return document.original_filename || '';
    }

    return '';
  }
}
