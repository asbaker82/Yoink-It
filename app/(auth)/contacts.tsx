import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import FriendFinder from '@/components/FriendFinder';
import { CREAM, INK, MUTE } from '@/constants/theme';

// Sign-up step: accept requests from people who invited you, and ask others to be friends.
export default function ContactsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Find your friends</Text>
        <Text style={styles.subtitle}>
          Add people you know. They’ll approve before you see each other’s listings.
        </Text>
      </View>
      <FriendFinder doneLabel="Continue" onDone={() => router.replace('/(tabs)')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
  title: { fontSize: 22, fontWeight: '800', color: INK, textAlign: 'center' },
  subtitle: { fontSize: 14, color: MUTE, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
