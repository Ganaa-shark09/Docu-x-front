import { Component, input, output } from '@angular/core';
@Component({
  selector: 'app-finance-pager',
  standalone: true,
  styleUrls: ['../workflow.scss'],
  template: `<nav class="pager" aria-label="Result pages">
    <button [disabled]="!previous() || busy()" (click)="changed.emit(page() - 1)">Previous</button
    ><span
      >Page {{ page() }}
      @if (count() !== null) {
        | {{ count() }} records
      }</span
    ><button [disabled]="!next() || busy()" (click)="changed.emit(page() + 1)">Next</button>
  </nav>`,
})
export class FinancePagerComponent {
  readonly page = input(1);
  readonly next = input(false);
  readonly previous = input(false);
  readonly count = input<number | null>(null);
  readonly busy = input(false);
  readonly changed = output<number>();
}
