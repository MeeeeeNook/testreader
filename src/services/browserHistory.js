export const LEAVE_MESSAGE =
  "Leave this test? Your answers are saved on this device, but the test will no longer be running.";
export function parseRoute(input) {
  try {
    const url = new URL(input, "https://reading.local");
    const p = url.pathname.replace(/\/+$/, "") || "/";
    if (p === "/") return { name: "home" };
    if (p === "/library") return { name: "library" };
    if (p === "/sign-in") return {name:"sign-in"};
    if (p === "/practice") return {name:"practice"};
    if (p === "/full-tests") return {name:"full"};
    if (p.startsWith("/full-tests/")) return {name:"full",category:p.split("/")[2]};
    if (p === "/knowledge" || p === "/contribute") return {name:"practice"};
    const direct = /^\/(reading|solutions)\/([^/]+)$/.exec(p);
    if(direct)return {name:"reading",slug:decodeURIComponent(direct[2]),solution:direct[1]==="solutions"};
    if (/^\/admin\/(overview|tests|folders|upload|reports|users|archive|trash)$/.test(p)) return {name:"admin",section:p.split("/")[2]};
    if (p === "/admin/content") return {name:"content-admin"};
    if (p === "/admin/contributions") return {name:"contributions-admin"};
    const legacyAnswers=/^\/answers\/([^/]+)\/([^/]+)\/[^/]+$/.exec(p);
    if(legacyAnswers)return {name:"test",id:decodeURIComponent(legacyAnswers[1]),section:legacyAnswers[2]==="all"?undefined:decodeURIComponent(legacyAnswers[2]),solution:true};
    let sectionMatch = /^\/tests\/([^/]+)\/sections\/([^/]+)$/.exec(p);
    if (sectionMatch) return {name:"test",id:decodeURIComponent(sectionMatch[1]),section:decodeURIComponent(sectionMatch[2])};
    const simple = {
      "/mock": "mock",
      "/history": "progress",
      "/vocabulary": "vocabulary",
      "/settings": "settings",
      "/admin": "admin",
    };
    if (simple[p]) return { name: simple[p] };
    let m;
    if (p === "/admin/students") return { name: "students" };
    if ((m = /^\/admin\/students\/([^/]+)\/attempts\/([^/]+)$/.exec(p)))
      return {
        name: "students",
        id: decodeURIComponent(m[1]),
        attempt: decodeURIComponent(m[2]),
      };
    if ((m = /^\/admin\/students\/([^/]+)$/.exec(p)))
      return { name: "students", id: decodeURIComponent(m[1]) };
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
      home:"/", practice:"/practice", full:"/full-tests", knowledge:"/knowledge", forum:"/forum", contribute:"/contribute",
      "content-admin":"/admin/content", "contributions-admin":"/admin/contributions",
      library: "/practice",
      mock: "/mock",
      progress: "/history",
      vocabulary: "/vocabulary",
      settings: "/settings",
      admin: "/admin",
      students: "/admin/students",
    }[name] || "/library"
  );
}
export function createBrowserHistory(win, changed) {
  let current = win.location.pathname + win.location.search;
  const pop = () => {
    const next = win.location.pathname + win.location.search;
    if (next !== current) {current = next; changed(next);}
  };
  win.addEventListener("popstate", pop);
  return {
    guard(_value) {}, // Drafts persist automatically; navigation never asks for confirmation.
    navigate(path, replace = false) {
      const url = new URL(path, win.location.href);
      if (url.origin !== win.location.origin) throw new Error("Only local page navigation is supported.");
      const next = url.pathname + url.search;
      if (next === current) return true;
      win.history[replace ? "replaceState" : "pushState"]({}, "", next);
      current = next;
      changed(next);
      return true;
    },
    destroy() {win.removeEventListener("popstate", pop);},
  };
}

