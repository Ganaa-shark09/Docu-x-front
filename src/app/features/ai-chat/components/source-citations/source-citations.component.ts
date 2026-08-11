import { NgClass, NgFor, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

import { AiSource } from '../../models/ai-chat.model';

@Component({
  selector: 'app-source-citations',
  standalone: true,
  imports: [NgClass, NgFor, NgIf],
  templateUrl: './source-citations.component.html',
  styleUrl: './source-citations.component.scss',
})
export class SourceCitationsComponent {
  @Input() sources: AiSource[] = [];

  expandedSourceKeys = new Set<string>();

  get visibleSources(): AiSource[] {
    return (this.sources || []).filter((source) => source.source_type !== 'system_warning');
  }

  get warningSources(): AiSource[] {
    return (this.sources || []).filter((source) => source.source_type === 'system_warning');
  }

  get sourceLayoutClass(): string {
    const hasWeb = this.visibleSources.some((source) => source.source_type === 'web');
    const hasDocument = this.visibleSources.some((source) =>
      ['external_document', 'internal_document'].includes(String(source.source_type || '')),
    );

    if (hasDocument && !hasWeb) {
      return 'source-card source-card--document-layout';
    }

    if (hasWeb && !hasDocument) {
      return 'source-card source-card--web-layout';
    }

    return 'source-card source-card--mixed-layout';
  }

  getSourceItemClass(source: AiSource): Record<string, boolean> {
    return {
      'source-item': true,
      'source-item--web': source.source_type === 'web',
      'source-item--document': source.source_type === 'external_document' || source.source_type === 'internal_document',
      'source-item--processing': source.source_type === 'processing_document',
      'source-item--failed': source.source_type === 'failed_document',
    };
  }

  getSourceLabel(source: AiSource): string {
    if (source.source_type === 'web') {
      return 'Web';
    }

    if (source.source_type === 'external_document') {
      return 'External document';
    }

    if (source.source_type === 'internal_document') {
      return 'Internal document';
    }

    if (source.source_type === 'processing_document') {
      return 'Processing';
    }

    if (source.source_type === 'failed_document') {
      return 'Failed document';
    }

    return 'Source';
  }

  getTitle(source: AiSource): string {
    return (
      source.title ||
      source.document_title ||
      source.document ||
      'Source'
    );
  }

  getPreview(source: AiSource): string {
    if (source.source_type === 'processing_document') {
      return `Processing: ${source.status || 'processing'}`;
    }

    if (source.source_type === 'failed_document') {
      return source.processing_error
        ? `Processing failed: ${source.processing_error}. Re-upload or try again after fixing the file.`
        : 'Processing failed. Re-upload or try again.';
    }

    return (
      source.snippet ||
      source.content_preview ||
      source.preview ||
      source.text ||
      ''
    );
  }

  isLongPreview(source: AiSource): boolean {
    return this.getPreview(source).length > 220;
  }

  isExpanded(source: AiSource, index: number): boolean {
    return this.expandedSourceKeys.has(this.getSourceKey(source, index));
  }

  togglePreview(source: AiSource, index: number): void {
    const key = this.getSourceKey(source, index);

    if (this.expandedSourceKeys.has(key)) {
      this.expandedSourceKeys.delete(key);
    } else {
      this.expandedSourceKeys.add(key);
    }
  }

  getWarningText(source: AiSource): string {
    return source.warning || source.message || source.snippet || source.processing_error || '';
  }

  private getSourceKey(source: AiSource, index: number): string {
    return source.document_uuid || source.url || `${source.source_type || 'source'}-${index}`;
  }
}
