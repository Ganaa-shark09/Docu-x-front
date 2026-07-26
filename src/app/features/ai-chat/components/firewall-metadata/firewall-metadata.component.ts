import { NgClass, NgFor, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

import { AiFirewallMetadata, AiFirewallPolicyAction } from '../../models/ai-chat.model';

@Component({
  selector: 'app-firewall-metadata',
  standalone: true,
  imports: [NgClass, NgFor, NgIf],
  templateUrl: './firewall-metadata.component.html',
  styleUrl: './firewall-metadata.component.scss',
})
export class FirewallMetadataComponent {
  @Input() firewall: AiFirewallMetadata | null | undefined = null;

  get actions(): AiFirewallPolicyAction[] {
    return this.firewall?.policy_actions ?? [];
  }

  get hasFirewallData(): boolean {
    return Boolean(this.firewall);
  }

  actionClass(action?: string): string {
    switch (action) {
      case 'blocked':
        return 'bg-red-100 text-red-700';
      case 'redacted':
        return 'bg-amber-100 text-amber-700';
      case 'provider_routed_to_local':
        return 'bg-purple-100 text-purple-700';
      case 'allowed':
        return 'bg-emerald-100 text-emerald-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }

  formatLabel(value?: string | null): string {
    if (!value) {
      return '-';
    }

    return value
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}
