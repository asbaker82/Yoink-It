import { Linking, Platform } from 'react-native';

/**
 * Opens the device's Messages app, optionally prefilled with `body`.
 * Pass an empty `phone` to let the user pick the recipient in Messages.
 */
export function openSms(phone: string, body = '') {
  if (!body) {
    Linking.openURL(`sms:${phone}`);
    return;
  }
  const encoded = encodeURIComponent(body);
  // iOS separates the body with '&', Android/web with '?'
  const url = Platform.OS === 'ios'
    ? `sms:${phone}&body=${encoded}`
    : `sms:${phone}?body=${encoded}`;
  Linking.openURL(url);
}

/** "+1XXXXXXXXXX" for US numbers, or null if it doesn't look like one. Matches how profiles store phones. */
export function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
