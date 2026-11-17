import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useApp } from '@/store/AppContext';
import { openSms } from '@/utils/sms';
import { CREAM, CREAM_2, INK, INK_2, MUTE, MUTE_LIGHT, TANGERINE, TANGERINE_TINT, WHITE } from '@/constants/theme';

interface OpenOptions {
  /** Hide "See listings" — used on that person's own listings page. */
  hideListings?: boolean;
}

interface UserSheetContextType {
  openUser: (userId: string, opts?: OpenOptions) => void;
}

const UserSheetContext = createContext<UserSheetContextType>({ openUser: () => {} });

export const useUserSheet = () => useContext(UserSheetContext);

/** Shows a "Text {name} / See {name}'s listings" sheet for any user, from any screen. */
export function UserSheetProvider({ children }: { children: React.ReactNode }) {
  const { getUserById, currentUser } = useApp();
  const router = useRouter();
  const [target, setTarget] = useState<{ userId: string; opts: OpenOptions } | null>(null);

  const openUser = useCallback((userId: string, opts: OpenOptions = {}) => {
    if (!userId || userId === currentUser.id) return;
    setTarget({ userId, opts });
  }, [currentUser.id]);

  const value = useMemo(() => ({ openUser }), [openUser]);
  const close = () => setTarget(null);

  const user = target ? getUserById(target.userId) : undefined;
  const firstName = user?.name.split(' ')[0] ?? '';
  const initials = user?.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? '';

  return (
    <UserSheetContext.Provider value={value}>
      {children}
      <Modal visible={!!user} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.root}>
          <Pressable style={styles.overlay} onPress={close} accessibilityLabel="Close" />
          {user && (
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.name}>{user.name}</Text>

              {user.phone ? (
                <Pressable
                  style={({ pressed }) => [styles.option, styles.optionPrimary, pressed && styles.pressed]}
                  onPress={() => { close(); openSms(user.phone!); }}
                >
                  <FontAwesome name="comment" size={16} color={CREAM} />
                  <Text style={[styles.optionText, { color: CREAM }]}>Text {firstName}</Text>
                </Pressable>
              ) : (
                <View style={[styles.option, styles.optionDisabled]}>
                  <FontAwesome name="comment" size={16} color={MUTE_LIGHT} />
                  <Text style={[styles.optionText, { color: MUTE_LIGHT }]}>No phone number on file</Text>
                </View>
              )}

              {!target?.opts.hideListings && (
                <Pressable
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  onPress={() => { close(); router.push(`/friend/${user.id}`); }}
                >
                  <FontAwesome name="th-large" size={16} color={TANGERINE} />
                  <Text style={styles.optionText}>See {firstName}'s listings</Text>
                </Pressable>
              )}

              <Pressable style={({ pressed }) => [styles.cancel, pressed && styles.pressed]} onPress={close}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </UserSheetContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: CREAM,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    alignItems: 'center',
    gap: 10,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: CREAM_2, marginBottom: 8 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TANGERINE_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: INK_2 },
  name: { fontSize: 18, fontWeight: '800', color: INK, marginBottom: 6 },
  option: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: 999,
    backgroundColor: WHITE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  optionPrimary: { backgroundColor: TANGERINE },
  optionDisabled: { backgroundColor: CREAM_2 },
  optionText: { fontSize: 15, fontWeight: '700', color: INK },
  cancel: { alignSelf: 'stretch', height: 46, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: MUTE },
  pressed: { opacity: 0.75 },
});
