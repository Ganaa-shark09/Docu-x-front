import { TestBed, ComponentFixture } from '@angular/core/testing';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { LegalRuleEditorComponent } from './legal-rule-editor.component';
import { LegalPredicatesComponent } from './legal-predicates.component';
import { LegalComparisonComponent } from './legal-comparison.component';
import { legalType, legalRule, legalAnalysis } from '../legal-test.fixtures';
import { Comparison } from '../models/legal-clause.model';
describe('Legal rules and policy comparison rendering', () => {
  let fixture:
    | ComponentFixture<LegalRuleEditorComponent>
    | ComponentFixture<LegalPredicatesComponent>
    | ComponentFixture<LegalComparisonComponent>;
  afterEach(() => fixture?.destroy());
  it.each(['required', 'optional', 'prohibited'] as const)(
    'renders structured %s requirements',
    async (requirement) => {
      TestBed.configureTestingModule({ imports: [LegalRuleEditorComponent] });
      const f = TestBed.createComponent(LegalRuleEditorComponent);
      fixture = f;
      f.componentRef.setInput('taxonomy', [legalType]);
      f.componentRef.setInput('rules', [{ ...legalRule, requirement }]);
      f.detectChanges();
      await f.whenStable();
      const selects = f.nativeElement.querySelectorAll('select');
      expect(
        Array.from(selects as NodeListOf<HTMLSelectElement>).some((s) => s.value === requirement),
      ).toBe(true);
      expect(f.nativeElement.querySelector('textarea')).toBeNull();
    },
  );
  it('freezes all rule mutations in a published inspector', () => {
    TestBed.configureTestingModule({ imports: [LegalRuleEditorComponent] });
    const f = TestBed.createComponent(LegalRuleEditorComponent);
    fixture = f;
    f.componentRef.setInput('rules', [legalRule]);
    f.componentRef.setInput('disabled', true);
    const changed = vi.fn();
    f.componentInstance.changed.subscribe(changed);
    f.componentInstance.edit(0, 'code', 'new_rule');
    f.componentInstance.remove(0);
    f.componentInstance.add();
    expect(changed).not.toHaveBeenCalled();
  });
  it('preserves original policy when drafting a typed edit', () => {
    TestBed.configureTestingModule({ imports: [LegalRuleEditorComponent] });
    const f = TestBed.createComponent(LegalRuleEditorComponent);
    fixture = f;
    f.componentRef.setInput('rules', [legalRule]);
    const changed = vi.fn();
    f.componentInstance.changed.subscribe(changed);
    f.componentInstance.position(0, 'when', [
      { field: 'data_processing', operator: 'eq', value: true },
    ]);
    expect(changed.mock.calls[0][0][0].when[0].value).toBe(true);
    expect(legalRule.when).toBeUndefined();
  });
  it('clears unsupported fact positions when classification changes', () => {
    TestBed.configureTestingModule({ imports: [LegalRuleEditorComponent] });
    const f = TestBed.createComponent(LegalRuleEditorComponent);
    fixture = f;
    f.componentRef.setInput('rules', [legalRule]);
    const changed = vi.fn();
    f.componentInstance.changed.subscribe(changed);
    f.componentInstance.type(0, 'new');
    expect(changed.mock.calls[0][0][0].preferred).toEqual([]);
  });
  it('emits real booleans for conditional predicates', () => {
    TestBed.configureTestingModule({ imports: [LegalPredicatesComponent] });
    const f = TestBed.createComponent(LegalPredicatesComponent);
    fixture = f;
    f.componentRef.setInput('schema', { data_processing: { type: 'boolean' } });
    const changed = vi.fn();
    f.componentInstance.changed.subscribe(changed);
    f.componentInstance.add();
    expect(changed.mock.calls[0][0][0].value).toBe(true);
  });
  it('prevents predicate edits while disabled', () => {
    TestBed.configureTestingModule({ imports: [LegalPredicatesComponent] });
    const f = TestBed.createComponent(LegalPredicatesComponent);
    fixture = f;
    f.componentRef.setInput('disabled', true);
    const changed = vi.fn();
    f.componentInstance.changed.subscribe(changed);
    f.componentInstance.field(0, 'amount');
    f.componentInstance.add();
    f.componentInstance.remove(0);
    expect(changed).not.toHaveBeenCalled();
  });
  it.each([
    'matching',
    'preferred',
    'acceptable_fallback',
    'deviation',
    'prohibited',
    'ambiguous',
    'not_detected',
    'coverage_insufficient',
    'not_applicable',
  ] as Comparison[])('renders backend %s results with separate policy severity', (comparison) => {
    TestBed.configureTestingModule({ imports: [LegalComparisonComponent] });
    const f = TestBed.createComponent(LegalComparisonComponent);
    fixture = f;
    f.componentRef.setInput('deviation', { ...legalAnalysis.deviations[0], comparison });
    f.componentRef.setInput('complete', true);
    f.detectChanges();
    const text = f.nativeElement.textContent;
    expect(text).toContain('DOCUMENT FACT');
    expect(text).toContain('PLAYBOOK EXPECTATION');
    expect(text).toContain('DEVIATION');
    expect(text).toContain('POLICY RISK');
    expect(f.nativeElement.querySelector('[data-severity=high]')).toBeTruthy();
    expect(text).not.toContain('0.81');
  });
  it('does not report an unsupported absence with incomplete coverage', () => {
    TestBed.configureTestingModule({ imports: [LegalComparisonComponent] });
    const f = TestBed.createComponent(LegalComparisonComponent);
    fixture = f;
    f.componentRef.setInput('deviation', {
      ...legalAnalysis.deviations[0],
      comparison: 'not_detected',
    });
    f.componentRef.setInput('complete', false);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Coverage insufficient');
    expect(f.nativeElement.textContent).not.toContain('Required clause not detected');
  });
});
