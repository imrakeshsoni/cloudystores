export interface DecodedToken {
  sub?: string;
  email?: string;
  tenantId?: string;
  tenantSlug?: string;
  shopId?: string | null;
  permissions?: Record<string, Record<string, boolean>>;
}

export function decodeToken(token: string | null | undefined): DecodedToken | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}
