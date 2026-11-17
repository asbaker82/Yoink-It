export type DisposalMethod = 'charity' | 'keep' | 'trash';

export type ItemStatus =
  | 'available'
  | 'claimed'
  | 'pending_pickup'
  | 'picked_up'
  | 'disposed'
  | 'borrowed'
  | 'pending_return';

export type ListingType = 'give' | 'borrow' | 'skill';

export interface BorrowRequest {
  id: string;
  requesterId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  status: 'pending' | 'approved' | 'rejected' | 'returned';
  createdAt: string;
}

export interface BlockedPeriod {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  note?: string;
}

export interface Item {
  id: string;
  donorId: string;
  title: string;
  description: string;
  photos: string[];
  restrictions?: string;
  // "City, ST 12345" ('' for skills) — never a street address; exact spot is arranged by text
  pickupLocation: string;
  pickupWindow: string;
  disposalDate: string;
  disposalMethod: DisposalMethod;
  claimPickupHours: number;
  status: ItemStatus;
  claimedBy?: string;
  claimDeadline?: string;
  waitlist: string[];
  createdAt: string;
  // Borrow-specific fields
  listingType: ListingType;
  borrowRequests: BorrowRequest[];
  blockedPeriods: BlockedPeriod[];
  borrowedBy?: string;
  borrowedUntil?: string;
  // Empty/undefined = visible to all friends; otherwise only these user ids
  allowedBorrowers?: string[];
  // Friends who must NOT see this item; mutually exclusive with allowedBorrowers
  excludedFriends?: string[];
}

export interface SearchNotification {
  id: string;
  keyword: string;
  createdAt: string;
}


export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  friends: string[];
  profilePhoto?: string;
  // "City, ST 12345" — the app never stores a user's street address
  defaultAddress?: string;
}

export const DISPOSAL_METHOD_LABELS: Record<DisposalMethod, string> = {
  charity: 'Charity',
  keep:    'Keep / Donate',
  trash:   'Trash',
};

