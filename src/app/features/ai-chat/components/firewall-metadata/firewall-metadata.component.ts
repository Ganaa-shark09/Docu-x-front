import { NgFor, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-firewall-metadata',
  standalone: true,
  imports: [NgFor, NgIf],
  templateUrl: './firewall-metadata.component.html',
  styleUrl: './firewall-metadata.component.scss',
})
export class FirewallMetadataComponent {
  @Input() firewall: any;

  get allowedCount(): number {
    return Number(this.firewall?.allowed_count ?? this.firewall?.allowed ?? 0);
  }

  get redactedCount(): number {
    return Number(this.firewall?.redacted_count ?? this.firewall?.redacted ?? 0);
  }

  get blockedCount(): number {
    return Number(this.firewall?.blocked_count ?? this.firewall?.blocked ?? 0);
  }

  get checkedAt(): string {
    return this.firewall?.checked_at || this.firewall?.created_at || '';
  }

  get blockedItems(): any[] {
    const items =
      this.firewall?.blocked_items ||
      this.firewall?.blocked_sources ||
      this.firewall?.blocked_documents ||
      [];

    return Array.isArray(items) ? items : [];
  }

  get allowedItems(): any[] {
    const items =
      this.firewall?.allowed_items ||
      this.firewall?.allowed_sources ||
      this.firewall?.allowed_documents ||
      [];

    return Array.isArray(items) ? items : [];
  }

  itemTitle(item: any): string {
    return item?.title ||
      item?.document_title ||
      item?.filename ||
      item?.file_name ||
      item?.source_name ||
      'Source';
  }

  itemReason(item: any): string {
    return item?.reason ||
      item?.decision_reason ||
      item?.message ||
      item?.status ||
      'Policy checked';
  }
}
