import { NgClass, NgFor, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

import {
  AiFirewallMetadata,
  AiFirewallPolicyAction,
  AiFirewallPolicyRecord,
} from '../../models/ai-chat.model';

@Component({
  selector: 'app-firewall-metadata',
  standalone: true,
  imports: [NgClass, NgFor, NgIf],
  templateUrl: './firewall-metadata.component.html',
  styleUrl: './firewall-metadata.component.scss',
})
export class FirewallMetadataComponent {
  @Input() firewall: AiFirewallMetadata | null | undefined = null;

  get policyActions(): AiFirewallPolicyRecord[] {
    return this.normalizePolicyRecords(this.firewall?.policy_actions);
  }

  get hasMetadata(): boolean {
    if (!this.firewall) {
      return false;
    }

    return (
      !!this.firewall.forced_local ||
      !!this.firewall.local_only ||
      !!this.firewall.requires_approval ||
      !!this.firewall.policy_action ||
      !!this.firewall.action ||
      !!this.firewall.allowed_count ||
      !!this.firewall.redacted_count ||
      !!this.firewall.blocked_count ||
      this.policyActions.length > 0
    );
  }

  get firewallModeLabel(): string {
    if (this.firewall?.forced_local || this.firewall?.local_only) {
      return 'Local only';
    }

    if (this.firewall?.requires_approval) {
      return 'Approval required';
    }

    return this.formatLabel(
      this.firewall?.policy_action ||
        this.firewall?.action ||
        'Checked',
    );
  }

  formatLabel(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  getDocumentTitle(item: AiFirewallPolicyRecord): string {
    return item.document_title || item.title || 'Document context';
  }

  getAction(item: AiFirewallPolicyRecord): AiFirewallPolicyAction {
    return item.action || item.policy_action || 'allow';
  }

  getReason(item: AiFirewallPolicyRecord): string {
    return item.reason || item.sensitivity_label || '';
  }

  actionClass(action: AiFirewallPolicyAction | null | undefined): string {
    const normalized = String(action || '').toLowerCase();

    if (normalized.includes('block')) {
      return 'firewall-action firewall-action--blocked';
    }

    if (normalized.includes('redact')) {
      return 'firewall-action firewall-action--redacted';
    }

    if (normalized.includes('approval')) {
      return 'firewall-action firewall-action--approval';
    }

    if (normalized.includes('local')) {
      return 'firewall-action firewall-action--local';
    }

    return 'firewall-action firewall-action--allowed';
  }

  private normalizePolicyRecords(value: unknown): AiFirewallPolicyRecord[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item) => {
      if (typeof item === 'string') {
        return {
          document_title: item,
          action: 'allow',
        };
      }

      if (item && typeof item === 'object') {
        return item as AiFirewallPolicyRecord;
      }

      return {
        document_title: 'Document context',
        action: 'allow',
      };
    });
  }
}
