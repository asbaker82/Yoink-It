import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useApp } from '@/store/AppContext';
import { recordInvite } from '@/store/db';
import type { User } from '@/store/types';
import { normalizeUsPhone, openSms } from '@/utils/sms';
import { inviteMessage } from '@/utils/invite';
import {
  BORDER, CREAM, CREAM_2, FAINT, INK, INK_2, MUTE, TANGERINE, TANGERINE_TINT, WHITE,
} from '@/constants/theme';

type Contact = { name: string; phone: string };
type Row =
  | { kind: 'request'; user: User }
  | { kind: 'user'; user: User; inContacts: boolean }
  | { kind: 'invite'; contact: Contact }
  | { kind: 'inviteAny' };
type Section = { key: string; title: string; subtitle?: string; data: Row[] };

interface Props {
  /** Footer button label, e.g. "Done" or "Continue". */
  doneLabel: string;
  onDone: () => void;
}

/**
 * One place to manage friends: answer requests, add people on Yoink It (they approve),
 * and invite contacts who aren't here yet by text.
 */
export default function FriendFinder({ doneLabel, onDone }: Props) {
  const {
    currentUser, users, incomingRequests, outgoingRequests,
    sendFriendRequest, acceptFriendRequest, declineFriendRequest, cancelFriendRequest,
  } = useApp();

  const [query, setQuery] = useState('');
  const [contactPhones, setContactPhones] = useState<Set<string>>(new Set());
  const [inviteContacts, setInviteContacts] = useState<Contact[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [loadingContacts, setLoadingContacts] = useState(Platform.OS !== 'web');

  // Read phone contacts once (native only)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    (async () => {
      try {
        const Contacts = await import('expo-contacts');
        const { status } = await Contacts.requestPermissionsAsync();
        if (status !== 'granted') return;
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        });
        const phones = new Set<string>();
        const byPhone = new Map<string, Contact>();
        for (const c of data) {
          for (const p of c.phoneNumbers ?? []) {
            const phone = normalizeUsPhone(p.number ?? '');
            if (!phone) continue;
            phones.add(phone);
            if (c.name && !byPhone.has(phone)) byPhone.set(phone, { name: c.name, phone });
          }
        }
        if (cancelled) return;
        setContactPhones(phones);
        setInviteContacts([...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        // Contacts unavailable — the list still shows everyone on Yoink It
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (name: string) => !q || name.toLowerCase().includes(q);
    const friendIds = new Set(currentUser.friends);
    const incoming = new Set(incomingRequests);
    const appPhones = new Set(users.map(u => u.phone).filter(Boolean) as string[]);

    const requestRows: Row[] = incomingRequests
      .map(id => users.find(u => u.id === id))
      .filter((u): u is User => !!u && matches(u.name))
      .map(user => ({ kind: 'request', user }));

    const candidates = users
      .filter(u => u.id !== currentUser.id && !friendIds.has(u.id) && !incoming.has(u.id) && matches(u.name))
      .map(u => ({ user: u, inContacts: !!u.phone && contactPhones.has(u.phone) }))
      .sort((a, b) => Number(b.inContacts) - Number(a.inContacts) || a.user.name.localeCompare(b.user.name));
    const userRows: Row[] = candidates.map(c => ({ kind: 'user', ...c }));

    const inviteRows: Row[] = inviteContacts
      .filter(c => !appPhones.has(c.phone) && c.phone !== currentUser.phone && matches(c.name))
      .map(contact => ({ kind: 'invite', contact }));

    const out: Section[] = [];
    if (requestRows.length) out.push({ key: 'requests', title: 'Friend requests', data: requestRows });
    if (userRows.length) out.push({
      key: 'users', title: 'On Yoink It',
      subtitle: 'They’ll get a request to approve.', data: userRows,
    });
    out.push({
      key: 'invite', title: 'Invite to Yoink It',
      subtitle: inviteRows.length ? 'Contacts who aren’t here yet. Your request will be waiting when they sign up.' : undefined,
      data: [...inviteRows, { kind: 'inviteAny' }],
    });
    return out;
  }, [query, users, currentUser, incomingRequests, contactPhones, inviteContacts]);

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy.has(key)) return;
    setBusy(prev => new Set(prev).add(key));
    try { await action(); } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const invite = (contact?: Contact) => {
    if (contact) {
      recordInvite(currentUser.id, contact.phone);
      setInvited(prev => new Set(prev).add(contact.phone));
    }
    openSms(contact?.phone ?? '', inviteMessage(currentUser.name, contact?.name));
  };

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const renderRow = ({ item: row }: { item: Row }) => {
    if (row.kind === 'inviteAny') {
      return (
        <Pressable style={({ pressed }) => [styles.inviteAny, pressed && styles.pressed]} onPress={() => invite()}>
          <FontAwesome name="comment" size={14} color={TANGERINE} />
          <Text style={styles.inviteAnyText}>Not in the list? Invite someone by text</Text>
          <FontAwesome name="chevron-right" size={11} color={FAINT} />
        </Pressable>
      );
    }

    const name = row.kind === 'invite' ? row.contact.name : row.user.name;
    const sub = row.kind === 'invite'
      ? row.contact.phone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '($2) $3-$4')
      : row.kind === 'request' ? 'Wants to be friends'
      : row.inContacts ? 'In your contacts' : undefined;

    let actions: React.ReactNode;
    if (row.kind === 'request') {
      const id = row.user.id;
      actions = (
        <View style={styles.actions}>
          <Pressable style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
            onPress={() => run(id, () => acceptFriendRequest(id))} disabled={busy.has(id)}>
            <Text style={[styles.btnText, styles.btnTextPrimary]}>Accept</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.btn, styles.btnQuiet, pressed && styles.pressed]}
            onPress={() => run(id, () => declineFriendRequest(id))} disabled={busy.has(id)}>
            <Text style={[styles.btnText, styles.btnTextQuiet]}>Decline</Text>
          </Pressable>
        </View>
      );
    } else if (row.kind === 'user') {
      const id = row.user.id;
      const requested = outgoingRequests.includes(id);
      actions = (
        <Pressable
          style={({ pressed }) => [styles.btn, requested ? styles.btnQuiet : styles.btnOutline, pressed && styles.pressed]}
          onPress={() => run(id, () => (requested ? cancelFriendRequest(id) : sendFriendRequest(id)))}
          disabled={busy.has(id)}
          accessibilityLabel={requested ? `Cancel request to ${row.user.name}` : `Add ${row.user.name}`}
        >
          {busy.has(id)
            ? <ActivityIndicator size="small" color={TANGERINE} />
            : <Text style={[styles.btnText, requested ? styles.btnTextQuiet : styles.btnTextOutline]}>
                {requested ? 'Requested' : 'Add'}
              </Text>}
        </Pressable>
      );
    } else {
      const done = invited.has(row.contact.phone);
      actions = (
        <Pressable style={({ pressed }) => [styles.btn, done ? styles.btnQuiet : styles.btnOutline, pressed && styles.pressed]}
          onPress={() => invite(row.contact)}>
          <Text style={[styles.btnText, done ? styles.btnTextQuiet : styles.btnTextOutline]}>
            {done ? 'Invited' : 'Invite'}
          </Text>
        </Pressable>
      );
    }

    return (
      <View style={styles.row}>
        <View style={[styles.avatar, row.kind === 'request' && { backgroundColor: TANGERINE_TINT }]}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        {actions}
      </View>
    );
  };

  const keyFor = (row: Row) =>
    row.kind === 'invite' ? `invite-${row.contact.phone}`
      : row.kind === 'inviteAny' ? 'invite-any'
      : `${row.kind}-${row.user.id}`;

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <FontAwesome name="search" size={14} color={FAINT} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name"
          placeholderTextColor={FAINT}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={keyFor}
        renderItem={renderRow}
        extraData={[outgoingRequests, invited, busy]}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, section.key === 'requests' && { color: TANGERINE }]}>
              {section.title}
            </Text>
            {section.subtitle ? <Text style={styles.sectionSubtitle}>{section.subtitle}</Text> : null}
          </View>
        )}
        ListFooterComponent={loadingContacts
          ? <ActivityIndicator style={{ marginTop: 16 }} color={TANGERINE} />
          : null}
      />

      <View style={styles.footer}>
        <Pressable style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]} onPress={onDone}>
          <Text style={styles.doneBtnText}>{doneLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
  },
  search: { flex: 1, height: 42, fontSize: 15, color: INK },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  sectionHeader: { paddingTop: 18, paddingBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: MUTE, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionSubtitle: { fontSize: 12, color: MUTE, marginTop: 3, lineHeight: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: CREAM_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: INK_2 },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: INK },
  sub: { fontSize: 12, color: MUTE, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6 },
  btn: {
    minWidth: 76,
    height: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: TANGERINE },
  btnOutline: { borderWidth: 1.5, borderColor: TANGERINE, backgroundColor: WHITE },
  btnQuiet: { backgroundColor: CREAM_2 },
  btnText: { fontSize: 13, fontWeight: '700' },
  btnTextPrimary: { color: CREAM },
  btnTextOutline: { color: TANGERINE },
  btnTextQuiet: { color: MUTE },
  inviteAny: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: BORDER,
  },
  inviteAnyText: { flex: 1, fontSize: 14, fontWeight: '600', color: INK_2 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: WHITE },
  doneBtn: {
    backgroundColor: TANGERINE,
    borderRadius: 999,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: CREAM },
  pressed: { opacity: 0.75 },
});
