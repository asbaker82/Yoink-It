import { Linking, Platform } from 'react-native';

/** Opens the device's Messages app addressed to `phone`, optionally prefilled with `body`. */
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
