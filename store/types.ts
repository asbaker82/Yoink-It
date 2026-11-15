export type DisposalMethod = 'charity' | 'keep' | 'trash';

export type ItemStatus =
  | 'available'
  | 'claimed'
  | 'pending_pickup'
  | 'picked_up'
  | 'disposed'
  | 'borrowed'
  | 'pending_return';

export type ListingType = 'give' | 'borrow';

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
}

export interface SearchNotification {
  id: string;
  keyword: string;
  createdAt: string;
}

export type ItemVisibility = 'added' | 'both';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  friends: string[];
  profilePhoto?: string;
  defaultAddress?: string;
  /** Who can see this user's listings.
   *  'added' (default) = only people this user has added as friends.
   *  'both' = people this user added OR anyone who has added this user. */
  itemVisibility?: ItemVisibility;
}

export const DISPOSAL_METHOD_LABELS: Record<DisposalMethod, string> = {
  charity: 'Charity',
  keep:    'Keep / Donate',
  trash:   'Trash',
};

