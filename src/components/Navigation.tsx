import React from "react";
import {
  BookOpen,
  LayoutGrid,
  Timer,
  TrendingUp,
  NotebookPen,
  Settings,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { routePath } from "../services/browserHistory.js";
import type { UserProfile } from "../types";
interface Props {
  route: string;
  onNavigate: (route: string) => void;
  isAdmin: boolean;
  profile: UserProfile;
  storageConnected: boolean;
}
export const Navigation: React.FC<Props> = ({
  route,
  onNavigate,
  isAdmin,
  profile,
  storageConnected,
}) => {
  const vi = profile.language === "vi";
  const items = [
    {
      id: "library",
      icon: LayoutGrid,
      label: vi ? "Thư viện đề thi" : "Test library",
    },
    { id: "mock", icon: Timer, label: vi ? "Thi thử" : "Mock builder" },
    {
      id: "progress",
      icon: TrendingUp,
      label: vi ? "Lịch sử làm bài" : "My history",
    },
    {
      id: "vocabulary",
      icon: NotebookPen,
      label: vi ? "Sổ từ vựng" : "Vocabulary",
    },
    { id: "settings", icon: Settings, label: vi ? "Cài đặt" : "Settings" },
  ];
  if (isAdmin)
    items.push({ id: "students", icon: ShieldCheck, label: "Students" });
  if (isAdmin)
    items.push({ id: "admin", icon: ShieldCheck, label: "Admin studio" });
  const click = (e: React.MouseEvent, id: string) => {
    if (
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey &&
      !e.altKey &&
      e.button === 0
    ) {
      e.preventDefault();
      onNavigate(id);
    }
  };
  return (
    <aside className="studio-nav">
      <a
        href="/library"
        className="studio-brand"
        onClick={(e) => click(e, "library")}
      >
        <span className="studio-logo">
          <BookOpen size={24} />
        </span>
        <span>
          reading
          <br />
          <b>studio.</b>
        </span>
      </a>
      <div className="studio-nav-label">YOUR STUDY SPACE</div>
      <nav aria-label="Main navigation">
        {items.map(({ id, icon: Icon, label }) => {
          const active =
            route === id ||
            (route === "test" && id === "library") ||
            (route === "editor" && id === "admin");
          return (
            <a
              key={id}
              href={routePath(id)}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
              onClick={(e) => click(e, id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {active && <span className="nav-active-dot" />}
            </a>
          );
        })}
      </nav>
      <div className="nav-encouragement">
        <span>✦</span>
        <p>
          Small steps.
          <br />
          Stronger skills.
        </p>
        <small>Make a little room for progress today.</small>
        <ArrowUpRight size={20} />
      </div>
      <div className="studio-nav-bottom">
        <span className="status-dot" />
        <div>
          <strong>
            {storageConnected ? "Account connected" : "Your local workspace"}
          </strong>
          <small>
            {storageConnected
              ? "History sync enabled"
              : "Results stay on this device"}
          </small>
        </div>
      </div>
    </aside>
  );
};
