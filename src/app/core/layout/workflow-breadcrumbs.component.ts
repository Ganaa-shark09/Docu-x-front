import { Component, computed, inject, signal, DestroyRef } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

export function workflowBreadcrumbs(url: string): { label: string; path: string }[] {
  const parts = url.split(/[?#]/)[0].split('/').filter(Boolean);
  if (parts[0] !== 'workflows') return [];
  const crumbs = [{ label: 'All Workflows', path: '/workflows' }];
  const labels: Record<string, string> = {
    definitions: 'Definitions',
    runs: 'Workflow runs',
    extractions: 'Extraction history',
    'hr-policies': 'HR policies',
    'rfp-projects': 'RFP & proposals',
    'finance-audits': 'Finance audit',
    compliance: 'Compliance',
    legal: 'Legal',
    frameworks: 'Frameworks',
    controls: 'Controls',
    assessments: 'Assessments',
    playbooks: 'Playbooks',
    'clause-types': 'Clause types',
  };
  for (let index = 1; index < parts.length; index++) {
    const key = parts[index];
    crumbs.push({
      label: labels[key] || (parts[1] === 'runs' ? 'Run workspace' : 'Detail'),
      path: '/' + parts.slice(0, index + 1).join('/'),
    });
  }
  return crumbs;
}
@Component({
  selector: 'app-workflow-breadcrumbs',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (crumbs().length) {
      <nav aria-label="Breadcrumb">
        <ol>
          @for (crumb of crumbs(); track crumb.path; let last = $last) {
            <li>
              @if (last) {
                <span aria-current="page">{{ crumb.label }}</span>
              } @else {
                <a [routerLink]="crumb.path">{{ crumb.label }}</a
                ><span aria-hidden="true">/</span>
              }
            </li>
          }
        </ol>
      </nav>
    }
  `,
  styles: [
    `
      nav {
        margin-bottom: 18px;
        font-size: 12px;
        color: var(--app-text-muted);
      }
      ol {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      a {
        color: var(--app-primary);
        text-underline-offset: 3px;
      }
      [aria-current] {
        color: var(--app-text);
      }
    `,
  ],
})
export class WorkflowBreadcrumbsComponent {
  private readonly router = inject(Router);
  private readonly url = signal(this.router.url);
  readonly crumbs = computed(() => workflowBreadcrumbs(this.url()));
  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }
}
