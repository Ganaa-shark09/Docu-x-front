import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page } from '../models/workflow.model';
import { WorkflowNotification } from '../models/notification.model';
@Injectable({ providedIn: 'root' })
export class WorkflowNotificationsService {
  private readonly http = inject(HttpClient);
  list(page = 1, status = ''): Observable<Page<WorkflowNotification>> {
    return this.http.get<Page<WorkflowNotification>>(`${environment.apiBaseUrl}/notifications/`, {
      params: new HttpParams().set('page', page).set('status', status),
    });
  }
  markRead(uuid: string): Observable<unknown> {
    return this.http.post(`${environment.apiBaseUrl}/notifications/${uuid}/mark-read/`, {});
  }
  markAllRead(): Observable<unknown> {
    return this.http.post(`${environment.apiBaseUrl}/notifications/mark-all-read/`, {});
  }
}
