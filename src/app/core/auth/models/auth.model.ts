export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company?: number;
  company_name?: string;
  company_slug?: string;
  role?: string;
  phone_number?: string;
  job_title?: string;
  is_email_verified?: boolean;
  is_active?: boolean;
}

export interface LoginRequest {
  username?: string;
  email?: string;
  email_or_username?: string;
  password: string;
}

export interface LoginResponse {
  tokens?: AuthTokens;
  access?: string;
  refresh?: string;
  user?: UserProfile;
  profile?: UserProfile;
}
