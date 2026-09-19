import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { Subject, catchError, of, switchMap, tap } from 'rxjs';

import { FxQuote, FxQuoteService } from '../../core/services/fx-quote.service';

@Component({
  selector: 'app-fx-quote-panel',
  imports: [DecimalPipe, ButtonModule, MessageModule],
  templateUrl: './fx-quote-panel.html',
})
export class FxQuotePanel {
  private readonly fxQuoteService = inject(FxQuoteService);

  readonly debitAccountId = input.required<string>();
  readonly sourceCurrency = input.required<string>();
  readonly targetCurrency = input.required<string>();
  readonly targetAmount = input.required<number>();

  readonly quoteChange = output<FxQuote | null>();

  protected readonly quote = signal<FxQuote | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly remainingSeconds = signal(0);

  private readonly requests = new Subject<void>();
  private countdownHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.requests
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        // switchMap: if the user mashes "refresh" twice, only the response to
        // the latest request can ever land.
        switchMap(() =>
          this.fxQuoteService
            .requestQuote({
              debitAccountId: this.debitAccountId(),
              sourceCurrency: this.sourceCurrency(),
              targetCurrency: this.targetCurrency(),
              targetAmount: this.targetAmount(),
            })
            .pipe(
              catchError(() => {
                this.error.set(true);
                return of(null);
              }),
            ),
        ),
      )
      .subscribe((quote) => {
        this.loading.set(false);
        this.applyQuote(quote);
      });

    // Any of these inputs changing means the previously quoted numbers no
    // longer apply, so the held quote (if any) is no longer valid.
    effect(() => {
      this.debitAccountId();
      this.sourceCurrency();
      this.targetCurrency();
      this.targetAmount();
      this.applyQuote(null);
    });

    inject(DestroyRef).onDestroy(() => this.clearCountdown());
  }

  requestQuote(): void {
    this.requests.next();
  }

  private applyQuote(quote: FxQuote | null): void {
    this.quote.set(quote);
    this.quoteChange.emit(quote);
    this.clearCountdown();

    if (!quote) {
      this.remainingSeconds.set(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.round((new Date(quote.expiresAt).getTime() - Date.now()) / 1000));
      this.remainingSeconds.set(remaining);
      if (remaining <= 0) {
        this.clearCountdown();
        this.quote.set(null);
        this.quoteChange.emit(null);
      }
    };
    tick();
    this.countdownHandle = setInterval(tick, 1000);
  }

  private clearCountdown(): void {
    if (this.countdownHandle !== null) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = null;
    }
  }
}
