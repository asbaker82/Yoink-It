import React from 'react';
import { Tabs } from 'expo-router';
import CustomTabBar from '@/components/CustomTabBar';
import ProfileHeaderButton from '@/components/ProfileHeaderButton';
import HeaderLogo from '@/components/HeaderLogo';
import { CREAM, INK } from '@/constants/theme';

const profileBtn = () => <ProfileHeaderButton />;
const headerLogo = () => <HeaderLogo size={20} />;

export default function TabLayout() {
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: CREAM },
        headerTintColor: INK,
        headerTitleStyle: { fontWeight: '700', color: INK },
        headerTitleAlign: 'center',
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index"    options={{ headerTitle: headerLogo, headerRight: profileBtn }} />
      <Tabs.Screen name="my-items" options={{ headerTitle: headerLogo, headerRight: profileBtn }} />
      <Tabs.Screen name="profile"  options={{ headerTitle: headerLogo, href: null }} />
    </Tabs>
  );
}
