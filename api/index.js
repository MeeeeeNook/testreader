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
  if (result.total !== 40 || result.ungraded > 0 || !Number.isInteger(result.correct) || result.correct < 0 || result.correct > 40 || result.gradable !== void 0 && result.gradable !== 40) return null;
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

// src/services/websiteUI.ts
var defaultWebsiteUI = { heroTitle: "Prepare for IELTS. Practise at your pace.", heroDescription: "Practise reading and listening. Check your answers and review the explanations.", showFullTestMenu: true, blocks: [
  { id: "reading", title: "Reading practice", description: "Explore passages and build your reading skills.", href: "/practice?skill=reading", icon: "reading", visible: true },
  { id: "listening", title: "Listening practice", description: "Choose a part, listen and review your answers.", href: "/practice?skill=listening", icon: "listening", visible: true },
  { id: "full", title: "Full tests", description: "Complete a Reading or Listening test from start to finish.", href: "/full-tests", icon: "full", visible: true },
  { id: "mix", title: "Mix your own test", description: "Choose the passages and parts you want to practise.", href: "/mock", icon: "mix", visible: true }
] };
function normalizeWebsiteUI(input) {
  const v = input && typeof input === "object" ? input : {};
  const text = (x, fallback, max) => typeof x === "string" && x.trim() ? x.trim().slice(0, max) : fallback;
  const blocks = Array.isArray(v.blocks) ? v.blocks.slice(0, 12).map((b, i) => ({ id: "block-" + i, title: text(b?.title, "Practice", 80), description: text(b?.description, "Choose your next test.", 200), href: typeof b?.href === "string" && /^\/(?!\/)[^\s\\]*$/.test(b.href) && b.href.length <= 500 ? b.href : "/practice", icon: ["reading", "listening", "full", "mix"].includes(b?.icon) ? b.icon : "reading", visible: b?.visible !== false })) : defaultWebsiteUI.blocks.map((b) => ({ ...b }));
  return { heroTitle: text(v.heroTitle, defaultWebsiteUI.heroTitle, 160), heroDescription: text(v.heroDescription, defaultWebsiteUI.heroDescription, 400), showFullTestMenu: v.showFullTestMenu !== false, blocks };
}

// server/websiteUIRoutes.ts
function registerWebsiteUIRoutes(app2, authorize, backend2, fail) {
  app2.get("/api/website-ui", async (_req, res) => {
    try {
      const doc = await backend2().db.doc("site_settings/website_ui").get();
      res.set("Cache-Control", "public, max-age=60, s-maxage=60");
      res.json(normalizeWebsiteUI(doc.data()));
    } catch (e) {
      fail(res, e);
    }
  });
  app2.post("/api/admin/website-ui", async (req, res) => {
    try {
      const user = await authorize(req);
      if (!user.isAdmin) throw new AssessmentError(403, "Administrator access required.");
      const settings = normalizeWebsiteUI(req.body);
      await backend2().db.doc("site_settings/website_ui").set(settings);
      res.json(settings);
    } catch (e) {
      fail(res, e);
    }
  });
}

// server/r2Storage.ts
import { createHash, createHmac } from "node:crypto";
var MediaStorageError = class extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
};
var r2Fields = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_BASE_URL"];
function readR2Config(env = process.env) {
  if (!r2Fields.some((key) => env[key])) return null;
  const missing = r2Fields.filter((key) => !env[key]?.trim());
  if (missing.length) throw new MediaStorageError("R2_SETUP_INCOMPLETE", "Missing server settings: " + missing.join(", ") + ". Add these in Vercel, then redeploy.");
  const publicUrl = new URL(env.R2_PUBLIC_BASE_URL);
  if (publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) throw new MediaStorageError("R2_INVALID_CONFIG", "R2_PUBLIC_BASE_URL must be a public HTTPS URL without credentials or query parameters.");
  if (!/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID) || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET_NAME)) throw new MediaStorageError("R2_INVALID_CONFIG", "Check the R2 account ID and bucket name.");
  return { accountId: env.R2_ACCOUNT_ID, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, bucket: env.R2_BUCKET_NAME, publicUrl: publicUrl.href.replace(/\/$/, "") };
}
var encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase());
var hash = (value) => createHash("sha256").update(value).digest("hex");
var hmac = (key, value) => createHmac("sha256", key).update(value).digest();
function presign(url, method, credentials, headers = {}, now = /* @__PURE__ */ new Date(), expires = 600, region = "auto") {
  const result = new URL(url), timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, ""), day = timestamp.slice(0, 8), scope = day + "/" + region + "/s3/aws4_request";
  const normalized = Object.fromEntries(Object.entries({ host: result.host, ...headers }).map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, " ")]));
  const names = Object.keys(normalized).sort();
  result.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  result.searchParams.set("X-Amz-Credential", credentials.accessKeyId + "/" + scope);
  result.searchParams.set("X-Amz-Date", timestamp);
  result.searchParams.set("X-Amz-Expires", String(expires));
  result.searchParams.set("X-Amz-SignedHeaders", names.join(";"));
  const query = [...result.searchParams.entries()].map(([key, value]) => [encode(key), encode(value)]).sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0).map(([key, value]) => key + "=" + value).join("&");
  const canonical = [method, result.pathname, query, names.map((name) => name + ":" + normalized[name] + "\n").join(""), names.join(";"), "UNSIGNED-PAYLOAD"].join("\n");
  const signingKey = hmac(hmac(hmac(hmac("AWS4" + credentials.secretAccessKey, day), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update("AWS4-HMAC-SHA256\n" + timestamp + "\n" + scope + "\n" + hash(canonical)).digest("hex");
  result.search = query + "&X-Amz-Signature=" + signature;
  return result.href;
}
function objectUrl(config, key) {
  return new URL("https://" + config.accountId + ".r2.cloudflarestorage.com/" + encode(config.bucket) + "/" + key.split("/").map(encode).join("/"));
}
var mediaTypes = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "audio/ogg": "ogg", "audio/aac": "aac", "audio/flac": "flac", "audio/webm": "webm", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
function validateMedia(input) {
  const type = String(input?.contentType || "").toLowerCase(), size = Number(input?.size), digest = String(input?.sha256 || "");
  if (!mediaTypes[type] || !Number.isSafeInteger(size) || size <= 0 || size > (type.startsWith("audio/") ? 150 : 15) * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(digest)) throw new MediaStorageError("INVALID_MEDIA", "Choose a supported audio file up to 150 MB or image up to 15 MB.", 400);
  return { type, size, key: (type.startsWith("audio/") ? "audio" : "images") + "/" + digest + "." + mediaTypes[type] };
}
async function head(config, key, fetcher) {
  let response;
  try {
    response = await fetcher(presign(objectUrl(config, key), "HEAD", config), { method: "HEAD", signal: AbortSignal.timeout(15e3) });
  } catch {
    throw new MediaStorageError("R2_CONNECTION_FAILED", "Cannot reach Cloudflare R2. Check the account ID and server network connection.");
  }
  if (response.status === 403 || response.status === 401) throw new MediaStorageError("R2_ACCESS_DENIED", "R2 rejected the server credentials. Use a bucket-scoped Object Read & Write token.");
  if (response.status !== 404 && !response.ok) throw new MediaStorageError("R2_HTTP_" + response.status, "R2 storage check failed (HTTP " + response.status + "). Check the bucket name and R2 access.");
  return response;
}
async function prepareR2Upload(config, input, fetcher = fetch, now = /* @__PURE__ */ new Date()) {
  const media = validateMedia(input), existing = await head(config, media.key, fetcher), headers = { "Content-Type": media.type };
  if (existing.ok && Number(existing.headers.get("content-length")) !== media.size) throw new MediaStorageError("R2_OBJECT_MISMATCH", "The stored recording size differs from this file. Contact the site owner.", 409);
  return { provider: "r2", exists: existing.ok, publicUrl: config.publicUrl + "/" + media.key, headers, ...!existing.ok ? { uploadUrl: presign(objectUrl(config, media.key), "PUT", config, headers, now) } : {} };
}
async function checkR2(config, fetcher = fetch) {
  await head(config, "__ielts_connection_check__", fetcher);
  return { provider: "r2", ready: true, bucket: config.bucket, message: "R2 credentials accepted. Browser uploads also require the bucket CORS policy and public read access." };
}
var xmlText = (value) => value.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" })[entity]);
async function listR2Files(config, fetcher = fetch) {
  const files = [];
  let continuation = "", truncated = false;
  const started = Date.now();
  do {
    const url = new URL("https://" + config.accountId + ".r2.cloudflarestorage.com/" + encode(config.bucket));
    url.searchParams.set("list-type", "2");
    url.searchParams.set("max-keys", "1000");
    if (continuation) url.searchParams.set("continuation-token", continuation);
    const response = await fetcher(presign(url, "GET", config), { signal: AbortSignal.timeout(15e3) });
    if (!response.ok) throw new MediaStorageError("R2_INVENTORY_FAILED", "Cannot list R2 files (HTTP " + response.status + "). Check the token read/list permissions.");
    const xml = await response.text();
    for (const item of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const name = /<Key>([\s\S]*?)<\/Key>/.exec(item[1])?.[1], size = /<Size>(\d+)<\/Size>/.exec(item[1])?.[1];
      if (name !== void 0 && size !== void 0) files.push({ name: xmlText(name), size: Number(size) });
    }
    truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    continuation = xmlText(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] || "");
    if (truncated && !continuation) throw new MediaStorageError("R2_INVENTORY_RESPONSE", "R2 returned an incomplete listing without a continuation token.");
  } while (truncated && files.length < 1e4 && Date.now() - started < 2e4);
  return { files, truncated };
}

// server/trashRoutes.ts
function managedMedia(value, config, bucketName) {
  const found = /* @__PURE__ */ new Set();
  const walk = (v) => {
    if (typeof v === "string") for (const raw of v.match(/https:\/\/[^\s<>"']+/g) || []) {
      try {
        const url = new URL(raw.replace(/&amp;/g, "&"));
        if (config && url.origin === new URL(config.publicUrl).origin && url.pathname.startsWith(new URL(config.publicUrl).pathname.replace(/\/$/, "") + "/")) {
          const prefix = new URL(config.publicUrl).pathname.replace(/\/$/, "") + "/";
          const key = decodeURIComponent(url.pathname.slice(prefix.length));
          if (/^(audio|images)\/[a-f0-9]{64}\.[a-z0-9]{2,5}$/.test(key)) found.add("r2:" + key);
        }
        const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(url.pathname);
        if (url.hostname === "firebasestorage.googleapis.com" && match && decodeURIComponent(match[1]) === bucketName) {
          const key = decodeURIComponent(match[2]);
          if (/^(?:media\/(?:audio|images)\/|tests\/[\w-]+\/images\/)/.test(key) && !key.includes("..")) found.add("firebase:" + key);
        }
      } catch {
      }
    }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return found;
}
function unreferencedMedia(target, others) {
  return [...target].filter((key) => !others.has(key));
}
function registerTrashRoutes(app2, authorize, backend2, fail) {
  app2.post("/api/admin/trash-delete", async (req, res) => {
    try {
      const caller2 = await authorize(req);
      if (!caller2.isAdmin) throw new AssessmentError(403, "Administrator access required.");
      const values = Array.isArray(req.body?.testIds) ? req.body.testIds : [req.body?.testId];
      if (!values.length || values.length > 25 || values.some((id) => typeof id !== "string" || !/^[-\w]{1,128}$/.test(id)) || req.body.confirm !== "DELETE") throw new AssessmentError(400, "Choose up to 25 trashed tests and confirm permanent deletion.");
      const ids = new Set(values), { db, bucket } = backend2();
      const config = readR2Config();
      const lock = db.doc("site_settings/trash_cleanup"), lease = Date.now() + 12e4;
      await db.runTransaction(async (tx) => {
        const current = await tx.get(lock);
        if ((current.data()?.until || 0) > Date.now()) throw new AssessmentError(409, "Another cleanup is running. Please retry shortly.");
        tx.set(lock, { until: lease });
      });
      try {
        const [all, parts, keys] = await Promise.all([db.collection("tests").get(), db.collectionGroup("sections").get(), db.collection("test_keys").get()]), target = /* @__PURE__ */ new Set(), others = /* @__PURE__ */ new Set();
        const selected = all.docs.filter((d) => ids.has(d.id));
        if (selected.some((d) => !d.data()?.deletedAt)) throw new AssessmentError(409, "Only tests in Trash can be permanently deleted.");
        const retainedIds = new Set(all.docs.map((d) => d.id));
        const collect = (testId, data) => {
          if (!retainedIds.has(testId)) return;
          for (const key of managedMedia(data, config, bucket.name)) (ids.has(testId) ? target : others).add(key);
        };
        for (const test of all.docs) collect(test.id, test.data());
        for (const part of parts.docs) {
          const match = /^tests\/([^/]+)\/sections\/[^/]+$/.exec(part.ref.path);
          if (match) collect(match[1], part.data());
        }
        for (const key of keys.docs) collect(key.id, key.data());
        let deletedMedia = 0;
        const deadline = Date.now() + 2e4;
        for (const media of unreferencedMedia(target, others)) {
          if (Date.now() > deadline) throw new AssessmentError(503, "Cleanup is taking longer than expected. Some unused files are already removed; retry to finish permanent deletion.");
          try {
            if (media.startsWith("r2:") && config) {
              const response = await fetch(presign(objectUrl(config, media.slice(3)), "DELETE", config), { method: "DELETE", signal: AbortSignal.timeout(8e3) });
              if (!response.ok && response.status !== 404) throw new AssessmentError(503, "Media cleanup failed (R2 HTTP " + response.status + "). Cleanup may be partial. Retry to finish permanent deletion.");
            } else await bucket.file(media.slice(9)).delete({ ignoreNotFound: true });
          } catch (e) {
            if (e instanceof AssessmentError) throw e;
            throw new AssessmentError(503, "Storage cleanup could not finish. Check your storage connection and permissions, then retry permanent deletion.");
          }
          deletedMedia++;
        }
        for (const test of selected) {
          await db.doc("test_keys/" + test.id).delete();
          await db.recursiveDelete(db.doc("tests/" + test.id));
        }
        res.json({ success: true, deletedTestIds: selected.map((d) => d.id), deletedMedia, retainedSharedMedia: target.size - unreferencedMedia(target, others).length });
      } finally {
        await db.runTransaction(async (tx) => {
          const current = await tx.get(lock);
          if (current.data()?.until === lease) tx.delete(lock);
        });
      }
    } catch (e) {
      fail(res, e instanceof MediaStorageError ? new AssessmentError(e.status, e.message) : e);
    }
  });
}

// server/studentRoutes.ts
var valid = (uid) => typeof uid === "string" && /^[\w-]{1,128}$/.test(uid);
function registerStudentRoutes(app2, authorize, backend2, fail) {
  const owner = async (req) => {
    const caller2 = await authorize(req);
    if (!caller2.isAdmin) throw new AssessmentError(403, "Administrator access required.");
    if (!valid(req.body.targetUserId)) throw new AssessmentError(400, "Invalid student ID.");
    return caller2;
  };
  app2.post("/api/admin/student-details", async (req, res) => {
    try {
      await owner(req);
      const user = await backend2().auth.getUser(req.body.targetUserId);
      res.json({ uid: user.uid, email: user.email || "", createdAt: Date.parse(user.metadata.creationTime) || null, lastSignInAt: Date.parse(user.metadata.lastSignInTime) || null, disabled: user.disabled, emailVerified: user.emailVerified, providers: user.providerData.map((p) => p.providerId) });
    } catch (e) {
      fail(res, e);
    }
  });
  app2.post("/api/admin/student-delete", async (req, res) => {
    try {
      const caller2 = await owner(req), { auth, db } = backend2(), uid = req.body.targetUserId;
      const user = await auth.getUser(uid);
      if (uid === caller2.identity.uid || user.email?.toLowerCase() === "manhcuong2006ht@gmail.com") throw new AssessmentError(403, "The owner account cannot be deleted.");
      if (!user.email || req.body.confirmEmail !== user.email) throw new AssessmentError(400, "Type the student email exactly to confirm deletion.");
      const ref = db.doc("users/" + uid);
      await ref.set({ id: uid, status: "suspended", updatedAt: Date.now() }, { merge: true });
      await auth.updateUser(uid, { disabled: true });
      await auth.revokeRefreshTokens(uid);
      for (const name of ["attempts", "vocabulary"]) await db.recursiveDelete(ref.collection(name));
      await auth.deleteUser(uid);
      await ref.set({ id: uid, status: "suspended", deletedAt: Date.now() });
      res.json({ success: true, uid });
    } catch (e) {
      fail(res, e);
    }
  });
}

// server/mediaRoutes.ts
function registerMediaRoutes(app2, authorize, firebaseBucket) {
  const fail = (res, error) => {
    const code = error?.code, status = error?.status;
    if (error instanceof MediaStorageError) return res.status(error.status).json({ code: error.code, error: "[" + error.code + "] " + error.message });
    if (status === 401 || status === 403) return res.status(status).json({ error: error.message });
    return res.status(503).json({ code: "MEDIA_STORAGE_UNAVAILABLE", error: "Storage connection check failed. Check server credentials and the storage configuration." });
  };
  app2.post("/api/admin/media/config", async (req, res) => {
    try {
      await authorize(req);
      const config = readR2Config();
      res.json({ provider: config ? "r2" : "firebase", ready: !!config, message: config ? "Cloudflare R2 is configured." : "R2 is not configured. Firebase Storage is currently used." });
    } catch (error) {
      fail(res, error);
    }
  });
  app2.post("/api/admin/media/check", async (req, res) => {
    try {
      await authorize(req);
      const config = readR2Config();
      if (config) {
        res.json(await checkR2(config));
        return;
      }
      try {
        let timer;
        try {
          await Promise.race([firebaseBucket().getMetadata(), new Promise((_, reject) => {
            timer = setTimeout(() => reject(new MediaStorageError("FIREBASE_STORAGE_TIMEOUT", "Firebase bucket check timed out. Check whether Storage is enabled and the configured bucket exists.")), 15e3);
            timer.unref?.();
          })]);
        } finally {
          clearTimeout(timer);
        }
        res.json({ provider: "firebase", ready: true, message: "Firebase bucket exists and the server can access it. A browser-only upload failure can still indicate CORS, App Check or Storage rules." });
      } catch (error) {
        const code = error?.code;
        if (code === 404) throw new MediaStorageError("FIREBASE_BUCKET_NOT_FOUND", "The configured Firebase Storage bucket does not exist. Enable Storage with a valid bucket, or configure Cloudflare R2.");
        if (code === 403) throw new MediaStorageError("FIREBASE_STORAGE_ACCESS_DENIED", "The server cannot access this Firebase bucket. Check IAM, enabled Storage and the billing plan.");
        throw error;
      }
    } catch (error) {
      fail(res, error);
    }
  });
  app2.post("/api/admin/media/prepare", async (req, res) => {
    try {
      await authorize(req);
      const config = readR2Config();
      if (!config) {
        res.json({ provider: "firebase" });
        return;
      }
      res.json(await prepareR2Upload(config, req.body));
    } catch (error) {
      fail(res, error);
    }
  });
}

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
import { createHash as createHash2, randomUUID } from "node:crypto";

// server/publicPages.ts
var escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function textMarkup(text) {
  return text.split(/\n\s*\n/).map((block) => /^#{1,3}\s/.test(block) ? `<h2>${escapeHtml(block.replace(/^#{1,3}\s/, ""))}</h2>` : `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`).join("");
}
function publicPage(title, description, body, path, noindex = false) {
  return `<!doctype html><html lang="vi"><head><link rel="icon" type="image/svg+xml" href="/favicon.svg"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} \xB7 IELTS Studio</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow"}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(path)}"><style>
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
  return { title: body.title.trim(), content, notes: String(body.notes || "").slice(0, 2e3), digest: createHash2("sha256").update(JSON.stringify(body.tests.map((t) => t.parts))).digest("hex") };
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
registerStudentRoutes(app, caller, backend, apiError);
registerWebsiteUIRoutes(app, caller, backend, apiError);
registerTrashRoutes(app, caller, backend, apiError);
registerMediaRoutes(app, async (req) => {
  const identity = await caller(req);
  if (!identity.isAdmin) throw new AssessmentError(403, "Administrator access required.");
  return identity;
}, () => backend().bucket);
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
    const r2 = readR2Config();
    if (r2) {
      const inventory = await listR2Files(r2);
      res.json({ ...summarizeFiles(inventory.files), truncated: inventory.truncated, provider: "r2", bucket: r2.bucket, scannedAt: Date.now() });
      return;
    }
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
    if (error instanceof MediaStorageError) {
      res.status(error.status).json({ code: error.code, error: `[${error.code}] ${error.message}` });
      return;
    }
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
