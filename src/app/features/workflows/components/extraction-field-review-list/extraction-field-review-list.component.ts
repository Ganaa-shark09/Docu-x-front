import { KeyValuePipe, NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ExtractionResultField } from '../../models/extraction-workflow.model';

@Component({
  selector: 'app-extraction-field-review-list',
  standalone: true,
  imports: [FormsModule, KeyValuePipe, NgFor, NgIf],
  templateUrl: './extraction-field-review-list.component.html',
  styleUrl: './extraction-field-review-list.component.scss',
})
export class ExtractionFieldReviewListComponent {
  @Input() fields: ExtractionResultField[] = [];
  @Input() rawData: Record<string, unknown> | null = null;
  @Input() isSavingFieldUuid: string | null = null;

  @Output() correctionSubmitted = new EventEmitter<{
    fieldUuid: string;
    correctedValue: unknown;
    reviewerComment: string;
  }>();

  corrections: Record<string, string> = {};
  comments: Record<string, string> = {};

  get hasFields(): boolean {
    return !!this.fields?.length;
  }

  get hasRawData(): boolean {
    return !!this.rawData && Object.keys(this.rawData).length > 0;
  }

  getFieldLabel(field: ExtractionResultField): string {
    return field.label || this.formatLabel(field.field_name);
  }

  getFieldValue(field: ExtractionResultField): string {
    const value =
      field.corrected_value ??
      field.value ??
      field.extracted_value ??
      '';

    return this.formatValue(value);
  }

  getConfidence(field: ExtractionResultField): string {
    const raw = field.confidence ?? field.confidence_score;

    if (raw === null || raw === undefined || raw === '') {
      return '';
    }

    const value = Number(raw);

    if (!Number.isFinite(value)) {
      return '';
    }

    if (value <= 1) {
      return `${Math.round(value * 100)}%`;
    }

    return `${Math.round(value)}%`;
  }

  formatLabel(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  formatValue(value: unknown): string {
    const normalized = this.extractNestedValue(value);

    if (normalized === null || normalized === undefined || normalized === '') {
      return 'Not extracted';
    }

    if (typeof normalized === 'object') {
      return JSON.stringify(normalized, null, 2);
    }

    return String(normalized);
  }

  getRawConfidence(value: unknown): string {
    if (!this.isRecord(value)) {
      return '';
    }

    const confidence = value['confidence'] ?? value['confidence_score'] ?? value['score'];

    if (confidence === null || confidence === undefined || confidence === '') {
      return '';
    }

    const numericConfidence = Number(confidence);

    if (!Number.isFinite(numericConfidence)) {
      return '';
    }

    return numericConfidence <= 1
      ? `${Math.round(numericConfidence * 100)}%`
      : `${Math.round(numericConfidence)}%`;
  }

  submitCorrection(field: ExtractionResultField): void {
    const correctedValue = this.corrections[field.uuid];

    this.correctionSubmitted.emit({
      fieldUuid: field.uuid,
      correctedValue: correctedValue ?? this.getFieldValue(field),
      reviewerComment: this.comments[field.uuid] || '',
    });
  }

  private extractNestedValue(value: unknown): unknown {
    if (!this.isRecord(value)) {
      return value;
    }

    return (
      value['corrected_value'] ??
      value['value'] ??
      value['extracted_value'] ??
      value['new_value'] ??
      value
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
