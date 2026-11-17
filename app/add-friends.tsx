import React from 'react';
import { useRouter } from 'expo-router';
import FriendFinder from '@/components/FriendFinder';

// Profile → Add: answer friend requests, add people (they approve), invite contacts by text.
export default function AddFriendsScreen() {
  const router = useRouter();
  return <FriendFinder doneLabel="Done" onDone={() => router.back()} />;
}
