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
  useEffect(() => {
    controller.current = createBrowserHistory(window, (path: string) => {
      setLocation(path);
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => {
      controller.current?.destroy();
      controller.current = null;
    };
  }, []);
  const navigate = useCallback(
    (path: string, replace = false) =>
      controller.current?.navigate(path, replace) ?? false,
    [],
  );
  const setGuard = useCallback(
    (active: boolean) => controller.current?.guard(active),
    [],
  );
  const setRoute = useCallback(
    (name: string) => navigate(routePath(name)),
    [navigate],
  );
  return { page: parseRoute(location), location, navigate, setGuard, setRoute };
}
