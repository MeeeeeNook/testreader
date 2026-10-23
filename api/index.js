// server/app.ts
import { getStorage } from "firebase-admin/storage";

// src/services/storageUsage.ts
function summarizeFiles(files) {
  return { bytes: files.reduce((sum, file) => sum + file.size, 0), count: files.length, largest: [...files].sort((a, b) => b.size - a.size).slice(0, 20) };
}

// src/services/portal.ts
var slugify = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "reading";
var answerPath = (id, sectionId, title) => `/answers/${encodeURIComponent(id)}/${encodeURIComponent(sectionId)}/${slugify(title)}`;

// server/portalRoutes.ts
import { createHash, randomUUID } from "node:crypto";

// src/services/scoring.ts
function normalizeAnswer(value) {
  return String(value ?? "").normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐‑–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
}
function answerMatches(response, key) {
  const value = normalizeAnswer(response);
  if (!value) return false;
  return String(key.answer || "").split("||").some((variant) => {
    const answer = normalizeAnswer(variant);
    if (["matching_features", "matching_names", "heading"].includes(key.kind || "")) {
      const letter = /^([a-z]|[ivxlcdm]+)(?:\s*[.\-—–•·]\s*|\s+|$)/i.exec(answer);
      if (letter && value === letter[1].toLowerCase()) return true;
    }
    return value === answer;
  });
}
function scoreTest(parts, responses) {
  const rows = /* @__PURE__ */ new Map();
  for (const part of parts) {
    const isMap = part.keys instanceof Map;
    const getKey = (n) => (isMap ? part.keys.get(n) : part.keys[n]) || { answer: "" };
    const missingSet = part.missing instanceof Set ? part.missing : new Set(part.missing || []);
    for (const n of part.numbers) {
      const key = getKey(n);
      const response = String(responses[n] || "");
      const status = missingSet.has(n) || key.missing || !key.answer ? "ungraded" : !normalizeAnswer(response) ? "blank" : answerMatches(response, key) ? "correct" : "incorrect";
      rows.set(n, {
        number: n,
        response,
        answer: key.answer || "",
        status
      });
    }
    for (const group of part.multiGroups || []) {
      if (group.some((n) => rows.get(n)?.status === "ungraded")) {
        for (const n of group) {
          if (rows.has(n)) rows.get(n).status = "ungraded";
        }
        continue;
      }
      const remaining = group.map((n) => ({ ...getKey(n) }));
      for (const n of group) {
        const row = rows.get(n);
        if (!row) continue;
        if (!normalizeAnswer(row.response)) {
          row.status = "blank";
          continue;
        }
        const index = remaining.findIndex((k) => answerMatches(row.response, k));
        row.status = index < 0 ? "incorrect" : "correct";
        if (index >= 0) {
          row.answer = remaining.splice(index, 1)[0].answer;
        }
      }
    }
  }
  const sortedRows = Array.from(rows.values()).sort((a, b) => a.number - b.number);
  const result = {
    rows: sortedRows,
    total: sortedRows.length,
    correct: 0,
    incorrect: 0,
    blank: 0,
    ungraded: 0,
    gradable: 0
  };
  for (const row of result.rows) {
    result[row.status]++;
  }
  result.gradable = result.total - result.ungraded;
  return result;
}
function estimatedBand(result, skill = "reading") {
  if (result.total !== 40 || result.ungraded > 0) return null;
  const bounds = skill === "listening" ? [
    [39, 9],
    [37, 8.5],
    [35, 8],
    [32, 7.5],
    [30, 7],
    [26, 6.5],
    [23, 6],
    [18, 5.5],
    [16, 5],
    [13, 4.5],
    [10, 4],
    [8, 3.5],
    [6, 3],
    [4, 2.5],
    [3, 2],
    [2, 1.5],
    [1, 1],
    [0, 0]
  ] : [
    [39, 9],
    [37, 8.5],
    [35, 8],
    [33, 7.5],
    [30, 7],
    [27, 6.5],
    [23, 6],
    [19, 5.5],
    [15, 5],
    [13, 4.5],
    [10, 4],
    [8, 3.5],
    [6, 3],
    [4, 2.5],
    [3, 2],
    [2, 1.5],
    [1, 1],
    [0, 0]
  ];
  const match = bounds.find(([threshold]) => result.correct >= threshold);
  return match ? match[1] : null;
}

// server/assessment.ts
var AssessmentError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var validId = (id) => typeof id === "string" && /^[\w-]{1,128}$/.test(id);
async function loadAssessment(store, request, admin) {
  const custom = request.sourceSections !== void 0;
  if (custom && (!Array.isArray(request.sourceSections) || !request.sourceSections.length || request.sourceSections.length > 4)) {
    throw new AssessmentError(400, "Choose between one and four source sections.");
  }
  const sources = custom ? request.sourceSections : [{ testId: request.testId }];
  const cache = /* @__PURE__ */ new Map();
  const keys = {};
  const parts = [];
  const transcripts = {};
  const seenSections = /* @__PURE__ */ new Set();
  let next = 1;
  let skill;
  for (const source of sources) {
    if (!validId(source.testId) || custom && !validId(source.sectionId)) throw new AssessmentError(400, "Invalid test or section identifier.");
    let data = cache.get(source.testId);
    if (!data) {
      const meta = await store.test(source.testId);
      if (!meta || !admin && meta.status !== "published") throw new AssessmentError(404, "This test is unavailable.");
      const [sections, keyData] = await Promise.all([store.sections(source.testId), store.keys(source.testId)]);
      if (!keyData) throw new AssessmentError(409, "Answer keys are missing. Ask an administrator to re-import this test.");
      data = { meta, sections: sections.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)), keyData };
      cache.set(source.testId, data);
    }
    if (skill && skill !== data.meta.skill) throw new AssessmentError(400, "A mock must use the same test skill throughout.");
    skill = data.meta.skill;
    let selected = data.sections;
    if (custom) selected = selected.filter((p) => p.id === source.sectionId);
    else if (request.sectionIds !== void 0) {
      if (!Array.isArray(request.sectionIds) || !request.sectionIds.length || request.sectionIds.some((id) => !validId(id))) throw new AssessmentError(400, "Invalid section selection.");
      selected = selected.filter((p) => request.sectionIds.includes(p.id));
      if (selected.length !== new Set(request.sectionIds).size) throw new AssessmentError(404, "A selected section no longer exists.");
    }
    if (!selected.length) throw new AssessmentError(404, "No questions found in the selected sections.");
    for (const section of selected) {
      const identity = source.testId + ":" + section.id;
      if (seenSections.has(identity)) throw new AssessmentError(400, "Choose distinct source sections.");
      seenSections.add(identity);
      if (skill === "listening") transcripts[custom ? "p" + parts.length : section.id] = data.keyData.transcripts?.[section.id] ?? section.passageHtml ?? "";
      const questions = section.questions || [];
      const slots = Object.values(section.slots || {});
      if (questions.some((q) => !q.missing && !slots.some((s) => s.numbers.includes(q.number)))) {
        throw new AssessmentError(409, "This test has broken answer controls. Re-upload the original ZIP or HTML file to repair it.");
      }
      const mapping = /* @__PURE__ */ new Map();
      for (const q of questions) {
        if (!Number.isInteger(q.number) || q.number < 1 || mapping.has(q.number)) throw new AssessmentError(409, "The test has invalid question numbers.");
        const n = custom ? next++ : q.number;
        if (keys[n]) throw new AssessmentError(409, "The test contains duplicate question numbers.");
        mapping.set(q.number, n);
        const key = data.keyData.keys?.[q.number] || { answer: "" };
        keys[n] = { ...key, missing: Boolean(q.missing || key.missing) };
      }
      const groups = slots.filter((s) => s.type === "multi").map((s) => s.numbers.map((n) => mapping.get(n)));
      if (groups.some((g) => g.some((n) => n === void 0))) throw new AssessmentError(409, "A multiple-choice group is incomplete.");
      parts.push({ numbers: [...mapping.values()], keys, missing: [...mapping.values()].filter((n) => keys[n].missing), multiGroups: groups });
    }
  }
  if (!parts.some((p) => p.numbers.length)) throw new AssessmentError(409, "This test has no questions.");
  const first = cache.values().next().value;
  return { parts, keys, transcripts, title: custom ? "Custom Mock" : first.meta.title, skill };
}
function markAssessment(assessment, responses) {
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) throw new AssessmentError(400, "Answers must be an object.");
  const clean = {};
  for (const [number, value] of Object.entries(responses)) {
    if (!/^\d+$/.test(number) || !Object.hasOwn(assessment.keys, number) || typeof value !== "string" || value.length > 1e3) {
      throw new AssessmentError(400, "An answer is invalid or belongs to another test.");
    }
    clean[Number(number)] = value;
  }
  const result = scoreTest(assessment.parts, clean);
  return { result, band: estimatedBand(result, assessment.skill === "listening" ? "listening" : "reading"), responses: clean };
}

// server/publicPages.ts
var escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function textMarkup(text) {
  return text.split(/\n\s*\n/).map((block) => /^#{1,3}\s/.test(block) ? `<h2>${escapeHtml(block.replace(/^#{1,3}\s/, ""))}</h2>` : `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`).join("");
}
function publicPage(title, description, body, path, noindex = false) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} \xB7 IELTS Studio</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow"}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(path)}"><style>
 :root{font-family:system-ui,sans-serif;color:#14283f;background:#f7f9fa}*{box-sizing:border-box}body{margin:0}a{color:inherit}header{padding:20px 5vw;display:flex;gap:30px;align-items:center;background:#fff;border-bottom:1px solid #e1e7ea;flex-wrap:wrap}header a{text-decoration:none;font-size:14px}header b{font-size:23px;margin-right:auto}main{max-width:1280px;margin:40px auto;padding:0 24px}h1{font-size:clamp(26px,4vw,44px);letter-spacing:-1px}p{line-height:1.8}.answer-layout{display:grid;grid-template-columns:1fr 1fr;gap:28px}.reading,.solutions,article{padding:28px;background:#fff;border:1px solid #e1e7ea;border-radius:16px}.reading{font:19px/1.9 Georgia,serif}.reading h1,.reading h2{text-align:center;font-size:25px}.solution{padding:18px 0;border-bottom:1px solid #e1e7ea}.solution h3{font-size:16px}.answer{font-weight:650;color:#0c645f}.cta{display:inline-block;text-decoration:none;background:#146d69;color:white;border-radius:9px;padding:12px 20px;margin:10px 0 25px}.section-links{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.section-links a{padding:10px;background:white;border:1px solid #e1e7ea;border-radius:8px}img{max-width:100%}[data-slot]{display:inline-block;border-bottom:1px solid #8994a3;min-width:70px}footer{padding:40px;text-align:center;color:#667085}@media(max-width:760px){.answer-layout{grid-template-columns:1fr}.reading,.solutions,article{padding:20px}header{gap:16px}}
 </style></head><body><header><b><a href="/">IELTS studio.</a></b><a href="/practice">Practice Test</a><a href="/full-tests">Full Test</a><a href="/knowledge">Chia s\u1EBB ki\u1EBFn th\u1EE9c</a><a href="/forum">Forum</a><a href="/contribute">\u0110\xF3ng g\xF3p</a></header><main>${body}</main><footer>IELTS Studio \xB7 Learn one step at a time.</footer></body></html>`;
}
function solutionBody(meta, sections) {
  const single = sections.length === 1, title = single ? sections[0].title : meta.title;
  const href = `/tests/${encodeURIComponent(meta.id)}${single ? "/sections/" + encodeURIComponent(sections[0].id) : ""}`;
  return `<p><a href="/practice">Practice Test</a> / ${escapeHtml(meta.source)}</p><h1>${escapeHtml(title)} ${meta.skill === "listening" ? "Listening" : "Reading"} Answers</h1><p>L\xE0m b\xE0i v\xE0 n\u1ED9p b\xE0i \u0111\u1EC3 xem \u0111\xE1p \xE1n c\xF9ng gi\u1EA3i th\xEDch. Trang n\xE0y kh\xF4ng hi\u1EC3n th\u1ECB l\u1EDDi gi\u1EA3i tr\u01B0\u1EDBc khi m\xECnh n\u1ED9p.</p><a class="cta" href="${href}">L\xE0m b\xE0i \u0111\u1EC3 xem l\u1EDDi gi\u1EA3i / Start practice \u2192</a>`;
}

// server/portalRoutes.ts
var idValid = (id) => typeof id === "string" && /^[\w-]{1,128}$/.test(id);
var articleSkills = ["vocabulary", "grammar", "reading", "listening", "speaking", "writing", "resources"];
function validateContribution(body) {
  if (!body || !Array.isArray(body.tests) || !body.tests.length || body.tests.length > 20) throw new AssessmentError(400, "Upload between 1 and 20 test records.");
  if (typeof body.title !== "string" || body.title.trim().length < 3 || body.title.length > 200) throw new AssessmentError(400, "Enter a title between 3 and 200 characters.");
  if (body.tests.some((test) => !test || !Array.isArray(test.parts) || !test.parts.length || test.parts.some((p) => !p || typeof p.passageHtml !== "string" || typeof p.questionHtml !== "string" || !Array.isArray(p.questions)))) throw new AssessmentError(400, "The uploaded test content is incomplete.");
  const content = JSON.stringify(body.tests);
  if (Buffer.byteLength(content, "utf8") > 7e5) throw new AssessmentError(400, "This contribution is too large. Upload a smaller test ZIP (under 700 KB after conversion).");
  return { title: body.title.trim(), content, notes: String(body.notes || "").slice(0, 2e3), digest: createHash("sha256").update(JSON.stringify(body.tests.map((t) => t.parts))).digest("hex") };
}
function registerPortalRoutes(app2, { caller: caller2, backend: backend2, apiError: apiError2 }) {
  const admin = async (req) => {
    const c = await caller2(req);
    if (!c.isAdmin) throw new AssessmentError(403, "Administrator access required.");
    return c;
  };
  app2.post("/api/contributions/create", async (req, res) => {
    try {
      const { identity, db } = await caller2(req), item = validateContribution(req.body);
      const pending = await db.collection("contributions").where("owner", "==", identity.uid).limit(30).get();
      if (pending.docs.filter((d) => d.data().status === "pending").length >= 3) throw new AssessmentError(429, "You already have three contributions awaiting review.");
      const ref = db.doc(`contributions/${item.digest}`);
      const { digest, ...record } = item;
      await ref.create({ ...record, id: item.digest, owner: identity.uid, email: identity.email || "", status: "pending", createdAt: Date.now() });
      res.json({ id: item.digest, status: "pending" });
    } catch (error) {
      if (error?.code === 6) return res.status(409).json({ error: "This content has already been submitted. Each contribution only needs to be submitted once." });
      apiError2(res, error);
    }
  });
  app2.post("/api/contributions/mine", async (req, res) => {
    try {
      const { identity, db } = await caller2(req);
      const snap = await db.collection("contributions").where("owner", "==", identity.uid).limit(30).get();
      res.json({ items: snap.docs.map((d) => {
        const { content, ...item } = d.data();
        return item;
      }).sort((a, b) => b.createdAt - a.createdAt) });
    } catch (e) {
      apiError2(res, e);
    }
  });
  app2.post("/api/admin/contributions", async (req, res) => {
    try {
      const { db } = await admin(req);
      const snap = await db.collection("contributions").where("status", "==", "pending").limit(30).get();
      res.json({ items: snap.docs.map((d) => d.data()).sort((a, b) => a.createdAt - b.createdAt) });
    } catch (e) {
      apiError2(res, e);
    }
  });
  app2.post("/api/admin/contributions/review", async (req, res) => {
    try {
      const { db, identity } = await admin(req);
      const { id, decision } = req.body;
      if (!idValid(id) || !["approved", "rejected"].includes(decision)) throw new AssessmentError(400, "Invalid review decision.");
      await db.runTransaction(async (tx) => {
        const ref = db.doc(`contributions/${id}`), snap = await tx.get(ref), item = snap.data();
        if (!item) throw new AssessmentError(404, "Contribution not found.");
        if (item.status !== "pending") throw new AssessmentError(409, "This contribution has already been reviewed.");
        tx.update(ref, { status: decision, reviewer: identity.uid, reviewedAt: Date.now(), feedback: String(req.body.feedback || "").slice(0, 1e3) });
      });
      res.json({ status: decision });
    } catch (e) {
      apiError2(res, e);
    }
  });
  app2.post("/api/knowledge/list", async (req, res) => {
    try {
      const { db } = backend2();
      const snap = await db.collection("articles").where("status", "==", "published").limit(60).get();
      res.json({ items: snap.docs.map((d) => {
        const { bodyText, ...item } = d.data();
        return item;
      }).sort((a, b) => b.updatedAt - a.updatedAt) });
    } catch (e) {
      apiError2(res, e);
    }
  });
  app2.post("/api/admin/articles/list", async (req, res) => {
    try {
      const { db } = await admin(req);
      const snap = await db.collection("articles").limit(100).get();
      res.json({ items: snap.docs.map((d) => d.data()) });
    } catch (e) {
      apiError2(res, e);
    }
  });
  app2.post("/api/admin/articles/save", async (req, res) => {
    try {
      const { db } = await admin(req), b = req.body;
      if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 200 || typeof b.bodyText !== "string" || !b.bodyText.trim() || b.bodyText.length > 1e5 || !articleSkills.includes(b.skill) || !["0-5", "5-6.5", "6.5-8"].includes(b.level) || !["draft", "published"].includes(b.status)) throw new AssessmentError(400, "Enter a title, content, level, category and publication status.");
      const id = idValid(b.id) ? b.id : randomUUID(), slug = String(b.slug || b.title).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 100) || id;
      await db.doc(`articles/${id}`).set({ id, title: b.title.trim(), bodyText: b.bodyText, excerpt: String(b.excerpt || b.bodyText.slice(0, 180)).slice(0, 250), skill: b.skill, level: b.level, status: b.status, slug, updatedAt: Date.now() });
      res.json({ id });
    } catch (e) {
      apiError2(res, e);
    }
  });
  app2.post("/api/admin/articles/delete", async (req, res) => {
    try {
      const { db } = await admin(req);
      if (!idValid(req.body.id)) throw new AssessmentError(400, "Invalid article.");
      await db.doc(`articles/${req.body.id}`).delete();
      res.json({ deleted: true });
    } catch (e) {
      apiError2(res, e);
    }
  });
  app2.get("/knowledge/:id/:slug", async (req, res) => {
    try {
      if (!idValid(req.params.id)) return res.status(404).send("Article not found");
      const { db } = backend2(), snap = await db.doc(`articles/${req.params.id}`).get(), item = snap.data();
      if (!item || item.status !== "published") return res.status(404).send("Article not found");
      res.set("Cache-Control", "public, max-age=300").type("html").send(publicPage(item.title, item.excerpt, `<p><a href="/knowledge">Ki\u1EBFn th\u1EE9c</a> / ${escapeHtml(item.skill)} \xB7 Level ${escapeHtml(item.level)}</p><article><h1>${escapeHtml(item.title)}</h1>${textMarkup(item.bodyText)}</article>`, `/knowledge/${encodeURIComponent(item.id)}/${encodeURIComponent(item.slug)}`));
    } catch (e) {
      res.status(503).set("Retry-After", "60").send("This article is temporarily unavailable. Please retry.");
    }
  });
  app2.get("/answers/:testId/:sectionId/:slug", async (req, res) => {
    try {
      const { testId, sectionId } = req.params;
      if (!idValid(testId) || !(sectionId === "all" || idValid(sectionId))) return res.status(404).send("Test not found");
      const { db } = backend2(), snap = await db.doc(`tests/${testId}`).get(), meta = snap.data();
      if (!meta || meta.status !== "published") return res.status(404).send("Test not found");
      const sections = (meta.sectionSummaries || []).filter((p) => sectionId === "all" || p.id === sectionId);
      if (sectionId !== "all" && !sections.length) return res.status(404).send("Passage not found. Open the test from the library.");
      const selected = sectionId === "all" ? [] : sections;
      const title = selected.length === 1 ? selected[0].title : meta.title;
      res.set("Cache-Control", "public, max-age=300").type("html").send(publicPage(`${title} ${meta.skill === "reading" ? "Reading" : "Listening"} Answers`, `Practise ${title} and submit to review answers.`, solutionBody({ ...meta, id: testId }, selected), answerPath(testId, sectionId, title)));
    } catch (e) {
      res.status(503).set("Retry-After", "60").send("Solutions are temporarily unavailable. Please retry.");
    }
  });
  let sitemapCache;
  app2.get("/sitemap.xml", async (req, res) => {
    try {
      if (sitemapCache && Date.now() < sitemapCache.until) return res.type("xml").send(sitemapCache.xml);
      const origin = process.env.PUBLIC_SITE_URL;
      if (!origin || !/^https:\/\/[^/]+\/?$/.test(origin)) return res.status(503).send("Set PUBLIC_SITE_URL to the deployed HTTPS origin.");
      const { db } = backend2(), snap = await db.collection("tests").where("status", "==", "published").limit(3e3).get();
      const urls = ["/", "/practice", "/full-tests", "/knowledge"];
      for (const d of snap.docs) {
        const t = d.data();
        urls.push(answerPath(d.id, "all", t.title));
        for (const p of t.sectionSummaries || []) urls.push(answerPath(d.id, p.id, p.title));
      }
      const articles = await db.collection("articles").where("status", "==", "published").limit(1e3).get();
      for (const d of articles.docs) urls.push(`/knowledge/${d.id}/${d.data().slug}`);
      const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((path) => `<url><loc>${escapeHtml(origin.replace(/\/$/, "") + path)}</loc></url>`).join("")}</urlset>`;
      sitemapCache = { until: Date.now() + 36e5, xml };
      res.set("Cache-Control", "public,max-age=3600").type("xml").send(xml);
    } catch (e) {
      res.status(503).send("Sitemap temporarily unavailable.");
    }
  });
  app2.get("/robots.txt", (_req, res) => res.type("text").send(`User-agent: *
Disallow: /admin
Disallow: /history
Disallow: /api/
${process.env.PUBLIC_SITE_URL ? "Sitemap: " + process.env.PUBLIC_SITE_URL.replace(/\/$/, "") + "/sitemap.xml" : ""}`));
}

// server/app.ts
import express from "express";

// server/identity.ts
async function verifyIdentity(verify, token) {
  try {
    return await verify(token);
  } catch (error) {
    const code = error?.code || "";
    if ([
      "auth/id-token-expired",
      "auth/id-token-revoked",
      "auth/invalid-id-token",
      "auth/argument-error",
      "auth/user-disabled"
    ].includes(code)) {
      throw new AssessmentError(
        401,
        "Your sign-in needs refreshing. Retry, or sign in again. Your answers are saved."
      );
    }
    throw new AssessmentError(
      503,
      "The server could not verify your account. The administrator must check the Firebase server configuration. Your answers are saved."
    );
  }
}

// server/app.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import {
  initializeApp,
  getApps,
  applicationDefault,
  cert
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "gen-lang-client-0464915880",
  appId: "1:310644168805:web:b902576053847fd0270e8c",
  apiKey: "AIzaSyCjLMcQfdVlJZflj7cvpJgfQC3LZK5X4A4",
  authDomain: "gen-lang-client-0464915880.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-6abc46ea-ea84-43c5-a465-f4d4d4b1e2da",
  storageBucket: "gen-lang-client-0464915880.firebasestorage.app",
  messagingSenderId: "310644168805",
  measurementId: "",
  oAuthClientId: "310644168805-33rflel9o171jelmvfltur2tnji8gtf1.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// server/app.ts
dotenv.config();
var app = express();
app.use(express.json({ limit: "4mb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "ielts-studio-api" }));
function parseServiceAccount(raw) {
  let text = raw.trim();
  if (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'")) {
    text = text.slice(1, -1).trim();
  }
  if (!text.startsWith("{")) {
    try {
      const decoded = Buffer.from(text, "base64").toString("utf8");
      if (decoded.trim().startsWith("{")) {
        text = decoded.trim();
      }
    } catch {
    }
  }
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}
function getFirebaseCredential() {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (rawKey) {
    try {
      const account = parseServiceAccount(rawKey);
      return cert(account);
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e);
    }
  }
  return applicationDefault();
}
function backend() {
  const instance = getApps().find((a) => a.name === "READING_SERVER") || initializeApp(
    {
      credential: getFirebaseCredential(),
      projectId: firebase_applet_config_default.projectId,
      storageBucket: firebase_applet_config_default.storageBucket
    },
    "READING_SERVER"
  );
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || firebase_applet_config_default.storageBucket || `${firebase_applet_config_default.projectId}.firebasestorage.app`;
  return {
    auth: getAuth(instance),
    bucket: getStorage(instance).bucket(bucketName),
    db: getFirestore(
      instance,
      firebase_applet_config_default.firestoreDatabaseId || "(default)"
    )
  };
}
async function caller(req) {
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization || "")?.[1];
  if (!token) throw new AssessmentError(401, "Sign in to continue.");
  const { auth, db } = backend();
  const identity = await verifyIdentity(
    (value) => auth.verifyIdToken(value),
    token
  );
  const profile = await db.doc(`users/${identity.uid}`).get();
  if (profile.data()?.status === "suspended")
    throw new AssessmentError(403, "This account is suspended.");
  const isAdmin = identity.email === "manhcuong2006ht@gmail.com" && identity.email_verified === true;
  return { identity, isAdmin, db, profile };
}
async function optionalCaller(req) {
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization || "")?.[1];
  const { auth, db } = backend();
  if (!token) {
    return { identity: null, isAdmin: false, db };
  }
  const identity = await verifyIdentity(
    (value) => auth.verifyIdToken(value),
    token
  );
  const profile = await db.doc(`users/${identity.uid}`).get();
  if (profile.data()?.status === "suspended")
    throw new AssessmentError(403, "This account is suspended.");
  const isAdmin = identity.email === "manhcuong2006ht@gmail.com" && identity.email_verified === true;
  return { identity, isAdmin, db };
}
function apiError(res, error) {
  if (error instanceof AssessmentError)
    return res.status(error.status).json({ error: error.message });
  console.error("Backend request failed:", error);
  const backendCode = error?.code;
  const message = error?.message || "";
  const details = error?.details || "";
  if (backendCode === 7 || backendCode === "permission-denied" || backendCode === "PERMISSION_DENIED" || message.includes("PERMISSION_DENIED") || details.includes("PERMISSION_DENIED")) {
    return res.status(503).json({
      code: "FIREBASE_SERVER_PERMISSION_DENIED",
      error: "The scoring server does not have permission to access the Firebase database. Grant its runtime service account the Cloud Datastore User role in the Firebase project, then retry. Changing Firestore Rules will not fix this server permission."
    });
  }
  return res.status(503).json({
    error: "The scoring service is unavailable. Please retry or ask the administrator to check the server Firebase credentials."
  });
}
function assessmentStore(db) {
  return {
    test: async (id) => (await db.doc(`tests/${id}`).get()).data(),
    keys: async (id) => (await db.doc(`test_keys/${id}`).get()).data(),
    sections: async (id) => (await db.collection(`tests/${id}/sections`).get()).docs.map((d) => ({
      ...d.data(),
      id: d.id
    }))
  };
}
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});
app.post("/api/auth/sync", async (req, res) => {
  try {
    const { identity, isAdmin, db, profile } = await caller(req);
    if (!profile.exists)
      await db.doc(`users/${identity.uid}`).set({
        id: identity.uid,
        email: identity.email || "",
        name: identity.name || "Learner",
        target: 7.5,
        language: "en",
        theme: "light",
        fontSize: 16,
        favorites: [],
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    res.json({
      role: isAdmin ? "admin" : "student",
      status: profile.data()?.status || "active"
    });
  } catch (error) {
    apiError(res, error);
  }
});
app.post("/api/dictionary", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY)
      throw new AssessmentError(503, "Dictionary lookup is not configured.");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const { text, context, language = "en" } = req.body;
    if (!text || typeof text !== "string" || text.length > 500 || context && (typeof context !== "string" || context.length > 5e3)) {
      return res.status(400).json({ error: "Text is required for dictionary lookup" });
    }
    const prompt = `You are a world-class IELTS Academic English lexicographer.
Explain the word or phrase "${text}" as used in this context:
"${context || text}"

Provide the output in pure JSON format without markdown code blocks.
Fields required:
- "word": "${text}",
- "partOfSpeech": "noun" | "verb" | "adjective" | "adverb" | "phrase",
- "meaning": clear concise definition ${language === "vi" ? "written in Vietnamese with Vietnamese translation and explanation" : "written in clear English with nuance"},
- "example": a high-quality illustrative sentence matching IELTS style`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    res.json({
      word: parsed.word || text,
      partOfSpeech: parsed.partOfSpeech || "word",
      meaning: parsed.meaning || "No definition available",
      example: parsed.example || context || ""
    });
  } catch (error) {
    if (error instanceof AssessmentError) return apiError(res, error);
    console.error("Dictionary API error:", error);
    res.json({
      word: req.body.text,
      partOfSpeech: "phrase",
      meaning: req.body.language === "vi" ? "Kh\uFFFDng th? tra t? t? d?ng l\uFFFDc n\uFFFDy." : "Automatic lookup unavailable.",
      example: req.body.context || ""
    });
  }
});
app.post("/api/test-review", async (req, res) => {
  try {
    const { db, isAdmin } = await optionalCaller(req);
    if (req.body.mode !== "practice")
      throw new AssessmentError(
        403,
        "Submit the exam before viewing solutions."
      );
    const assessment = await loadAssessment(
      assessmentStore(db),
      req.body,
      isAdmin
    );
    res.json({ keys: assessment.keys, transcripts: assessment.transcripts });
  } catch (error) {
    apiError(res, error);
  }
});
app.post("/api/submit-exam", async (req, res) => {
  try {
    const { isAdmin, db } = await optionalCaller(req);
    const mode = req.body.mode;
    if (!["exam", "practice"].includes(mode))
      throw new AssessmentError(400, "Invalid test mode.");
    const assessment = await loadAssessment(
      assessmentStore(db),
      req.body,
      isAdmin
    );
    const { result, band, responses } = markAssessment(
      assessment,
      req.body.responses || {}
    );
    const attemptId = typeof req.body.attemptId === "string" && /^[\w-]{1,128}$/.test(req.body.attemptId) ? req.body.attemptId : randomUUID2();
    res.json({ attemptId, result, band, keys: assessment.keys, transcripts: assessment.transcripts });
  } catch (error) {
    apiError(res, error);
  }
});
app.post("/api/admin/user-status", async (req, res) => {
  try {
    const { db, isAdmin } = await caller(req);
    if (!isAdmin)
      throw new AssessmentError(403, "Administrator access required.");
    const { targetUserId, newStatus } = req.body;
    if (typeof targetUserId !== "string" || !/^[\w-]{1,128}$/.test(targetUserId) || !["active", "suspended"].includes(newStatus)) {
      throw new AssessmentError(400, "Invalid user or status.");
    }
    await db.doc(`users/${targetUserId}`).update({ status: newStatus, updatedAt: Date.now() });
    res.json({ success: true, targetUserId, status: newStatus });
  } catch (error) {
    apiError(res, error);
  }
});
app.post("/api/admin/storage-usage", async (req, res) => {
  try {
    const { isAdmin } = await caller(req);
    if (!isAdmin) throw new AssessmentError(403, "Administrator access required.");
    const { bucket } = backend();
    let targetBucket = bucket;
    const files = [];
    let query = { autoPaginate: false, maxResults: 1e3 };
    try {
      do {
        const [page, next] = await targetBucket.getFiles(query);
        files.push(...page.map((file) => ({ name: file.name, size: Number(file.metadata.size) || 0 })));
        query = next;
      } while (query && files.length < 1e4);
    } catch (primaryErr) {
      if ((primaryErr?.code === 404 || primaryErr?.message?.includes("does not exist")) && targetBucket.name.endsWith(".firebasestorage.app")) {
        const fallbackBucket = getStorage(getApps().find((a) => a.name === "READING_SERVER")).bucket(`${firebase_applet_config_default.projectId}.appspot.com`);
        try {
          query = { autoPaginate: false, maxResults: 1e3 };
          do {
            const [page, next] = await fallbackBucket.getFiles(query);
            files.push(...page.map((file) => ({ name: file.name, size: Number(file.metadata.size) || 0 })));
            query = next;
          } while (query && files.length < 1e4);
          targetBucket = fallbackBucket;
        } catch {
          throw primaryErr;
        }
      } else {
        throw primaryErr;
      }
    }
    res.json({
      ...summarizeFiles(files),
      truncated: Boolean(query),
      scannedAt: Date.now(),
      bucket: targetBucket.name
    });
  } catch (error) {
    console.error("Storage inventory failed:", error);
    if (error instanceof AssessmentError) {
      return res.status(error.status).json({ error: error.message });
    }
    const err = error;
    const code = err?.code;
    const message = err?.message || "";
    const details = err?.details || "";
    const bucketName = firebase_applet_config_default.storageBucket || `${firebase_applet_config_default.projectId}.firebasestorage.app`;
    let userMessage = "Uploaded file sizes are unavailable. The owner needs to configure server Firebase credentials with Storage Object Viewer access. Test content can still be measured below.";
    let diagnosticCode = "STORAGE_UNAVAILABLE";
    if (code === 404 || message.includes("The specified bucket does not exist") || message.includes("Not Found")) {
      userMessage = `Storage bucket '${bucketName}' was not found. Please ensure Cloud Storage is initialized in Firebase Console for project '${firebase_applet_config_default.projectId}'.`;
      diagnosticCode = "BUCKET_NOT_FOUND";
    } else if (code === 403 || code === 7 || code === "permission-denied" || code === "PERMISSION_DENIED" || message.includes("PERMISSION_DENIED") || message.includes("permission") || details.includes("storage.objects.list") || details.includes("PERMISSION_DENIED")) {
      userMessage = `Service account does not have permission to list objects in bucket '${bucketName}'. Grant the 'Storage Object Viewer' (roles/storage.objectViewer) role in Google Cloud IAM.`;
      diagnosticCode = "STORAGE_PERMISSION_DENIED";
    } else if (message.includes("Could not load the default credentials") || message.includes("FIREBASE_SERVICE_ACCOUNT_JSON") || message.includes("credential")) {
      userMessage = "Firebase Admin credentials missing or invalid on server. Ensure FIREBASE_SERVICE_ACCOUNT_JSON is set in Vercel environment variables.";
      diagnosticCode = "CREDENTIALS_MISSING";
    }
    res.status(503).json({
      error: userMessage,
      code: diagnosticCode,
      bucket: bucketName
    });
  }
});
var reportLimits = /* @__PURE__ */ new Map();
app.post("/api/content-report", async (req, res) => {
  try {
    const { db, identity } = await optionalCaller(req);
    const { testId, message, question, category } = req.body;
    if (typeof testId !== "string" || !/^[-\w]{1,128}$/.test(testId) || typeof message !== "string" || !message.trim() || message.length > 3e3) throw new AssessmentError(400, "Please describe the issue in up to 3000 characters.");
    const key = req.ip || "unknown", now = Date.now();
    if (reportLimits.size > 1e4) {
      for (const [id2, entry2] of reportLimits) if (entry2.until < now) reportLimits.delete(id2);
    }
    const entry = reportLimits.get(key);
    if (entry && entry.until > now && entry.count >= 10) throw new AssessmentError(429, "Please wait before sending another report.");
    reportLimits.set(key, { count: entry && entry.until > now ? entry.count + 1 : 1, until: entry && entry.until > now ? entry.until : now + 6e5 });
    const meta = await db.doc(`tests/${testId}`).get();
    if (meta.data()?.status !== "published") throw new AssessmentError(404, "This test is unavailable.");
    const id = randomUUID2();
    await db.doc(`reports/${id}`).set({ id, owner: identity?.uid || "guest", testId, testTitle: meta.data()?.title || "", message: message.trim(), question: Number.isInteger(question) ? question : 0, category: typeof category === "string" ? category.slice(0, 80) : "content", status: "open", createdAt: now });
    res.json({ success: true });
  } catch (error) {
    apiError(res, error);
  }
});
registerPortalRoutes(app, { caller, backend, apiError });
app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found. Check that the Express backend is deployed.", code: "API_ROUTE_NOT_FOUND" }));
var app_default = app;
export {
  app_default as default
};
