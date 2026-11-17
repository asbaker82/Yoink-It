// Where invited friends get the app. Replace with the App Store link once the app is live.
export const INVITE_LINK = '';

export function inviteMessage(fromName: string, toName?: string): string {
  const greeting = toName ? `Hey ${toName.split(' ')[0]}!` : 'Hey!';
  const from = fromName.split(' ')[0];
  const link = INVITE_LINK ? ` ${INVITE_LINK}` : '';
  return `${greeting} I'm using Yoink It to give away, lend, and borrow stuff with friends. ` +
    `Join me and sign up with this phone number so we're connected automatically.${link} — ${from}`;
}
