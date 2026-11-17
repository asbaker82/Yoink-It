import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useApp } from '@/store/AppContext';
import { Item } from '@/store/types';
import ItemCard from '@/components/ItemCard';
import ConfirmSheet from '@/components/ConfirmSheet';
import { formatCalendarDate } from '@/utils/dates';
import { BORDER, BUTTER_INK, CREAM, CREAM_2, FAINT, INK, MUTE, MUTE_LIGHT, PLUM, ROSE_INK, SAGE, SKY, SKY_TINT, STEEL_BLUE, TANGERINE, TANGERINE_DEEP as TANG_DEEP, TRACK, WHITE } from '@/constants/theme';

type ViewKey = 'listings' | 'friends';
type ListingFilter = 'all' | 'free' | 'lending' | 'skills';
type FriendSectionKey = 'pickup' | 'waiting' | 'borrowing' | 'returning' | 'requested' | 'waitlisted';

type PendingConfirm = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};

const LISTING_FILTERS: { key: ListingFilter; label: string; color: string }[] = [
  { key: 'all',     label: 'All',     color: PLUM },
  { key: 'free',    label: 'Free',    color: TANGERINE },
  { key: 'lending', label: 'Lending', color: SKY },
  { key: 'skills',  label: 'Skills',  color: SAGE },
];

const isDone = (i: Item) => i.status === 'picked_up' || i.status === 'disposed';

// Something on my own listing is waiting on me.
const needsMyAction = (i: Item) =>
  (i.listingType === 'give' && i.status === 'pending_pickup') ||
  (i.listingType === 'borrow' && (i.status === 'pending_return' || i.borrowRequests.some(r => r.status === 'pending')));

function formatTimeLeft(deadline: Date, now: Date): string {
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return '';
  const totalMins = Math.floor(ms / 60000);
  const days  = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins  = totalMins % 60;
  const parts: string[] = [];
  if (days  > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins  > 0 || parts.length === 0) parts.push(`${mins}m`);
  return parts.join(' ');
}

export default function MyItemsScreen() {
  const {
    items, getMyItems, deleteItem, confirmPickup, releaseClaim,
    getUserById, currentUser,
    approveBorrowRequest, rejectBorrowRequest, confirmBorrowReturn,
    markPickedUp, markBorrowReturned, cancelBorrowRequest, leaveWaitlist,
  } = useApp();
  const router = useRouter();
  const { view: viewParam } = useLocalSearchParams<{ view?: ViewKey }>();
  const [view, setView] = useState<ViewKey>(viewParam === 'friends' ? 'friends' : 'listings');
  // Tab screens stay mounted, so honor ?view= on later navigations too.
  useEffect(() => {
    if (viewParam === 'friends' || viewParam === 'listings') setView(viewParam);
  }, [viewParam]);
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── My Listings ──────────────────────────────────────────
  const myListings = getMyItems();
  const filteredListings =
    listingFilter === 'free'    ? myListings.filter(i => i.listingType === 'give') :
    listingFilter === 'lending' ? myListings.filter(i => i.listingType === 'borrow') :
    listingFilter === 'skills'  ? myListings.filter(i => i.listingType === 'skill') :
                                  myListings;

  const listingSections = [
    { key: 'action',    title: 'Needs your action', data: filteredListings.filter(needsMyAction) },
    { key: 'active',    title: 'Active',            data: filteredListings.filter(i => !isDone(i) && !needsMyAction(i)) },
    { key: 'completed', title: 'Completed',         data: filteredListings.filter(isDone) },
  ].filter(s => s.data.length > 0);
  const listingsActionCount = myListings.filter(needsMyAction).length;

  // ── From Friends ─────────────────────────────────────────
  const me = currentUser.id;
  const fromOthers = items.filter(i => i.donorId !== me);
  const friendSections: { key: FriendSectionKey; title: string; data: Item[] }[] = [
    { key: 'pickup',     title: 'Ready to pick up', data: fromOthers.filter(i => i.listingType === 'give' && i.claimedBy === me && i.status === 'claimed') },
    { key: 'waiting',    title: 'Waiting on donor', data: fromOthers.filter(i => i.listingType === 'give' && i.claimedBy === me && i.status === 'pending_pickup') },
    { key: 'borrowing',  title: 'Borrowing',        data: fromOthers.filter(i => i.listingType === 'borrow' && i.borrowedBy === me && i.status === 'borrowed') },
    { key: 'returning',  title: 'Returning',        data: fromOthers.filter(i => i.listingType === 'borrow' && i.borrowedBy === me && i.status === 'pending_return') },
    { key: 'requested',  title: 'Requested',        data: fromOthers.filter(i => i.listingType === 'borrow' && i.borrowRequests.some(r => r.requesterId === me && r.status === 'pending')) },
    { key: 'waitlisted', title: 'Waitlisted',       data: fromOthers.filter(i => i.listingType === 'give' && i.waitlist.includes(me)) },
  ];
  const visibleFriendSections = friendSections.filter(s => s.data.length > 0);
  const friendsActionCount = friendSections
    .filter(s => s.key === 'pickup' || s.key === 'borrowing')
    .reduce((n, s) => n + s.data.length, 0);

  const handleDelete = (item: Item) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${item.title}" from your listings?`)) deleteItem(item.id);
      return;
    }
    Alert.alert('Remove Listing', `Remove "${item.title}" from your listings?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteItem(item.id) },
    ]);
  };

  const renderDonorCard = ({ item }: { item: Item }) => {
    const isBorrow = item.listingType === 'borrow';
    const isGive   = item.listingType === 'give';
    const pendingReqs = isBorrow ? item.borrowRequests.filter(r => r.status === 'pending') : [];

    // Disposed give items have nothing to show or do.
    const footer = isGive && item.status === 'disposed' ? null : (
        <View style={styles.actionRow}>

          {/* ── Give item: claimed/waitlist chips ── */}
          {isGive && item.claimedBy && item.status === 'claimed' && (
            <View style={styles.claimedByChip}>
              <FontAwesome name="user" size={11} color={BUTTER_INK} style={{ marginRight: 4 }} />
              <Text style={styles.claimedByText}>
                Claimed by {getUserById(item.claimedBy)?.name ?? 'someone'}
              </Text>
            </View>
          )}
          {isGive && item.waitlist.length > 0 && item.status !== 'pending_pickup' && (
            <View style={styles.waitlistChip}>
              <FontAwesome name="list" size={11} color={ROSE_INK} style={{ marginRight: 4 }} />
              <Text style={styles.waitlistChipText}>{item.waitlist.length} waiting</Text>
            </View>
          )}

          {/* ── Borrow item: pending requests ── */}
          {isBorrow && pendingReqs.map(req => {
            const requester = getUserById(req.requesterId);
            return (
              <View key={req.id} style={styles.borrowReqRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.borrowReqName}>{requester?.name ?? 'Someone'}</Text>
                  <Text style={styles.borrowReqDates}>
                    {new Date(req.startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' – '}
                    {new Date(req.endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
                <Pressable style={[styles.actionBtn, { backgroundColor: SKY_TINT }]} onPress={() => approveBorrowRequest(item.id, req.id)}>
                  <FontAwesome name="check" size={13} color={STEEL_BLUE} />
                  <Text style={[styles.actionBtnText, { color: STEEL_BLUE }]}>Approve</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => rejectBorrowRequest(item.id, req.id)}>
                  <FontAwesome name="times" size={13} color={MUTE} />
                  <Text style={styles.actionBtnText}>Decline</Text>
                </Pressable>
              </View>
            );
          })}

          {/* ── Borrow item: currently borrowed ── */}
          {isBorrow && item.status === 'borrowed' && (
            <View style={styles.claimedByChip}>
              <FontAwesome name="refresh" size={11} color={BUTTER_INK} style={{ marginRight: 4 }} />
              <Text style={styles.claimedByText}>
                Borrowed by {getUserById(item.borrowedBy ?? '')?.name ?? 'someone'}
                {item.borrowedUntil ? ` until ${formatCalendarDate(item.borrowedUntil)}` : ''}
              </Text>
            </View>
          )}

          {/* ── Borrow item: pending return ── */}
          {isBorrow && item.status === 'pending_return' && (
            <>
              <View style={styles.waitlistChip}>
                <FontAwesome name="clock-o" size={11} color={ROSE_INK} style={{ marginRight: 4 }} />
                <Text style={styles.waitlistChipText}>Return pending</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Pressable style={[styles.actionBtn, styles.actionBtnConfirm]} onPress={() => confirmBorrowReturn(item.id)}>
                <FontAwesome name="check" size={13} color={TANGERINE} />
                <Text style={[styles.actionBtnText, { color: TANGERINE }]}>Confirm Return</Text>
              </Pressable>
            </>
          )}

          <View style={{ flex: 1 }} />

          {/* ── Give item: action buttons ── */}
          {isGive && item.status === 'pending_pickup' && (
            <>
              <Pressable style={[styles.actionBtn, styles.actionBtnConfirm]} onPress={() => confirmPickup(item.id)}>
                <FontAwesome name="check" size={13} color={TANGERINE} />
                <Text style={[styles.actionBtnText, { color: TANGERINE }]}>Confirm Pickup</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => releaseClaim(item.id)}>
                <FontAwesome name="undo" size={13} color={MUTE} />
                <Text style={styles.actionBtnText}>Not Picked Up</Text>
              </Pressable>
            </>
          )}
          {isGive && item.status === 'picked_up' && (
            <Pressable style={styles.actionBtn} onPress={() => releaseClaim(item.id)}>
              <FontAwesome name="undo" size={13} color={MUTE} />
              <Text style={styles.actionBtnText}>Release Claim</Text>
            </Pressable>
          )}
          {isGive && item.status !== 'picked_up' && item.status !== 'disposed' && item.status !== 'pending_pickup' && (
            <Pressable style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleDelete(item)}>
              <FontAwesome name="trash" size={14} color={TANG_DEEP} />
              <Text style={[styles.actionBtnText, { color: TANG_DEEP }]}>Remove</Text>
            </Pressable>
          )}

          {/* ── Skill, or borrow item not currently lent out: remove ── */}
          {(item.listingType === 'skill' || (isBorrow && item.status === 'available')) && (
            <Pressable style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleDelete(item)}>
              <FontAwesome name="trash" size={14} color={TANG_DEEP} />
              <Text style={[styles.actionBtnText, { color: TANG_DEEP }]}>Remove</Text>
            </Pressable>
          )}
        </View>
    );

    return <ItemCard item={item} onPress={() => router.push(`/item/${item.id}`)} footer={footer} />;
  };

  const renderFriendCard = (item: Item, section: FriendSectionKey) => {
    const donorFirst = getUserById(item.donorId)?.name.split(' ')[0] ?? 'the owner';
    let icon: React.ComponentProps<typeof FontAwesome>['name'] = 'clock-o';
    let status = '';
    let urgent = false;
    const actions: { label: string; icon: React.ComponentProps<typeof FontAwesome>['name']; primary?: boolean; confirm: PendingConfirm }[] = [];

    switch (section) {
      case 'pickup': {
        const deadline = item.claimDeadline ? new Date(item.claimDeadline) : null;
        urgent = !!deadline && deadline <= now;
        status = !deadline ? 'Claimed — arrange pickup'
          : urgent ? 'Pickup window expired'
          : `${formatTimeLeft(deadline, now)} to pick up`;
        actions.push({
          label: 'Mark Picked Up', icon: 'check', primary: true,
          confirm: {
            title: 'Mark as Picked Up',
            message: `Confirm you've picked up "${item.title}"? ${donorFirst} will be asked to confirm the handoff.`,
            confirmLabel: 'Yes, Picked Up',
            onConfirm: () => markPickedUp(item.id),
          },
        });
        actions.push({
          label: 'Release', icon: 'undo',
          confirm: {
            title: 'Release Claim',
            message: `Give up your claim on "${item.title}"? The next person on the waitlist will get it.`,
            confirmLabel: 'Release',
            destructive: true,
            onConfirm: () => releaseClaim(item.id),
          },
        });
        break;
      }
      case 'waiting':
        status = `Waiting for ${donorFirst} to confirm pickup`;
        break;
      case 'borrowing': {
        icon = 'calendar';
        const due = item.borrowedUntil ? new Date(item.borrowedUntil + 'T23:59:59') : null;
        urgent = !!due && due < now;
        status = !item.borrowedUntil ? 'Borrowing'
          : urgent ? `Return overdue — was due ${formatCalendarDate(item.borrowedUntil)}`
          : `Return by ${formatCalendarDate(item.borrowedUntil)}`;
        actions.push({
          label: 'Mark Returned', icon: 'check', primary: true,
          confirm: {
            title: 'Mark as Returned',
            message: `Let ${donorFirst} know you've returned "${item.title}"? They'll confirm they got it back.`,
            confirmLabel: 'Yes, Returned',
            onConfirm: () => markBorrowReturned(item.id),
          },
        });
        break;
      }
      case 'returning':
        icon = 'calendar';
        status = `Waiting for ${donorFirst} to confirm the return`;
        break;
      case 'requested': {
        icon = 'paper-plane';
        const req = item.borrowRequests.find(r => r.requesterId === me && r.status === 'pending');
        status = req
          ? `Requested ${formatCalendarDate(req.startDate)} – ${formatCalendarDate(req.endDate)}`
          : 'Request pending';
        if (req) {
          actions.push({
            label: 'Cancel Request', icon: 'times',
            confirm: {
              title: 'Cancel Request',
              message: `Withdraw your request to borrow "${item.title}"?`,
              confirmLabel: 'Cancel Request',
              destructive: true,
              onConfirm: () => cancelBorrowRequest(item.id, req.id),
            },
          });
        }
        break;
      }
      case 'waitlisted':
        icon = 'list';
        status = `You're #${item.waitlist.indexOf(me) + 1} on the waitlist`;
        actions.push({
          label: 'Leave Waitlist', icon: 'sign-out',
          confirm: {
            title: 'Leave Waitlist',
            message: `Leave the waitlist for "${item.title}"? You'll lose your spot.`,
            confirmLabel: 'Leave',
            destructive: true,
            onConfirm: () => leaveWaitlist(item.id),
          },
        });
        break;
    }

    const footer = (
        <View style={styles.actionRow}>
          <View style={styles.statusLine}>
            <FontAwesome name={icon} size={12} color={urgent ? TANG_DEEP : MUTE} style={{ marginRight: 6 }} />
            <Text style={[styles.statusText, urgent && { color: TANG_DEEP }]}>{status}</Text>
          </View>
          {actions.length > 0 && <View style={{ flex: 1 }} />}
          {actions.map(a => (
            <Pressable
              key={a.label}
              style={[styles.actionBtn, a.primary && styles.actionBtnConfirm]}
              onPress={() => setPendingConfirm(a.confirm)}
            >
              <FontAwesome name={a.icon} size={12} color={a.primary ? TANGERINE : MUTE} />
              <Text style={[styles.actionBtnText, a.primary && { color: TANGERINE }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
    );

    return <ItemCard item={item} onPress={() => router.push(`/item/${item.id}`)} footer={footer} />;
  };

  const renderSectionHeader = (title: string, count: number, highlight: boolean) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, highlight && { color: TANGERINE }]}>{title}</Text>
      <View style={[styles.sectionCount, highlight && { backgroundColor: TANGERINE }]}>
        <Text style={[styles.sectionCountText, highlight && { color: CREAM }]}>{count}</Text>
      </View>
    </View>
  );

  const VIEWS: { key: ViewKey; label: string; actionCount: number }[] = [
    { key: 'listings', label: 'My Listings',  actionCount: listingsActionCount },
    { key: 'friends',  label: 'From Friends', actionCount: friendsActionCount },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.segment}>
          {VIEWS.map(v => {
            const active = view === v.key;
            return (
              <Pressable
                key={v.key}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setView(v.key)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{v.label}</Text>
                {v.actionCount > 0 && (
                  <View style={styles.segmentBadge}>
                    <Text style={styles.segmentBadgeText}>{v.actionCount}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {view === 'listings' && (
          <View style={[styles.filterRow, { marginTop: 10 }]}>
            {LISTING_FILTERS.map(f => {
              const active = listingFilter === f.key;
              return (
                <Pressable
                  key={f.key}
                  style={[styles.filterBtn, active && [styles.filterBtnActive, { backgroundColor: f.color, shadowColor: f.color }]]}
                  onPress={() => setListingFilter(f.key)}
                >
                  <Text style={[styles.filterBtnText, active && { color: CREAM }]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {view === 'listings' && (
        listingSections.length === 0 ? (
          <EmptyState
            icon="gift"
            title={listingFilter === 'all' ? 'No listings yet' : 'Nothing here'}
            subtitle="Share something with your friends"
            ctaLabel="List something →"
            onCta={() => router.push('/item/new')}
          />
        ) : (
          <SectionList
            sections={listingSections}
            keyExtractor={item => item.id}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => renderSectionHeader(section.title, section.data.length, section.key === 'action')}
            renderItem={renderDonorCard}
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {view === 'friends' && (
        visibleFriendSections.length === 0 ? (
          <EmptyState
            icon="hand-o-right"
            title="Nothing from friends yet"
            subtitle="Items you claim, borrow, request, or join a waitlist for will show up here"
            ctaLabel="Browse items →"
            onCta={() => router.push('/')}
          />
        ) : (
          <SectionList
            sections={visibleFriendSections}
            keyExtractor={item => item.id}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) =>
              renderSectionHeader(section.title, section.data.length, section.key === 'pickup' || section.key === 'borrowing')}
            renderItem={({ item, section }) => renderFriendCard(item, section.key)}
            contentContainerStyle={{ paddingBottom: 40, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {view === 'listings' && (
        <Pressable style={styles.fab} onPress={() => router.push('/item/new')}>
          <FontAwesome name="plus" size={22} color={CREAM} />
        </Pressable>
      )}

      <ConfirmSheet
        visible={!!pendingConfirm}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? ''}
        confirmLabel={pendingConfirm?.confirmLabel ?? 'Confirm'}
        cancelLabel="Never mind"
        destructive={pendingConfirm?.destructive}
        onConfirm={() => { pendingConfirm?.onConfirm(); setPendingConfirm(null); }}
        onCancel={() => setPendingConfirm(null)}
      />
    </View>
  );
}

function EmptyState({ icon, title, subtitle, ctaLabel, onCta }: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <FontAwesome name={icon} size={52} color={FAINT} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
      {ctaLabel && onCta && (
        <Pressable style={styles.emptyCta} onPress={onCta}>
          <Text style={styles.emptyCtaText}>{ctaLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  segment: {
    flexDirection: 'row',
    backgroundColor: CREAM_2,
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  segmentBtnActive: {
    backgroundColor: WHITE,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: { fontSize: 14, fontWeight: '700', color: MUTE },
  segmentTextActive: { color: INK },
  segmentBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: TANGERINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBadgeText: { fontSize: 11, fontWeight: '800', color: CREAM },
  statusLine: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  statusText: { fontSize: 12, color: MUTE, fontWeight: '600', flexShrink: 1 },
  // Matches the Browse listing-type bar (app/(tabs)/index.tsx segmentedBar).
  filterRow: {
    flexDirection: 'row',
    backgroundColor: TRACK,
    borderRadius: 10,
    padding: 3,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  filterBtnActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  filterBtnText: { fontSize: 14, color: MUTE, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTE_LIGHT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    backgroundColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  sectionCountText: { fontSize: 12, fontWeight: '700', color: MUTE },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  claimedByChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244,201,93,0.22)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  claimedByText: { fontSize: 12, color: BUTTER_INK, fontWeight: '600' },
  waitlistChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232,154,141,0.22)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  waitlistChipText: { fontSize: 12, color: ROSE_INK, fontWeight: '600' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CREAM_2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  actionBtnDanger:  { backgroundColor: CREAM_2 },
  actionBtnConfirm: { backgroundColor: CREAM_2 },
  actionBtnText: { fontSize: 12, color: MUTE, fontWeight: '600' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: MUTE_LIGHT, marginTop: 8 },
  emptySubtitle: {
    fontSize: 14,
    color: FAINT,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  emptyCta: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: TANGERINE,
  },
  emptyCtaText: { fontSize: 14, fontWeight: '700', color: CREAM },
  borrowReqRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SKY_TINT,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    gap: 8,
  },
  borrowReqName:  { fontSize: 13, fontWeight: '700', color: INK },
  borrowReqDates: { fontSize: 12, color: MUTE },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TANGERINE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
