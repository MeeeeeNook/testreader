import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { firestoreAdapter } from "./firestoreAdapter";
import { UserProfile } from "../types";
import { roleForIdentity } from "./access";

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  role: "admin" | "student";
  loading: boolean;
  suspended: boolean;
}

type AuthCallback = (state: AuthState) => void;
const listeners: Set<AuthCallback> = new Set();

let currentState: AuthState = {
  user: null,
  profile: null,
  role: "student",
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
  return result.user;
}

export async function logout(): Promise<void> {
  await firebaseSignOut(auth);
  firestoreAdapter.clearRoleCache();
  currentState = {
    user: null,
    profile: null,
    role: "student",
    loading: false,
    suspended: false,
  };
  notify();
}

let authGeneration = 0;
async function handleUserSync(user: User | null) {
  const generation = ++authGeneration;
  const isCurrent = () =>
    generation === authGeneration &&
    (auth.currentUser?.uid || null) === (user?.uid || null);
  firestoreAdapter.clearRoleCache();
  if (!user) {
    currentState = {
      user: null,
      profile: null,
      role: "student",
      loading: false,
      suspended: false,
    };
    notify();
    return;
  }

  const role = roleForIdentity(user);
  const fallbackProfile: UserProfile = {
    id: user.uid, email: user.email || '', name: user.displayName || 'Learner',
    target: 7.5, language: 'en', theme: 'light', fontSize: 16, favorites: [], status: 'active',
  };
  // Make the owner portal available immediately, even if optional profile sync is offline.
  currentState = { user, profile: fallbackProfile, role, loading: false, suspended: false };
  notify();
  try {
    // Sync with backend server
    const res = await fetch("/api/auth/sync", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      }),
    });

    let status = "active";

    if (res.ok) {
      const data = await res.json();
      status = data.status || "active";
    }

    if (!isCurrent()) return;
    // Load or initialize user profile from Firestore
    let profile = await firestoreAdapter.get("users", user.uid);
    if (!isCurrent()) return;
    if (!profile) {
      profile = {
        id: user.uid,
        email: user.email || "",
        name: user.displayName || user.email?.split("@")[0] || "Learner",
        target: 7.5,
        language: "en",
        theme: "light",
        fontSize: 16,
        favorites: [],
        status: status as "active" | "suspended",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await firestoreAdapter.put("users", profile);
    }

    if (!isCurrent()) return;
    currentState = {
      user,
      profile,
      role,
      loading: false,
      suspended: profile.status === "suspended",
    };
  } catch (err) {
    if (!isCurrent()) return;
    console.error("Failed to sync auth state:", err);
    currentState = {
      user,
      profile: {
        id: user.uid,
        email: user.email || "",
        name: user.displayName || "Learner",
        target: 7.5,
        language: "en",
        theme: "light",
        fontSize: 16,
        favorites: [],
        status: "active",
      },
      role,
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
