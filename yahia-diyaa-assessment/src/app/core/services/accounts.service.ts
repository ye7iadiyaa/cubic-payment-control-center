import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { Account } from '../models/account.model';

@Injectable({ providedIn: 'root' })
export class AccountsService {
  constructor(private readonly http: HttpClient) {}

  list(): Observable<Account[]> {
    return this.http.get<{ items: Account[] }>('/api/accounts').pipe(map((res) => res.items));
  }
}
