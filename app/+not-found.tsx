import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { CREAM, INK, TANGERINE_DEEP } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: CREAM,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: INK,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: TANGERINE_DEEP,
  },
});
