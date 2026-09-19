import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthService } from '../services/auth.service';

export const authHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const userId = auth.headerUserId();

  if (!userId) return next(req);

  return next(req.clone({ setHeaders: { 'X-Demo-User': userId } }));
};
