import React, { useState } from "react";
import { User } from "firebase/auth";
import { UserProfile } from "../types";
import { loginWithGoogle, logout } from "../services/auth";

interface TopHeaderProps {
  crumb: string;
  user: User | null;
  profile: UserProfile;
  role: "admin" | "student";
  onUpdateProfile: (updates: Partial<UserProfile>) => void;
  onOpenProfileModal: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  crumb,
  user,
  profile,
  role,
  onUpdateProfile,
  onOpenProfileModal,
}) => {
  const [showAuthMenu, setShowAuthMenu] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const isVi = profile.language === "vi";

  const toggleLanguage = () => {
    onUpdateProfile({ language: isVi ? "en" : "vi" });
  };

  const toggleTheme = () => {
    onUpdateProfile({ theme: profile.theme === "dark" ? "light" : "dark" });
  };

  return (
    <header className="studio-top">
      <div>
        <span style={{ fontWeight: 500 }}>{crumb}</span>
      </div>

      <div style={{ position: "relative" }}>
        <button
          className="studio-quiet"
          onClick={toggleLanguage}
          title={isVi ? "Chuyển sang tiếng Anh" : "Switch to Vietnamese"}
        >
          {isVi ? "VI / EN" : "EN / VI"}
        </button>

        <button
          className="studio-quiet"
          onClick={toggleTheme}
          aria-label="Toggle dark theme"
          title="Toggle theme"
        >
          {profile.theme === "dark" ? "☼" : "◐"}
        </button>

        {user ? (
          <button
            className="studio-avatar"
            onClick={() => setShowAuthMenu(!showAuthMenu)}
            title={`${user.displayName || user.email} (${role})`}
          >
            {user.displayName
              ? user.displayName.slice(0, 2).toUpperCase()
              : (user.email || "ME").slice(0, 2).toUpperCase()}
          </button>
        ) : (
          <button
            className="studio-primary"
            style={{ padding: "7px 14px", fontSize: "11px" }}
            disabled={authBusy}
            onClick={async () => {
              setAuthBusy(true);
              setAuthError("");
              try {
                await loginWithGoogle();
              } catch {
                setAuthError(
                  "Sign-in did not finish. Please try again. Your local results are safe.",
                );
              } finally {
                setAuthBusy(false);
              }
            }}
          >
            {authBusy
              ? "Connecting…"
              : isVi
                ? "Đăng nhập Google"
                : "Sign in to sync"}
          </button>
        )}

        {authError && (
          <div className="auth-error" role="alert">
            {authError}
            <button aria-label="Dismiss" onClick={() => setAuthError("")}>
              ×
            </button>
          </div>
        )}
        {showAuthMenu && user && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "46px",
              width: "240px",
              background: "var(--studio-white)",
              border: "1px solid var(--studio-border)",
              borderRadius: "12px",
              padding: "16px",
              boxShadow: "0 8px 30px #0002",
              zIndex: 110,
            }}
          >
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontWeight: 600, fontSize: "13px" }}>
                {user.displayName || "Learner"}
              </div>
              <div style={{ fontSize: "11px", color: "var(--studio-muted)" }}>
                {user.email}
              </div>
              <div style={{ marginTop: "6px" }}>
                <span
                  className="studio-tag"
                  style={{ textTransform: "uppercase" }}
                >
                  {role === "admin" ? "Administrator" : "Student"}
                </span>
                {profile.status === "suspended" && (
                  <span
                    className="studio-tag studio-danger"
                    style={{ marginLeft: "4px" }}
                  >
                    Suspended
                  </span>
                )}
              </div>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <button
                className="studio-quiet"
                style={{ textAlign: "left", width: "100%" }}
                onClick={() => {
                  setShowAuthMenu(false);
                  onOpenProfileModal();
                }}
              >
                {isVi ? "Hồ sơ học tập" : "Study Profile & Target"}
              </button>

              <button
                className="studio-quiet studio-danger"
                style={{ textAlign: "left", width: "100%" }}
                onClick={async () => {
                  setShowAuthMenu(false);
                  await logout();
                }}
              >
                {isVi ? "Đăng xuất" : "Sign out"}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
