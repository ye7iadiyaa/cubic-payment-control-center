import { Pipe, PipeTransform, inject } from '@angular/core';

import { AuthService } from '../../core/services/auth.service';

@Pipe({ name: 'accountDisplay' })
export class AccountDisplayPipe implements PipeTransform {
  private readonly auth = inject(AuthService);

  transform(account: { masked: string; full?: string } | null | undefined): string {
    if (!account) return '';
    return this.auth.hasEntitlement('VIEW_FULL_ACCOUNT') && account.full ? account.full : account.masked;
  }
}
