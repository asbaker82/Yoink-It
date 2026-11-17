import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Location, isValidZip, lookupZip } from '@/utils/location';
import { BORDER, CREAM, INK, MUTE, MUTE_LIGHT, TANGERINE_DEEP as TANG_DEEP, TANGERINE_TINT } from '@/constants/theme';

interface Props {
  value: Location;
  onChange: (value: Location) => void;
  error?: boolean;
}

export default function LocationInput({ value, onChange, error }: Props) {
  const [status, setStatus] = useState<'idle' | 'looking' | 'notFound'>('idle');
  const latest = useRef(value);
  latest.current = value;

  const fillFromZip = async (zip: string) => {
    setStatus('looking');
    const found = await lookupZip(zip);
    if (latest.current.zip !== zip) return; // user kept typing
    if (found) {
      onChange({ ...latest.current, city: found.city, state: found.state });
      setStatus('idle');
    } else {
      setStatus('notFound');
    }
  };

  // Legacy rows store only a ZIP — fill in city/state once when the form opens.
  useEffect(() => {
    if (isValidZip(value.zip) && !value.city) fillFromZip(value.zip);
  }, []);

  const handleZip = (text: string) => {
    const zip = text.replace(/\D/g, '').slice(0, 5);
    onChange({ ...value, zip });
    setStatus('idle');
    if (isValidZip(zip) && zip !== value.zip) fillFromZip(zip);
  };

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.zipCol}>
          <Text style={styles.fieldLabel}>ZIP</Text>
          <TextInput
            style={[styles.input, error && !isValidZip(value.zip) && styles.inputError]}
            value={value.zip}
            onChangeText={handleZip}
            placeholder="94117"
            placeholderTextColor={MUTE_LIGHT}
            keyboardType="number-pad"
            maxLength={5}
            autoComplete="postal-code"
            textContentType="postalCode"
          />
        </View>
        <View style={styles.cityCol}>
          <Text style={styles.fieldLabel}>City</Text>
          <TextInput
            style={[styles.input, error && !value.city.trim() && styles.inputError]}
            value={value.city}
            onChangeText={city => onChange({ ...value, city: city.replace(/[,0-9]/g, '').slice(0, 40) })}
            placeholder="San Francisco"
            placeholderTextColor={MUTE_LIGHT}
            autoCapitalize="words"
            textContentType="addressCity"
          />
        </View>
        <View style={styles.stateCol}>
          <Text style={styles.fieldLabel}>State</Text>
          <TextInput
            style={[styles.input, error && !/^[A-Z]{2}$/.test(value.state) && styles.inputError]}
            value={value.state}
            onChangeText={s => onChange({ ...value, state: s.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() })}
            placeholder="CA"
            placeholderTextColor={MUTE_LIGHT}
            autoCapitalize="characters"
            maxLength={2}
            textContentType="addressState"
          />
        </View>
      </View>
      {status === 'looking' && <Text style={styles.status}>Looking up ZIP…</Text>}
      {status === 'notFound' && (
        <Text style={styles.status}>Couldn't find that ZIP. Enter the city and state yourself.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  zipCol: { width: 84 },
  cityCol: { flex: 1 },
  stateCol: { width: 58 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: MUTE, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
    color: INK,
    backgroundColor: CREAM,
  },
  inputError: { borderColor: TANG_DEEP, backgroundColor: TANGERINE_TINT },
  status: { fontSize: 12, color: MUTE, marginTop: 6 },
});
