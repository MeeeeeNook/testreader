export const OWNER_EMAIL = 'manhcuong2006ht@gmail.com';

// Navigation uses Firebase's authenticated identity, never a profile document or API availability.
// API and Firestore permissions independently verify the token on the server.
export function roleForIdentity(user: { email: string | null; emailVerified: boolean } | null): 'admin' | 'student' {
  return user?.email === OWNER_EMAIL && user.emailVerified ? 'admin' : 'student';
}
