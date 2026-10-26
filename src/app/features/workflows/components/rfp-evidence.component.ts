import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, Input, OnChanges, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, takeUntil, timeout } from 'rxjs';
import { DocumentsService } from '../../documents/services/documents.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { RFPWorkflowService } from '../services/rfp-workflow.service';
import { RFPEvidence } from '../models/rfp.model';
@Component({
  selector: 'app-rfp-evidence',
  standalone: true,
  styleUrls: ['../workflow.scss', './rfp.scss'],
  template: ` @if (!revoked()) {
    <article class="evidence">
      <h4>{{ internal ? 'Internal company evidence' : 'Solicitation source proof' }}</h4>
      <p class="pre">{{ excerpt }}</p>
      <p class="muted">
        Source {{ evidence.document_uuid }} · Page {{ evidence.page ?? 'Unavailable' }} · Governance
        revision {{ evidence.governance_revision }}
      </p>
      @if (internal) {
        <p>Evidence is for authorized reviewers. It is not an approved submission attachment.</p>
      }
      <button (click)="preview()" [disabled]="loading()">Preview authenticated source</button>
      @if (url()) {
        <button (click)="close()">Close preview</button>
        @if (image) {
          <img [src]="url()" alt="RFP source preview" />
        } @else {
          <iframe [src]="safeUrl" title="RFP source preview" sandbox="allow-same-origin"></iframe>
        }
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
    </article>
  }`,
})
export class RFPEvidenceComponent implements OnChanges {
  @Input({ required: true }) evidence!: RFPEvidence;
  @Input() internal = false;
  private documents = inject(DocumentsService);
  private governance = inject(DocumentGovernanceService);
  private realtime = inject(DocumentRealtimeService);
  private api = inject(RFPWorkflowService);
  private sanitizer = inject(DomSanitizer);
  private destroy = inject(DestroyRef);
  private cancel = new Subject<void>();
  readonly url = signal<string | null>(null);
  readonly loading = signal(false);
  readonly revoked = signal(false);
  readonly error = signal('');
  safeUrl: SafeResourceUrl | null = null;
  image = false;
  get excerpt() {
    return 'quote' in this.evidence ? this.evidence.quote : this.evidence.preview;
  }
  constructor() {
    for (const events of [this.governance.changes$, this.realtime.revoked$, this.api.revoked$])
      events.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
        this.revoked.set(true);
        this.close();
      });
    this.destroy.onDestroy(() => {
      this.close();
      this.cancel.complete();
    });
  }
  ngOnChanges() {
    this.close();
    this.revoked.set(false);
    this.error.set('');
    this.realtime.subscribeDocuments([this.evidence.document_uuid]);
  }
  close() {
    this.cancel.next();
    const url = this.url();
    if (url) URL.revokeObjectURL(url);
    this.url.set(null);
    this.safeUrl = null;
    this.loading.set(false);
  }
  preview() {
    this.close();
    if (this.revoked()) return;
    this.loading.set(true);
    this.documents
      .getFile(this.evidence.document_uuid, 'preview', 'internal')
      .pipe(timeout(15000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (blob) => {
          this.loading.set(false);
          if (
            !['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
              blob.type,
            )
          ) {
            this.error.set('Source preview format is unavailable.');
            return;
          }
          this.image = blob.type.startsWith('image/');
          const url = URL.createObjectURL(blob);
          this.url.set(url);
          this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
        },
        error: (e) => {
          this.close();
          this.revoked.set(e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status));
          this.error.set(this.api.message(e));
        },
      });
  }
}
