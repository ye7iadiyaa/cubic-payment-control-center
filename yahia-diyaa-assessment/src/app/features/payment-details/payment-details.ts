import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, PrimeTemplate } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TimelineModule } from 'primeng/timeline';
import { TooltipModule } from 'primeng/tooltip';

import { Decision, PaymentDetail } from '../../core/models/payment.model';
import { AuthService } from '../../core/services/auth.service';
import { PaymentsService } from '../../core/services/payments.service';
import { AccountDisplayPipe } from '../../shared/pipes/account-display.pipe';
import { statusLabel, statusSeverity } from '../../shared/utils/payment-status';

@Component({
  selector: 'app-payment-details',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    DialogModule,
    MessageModule,
    SkeletonModule,
    TagModule,
    TextareaModule,
    TimelineModule,
    TooltipModule,
    PrimeTemplate,
    AccountDisplayPipe,
  ],
  templateUrl: './payment-details.html',
})
export class PaymentDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly paymentsService = inject(PaymentsService);
  private readonly confirmation = inject(ConfirmationService);
  protected readonly auth = inject(AuthService);

  protected readonly statusLabel = statusLabel;
  protected readonly statusSeverity = statusSeverity;

  protected readonly payment = signal<PaymentDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly staleNotice = signal(false);
  protected readonly actionInFlight = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly decisionDialogType = signal<Extract<Decision, 'RETURN' | 'REJECT'> | null>(null);
  protected readonly decisionReason = signal('');

  private readonly id = this.route.snapshot.paramMap.get('id')!;
  private clientRequestId = crypto.randomUUID();

  protected readonly isOwnPayment = computed(() => this.payment()?.makerUserId === this.auth.currentUser()?.userId);
  protected readonly canEdit = computed(
    () =>
      this.auth.role() === 'MAKER' &&
      this.isOwnPayment() &&
      ['DRAFT', 'RETURNED'].includes(this.payment()?.status ?? ''),
  );
  protected readonly canCancel = computed(
    () => this.auth.role() === 'MAKER' && this.isOwnPayment() && this.payment()?.status === 'DRAFT',
  );
  protected readonly canDecide = computed(
    () => this.auth.role() === 'CHECKER' && this.payment()?.status === 'PENDING_CHECK',
  );
  protected readonly canApprove = computed(() => this.canDecide() && !this.isOwnPayment());

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.paymentsService.get(this.id).subscribe({
      next: (payment) => {
        this.payment.set(payment);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  edit(): void {
    this.router.navigate(['/payments', this.id, 'edit']);
  }

  submit(): void {
    const payment = this.payment();
    if (!payment || this.actionInFlight()) return;
    this.actionInFlight.set(true);
    this.actionError.set(null);
    this.paymentsService.submit(this.id, payment.rowVersion, this.clientRequestId).subscribe({
      next: () => this.onActionSuccess(),
      error: (err) => this.onActionError(err),
    });
  }

  confirmCancel(): void {
    this.confirmation.confirm({
      header: 'Cancel this draft?',
      message: 'This payment will be cancelled and can no longer be submitted.',
      acceptLabel: 'Cancel payment',
      rejectLabel: 'Keep draft',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.cancel(),
    });
  }

  confirmApprove(): void {
    const payment = this.payment();
    if (!payment) return;
    this.confirmation.confirm({
      header: 'Approve this payment?',
      message: `Payment ${payment.reference} will move to Approved and be released for processing.`,
      acceptLabel: 'Approve',
      rejectLabel: 'Cancel',
      acceptButtonProps: { severity: 'success' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.decide('APPROVE'),
    });
  }

  openDecisionDialog(type: 'RETURN' | 'REJECT'): void {
    this.decisionReason.set('');
    this.decisionDialogType.set(type);
  }

  closeDecisionDialog(): void {
    this.decisionDialogType.set(null);
  }

  confirmDecisionDialog(): void {
    const type = this.decisionDialogType();
    const reason = this.decisionReason().trim();
    if (!type || !reason) return;
    this.decisionDialogType.set(null);
    this.decide(type, reason);
  }

  private cancel(): void {
    const payment = this.payment();
    if (!payment || this.actionInFlight()) return;
    this.actionInFlight.set(true);
    this.actionError.set(null);
    this.paymentsService.cancel(this.id, payment.rowVersion, this.clientRequestId).subscribe({
      next: () => this.onActionSuccess(),
      error: (err) => this.onActionError(err),
    });
  }

  private decide(decision: Decision, reason?: string): void {
    const payment = this.payment();
    if (!payment || this.actionInFlight()) return;
    this.actionInFlight.set(true);
    this.actionError.set(null);
    this.paymentsService.decide(this.id, decision, payment.rowVersion, this.clientRequestId, reason).subscribe({
      next: () => this.onActionSuccess(),
      error: (err) => this.onActionError(err),
    });
  }

  private onActionSuccess(): void {
    this.actionInFlight.set(false);
    this.staleNotice.set(false);
    this.clientRequestId = crypto.randomUUID();
    this.reload();
  }

  // 401/403/500 already get a centralized toast + (for 401) a redirect from
  // the error interceptor. 409 needs its own banner plus a forced reload
  // before another action is allowed. Everything else (422 in practice -
  // e.g. a reason that fails a backend check the dialog missed) still needs
  // *some* visible feedback here, since the interceptor leaves it untouched.
  private onActionError(err: unknown): void {
    this.actionInFlight.set(false);
    this.clientRequestId = crypto.randomUUID();

    if (err instanceof HttpErrorResponse && err.status === 409) {
      this.staleNotice.set(true);
      this.reload();
      return;
    }

    if (err instanceof HttpErrorResponse && err.status === 422) {
      this.actionError.set(err.error?.message ?? 'This action could not be completed. Please check the details and try again.');
    }
  }
}
