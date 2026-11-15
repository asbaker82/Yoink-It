import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { User } from '@/store/types';

const SKY       = '#7BA7BC';
const TANG_DEEP = '#D8531F';
const CREAM     = '#FBF6EE';
const CREAM_2   = '#F4ECDD';
const INK       = '#1F1A17';
const INK_2     = '#3A332E';
const MUTE      = '#847A70';
const BORDER    = '#E8DDD0';

interface Props {
  value: string[] | undefined;
  onChange: (ids: string[] | undefined) => void;
  friends: User[];
  error?: string;
}

const lastName = (n: string) => n.trim().split(' ').slice(-1)[0] ?? n;

export default function AllowedBorrowersInput({ value, onChange, friends, error }: Props) {
  // Track mode separately so "Only certain friends" with nothing ticked yet stays selected
  const [restricted, setRestricted] = useState(!!value?.length);
  const selected = new Set(value ?? []);
  const sorted = [...friends].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));

  const setMode = (r: boolean) => {
    setRestricted(r);
    onChange(r ? [] : undefined);
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <View>
      <View style={styles.segment}>
        <Pressable style={[styles.segBtn, !restricted && styles.segBtnActive]} onPress={() => setMode(false)}>
          <FontAwesome name="users" size={13} color={!restricted ? CREAM : MUTE} />
          <Text style={[styles.segText, !restricted && styles.segTextActive]}>All friends</Text>
        </Pressable>
        <Pressable style={[styles.segBtn, restricted && styles.segBtnActive]} onPress={() => setMode(true)}>
          <FontAwesome name="lock" size={13} color={restricted ? CREAM : MUTE} />
          <Text style={[styles.segText, restricted && styles.segTextActive]}>Only certain friends</Text>
        </Pressable>
      </View>

      {restricted && (
        sorted.length === 0 ? (
          <Text style={styles.hint}>Add friends first to choose trusted borrowers.</Text>
        ) : (
          <View style={styles.list}>
            <Text style={styles.hint}>Only the friends you pick will see this item.</Text>
            {sorted.map(f => {
              const on = selected.has(f.id);
              return (
                <Pressable key={f.id} style={styles.row} onPress={() => toggle(f.id)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {f.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.name}>{f.name}</Text>
                  <FontAwesome name={on ? 'check-circle' : 'circle-thin'} size={22} color={on ? SKY : BORDER} />
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
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  segBtnActive: { backgroundColor: SKY },
  segText: { fontSize: 13, fontWeight: '600', color: MUTE },
  segTextActive: { color: CREAM },
  hint: { fontSize: 12, color: MUTE, marginTop: 10, marginBottom: 4 },
  list: { marginTop: 2 },
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
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  errorText: { flex: 1, fontSize: 13, color: TANG_DEEP },
});
