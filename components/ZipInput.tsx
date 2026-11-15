import React from 'react';
import { TextInput, StyleSheet, StyleProp, TextStyle } from 'react-native';

const CREAM     = '#FBF6EE';
const INK       = '#1F1A17';
const TANG_DEEP = '#D8531F';
const BORDER    = '#E8DDD0';

export const isValidZip = (zip: string) => /^\d{5}$/.test(zip);

// Pulls a trailing US ZIP out of a legacy full address ("…, CA 94117" → "94117").
export function extractZip(value: string | undefined | null): string {
  if (!value) return '';
  if (isValidZip(value)) return value;
  return value.match(/(\d{5})(?:-\d{4})?\s*$/)?.[1] ?? '';
}

interface Props {
  value: string;
  onChangeText: (zip: string) => void;
  error?: boolean;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
}

export default function ZipInput({ value, onChangeText, error, placeholder, style }: Props) {
  return (
    <TextInput
      style={[styles.input, error && styles.inputError, style]}
      value={value}
      onChangeText={t => onChangeText(t.replace(/\D/g, '').slice(0, 5))}
      placeholder={placeholder ?? 'e.g. 94117'}
      placeholderTextColor="#a0aec0"
      keyboardType="number-pad"
      maxLength={5}
      autoComplete="postal-code"
      textContentType="postalCode"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: INK,
    backgroundColor: CREAM,
    maxWidth: 160,
    letterSpacing: 1,
  },
  inputError: { borderColor: TANG_DEEP, backgroundColor: '#FFF5F0' },
});
