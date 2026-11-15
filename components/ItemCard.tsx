import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Item } from '@/store/types';
import { useApp } from '@/store/AppContext';
import { formatCalendarDate } from '@/utils/dates';

interface Props {
  item: Item;
  onPress: () => void;
}

export default function ItemCard({ item, onPress }: Props) {
  const { getUserById, currentUser } = useApp();
  const donor = getUserById(item.donorId);

  const isBorrow = item.listingType === 'borrow';
  const isGive   = item.listingType === 'give';
  const isSkill  = item.listingType === 'skill';

  const youClaimed = isGive && item.claimedBy === currentUser.id &&
    (item.status === 'claimed' || item.status === 'pending_pickup');
  const youBorrowed = isBorrow && item.borrowedBy === currentUser.id &&
    (item.status === 'borrowed' || item.status === 'pending_return');
  const showTrustedLock = item.donorId === currentUser.id && !!item.allowedBorrowers?.length;

  const disposalDate = isGive ? new Date(item.disposalDate) : null;
  const msLeft = disposalDate ? disposalDate.getTime() - Date.now() : null;
  const hoursLeft = msLeft !== null ? msLeft / 3_600_000 : null;
  const daysLeft = hoursLeft !== null ? Math.ceil(hoursLeft / 24) : null;
  const isUrgent = daysLeft !== null && daysLeft <= 3;

  const statusStyle = STATUS_STYLES[item.status] ?? STATUS_STYLES.available;
  const badgeTextColor = isSkill ? CREAM
    : isBorrow
    ? (item.status === 'borrowed' || item.status === 'pending_return' ? INK : CREAM)
    : statusStyle.text;

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      <View style={styles.photoArea}>
        {item.photos.length > 0 ? (
          <Image source={{ uri: item.photos[0] }} style={styles.photo} resizeMode="contain" />
        ) : (
          <View style={styles.photoPlaceholder}>
            <FontAwesome name="image" size={36} color="#C9BCA8" />
          </View>
        )}
        <View style={[styles.statusBadge, {
          backgroundColor: isSkill ? SAGE
            : isBorrow
            ? (item.status === 'borrowed' || item.status === 'pending_return' ? '#F4C95D' : '#7BA7BC')
            : statusStyle.bg,
        }]}>
          {showTrustedLock && (
            <FontAwesome name="lock" size={10} color={badgeTextColor} style={{ marginRight: 4 }} />
          )}
          <Text style={[styles.statusText, { color: badgeTextColor }]}>
            {isSkill ? 'Skill'
              : youClaimed ? 'You Claimed'
              : youBorrowed ? 'You Borrowed'
              : isBorrow
                ? (item.status === 'borrowed' || item.status === 'pending_return'
                    ? 'Borrowed'
                    : item.donorId === currentUser.id ? 'Available to Borrow' : 'Borrow')
                : STATUS_LABELS[item.status]}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.donor}>from {donor?.name ?? 'Unknown'}</Text>

        {item.restrictions ? (
          <View style={styles.restrictionRow}>
            <FontAwesome name="lock" size={11} color="#c05621" style={{ marginRight: 4 }} />
            <Text style={styles.restrictionText} numberOfLines={1}>{item.restrictions}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          {isSkill ? (
            item.pickupWindow ? (
              <View style={styles.footerItem}>
                <FontAwesome name="clock-o" size={12} color={SAGE} style={{ marginRight: 4 }} />
                <Text style={styles.footerText} numberOfLines={1}>{item.pickupWindow}</Text>
              </View>
            ) : <View style={styles.footerItem} />
          ) : (
            <View style={styles.footerItem}>
              <FontAwesome name="map-marker" size={12} color={SKY} style={{ marginRight: 4 }} />
              <Text style={styles.footerText} numberOfLines={1}>{item.pickupLocation}</Text>
            </View>
          )}
          <View style={styles.footerRight}>
            {isGive && daysLeft !== null && (
              <View style={[styles.timeChip, isUrgent && styles.timeChipUrgent]}>
                <FontAwesome
                  name="clock-o"
                  size={11}
                  color={isUrgent ? '#c53030' : '#718096'}
                  style={{ marginRight: 3 }}
                />
                <Text style={[styles.timeText, isUrgent && styles.timeTextUrgent]}>
                  {hoursLeft !== null && hoursLeft <= 0 ? 'Expired'
                    : hoursLeft !== null && hoursLeft < 24 ? 'today'
                    : `${daysLeft}d left`}
                </Text>
              </View>
            )}
            {isBorrow && item.borrowedUntil && item.status === 'borrowed' && (
              <View style={styles.timeChip}>
                <FontAwesome name="calendar" size={10} color="#718096" style={{ marginRight: 3 }} />
                <Text style={styles.timeText}>
                  Until {formatCalendarDate(item.borrowedUntil)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {isGive && item.waitlist.length > 0 && (
          <Text style={styles.waitlistText}>
            {item.waitlist.length} {item.waitlist.length === 1 ? 'person' : 'people'} on waitlist
          </Text>
        )}
        {isBorrow && item.borrowRequests.filter(r => r.status === 'pending').length > 0 && (
          <Text style={styles.waitlistText}>
            {item.borrowRequests.filter(r => r.status === 'pending').length} pending {item.borrowRequests.filter(r => r.status === 'pending').length === 1 ? 'request' : 'requests'}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// Brand tokens
const TANGERINE      = '#F26B3A';
const TANGERINE_DEEP = '#D8531F';
const CREAM          = '#FBF6EE';
const CREAM_2        = '#F4ECDD';
const INK            = '#1F1A17';
const MUTE           = '#847A70';
const SAGE           = '#7FA88A';
const SKY            = '#9DB7C9';
const ROSE           = '#E89A8D';

const STATUS_LABELS: Record<string, string> = {
  available:       'Free',
  claimed:         'Claimed',
  pending_pickup:  'Pending Pickup',
  picked_up:       'Picked Up',
  disposed:        'Gone',
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  available:       { bg: TANGERINE,  text: CREAM },
  claimed:         { bg: '#F4C95D',  text: INK   },
  pending_pickup:  { bg: '#9DB7C9',  text: CREAM },
  picked_up:       { bg: SAGE,       text: CREAM },
  disposed:        { bg: '#B0A89E',  text: CREAM },
};


const styles = StyleSheet.create({
  card: {
    backgroundColor: CREAM,
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 7,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(31,26,23,0.07)',
  },
  cardPressed: { opacity: 0.90 },
  photoArea: {
    height: 160,
    position: 'relative',
    backgroundColor: CREAM_2,
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: CREAM_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  body: { padding: 14 },
  title: { fontSize: 16, fontWeight: '700', color: INK, marginBottom: 2, letterSpacing: -0.2 },
  donor: { fontSize: 13, color: MUTE, marginBottom: 8 },
  restrictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3EC',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  restrictionText: { fontSize: 12, color: TANGERINE_DEEP, flex: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  footerText: { fontSize: 12, color: MUTE, flex: 1 },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CREAM_2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timeChipUrgent: { backgroundColor: '#FFF3EC' },
  timeText: { fontSize: 12, color: MUTE, fontWeight: '600' },
  timeTextUrgent: { color: '#C53030' },
  waitlistText: { fontSize: 12, color: '#8A3A3A', marginTop: 6, fontWeight: '600' },
});
