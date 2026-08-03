import { DatePipe, NgFor, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

import { ApprovalComment } from '../../models/approval.model';

@Component({
  selector: 'app-approval-comment-list',
  standalone: true,
  imports: [DatePipe, NgFor, NgIf],
  templateUrl: './approval-comment-list.component.html',
  styleUrl: './approval-comment-list.component.scss',
})
export class ApprovalCommentListComponent {
  @Input() comments: ApprovalComment[] = [];
}
