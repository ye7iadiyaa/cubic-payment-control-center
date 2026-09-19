import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function notPastDateValidator(): ValidatorFn {
  return (control: AbstractControl<Date | null>): ValidationErrors | null => {
    const value = control.value;
    if (!value) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return value < today ? { pastDate: true } : null;
  };
}

export function positiveAmountValidator(): ValidatorFn {
  return (control: AbstractControl<number | null>): ValidationErrors | null => {
    const value = control.value;
    if (value == null) return null;
    return value > 0 ? null : { notPositive: true };
  };
}
