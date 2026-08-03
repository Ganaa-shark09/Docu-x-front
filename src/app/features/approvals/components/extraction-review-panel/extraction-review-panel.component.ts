import { KeyValuePipe, NgFor, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

import { ExtractionFieldReview } from '../../models/approval.model';

@Component({
  selector: 'app-extraction-review-panel',
  standalone: true,
  imports: [KeyValuePipe, NgFor, NgIf],
  templateUrl: './extraction-review-panel.component.html',
  styleUrl: './extraction-review-panel.component.scss',
})
export class ExtractionReviewPanelComponent {
  @Input() fields: ExtractionFieldReview[] = [];
  @Input() extractedData: Record<string, unknown> | null = null;

  get hasStructuredFields(): boolean {
    return !!this.fields?.length;
  }

  get hasRawData(): boolean {
    return !!this.extractedData && Object.keys(this.extractedData).length > 0;
  }

  formatLabel(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  formatValue(value: unknown): string {
    const normalized = this.extractValue(value);

    if (normalized === null || normalized === undefined || normalized === '') {
      return 'Not extracted';
    }

    if (typeof normalized === 'object') {
      return JSON.stringify(normalized, null, 2);
    }

    return String(normalized);
  }

  formatConfidence(value: unknown): string {
    const confidence = this.extractConfidence(value);

    if (confidence === null || confidence === undefined || Number.isNaN(confidence)) {
      return '';
    }

    if (confidence <= 1) {
      return `${Math.round(confidence * 100)}%`;
    }

    return `${Math.round(confidence)}%`;
  }

  hasConfidence(value: unknown): boolean {
    return !!this.formatConfidence(value);
  }

  private extractValue(value: unknown): unknown {
    if (!this.isRecord(value)) {
      return value;
    }

    if ('value' in value) {
      return value['value'];
    }

    if ('corrected_value' in value && value['corrected_value']) {
      return value['corrected_value'];
    }

    if ('new_value' in value && value['new_value']) {
      return value['new_value'];
    }

    if ('extracted_value' in value) {
      return value['extracted_value'];
    }

    return value;
  }

  private extractConfidence(value: unknown): number | null {
    if (!this.isRecord(value)) {
      return null;
    }

    const rawConfidence =
      value['confidence'] ??
      value['confidence_score'] ??
      value['score'];

    if (rawConfidence === null || rawConfidence === undefined || rawConfidence === '') {
      return null;
    }

    const confidence = Number(rawConfidence);
    return Number.isFinite(confidence) ? confidence : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
