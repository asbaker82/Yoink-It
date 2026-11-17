import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Platform, Image } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import ConfirmSheet from '@/components/ConfirmSheet';
import { useUserSheet } from '@/components/UserSheet';
import { openSms } from '@/utils/sms';
import { inviteMessage } from '@/utils/invite';
import { BUTTER, CREAM, CREAM_2, INK, INK_2, MUTE, SAGE, TANGERINE, TANGERINE_DEEP as TANG_DEEP, TANGERINE_TINT } from '@/constants/theme';

const DIVIDER        = 'rgba(31,26,23,0.06)';
const BORDER         = 'rgba(31,26,23,0.10)';

export default function ProfileScreen() {
  const router = useRouter();
  const { openUser } = useUserSheet();
  const { logout, deleteAccount, updateAuthUser } = useAuth();
  const { currentUser, users, getMyItems, getFriendItems, items, searchNotifications, updateSearchNotification, deleteSearchNotification } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [friendsExpanded, setFriendsExpanded] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const handleLogout = () => {
    const doLogout = () => logout();
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out of Yoink It?')) doLogout();
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: doLogout },
      ]);
    }
  };

  const handleDeleteAccount = () => {
    const msg = 'This permanently deletes your account and all your listings. This cannot be undone.';
    const doDelete = async () => {
      try {
        await deleteAccount();
      } catch {
        const errMsg = 'Something went wrong deleting your account. Please try again.';
        if (Platform.OS === 'web') window.alert(errMsg);
        else Alert.alert('Error', errMsg);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete your account?\n\n${msg}`)) doDelete();
      return;
    }
    Alert.alert('Delete Account', msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => Alert.alert('Are you sure?', 'Your account and listings will be permanently deleted.', [
          { text: 'Keep My Account', style: 'cancel' },
          { text: 'Delete Forever', style: 'destructive', onPress: doDelete },
        ]),
      },
    ]);
  };

  const myItems = getMyItems();
  const visibleCountByFriend = new Map<string, number>();
  for (const i of getFriendItems()) {
    visibleCountByFriend.set(i.donorId, (visibleCountByFriend.get(i.donorId) ?? 0) + 1);
  }
  const friendList = users
    .filter(u => currentUser.friends.includes(u.id))
    .sort((a, b) => {
      const lastName = (n: string) => n.trim().split(' ').slice(-1)[0] ?? n;
      return lastName(a.name).localeCompare(lastName(b.name));
    });

  const removeFriend = (friendId: string) => {
    const activeBorrow = items.find(
      i => i.donorId === friendId &&
           i.borrowedBy === currentUser.id &&
           (i.status === 'borrowed' || i.status === 'pending_return')
    );
    if (activeBorrow) {
      const msg = `You're currently borrowing "${activeBorrow.title}" from this person. Return it before removing them as a friend.`;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Item Still Borrowed', msg);
      }
      return;
    }

    setPendingRemoveId(friendId);
  };

  const confirmRemoveFriend = async () => {
    const id = pendingRemoveId;
    setPendingRemoveId(null);
    if (id) await updateAuthUser({ friends: currentUser.friends.filter(f => f !== id) });
  };
  const pendingRemoveName = pendingRemoveId ? (users.find(u => u.id === pendingRemoveId)?.name ?? 'this person') : '';

  const stats = [
    { label: 'Listed',         value: myItems.length,                                                                    icon: 'gift'        as const, color: TANGERINE, filter: 'listed'  as const },
    { label: 'Active',         value: myItems.filter(i => i.status === 'available' || i.status === 'claimed').length,    icon: 'check-circle' as const, color: SAGE,      filter: 'active'  as const },
    { label: 'Claimed by You', value: items.filter(i => i.claimedBy === currentUser.id && (i.status === 'claimed' || i.status === 'pending_pickup')).length, icon: 'hand-o-right' as const, color: BUTTER,    filter: 'claimed' as const },
  ];

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatarSection}>
        <Pressable onPress={() => router.push('/edit-profile')} style={styles.avatarWrap}>
          {currentUser.profilePhoto ? (
            <Image source={{ uri: currentUser.profilePhoto }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {currentUser.name.split(' ').map(n => n[0]).join('')}
              </Text>
            </View>
          )}
          <View style={styles.editBadge}>
            <FontAwesome name="pencil" size={11} color={CREAM} />
          </View>
        </Pressable>
        <Text style={styles.name}>{currentUser.name}</Text>
        {currentUser.phone ? (
          <Text style={styles.meta}>
            {currentUser.phone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '$1 ($2) $3-$4')}
          </Text>
        ) : currentUser.email ? (
          <Text style={styles.meta}>{currentUser.email}</Text>
        ) : null}
        {currentUser.defaultAddress ? (
          <View style={styles.addressRow}>
            <FontAwesome name="map-marker" size={12} color={MUTE} style={{ marginRight: 5 }} />
            <Text style={styles.addressText} numberOfLines={1}>{currentUser.defaultAddress}</Text>
          </View>
        ) : null}
        <View style={styles.profileActions}>
          <Pressable style={({ pressed }) => [styles.editProfileBtn, pressed && { opacity: 0.7 }]} onPress={() => router.push('/edit-profile')}>
            <FontAwesome name="pencil" size={12} color={TANGERINE} style={{ marginRight: 6 }} />
            <Text style={styles.editProfileBtnText}>Edit Profile</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]} onPress={handleLogout}>
            <FontAwesome name="sign-out" size={12} color={MUTE} style={{ marginRight: 6 }} />
            <Text style={styles.logoutBtnText}>Sign Out</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statsRow}>
        {stats.map(stat => (
          <Pressable
            key={stat.label}
            style={({ pressed }) => [styles.statCard, pressed && styles.statCardPressed]}
            onPress={() => stat.filter === 'claimed'
              ? router.push({ pathname: '/(tabs)/my-items', params: { view: 'friends' } })
              : router.push({ pathname: '/items-list', params: { filter: stat.filter } })}
          >
            <FontAwesome name={stat.icon} size={20} color={stat.color} />
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <FontAwesome name="chevron-right" size={9} color={BORDER} style={styles.statChevron} />
          </Pressable>
        ))}
      </View>

      <View style={[styles.section, { padding: 0, overflow: 'hidden' }]}>
        <Pressable
          style={({ pressed }) => [styles.friendsCardHeader, pressed && { opacity: 0.75 }]}
          onPress={() => setFriendsExpanded(e => !e)}
        >
          <FontAwesome name="users" size={14} color={TANGERINE} style={{ marginRight: 8 }} />
          <Text style={styles.friendsCardTitle}>{friendList.length} Friend{friendList.length !== 1 ? 's' : ''}</Text>
          <FontAwesome
            name={friendsExpanded ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={MUTE}
            style={{ marginLeft: 6 }}
          />
          <View style={{ flex: 1 }} />
          <Pressable
            style={({ pressed }) => [styles.addFriendsBtn, { marginRight: 8 }, pressed && { opacity: 0.7 }]}
            onPress={() => openSms('', inviteMessage(currentUser.name))}
            accessibilityRole="button"
            accessibilityLabel="Invite a friend by text"
          >
            <FontAwesome name="comment" size={12} color={TANGERINE} style={{ marginRight: 5 }} />
            <Text style={styles.addFriendsBtnText}>Invite</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.addFriendsBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/add-friends')}
          >
            <FontAwesome name="user-plus" size={12} color={TANGERINE} style={{ marginRight: 5 }} />
            <Text style={styles.addFriendsBtnText}>Add</Text>
          </Pressable>
        </Pressable>

        {friendsExpanded && (
          friendList.length === 0 ? (
            <View style={styles.friendsExpandedBody}>
              <Text style={[styles.empty, { marginBottom: 12 }]}>No friends yet.</Text>
              <Pressable
                style={({ pressed }) => [styles.addFriendsCTA, pressed && { opacity: 0.85 }]}
                onPress={() => router.push('/add-friends')}
              >
                <FontAwesome name="user-plus" size={14} color={CREAM} style={{ marginRight: 8 }} />
                <Text style={styles.addFriendsCTAText}>Add Friends from Contacts</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              style={[styles.friendsExpandedBody, friendList.length > 5 ? styles.friendScroll : undefined]}
              scrollEnabled={friendList.length > 5}
              showsVerticalScrollIndicator={friendList.length > 5}
              nestedScrollEnabled
            >
              {friendList.map(friend => (
                <View key={friend.id} style={styles.friendRow}>
                  <Pressable
                    style={({ pressed }) => [styles.friendRowMain, pressed && { opacity: 0.6 }]}
                    onPress={() => openUser(friend.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Text ${friend.name} or see their listings`}
                  >
                    <View style={styles.friendAvatar}>
                      <Text style={styles.friendAvatarText}>
                        {friend.name.split(' ').map(n => n[0]).join('')}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.friendName}>{friend.name}</Text>
                      {friend.phone ? (
                        <Text style={styles.friendMeta}>
                          {friend.phone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '($2) $3-$4')}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.friendItemCount}>
                      <Text style={styles.friendItemCountText}>
                        {visibleCountByFriend.get(friend.id) ?? 0} items
                      </Text>
                    </View>
                    <FontAwesome name="chevron-right" size={11} color={MUTE} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.removeFriendBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => removeFriend(friend.id)}
                    hitSlop={8}
                  >
                    <FontAwesome name="times" size={13} color={MUTE} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )
        )}
      </View>

      {/* Search Alerts */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <FontAwesome name="bell" size={15} color={TANGERINE} style={{ marginRight: 8 }} />
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Search Alerts</Text>
        </View>
        {searchNotifications.length === 0 ? (
          <Text style={styles.empty}>
            No alerts yet. Search for an item and tap the{' '}
            <FontAwesome name="bell" size={12} color={MUTE} /> bell to get a text when one is posted.
          </Text>
        ) : (
          searchNotifications.map(notif => (
            <View key={notif.id} style={styles.alertRow}>
              {editingId === notif.id ? (
                <TextInput
                  style={styles.alertEditInput}
                  value={editingText}
                  onChangeText={setEditingText}
                  autoFocus
                  onSubmitEditing={() => {
                    if (editingText.trim()) updateSearchNotification(notif.id, editingText.trim());
                    setEditingId(null);
                  }}
                  returnKeyType="done"
                />
              ) : (
                <>
                  <FontAwesome name="bell" size={13} color={TANGERINE} style={styles.alertIcon} />
                  <Text style={styles.alertKeyword}>{notif.keyword}</Text>
                </>
              )}
              <View style={styles.alertActions}>
                {editingId === notif.id ? (
                  <Pressable
                    style={styles.alertSaveBtn}
                    onPress={() => {
                      if (editingText.trim()) updateSearchNotification(notif.id, editingText.trim());
                      setEditingId(null);
                    }}
                  >
                    <Text style={styles.alertSaveBtnText}>Save</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.alertIconBtn}
                    onPress={() => { setEditingId(notif.id); setEditingText(notif.keyword); }}
                    hitSlop={8}
                  >
                    <FontAwesome name="pencil" size={14} color={MUTE} />
                  </Pressable>
                )}
                <Pressable
                  style={styles.alertIconBtn}
                  hitSlop={8}
                  onPress={() => deleteSearchNotification(notif.id)}
                >
                  <FontAwesome name="trash" size={14} color={TANG_DEEP} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How It Works</Text>
        {[
          { icon: 'camera'    as const, title: 'List Items', desc: 'Take photos and create listings for items you no longer need.' },
          { icon: 'search'    as const, title: 'Browse',     desc: 'See what your friends are giving away and claim what you want.' },
          { icon: 'clock-o'   as const, title: 'Pick Up',    desc: "Coordinate pickup before the donor's disposal deadline." },
          { icon: 'heart'     as const, title: 'Give Back',  desc: 'Unclaimed items go to the charity the donor chooses.' },
        ].map(tip => (
          <View key={tip.title} style={styles.tipRow}>
            <View style={styles.tipIcon}>
              <FontAwesome name={tip.icon} size={16} color={TANGERINE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tipTitle}>{tip.title}</Text>
              <Text style={styles.tipDesc}>{tip.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable style={({ pressed }) => [styles.deleteAccountBtn, pressed && { opacity: 0.7 }]} onPress={handleDeleteAccount}>
        <Text style={styles.deleteAccountText}>Delete Account</Text>
      </Pressable>
    </ScrollView>

    <ConfirmSheet
      visible={!!pendingRemoveId}
      title="Remove Friend"
      message={`Remove ${pendingRemoveName} from your friends? You'll stop seeing their listings.`}
      confirmLabel="Remove"
      cancelLabel="Cancel"
      destructive
      onConfirm={confirmRemoveFriend}
      onCancel={() => setPendingRemoveId(null)}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  content: { paddingBottom: 40 },

  // Avatar / header
  avatarSection: { alignItems: 'center', paddingTop: 32, paddingBottom: 24, backgroundColor: CREAM, gap: 4 },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: TANGERINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: CREAM },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: INK_2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: CREAM,
  },
  name: { fontSize: 22, fontWeight: '700', color: INK },
  meta: { fontSize: 14, color: MUTE },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, maxWidth: 260 },
  addressText: { fontSize: 13, color: MUTE, flex: 1 },
  profileActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: TANGERINE,
  },
  editProfileBtnText: { fontSize: 13, color: TANGERINE, fontWeight: '600' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
  },
  logoutBtnText: { fontSize: 13, color: MUTE, fontWeight: '600' },
  deleteAccountBtn: { alignSelf: 'center', marginTop: 8, paddingVertical: 10, paddingHorizontal: 16 },
  deleteAccountText: { fontSize: 13, fontWeight: '600', color: TANG_DEEP },

  // Stats
  statsRow: { flexDirection: 'row', margin: 16, gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: CREAM_2,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statCardPressed: { opacity: 0.7 },
  statChevron: { marginTop: 4 },
  statValue: { fontSize: 22, fontWeight: '800', color: INK, marginTop: 6 },
  statLabel: { fontSize: 11, color: MUTE, marginTop: 2, textAlign: 'center' },

  // Sections
  section: {
    backgroundColor: CREAM_2,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: INK, marginBottom: 12 },

  // Friends collapsible card
  friendsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  friendsCardTitle: { fontSize: 15, fontWeight: '700', color: INK },
  friendsExpandedBody: {
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  addFriendsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: TANGERINE,
  },
  addFriendsBtnText: { fontSize: 12, color: TANGERINE, fontWeight: '600' },
  addFriendsCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TANGERINE,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  addFriendsCTAText: { fontSize: 14, color: CREAM, fontWeight: '700' },
  friendScroll: { maxHeight: 285 },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    gap: 12,
  },
  friendRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CREAM_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarText: { fontSize: 14, fontWeight: '700', color: INK_2 },
  friendName: { fontSize: 14, fontWeight: '600', color: INK },
  friendMeta: { fontSize: 12, color: MUTE },
  friendItemCount: {
    backgroundColor: TANGERINE_TINT,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  friendItemCountText: { fontSize: 12, color: TANGERINE, fontWeight: '600' },
  removeFriendBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CREAM_2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    flexShrink: 0,
  },

  // Search alerts
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    gap: 10,
  },
  alertIcon: { width: 18 },
  alertKeyword: { flex: 1, fontSize: 14, color: INK, fontWeight: '500' },
  alertEditInput: {
    flex: 1,
    fontSize: 14,
    color: INK,
    borderWidth: 1.5,
    borderColor: TANGERINE,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: CREAM,
  },
  alertActions: { flexDirection: 'row', gap: 12 },
  alertIconBtn: { padding: 4 },
  alertSaveBtn: {
    backgroundColor: TANGERINE,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  alertSaveBtnText: { fontSize: 13, fontWeight: '700', color: CREAM },

  // How it works
  empty: { color: MUTE, fontSize: 14 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: TANGERINE_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: { fontSize: 14, fontWeight: '700', color: INK },
  tipDesc: { fontSize: 13, color: MUTE, marginTop: 2 },
});
