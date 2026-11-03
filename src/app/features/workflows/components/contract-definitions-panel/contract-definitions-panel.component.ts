import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Definition } from '../../models/workflow.model';

/** Presentation-only: permission checks, pagination and mutations remain in the host. */
@Component({
  selector: 'app-contract-definitions-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './contract-definitions-panel.component.html',
  styleUrl: './contract-definitions-panel.component.scss',
})
export class ContractDefinitionsPanelComponent {
  @Input() definitions: Definition[] = [];
  @Input() totalCount = 0;
  @Input() currentPage = 1;
  @Input() hasNext = false;
  @Input() hasPrevious = false;
  @Input() canCreate = false;
  @Input() busy = false;
  @Input() formOpen = false;
  @Input() loading = false;
  @Input() error = '';
  @Input() directoryError = '';
  @Output() createWorkflow = new EventEmitter<void>();
  @Output() refreshWorkflows = new EventEmitter<void>();
  @Output() openWorkflow = new EventEmitter<Definition>();
  @Output() pageChange = new EventEmitter<number>();

  search = '';
  status = 'all';

  statusOf(item: Definition): 'published' | 'draft' | 'inactive' {
    if (!item.is_active) return 'inactive';
    return item.latest_version ? 'published' : 'draft';
  }

  get filtered(): Definition[] {
    const term = this.search.trim().toLowerCase();
    return this.definitions.filter(item =>
      (this.status === 'all' || this.statusOf(item) === this.status) &&
      (!term || [item.name, item.description, this.scopeOf(item)]
        .some(value => (value || '').toLowerCase().includes(term)))
    );
  }

  get publishedCount(): number {
    return this.definitions.filter(item => !!item.latest_version).length;
  }

  get readyCount(): number {
    return this.definitions.filter(item =>
      item.is_active && !!item.latest_version && !!item.capabilities?.start
    ).length;
  }

  get filteredOut(): boolean {
    return !!this.search.trim() || this.status !== 'all';
  }

  scopeOf(item: Definition): string {
    return item.department === null ? 'Company wide' : `Department ${item.department}`;
  }

  clearFilters(): void {
    this.search = '';
    this.status = 'all';
  }
}
