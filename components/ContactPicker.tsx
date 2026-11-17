import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { normalizeUsPhone } from '@/utils/sms';
import {
  BORDER, CREAM, CREAM_2, FAINT, INK, INK_2, MUTE, TANGERINE, WHITE,
} from '@/constants/theme';

export type PickedContact = { name: string; phone: string };
type Entry = PickedContact & { key: string; label?: string };

interface Props {
  visible: boolean;
  /** Numbers to leave out (e.g. my own). */
  excludePhones?: string[];
  onCancel: () => void;
  onConfirm: (picked: PickedContact[]) => void;
}

const pretty = (phone: string) => phone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '($2) $3-$4');

/**
 * Multi-select list of the phone's contacts. Contacts are read on the device only;
 * nothing leaves the phone until the user confirms their selection.
 */
export default function ContactPicker({ visible, excludePhones = [], onCancel, onConfirm }: Props) {
  const [status, setStatus] = useState<'loading' | 'denied' | 'error' | 'ready'>('loading');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set());
    setQuery('');
    let cancelled = false;
    (async () => {
      setStatus('loading');
      try {
        const Contacts = await import('expo-contacts');
        const { status: perm } = await Contacts.requestPermissionsAsync();
        if (perm !== 'granted') { if (!cancelled) setStatus('denied'); return; }
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
          sort: Contacts.SortTypes.FirstName,
        });
        const skip = new Set(excludePhones);
        const seen = new Set<string>();
        const list: Entry[] = [];
        for (const c of data) {
          const phones = (c.phoneNumbers ?? [])
            .map(p => ({ phone: normalizeUsPhone(p.number ?? ''), label: p.label }))
            .filter((p): p is { phone: string; label: string | undefined } => !!p.phone && !skip.has(p.phone) && !seen.has(p.phone));
          for (const p of phones) {
            seen.add(p.phone);
            list.push({
              key: p.phone,
              name: c.name || pretty(p.phone),
              phone: p.phone,
              label: phones.length > 1 ? p.label : undefined,
            });
          }
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) { setEntries(list); setStatus('ready'); }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    if (!q) return entries;
    return entries.filter(e => e.name.toLowerCase().includes(q) || (digits.length >= 3 && e.phone.includes(digits)));
  }, [entries, query]);

  const toggle = (key: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const confirm = () => onConfirm(entries.filter(e => selected.has(e.key)).map(({ name, phone }) => ({ name, phone })));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={10}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Choose contacts</Text>
          <View style={{ width: 52 }} />
        </View>

        {status === 'ready' && (
          <View style={styles.searchWrap}>
            <FontAwesome name="search" size={14} color={FAINT} />
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search contacts"
              placeholderTextColor={FAINT}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        )}

        {status === 'loading' && <ActivityIndicator style={{ marginTop: 40 }} color={TANGERINE} />}

        {status === 'denied' && (
          <View style={styles.message}>
            <FontAwesome name="address-book-o" size={36} color={FAINT} />
            <Text style={styles.messageText}>
              Yoink It needs access to your contacts to show them here. Only the people you pick are checked.
            </Text>
            <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.settingsBtnText}>Open Settings</Text>
            </Pressable>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.message}>
            <Text style={styles.messageText}>Couldn’t read your contacts on this device.</Text>
          </View>
        )}

        {status === 'ready' && (
          <FlatList
            data={shown}
            keyExtractor={e => e.key}
            extraData={selected}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>{entries.length ? 'No matches.' : 'No contacts with a US phone number.'}</Text>
            }
            renderItem={({ item }) => {
              const on = selected.has(item.key);
              return (
                <Pressable
                  style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && { opacity: 0.8 }]}
                  onPress={() => toggle(item.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on && <FontAwesome name="check" size={12} color={CREAM} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.phone} numberOfLines={1}>
                      {pretty(item.phone)}{item.label ? ` · ${item.label}` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.confirmBtn, selected.size === 0 && styles.confirmDisabled, pressed && { opacity: 0.85 }]}
            onPress={confirm}
            disabled={selected.size === 0}
          >
            <Text style={styles.confirmText}>
              {selected.size === 0 ? 'Select people to connect with' : `Connect with ${selected.size}`}
            </Text>
          </Pressable>
          <Text style={styles.footerHint}>
            People already on Yoink It get a friend request. Others you can invite by text.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: WHITE,
  },
  cancel: { fontSize: 16, color: TANGERINE, fontWeight: '600', width: 52 },
  title: { fontSize: 17, fontWeight: '700', color: INK },
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
  list: { padding: 16, paddingBottom: 24 },
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
  rowOn: { borderColor: TANGERINE },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: FAINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: TANGERINE, borderColor: TANGERINE },
  name: { fontSize: 15, fontWeight: '600', color: INK },
  phone: { fontSize: 12, color: MUTE, marginTop: 2 },
  empty: { textAlign: 'center', color: MUTE, marginTop: 32, fontSize: 14 },
  message: { alignItems: 'center', padding: 32, gap: 14 },
  messageText: { fontSize: 14, color: INK_2, textAlign: 'center', lineHeight: 20 },
  settingsBtn: { backgroundColor: CREAM_2, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  settingsBtnText: { fontSize: 14, fontWeight: '700', color: INK },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: WHITE },
  confirmBtn: {
    backgroundColor: TANGERINE,
    borderRadius: 999,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDisabled: { backgroundColor: MUTE },
  confirmText: { fontSize: 16, fontWeight: '700', color: CREAM },
  footerHint: { fontSize: 12, color: MUTE, textAlign: 'center', marginTop: 8, lineHeight: 16 },
});
