import React, { useState, useEffect } from 'react';
import {
  View, Text, SectionList, Pressable, StyleSheet,
  ActivityIndicator, Platform, Alert, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@/store/AuthContext';
import { useApp } from '@/store/AppContext';
import { User } from '@/store/types';
import { addFriendMutual, recordInvite } from '@/store/db';
import { normalizeUsPhone, openSms } from '@/utils/sms';
import { inviteMessage } from '@/utils/invite';
import { CREAM, CREAM_2, INK, INK_2, MUTE, PEACH, TANGERINE, TANGERINE_TINT, WHITE } from '@/constants/theme';

const DIVIDER   = 'rgba(31,26,23,0.06)';

type Section = { title: string; subtitle?: string; data: User[]; showPhone?: boolean };
type InviteContact = { name: string; phone: string };

export default function AddFriendsScreen() {
  const router = useRouter();
  const { authUser, updateAuthUser } = useAuth();
  const { users } = useApp();
  const [sections, setSections] = useState<Section[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [contactsPermission, setContactsPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [inviteContacts, setInviteContacts] = useState<InviteContact[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());

  useEffect(() => {
    buildSections();
  }, [users.length]);

  async function buildSections() {
    if (!authUser) { setLoading(false); return; }
    const existingFriends = new Set(authUser.friends);
    const allCandidates = users.filter(u => u.id !== authUser.id && !existingFriends.has(u.id));

    if (Platform.OS === 'web') {
      setSections([
        {
          title: 'People on Yoink It',
          subtitle: "Add contacts on your phone to see who's already here.",
          data: allCandidates,
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      const Contacts = await import('expo-contacts');
      const { status } = await Contacts.requestPermissionsAsync();
      setContactsPermission(status === 'granted' ? 'granted' : 'denied');

      if (status !== 'granted') {
        setSections([{
          title: 'People on Yoink It',
          subtitle: 'Allow contact access in Settings to see which friends are already here.',
          data: allCandidates,
          showPhone: false,
        }]);
        setLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      const contactPhones = new Set<string>();
      const appPhones = new Set(users.map(u => u.phone).filter(Boolean));
      const notOnApp = new Map<string, InviteContact>();
      for (const c of data) {
        for (const p of c.phoneNumbers ?? []) {
          const phone = normalizeUsPhone(p.number ?? '');
          if (!phone) continue;
          contactPhones.add(phone);
          if (!appPhones.has(phone) && phone !== authUser.phone && c.name && !notOnApp.has(phone)) {
            notOnApp.set(phone, { name: c.name, phone });
          }
        }
      }
      setInviteContacts([...notOnApp.values()].sort((a, b) => a.name.localeCompare(b.name)));

      const fromContacts = allCandidates.filter(u => u.phone && contactPhones.has(u.phone));
      const others       = allCandidates.filter(u => !u.phone || !contactPhones.has(u.phone));

      const built: Section[] = [];
      if (fromContacts.length > 0) {
        built.push({
          title: 'From Your Contacts',
          subtitle: "These people are in your phone's contacts and already on Yoink It.",
          data: fromContacts,
          showPhone: true,
        });
      }
      if (others.length > 0) {
        built.push({
          title: 'Others on Yoink It',
          subtitle: fromContacts.length > 0 ? 'Other app users not in your contacts.' : undefined,
          data: others,
          showPhone: false,
        });
      }
      if (built.length === 0) {
        built.push({ title: 'No suggestions', data: [] });
      }
      setSections(built);
    } catch {
      setSections([{ title: 'People on Yoink It', data: allCandidates }]);
    } finally {
      setLoading(false);
    }
  }

  const toggleFriend = (userId: string) => {
    setAdded(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSave = async () => {
    if (added.size > 0 && authUser) {
      const existing = new Set(authUser.friends);
      added.forEach(id => existing.add(id));
      await updateAuthUser({ friends: Array.from(existing) });
      await Promise.all(Array.from(added).map(id => addFriendMutual(id, authUser.id)));
    }
    router.back();
  };

  const allUsers = sections.flatMap(s => s.data);

  // Opens the native Messages app with an invite. With a contact, the number is
  // remembered so we're auto-friended when they sign up with it.
  const sendInvite = (contact?: InviteContact) => {
    if (!authUser) return;
    if (contact) {
      recordInvite(authUser.id, contact.phone);
      setInvited(prev => new Set(prev).add(contact.phone));
    }
    openSms(contact?.phone ?? '', inviteMessage(authUser.name, contact?.name));
  };

  const inviteHeader = (
    <View style={styles.inviteCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.inviteTitle}>Invite a friend</Text>
        <Text style={styles.inviteSub}>Send a text from your phone. Pick who in Messages.</Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.inviteBtn, pressed && styles.btnPressed]}
        onPress={() => sendInvite()}
        accessibilityRole="button"
      >
        <FontAwesome name="comment" size={14} color={CREAM} />
        <Text style={styles.inviteBtnText}>Invite</Text>
      </Pressable>
    </View>
  );

  const inviteList = inviteContacts.length > 0 ? (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Invite to Yoink It</Text>
        <Text style={styles.sectionSubtitle}>
          Contacts who aren't here yet. When they sign up with this number, you'll be friends automatically.
        </Text>
      </View>
      {inviteContacts.map(c => {
        const done = invited.has(c.phone);
        return (
          <View key={c.phone} style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.phone}>{c.phone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '($2) $3-$4')}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.addBtn, done && styles.addBtnAdded, pressed && styles.addBtnPressed]}
              onPress={() => sendInvite(c)}
            >
              <FontAwesome name={done ? 'check' : 'comment'} size={13} color={done ? CREAM : TANGERINE} />
              <Text style={[styles.addBtnText, done && styles.addBtnTextAdded]}>{done ? 'Invited' : 'Invite'}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={TANGERINE} />
          <Text style={styles.loadingText}>
            {Platform.OS !== 'web' ? 'Reading your contacts…' : 'Loading…'}
          </Text>
        </View>
      ) : allUsers.length === 0 && inviteContacts.length === 0 ? (
        <View style={styles.emptyState}>
          <FontAwesome name="users" size={40} color={CREAM_2} />
          <Text style={styles.emptyTitle}>No new friends to add</Text>
          <Text style={styles.emptySubtitle}>
            {contactsPermission === 'denied'
              ? 'Allow contact access in Settings so we can find your friends.'
              : 'Invite your friends to join Yoink It!'}
          </Text>
          {contactsPermission === 'denied' && (
            <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.settingsBtnText}>Open Settings</Text>
            </Pressable>
          )}
          <View style={{ alignSelf: 'stretch', marginTop: 24 }}>{inviteHeader}</View>
        </View>
      ) : (
        <SectionList
          sections={sections.filter(s => s.data.length > 0)}
          ListHeaderComponent={inviteHeader}
          ListFooterComponent={inviteList}
          keyExtractor={item => item.id}
          extraData={added}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.subtitle ? (
                <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
              ) : null}
              {contactsPermission === 'denied' && section.title === 'People on Yoink It' && (
                <Pressable onPress={() => Linking.openSettings()} style={styles.settingsLink}>
                  <Text style={styles.settingsLinkText}>Open Settings →</Text>
                </Pressable>
              )}
            </View>
          )}
          renderItem={({ item, section }) => {
            const isAdded = added.has(item.id);
            const showPhone = (section as Section).showPhone ?? (Platform.OS === 'web');
            return (
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.name.split(' ').map((n: string) => n[0]).join('')}
                  </Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{item.name}</Text>
                  {showPhone && item.phone && (
                    <Text style={styles.phone}>
                      {item.phone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '$1 ($2) $3-$4')}
                    </Text>
                  )}
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.addBtn,
                    isAdded && styles.addBtnAdded,
                    pressed && styles.addBtnPressed,
                  ]}
                  onPress={() => toggleFriend(item.id)}
                >
                  <FontAwesome name={isAdded ? 'check' : 'plus'} size={14} color={isAdded ? CREAM : TANGERINE} />
                  <Text style={[styles.addBtnText, isAdded && styles.addBtnTextAdded]}>
                    {isAdded ? 'Added' : 'Add'}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.btnPressed]}
          onPress={handleSave}
        >
          <Text style={styles.saveBtnText}>
            {added.size > 0 ? `Add ${added.size} Friend${added.size !== 1 ? 's' : ''}` : 'Done'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: MUTE },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  sectionHeader: { paddingTop: 16, paddingBottom: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTE,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSubtitle: { fontSize: 12, color: MUTE, marginTop: 3, lineHeight: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: CREAM_2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: INK_2 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: INK },
  phone: { fontSize: 13, color: MUTE, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: TANGERINE,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: WHITE,
    flexShrink: 0,
  },
  addBtnAdded: { backgroundColor: TANGERINE, borderColor: TANGERINE },
  addBtnPressed: { opacity: 0.75 },
  addBtnText: { fontSize: 13, fontWeight: '600', color: TANGERINE },
  addBtnTextAdded: { color: CREAM },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: INK_2, textAlign: 'center', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: MUTE, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: DIVIDER, backgroundColor: WHITE },
  saveBtn: {
    backgroundColor: TANGERINE,
    borderRadius: 999,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: CREAM },
  btnPressed: { opacity: 0.75 },
  settingsBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: TANGERINE,
  },
  settingsBtnText: { fontSize: 14, fontWeight: '700', color: CREAM },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: TANGERINE_TINT,
    borderWidth: 1,
    borderColor: PEACH,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
  },
  inviteTitle: { fontSize: 15, fontWeight: '800', color: INK },
  inviteSub: { fontSize: 12, color: MUTE, marginTop: 2, lineHeight: 16 },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TANGERINE,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  inviteBtnText: { fontSize: 14, fontWeight: '700', color: CREAM },
  settingsLink: { marginTop: 6 },
  settingsLinkText: { fontSize: 12, fontWeight: '700', color: TANGERINE },
});
