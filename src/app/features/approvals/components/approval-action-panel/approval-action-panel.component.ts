import { NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { ApprovalAction } from '../../models/approval.model';

@Component({
  selector: 'app-approval-action-panel',
  standalone: true,
  imports: [NgIf, ReactiveFormsModule],
  templateUrl: './approval-action-panel.component.html',
  styleUrl: './approval-action-panel.component.scss',
})
export class ApprovalActionPanelComponent {
  @Input() isSubmitting = false;
  @Input() disabled = false;

  @Output() actionSelected = new EventEmitter<{
    action: ApprovalAction;
    comment: string;
  }>();

  commentControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(2000)],
  });

  submit(action: ApprovalAction): void {
    const comment = this.commentControl.value.trim();

    if ((action === 'reject' || action === 'request_changes') && !comment) {
      this.commentControl.setErrors({ required: true });
      this.commentControl.markAsTouched();
      return;
    }

    this.actionSelected.emit({ action, comment });
  }
}
