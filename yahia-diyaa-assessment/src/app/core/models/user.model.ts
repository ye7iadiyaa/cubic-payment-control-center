export type Role = 'MAKER' | 'CHECKER' | 'AUDITOR';

export interface CurrentUser {
  userId: string;
  displayName: string;
  role: Role;
  branchCode: string;
  entitlements: string[];
}

export interface DemoUser {
  userId: string;
  displayName: string;
  role: Role;
}
