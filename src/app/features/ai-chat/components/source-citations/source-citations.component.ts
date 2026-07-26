import { NgFor, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

import { AiSourceCitation } from '../../models/ai-chat.model';

@Component({
  selector: 'app-source-citations',
  standalone: true,
  imports: [NgFor, NgIf],
  templateUrl: './source-citations.component.html',
  styleUrl: './source-citations.component.scss',
})
export class SourceCitationsComponent {
  @Input() sources: AiSourceCitation[] = [];

  formatScore(score?: number): string {
    if (score === undefined || score === null) {
      return '-';
    }

    return `${Math.round(score * 100)}%`;
  }
}
