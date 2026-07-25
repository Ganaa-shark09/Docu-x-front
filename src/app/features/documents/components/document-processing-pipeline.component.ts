import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

import { DocumentProcessingJob } from '../models/document.model';

interface PipelineStage {
  key: string;
  label: string;
  description: string;
}

@Component({
  selector: 'app-document-processing-pipeline',
  standalone: true,
  imports: [DatePipe, NgClass, NgFor, NgIf],
  templateUrl: './document-processing-pipeline.component.html',
  styleUrls: ['./document-processing-pipeline.component.scss'],
})
export class DocumentProcessingPipelineComponent {
  @Input() jobs: DocumentProcessingJob[] = [];
  @Output() refresh = new EventEmitter<void>();

  @ViewChild('pipelineCanvas')
  pipelineCanvas?: ElementRef<HTMLDivElement>;

  selectedStageKey = 'ocr';
  hoveredStageKey = '';
  zoomLevel = 1;
  panX = 0;
  panY = 0;

  @ViewChild('pipelineViewport')
  pipelineViewport?: ElementRef<HTMLDivElement>;

  isDragging = false;
  hasDragged = false;
  suppressNextClick = false;

  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartPanX = 0;
  private dragStartPanY = 0;
  private dragStartScrollLeft = 0;
  private dragStartScrollTop = 0;

  readonly minZoom = 1;
  readonly maxZoom = 1.8;
  readonly zoomStep = 0.1;

  readonly stages: PipelineStage[] = [
    {
      key: 'ocr',
      label: 'OCR',
      description: 'Extracts readable text from PDF, image, text, or CSV documents.',
    },
    {
      key: 'classification',
      label: 'Classification',
      description: 'Detects document category such as invoice, contract, policy, or report.',
    },
    {
      key: 'firewall_scan',
      label: 'Firewall Scan',
      description: 'Scans content for sensitive data and decides AI usage policy.',
    },
    {
      key: 'chunking',
      label: 'Chunking',
      description: 'Splits extracted text into semantic chunks for search and RAG.',
    },
    {
      key: 'embedding',
      label: 'Embedding',
      description: 'Generates vector embeddings for each document chunk.',
    },
    {
      key: 'indexing',
      label: 'Indexing',
      description: 'Stores document chunks and embeddings for vector search and AI chat.',
    },
  ];

  get workflowWidthPercent(): number {
    return this.zoomLevel * 100;
  }
  startPan(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;

    if (target?.closest('[data-pipeline-stage="true"]')) {
      return;
    }

    this.isDragging = true;
    this.hasDragged = false;

    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartPanX = this.panX;
    this.dragStartPanY = this.panY;

    this.pipelineCanvas?.nativeElement.setPointerCapture(event.pointerId);
  }

  pan(event: PointerEvent): void {
    if (!this.isDragging) {
      return;
    }

    const viewport = this.pipelineViewport?.nativeElement;

    if (!viewport) {
      return;
    }

    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      this.hasDragged = true;
    }

    viewport.scrollLeft = this.dragStartScrollLeft - deltaX;
    viewport.scrollTop = this.dragStartScrollTop - deltaY;
  }

  endPan(event?: PointerEvent | MouseEvent): void {
    if (!this.isDragging) {
      return;
    }

    const viewport = this.pipelineViewport?.nativeElement;

    if (viewport && event) {
      try {
        if (event && 'pointerId' in event) {
          this.pipelineCanvas?.nativeElement.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore pointer capture release errors.
      }
    }

    this.isDragging = false;

    if (this.hasDragged) {
      this.suppressNextClick = true;

      setTimeout(() => {
        this.suppressNextClick = false;
        this.hasDragged = false;
      }, 0);
    }
  }

  handleStageClick(stageKey: string): void {
    this.selectedStageKey = stageKey;
  }

  get workflowTransform(): string {
    return `translate(${this.panX}px, ${this.panY}px) translateY(-50%) scale(${this.zoomLevel})`;
  }

  get selectedStage(): PipelineStage {
    return this.stages.find((stage) => stage.key === this.selectedStageKey) || this.stages[0];
  }

  get selectedJob(): DocumentProcessingJob | null {
    return this.latestJobByType(this.selectedStage.key);
  }

  get flowTargetIndex(): number {
    const targetKey = this.hoveredStageKey || this.selectedStageKey;
    const index = this.stages.findIndex((stage) => stage.key === targetKey);
    return index >= 0 ? index : 0;
  }

  get pipelineStatusLabel(): string {
    if (this.hasFailedJob) return 'Failed';
    if (this.hasRunningJob) return 'Running';
    if (this.allSuccess) return 'Completed';
    return 'Pending';
  }

  get pipelineStatusClass(): string {
    if (this.hasFailedJob) return 'bg-red-100 text-red-700';
    if (this.hasRunningJob) return 'bg-amber-100 text-amber-700';
    if (this.allSuccess) return 'bg-emerald-100 text-emerald-700';
    return 'bg-slate-100 text-slate-700';
  }

  get hasFailedJob(): boolean {
    return this.jobs.some((job) => job.status === 'failed');
  }

  get hasRunningJob(): boolean {
    return this.jobs.some((job) => ['pending', 'running'].includes(job.status));
  }

  get allSuccess(): boolean {
    return (
      this.jobs.length > 0 &&
      this.stages.every((stage) => this.stageStatus(stage.key) === 'success')
    );
  }

  onCanvasWheel(event: WheelEvent): void {
    event.preventDefault();

    if (event.deltaY < 0) {
      this.zoomIn();
    } else {
      this.zoomOut();
    }
  }

  zoomIn(): void {
    this.zoomLevel = Math.min(this.maxZoom, Number((this.zoomLevel + this.zoomStep).toFixed(2)));
  }

  zoomOut(): void {
    this.zoomLevel = Math.max(this.minZoom, Number((this.zoomLevel - this.zoomStep).toFixed(2)));
  }

  resetZoom(): void {
    this.zoomLevel = 1;
  }

  setHover(stageKey: string): void {
    this.hoveredStageKey = stageKey;
  }

  clearHover(): void {
    this.hoveredStageKey = '';
  }

  selectStage(stageKey: string): void {
    this.selectedStageKey = stageKey;
  }

  flowDelay(index: number): string {
    return `${index * 160}ms`;
  }

  // isCardInFlow(stageKey: string): boolean {
  //   const index = this.stages.findIndex((stage) => stage.key === stageKey);
  //   return index >= 0 && index <= this.flowTargetIndex;
  // }

  isConnectorInFlow(index: number): boolean {
    return index < this.flowTargetIndex;
  }

  latestJobByType(jobType: string): DocumentProcessingJob | null {
    const matchingJobs = this.jobs
      .filter((job) => job.job_type === jobType)
      .sort((a, b) => {
        const left = new Date(a.updated_at || a.created_at).getTime();
        const right = new Date(b.updated_at || b.created_at).getTime();
        return right - left;
      });

    return matchingJobs[0] || null;
  }

  stageStatus(stageKey: string): string {
    return this.latestJobByType(stageKey)?.status || 'not_started';
  }

  icon(stageKey: string): string {
    switch (this.stageStatus(stageKey)) {
      case 'success':
        return '✓';
      case 'running':
        return '●';
      case 'pending':
        return '○';
      case 'failed':
        return '!';
      default:
        return '·';
    }
  }

  iconClass(stageKey: string): string {
    switch (this.stageStatus(stageKey)) {
      case 'success':
        return 'bg-emerald-500 text-white';
      case 'running':
        return 'animate-pulse bg-amber-500 text-white';
      case 'pending':
        return 'bg-amber-100 text-amber-700';
      case 'failed':
        return 'bg-red-500 text-white';
      default:
        return 'bg-slate-100 text-slate-400';
    }
  }

  cardClass(stageKey: string): string {
    const status = this.stageStatus(stageKey);
    const selected = this.selectedStageKey === stageKey;

    if (selected) {
      return 'border-sky-300 bg-sky-50 ring-2 ring-sky-200';
    }

    switch (status) {
      case 'success':
        return 'border-emerald-200';
      case 'running':
        return 'border-amber-300';
      case 'pending':
        return 'border-amber-200';
      case 'failed':
        return 'border-red-300';
      default:
        return 'border-slate-200';
    }
  }

  progress(stageKey: string): number {
    switch (this.stageStatus(stageKey)) {
      case 'success':
        return 100;
      case 'running':
        return 65;
      case 'pending':
        return 20;
      case 'failed':
        return 100;
      default:
        return 0;
    }
  }

  progressClass(stageKey: string): string {
    switch (this.stageStatus(stageKey)) {
      case 'success':
        return 'bg-emerald-500';
      case 'running':
        return 'bg-amber-500';
      case 'pending':
        return 'bg-amber-300';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-slate-200';
    }
  }

  connectorDotClass(stageKey: string, index: number): string {
    if (index <= this.flowTargetIndex) {
      return 'pipeline-flow-dot border-cyan-400';
    }

    switch (this.stageStatus(stageKey)) {
      case 'success':
        return 'border-emerald-500';
      case 'running':
      case 'pending':
        return 'border-amber-500';
      case 'failed':
        return 'border-red-500';
      default:
        return 'border-slate-300';
    }
  }

  connectorLineClass(leftStageKey: string, rightStageKey: string, index: number): string {
    if (this.isConnectorInFlow(index)) {
      return 'pipeline-flow-line';
    }

    const leftStatus = this.stageStatus(leftStageKey);
    const rightStatus = this.stageStatus(rightStageKey);

    if (leftStatus === 'failed' || rightStatus === 'failed') return 'bg-red-400';
    if (leftStatus === 'success' && rightStatus === 'success') return 'bg-emerald-400';

    if (
      ['success', 'running', 'pending'].includes(leftStatus) &&
      ['running', 'pending', 'success'].includes(rightStatus)
    ) {
      return 'bg-amber-400';
    }

    return 'bg-slate-300';
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'success':
        return 'bg-emerald-100 text-emerald-700';
      case 'running':
      case 'pending':
        return 'bg-amber-100 text-amber-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }

  durationLabel(stageKey: string): string {
    const job = this.latestJobByType(stageKey);

    if (!job?.started_at) return '';

    const started = new Date(job.started_at).getTime();
    const finished = job.completed_at
      ? new Date(job.completed_at).getTime()
      : new Date(job.updated_at || job.started_at).getTime();

    const diffSeconds = Math.max(0, Math.round((finished - started) / 1000));

    if (diffSeconds < 60) return `${diffSeconds}s`;

    const minutes = Math.floor(diffSeconds / 60);
    const seconds = diffSeconds % 60;

    if (minutes < 60) return `${minutes}m ${seconds}s`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}h ${remainingMinutes}m`;
  }

  formatLabel(value: string): string {
    return value
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}
