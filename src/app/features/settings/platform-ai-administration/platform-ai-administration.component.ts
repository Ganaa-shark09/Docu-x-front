import { NgFor, NgIf, UpperCasePipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, Subscription, timeout, finalize } from 'rxjs';
import { AiModelUserProfile, CompanyAiModelService, CompanyAiModel, modelApiError } from '../../../core/services/company-ai-model.service';
import {
  AiProviderType, GrantDraft, PlatformAiAdministrationService,
  PlatformAiCompany, PlatformAiProvider, ProviderDraft, PROVIDER_TYPES,
} from '../../../core/services/platform-ai-administration.service';

const emptyProvider = (company: string): ProviderDraft => ({
  company, name: '', provider_type: 'groq', model_name: 'openai/gpt-oss-120b',
  endpoint_url: '', deployment_name: '', api_version: '', max_tokens: 1200,
  temperature: 0.2, is_active: true, api_key: '',
});
const emptyGrant = (company: string): GrantDraft => ({
  company, provider_config: '', model_id: '', display_name: '', is_enabled: true, is_default: false,
});

@Component({
  selector: 'app-platform-ai-administration',
  standalone: true,
  imports: [NgIf, NgFor, UpperCasePipe, FormsModule, RouterLink],
  templateUrl: './platform-ai-administration.component.html',
  styleUrls: ['./platform-ai-administration.component.scss'],
})
export class PlatformAiAdministrationComponent implements OnInit, OnDestroy {
  private readonly api = inject(PlatformAiAdministrationService);
  private readonly profileApi = inject(CompanyAiModelService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly subs = new Subscription();
  readonly providerTypes = PROVIDER_TYPES;
  readonly cloudProviders = new Set<AiProviderType>(['groq','openai','gemini','anthropic','azure_openai']);

  profile: AiModelUserProfile | null = null;
  checkingAccess = true;
  accessDenied = false;
  companies: PlatformAiCompany[] = [];
  selectedCompanyUuid = '';
  company: PlatformAiCompany | null = null;
  providers: PlatformAiProvider[] = [];
  grants: CompanyAiModel[] = [];
  providerForm = emptyProvider('');
  grantForm = emptyGrant('');
  editingProviderUuid = '';
  loading = false;
  busy = false;
  error = '';
  success = '';

  get approvedCount(): number { return this.grants.filter(g => g.is_enabled).length; }
  get availableProviders(): PlatformAiProvider[] { return this.providers.filter(p => p.is_active); }
  get requiresKey(): boolean { return this.cloudProviders.has(this.providerForm.provider_type); }
  get showEndpoint(): boolean { return this.providerForm.provider_type === 'ollama' || this.providerForm.provider_type === 'azure_openai'; }
  get isSuperuser(): boolean { return !!this.profile?.is_superuser; }

  ngOnInit(): void {
    this.subs.add(this.profileApi.getMyProfile().pipe(timeout({first: 15000})).subscribe({
      next: profile => {
        this.profile = profile;
        this.checkingAccess = false;
        this.accessDenied = !profile.is_superuser;
        if (profile.is_superuser) this.loadCompanies();
        this.cdr.markForCheck();
      },
      error: err => {
        this.checkingAccess = false;
        this.accessDenied = true;
        this.error = modelApiError(err, 'Unable to verify platform-superuser access.');
        this.cdr.markForCheck();
      },
    }));
  }
  ngOnDestroy(): void { this.subs.unsubscribe(); this.providerForm.api_key = ''; }

  loadCompanies(): void {
    if (!this.isSuperuser) return;
    this.loading = true;
    this.error = '';
    this.subs.add(this.api.listCompanies().pipe(timeout({first: 20000}), finalize(() => {
      this.loading = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: companies => {
        this.companies = companies;
        if (this.selectedCompanyUuid && !companies.some(c => c.uuid === this.selectedCompanyUuid)) this.selectedCompanyUuid = '';
        if (!this.selectedCompanyUuid && companies.length) this.selectedCompanyUuid = companies[0].uuid;
        this.selectCompany(this.selectedCompanyUuid);
      },
      error: e => { this.error = modelApiError(e, 'Cannot load companies.'); this.cdr.markForCheck(); },
    }));
  }
  selectCompany(uuid: string): void {
    if (!this.isSuperuser) return;
    this.selectedCompanyUuid = uuid;
    this.company = this.companies.find(c => c.uuid === uuid) ?? null;
    this.providers = [];
    this.grants = [];
    this.editingProviderUuid = '';
    this.providerForm = emptyProvider(uuid);
    this.grantForm = emptyGrant(uuid);
    this.error = '';
    this.success = '';
    if (uuid) this.refreshRecords();
    this.cdr.markForCheck();
  }
  refreshRecords(): void {
    if (!this.selectedCompanyUuid || !this.isSuperuser) return;
    const companyUuid = this.selectedCompanyUuid;
    this.loading = true;
    this.error = '';
    this.subs.add(this.api.listProviders(companyUuid).pipe(timeout({first: 20000})).subscribe({
      next: providers => { if (this.selectedCompanyUuid === companyUuid) this.providers = providers; this.cdr.markForCheck(); },
      error: e => { if (this.selectedCompanyUuid === companyUuid) this.error = modelApiError(e, 'Provider configurations could not be loaded.'); this.cdr.markForCheck(); },
    }));
    this.subs.add(this.api.listGrants(companyUuid).pipe(timeout({first: 20000}), finalize(() => {
      if (this.selectedCompanyUuid === companyUuid) this.loading = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: grants => { if (this.selectedCompanyUuid === companyUuid) this.grants = grants; this.cdr.markForCheck(); },
      error: e => { if (this.selectedCompanyUuid === companyUuid) this.error = modelApiError(e, 'Model grants could not be loaded.'); this.cdr.markForCheck(); },
    }));
  }
  savePolicy(): void {
    if (!this.isSuperuser || !this.company || this.busy) return;
    const uuid = this.company.uuid;
    this.runMutation(this.api.updatePolicy(uuid, {
      allow_cloud_llm: this.company.allow_cloud_llm,
      allow_local_llm: this.company.allow_local_llm,
    }), 'Company AI routing policy saved.');
  }
  editProvider(provider: PlatformAiProvider): void {
    this.editingProviderUuid = provider.uuid;
    this.providerForm = {
      company: provider.company, name: provider.name, provider_type: provider.provider_type,
      model_name: provider.model_name, endpoint_url: provider.endpoint_url,
      deployment_name: provider.deployment_name, api_version: provider.api_version,
      max_tokens: provider.max_tokens, temperature: provider.temperature,
      is_active: provider.is_active, api_key: '',
    };
    this.error = ''; this.success = '';
    this.cdr.markForCheck();
  }
  newProvider(): void {
    this.editingProviderUuid = '';
    this.providerForm = emptyProvider(this.selectedCompanyUuid);
    this.error = ''; this.success = '';
  }
  providerTypeChanged(): void {
    const p = this.providerForm.provider_type;
    if (p === 'groq') this.providerForm.model_name = 'openai/gpt-oss-120b';
    if (p === 'local') this.providerForm.model_name = 'local-extractive-rag';
    if (p !== 'ollama' && p !== 'azure_openai') this.providerForm.endpoint_url = '';
    if (p !== 'azure_openai') { this.providerForm.deployment_name = ''; this.providerForm.api_version = ''; }
  }
  saveProvider(): void {
    if (!this.isSuperuser || !this.selectedCompanyUuid || !this.providerForm.name.trim() || this.busy) return;
    const payload: ProviderDraft = { ...this.providerForm, company: this.selectedCompanyUuid,
      name: this.providerForm.name.trim(), model_name: this.providerForm.model_name.trim(),
      max_tokens: Number(this.providerForm.max_tokens), temperature: Number(this.providerForm.temperature) };
    const request = this.editingProviderUuid ? this.api.updateProvider(this.editingProviderUuid, payload) : this.api.createProvider(payload);
    this.runMutation(request, this.editingProviderUuid ? 'Provider updated. API keys are never displayed after saving.' : 'Provider created. Next, grant an approved model.', true);
  }
  grantProviderChanged(): void {
    const p = this.providers.find(row => row.uuid === this.grantForm.provider_config);
    if (!p) return;
    this.grantForm.model_id = p.provider_type === 'azure_openai' ? p.deployment_name : p.model_name;
    if (p.provider_type === 'local') this.grantForm.model_id = 'local-extractive-rag';
    this.grantForm.display_name = p.name;
  }
  createGrant(): void {
    if (!this.isSuperuser || this.busy || !this.grantForm.provider_config || !this.grantForm.model_id.trim()) return;
    const payload: GrantDraft = {
      ...this.grantForm, company: this.selectedCompanyUuid,
      model_id: this.grantForm.model_id.trim(),
      display_name: this.grantForm.display_name.trim() || this.grantForm.model_id.trim(),
      is_default: false,
    };
    this.runMutation(this.api.createGrant(payload), 'Model granted to the selected company.');
  }
  toggleGrant(grant: CompanyAiModel): void {
    if (!this.isSuperuser || this.busy) return;
    const enabled = !grant.is_enabled;
    this.runMutation(this.api.updateGrant(grant.uuid, { is_enabled: enabled, ...(!enabled ? { is_default: false } : {}) }),
      enabled ? 'Company model access restored.' : 'Company model access disabled.');
  }
  private runMutation<T>(request: Observable<T>, message: string, clearProvider = false): void {
    this.busy = true;
    this.error = ''; this.success = '';
    this.cdr.markForCheck();
    this.subs.add(request.pipe(timeout({first: 20000}), finalize(() => {
      this.busy = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        if (clearProvider) this.newProvider();
        this.success = message;
        this.refreshRecords();
      },
      error: e => {
        // Avoid retaining secrets in the browser after a failed attempt.
        if (clearProvider) this.providerForm.api_key = '';
        this.error = platformFormError(e);
        this.cdr.markForCheck();
      },
    }));
  }
  trackCompany(_i: number, item: PlatformAiCompany): string { return item.uuid; }
  trackProvider(_i: number, item: PlatformAiProvider): string { return item.uuid; }
  trackGrant(_i: number, item: CompanyAiModel): string { return item.uuid; }
}

function platformFormError(err: any): string {
  const body = err?.error;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [field, detail] of Object.entries(body)) {
      if (field === 'detail') continue;
      const message = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail[0] : null);
      if (typeof message === 'string' && message.trim()) return `${field.replaceAll('_', ' ')}: ${message}`;
    }
  }
  return modelApiError(err, 'The administration action could not be completed.');
}
