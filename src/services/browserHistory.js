export const LEAVE_MESSAGE =
  "Leave this test? Your answers are saved on this device, but the test will no longer be running.";
export function parseRoute(input) {
  try {
    const url = new URL(input, "https://reading.local");
    const p = url.pathname.replace(/\/+$/, "") || "/";
    if (p === "/" || p === "/library") return { name: "library" };
    const simple = {
      "/mock": "mock",
      "/history": "progress",
      "/vocabulary": "vocabulary",
      "/settings": "settings",
      "/admin": "admin",
    };
    if (simple[p]) return { name: simple[p] };
    let m;
    if ((m = /^\/history\/([^/]+)$/.exec(p)))
      return { name: "progress", id: decodeURIComponent(m[1]) };
    if (p === "/admin/new") return { name: "editor", id: "new" };
    if ((m = /^\/admin\/tests\/([^/]+)$/.exec(p)))
      return { name: "editor", id: decodeURIComponent(m[1]) };
    if ((m = /^\/tests\/([^/]+)\/take\/([^/]+)$/.exec(p)))
      return {
        name: "workspace",
        id: decodeURIComponent(m[1]),
        session: decodeURIComponent(m[2]),
      };
    if ((m = /^\/tests\/([^/]+)$/.exec(p)))
      return { name: "test", id: decodeURIComponent(m[1]) };
    return { name: "notfound" };
  } catch {
    return { name: "notfound" };
  }
}
export function routePath(name) {
  return (
    {
      library: "/library",
      mock: "/mock",
      progress: "/history",
      vocabulary: "/vocabulary",
      settings: "/settings",
      admin: "/admin",
    }[name] || "/library"
  );
}
export function createBrowserHistory(win, changed) {
  let index = Number.isInteger(win.history.state?.studioIndex)
    ? win.history.state.studioIndex
    : 0;
  let current = win.location.pathname + win.location.search,
    guarded = false,
    restoring = false;
  win.history.replaceState(
    { ...win.history.state, studioIndex: index },
    "",
    current,
  );
  const unload = (event) => {
    if (guarded) {
      event.preventDefault();
      event.returnValue = true;
    }
  };
  function guard(value) {
    guarded = Boolean(value);
    win.removeEventListener("beforeunload", unload);
    if (guarded) win.addEventListener("beforeunload", unload);
  }
  function pop(event) {
    if (restoring) {
      restoring = false;
      return;
    }
    const next = win.location.pathname + win.location.search;
    if (next === current) return;
    const nextIndex = Number.isInteger(event.state?.studioIndex)
      ? event.state.studioIndex
      : null;
    if (guarded && !win.confirm(LEAVE_MESSAGE)) {
      if (nextIndex !== null && nextIndex !== index) {
        restoring = true;
        win.history.go(index - nextIndex);
      } else win.history.pushState({ studioIndex: index }, "", current);
      return;
    }
    index = nextIndex ?? index;
    current = next;
    guard(false);
    changed(current);
  }
  win.addEventListener("popstate", pop);
  return {
    guard,
    navigate(path, replace = false) {
      const url = new URL(path, win.location.href);
      if (url.origin !== win.location.origin)
        throw new Error("Only local page navigation is supported.");
      const next = url.pathname + url.search;
      if (next === current) return true;
      if (guarded && !win.confirm(LEAVE_MESSAGE)) return false;
      guard(false);
      if (!replace) index++;
      win.history[replace ? "replaceState" : "pushState"](
        { studioIndex: index },
        "",
        next,
      );
      current = next;
      changed(current);
      return true;
    },
    destroy() {
      guard(false);
      win.removeEventListener("popstate", pop);
    },
  };
}
