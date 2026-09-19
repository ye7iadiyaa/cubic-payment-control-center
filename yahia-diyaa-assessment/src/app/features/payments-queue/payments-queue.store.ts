import { Injectable, inject, signal } from '@angular/core';
import { Subject, catchError, of, switchMap, tap } from 'rxjs';

import { PaymentQueryParams, PaymentSummary } from '../../core/models/payment.model';
import { PaymentsService } from '../../core/services/payments.service';

@Injectable({ providedIn: 'root' })
export class PaymentsQueueStore {
  private readonly paymentsService = inject(PaymentsService);
  private readonly requests = new Subject<PaymentQueryParams>();
  private lastQuery: PaymentQueryParams | null = null;

  readonly items = signal<PaymentSummary[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal(false);

  constructor() {
    this.requests
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        // switchMap cancels/ignores a stale in-flight search the moment a
        // newer one starts, so a slow response to an old filter can never
        // land after a faster response to a newer one.
        switchMap((query) =>
          this.paymentsService.search(query).pipe(
            catchError(() => {
              this.error.set(true);
              return of(null);
            }),
          ),
        ),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (result) {
          this.items.set(result.items);
          this.total.set(result.total);
        }
      });
  }

  load(query: PaymentQueryParams): void {
    this.lastQuery = query;
    this.requests.next(query);
  }

  retry(): void {
    if (this.lastQuery) this.requests.next(this.lastQuery);
  }
}
