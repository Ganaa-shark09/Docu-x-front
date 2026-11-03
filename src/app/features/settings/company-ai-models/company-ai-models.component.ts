import { NgFor, NgIf, UpperCasePipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, finalize, timeout } from 'rxjs';
import {
  AiModelUserProfile, CompanyAiModel, CompanyAiModelService, modelApiError,
} from '../../../core/services/company-ai-model.service';

@Component({
  selector: 'app-company-ai-models',
  standalone: true,
  imports: [NgFor, NgIf, UpperCasePipe, RouterLink],
  templateUrl: './company-ai-models.component.html',
  styleUrls: ['./company-ai-models.component.scss'],
})
export class CompanyAiModelsComponent implements OnInit, OnDestroy {
  private readonly modelsApi = inject(CompanyAiModelService);
  private readonly cdr = inject(ChangeDetectorRef);
  private modelRequest?: Subscription;
  private profileRequest?: Subscription;
  private defaultRequest?: Subscription;
  private verificationRequest?: Subscription;
  models: CompanyAiModel[] = [];
  profile: AiModelUserProfile | null = null;
  loading = true;
  savingUuid: string | null = null;
  error = '';
  profileWarning = '';
  success = '';

  get isCompanyAdmin(): boolean {
    return this.profile?.role === 'company_admin';
  }

  get isPlatformSuperuser(): boolean {
    return !!this.profile?.is_superuser;
  }

  ngOnInit(): void { this.refresh(); }

  ngOnDestroy(): void {
    this.modelRequest?.unsubscribe();
    this.profileRequest?.unsubscribe();
    this.defaultRequest?.unsubscribe();
    this.verificationRequest?.unsubscribe();
  }

  refresh(): void {
    if (this.savingUuid) return;
    this.modelRequest?.unsubscribe();
    this.profileRequest?.unsubscribe();
    this.verificationRequest?.unsubscribe();
    this.loading = true;
    this.error = '';
    this.profileWarning = '';
    this.success = '';
    this.cdr.markForCheck();

    // The catalog is the primary resource. Do not make its loading state depend on
    // the separate profile request: a stalled profile must not hide an empty catalog.
    this.modelRequest = this.modelsApi.listApprovedModels().pipe(
      timeout({ first: 15000 }),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: models => {
        this.models = models;
        this.cdr.markForCheck();
      },
      error: err => {
        this.models = [];
        this.error = err?.name === 'TimeoutError'
          ? 'The approved-model service did not respond in time. Please refresh or check the API connection.'
          : modelApiError(err, 'Unable to load approved models. Please check the API connection and refresh.');
        this.cdr.markForCheck();
      },
    });

    // The profile is used only to decide whether to render company-admin actions.
    // An unavailable profile never gives additional permissions or traps the catalog.
    this.profile = null;
    this.profileRequest = this.modelsApi.getMyProfile().pipe(
      timeout({ first: 15000 }),
    ).subscribe({
      next: profile => {
        this.profile = profile;
        this.cdr.markForCheck();
      },
      error: () => {
        this.profile = null;
        this.profileWarning = 'Your role could not be verified. Model listings are still available, but default-model changes are disabled.';
        this.cdr.markForCheck();
      },
    });
  }

  setDefault(model: CompanyAiModel): void {
    if (!this.isCompanyAdmin || this.loading || this.savingUuid || model.is_default) return;
    this.savingUuid = model.uuid;
    this.error = '';
    this.success = '';
    this.cdr.markForCheck();
    this.defaultRequest = this.modelsApi.setCompanyDefault(model.uuid).pipe(
      timeout({ first: 15000 }),
      finalize(() => {
        this.savingUuid = null;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: selected => {
        this.models = this.models.map(row => ({ ...row, is_default: row.uuid === selected.uuid }));
        this.success = `${model.display_name || model.model_id} is now the company default.`;
        this.cdr.markForCheck();
        // Confirm latest server state without returning the page to a loading spinner.
        this.verificationRequest?.unsubscribe();
        this.verificationRequest = this.modelsApi.listApprovedModels().pipe(
          timeout({ first: 15000 }),
        ).subscribe({
          next: models => { this.models = models; this.cdr.markForCheck(); },
          error: () => {
            this.error = 'Default updated, but could not refresh the model list. Use Refresh models to confirm.';
            this.cdr.markForCheck();
          },
        });
      },
      error: err => {
        this.error = modelApiError(err, 'Unable to set the company default.');
        this.cdr.markForCheck();
        // The approval may have changed since the page was loaded.
        this.verificationRequest?.unsubscribe();
        this.verificationRequest = this.modelsApi.listApprovedModels().pipe(
          timeout({ first: 15000 }),
        ).subscribe({
          next: models => { this.models = models; this.cdr.markForCheck(); },
          error: () => { /* Preserve the original mutation error. */ },
        });
      },
    });
  }

  trackByUuid(_index: number, item: CompanyAiModel): string { return item.uuid; }
}
