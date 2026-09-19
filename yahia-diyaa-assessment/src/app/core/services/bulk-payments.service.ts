import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface RejectedRow {
  row: number;
  clientReference: string;
  code: string;
  message: string;
}

export interface BulkUploadResponse {
  batchId: string;
  receivedRows: number;
  acceptedRows: number;
  rejectedRows: RejectedRow[];
  status: string;
}

@Injectable({ providedIn: 'root' })
export class BulkPaymentsService {
  constructor(private readonly http: HttpClient) {}

  upload(file: File, debtorAccountId: string): Observable<BulkUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('debtorAccountId', debtorAccountId);
    return this.http.post<BulkUploadResponse>('/api/bulk-payments', formData);
  }
}
