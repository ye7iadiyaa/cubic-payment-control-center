import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { AuthService } from '../../core/services/auth.service';
import { DemoUser } from '../../core/models/user.model';

@Component({
  selector: 'app-login',
  imports: [ButtonModule, TagModule],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly users = signal<DemoUser[]>([]);
  readonly loadingUserId = signal<string | null>(null);

  constructor() {
    this.auth.demoUsers().subscribe((users) => this.users.set(users));
  }

  roleSeverity(role: DemoUser['role']) {
    return role === 'MAKER' ? 'info' : role === 'CHECKER' ? 'success' : 'secondary';
  }

  signIn(user: DemoUser): void {
    this.loadingUserId.set(user.userId);
    this.auth.login(user.userId).subscribe({
      next: () => this.router.navigateByUrl('/payments'),
      error: () => this.loadingUserId.set(null),
    });
  }
}
