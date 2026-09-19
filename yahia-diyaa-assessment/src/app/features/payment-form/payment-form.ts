import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { StepperModule } from 'primeng/stepper';
import { TextareaModule } from 'primeng/textarea';
import { Observable, forkJoin } from 'rxjs';

import { Account } from '../../core/models/account.model';
import { Beneficiary } from '../../core/models/beneficiary.model';
import { CanComponentDeactivate } from '../../core/guards/unsaved-changes.guard';
import {
  ChargeOption,
  PaymentBeneficiary,
  PaymentMutationResponse,
  PaymentPayload,
  PaymentType,
} from '../../core/models/payment.model';
import { ReferenceData } from '../../core/models/reference-data.model';
import { AccountsService } from '../../core/services/accounts.service';
import { BeneficiariesService } from '../../core/services/beneficiaries.service';
import { PaymentsService } from '../../core/services/payments.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { toIsoDate } from '../../shared/utils/date';
import { notPastDateValidator, positiveAmountValidator } from '../../shared/validators/payment-validators';
import { FxQuote } from '../../core/services/fx-quote.service';
import { FxQuotePanel } from './fx-quote-panel';

interface BeneficiaryFormControls {
  id: FormControl<string | null>;
  name: FormControl<string>;
  account: FormControl<string>;
  bankCode: FormControl<string>;
  swift: FormControl<string>;
  country: FormControl<string>;
  address: FormControl<string>;
}

interface PaymentFormControls {
  type: FormControl<PaymentType>;
  debtorAccountId: FormControl<string>;
  executionDate: FormControl<Date | null>;
  beneficiary: FormGroup<BeneficiaryFormControls>;
  currency: FormControl<string>;
  amount: FormControl<number | null>;
  purposeCode: FormControl<string>;
  remittanceInformation: FormControl<string>;
  chargeOption: FormControl<ChargeOption | null>;
}

const STEP_FIELDS: Record<number, string[]> = {
  1: ['type', 'debtorAccountId', 'executionDate'],
  2: ['beneficiary'],
  3: ['currency', 'amount', 'purposeCode', 'remittanceInformation', 'chargeOption'],
};

@Component({
  selector: 'app-payment-form',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    StepperModule,
    TextareaModule,
    FxQuotePanel,
  ],
  templateUrl: './payment-form.html',
})
export class PaymentForm implements CanComponentDeactivate {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly paymentsService = inject(PaymentsService);
  private readonly accountsService = inject(AccountsService);
  private readonly beneficiariesService = inject(BeneficiariesService);
  private readonly referenceDataService = inject(ReferenceDataService);

  protected readonly accounts = signal<Account[]>([]);
  protected readonly beneficiaries = signal<Beneficiary[]>([]);
  protected readonly referenceData = signal<ReferenceData | null>(null);
  protected readonly loadingData = signal(true);
  protected readonly loadError = signal(false);

  protected readonly isEditMode = signal(false);
  private readonly paymentId = this.route.snapshot.paramMap.get('id');
  private existingRowVersion: number | null = null;

  protected readonly activeStep = signal(1);
  protected readonly furthestStep = signal(1);

  protected readonly saving = signal(false);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly fxQuoteError = signal<string | null>(null);

  protected readonly fxQuote = signal<FxQuote | null>(null);
  private savedSuccessfully = false;
  private isPatchingExisting = false;

  protected readonly form: FormGroup<PaymentFormControls> = this.fb.group({
    type: this.fb.nonNullable.control<PaymentType>('DOMESTIC', Validators.required),
    debtorAccountId: this.fb.nonNullable.control('', Validators.required),
    executionDate: this.fb.control<Date | null>(null, [Validators.required, notPastDateValidator()]),
    beneficiary: this.fb.group<BeneficiaryFormControls>({
      id: this.fb.control<string | null>(null),
      name: this.fb.nonNullable.control('', Validators.required),
      account: this.fb.nonNullable.control('', Validators.required),
      bankCode: this.fb.nonNullable.control('', Validators.required),
      swift: this.fb.nonNullable.control(''),
      country: this.fb.nonNullable.control(''),
      address: this.fb.nonNullable.control(''),
    }),
    currency: this.fb.nonNullable.control('', Validators.required),
    amount: this.fb.control<number | null>(null, [Validators.required, positiveAmountValidator(), this.amountPrecisionValidator()]),
    purposeCode: this.fb.nonNullable.control('', Validators.required),
    remittanceInformation: this.fb.nonNullable.control('', Validators.required),
    chargeOption: this.fb.control<ChargeOption | null>(null),
  });

  // computed() only reacts to signals, and reactive form controls aren't
  // signals - these mirror the handful of control values the template needs
  // to derive from, so the computed()s below actually recompute as the user
  // types/selects instead of freezing at their initial value.
  private readonly typeValue = toSignal(this.form.controls.type.valueChanges, { initialValue: this.form.controls.type.value });
  private readonly debtorAccountIdValue = toSignal(this.form.controls.debtorAccountId.valueChanges, {
    initialValue: this.form.controls.debtorAccountId.value,
  });
  private readonly currencyValue = toSignal(this.form.controls.currency.valueChanges, { initialValue: this.form.controls.currency.value });
  private readonly amountValue = toSignal(this.form.controls.amount.valueChanges, { initialValue: this.form.controls.amount.value });

  protected readonly selectedAccount = computed(() => this.accounts().find((a) => a.id === this.debtorAccountIdValue()));

  protected readonly filteredBeneficiaries = computed(() => this.beneficiaries().filter((b) => b.type === this.typeValue()));

  protected readonly needsFxQuote = computed(() => {
    const account = this.selectedAccount();
    const currency = this.currencyValue();
    const amount = this.amountValue();
    return !!account && !!currency && account.currency !== currency && !!amount && amount > 0;
  });

  protected readonly canSubmit = computed(() => !this.needsFxQuote() || this.fxQuote() !== null);

  protected readonly accountOptions = computed(() =>
    this.accounts().map((a) => ({ ...a, label: `${a.masked} (${a.currency})` })),
  );

  protected readonly selectedCurrencyMinorUnits = computed(
    () => this.referenceData()?.currencies.find((c) => c.code === this.currencyValue())?.minorUnits ?? 2,
  );

  protected readonly typeIsInternational = computed(() => this.typeValue() === 'INTERNATIONAL');

  protected readonly currencyOptions = computed(
    () => this.referenceData()?.currencies.map((c) => ({ label: c.code, value: c.code })) ?? [],
  );

  protected readonly minExecutionDate = new Date();
  protected readonly toIso = toIsoDate;

  constructor() {
    const requests: { accounts: Observable<Account[]>; beneficiaries: Observable<Beneficiary[]>; referenceData: Observable<ReferenceData> } = {
      accounts: this.accountsService.list(),
      beneficiaries: this.beneficiariesService.list(),
      referenceData: this.referenceDataService.get(),
    };

    forkJoin(requests).subscribe({
      next: ({ accounts, beneficiaries, referenceData }) => {
        this.accounts.set(accounts);
        this.beneficiaries.set(beneficiaries);
        this.referenceData.set(referenceData);
        this.applyTypeValidators(this.form.controls.type.value);

        if (this.paymentId) {
          this.loadExistingPayment(this.paymentId);
        } else {
          this.loadingData.set(false);
        }
      },
      error: () => {
        this.loadingData.set(false);
        this.loadError.set(true);
      },
    });

    this.form.controls.type.valueChanges.subscribe(() => this.onTypeChange());
    this.form.controls.currency.valueChanges.subscribe(() => this.form.controls.amount.updateValueAndValidity());
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.savedSuccessfully;
  }

  private loadExistingPayment(id: string): void {
    this.isEditMode.set(true);
    this.paymentsService.get(id).subscribe({
      next: (payment) => {
        if (!['DRAFT', 'RETURNED'].includes(payment.status)) {
          this.router.navigate(['/payments', id]);
          return;
        }
        this.existingRowVersion = payment.rowVersion;
        // Patching still emits valueChanges (so the toSignal-derived values
        // above stay in sync) - isPatchingExisting just tells onTypeChange
        // not to run its "clear now-irrelevant fields" side effect while
        // we're loading data rather than reacting to a real user edit.
        this.isPatchingExisting = true;
        this.form.patchValue({
          type: payment.type,
          debtorAccountId: payment.debtorAccount.id,
          executionDate: new Date(payment.executionDate),
          beneficiary: {
            id: payment.beneficiary.id ?? null,
            name: payment.beneficiary.name,
            account: payment.beneficiary.account,
            bankCode: payment.beneficiary.bankCode ?? '',
            swift: payment.beneficiary.swift ?? '',
            country: payment.beneficiary.country ?? '',
            address: payment.beneficiary.address ?? '',
          },
          currency: payment.currency,
          amount: payment.amount,
          purposeCode: payment.purposeCode,
          remittanceInformation: payment.remittanceInformation,
          chargeOption: payment.chargeOption ?? null,
        });
        this.form.markAsPristine();
        this.isPatchingExisting = false;
        this.loadingData.set(false);
      },
      error: () => {
        this.loadingData.set(false);
        this.loadError.set(true);
      },
    });
  }

  onTypeChange(): void {
    const type = this.form.controls.type.value;
    this.applyTypeValidators(type);
    if (this.isPatchingExisting) return;

    // Clear fields that no longer apply so a stale value can't leak into the
    // payload, and drop any existing-beneficiary selection since the picker
    // list is filtered by type (the previous pick no longer matches).
    if (type === 'INTERNATIONAL') {
      this.form.controls.beneficiary.patchValue({ id: null, bankCode: '' }, { emitEvent: false });
    } else {
      this.form.controls.beneficiary.patchValue({ id: null, swift: '', country: '', address: '' }, { emitEvent: false });
      this.form.controls.chargeOption.setValue(null, { emitEvent: false });
    }
  }

  onBeneficiarySelect(beneficiaryId: string | null): void {
    const beneficiary = this.beneficiaries().find((b) => b.id === beneficiaryId);
    if (!beneficiary) {
      this.form.controls.beneficiary.patchValue({ id: null, name: '', account: '', bankCode: '', swift: '', country: '', address: '' });
      return;
    }
    this.form.controls.beneficiary.patchValue({
      id: beneficiary.id,
      name: beneficiary.name,
      account: beneficiary.account,
      bankCode: beneficiary.bankCode ?? '',
      swift: beneficiary.swift ?? '',
      country: beneficiary.country ?? '',
      address: beneficiary.address ?? '',
    });
  }

  goNext(): void {
    const fields = STEP_FIELDS[this.activeStep()] ?? [];
    const valid = fields.every((field) => {
      const control = this.form.get(field);
      control?.markAllAsTouched();
      return control?.valid ?? true;
    });
    if (!valid) return;

    const next = this.activeStep() + 1;
    this.activeStep.set(next);
    this.furthestStep.set(Math.max(this.furthestStep(), next));
  }

  goBack(): void {
    this.activeStep.set(Math.max(1, this.activeStep() - 1));
  }

  goToStep(step: number | undefined): void {
    if (step !== undefined && step <= this.furthestStep()) this.activeStep.set(step);
  }

  onQuoteChange(quote: FxQuote | null): void {
    this.fxQuote.set(quote);
  }

  saveDraft(): void {
    if (this.saving() || this.submitting() || !this.validateAllSteps()) return;
    this.saving.set(true);
    this.clearServerFeedback();
    this.persist().subscribe({
      next: (res) => this.onPersistSuccess(res),
      error: (err) => this.onPersistError(err, this.saving),
    });
  }

  submitForCheck(): void {
    if (this.saving() || this.submitting() || !this.validateAllSteps() || !this.canSubmit()) return;
    this.submitting.set(true);
    this.clearServerFeedback();
    this.persist().subscribe({
      next: (res) =>
        this.paymentsService.submit(res.id, res.rowVersion, crypto.randomUUID()).subscribe({
          next: (submitted) => this.onPersistSuccess(submitted),
          error: (err) => this.onPersistError(err, this.submitting),
        }),
      error: (err) => this.onPersistError(err, this.submitting),
    });
  }

  private clearServerFeedback(): void {
    this.serverError.set(null);
    this.fxQuoteError.set(null);
  }

  private validateAllSteps(): boolean {
    this.form.markAllAsTouched();
    if (this.form.valid) return true;

    for (const [step, fields] of Object.entries(STEP_FIELDS)) {
      if (fields.some((field) => this.form.get(field)?.invalid)) {
        const stepNumber = Number(step);
        this.furthestStep.set(Math.max(this.furthestStep(), stepNumber));
        this.activeStep.set(stepNumber);
        break;
      }
    }
    return false;
  }

  private persist(): Observable<PaymentMutationResponse> {
    const payload = this.buildPayload();
    return this.isEditMode() && this.paymentId
      ? this.paymentsService.update(this.paymentId, payload)
      : this.paymentsService.create(payload);
  }

  private buildPayload(): PaymentPayload {
    const value = this.form.getRawValue();
    const beneficiary: PaymentBeneficiary =
      value.type === 'INTERNATIONAL'
        ? {
            id: value.beneficiary.id ?? undefined,
            name: value.beneficiary.name,
            account: value.beneficiary.account,
            swift: value.beneficiary.swift,
            country: value.beneficiary.country,
            address: value.beneficiary.address,
          }
        : {
            id: value.beneficiary.id ?? undefined,
            name: value.beneficiary.name,
            account: value.beneficiary.account,
            bankCode: value.beneficiary.bankCode,
          };

    return {
      clientRequestId: crypto.randomUUID(),
      type: value.type,
      debtorAccountId: value.debtorAccountId,
      beneficiary,
      currency: value.currency,
      amount: value.amount!,
      executionDate: toIsoDate(value.executionDate!),
      purposeCode: value.purposeCode,
      remittanceInformation: value.remittanceInformation,
      ...(value.type === 'INTERNATIONAL' ? { chargeOption: value.chargeOption! } : {}),
      ...(this.needsFxQuote() && this.fxQuote() ? { fxQuoteId: this.fxQuote()!.quoteId } : {}),
      ...(this.isEditMode() && this.existingRowVersion !== null ? { rowVersion: this.existingRowVersion } : {}),
    };
  }

  private onPersistSuccess(res: PaymentMutationResponse): void {
    this.saving.set(false);
    this.submitting.set(false);
    this.savedSuccessfully = true;
    this.router.navigate(['/payments', res.id]);
  }

  private onPersistError(err: unknown, flag: ReturnType<typeof signal<boolean>>): void {
    flag.set(false);

    if (err instanceof HttpErrorResponse && err.status === 409) {
      this.serverError.set('This payment was changed by someone else. The latest version has been reloaded - please review and try again.');
      if (this.paymentId) this.refreshRowVersion(this.paymentId);
      return;
    }

    if (err instanceof HttpErrorResponse && err.status === 422) {
      const fieldErrors = err.error?.fieldErrors as Record<string, string> | undefined;
      if (fieldErrors) this.applyFieldErrors(fieldErrors);
      this.serverError.set(err.error?.message ?? 'Please correct the highlighted fields and try again.');
      return;
    }

    const message = (err as { error?: { message?: string } })?.error?.message;
    this.serverError.set(message ?? 'Could not save this payment. Please check the form and try again.');
  }

  private refreshRowVersion(id: string): void {
    this.paymentsService.get(id).subscribe((payment) => {
      this.existingRowVersion = payment.rowVersion;
    });
  }

  // Maps the backend's { "beneficiary.swift": "..." }-style fieldErrors onto
  // the matching form controls (Angular's AbstractControl.get() understands
  // the same dotted paths), and jumps the wizard back to the earliest step
  // that has one so it isn't buried behind the Review step.
  private applyFieldErrors(fieldErrors: Record<string, string>): void {
    let firstStep: number | null = null;

    for (const [path, message] of Object.entries(fieldErrors)) {
      if (path === 'fxQuoteId') {
        this.fxQuoteError.set(message);
        firstStep = firstStep === null ? 4 : Math.min(firstStep, 4);
        continue;
      }
      const control = this.form.get(path);
      if (!control) continue;
      control.setErrors({ ...(control.errors ?? {}), server: message });
      control.markAsTouched();
      const step = this.stepForField(path);
      if (step !== null) firstStep = firstStep === null ? step : Math.min(firstStep, step);
    }

    if (firstStep !== null) {
      this.furthestStep.set(Math.max(this.furthestStep(), firstStep));
      this.activeStep.set(firstStep);
    }
  }

  private stepForField(path: string): number | null {
    const top = path.split('.')[0];
    for (const [step, fields] of Object.entries(STEP_FIELDS)) {
      if (fields.includes(top)) return Number(step);
    }
    return null;
  }

  private applyTypeValidators(type: PaymentType): void {
    const beneficiary = this.form.controls.beneficiary.controls;
    if (type === 'INTERNATIONAL') {
      beneficiary.swift.setValidators(Validators.required);
      beneficiary.country.setValidators(Validators.required);
      beneficiary.address.setValidators(Validators.required);
      beneficiary.bankCode.clearValidators();
      this.form.controls.chargeOption.setValidators(Validators.required);
    } else {
      beneficiary.bankCode.setValidators(Validators.required);
      beneficiary.swift.clearValidators();
      beneficiary.country.clearValidators();
      beneficiary.address.clearValidators();
      this.form.controls.chargeOption.clearValidators();
    }
    [beneficiary.swift, beneficiary.country, beneficiary.address, beneficiary.bankCode, this.form.controls.chargeOption].forEach((c) =>
      c.updateValueAndValidity({ emitEvent: false }),
    );
  }

  private amountPrecisionValidator(): ValidatorFn {
    return (control: AbstractControl<number | null>): ValidationErrors | null => {
      const amount = control.value;
      const currencyCode = this.form?.controls.currency.value;
      const currency = this.referenceData()?.currencies.find((c) => c.code === currencyCode);
      if (amount == null || !currency) return null;
      const factor = 10 ** currency.minorUnits;
      return Math.round(amount * factor) / factor === amount ? null : { precision: { minorUnits: currency.minorUnits } };
    };
  }
}
