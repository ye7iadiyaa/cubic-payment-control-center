import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { Observable } from 'rxjs';

export interface CanComponentDeactivate {
  hasUnsavedChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<CanComponentDeactivate> = (component) => {
  if (!component.hasUnsavedChanges()) return true;

  const confirmation = inject(ConfirmationService);

  return new Observable<boolean>((subscriber) => {
    confirmation.confirm({
      header: 'Discard unsaved changes?',
      message: 'You have unsaved changes on this payment. Leaving now will discard them.',
      acceptLabel: 'Discard',
      rejectLabel: 'Stay',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => {
        subscriber.next(true);
        subscriber.complete();
      },
      reject: () => {
        subscriber.next(false);
        subscriber.complete();
      },
    });
  });
};
