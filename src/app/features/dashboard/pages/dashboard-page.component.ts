import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, filter, finalize, forkJoin, interval, of, timeout } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { DashboardOverview, RecentActivity } from '../models/dashboard.model';
import { MetricCardComponent } from '../components/metric-card.component';
import { RecentActivityListComponent } from '../components/recent-activity-list.component';
import { DashboardTelemetryChartComponent } from '../components/dashboard-telemetry-chart.component';
import { DashboardRadialCardComponent } from '../components/dashboard-radial-card.component';
import { DashboardService } from '../services/dashboard.service';

@Component({
  selector:'app-dashboard-page', standalone:true,
  imports:[DatePipe,DecimalPipe,RouterLink,MetricCardComponent,RecentActivityListComponent,DashboardTelemetryChartComponent,DashboardRadialCardComponent],
  templateUrl:'./dashboard-page.component.html', styleUrls:['./dashboard-page.component.scss'],
})
export class DashboardPageComponent {
  private readonly destroy=inject(DestroyRef);
  private readonly api=inject(DashboardService);
  readonly overview=signal<DashboardOverview|null>(null);
  readonly recentActivities=signal<RecentActivity[]>([]);
  readonly isLoading=signal(false);
  readonly errorMessage=signal('');
  readonly days=signal<7|14|30>(14);
  readonly chartMetric=signal<'daily'|'cumulative'>('daily');
  readonly autoRefresh=signal(true);
  readonly trendRows=computed(()=>Object.entries(this.overview()?.documents.uploads_by_day??{})
    .filter(([date,n])=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(n)&&n>=0)
    .sort(([a],[b])=>a.localeCompare(b)).slice(-this.days()).map(([date,count])=>({date,count})));
  readonly trendTotal=computed(()=>this.trendRows().reduce((sum,row)=>sum+row.count,0));
  readonly activeDays=computed(()=>this.trendRows().filter(row=>row.count>0).length);
  readonly averageDaily=computed(()=>this.trendRows().length ? this.trendTotal()/this.trendRows().length : 0);
  readonly weeklyRows=computed(()=>this.trendRowsFor(7));
  readonly weeklyActiveDays=computed(()=>this.weeklyRows().filter(row=>row.count>0).length);
  readonly weeklyReportedDays=computed(()=>this.weeklyRows().length);
  private trendRowsFor(days:number){return Object.entries(this.overview()?.documents.uploads_by_day??{})
    .filter(([date,n])=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(n)&&n>=0)
    .sort(([a],[b])=>a.localeCompare(b)).slice(-days).map(([date,count])=>({date,count}));}
  readonly trendPeak=computed(()=>Math.max(0,...this.trendRows().map(row=>row.count)));
  readonly weeklyTotal=computed(()=>this.weeklyRows().reduce((sum,row)=>sum+row.count,0));
  readonly attentionCount=computed(()=>{
    const snapshot=this.overview();
    return snapshot ? snapshot.approvals.assigned_to_me+snapshot.extractions.review_required+snapshot.notifications.unread_count : 0;
  });
  readonly weeklyAccessibleDescription=computed(()=>{
    const rows=this.weeklyRows();
    return `${rows.length} reported days of document uploads: ${rows.map(row=>`${row.date} ${row.count}`).join(', ') || 'none'}.`;
  });
  sparkHeight(value:number):number {
    return this.trendPeakForWeek()>0 ? Math.max(0,Math.min(100,value/this.trendPeakForWeek()*100)) : 0;
  }
  private trendPeakForWeek():number { return Math.max(0,...this.weeklyRows().map(row=>row.count)); }
  readonly readinessPercentage=computed(()=>this.percentage(this.overview()?.documents.ai_ready_documents??0,this.overview()?.documents.total_documents??0));
  readonly indexedPercentage=computed(()=>this.percentage(this.overview()?.documents.indexed_documents??0,this.overview()?.documents.total_documents??0));
  readonly approvalPercentage=computed(()=>this.percentage(this.overview()?.approvals.approved??0,this.overview()?.approvals.total_approvals??0));
  readonly extractionPercentage=computed(()=>this.percentage(this.overview()?.extractions.approved??0,this.overview()?.extractions.total_extraction_runs??0));

  constructor(){
    this.loadDashboard();
    interval(60_000).pipe(filter(()=>this.autoRefresh() && (typeof document==='undefined'||document.visibilityState==='visible')),takeUntilDestroyed(this.destroy))
      .subscribe(()=>this.loadDashboard());
  }
  setDays(value:7|14|30):void{this.days.set(value);}
  setChartMetric(value:'daily'|'cumulative'):void{this.chartMetric.set(value);}
  toggleAutoRefresh():void{this.autoRefresh.update(value=>!value);}
  percentage(n:number,denom:number):number{return denom>0 ? Math.max(0,Math.min(100,Math.round(n/denom*100))):0;}
  formatConfidence(value:number):string{return `${Number(value||0).toFixed(2)}%`;}
  loadDashboard():void{
    if(this.isLoading())return;
    this.isLoading.set(true);
    this.errorMessage.set('');
    let accessDenied = false;
    const fail = (e: unknown, fallback: string) => {
      if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status)) {
        accessDenied = true;
        this.overview.set(null);
        this.recentActivities.set([]);
        this.errorMessage.set('Workspace access changed. Reload or contact an administrator.');
      } else {
        this.errorMessage.set(fallback);
      }
    };
    forkJoin({
      overview:this.api.getOverview().pipe(timeout(15000),catchError((e)=>{fail(e,'Metrics could not be refreshed. Displaying the last successful snapshot if available.');return of(null);})),
      activity:this.api.getRecentActivity(20).pipe(timeout(15000),catchError((e)=>{fail(e,'Recent activity is temporarily unavailable.');return of(null);})),
    }).pipe(takeUntilDestroyed(this.destroy),finalize(()=>this.isLoading.set(false)))
      .subscribe(({overview,activity})=>{
        if (accessDenied) { this.overview.set(null); this.recentActivities.set([]); return; }
        if(overview)this.overview.set(overview);
        if(activity)this.recentActivities.set(activity.results??[]);
      });
  }
}
