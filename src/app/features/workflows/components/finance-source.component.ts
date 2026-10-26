import { Component, DestroyRef, OnChanges, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, takeUntil, finalize } from 'rxjs';
import { DocumentsService } from '../../documents/services/documents.service';
import { FinanceWorkspaceStore } from '../services/finance-workspace.store';
@Component({
  selector: 'app-finance-source',
  standalone: true,
  styleUrls: ['../workflow.scss', './finance.scss'],
  template: `<div class="source">
    <p class="pre">Source: {{ document() }}</p>
    <button (click)="preview()" [disabled]="busy()">Preview authenticated source</button>
    @if (url()) {
      <button (click)="close()">Close preview</button>
      @if (image()) {
        <img [src]="url()" alt="Financial supporting document" />
      } @else {
        <iframe [src]="safe" title="Financial source preview" sandbox="allow-same-origin"></iframe>
      }
    }
    @if (message()) {
      <p role="status">{{ message() }}</p>
    }
  </div>`,
})
export class FinanceSourceComponent implements OnChanges {
  ngOnChanges() {
    this.close();
    this.s.realtime.subscribeDocuments([this.document()]);
  }
  readonly document = input.required<string>();
  readonly s = inject(FinanceWorkspaceStore);
  private docs = inject(DocumentsService);
  private sanitizer = inject(DomSanitizer);
  private destroy = inject(DestroyRef);
  private cancel = new Subject<void>();
  readonly url = signal<string | null>(null);
  readonly image = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  safe: SafeResourceUrl | null = null;
  constructor() {
    this.destroy.onDestroy(() => {
      this.close();
      this.cancel.complete();
    });
  }
  close() {
    this.cancel.next();
    const url = this.url();
    if (url) URL.revokeObjectURL(url);
    this.url.set(null);
    this.safe = null;
    this.busy.set(false);
  }
  preview() {
    if (this.busy()) return;
    this.close();
    this.busy.set(true);
    this.message.set('');
    this.s.realtime.subscribeDocuments([this.document()]);
    this.s.read(
      this.docs.getFile(this.document(), 'preview', 'internal').pipe(
        takeUntil(this.cancel),
        finalize(() => this.busy.set(false)),
      ),
      (blob) => {
        if (
          !['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
            blob.type,
          )
        ) {
          this.message.set('Authenticated preview is unavailable for this file format.');
          return;
        }
        const url = URL.createObjectURL(blob);
        this.url.set(url);
        this.image.set(blob.type.startsWith('image/'));
        this.safe = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      },
    );
  }
}
