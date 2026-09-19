import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'payments', pathMatch: 'full' },
      {
        path: 'payments',
        loadComponent: () => import('./features/payments-queue/payments-queue').then((m) => m.PaymentsQueue),
      },
      {
        // Must come before 'payments/:id' - otherwise the :id route would
        // shadow it and try to load a payment literally named "new".
        path: 'payments/new',
        loadComponent: () => import('./features/payment-form/payment-form').then((m) => m.PaymentForm),
        canActivate: [roleGuard(['MAKER'])],
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'payments/:id/edit',
        loadComponent: () => import('./features/payment-form/payment-form').then((m) => m.PaymentForm),
        canActivate: [roleGuard(['MAKER'])],
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'payments/:id',
        loadComponent: () => import('./features/payment-details/payment-details').then((m) => m.PaymentDetails),
      },
      {
        path: 'bulk-upload',
        loadComponent: () => import('./features/bulk-upload/bulk-upload').then((m) => m.BulkUpload),
        canActivate: [roleGuard(['MAKER'])],
      },
    ],
  },
  { path: '**', redirectTo: 'payments' },
];
