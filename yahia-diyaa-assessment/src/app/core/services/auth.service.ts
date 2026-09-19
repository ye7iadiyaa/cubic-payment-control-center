import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Observable, catchError, tap, throwError } from 'rxjs';

import { CurrentUser, DemoUser } from '../models/user.model';

const STORAGE_KEY = 'demoUserId';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly demoUserId = signal<string | null>(localStorage.getItem(STORAGE_KEY));
  readonly currentUser = signal<CurrentUser | null>(null);

  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly role = computed(() => this.currentUser()?.role ?? null);

  constructor(private readonly http: HttpClient) {}

  /** Read by the auth-header interceptor on every outgoing request. */
  headerUserId(): string | null {
    return this.demoUserId();
  }

  hasEntitlement(code: string): boolean {
    return this.currentUser()?.entitlements.includes(code) ?? false;
  }

  demoUsers(): Observable<DemoUser[]> {
    return this.http.get<DemoUser[]>('/api/demo-users');
  }

  login(userId: string): Observable<CurrentUser> {
    this.demoUserId.set(userId);
    return this.http.get<CurrentUser>('/api/me').pipe(
      tap((user) => {
        this.currentUser.set(user);
        localStorage.setItem(STORAGE_KEY, userId);
      }),
      catchError((err) => {
        this.clearSession();
        return throwError(() => err);
      }),
    );
  }

  /** Used on app start to rehydrate the session from a stored demo user id. */
  restoreSession(): Observable<CurrentUser> {
    return this.http.get<CurrentUser>('/api/me').pipe(
      tap((user) => this.currentUser.set(user)),
      catchError((err) => {
        this.clearSession();
        return throwError(() => err);
      }),
    );
  }

  logout(): void {
    this.clearSession();
  }

  private clearSession(): void {
    this.demoUserId.set(null);
    this.currentUser.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }
}
