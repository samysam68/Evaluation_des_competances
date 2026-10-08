export type UserRole = 'Directeur' | 'Responsable' | 'Superviseur' | 'Gestionnaire' | 'RH';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  department: string;
  directManagerId?: string;
  isActive: boolean;
  hashedPassword?: string;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface JWTPayload {
  userId: string;
  role: UserRole;
  email: string;
  iat: number;
  exp: number;
}

export interface ADUserInfo {
  id: string;
  mail: string;
  displayName: string;
  userPrincipalName: string;
  department?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  timestamp: number;
}

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
}
