import { Component, DestroyRef, forwardRef, inject, input, signal } from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  NG_VALIDATORS,
  ValidationErrors,
  FormControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { Subject, catchError, debounceTime, of, switchMap, takeUntil, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
export interface EntityOption {
  id: string | number;
  label: string;
  detail: string;
}
export type EntityKind =
  'documents' | 'departments' | 'controls' | 'frameworks' | 'assessments' | 'sources';
const paths: Record<EntityKind, string> = {
  documents: 'documents',
  departments: 'workspaces/departments',
  controls: 'workflows/compliance-controls',
  frameworks: 'workflows/compliance-frameworks',
  assessments: 'workflows/compliance-assessments',
  sources: 'workflows/compliance-assessments',
};
@Component({
  selector: 'app-entity-picker',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
  ],
  providers: [
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => EntityPickerComponent), multi: true },
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EntityPickerComponent),
      multi: true,
    },
  ],
  template: `<div class="entity-picker">
    <label [for]="uid">{{ label() }}</label>
    @if (selected().length) {
      <mat-chip-set [attr.aria-label]="label() + ' selections'">
        @for (item of selected(); track item.id) {
          <mat-chip (removed)="remove(item.id)"
            >{{ item.label
            }}<button
              matChipRemove
              type="button"
              [disabled]="disabled()"
              [attr.aria-label]="'Remove ' + item.label"
            >
              ?
            </button></mat-chip
          >
        }
      </mat-chip-set>
    }
    <mat-form-field appearance="outline"
      ><input
        matInput
        [id]="uid"
        [placeholder]="'Search ' + label().toLowerCase()"
        [formControl]="query"
        [matAutocomplete]="options"
        (focus)="search(query.value || '')"
        (blur)="touch()"
        autocomplete="off"
      />
      <mat-autocomplete #options="matAutocomplete" (optionSelected)="choose($event.option.value)">
        @for (option of results(); track option.id) {
          <mat-option [value]="option"
            ><strong>{{ option.label }}</strong
            ><small>{{ option.detail }}</small></mat-option
          >
        }
        @if (!loading() && !results().length) {
          <mat-option disabled>No available results</mat-option>
        }
      </mat-autocomplete></mat-form-field
    >
    @if (loading()) {
      <small role="status">Loading available records...</small>
    }
    @if (error()) {
      <p role="alert">
        {{ error() }} <button type="button" (click)="search(query.value || '')">Retry</button>
      </p>
    }
    @if (next()) {
      <button type="button" [disabled]="loading()" (click)="loadMore()">Load more results</button>
    }
    <small>Select a result to add it. Typed search text is never submitted.</small>
  </div>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .entity-picker {
        display: grid;
        gap: 6px;
      }
      label {
        font-size: 13px;
        font-weight: 600;
      }
      mat-form-field {
        width: 100%;
      }
      small {
        display: block;
        color: var(--app-text-muted);
        font-size: 12px;
      }
      p {
        color: var(--app-danger-text);
      }
      mat-chip-set {
        max-width: 100%;
      }
    `,
  ],
})
export class EntityPickerComponent implements ControlValueAccessor {
  readonly kind = input.required<EntityKind>();
  readonly label = input('Records');
  readonly multiple = input(false);
  readonly max = input(20);
  readonly required = input(false);
  readonly contextVersion = input('');
  readonly contextId = input('');
  readonly sourceKind = input('document');
  readonly selected = signal<EntityOption[]>([]);
  readonly results = signal<EntityOption[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly disabled = signal(false);
  readonly next = signal(false);
  readonly query = new FormControl('', { nonNullable: true });
  readonly uid = 'entity-picker-' + crypto.randomUUID();
  private http = inject(HttpClient);
  private destroy = inject(DestroyRef);
  private requests = new Subject<{ q: string; page: number }>();
  private cancel = new Subject<void>();
  private page = 1;
  private term = '';
  private ids: (string | number)[] = [];
  private validationChanged = () => {};
  validate(): ValidationErrors | null {
    if (this.required() && !this.ids.length) return { required: true };
    return this.ids.some((id) => !this.selected().some((row) => row.id === id))
      ? { entityUnavailable: true }
      : null;
  }
  registerOnValidatorChange(fn: () => void) {
    this.validationChanged = fn;
  }
  private change: (v: unknown) => void = () => {};
  touch = () => {};
  constructor() {
    this.query.valueChanges.pipe(debounceTime(220), takeUntilDestroyed()).subscribe((q) => {
      if (typeof q === 'string') this.search(q);
    });
    this.requests
      .pipe(
        switchMap(({ q, page }) => {
          this.loading.set(true);
          this.error.set('');
          return this.http
            .get<any>(this.base(), {
              params: {
                search: q,
                ...(this.kind() === 'sources' ? { kind: this.sourceKind() } : {}),
                page,
                ...(this.kind() === 'documents' ? { scope: 'internal' } : {}),
                ...(this.kind() === 'controls' && this.contextVersion()
                  ? { framework_version_uuid: this.contextVersion() }
                  : {}),
              },
            })
            .pipe(
              timeout(15000),
              catchError(() => {
                this.error.set('Records could not be loaded. Check your access and retry.');
                return of(null);
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((p) => {
        this.loading.set(false);
        if (!p) {
          this.results.set([]);
          this.next.set(false);
          return;
        }
        const rows = Array.isArray(p) ? p : p.results || [];
        const mapped = rows.map((r: any) => this.option(r));
        this.results.set(this.page === 1 ? mapped : [...this.results(), ...mapped]);
        this.next.set(!!p.next);
      });
    this.destroy.onDestroy(() => this.cancel.next());
  }
  private base() {
    return (
      environment.apiBaseUrl +
      '/' +
      paths[this.kind()] +
      '/' +
      (this.kind() === 'sources' ? encodeURIComponent(this.contextId()) + '/source-options/' : '')
    );
  }
  private option(r: any): EntityOption {
    return {
      id: this.kind() === 'departments' ? r.id : r.uuid,
      label: r.title || r.name || r.original_filename || 'Untitled record',
      detail: [r.code, r.document_type, r.department_name, r.status].filter(Boolean).join(' | '),
    };
  }
  search(q: string) {
    if (this.disabled()) return;
    this.page = 1;
    this.term = q;
    this.requests.next({ q, page: 1 });
  }
  loadMore() {
    this.page++;
    this.requests.next({ q: this.term, page: this.page });
  }
  choose(option: EntityOption) {
    if (this.disabled() || !option || !this.results().some((r) => r.id === option.id)) return;
    if (this.multiple()) {
      if (this.selected().length >= this.max()) return;
      this.selected.update((s) => (s.some((r) => r.id === option.id) ? s : [...s, option]));
    } else this.selected.set([option]);
    this.query.setValue('', { emitEvent: false });
    this.emit();
  }
  remove(id: string | number) {
    if (this.disabled()) return;
    this.selected.update((s) => s.filter((r) => r.id !== id));
    this.emit();
  }
  private emit() {
    this.ids = this.selected().map((r) => r.id);
    this.change(this.multiple() ? this.ids : (this.ids[0] ?? null));
    this.touch();
    this.validationChanged();
  }
  writeValue(value: unknown) {
    const incoming = Array.isArray(value)
      ? value
      : value === null || value === undefined || value === ''
        ? []
        : [value];
    if (
      JSON.stringify(incoming) === JSON.stringify(this.ids) &&
      incoming.every((id) => this.selected().some((row) => row.id === id))
    )
      return;
    this.cancel.next();
    this.ids = Array.isArray(value)
      ? value
      : ((value === null || value === undefined || value === '' ? [] : [value]) as any);
    this.selected.set([]);
    const ids = [...this.ids];
    for (const id of ids) {
      this.http
        .get<any>(
          ['departments', 'sources'].includes(this.kind())
            ? this.base()
            : this.base() + encodeURIComponent(id) + '/',
          this.kind() === 'departments'
            ? { params: { id } }
            : this.kind() === 'sources'
              ? { params: { source_uuid: id, kind: this.sourceKind() } }
              : {},
        )
        .pipe(timeout(15000), takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (r) => {
            const row = ['departments', 'sources'].includes(this.kind())
              ? (Array.isArray(r) ? r : r.results || []).find(
                  (x: any) => (this.kind() === 'departments' ? x.id : x.uuid) === id,
                )
              : r;
            if (row && this.ids.includes(id))
              this.selected.update((s) => [...s.filter((x) => x.id !== id), this.option(row)]);
            else this.error.set('A saved selection is unavailable. Select an available record.');
            this.validationChanged();
          },
          error: () => {
            this.error.set(
              'A saved selection is unavailable. Remove it or select an available record.',
            );
            this.validationChanged();
          },
        });
    }
  }
  registerOnChange(fn: (v: unknown) => void) {
    this.change = fn;
  }
  registerOnTouched(fn: () => void) {
    this.touch = fn;
  }
  setDisabledState(v: boolean) {
    this.disabled.set(v);
    v ? this.query.disable({ emitEvent: false }) : this.query.enable({ emitEvent: false });
  }
}
