import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface FxQuoteRequest {
  debitAccountId: string;
  sourceCurrency: string;
  targetCurrency: string;
  targetAmount: number;
}

export interface FxQuote {
  quoteId: string;
  sourceCurrency: string;
  targetCurrency: string;
  rate: number;
  targetAmount: number;
  debitAmount: number;
  expiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class FxQuoteService {
  constructor(private readonly http: HttpClient) {}

  requestQuote(request: FxQuoteRequest): Observable<FxQuote> {
    return this.http.post<FxQuote>('/api/fx/quote', request);
  }
}
