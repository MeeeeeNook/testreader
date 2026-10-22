import { useCallback, useEffect, useRef, useState } from "react";
import {
  createBrowserHistory,
  parseRoute,
  routePath,
} from "./browserHistory.js";
export function usePageRouter() {
  const [location, setLocation] = useState(
    () => window.location.pathname + window.location.search,
  );
  const controller = useRef<ReturnType<typeof createBrowserHistory> | null>(
    null,
  );
  const guarded = useRef(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    path: string;
    replace: boolean;
  } | null>(null);
  useEffect(() => {
    controller.current = createBrowserHistory(window, (path: string) => {
      guarded.current = false;
      setLocation(path);
      window.scrollTo({ top: 0 });
    });
    return () => {
      controller.current?.destroy();
      controller.current = null;
    };
  }, []);
  const navigate = useCallback((path: string, replace = false) => {
    if (path === window.location.pathname + window.location.search) return true;
    if (guarded.current) {
      setPendingNavigation({ path, replace });
      return false;
    }
    return controller.current?.navigate(path, replace) ?? false;
  }, []);
  const setGuard = useCallback((active: boolean) => {
    guarded.current = active;
    controller.current?.guard(active);
  }, []);
  const confirmNavigation = useCallback(() => {
    if (!pendingNavigation) return;
    setGuard(false);
    controller.current?.navigate(
      pendingNavigation.path,
      pendingNavigation.replace,
    );
    setPendingNavigation(null);
  }, [pendingNavigation, setGuard]);
  const cancelNavigation = useCallback(() => setPendingNavigation(null), []);
  const setRoute = useCallback(
    (name: string) => navigate(routePath(name)),
    [navigate],
  );
  return {
    page: parseRoute(location),
    location,
    navigate,
    setGuard,
    setRoute,
    pendingNavigation,
    confirmNavigation,
    cancelNavigation,
  };
}
