import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import { ReferenceData } from '../models/reference-data.model';

@Injectable({ providedIn: 'root' })
export class ReferenceDataService {
  private readonly http = inject(HttpClient);

  // Reference data doesn't change during a session - fetch it once and share
  // the result with every subscriber instead of re-requesting it per screen.
  private readonly data$: Observable<ReferenceData> = this.http
    .get<ReferenceData>('/api/reference-data')
    .pipe(shareReplay(1));

  get(): Observable<ReferenceData> {
    return this.data$;
  }
}
