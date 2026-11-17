import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native';
import { useApp } from '@/store/AppContext';
import { useUserSheet } from './UserSheet';

interface Props {
  userId: string | null | undefined;
  /** Text to show; defaults to the user's full name. */
  name?: string;
  /** Shown when the user can't be found. */
  fallback?: string;
  style?: StyleProp<TextStyle>;
  /** Hide "See listings" in the sheet (used on that person's own listings page). */
  hideListings?: boolean;
}

/**
 * Another person's name. Tapping it opens the UserSheet (Text them / See their listings).
 * Works nested inside a sentence: <Text>Claimed by <UserName userId={id} /></Text>.
 */
export default function UserName({ userId, name, fallback = 'someone', style, hideListings }: Props) {
  const { getUserById, currentUser } = useApp();
  const { openUser } = useUserSheet();
  const user = userId ? getUserById(userId) : undefined;
  const label = name ?? user?.name ?? fallback;

  if (!user || user.id === currentUser.id) {
    return <Text style={style}>{label}</Text>;
  }

  return (
    <Text
      style={[style, styles.link]}
      accessibilityRole="link"
      accessibilityHint={`Text ${user.name.split(' ')[0]} or see their listings`}
      suppressHighlighting
      onPress={(e) => {
        e?.stopPropagation?.();
        openUser(user.id, { hideListings });
      }}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: { fontWeight: '700', textDecorationLine: 'underline' },
});
