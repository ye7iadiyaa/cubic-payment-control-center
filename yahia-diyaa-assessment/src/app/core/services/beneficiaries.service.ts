import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { Beneficiary } from '../models/beneficiary.model';

@Injectable({ providedIn: 'root' })
export class BeneficiariesService {
  constructor(private readonly http: HttpClient) {}

  list(): Observable<Beneficiary[]> {
    return this.http.get<{ items: Beneficiary[] }>('/api/beneficiaries').pipe(map((res) => res.items));
  }
}
