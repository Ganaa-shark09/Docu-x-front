import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-placeholder-page',
  standalone: true,
  template: `
    <section class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 class="text-2xl font-bold text-slate-950">{{ title }}</h2>
      <p class="mt-2 text-sm text-slate-500">
        This page route is protected and ready for the next frontend milestone.
      </p>
    </section>
  `,
})
export class PlaceholderPageComponent {
  private readonly route = inject(ActivatedRoute);

  readonly title = this.route.snapshot.data['title'] || 'Coming Soon';
}
