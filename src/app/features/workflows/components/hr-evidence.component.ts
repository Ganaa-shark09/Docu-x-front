import { ChangeDetectorRef, Component, DestroyRef, Input, OnChanges, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, switchMap, takeUntil, timeout } from 'rxjs';
import { DocumentsService } from '../../documents/services/documents.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { HRPolicyService } from '../services/hr-policy.service';
import { HREvidence } from '../models/hr-policy.model';
@Component({
  selector: 'app-hr-evidence',
  standalone: true,
  styleUrls: ['../workflow.scss'],
  template: `
    @if (!revoked) {
      <article class="card">
        <p style="white-space:pre-wrap;overflow-wrap:anywhere">
          {{ evidence.excerpt || evidence.preview }}
        </p>
        <p>
          {{ evidence.policy_title || 'Policy source' }}
          @if (evidence.policy_status) {
            · Source status: {{ evidence.policy_status }}
          }
          @if (evidence.version) {
            · Version {{ evidence.version }}
          }
          @if (evidence.section) {
            · {{ evidence.section }}
          }
        </p>
        <p>
          Page {{ evidence.page ?? 'Unavailable' }} · Offsets {{ evidence.start }}–{{
            evidence.end
          }}
          · {{ evidence.method }} · {{ evidence.effective_from || '' }}
          {{ evidence.effective_until || '' }}
        </p>
        <button (click)="preview()" [disabled]="loading">Preview authenticated source</button>
        @if (error) {
          <p class="error" role="alert">{{ error }}</p>
        }
        @if (url) {
          <button (click)="close()">Close source preview</button>
          @if (image) {
            <img [src]="url" alt="Policy source preview" style="max-width:100%;max-height:60vh" />
          } @else {
            <iframe
              [src]="safeUrl"
              title="Policy source preview"
              sandbox="allow-same-origin"
              style="width:100%;height:50vh;border:0"
            ></iframe>
          }
        }
      </article>
    }
  `,
})
export class HREvidenceComponent implements OnChanges {
  @Input({ required: true }) evidence!: HREvidence;
  @Input() versionUuid?: string;
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly documents = inject(DocumentsService);
  private readonly api = inject(HRPolicyService);
  private readonly governance = inject(DocumentGovernanceService);
  private readonly realtime = inject(DocumentRealtimeService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroy = inject(DestroyRef);
  private readonly cancel = new Subject<void>();
  url: string | null = null;
  safeUrl: SafeResourceUrl | null = null;
  image = false;
  loading = false;
  error = '';
  revoked = false;
  constructor() {
    for (const events of [this.governance.changes$, this.realtime.revoked$, this.api.revoked$])
      events.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
        this.revoked = true;
        this.close();
      });
    this.destroy.onDestroy(() => {
      this.close();
      this.cancel.complete();
    });
  }
  ngOnChanges(): void {
    this.close();
    this.revoked = false;
    this.error = '';
    if (this.evidence?.document_uuid)
      this.realtime.subscribeDocuments([this.evidence.document_uuid]);
  }
  close(): void {
    this.cancel.next();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.safeUrl = null;
    this.loading = false;
    this.cdr.markForCheck();
  }
  preview(): void {
    this.close();
    this.error = '';
    if (this.revoked || !this.evidence?.document_uuid) return;
    this.loading = true;
    const file = () => this.documents.getFile(this.evidence.document_uuid, 'preview', 'internal');
    const version = this.versionUuid || this.evidence.policy_version_uuid;
    const request = version ? this.api.version(version).pipe(switchMap(() => file())) : file();
    request
      .pipe(timeout(15000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (blob) => {
          this.loading = false;
          this.cdr.markForCheck();
          if (
            !['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
              blob.type,
            )
          ) {
            this.error = 'Source preview format is unavailable.';
            return;
          }
          this.image = blob.type.startsWith('image/');
          this.url = URL.createObjectURL(blob);
          this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
        },
        error: (error) => {
          this.close();
          this.revoked = true;
          this.error = this.api.message(error);
        },
      });
  }
}
