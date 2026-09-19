import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

// 409/422 carry payload-specific data (currentRowVersion, fieldErrors) that
// only the calling screen can act on sensibly, so they're left to flow
// through untouched. Everything else gets a single, centralized reaction.
export const errorHandlingInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const messages = inject(MessageService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401) {
          auth.logout();
          router.navigateByUrl('/login');
        } else if (error.status === 403) {
          messages.add({
            severity: 'error',
            summary: 'Not allowed',
            detail: error.error?.message ?? 'You are not entitled to perform this action.',
          });
        } else if (error.status === 500) {
          messages.add({
            severity: 'error',
            summary: 'Something went wrong',
            detail: error.error?.message ?? 'The request could not be completed. Please try again.',
          });
        }
      }
      return throwError(() => error);
    }),
  );
};
