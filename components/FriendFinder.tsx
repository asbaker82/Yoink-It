import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useApp } from '@/store/AppContext';
import { recordInvite, matchContacts, findUserByPhone } from '@/store/db';
import type { User } from '@/store/types';
import { normalizeUsPhone, openSms } from '@/utils/sms';
import { inviteMessage } from '@/utils/invite';
import ContactPicker, { type PickedContact } from '@/components/ContactPicker';
import {
  BORDER, CREAM, CREAM_2, FAINT, INK, INK_2, MUTE, TANGERINE, TANGERINE_TINT, WHITE,
} from '@/constants/theme';

/** `typed`: a number typed into search, not a saved contact (so no name to greet). */
type Contact = { name: string; phone: string; typed?: boolean };
type Row =
  | { kind: 'request'; user: User }
  | { kind: 'user'; user: User; inContacts: boolean }
  | { kind: 'invite'; contact: Contact }
  | { kind: 'inviteAny' }
  | { kind: 'pickContacts' }
  | { kind: 'note'; text: string };
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
  // Result of typing a full phone number into the search box.
  const [phoneHit, setPhoneHit] = useState<{ phone: string; user: User | null; loading: boolean } | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // Contact picker: only the contacts the user selects are checked against Yoink It.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [toInvite, setToInvite] = useState<Contact[]>([]);       // picked, not on Yoink It
  const [picked, setPicked] = useState<User[]>([]);               // picked, on Yoink It (keeps names handy)
  const [summary, setSummary] = useState('');

  const connectWith = async (chosen: PickedContact[]) => {
    setPickerOpen(false);
    if (chosen.length === 0) return;
    setConnecting(true);
    setSummary('');
    try {
      const found = await matchContacts(chosen.map(c => c.phone));
      const friendIds = new Set(currentUser.friends);
      let sent = 0, accepted = 0, already = 0;
      for (const u of found) {
        if (friendIds.has(u.id) || outgoingRequests.includes(u.id)) { already++; continue; }
        if (incomingRequests.includes(u.id)) { await acceptFriendRequest(u.id); accepted++; }
        else { await sendFriendRequest(u.id); sent++; }
      }
      const onApp = new Set(found.map(u => u.phone));
      const notOnApp = chosen.filter(c => !onApp.has(c.phone));
      setPicked(prev => [...prev.filter(p => !found.some(f => f.id === p.id)), ...found]);
      setToInvite(prev => [...prev.filter(p => !notOnApp.some(n => n.phone === p.phone)), ...notOnApp]);

      const parts: string[] = [];
      if (sent) parts.push(`Sent ${sent} friend request${sent === 1 ? '' : 's'}.`);
      if (accepted) parts.push(`You’re now friends with ${accepted} ${accepted === 1 ? 'person' : 'people'} who had already asked.`);
      if (already) parts.push(`${already} already connected or requested.`);
      if (notOnApp.length) parts.push(`${notOnApp.length} ${notOnApp.length === 1 ? 'isn’t' : 'aren’t'} on Yoink It yet. Invite them below.`);
      setSummary(parts.join(' '));
    } catch (e) {
      setSummary(`Couldn’t check those contacts: ${e instanceof Error ? e.message : 'please try again'}.`);
    } finally {
      setConnecting(false);
    }
  };

  // A full phone number in the search box → look that one person up on the server.
  const searchedPhone = normalizeUsPhone(query);
  useEffect(() => {
    if (!searchedPhone || searchedPhone === currentUser.phone) { setPhoneHit(null); return; }
    let cancelled = false;
    setPhoneHit({ phone: searchedPhone, user: null, loading: true });
    findUserByPhone(searchedPhone)
      .then(user => { if (!cancelled) setPhoneHit({ phone: searchedPhone, user, loading: false }); })
      .catch(() => { if (!cancelled) setPhoneHit({ phone: searchedPhone, user: null, loading: false }); });
    return () => { cancelled = true; };
  }, [searchedPhone]);

  const sections = useMemo<Section[]>(() => {
    const friendIds = new Set(currentUser.friends);
    const incoming = new Set(incomingRequests);
    const byId = new Map<string, User>();
    for (const u of [...users, ...picked]) byId.set(u.id, u);
    if (phoneHit?.user) byId.set(phoneHit.user.id, phoneHit.user);
    const requestRows: Row[] = incomingRequests
      .map(id => byId.get(id))
      .filter((u): u is User => !!u)
      .map(user => ({ kind: 'request', user }));

    // Typed a phone number: show just that person (or an invite for that number).
    if (searchedPhone && searchedPhone !== currentUser.phone) {
      const pretty = searchedPhone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '($2) $3-$4');
      let row: Row;
      if (!phoneHit || phoneHit.loading) row = { kind: 'note', text: 'Looking up that number…' };
      else if (!phoneHit.user) row = { kind: 'invite', contact: { name: pretty, phone: searchedPhone, typed: true } };
      else if (friendIds.has(phoneHit.user.id)) row = { kind: 'note', text: `${phoneHit.user.name} is already your friend.` };
      else if (incoming.has(phoneHit.user.id)) row = { kind: 'request', user: phoneHit.user };
      else row = { kind: 'user', user: phoneHit.user, inContacts: false };
      const title = phoneHit?.user ? 'On Yoink It' : phoneHit && !phoneHit.loading ? 'Not on Yoink It yet' : 'Phone number';
      return [{ key: 'phone', title, data: [row] }];
    }

    const q = query.trim().toLowerCase();
    const matches = (name: string) => !q || name.toLowerCase().includes(q);

    // Requests I've sent (tap Requested to cancel).
    const requestedRows: Row[] = outgoingRequests
      .map(id => byId.get(id))
      .filter((u): u is User => !!u && !friendIds.has(u.id) && matches(u.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(user => ({ kind: 'user', user, inContacts: false }));

    const inviteRows: Row[] = toInvite
      .filter(c => matches(c.name))
      .map(contact => ({ kind: 'invite', contact }));

    const out: Section[] = [];
    const myRequests = requestRows.filter(r => r.kind === 'request' && matches(r.user.name));
    if (myRequests.length) out.push({ key: 'requests', title: 'Friend requests', data: myRequests });
    out.push({
      key: 'add', title: 'Add friends',
      subtitle: Platform.OS === 'web'
        ? 'Enter a friend’s phone number above to find them.'
        : 'Pick people from your contacts, or type a phone number above.',
      data: Platform.OS === 'web' ? [] : [{ kind: 'pickContacts' }],
    });
    if (requestedRows.length) out.push({
      key: 'requested', title: 'Requested',
      subtitle: 'Waiting for them to approve.', data: requestedRows,
    });
    out.push({
      key: 'invite', title: 'Invite to Yoink It',
      subtitle: inviteRows.length
        ? 'Not on Yoink It yet. Your request will be waiting when they sign up.'
        : undefined,
      data: [...inviteRows, { kind: 'inviteAny' }],
    });
    return out;
  }, [query, searchedPhone, phoneHit, users, picked, toInvite, currentUser, incomingRequests, outgoingRequests]);

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
    openSms(contact?.phone ?? '', inviteMessage(currentUser.name, contact?.typed ? undefined : contact?.name));
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

    if (row.kind === 'note') {
      return <Text style={styles.note}>{row.text}</Text>;
    }

    if (row.kind === 'pickContacts') {
      return (
        <View>
          <Pressable
            style={({ pressed }) => [styles.pickBtn, pressed && styles.pressed]}
            onPress={() => setPickerOpen(true)}
            disabled={connecting}
          >
            {connecting
              ? <ActivityIndicator color={CREAM} />
              : <>
                  <FontAwesome name="address-book" size={15} color={CREAM} />
                  <Text style={styles.pickBtnText}>Choose from contacts</Text>
                </>}
          </Pressable>
          {summary ? <Text style={styles.summary}>{summary}</Text> : null}
        </View>
      );
    }

    const name = row.kind === 'invite' ? row.contact.name : row.user.name;
    const sub = row.kind === 'invite'
      ? (row.contact.typed ? 'Text them an invite' : row.contact.phone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '($2) $3-$4'))
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
      : row.kind === 'note' ? 'note'
      : row.kind === 'pickContacts' ? 'pick-contacts'
      : `${row.kind}-${row.user.id}`;

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <FontAwesome name="search" size={14} color={FAINT} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search or enter a phone number"
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
      />

      <ContactPicker
        visible={pickerOpen}
        excludePhones={currentUser.phone ? [currentUser.phone] : []}
        onCancel={() => setPickerOpen(false)}
        onConfirm={connectWith}
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
  note: { fontSize: 14, color: MUTE, paddingVertical: 12, paddingHorizontal: 4 },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 999,
    backgroundColor: TANGERINE,
  },
  pickBtnText: { fontSize: 15, fontWeight: '700', color: CREAM },
  summary: { fontSize: 13, color: INK_2, marginTop: 10, lineHeight: 18 },
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
