import { isUsernameAuthEmail } from './auth-login.util';

export function normalizeContactEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidContactEmail(value: string): boolean {
  const email = normalizeContactEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !isUsernameAuthEmail(email);
}

export function visibleContactEmail(user: { email: string; contactEmail?: string }): string {
  if (user.contactEmail?.trim()) {
    return normalizeContactEmail(user.contactEmail);
  }
  if (user.email && !isUsernameAuthEmail(user.email)) {
    return user.email.trim().toLowerCase();
  }
  return '';
}
