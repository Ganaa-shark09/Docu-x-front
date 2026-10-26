import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page } from '../models/workflow.model';
import { WorkflowNotification } from '../models/notification.model';
@Injectable({ providedIn: 'root' })
export class WorkflowNotificationsService {
  private readonly http = inject(HttpClient);
  list(page = 1): Observable<Page<WorkflowNotification>> {
    return this.http.get<Page<WorkflowNotification>>(`${environment.apiBaseUrl}/notifications/`, {
      params: new HttpParams().set('page', page),
    });
  }
}
