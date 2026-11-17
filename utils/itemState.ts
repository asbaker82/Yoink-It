import type { BorrowRequest, Item } from '@/store/types';
import { toDateOnly } from '@/utils/dates';

/** A claimed free item whose pickup window has run out. */
export function isClaimExpired(item: Item, now = Date.now()): boolean {
  return item.listingType === 'give' && item.status === 'claimed' &&
    !!item.claimDeadline && new Date(item.claimDeadline).getTime() <= now;
}

/** An expired claim with nobody waiting: the owner decides whether to extend or release it. */
export function claimNeedsOwner(item: Item, now = Date.now()): boolean {
  return isClaimExpired(item, now) && item.waitlist.length === 0;
}

/** A free item nobody has claimed whose "available until" date has passed. */
export function isListingExpired(item: Item, now = Date.now()): boolean {
  return item.listingType === 'give' && item.status === 'available' &&
    new Date(item.disposalDate).getTime() <= now;
}

/** The approved request behind the borrow that's out right now (if any). */
export function activeBorrowRequest(item: Item): BorrowRequest | undefined {
  if (item.status !== 'borrowed' && item.status !== 'pending_return') return undefined;
  const mine = item.borrowRequests.filter(r => r.status === 'approved' && r.requesterId === item.borrowedBy);
  return mine.find(r => !!item.borrowedUntil && r.endDate === toDateOnly(item.borrowedUntil))
    ?? [...mine].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
}

/** Approved borrow requests that haven't started yet ("Reserved"), soonest first. */
export function upcomingReservations(item: Item): BorrowRequest[] {
  if (item.listingType !== 'borrow') return [];
  const active = activeBorrowRequest(item);
  return item.borrowRequests
    .filter(r => r.status === 'approved' && r.id !== active?.id)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}
