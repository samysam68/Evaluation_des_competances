export type UserRole = 'SuperAdmin' | 'Directeur' | 'Manager' | 'Responsable' | 'Superviseur' | 'Gestionnaire' | 'RH' | 'Employe';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  department: string;
  direction: string;
  poste: string;
  directManagerId?: string;
  isActive: boolean;
  lastLogin?: Date;
  canDelegate: boolean;
  hasDelegation: boolean;
  mustChangePassword?: boolean;
  /** Accès à l'espace RH — vrai pour le rôle RH/SuperAdmin, ou accordé individuellement par le SuperAdmin */
  rhAccess: boolean;
  /** Accès à l'organigramme — module restreint, accordé individuellement par le SuperAdmin */
  orgChartAccess: boolean;
  /** Modules activables/désactivables par le SuperAdmin */
  modules: {
    fichePoste: boolean;
    feedback: boolean;
  };
  delegationInfo?: {
    delegatedBy: string;
    delegationStartDate: Date;
    delegationEndDate: Date;
  };
}

export interface LoginResponse {
  user: User;
  token: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface ADLoginRequest {
  redirectUri: string;
}

export interface CredentialsLoginRequest {
  username: string;
  password: string;
}

export interface AuthError {
  code: string;
  message: string;
  details?: any;
}
