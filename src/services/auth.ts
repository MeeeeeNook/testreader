import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { firestoreAdapter } from './firestoreAdapter';
import { UserProfile } from '../types';

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  role: 'admin' | 'student';
  loading: boolean;
  suspended: boolean;
}

type AuthCallback = (state: AuthState) => void;
const listeners: Set<AuthCallback> = new Set();

let currentState: AuthState = {
  user: null,
  profile: null,
  role: 'student',
  loading: true,
  suspended: false,
};

function notify() {
  for (const listener of listeners) {
    listener({ ...currentState });
  }
}

export async function loginWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await handleUserSync(result.user);
  return result.user;
}

export async function logout(): Promise<void> {
  await firebaseSignOut(auth);
  firestoreAdapter.clearRoleCache();
  currentState = {
    user: null,
    profile: null,
    role: 'student',
    loading: false,
    suspended: false,
  };
  notify();
}

async function handleUserSync(user: User | null) {
  firestoreAdapter.clearRoleCache();
  if (!user) {
    currentState = {
      user: null,
      profile: null,
      role: 'student',
      loading: false,
      suspended: false,
    };
    notify();
    return;
  }

  try {
    // Sync with backend server
    const res = await fetch('/api/auth/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      }),
    });

    let role: 'admin' | 'student' = 'student';
    let status = 'active';

    if (res.ok) {
      const data = await res.json();
      role = data.role === 'admin' ? 'admin' : 'student';
      status = data.status || 'active';
    } else {
      // Fallback check
      role = await firestoreAdapter.getRole();
    }

    // Load or initialize user profile from Firestore
    let profile = await firestoreAdapter.get('users', user.uid);
    if (!profile) {
      profile = {
        id: user.uid,
        email: user.email || '',
        name: user.displayName || user.email?.split('@')[0] || 'Learner',
        target: 7.5,
        language: 'en',
        theme: 'light',
        fontSize: 16,
        favorites: [],
        status: status as 'active' | 'suspended',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await firestoreAdapter.put('users', profile);
    }

    currentState = {
      user,
      profile,
      role,
      loading: false,
      suspended: profile.status === 'suspended',
    };
  } catch (err) {
    console.error('Failed to sync auth state:', err);
    currentState = {
      user,
      profile: {
        id: user.uid,
        email: user.email || '',
        name: user.displayName || 'Learner',
        target: 7.5,
        language: 'en',
        theme: 'light',
        fontSize: 16,
        favorites: [],
        status: 'active',
      },
      role: 'student',
      loading: false,
      suspended: false,
    };
  }

  notify();
}

// Subscribe to auth state updates
export function subscribeAuth(callback: AuthCallback): () => void {
  listeners.add(callback);
  callback({ ...currentState });
  return () => listeners.delete(callback);
}

// Initialise Firebase listener
onAuthStateChanged(auth, async (user) => {
  await handleUserSync(user);
});

