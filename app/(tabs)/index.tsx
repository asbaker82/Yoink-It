import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  Platform,
  ScrollView,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useApp } from '@/store/AppContext';
import ItemCard from '@/components/ItemCard';
import SwipeableCard from '@/components/SwipeableCard';
import ConfirmSheet from '@/components/ConfirmSheet';

import { Item } from '@/store/types';

type ListingFilter = 'all' | 'free' | 'borrow' | 'skill';
type FreeStatusFilter = 'all' | 'available' | 'claimed';
type BorrowStatusFilter = 'all' | 'available' | 'borrowed';

// Levenshtein edit distance
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    for (let j = 0; j <= n; j++) {
      dp[i][j] = i === 0 ? j : j === 0 ? i : 0;
    }
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzyScore(query: string, item: Item): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;

  const corpus = `${item.title} ${item.description} ${item.restrictions ?? ''}`.toLowerCase();

  // Exact phrase match wins immediately
  if (corpus.includes(q)) return 100;

  const qTokens = q.split(/\s+/).filter(t => t.length > 1);
  const cTokens = corpus.split(/\s+/).filter(Boolean);

  let totalScore = 0;
  let matchedTokens = 0;

  for (const qt of qTokens) {
    let best = 0;
    for (const ct of cTokens) {
      if (ct.includes(qt) || qt.includes(ct)) {
        best = Math.max(best, 10);
      } else if (qt.length >= 6 && editDistance(qt, ct) <= 1) {
        // Allow 1 typo only for words 6+ chars (e.g. "opener" → "openers")
        best = Math.max(best, 4);
      } else if (qt.length >= 9 && editDistance(qt, ct) <= 2) {
        // Allow 2 typos only for long words (e.g. "bookshelf" → "bookshelve")
        best = Math.max(best, 4);
      }
    }
    if (best > 0) matchedTokens++;
    totalScore += best;
  }

  // For multi-word queries every token must match — no partial hits
  if (qTokens.length > 1 && matchedTokens < qTokens.length) return 0;

  return totalScore;
}

export default function BrowseScreen() {
  const {
    getFriendItems,
    currentUser,
    items,
    dismissed,
    dismissItem,
    restoreItem,
    searchHistory,
    addToSearchHistory,
    clearSearchHistory,
    searchNotifications,
    addSearchNotification,
    confirmPickup,
    releaseClaim,
    approveBorrowRequest,
    rejectBorrowRequest,
    confirmBorrowReturn,
    getUserById,
    markPickedUp,
  } = useApp();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const handleListingFilterChange = (lf: ListingFilter) => {
    setListingFilter(lf);
    setStatusFilter('all');
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [pendingMarkPickupId, setPendingMarkPickupId] = useState<string | null>(null);
  const [undoItemId, setUndoItemId] = useState<string | null>(null);
  const [undoItemTitle, setUndoItemTitle] = useState('');
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoAnim = useRef(new Animated.Value(0)).current;

  const handleDismiss = (itemId: string, title: string) => {
    dismissItem(itemId);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoItemId(itemId);
    setUndoItemTitle(title);
    Animated.spring(undoAnim, { toValue: 1, useNativeDriver: true, bounciness: 4 }).start();
    undoTimer.current = setTimeout(() => {
      Animated.timing(undoAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setUndoItemId(null));
    }, 4000);
  };

  const handleUndo = () => {
    if (!undoItemId) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    restoreItem(undoItemId);
    Animated.timing(undoAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setUndoItemId(null));
  };

  const friendItems = getFriendItems();

  // ── Action banners ────────────────────────────────────────────────────────
  const myTurn = items.filter(
    item =>
      item.status === 'claimed' &&
      item.claimedBy === currentUser.id &&
      item.claimDeadline &&
      new Date(item.claimDeadline) > new Date()
  );

  const pendingBorrowApprovals = items.filter(
    item =>
      item.donorId === currentUser.id &&
      item.listingType === 'borrow' &&
      item.borrowRequests.some(r => r.status === 'pending')
  );

  const needPickupConfirm = items.filter(
    item =>
      item.donorId === currentUser.id &&
      item.listingType === 'give' &&
      item.status === 'pending_pickup'
  );

  const needReturnConfirm = items.filter(
    item =>
      item.donorId === currentUser.id &&
      item.listingType === 'borrow' &&
      item.status === 'pending_return'
  );

  const actionBanners = [
    currentUser.friends.length === 0 && {
      key: 'add-friends',
      icon: 'user-plus' as const,
      color: '#F26B3A',
      label: 'Add friends to see their listings',
      dest: '/add-friends',
    },
    myTurn.length > 0 && {
      key: 'pickup',
      icon: 'clock-o' as const,
      color: '#F26B3A',
      label: `${myTurn.length} item${myTurn.length > 1 ? 's' : ''} waiting for you to pick up`,
    },
    pendingBorrowApprovals.length > 0 && {
      key: 'borrow-requests',
      icon: 'calendar-check-o' as const,
      color: '#7BA7BC',
      label: `${pendingBorrowApprovals.length} borrow request${pendingBorrowApprovals.length > 1 ? 's' : ''} waiting for your approval`,
    },
    needPickupConfirm.length > 0 && {
      key: 'confirm-pickup',
      icon: 'check-circle' as const,
      color: '#7FA88A',
      label: `${needPickupConfirm.length} pickup${needPickupConfirm.length > 1 ? 's' : ''} waiting for your confirmation`,
    },
    needReturnConfirm.length > 0 && {
      key: 'confirm-return',
      icon: 'undo' as const,
      color: '#7BA7BC',
      label: `${needReturnConfirm.length} return${needReturnConfirm.length > 1 ? 's' : ''} waiting for your confirmation`,
    },
  ].filter(Boolean) as { key: string; icon: React.ComponentProps<typeof FontAwesome>['name']; color: string; label: string; dest?: string }[];

  // Auto-close action sheet when its items run out (e.g. last confirm tapped)
  useEffect(() => {
    if (!activeSheet) return;
    const counts: Record<string, number> = {
      'pickup':          myTurn.length,
      'borrow-requests': pendingBorrowApprovals.length,
      'confirm-pickup':  needPickupConfirm.length,
      'confirm-return':  needReturnConfirm.length,
    };
    if ((counts[activeSheet] ?? 0) === 0) setActiveSheet(null);
  }, [activeSheet, myTurn.length, pendingBorrowApprovals.length, needPickupConfirm.length, needReturnConfirm.length]);

  const scored = friendItems
    .map(item => ({ item, score: fuzzyScore(search, item) }))
    .filter(({ score }) => score > 0)
    .filter(({ item }) =>
      listingFilter === 'all'    ? true :
      listingFilter === 'free'   ? item.listingType === 'give' :
      listingFilter === 'borrow' ? item.listingType === 'borrow' :
                                   item.listingType === 'skill')
    .filter(({ item }) => {
      if (statusFilter === 'all') return true;
      if (listingFilter === 'borrow' && statusFilter === 'borrowed') {
        return item.status === 'borrowed' || item.status === 'pending_return';
      }
      return item.status === statusFilter;
    })
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : new Date(a.item.disposalDate).getTime() - new Date(b.item.disposalDate).getTime()
    );

  const sortedFiltered = scored.map(({ item }) => item).filter(item => !dismissed.has(item.id));

  const handleSubmitSearch = () => {
    const term = search.trim();
    if (term) addToSearchHistory(term);
    setHistoryOpen(false);
    inputRef.current?.blur();
  };

  const handleSelectHistory = (term: string) => {
    setSearch(term);
    setHistoryOpen(false);
    inputRef.current?.blur();
  };

  const handleClearSearch = () => {
    setSearch('');
    setHistoryOpen(searchHistory.length > 0);
    inputRef.current?.focus();
  };

  const handleSetAlert = async () => {
    const keyword = search.trim();
    if (!keyword) {
      if (Platform.OS === 'web') {
        window.alert('Type a keyword in the search bar first, then tap the bell to set an alert.');
      } else {
        Alert.alert('Set an Alert', 'Type a keyword in the search bar first, then tap the bell to get notified when a match is posted.');
      }
      return;
    }
    addToSearchHistory(keyword);
    const alreadyExists = await addSearchNotification(keyword);
    if (alreadyExists) {
      if (Platform.OS === 'web') {
        window.alert(`You already have an alert set for "${keyword}".`);
      } else {
        Alert.alert('Already Set', `You already have an alert for "${keyword}".`);
      }
      return;
    }
    const matches = friendItems.filter(i => fuzzyScore(keyword, i) > 0);
    const matchMsg = matches.length > 0
      ? `\n\n${matches.length} matching item${matches.length > 1 ? 's' : ''} already listed — check the results below.`
      : '';
    if (Platform.OS === 'web') {
      window.alert(`Alert saved for "${keyword}".\n\nYou'll be notified when a matching item is posted.${matchMsg}`);
    } else {
      Alert.alert('Alert Saved', `You'll be notified when a matching item is posted for "${keyword}".${matchMsg}`);
    }
  };

  const showHistory = historyOpen && searchHistory.length > 0 && !search;

  return (
    <View style={styles.container}>
      {actionBanners.map(b => (
        <Pressable key={b.key} style={[styles.banner, { backgroundColor: b.color }]} onPress={() => b.dest ? router.push(b.dest as any) : setActiveSheet(b.key)}>
          <FontAwesome name={b.icon} size={14} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.bannerText}>{b.label}</Text>
          <FontAwesome name="chevron-right" size={12} color="#fff" />
        </Pressable>
      ))}

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, historyOpen && styles.searchBoxOpen]}>
          <FontAwesome name="search" size={14} color="#a0aec0" style={{ marginRight: 8 }} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor="#a0aec0"
            value={search}
            onChangeText={t => { setSearch(t); setHistoryOpen(!t && searchHistory.length > 0); }}
            onFocus={() => { if (!search && searchHistory.length > 0) setHistoryOpen(true); }}
            onBlur={() => setTimeout(() => setHistoryOpen(false), 150)}
            onSubmitEditing={handleSubmitSearch}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable onPress={handleClearSearch} style={styles.searchAction}>
              <FontAwesome name="times-circle" size={16} color="#a0aec0" />
            </Pressable>
          ) : searchHistory.length > 0 ? (
            <Pressable
              onPress={() => setHistoryOpen(o => !o)}
              style={styles.searchAction}
              hitSlop={8}
            >
              <FontAwesome name="history" size={15} color="#a0aec0" />
            </Pressable>
          ) : null}
        </View>

        {/* Set alert button — always visible */}
        <Pressable
          style={[
            styles.alertBtn,
            searchNotifications.some(n => n.keyword.toLowerCase() === search.trim().toLowerCase()) && search.trim().length > 0 && styles.alertBtnActive,
          ]}
          onPress={handleSetAlert}
          hitSlop={6}
        >
          <FontAwesome
            name="bell"
            size={15}
            color={searchNotifications.some(n => n.keyword.toLowerCase() === search.trim().toLowerCase()) && search.trim().length > 0 ? '#FBF6EE' : '#F26B3A'}
          />
        </Pressable>
      </View>

      {/* Search history dropdown */}
      {showHistory && (
        <View style={styles.historyDropdown}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Recent Searches</Text>
            <Pressable onPress={clearSearchHistory}>
              <Text style={styles.historyClear}>Clear</Text>
            </Pressable>
          </View>
          {searchHistory.map(term => (
            <Pressable
              key={term}
              style={styles.historyRow}
              onPress={() => handleSelectHistory(term)}
            >
              <FontAwesome name="history" size={12} color="#a0aec0" style={styles.historyIcon} />
              <Text style={styles.historyTerm}>{term}</Text>
              <FontAwesome name="arrow-left" size={11} color="#cbd5e0" style={{ transform: [{ rotate: '45deg' }] }} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Listing type segmented control */}
      <View style={styles.segmentedRow}>
        <View style={styles.segmentedBar}>
          <Pressable
            style={[styles.segment, listingFilter === 'all' && styles.segmentActiveAll]}
            onPress={() => handleListingFilterChange('all')}
          >
            <Text style={[styles.segmentText, listingFilter === 'all' && styles.segmentTextActive]}>
              All
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segment, listingFilter === 'free' && styles.segmentActiveFree]}
            onPress={() => handleListingFilterChange('free')}
          >
            <Text style={[styles.segmentText, listingFilter === 'free' && styles.segmentTextActive]}>
              Free
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segment, listingFilter === 'borrow' && styles.segmentActiveBorrow]}
            onPress={() => handleListingFilterChange('borrow')}
          >
            <Text style={[styles.segmentText, listingFilter === 'borrow' && styles.segmentTextActive]}>
              Borrow
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segment, listingFilter === 'skill' && styles.segmentActiveSkill]}
            onPress={() => handleListingFilterChange('skill')}
          >
            <Text style={[styles.segmentText, listingFilter === 'skill' && styles.segmentTextActive]}>
              Skills
            </Text>
          </Pressable>
        </View>
        {search.trim().length > 0 && scored.length > 0 && (
          <Text style={styles.matchCount}>{scored.length} match{scored.length !== 1 ? 'es' : ''}</Text>
        )}
      </View>

      {/* Status filter — hidden for All and Skills (skills have no statuses) */}
      {(listingFilter === 'free' || listingFilter === 'borrow') && (
      <View style={[styles.filterRow, { justifyContent: 'center' }]}>
        {listingFilter === 'free' ? (
          (['all', 'available', 'claimed'] as FreeStatusFilter[]).map(f => (
            <Pressable
              key={f}
              style={[styles.filterBtn, styles.statusBtn, statusFilter === f && styles.filterBtnActive]}
              onPress={() => setStatusFilter(f)}
            >
              <Text style={[styles.filterBtnText, statusFilter === f && styles.filterBtnTextActive]}>
                {f === 'all' ? 'All' : f === 'available' ? 'Available' : 'Claimed'}
              </Text>
            </Pressable>
          ))
        ) : (
          (['all', 'available', 'borrowed'] as BorrowStatusFilter[]).map(f => (
            <Pressable
              key={f}
              style={[styles.filterBtn, styles.statusBtn, statusFilter === f && styles.filterBtnBorrowActive]}
              onPress={() => setStatusFilter(f)}
            >
              <Text style={[styles.filterBtnText, statusFilter === f && styles.filterBtnTextActive]}>
                {f === 'all' ? 'All' : f === 'available' ? 'Available' : 'Borrowed'}
              </Text>
            </Pressable>
          ))
        )}
      </View>
      )}

      {sortedFiltered.length === 0 ? (
        <View style={styles.empty}>
          <FontAwesome
            name={!search.trim() && currentUser.friends.length === 0 ? 'users' : 'inbox'}
            size={52}
            color="#cbd5e0"
          />
          <Text style={styles.emptyTitle}>
            {search.trim()
              ? 'No matches found'
              : currentUser.friends.length === 0
                ? 'No friends added yet'
                : 'No items found'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {search.trim()
              ? 'Try different words, or set an alert to be notified when one is posted.'
              : currentUser.friends.length === 0
                ? 'Add friends to see what they\'re giving away.'
                : 'Try adjusting your filter'}
          </Text>
          {!search.trim() && currentUser.friends.length === 0 && (
            <Pressable style={styles.emptyAddFriendsBtn} onPress={() => router.push('/add-friends')}>
              <FontAwesome name="user-plus" size={14} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.emptyAddFriendsBtnText}>Add Friends from Contacts</Text>
            </Pressable>
          )}
          {search.trim().length > 0 && (
            <Pressable style={styles.emptyAlertBtn} onPress={handleSetAlert}>
              <FontAwesome name="bell" size={14} color="#D8531F" style={{ marginRight: 6 }} />
              <Text style={styles.emptyAlertBtnText}>Set Alert for "{search.trim()}"</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={sortedFiltered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <SwipeableCard onDismiss={() => handleDismiss(item.id, item.title)}>
              <ItemCard item={item} onPress={() => { addToSearchHistory(search.trim()); router.push(`/item/${item.id}`); }} />
            </SwipeableCard>
          )}
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Action sheet ────────────────────────────────────────────────── */}
      {!!activeSheet && (
        <View style={styles.sheetOverlay} pointerEvents="box-none">
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(31,26,23,0.5)' }]} onPress={() => setActiveSheet(null)} />
          <View style={styles.sheetContainer}>
            {/* Handle */}
            <View style={styles.sheetHandle} />
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {activeSheet === 'pickup'          ? 'Ready to Pick Up'
                 : activeSheet === 'borrow-requests' ? 'Borrow Requests'
                 : activeSheet === 'confirm-pickup'  ? 'Confirm Pickups'
                 :                                     'Confirm Returns'}
              </Text>
              <Pressable onPress={() => setActiveSheet(null)} style={styles.sheetClose}>
                <FontAwesome name="times" size={18} color="#847A70" />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {(activeSheet === 'pickup' ? myTurn
                : activeSheet === 'borrow-requests' ? pendingBorrowApprovals
                : activeSheet === 'confirm-pickup'  ? needPickupConfirm
                :                                     needReturnConfirm
              ).map(item => (
                <View key={item.id} style={styles.sheetItem}>
                  <ItemCard
                    item={item}
                    onPress={() => { setActiveSheet(null); router.push(`/item/${item.id}`); }}
                  />
                  <View style={styles.sheetActionRow}>

                    {/* Donee: pick up */}
                    {activeSheet === 'pickup' && (
                      <>
                        <Pressable
                          style={[styles.sheetBtn, styles.sheetBtnConfirm]}
                          onPress={() => setPendingMarkPickupId(item.id)}
                        >
                          <FontAwesome name="check" size={13} color="#F26B3A" />
                          <Text style={[styles.sheetBtnText, { color: '#F26B3A' }]}>I've Picked It Up</Text>
                        </Pressable>
                        <Pressable
                          style={styles.sheetBtn}
                          onPress={() => { setActiveSheet(null); router.push(`/item/${item.id}`); }}
                        >
                          <Text style={styles.sheetBtnText}>View Details →</Text>
                        </Pressable>
                      </>
                    )}

                    {/* Donor: approve/reject borrow requests */}
                    {activeSheet === 'borrow-requests' && item.borrowRequests.filter(r => r.status === 'pending').map(req => {
                      const requester = getUserById(req.requesterId);
                      return (
                        <View key={req.id} style={styles.sheetBorrowReqRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.sheetBorrowName}>{requester?.name ?? 'Someone'}</Text>
                            <Text style={styles.sheetBorrowDates}>
                              {new Date(req.startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {' – '}
                              {new Date(req.endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </Text>
                          </View>
                          <Pressable style={[styles.sheetBtn, { backgroundColor: '#EEF5FA' }]} onPress={() => approveBorrowRequest(item.id, req.id)}>
                            <FontAwesome name="check" size={13} color="#7BA7BC" />
                            <Text style={[styles.sheetBtnText, { color: '#7BA7BC' }]}>Approve</Text>
                          </Pressable>
                          <Pressable style={styles.sheetBtn} onPress={() => rejectBorrowRequest(item.id, req.id)}>
                            <FontAwesome name="times" size={13} color="#847A70" />
                            <Text style={styles.sheetBtnText}>Decline</Text>
                          </Pressable>
                        </View>
                      );
                    })}

                    {/* Donor: confirm give pickup */}
                    {activeSheet === 'confirm-pickup' && (
                      <>
                        <Pressable style={[styles.sheetBtn, styles.sheetBtnConfirm]} onPress={() => confirmPickup(item.id)}>
                          <FontAwesome name="check" size={13} color="#F26B3A" />
                          <Text style={[styles.sheetBtnText, { color: '#F26B3A' }]}>Confirm Pickup</Text>
                        </Pressable>
                        <Pressable style={styles.sheetBtn} onPress={() => releaseClaim(item.id)}>
                          <FontAwesome name="undo" size={13} color="#847A70" />
                          <Text style={styles.sheetBtnText}>Not Picked Up</Text>
                        </Pressable>
                      </>
                    )}

                    {/* Donor: confirm borrow return */}
                    {activeSheet === 'confirm-return' && (
                      <>
                        <Pressable style={[styles.sheetBtn, styles.sheetBtnConfirm]} onPress={() => confirmBorrowReturn(item.id)}>
                          <FontAwesome name="check" size={13} color="#F26B3A" />
                          <Text style={[styles.sheetBtnText, { color: '#F26B3A' }]}>Confirm Return</Text>
                        </Pressable>
                        <Pressable style={styles.sheetBtn} onPress={() => setActiveSheet(null)}>
                          <FontAwesome name="clock-o" size={13} color="#847A70" />
                          <Text style={styles.sheetBtnText}>Not Yet</Text>
                        </Pressable>
                      </>
                    )}

                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      <ConfirmSheet
        visible={!!pendingMarkPickupId}
        title="Confirm Pickup"
        message="Confirm that you've picked up this item? The donor will be notified to complete the handoff."
        confirmLabel="Yes, Picked Up"
        cancelLabel="Not Yet"
        onConfirm={() => { if (pendingMarkPickupId) markPickedUp(pendingMarkPickupId); setPendingMarkPickupId(null); }}
        onCancel={() => setPendingMarkPickupId(null)}
      />

      {/* Undo toast */}
      {undoItemId && (
        <Animated.View
          style={[styles.undoToast, {
            opacity: undoAnim,
            transform: [{ translateY: undoAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          }]}
          pointerEvents="box-none"
        >
          <Text style={styles.undoText} numberOfLines={1}>
            Hidden: <Text style={{ fontWeight: '700' }}>{undoItemTitle}</Text>
          </Text>
          <Pressable onPress={handleUndo} style={styles.undoBtn}>
            <Text style={styles.undoBtnText}>Undo</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBF6EE' },
  banner: {
    backgroundColor: '#F26B3A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 2,
  },
  bannerText: { flex: 1, color: '#FBF6EE', fontWeight: '600', fontSize: 14 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#1F1A17',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchBoxOpen: { borderColor: '#F26B3A', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  searchInput: { flex: 1, fontSize: 15, color: '#1F1A17' },
  searchAction: { padding: 2 },
  alertBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFF3EC',
    borderWidth: 1.5,
    borderColor: '#F26B3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBtnActive: { backgroundColor: '#F26B3A' },

  // History dropdown
  historyDropdown: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: '#F26B3A',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    shadowColor: '#1F1A17',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  historyTitle: { fontSize: 11, fontWeight: '700', color: '#847A70', textTransform: 'uppercase', letterSpacing: 0.4 },
  historyClear: { fontSize: 12, color: '#e53e3e', fontWeight: '600' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(31,26,23,0.06)',
    gap: 10,
  },
  historyIcon: { width: 16 },
  historyTerm: { flex: 1, fontSize: 14, color: '#1F1A17' },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F4ECDD',
  },
  segmentedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  segmentedBar: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#EDE6D8',
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentActiveAll: {
    backgroundColor: '#3A332E',
    shadowColor: '#1F1A17',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentActiveFree: {
    backgroundColor: '#F26B3A',
    shadowColor: '#F26B3A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentActiveBorrow: {
    backgroundColor: '#7BA7BC',
    shadowColor: '#7BA7BC',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentActiveSkill: {
    backgroundColor: '#7FA88A',
    shadowColor: '#7FA88A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: { fontSize: 14, fontWeight: '700', color: '#847A70' },
  segmentTextActive: { color: '#FBF6EE' },
  filterBtnActive: { backgroundColor: '#F26B3A' },
  filterBtnBorrowActive: { backgroundColor: '#7BA7BC' },
  filterBtnText: { fontSize: 13, color: '#847A70', fontWeight: '600' },
  filterBtnTextActive: { color: '#FBF6EE' },
  statusBtn: { paddingHorizontal: 12, paddingVertical: 5 },
  matchCount: { fontSize: 12, color: '#847A70', marginLeft: 'auto' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#B0A89E', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#C9BCA8', textAlign: 'center' },
  emptyAddFriendsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#F26B3A',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  emptyAddFriendsBtnText: { fontSize: 14, color: '#FBF6EE', fontWeight: '700' },
  emptyAlertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#FFF3EC',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#F26B3A',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyAlertBtnText: { fontSize: 13, color: '#D8531F', fontWeight: '600' },

  // Action sheet
  sheetOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    zIndex: 200,
  },
  sheetContainer: {
    backgroundColor: '#FBF6EE',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%' as any,
    paddingTop: 8,
    shadowColor: '#1F1A17',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(31,26,23,0.18)',
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31,26,23,0.08)',
  },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#1F1A17' },
  sheetClose: { padding: 4 },
  sheetItem: { marginBottom: 4 },
  sheetActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  sheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4ECDD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
  },
  sheetBtnConfirm: { backgroundColor: '#FFF3EC' },
  sheetBtnText: { fontSize: 13, color: '#847A70', fontWeight: '600' },
  sheetBorrowReqRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF5FA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  sheetBorrowName:  { fontSize: 13, fontWeight: '700', color: '#1F1A17' },
  sheetBorrowDates: { fontSize: 12, color: '#847A70' },
  undoToast: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#1F1A17',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  undoText: { flex: 1, fontSize: 13, color: '#FBF6EE' },
  undoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F26B3A',
  },
  undoBtnText: { fontSize: 13, fontWeight: '700', color: '#FBF6EE' },
});
