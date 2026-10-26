import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ProofContext, ProofGraph, Citation, HistoryPage } from './source-proof.models';
@Injectable({ providedIn: 'root' })
export class SourceProofService {
  build(field: { kind: string; source_uuid: string; path: (string | number)[] }) {
    return this.http.post<ProofGraph>(this.base + 'proof-claims/output/', field);
  }
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl + '/workflows/';
  context(kind: 'run' | 'document', uuid: string, page = 1) {
    return this.http.get<ProofContext>(this.base + 'proof-claims/context/', {
      params: { [kind === 'run' ? 'run_uuid' : 'document_uuid']: uuid, page },
    });
  }
  graph(uuid: string) {
    return this.http.get<ProofGraph>(this.base + 'proof-claims/' + encodeURIComponent(uuid) + '/');
  }
  citation(uuid: string) {
    return this.http.get<Citation>(
      this.base + 'evidence/' + encodeURIComponent(uuid) + '/citation/',
    );
  }
  history(uuid: string, page = 1) {
    return this.http.get<HistoryPage>(
      this.base + 'evidence/' + encodeURIComponent(uuid) + '/history/',
      { params: { page } },
    );
  }
}
