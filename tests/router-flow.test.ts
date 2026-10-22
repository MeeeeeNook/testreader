import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { usePageRouter } from "../src/services/usePageRouter.ts";
import { parseRoute } from "../src/services/browserHistory.js";
test("Library navigation changes the URL immediately without a leave dialog", async () => {
  const { window } = parseHTML(
    '<html><body><div id="app"></div></body></html>',
  );
  let location = new URL("https://reading.local/tests/t/take/s");
  let state: any = { studioIndex: 0 };
  Object.assign(window, {
    location,
    scrollTo: () => {},
    confirm: () => {
      throw new Error("Internal links must not depend on native confirm");
    },
    history: {
      get state() {
        return state;
      },
      replaceState(value: any, _: any, path: string) {
        state = value;
        location = new URL(path, location);
        (window as any).location = location;
      },
      pushState(value: any, _: any, path: string) {
        state = value;
        location = new URL(path, location);
        (window as any).location = location;
      },
    },
  });
  Object.assign(globalThis, {
    window,
    document: window.document,
    Node: window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let router!: ReturnType<typeof usePageRouter>;
  function Harness() {
    router = usePageRouter();
    return React.createElement(
      "p",
      null,
      router.location,
      router.pendingNavigation ? " leaving" : "",
    );
  }
  const root = createRoot(document.getElementById("app")!);
  await act(async () => {
    root.render(React.createElement(Harness));
  });
  await act(async () => {
    router.setGuard(true);
    router.setRoute("library");
  });
  assert.equal(router.pendingNavigation, null);
  assert.equal(router.location, "/practice");
  assert.equal(window.location.pathname, "/practice");
  await act(async () => root.unmount());
});
test("student history and individual result URLs have distinct routes", () => {
  assert.deepEqual(parseRoute("/admin/students/u/attempts/a"), {
    name: "students",
    id: "u",
    attempt: "a",
  });
  assert.equal(parseRoute("/admin/students").name, "students");
});
