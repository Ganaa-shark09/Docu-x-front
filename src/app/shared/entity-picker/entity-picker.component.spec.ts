import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityPickerComponent } from './entity-picker.component';
import { environment } from '../../../environments/environment';
describe('Authorized entity selection', () => {
  let f: ComponentFixture<EntityPickerComponent>,
    c: EntityPickerComponent,
    http: HttpTestingController;
  const base = environment.apiBaseUrl + '/';
  const id = '11111111-1111-4111-8111-111111111111';
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EntityPickerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    f = TestBed.createComponent(EntityPickerComponent);
    f.componentRef.setInput('kind', 'documents');
    f.componentRef.setInput('multiple', true);
    c = f.componentInstance;
    f.detectChanges();
  });
  afterEach(() => {
    f.destroy();
    http.verify({ ignoreCancelled: true });
  });
  it('searches server-side and emits only a selected UUID, never arbitrary typed text', () => {
    const changed = vi.fn();
    c.registerOnChange(changed);
    c.search('invoice');
    const req = http.expectOne((r) => r.url === base + 'documents/');
    expect(req.request.params.get('search')).toBe('invoice');
    expect(req.request.params.get('scope')).toBe('internal');
    req.flush({
      results: [{ uuid: id, title: 'Supplier invoice', document_type: 'invoice' }],
      next: null,
    });
    expect(changed).not.toHaveBeenCalled();
    c.choose(c.results()[0]);
    expect(changed).toHaveBeenLastCalledWith([id]);
    expect(c.selected()[0].label).toBe('Supplier invoice');
    c.remove(id);
    expect(changed).toHaveBeenLastCalledWith([]);
  });
  it('ignores forged options which were not returned by the server', () => {
    const changed = vi.fn();
    c.registerOnChange(changed);
    c.choose({ id, label: 'Forged', detail: '' });
    expect(changed).not.toHaveBeenCalled();
  });
  it('cancels obsolete searches and retains the newest response', () => {
    c.search('old');
    const old = http.expectOne((r) => r.url.endsWith('/documents/'));
    c.search('new');
    expect(old.cancelled).toBe(true);
    http.expectOne((r) => r.url.endsWith('/documents/')).flush({ results: [], next: null });
    expect(c.results()).toEqual([]);
  });
  it('uses numeric department identifiers while resolving labels through authorized list filtering', () => {
    f.componentRef.setInput('kind', 'departments');
    f.componentRef.setInput('multiple', false);
    f.detectChanges();
    c.writeValue(7);
    const req = http.expectOne((r) => r.url.endsWith('/workspaces/departments/'));
    expect(req.request.params.get('id')).toBe('7');
    req.flush({ results: [{ id: 7, uuid: id, name: 'Finance' }] });
    expect(c.selected()).toEqual([{ id: 7, label: 'Finance', detail: '' }]);
    const change = vi.fn();
    c.registerOnChange(change);
    c.search('Finance');
    http
      .expectOne((r) => r.url.endsWith('/departments/'))
      .flush({ results: [{ id: 7, uuid: id, name: 'Finance' }] });
    c.choose(c.results()[0]);
    expect(change).toHaveBeenCalledWith(7);
  });
  it('filters controls by the selected published framework version', () => {
    f.componentRef.setInput('kind', 'controls');
    f.componentRef.setInput('contextVersion', id);
    f.detectChanges();
    c.search('retention');
    const req = http.expectOne((r) => r.url.endsWith('/compliance-controls/'));
    expect(req.request.params.get('framework_version_uuid')).toBe(id);
    req.flush({ results: [], next: null });
  });
  it('reports unavailable saved records without inventing a label', () => {
    c.writeValue([id]);
    http
      .expectOne(base + 'documents/' + id + '/')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(c.selected()).toEqual([]);
    expect(c.error()).toContain('unavailable');
  });
  it('does not search or mutate while disabled', () => {
    c.setDisabledState(true);
    c.search('invoice');
    http.expectNone((r) => r.url.endsWith('/documents/'));
    expect(c.query.disabled).toBe(true);
  });
  it('resolves saved compliance evidence only through its assessment-scoped source directory', () => {
    f.componentRef.setInput('kind', 'sources');
    f.componentRef.setInput('contextId', id);
    f.componentRef.setInput('sourceKind', 'invoice_output');
    f.componentRef.setInput('multiple', false);
    f.detectChanges();
    c.writeValue(id);
    expect(c.validate()).toEqual({ entityUnavailable: true });
    const req = http.expectOne(
      (r) => r.url === base + 'workflows/compliance-assessments/' + id + '/source-options/',
    );
    expect(req.request.params.get('source_uuid')).toBe(id);
    expect(req.request.params.get('kind')).toBe('invoice_output');
    req.flush({
      results: [
        { uuid: id, title: 'Reviewed supplier invoice', status: 'Current', code: 'Version 1' },
      ],
    });
    expect(c.selected()[0].label).toBe('Reviewed supplier invoice');
    expect(c.validate()).toBeNull();
  });
});
