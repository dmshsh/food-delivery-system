export type Role = 'CUSTOMER' | 'KITCHEN' | 'ACCOUNTANT' | 'ADMIN';

export const ROLES: readonly Role[] = ['CUSTOMER', 'KITCHEN', 'ACCOUNTANT', 'ADMIN'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
}
