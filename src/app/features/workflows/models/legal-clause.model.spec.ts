import { describe, it, expect } from 'vitest';
import {
  validScalar,
  validRules,
  operators,
  factValue,
  comparisonLabel,
  FactSpec,
  ClauseRule,
} from './legal-clause.model';
import { legalType, legalRule } from '../legal-test.fixtures';
describe('Legal schema preserves exact normalized facts', () => {
  const scalars: [unknown, FactSpec, boolean][] = [
    ['123456789012345678901234.123456789012', { type: 'decimal' }, true],
    ['-100.50', { type: 'decimal' }, true],
    ['0', { type: 'decimal' }, true],
    ['1e10', { type: 'decimal' }, false],
    ['NaN', { type: 'decimal' }, false],
    ['Infinity', { type: 'decimal' }, false],
    ['1,000', { type: 'decimal' }, false],
    [' 100', { type: 'decimal' }, false],
    [100, { type: 'decimal' }, false],
    ['1234567890123456789012345', { type: 'decimal' }, false],
    ['0.1234567890123', { type: 'decimal' }, false],
    ['2026-10-01', { type: 'date' }, true],
    ['2024-02-29', { type: 'date' }, true],
    ['2026-02-29', { type: 'date' }, false],
    ['2026-13-01', { type: 'date' }, false],
    ['10/01/2026', { type: 'date' }, false],
    ['2026-10-01T00:00:00Z', { type: 'date' }, false],
    [true, { type: 'boolean' }, true],
    [false, { type: 'boolean' }, true],
    ['true', { type: 'boolean' }, false],
    [1, { type: 'boolean' }, false],
    ['fees', { type: 'enum', values: ['fees', 'fixed'] }, true],
    ['other', { type: 'enum', values: ['fees', 'fixed'] }, false],
    ['', { type: 'text' }, false],
    ['Exact text', { type: 'text' }, true],
    ['x'.repeat(2001), { type: 'text' }, false],
    [null, { type: 'text' }, false],
  ];
  it.each(scalars)('validates scalar %# with its pinned type', (v, s, valid) =>
    expect(validScalar(v as string, s)).toBe(valid),
  );
  it('permits explicitly unknown values without guessing', () =>
    expect(validScalar(null, { type: 'decimal' }, true)).toBe(true));
  it.each(['text', 'decimal', 'date', 'boolean', 'enum'] as const)(
    'restricts operators for %s',
    (type) =>
      expect(operators({ type })).toEqual(
        type === 'text'
          ? ['eq', 'ne', 'contains']
          : ['decimal', 'date'].includes(type)
            ? ['eq', 'ne', 'gte', 'lte']
            : ['eq', 'ne'],
      ),
  );
  it('does not call a clause missing when coverage is incomplete', () =>
    expect(comparisonLabel('not_detected', false)).toBe('Coverage insufficient'));
  it('requires human review even when absence is supported', () =>
    expect(comparisonLabel('not_detected', true)).toContain('review required'));
  it('preserves exact decimal strings for display', () =>
    expect(factValue('12345678901234567890.1200')).toBe('12345678901234567890.1200'));
  it.each([
    [null, 'Unknown'],
    [undefined, 'Unknown'],
    [true, 'Yes'],
    [false, 'No'],
  ] as const)('displays normalized value %#', (v, text) => expect(factValue(v)).toBe(text));
});
describe('Structured playbook requirements', () => {
  it('accepts typed preferred, fallback and prohibited positions', () =>
    expect(validRules([legalRule], [legalType])).toBe(true));
  it('rejects empty policy', () => expect(validRules([], [legalType])).toBe(false));
  it('rejects duplicate stable rule codes', () =>
    expect(validRules([legalRule, legalRule], [legalType])).toBe(false));
  it('rejects inactive taxonomy', () =>
    expect(validRules([legalRule], [{ ...legalType, is_active: false }])).toBe(false));
  it('rejects foreign taxonomy', () =>
    expect(validRules([{ ...legalRule, clause_type: 'foreign' }], [legalType])).toBe(false));
  it('rejects arbitrary code', () =>
    expect(validRules([{ ...legalRule, code: '<script>' }], [legalType])).toBe(false));
  it('rejects fallback without a preferred position', () =>
    expect(validRules([{ ...legalRule, preferred: [] }], [legalType])).toBe(false));
  it('rejects unsupported numeric operator', () =>
    expect(
      validRules(
        [{ ...legalRule, preferred: [{ field: 'amount', operator: 'contains', value: '100' }] }],
        [legalType],
      ),
    ).toBe(false));
  it('rejects numeric conversion in policy', () =>
    expect(
      validRules(
        [
          {
            ...legalRule,
            preferred: [{ field: 'amount', operator: 'eq', value: 100 as unknown as string }],
          },
        ],
        [legalType],
      ),
    ).toBe(false));
  it('accepts conditional requirements with typed contract context', () =>
    expect(
      validRules(
        [{ ...legalRule, when: [{ field: 'data_processing', operator: 'eq', value: true }] }],
        [legalType],
      ),
    ).toBe(true));
  it('rejects unrecognized condition fields', () =>
    expect(
      validRules(
        [{ ...legalRule, when: [{ field: 'company_secret', operator: 'eq', value: 'private' }] }],
        [legalType],
      ),
    ).toBe(false));
  it('bounds rules', () =>
    expect(
      validRules(
        Array.from({ length: 65 }, (_, i) => ({ ...legalRule, code: 'rule_' + i })),
        [legalType],
      ),
    ).toBe(false));
  it('bounds predicates', () =>
    expect(
      validRules(
        [
          {
            ...legalRule,
            preferred: Array(17).fill({ field: 'amount', operator: 'eq', value: '100' }),
          },
        ],
        [legalType],
      ),
    ).toBe(false));
  it('rejects unsupported severity', () =>
    expect(
      validRules([{ ...legalRule, severity: 'certain' } as unknown as ClauseRule], [legalType]),
    ).toBe(false));
});
