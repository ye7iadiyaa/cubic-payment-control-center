import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;
  if (!auth.headerUserId()) return router.createUrlTree(['/login']);

  // A demo user id is stored from a previous visit - rehydrate the session
  // before deciding, instead of bouncing straight to the login screen.
  return auth.restoreSession().pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};
