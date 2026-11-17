import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { BORDER, FAINT, MUTE } from '@/constants/theme';

/** Quiet marker shown after the last card so users know they've reached the end. */
export default function ListEnd({ label = "That's everything" }: { label?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <FontAwesome name="check-circle" size={13} color={FAINT} style={{ marginRight: 6 }} />
      <Text style={styles.text}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 32,
  },
  line: { width: 40, height: 1, backgroundColor: BORDER, marginHorizontal: 10 },
  text: { fontSize: 13, color: MUTE, fontWeight: '600' },
});
