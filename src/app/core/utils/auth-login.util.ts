export const AUTH_USERNAME_DOMAIN = 'users.buildflow.co.th';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function isEmailIdentifier(value: string): boolean {
  return value.includes('@');
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function toAuthEmail(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  if (!value) {
    return value;
  }
  return isEmailIdentifier(value) ? value : `${normalizeUsername(value)}@${AUTH_USERNAME_DOMAIN}`;
}

export function isUsernameAuthEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${AUTH_USERNAME_DOMAIN}`);
}

export function usernameFromAuthEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (isUsernameAuthEmail(value)) {
    return value.slice(0, value.indexOf('@'));
  }
  return value;
}

export function loginId(user: { username?: string; email: string }): string {
  if (user.username?.trim()) {
    return normalizeUsername(user.username);
  }
  return usernameFromAuthEmail(user.email);
}
