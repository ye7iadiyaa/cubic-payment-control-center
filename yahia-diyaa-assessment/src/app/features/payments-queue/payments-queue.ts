import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PrimeTemplate } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { PaymentStatus, PaymentType } from '../../core/models/payment.model';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { AuthService } from '../../core/services/auth.service';
import { toIsoDate } from '../../shared/utils/date';
import { PAYMENT_STATUSES, statusLabel, statusSeverity } from '../../shared/utils/payment-status';
import { PaymentsQueueStore } from './payments-queue.store';

function parseStatus(value: string | null): PaymentStatus | null {
  return value && (PAYMENT_STATUSES as string[]).includes(value) ? (value as PaymentStatus) : null;
}

function parseType(value: string | null): PaymentType | null {
  return value === 'DOMESTIC' || value === 'INTERNATIONAL' ? value : null;
}

@Component({
  selector: 'app-payments-queue',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    SelectModule,
    DatePickerModule,
    TableModule,
    TagModule,
    PrimeTemplate,
  ],
  templateUrl: './payments-queue.html',
})
export class PaymentsQueue {
  protected readonly store = inject(PaymentsQueueStore);
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly referenceDataService = inject(ReferenceDataService);

  protected readonly statusLabel = statusLabel;
  protected readonly statusSeverity = statusSeverity;
  protected readonly statusOptions = PAYMENT_STATUSES.map((s) => ({ label: statusLabel(s), value: s }));
  protected readonly typeOptions = signal<{ label: string; value: PaymentType }[]>([]);
  protected readonly currencyOptions = signal<{ label: string; value: string }[]>([]);

  protected readonly q = signal('');
  protected readonly status = signal<PaymentStatus | null>(null);
  protected readonly type = signal<PaymentType | null>(null);
  protected readonly currency = signal<string | null>(null);
  protected readonly dateFrom = signal<Date | null>(null);
  protected readonly dateTo = signal<Date | null>(null);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly sort = signal('createdAt');
  protected readonly direction = signal<'asc' | 'desc'>('desc');

  private readonly searchInput$ = new Subject<string>();

  constructor() {
    this.referenceDataService.get().subscribe((ref) => {
      this.typeOptions.set(ref.paymentTypes.map((t) => ({ label: t, value: t })));
      this.currencyOptions.set(ref.currencies.map((c) => ({ label: c.code, value: c.code })));
    });

    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((term) => {
      this.updateQueryParams({ q: term || null, page: 1 });
    });

    this.route.queryParamMap.subscribe((params) => {
      const dateFrom = params.get('dateFrom');
      const dateTo = params.get('dateTo');

      this.q.set(params.get('q') ?? '');
      this.status.set(parseStatus(params.get('status')));
      this.type.set(parseType(params.get('type')));
      this.currency.set(params.get('currency'));
      this.dateFrom.set(dateFrom ? new Date(dateFrom) : null);
      this.dateTo.set(dateTo ? new Date(dateTo) : null);
      this.page.set(Number(params.get('page')) || 1);
      this.pageSize.set(Number(params.get('pageSize')) || 20);
      this.sort.set(params.get('sort') ?? 'createdAt');
      this.direction.set(params.get('direction') === 'asc' ? 'asc' : 'desc');

      this.store.load({
        page: this.page(),
        pageSize: this.pageSize(),
        sort: this.sort(),
        direction: this.direction(),
        q: this.q() || undefined,
        status: this.status() ?? undefined,
        type: this.type() ?? undefined,
        currency: this.currency() ?? undefined,
        dateFrom: dateFrom ?? undefined,
        dateTo: dateTo ?? undefined,
      });
    });
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  onFilterChange(): void {
    this.updateQueryParams({
      status: this.status(),
      type: this.type(),
      currency: this.currency(),
      dateFrom: this.dateFrom() ? toIsoDate(this.dateFrom()!) : null,
      dateTo: this.dateTo() ? toIsoDate(this.dateTo()!) : null,
      page: 1,
    });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.pageSize();
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    const sortField = typeof event.sortField === 'string' ? event.sortField : this.sort();
    const direction: 'asc' | 'desc' = event.sortOrder === 1 ? 'asc' : 'desc';

    if (page === this.page() && rows === this.pageSize() && sortField === this.sort() && direction === this.direction()) {
      return;
    }
    this.updateQueryParams({ page, pageSize: rows, sort: sortField, direction });
  }

  clearFilters(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  openPayment(id: string): void {
    this.router.navigate(['/payments', id]);
  }

  private updateQueryParams(partial: Record<string, unknown>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: partial, queryParamsHandling: 'merge' });
  }
}
