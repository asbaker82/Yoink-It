import FontAwesome from '@expo/vector-icons/FontAwesome';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import 'react-native-reanimated';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider, useAuth } from '@/store/AuthContext';
import { AppProvider } from '@/store/AppContext';
import { queryClient, asyncStoragePersister } from '@/lib/queryClient';
import HeaderLogo from '@/components/HeaderLogo';
import { CREAM, INK, TANGERINE, WHITE } from '@/constants/theme';

export { ErrorBoundary } from 'expo-router';

// The app has no dark mode: always use the light navigation theme on Cream,
// so a phone in dark mode doesn't get dark headers over cream screens.
const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: CREAM, primary: TANGERINE, text: INK },
};

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_800ExtraBold,
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <AuthProvider>
        <AppProvider>
          <RootLayoutNav />
        </AppProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}

function RootLayoutNav() {
  const { authUser, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!authUser && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (authUser && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [authUser, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CREAM }}>
        <ActivityIndicator size="large" color={TANGERINE} />
      </View>
    );
  }

  const headerLogo = () => <HeaderLogo size={20} />;

  return (
    <ThemeProvider value={navTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: WHITE },
          headerTintColor: INK,
          headerTitleStyle: { fontWeight: '700', color: INK },
          headerTitleAlign: 'center',
          headerShadowVisible: true,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen
          name="item/[id]"
          options={{ headerTitle: headerLogo, headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="item/new"
          options={{ headerTitle: headerLogo, presentation: 'modal' }}
        />
        <Stack.Screen
          name="item/edit/[id]"
          options={{ headerTitle: headerLogo, presentation: 'modal' }}
        />
        <Stack.Screen
          name="items-list"
          options={{ headerTitle: headerLogo, headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="friend/[id]"
          options={{ headerTitle: headerLogo, headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="add-friends"
          options={{ headerTitle: headerLogo, headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="edit-profile"
          options={{ headerTitle: headerLogo, headerBackTitle: 'Back' }}
        />
      </Stack>
    </ThemeProvider>
  );
}
