import type { Item } from '@/store/types';

/** A claimed free item whose pickup window has run out. */
export function isClaimExpired(item: Item, now = Date.now()): boolean {
  return item.listingType === 'give' && item.status === 'claimed' &&
    !!item.claimDeadline && new Date(item.claimDeadline).getTime() <= now;
}

/** An expired claim with nobody waiting: the owner decides whether to extend or release it. */
export function claimNeedsOwner(item: Item, now = Date.now()): boolean {
  return isClaimExpired(item, now) && item.waitlist.length === 0;
}
