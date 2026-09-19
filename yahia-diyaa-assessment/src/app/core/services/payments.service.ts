import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  DecisionResponse,
  Decision,
  PaymentDetail,
  PaymentListResponse,
  PaymentMutationResponse,
  PaymentPayload,
  PaymentQueryParams,
} from '../models/payment.model';

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  constructor(private readonly http: HttpClient) {}

  search(query: PaymentQueryParams): Observable<PaymentListResponse> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.sort) params = params.set('sort', query.sort);
    if (query.direction) params = params.set('direction', query.direction);
    if (query.q) params = params.set('q', query.q);
    if (query.status) params = params.set('status', query.status);
    if (query.type) params = params.set('type', query.type);
    if (query.currency) params = params.set('currency', query.currency);
    if (query.dateFrom) params = params.set('dateFrom', query.dateFrom);
    if (query.dateTo) params = params.set('dateTo', query.dateTo);

    return this.http.get<PaymentListResponse>('/api/payments', { params });
  }

  get(id: string): Observable<PaymentDetail> {
    return this.http.get<PaymentDetail>(`/api/payments/${id}`);
  }

  create(payload: PaymentPayload): Observable<PaymentMutationResponse> {
    return this.http.post<PaymentMutationResponse>('/api/payments', payload);
  }

  update(id: string, payload: PaymentPayload): Observable<PaymentMutationResponse> {
    return this.http.put<PaymentMutationResponse>(`/api/payments/${id}`, payload);
  }

  submit(id: string, rowVersion: number, clientRequestId: string): Observable<PaymentMutationResponse> {
    return this.http.post<PaymentMutationResponse>(`/api/payments/${id}/submit`, { rowVersion, clientRequestId });
  }

  cancel(id: string, rowVersion: number, clientRequestId: string): Observable<PaymentMutationResponse> {
    return this.http.post<PaymentMutationResponse>(`/api/payments/${id}/cancel`, { rowVersion, clientRequestId });
  }

  decide(
    id: string,
    decision: Decision,
    rowVersion: number,
    clientRequestId: string,
    reason?: string,
  ): Observable<DecisionResponse> {
    return this.http.post<DecisionResponse>(`/api/payments/${id}/decision`, {
      decision,
      reason,
      rowVersion,
      clientRequestId,
    });
  }
}
