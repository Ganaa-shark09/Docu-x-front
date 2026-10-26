import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import {
  InvoiceField,
  InvoiceKey,
  InvoiceProvenance,
  invoiceConfidence,
  invoiceValue,
} from '../models/invoice.model';
import { label } from '../models/workflow.model';
@Component({
  selector: 'app-invoice-field',
  standalone: true,
  imports: [DatePipe],
  styleUrls: ['../workflow.scss', './invoice.scss'],
  template: ` <article
    class="card invoice-field"
    [class.current]="field()?.validation_status === 'invalid'"
  >
    <header>
      <h3>{{ label(key()) }}</h3>
      @if (field(); as f) {
        <span class="badge">{{ label(f.validation_status) }} · {{ label(f.review_status) }}</span>
      }
    </header>
    <p class="field-value">{{ value(field()?.normalized_value) }}</p>
    @if (field(); as f) {
      <p class="muted">
        Extraction confidence: {{ confidence(f.extracted_confidence) }} · An estimate, not
        verification.
      </p>
      <p class="muted">
        Method: {{ f.extraction_method ? label(f.extraction_method) : 'Unavailable' }}
        @if (f.confidence_basis) {
          · Basis: {{ label(f.confidence_basis) }}
        }
      </p>
      <details>
        <summary>Original value and review history</summary>
        <p>Original extracted value</p>
        <pre>{{ f.raw_value ?? 'Unknown' }}</pre>
        @if (f.corrected_value !== null) {
          <p>Reviewer correction</p>
          <pre>{{ f.corrected_value }}</pre>
        }
        @if (f.reviewed_at) {
          <p>
            Reviewed by User {{ f.reviewed_by ?? 'Unavailable' }} ·
            {{ f.reviewed_at | date: 'medium' }}
          </p>
        }
        @for (c of history(); track c.uuid) {
          <article class="step">
            <p>
              Revision {{ c.revision }} · User {{ c.actor ?? 'Unavailable' }} ·
              {{ c.created_at | date: 'medium' }}
            </p>
            <p>Previous: {{ c.previous_value || 'Unknown' }}</p>
            <p>Corrected: {{ c.corrected_value || 'Unknown' }}</p>
            <p>Reason: {{ c.reason }}</p>
          </article>
        }
      </details>
      <div class="actions">
        @if (f.evidence.length) {
          <button [disabled]="busy()" (click)="evidence.emit(key())">
            View {{ label(key()) }} evidence
          </button>
        } @else {
          <span class="muted">Source evidence unavailable</span>
        }
        @if (canCorrect()) {
          <button [disabled]="busy()" (click)="edit.emit(key())">Correct {{ label(key()) }}</button>
        }
      </div>
    }
  </article>`,
})
export class InvoiceFieldComponent {
  readonly key = input.required<InvoiceKey>();
  readonly field = input<InvoiceProvenance | null>(null);
  readonly history = input<InvoiceField['corrections']>([]);
  readonly canCorrect = input(false);
  readonly busy = input(false);
  readonly evidence = output<InvoiceKey>();
  readonly edit = output<InvoiceKey>();
  readonly label = label;
  readonly value = invoiceValue;
  readonly confidence = invoiceConfidence;
}
