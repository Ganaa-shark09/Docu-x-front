import { ChangeDetectorRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { FinanceAuditsComponent } from './finance-audits.component';
import { ToastService } from '../../../core/notifications/toast.service';
import { FinanceDatasetsComponent } from '../components/finance-datasets.component';
import { FinanceTransactionsComponent } from '../components/finance-transactions.component';
import { FinanceTestsComponent } from '../components/finance-tests.component';
import { FinanceFindingsComponent } from '../components/finance-findings.component';
import { FinanceOutputsComponent } from '../components/finance-outputs.component';
import { FinanceScopeComponent } from '../components/finance-scope.component';
import { FinanceSourceComponent } from '../components/finance-source.component';
import { FinanceValueComponent } from '../components/finance-value.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { environment } from '../../../../environments/environment';
import { FinanceDetail, FinanceMethod, FinanceDecisionState } from '../models/finance.model';
import {
  financeId as id,
  financeDoc as doc,
  financeAudit as audit,
  financeRun as run,
  financeLibrary as library,
  financeDataset as dataset,
  financeTx as tx,
  financeSample as sample,
  financeTest as test,
  financeFinding as finding,
  financeOutput as output,
  financePage as page,
  financeMember as member,
} from '../finance-test.fixtures';
const base = environment.apiBaseUrl + '/workflows/finance-audits/',
  url = base + id + '/';
describe('Finance Audit enterprise workspace', () => {
  let fixture: ComponentFixture<FinanceAuditsComponent>,
    c: FinanceAuditsComponent,
    http: HttpTestingController,
    changes: Subject<string>,
    revoked: Subject<string>;
  beforeEach(() => {
    changes = new Subject();
    revoked = new Subject();
    if (!URL.createObjectURL) URL.createObjectURL = () => '';
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
  });
  afterEach(() => {
    fixture?.destroy();
    http?.verify({ ignoreCancelled: true });
    vi.restoreAllMocks();
  });
  function setup(
    detail = true,
    role = 'company_admin',
    a: FinanceDetail = structuredClone(audit),
    review = true,
  ) {
    TestBed.configureTestingModule({
      imports: [FinanceAuditsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'workflows/finance-audits/:uuid', component: FinanceAuditsComponent },
        ]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap(detail ? { uuid: id } : {})) },
        },
        {
          provide: DocumentGovernanceService,
          useValue: { changes$: changes, memberships: () => of(role === 'member' ? [] : [member]) },
        },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: revoked, subscribeDocuments: vi.fn() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FinanceAuditsComponent);
    c = fixture.componentInstance;
    http.expectOne(environment.apiBaseUrl + '/auth/profile/').flush({ id: 1, role });
    http.expectOne(base + 'test-library/').flush(library);
    if (detail) {
      http.expectOne(url).flush(a);
      if (a.run_uuid)
        http
          .expectOne(environment.apiBaseUrl + '/workflows/runs/' + id + '/')
          .flush({ ...run, capabilities: { ...run.capabilities, review } });
    } else http.expectOne((q) => q.url === base).flush(page([audit]));
    render();
  }
  function render() {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    for (const type of [
      FinanceDatasetsComponent,
      FinanceTransactionsComponent,
      FinanceTestsComponent,
      FinanceFindingsComponent,
      FinanceOutputsComponent,
      FinanceScopeComponent,
      FinanceValueComponent,
    ])
      for (const child of fixture.debugElement.queryAll(By.directive(type)))
        child.injector.get(ChangeDetectorRef).markForCheck();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    return fixture.nativeElement.textContent as string;
  }
  function tab(name: string) {
    c.tab.set(name);
    render();
  }
  function flush(path: string, rows: unknown[] = [], next = false) {
    http.expectOne((q) => q.url === url + path).flush(page(rows, next));
    render();
  }
  function refresh(a: FinanceDetail = audit) {
    http.expectOne(url).flush(a);
    if (a.run_uuid)
      http.expectOne(environment.apiBaseUrl + '/workflows/runs/' + id + '/').flush(run);
    render();
  }
  function datasets() {
    tab('Datasets');
    flush('datasets/', [dataset]);
    return fixture.debugElement.query(By.directive(FinanceDatasetsComponent))
      .componentInstance as FinanceDatasetsComponent;
  }
  function transactions() {
    tab('Transactions');
    flush('transactions/', [tx], true);
    return fixture.debugElement.query(By.directive(FinanceTransactionsComponent))
      .componentInstance as FinanceTransactionsComponent;
  }
  function selectedTx() {
    const t = transactions();
    t.select(tx);
    flush('transactions/' + id + '/corrections/');
    flush('transactions/' + id + '/evidence/');
    return t;
  }
  function testing(reconcile = false) {
    tab(reconcile ? 'Reconciliation' : 'Sampling / tests');
    flush('samples/', [sample]);
    flush('test-runs/', [test]);
    return fixture.debugElement.query(By.directive(FinanceTestsComponent))
      .componentInstance as FinanceTestsComponent;
  }
  function findings() {
    tab('Findings / remediation');
    flush('findings/', [finding], true);
    return fixture.debugElement.query(By.directive(FinanceFindingsComponent))
      .componentInstance as FinanceFindingsComponent;
  }
  function selectedFinding() {
    const f = findings();
    f.select(finding);
    flush('findings/' + id + '/responses/');
    flush('findings/' + id + '/decisions/');
    return f;
  }
  function outputs() {
    tab('Final output');
    flush('outputs/', [output]);
    return fixture.debugElement.query(By.directive(FinanceOutputsComponent))
      .componentInstance as FinanceOutputsComponent;
  }
  it('renders paginated audit list without per-row domain requests', () => {
    setup(false);
    expect(render()).toContain(audit.title);
    http.expectNone((q) => q.url.includes('findings'));
    c.s.list(2);
    const req = http.expectOne((q) => q.url === base);
    expect(req.request.params.get('page')).toBe('2');
    req.flush(page([]));
  });
  it('hides creation from unauthorized members', () => {
    setup(false, 'member');
    expect(render()).not.toContain('Create audit');
    expect(c.s.canCreate()).toBe(false);
  });
  it('creates an authorized audit using backend fields', () => {
    setup(false);
    c.title = 'New review';
    c.create({ scope: audit.scope, policy: audit.policy });
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      title: 'New review',
      department: null,
      scope: audit.scope,
      policy: audit.policy,
    });
    req.flush(audit);
    http.expectOne((q) => q.url === base).flush(page([audit]));
  });
  it('blocks duplicate create while pending', () => {
    setup(false);
    c.title = 'New review';
    c.create({ scope: audit.scope, policy: audit.policy });
    c.create({ scope: audit.scope, policy: audit.policy });
    expect(http.match((q) => q.method === 'POST').length).toBe(1);
  });
  it('does not allow department administrator company-wide creation', () => {
    setup(false, 'department_admin');
    expect(c.s.canManage(null)).toBe(false);
    expect(c.s.canManage(1)).toBe(true);
  });
  it('renders explicit audit dates, quarterly period and fiscal label', () => {
    setup();
    const text = render();
    for (const v of ['2026-04-01', '2026-06-30', 'quarterly', 'Organization FY27'])
      expect(text).toContain(v);
  });
  it('does not infer a missing fiscal label', () => {
    setup(true, 'company_admin', {
      ...audit,
      scope: { start: '2026-04-01', end: '2026-06-30', period: 'custom' },
    });
    expect(render()).toContain('Not supplied');
    expect(render()).not.toContain('FY2026');
  });
  it('renders exact materiality and tolerance without arithmetic', () => {
    setup();
    expect(render()).toContain('9007199254740993.12345678');
    expect(render()).toContain('0.00000001');
  });
  it('scope editor sends valid currency-specific policy', () => {
    setup(true, 'company_admin', { ...audit, status: 'draft', run_uuid: null });
    c.editing = true;
    render();
    const editor = fixture.debugElement.query(By.directive(FinanceScopeComponent))
      .componentInstance as FinanceScopeComponent;
    editor.save();
    const req = http.expectOne(url + 'configure/');
    expect(req.request.body.scope.fiscal_year).toBe('Organization FY27');
    expect(req.request.body.policy.materiality.USD).toBe('9007199254740993.12345678');
    req.flush(audit);
    refresh();
  });
  it.each(['1e4', 'NaN', '1,200.00', '0.123456789', '-1'])(
    'rejects invalid nonnegative materiality %s',
    (value) => {
      setup(true, 'company_admin', { ...audit, status: 'draft', run_uuid: null });
      c.editing = true;
      render();
      const editor = fixture.debugElement.query(By.directive(FinanceScopeComponent))
        .componentInstance as FinanceScopeComponent;
      editor.thresholds = [{ currency: 'USD', materiality: value, tolerance: '' }];
      editor.save();
      expect(editor.error).toContain('exact decimals');
      http.expectNone(url + 'configure/');
    },
  );
  it('dataset form supports only CSV and JSON', () => {
    setup();
    datasets();
    const input = fixture.nativeElement.querySelector('input[type=file]');
    expect(input.accept).toBe('.csv,.json');
    expect(render()).not.toContain('XLSX');
  });
  it.each(['csv', 'json'])('uploads %s using internal document endpoint then imports', (kind) => {
    setup();
    const d = datasets();
    d.choose({ target: { files: [new File(['source'], 'audit.' + kind)] } } as unknown as Event);
    d.importSource();
    const upload = http.expectOne(environment.apiBaseUrl + '/documents/');
    expect(upload.request.body.get('file').name).toBe('audit.' + kind);
    upload.flush({ uuid: doc });
    const req = http.expectOne(url + 'datasets/');
    expect(req.request.body.kind).toBe(kind);
    expect(req.request.body.document_uuid).toBe(doc);
    expect(req.request.body.revision).toBe(5);
    expect(req.request.body.idempotency_key).toBeTruthy();
    req.flush(dataset);
    refresh();
    flush('datasets/', [dataset]);
    expect(render()).toContain('Import ready');
  });
  it.each(['xlsx', 'exe', 'pdf'])('rejects unsupported file %s', (extension) => {
    setup();
    const d = datasets();
    d.choose({
      target: { files: [new File(['x'], 'audit.' + extension)], value: 'chosen' },
    } as unknown as Event);
    expect(d.file).toBeNull();
    expect(render()).toContain('CSV or JSON');
  });
  it('rejects files above bounded import limit', () => {
    setup();
    const d = datasets();
    const file = new File(['x'], 'audit.csv');
    Object.defineProperty(file, 'size', { value: 8388609 });
    d.choose({ target: { files: [file], value: '' } } as unknown as Event);
    expect(d.file).toBeNull();
  });
  it('dataset provenance includes checksum, source, rows, date and mapping', () => {
    setup();
    datasets();
    const text = render();
    for (const v of [dataset.checksum, doc, '40 rows', 'gross_amount']) expect(text).toContain(v);
  });
  it('mapping selector contains only actual canonical fields', () => {
    setup();
    const d = datasets();
    d.mapping = [{ source: 'Amount', target: 'gross_amount' }];
    render();
    expect(d.fields).toContain('vendor_identifier');
    expect(d.fields).not.toContain('amount');
    expect(render()).toContain('Canonical field');
  });
  it('rejects duplicate mapping targets before request', () => {
    setup();
    const d = datasets();
    d.documentUuid = doc;
    d.mapping = [
      { source: 'A', target: 'gross_amount' },
      { source: 'B', target: 'gross_amount' },
    ];
    d.importSource();
    http.expectNone(url + 'datasets/');
    expect(render()).toContain('unique source');
  });
  it('handles import validation safely and preserves uploaded registration for retry', () => {
    setup();
    const d = datasets();
    d.documentUuid = doc;
    d.importSource();
    http
      .expectOne(url + 'datasets/')
      .flush({ detail: 'STACK_TRACE_SECRET' }, { status: 400, statusText: 'Bad request' });
    expect(d.documentUuid).toBe(doc);
    expect(render()).toContain('Validation failed');
    expect(render()).not.toContain('STACK_TRACE_SECRET');
  });
  it('reuses import idempotency key on uncertain retry without duplicate upload', () => {
    setup();
    const d = datasets();
    d.documentUuid = doc;
    d.importSource();
    const a = http.expectOne(url + 'datasets/'),
      key = a.request.body.idempotency_key;
    a.flush({}, { status: 500, statusText: 'Failure' });
    d.importSource();
    const b = http.expectOne(url + 'datasets/');
    expect(b.request.body.idempotency_key).toBe(key);
    b.flush(dataset);
    refresh();
    flush('datasets/', [dataset]);
    http.expectNone(environment.apiBaseUrl + '/documents/');
  });
  it('uses server transaction pagination', () => {
    setup();
    const t = transactions();
    t.txs.load(2);
    const req = http.expectOne((q) => q.url === url + 'transactions/');
    expect(req.request.params.get('page')).toBe('2');
    req.flush(page([]));
  });
  it('passes supported filters and exact decimal bounds to server', () => {
    setup();
    const t = transactions();
    t.filters = {
      currency: 'USD',
      identifier: 'TX-001',
      amount_min: '9007199254740993.12345678',
      date_from: '2026-04-01',
      vendor: 'V1',
      account: 'AP',
      transaction_type: 'payment',
    };
    t.apply();
    const req = http.expectOne((q) => q.url === url + 'transactions/');
    for (const [k, v] of Object.entries(t.filters)) expect(req.request.params.get(k)).toBe(v);
    req.flush(page([tx]));
  });
  it('renders multi-currency values without client FX', () => {
    setup();
    const t = transactions();
    t.txs.rows.set([
      tx,
      { ...tx, uuid: doc, data: { ...tx.data, currency: 'JPY', gross_amount: '8.00000001' } },
    ]);
    const text = render();
    expect(text).toContain('USD 9007199254740993.12345678');
    expect(text).toContain('JPY 8.00000001');
  });
  it('transaction detail renders lines and row provenance', () => {
    setup();
    selectedTx();
    const text = render();
    expect(text).toContain('Normalized fields and lines');
    expect(text).toContain('AP');
    expect(text).toContain('source row');
    expect(text).toContain('9007199254740993.12345678');
  });
  it('saves a complete normalized correction with reason and revision', () => {
    setup();
    const t = selectedTx();
    t.beginCorrection();
    t.reason = 'Source amount reviewed';
    t.draft['gross_amount'] = '9007199254740993.12345677';
    t.correct();
    const req = http.expectOne(url + 'transactions/' + id + '/correct/');
    expect(req.request.body.revision).toBe(5);
    expect(req.request.body.reason).toBe(t.reason);
    expect(req.request.body.values.gross_amount).toBe('9007199254740993.12345677');
    expect(req.request.body.values.lines[0].debit).toBe('9007199254740993.12345678');
    req.flush({ uuid: id, number: 1 });
    refresh();
    flush('transactions/', [tx]);
  });
  it('hides unauthorized correction and supporting evidence writes', () => {
    setup(true, 'member', audit, false);
    selectedTx();
    expect(render()).not.toContain('Correct normalized transaction');
    expect(render()).not.toContain('Link proof-backed');
  });
  it('correction conflict reloads server state and clears draft without replay', () => {
    setup();
    const t = selectedTx();
    t.beginCorrection();
    t.reason = 'Reviewed';
    t.correct();
    http
      .expectOne(url + 'transactions/' + id + '/correct/')
      .flush({}, { status: 409, statusText: 'Conflict' });
    refresh();
    flush('transactions/', [tx]);
    expect(t.selected()).toBeNull();
    expect(t.draft).toEqual({});
    expect(c.s.pending()).toBe(false);
    expect(render()).toContain('audit changed');
    http.expectNone(url + 'transactions/' + id + '/correct/');
  });
  it('links proof with exact source offsets and original decimal values', () => {
    setup();
    const t = selectedTx();
    t.supportDoc = doc;
    t.supportRevision = 3;
    t.quote = 'Receipt USD 10.00000001';
    t.end = t.quote.length;
    t.page = 1;
    t.supportValues = { amount: '10.00000001', currency: 'USD' };
    t.link();
    const req = http.expectOne(url + 'transactions/' + id + '/support/');
    expect(req.request.body.evidence.proof).toEqual({
      document_uuid: doc,
      governance_revision: 3,
      start: 0,
      end: 23,
      preview: t.quote,
      page: 1,
    });
    expect(req.request.body.evidence.values.amount).toBe('10.00000001');
    req.flush({ uuid: id });
    refresh();
    flush('transactions/', [tx]);
  });
  it.each(library.sampling_methods)('supports server sampling method %s', (method) => {
    setup();
    const t = testing();
    expect(t.s.library()?.sampling_methods).toContain(method);
    t.method = method;
    t.size = 1;
    t.seed = 'explicit-seed';
    t.thresholds = [{ currency: 'USD', amount: '0.00000001' }];
    t.sample();
    const req = http.expectOne(url + 'samples/');
    expect(req.request.body.parameters.method).toBe(method);
    expect(req.request.body.revision).toBe(5);
    if (method === 'random' || method === 'stratified')
      expect(req.request.body.parameters.seed).toBe('explicit-seed');
    else expect(req.request.body.parameters.seed).toBeUndefined();
    req.flush(sample);
    refresh();
    flush('samples/', [sample]);
    flush('test-runs/', [test]);
  });
  it('requires an explicit random seed', () => {
    setup();
    const t = testing();
    t.seed = '';
    t.sample();
    http.expectNone(url + 'samples/');
    expect(render()).toContain('explicit reproducible seed');
  });
  it('prevents duplicate sample mutation while pending', () => {
    setup();
    const t = testing();
    t.seed = 'seed';
    t.sample();
    t.sample();
    expect(http.match(url + 'samples/').length).toBe(1);
  });
  it('historical samples retain population, parameters and seed', () => {
    setup();
    const t = testing();
    t.samples.rows.set([{ ...sample, population_revision: 1 }]);
    const text = render();
    expect(text).toContain('Historical sample');
    expect(text).toContain('explicit-seed');
    expect(text).toContain('Population 1');
  });
  it('shows bounded selected sample records with selection reasons', () => {
    setup();
    const t = testing();
    t.selectedSample.set({
      ...sample,
      selected: Array.from({ length: 101 }, (_, i) => ({
        ...sample.selected[0],
        transaction_uuid: 'tx-' + i,
      })),
    });
    render();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(50);
    expect(render()).not.toContain('tx-100');
    t.samplePage = 3;
    expect(render()).toContain('tx-100');
  });
  it('test library is protected read-only', () => {
    setup();
    testing();
    expect(render()).toContain('Read-only system definitions');
    expect(render()).toContain('Library version 1');
    expect(fixture.nativeElement.querySelector('input[name="testCode"]')).toBeNull();
  });
  it('executes a retest with revision, sample, lineage and stable key', () => {
    setup();
    const t = testing();
    t.sampleUuid = id;
    t.previousUuid = doc;
    t.execute();
    t.execute();
    const req = http.expectOne(url + 'test-runs/');
    expect(req.request.body).toMatchObject({ revision: 5, sample_uuid: id, previous_uuid: doc });
    expect(req.request.body.idempotency_key).toBeTruthy();
    req.flush(test);
    refresh();
    flush('samples/', [sample]);
    flush('test-runs/', [test]);
  });
  it('shows separate original and retest history with frozen population', () => {
    setup();
    const t = testing();
    t.tests.rows.set([test, { ...test, uuid: doc, previous_uuid: id, population_revision: 1 }]);
    const text = render();
    expect(text).toContain('Original test');
    expect(text).toContain('Retest');
    expect(text).toContain('Historical population');
    expect(text).toContain('Previous test');
  });
  it('server filters and paginates test results', () => {
    setup();
    const t = testing();
    t.code = 'invoice';
    t.status = 'exception';
    t.selectTest(test);
    const req = http.expectOne((q) => q.url === url + 'test-runs/' + id + '/results/');
    expect(req.request.params.get('code')).toBe('invoice');
    expect(req.request.params.get('status')).toBe('exception');
    req.flush(page([]));
    t.filterResults(2);
    const next = http.expectOne((q) => q.url === url + 'test-runs/' + id + '/results/');
    expect(next.request.params.get('page')).toBe('2');
    next.flush(page([]));
  });
  it.each([
    'exact',
    'probable',
    'ambiguous',
    'not_found',
    'partial_payment',
    'overpayment',
    'currency_comparison_unavailable',
    'missing_po',
    'missing_receipt',
    'amount_mismatch',
    'not_applicable',
  ])('renders backend reconciliation %s without invented calculations', (state) => {
    setup();
    const t = testing(true);
    t.selectTest(test);
    flush('test-runs/' + id + '/results/', [
      {
        uuid: id,
        transaction_uuid: id,
        code: 'invoice',
        status: 'review_required',
        finding_uuid: id,
        evidence: {
          state,
          invoice: '9007199254740993.12345678',
          payment: '9007199254740993.12345679',
          difference: '0.00000001',
          tolerance: '0.00000000',
        },
      },
    ]);
    const text = render();
    expect(text).toContain('9007199254740993.12345679');
    expect(text).toContain('0.00000001');
    expect(text.toLowerCase()).not.toContain('fraud');
    expect(text.toLowerCase()).not.toContain('misconduct');
    if (state === 'currency_comparison_unavailable')
      expect(text).toContain('Comparison unavailable');
    if (state === 'missing_receipt') expect(text).toContain('Missing receipt');
  });
  it.each([
    'finance_duplicates',
    'finance_vendor',
    'finance_three_way',
    'finance_period',
    'finance_cutoff',
    'finance_frequency',
    'finance_support',
    'finance_journal',
  ])('renders %s as review evidence without accusations', (category) => {
    setup();
    const f = findings();
    f.findings.rows.set([{ ...finding, category }]);
    f.select({ ...finding, category });
    flush('findings/' + id + '/responses/');
    flush('findings/' + id + '/decisions/');
    expect(render()).toContain(category.replace('_', ' ').replace('_', ' '));
    expect(render().toLowerCase()).not.toContain('fraud');
  });
  it('findings use server filters and keep original calculation evidence visible', () => {
    setup();
    const f = selectedFinding();
    expect(render()).toContain('Original finding');
    expect(render()).toContain('9007199254740993.12345678');
    f.filters = { status: 'open', severity: 'high', category: 'finance_duplicates' };
    f.apply();
    const req = http.expectOne((q) => q.url === url + 'findings/');
    expect(req.request.params.get('severity')).toBe('high');
    req.flush(page([finding]));
  });
  it('records evidence requests through domain command with assignment', () => {
    setup();
    const f = selectedFinding();
    f.owner = { user: 1 };
    f.requestedItem = 'Please attach receipt';
    f.dueDate = '2026-10-20';
    f.request();
    const req = http.expectOne(url + 'findings/' + id + '/request-evidence/');
    expect(req.request.body).toEqual({
      revision: 5,
      owner: { user: 1 },
      requested_item: f.requestedItem,
      due_date: f.dueDate,
    });
    req.flush({ uuid: id });
    refresh();
    flush('findings/', [finding]);
  });
  it('preserves management response independently from original finding', () => {
    setup();
    const f = selectedFinding();
    f.response = 'Timing difference confirmed';
    f.plannedAction = 'Obtain receipt';
    f.evidenceDocuments = doc;
    f.targetDate = '2026-10-20';
    f.requestUuid = id;
    f.respond();
    const req = http.expectOne(url + 'findings/' + id + '/respond/');
    expect(req.request.body).toMatchObject({
      revision: 5,
      response: f.response,
      planned_action: f.plannedAction,
      target_date: f.targetDate,
      evidence_documents: [doc],
      request_uuid: id,
    });
    req.flush({ uuid: id });
    refresh();
    flush('findings/', [finding]);
    expect(render()).toContain('finance duplicates');
  });
  it.each([
    'under_review',
    'remediation_in_progress',
    'resolved',
    'closed',
  ] as FinanceDecisionState[])('uses controlled decision %s with reason', (decision) => {
    setup();
    const f = selectedFinding();
    f.decision = decision;
    f.reason = 'Reviewed source and response';
    f.decide();
    const req = http.expectOne(url + 'findings/' + id + '/decide/');
    expect(req.request.body).toEqual({ revision: 5, decision, reason: f.reason });
    req.flush({ uuid: id });
    refresh();
    flush('findings/', [finding]);
  });
  it('risk acceptance requires deliberate confirmation and reason', () => {
    setup();
    const f = selectedFinding();
    f.decision = 'accepted_risk';
    f.reason = 'Approved documented risk';
    f.decide();
    http.expectNone(url + 'findings/' + id + '/decide/');
    f.riskConfirmed = true;
    f.decide();
    const req = http.expectOne(url + 'findings/' + id + '/decide/');
    expect(req.request.body.decision).toBe('accepted_risk');
    req.flush({ uuid: id });
    refresh();
    flush('findings/', [finding]);
  });
  it('hides risk acceptance from nonadministrators even when reviewer', () => {
    setup(true, 'member');
    selectedFinding();
    expect(fixture.nativeElement.querySelector('option[value="accepted_risk"]')).toBeNull();
  });
  it('renders risk acceptance actor, timestamp, reason and decision history', () => {
    setup();
    const f = selectedFinding();
    f.decisions.rows.set([
      {
        uuid: id,
        number: 1,
        created_at: '2026-10-12T00:00:00Z',
        actor: 19,
        decision: 'accepted_risk',
        reason: 'Documented risk acceptance',
      },
    ]);
    expect(render()).toContain('accepted risk');
    expect(render()).toContain('Actor 19');
    expect(render()).toContain('Documented risk acceptance');
  });
  it('uses existing workflow and approval routes without custom finalization', () => {
    setup();
    tab('Review / approval');
    expect(
      fixture.nativeElement.querySelector('a[href="/workflows/runs/' + id + '"]'),
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/approvals"]')).toBeTruthy();
    expect(render()).toContain('Readiness');
    expect(render()).not.toContain('Finalize now');
  });
  it('starts the existing audit workflow with actual reviewer and approver', () => {
    setup(true, 'company_admin', { ...audit, status: 'draft', run_uuid: null });
    c.reviewer = { user: 1 };
    c.approver = { department: 1, role: 'department_admin' };
    c.submit();
    c.submit();
    const req = http.expectOne(url + 'submit/');
    expect(req.request.body).toMatchObject({
      revision: 5,
      reviewer: { user: 1 },
      approver: { department: 1, role: 'department_admin' },
    });
    expect(req.request.body.idempotency_key).toBeTruthy();
    req.flush(run);
    refresh();
  });
  it('final outputs are read-only, versioned and explicitly assistive', () => {
    setup();
    const o = outputs();
    o.open(id);
    http.expectOne(url + 'outputs/' + id + '/').flush(output);
    const text = render();
    expect(text).toContain('Latest recorded output');
    expect(text).toContain('Read-only output version 1');
    expect(text).toContain('9007199254740993.12345678');
    expect(text).toContain('No statutory opinion');
  });
  it('distinguishes output history without merging versions', () => {
    setup();
    const o = outputs();
    o.outputs.count = 2;
    o.outputs.rows.set([output, { ...output, uuid: doc, number: 2 }]);
    expect(render()).toContain('Historical output');
    expect(render()).toContain('Latest recorded output');
  });
  it('exports only the authorized server response via POST and revokes blob URL', () => {
    setup();
    const o = outputs();
    o.open(id);
    http.expectOne(url + 'outputs/' + id + '/').flush(output);
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:finance-test'),
      revoke = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    o.download();
    o.download();
    const req = http.expectOne(url + 'outputs/' + id + '/export/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ version: 1, authorized: true });
    refresh();
    flush('outputs/', [output]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:finance-test');
  });
  it('export denial clears output instead of reconstructing protected data', () => {
    setup();
    const o = outputs();
    o.open(id);
    http.expectOne(url + 'outputs/' + id + '/').flush(output);
    const create = vi.spyOn(URL, 'createObjectURL');
    o.download();
    http
      .expectOne(url + 'outputs/' + id + '/export/')
      .flush({}, { status: 403, statusText: 'Denied' });
    expect(c.s.audit()).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(render()).not.toContain('9007199254740993');
  });
  it.each([401, 403, 404])(
    'clears protected transaction fields and correction drafts on %i',
    (status) => {
      setup();
      const t = selectedTx();
      t.beginCorrection();
      t.draft['vendor_tax_id'] = 'RESTRICTED_TAX';
      t.filters = { currency: 'USD' };
      t.apply();
      http
        .expectOne((q) => q.url === url + 'transactions/')
        .flush({ detail: 'STACK_TRACE_SECRET' }, { status, statusText: 'Unavailable' });
      expect(c.s.audit()).toBeNull();
      const text = render();
      expect(text).not.toContain('RESTRICTED_TAX');
      expect(text).not.toContain('9007199254740993');
      expect(text).not.toContain('STACK_TRACE_SECRET');
    },
  );
  it.each([
    'Transactions',
    'Datasets',
    'Sampling / tests',
    'Findings / remediation',
    'Final output',
  ])('revocation destroys protected %s and pending reads', (name) => {
    setup();
    if (name === 'Transactions') transactions();
    if (name === 'Datasets') datasets();
    if (name === 'Sampling / tests') testing();
    if (name === 'Findings / remediation') findings();
    if (name === 'Final output') outputs();
    revoked.next(doc);
    expect(c.s.audit()).toBeNull();
    expect(render()).not.toContain('9007199254740993');
    expect(render()).toContain('Protected finance content was cleared');
  });
  it('governance change cancels late result requests', () => {
    setup();
    const t = testing();
    t.selectTest(test);
    const request = http.expectOne((q) => q.url === url + 'test-runs/' + id + '/results/');
    changes.next(doc);
    expect(request.cancelled).toBe(true);
    expect(c.s.audit()).toBeNull();
  });
  it('authenticated preview uses document endpoint and revokes URL on access change', () => {
    setup();
    datasets();
    render();
    const source = fixture.debugElement.query(By.directive(FinanceSourceComponent))
      .componentInstance as FinanceSourceComponent;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    source.preview();
    const req = http.expectOne(
      (q) => q.url === environment.apiBaseUrl + '/documents/' + doc + '/preview/',
    );
    expect(req.request.params.get('scope')).toBe('internal');
    req.flush(new Blob(['image'], { type: 'image/png' }));
    render();
    expect(fixture.nativeElement.querySelector('img')).toBeTruthy();
    revoked.next(doc);
    render();
    expect(revoke).toHaveBeenCalledWith('blob:test');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
  it('source preview denial clears whole finance workspace', () => {
    setup();
    datasets();
    const source = fixture.debugElement.query(By.directive(FinanceSourceComponent))
      .componentInstance as FinanceSourceComponent;
    source.preview();
    http
      .expectOne((q) => q.url.endsWith('/preview/'))
      .flush(null, { status: 403, statusText: 'Denied' });
    expect(c.s.audit()).toBeNull();
    expect(render()).not.toContain(dataset.checksum);
  });
  it('never renders imported descriptions as HTML commands', () => {
    setup();
    const t = transactions();
    t.select({ ...tx, data: { ...tx.data, description: '<img src=x onerror=alert(1)>' } });
    flush('transactions/' + id + '/corrections/');
    flush('transactions/' + id + '/evidence/');
    expect(render()).toContain('<img src=x onerror=alert(1)>');
    expect(fixture.nativeElement.querySelector('img[src=x]')).toBeNull();
  });
  it('bounds nested evidence arrays instead of rendering thousands of nodes', () => {
    setup();
    const f = selectedFinding();
    f.selected.set({
      ...finding,
      evidence: Array.from({ length: 200 }, (_, i) => 'evidence-' + i),
    });
    const text = render();
    expect(text).toContain('evidence-49');
    expect(text).not.toContain('evidence-50');
  });
  it('does not send internal financial source to External AI', () => {
    setup();
    transactions();
    http.expectNone((q) => q.url.includes('/ai/external'));
    expect(fixture.nativeElement.querySelector('a[href*="ai/external"]')).toBeNull();
  });

  it('loads transaction support from a selected test result on demand', () => {
    setup();
    const t = testing();
    http.expectNone((q) => q.url.endsWith('/evidence/'));
    t.selectedEvidence.set(id);
    render();
    flush('transactions/' + id + '/evidence/', [
      {
        uuid: id,
        document_uuid: doc,
        role: 'invoice',
        data: { invoice_uuid: id },
        checksum: dataset.checksum,
        governance_revision: 3,
      },
    ]);
    expect(render()).toContain('Authorized transaction support');
    expect(
      fixture.nativeElement.querySelector('app-finance-transaction-evidence app-finance-source'),
    ).toBeTruthy();
  });
  it('loads affected finding support without per-finding eager requests', () => {
    setup();
    const f = selectedFinding();
    http.expectNone((q) => q.url.endsWith('/evidence/'));
    f.selectedEvidence.set(id);
    render();
    flush('transactions/' + id + '/evidence/', [
      {
        uuid: id,
        document_uuid: doc,
        role: 'receipt',
        data: {},
        checksum: dataset.checksum,
        governance_revision: 3,
      },
    ]);
    expect(render()).toContain('Authorized transaction support');
  });
  it('subscribes current workflow sources before preview for revocation', () => {
    setup();
    const realtime = TestBed.inject(DocumentRealtimeService);
    expect(realtime.subscribeDocuments).toHaveBeenCalledWith([doc]);
  });
  it('cancels collection reads when a tab is destroyed', () => {
    setup();
    tab('Transactions');
    const req = http.expectOne((q) => q.url === url + 'transactions/');
    tab('Overview');
    expect(req.cancelled).toBe(true);
  });
  it('refreshes current state after a focus check observes revision change', () => {
    setup();
    window.dispatchEvent(new Event('focus'));
    http.expectOne(url).flush({ ...audit, revision: 6 });
    refresh({ ...audit, revision: 6 });
    expect(c.s.audit()?.revision).toBe(6);
    expect(TestBed.inject(ToastService).messages().at(-1)?.message).toContain('Current server state was refreshed');
  });
  it('clears scope drafts and assignment choices when access is revoked', () => {
    setup(true, 'company_admin', { ...audit, status: 'draft', run_uuid: null });
    c.editing = true;
    c.title = 'CONFIDENTIAL_DRAFT';
    c.reviewer = { user: 1 };
    revoked.next(doc);
    render();
    expect(c.editing).toBe(false);
    expect(c.title).toBe('');
    expect(c.reviewer).toBeNull();
    expect(c.s.members()).toEqual([]);
  });

  it('explicitly erases retained transaction drafts and paged rows on revocation', () => {
    setup();
    const t = selectedTx();
    t.beginCorrection();
    t.draft['vendor_tax_id'] = 'RESTRICTED_TAX';
    revoked.next(doc);
    render();
    expect(t.draft).toEqual({});
    expect(t.selected()).toBeNull();
    expect(t.txs.rows()).toEqual([]);
    expect(t.evidence.rows()).toEqual([]);
  });
  it('explicitly erases retained output state on revocation', () => {
    setup();
    const o = outputs();
    o.open(id);
    http.expectOne(url + 'outputs/' + id + '/').flush(output);
    revoked.next(doc);
    render();
    expect(o.selected()).toBeNull();
    expect(o.outputs.rows()).toEqual([]);
  });
});
