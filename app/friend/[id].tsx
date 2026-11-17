import React from 'react';
import { View, Text, StyleSheet, SectionList } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '@/store/AppContext';
import ItemCard from '@/components/ItemCard';
import { Item, ListingType } from '@/store/types';
import { CREAM, CREAM_2, INK, INK_2, MUTE } from '@/constants/theme';

const SECTIONS: { type: ListingType; title: string; color: string }[] = [
  { type: 'give',   title: 'Free',   color: '#F26B3A' },
  { type: 'borrow', title: 'Borrow', color: '#7BA7BC' },
  { type: 'skill',  title: 'Skills', color: '#7FA88A' },
];

export default function FriendListingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getUserById, getFriendItems } = useApp();

  const friend = getUserById(id);
  // getFriendItems applies the same visibility rules as Browse (friendship, privacy, restricted lists)
  const listings = getFriendItems().filter(i => i.donorId === id);

  const sections = SECTIONS
    .map(s => ({ ...s, data: listings.filter(i => i.listingType === s.type) }))
    .filter(s => s.data.length > 0);

  if (!friend) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyText}>Friend not found.</Text>
      </View>
    );
  }

  const firstName = friend.name.split(' ')[0];
  const initials = friend.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const header = (
    <View style={styles.header}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <Text style={styles.name}>{friend.name}</Text>
      <Text style={styles.subtitle}>
        {listings.length === 0
          ? 'No open listings'
          : `${listings.length} open listing${listings.length !== 1 ? 's' : ''}`}
      </Text>
    </View>
  );

  return (
    <SectionList<Item, (typeof sections)[number]>
      style={styles.container}
      sections={sections}
      keyExtractor={item => item.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.empty}>
          <FontAwesome name="inbox" size={44} color="#cbd5e0" />
          <Text style={styles.emptyText}>{firstName} doesn't have anything you can see right now.</Text>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: section.color }]} />
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{section.data.length}</Text>
          </View>
        </View>
      )}
      renderItem={({ item }) => (
        <ItemCard item={item} onPress={() => router.push(`/item/${item.id}`)} />
      )}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  center: { alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 32 },
  header: { alignItems: 'center', paddingTop: 24, paddingBottom: 8, gap: 4 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: CREAM_2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarText: { fontSize: 24, fontWeight: '700', color: INK_2 },
  name: { fontSize: 20, fontWeight: '800', color: INK },
  subtitle: { fontSize: 13, color: MUTE },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 4,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTE,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    backgroundColor: CREAM_2,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  sectionCountText: { fontSize: 12, fontWeight: '700', color: MUTE },
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 40, gap: 12 },
  emptyText: { fontSize: 14, color: MUTE, textAlign: 'center' },
});
