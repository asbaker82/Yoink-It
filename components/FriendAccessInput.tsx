import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { User } from '@/store/types';
import { BORDER, CREAM, CREAM_2, INK, INK_2, MUTE, SKY, TANGERINE_DEEP as TANG_DEEP } from '@/constants/theme';

export type FriendAccess = { allowed?: string[]; excluded?: string[] };
type Mode = 'all' | 'only' | 'except';

interface Props {
  value: FriendAccess;
  onChange: (value: FriendAccess) => void;
  friends: User[];
  error?: string;
}

const lastName = (n: string) => n.trim().split(' ').slice(-1)[0] ?? n;

const MODES: { key: Mode; label: string; icon: React.ComponentProps<typeof FontAwesome>['name'] }[] = [
  { key: 'all',    label: 'Everyone',   icon: 'users' },
  { key: 'only',   label: 'Only these', icon: 'lock' },
  { key: 'except', label: 'All except', icon: 'eye-slash' },
];

// An empty array (vs undefined) means the mode is chosen but nobody is ticked yet — forms reject that on save.
export function friendAccessError(value: FriendAccess): string | undefined {
  if (value.allowed && value.allowed.length === 0) return 'Pick at least one friend, or choose Everyone.';
  if (value.excluded && value.excluded.length === 0) return 'Pick at least one friend to hide this from, or choose Everyone.';
  return undefined;
}

export default function FriendAccessInput({ value, onChange, friends, error }: Props) {
  const [mode, setModeState] = useState<Mode>(
    value.allowed ? 'only' : value.excluded ? 'except' : 'all'
  );
  const selected = new Set((mode === 'only' ? value.allowed : value.excluded) ?? []);
  const sorted = [...friends].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));

  const setMode = (m: Mode) => {
    setModeState(m);
    onChange(m === 'only' ? { allowed: [] } : m === 'except' ? { excluded: [] } : {});
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const ids = Array.from(next);
    onChange(mode === 'only' ? { allowed: ids } : { excluded: ids });
  };

  const isExcept = mode === 'except';

  return (
    <View>
      <View style={styles.segment}>
        {MODES.map(m => {
          const active = mode === m.key;
          return (
            <Pressable key={m.key} style={[styles.segBtn, active && styles.segBtnActive]} onPress={() => setMode(m.key)}>
              <FontAwesome name={m.icon} size={12} color={active ? CREAM : MUTE} />
              <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode !== 'all' && (
        sorted.length === 0 ? (
          <Text style={styles.hint}>Add friends first to choose who sees this.</Text>
        ) : (
          <View>
            <Text style={styles.hint}>
              {isExcept
                ? "The friends you pick won't see this. Everyone else will, including friends you add later."
                : 'Only the friends you pick will see this.'}
            </Text>
            {sorted.map(f => {
              const on = selected.has(f.id);
              return (
                <Pressable key={f.id} style={styles.row} onPress={() => toggle(f.id)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {f.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.name, isExcept && on && styles.nameExcluded]}>{f.name}</Text>
                  <FontAwesome
                    name={on ? (isExcept ? 'times-circle' : 'check-circle') : 'circle-thin'}
                    size={22}
                    color={on ? (isExcept ? TANG_DEEP : SKY) : BORDER}
                  />
                </Pressable>
              );
            })}
          </View>
        )
      )}

      {error ? (
        <View style={styles.errorRow}>
          <FontAwesome name="exclamation-circle" size={13} color={TANG_DEEP} style={{ marginRight: 5 }} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    backgroundColor: CREAM,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 3,
    gap: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 9,
  },
  segBtnActive: { backgroundColor: SKY },
  segText: { fontSize: 12, fontWeight: '600', color: MUTE },
  segTextActive: { color: CREAM },
  hint: { fontSize: 12, color: MUTE, marginTop: 10, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: CREAM_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontWeight: '700', color: INK_2 },
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: INK },
  nameExcluded: { color: MUTE, textDecorationLine: 'line-through' },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  errorText: { flex: 1, fontSize: 13, color: TANG_DEEP },
});
