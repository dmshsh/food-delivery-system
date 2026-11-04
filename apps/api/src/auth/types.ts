export type Role = 'CUSTOMER' | 'KITCHEN' | 'ACCOUNTANT';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
}
