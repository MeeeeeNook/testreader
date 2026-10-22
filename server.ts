import { registerPortalRoutes } from "./server/portalRoutes";
import express from "express";
import { verifyIdentity } from "./server/identity";
import { randomUUID } from "node:crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import {
  initializeApp,
  getApps,
  applicationDefault,
  cert,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  loadAssessment,
  markAssessment,
  AssessmentError,
  type AssessmentStore,
} from "./server/assessment.ts";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "50mb" }));

// Server-only credentials use Application Default Credentials. Never expose a service-account key to Vite.
function backend() {
  const instance =
    getApps().find((a) => a.name === "READING_SERVER") ||
    initializeApp(
      {
        credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON
          ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
          : applicationDefault(),
        projectId: firebaseConfig.projectId,
      },
      "READING_SERVER",
    );
  return {
    auth: getAuth(instance),
    db: getFirestore(
      instance,
      firebaseConfig.firestoreDatabaseId || "(default)",
    ),
  };
}
async function caller(req: express.Request) {
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization || "")?.[1];
  if (!token) throw new AssessmentError(401, "Sign in to continue.");
  const { auth, db } = backend();
  const identity = await verifyIdentity(
    (value) => auth.verifyIdToken(value),
    token,
  );
  const profile = await db.doc(`users/${identity.uid}`).get();
  if (profile.data()?.status === "suspended")
    throw new AssessmentError(403, "This account is suspended.");
  const isAdmin =
    identity.email === "manhcuong2006ht@gmail.com" &&
    identity.email_verified === true;
  return { identity, isAdmin, db, profile };
}
async function optionalCaller(req: express.Request) {
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization || "")?.[1];
  const { auth, db } = backend();
  if (!token) {
    return { identity: null, isAdmin: false, db };
  }
  const identity = await verifyIdentity(
    (value) => auth.verifyIdToken(value),
    token,
  );
  // Database/configuration failures must not be reported as expired sign-in.
  const profile = await db.doc(`users/${identity.uid}`).get();
  if (profile.data()?.status === "suspended")
    throw new AssessmentError(403, "This account is suspended.");
  const isAdmin =
    identity.email === "manhcuong2006ht@gmail.com" &&
    identity.email_verified === true;
  return { identity, isAdmin, db };
}
function apiError(res: express.Response, error: unknown) {
  if (error instanceof AssessmentError)
    return res.status(error.status).json({ error: error.message });
  console.error("Backend request failed:", error);
  const backendCode = (error as { code?: number | string })?.code;
  if (backendCode === 7 || backendCode === "permission-denied" || backendCode === "PERMISSION_DENIED") {
    return res.status(503).json({
      code: "FIREBASE_SERVER_PERMISSION_DENIED",
      error: "The scoring server does not have permission to access the Firebase database. Grant its runtime service account the Cloud Datastore User role in the Firebase project, then retry. Changing Firestore Rules will not fix this server permission.",
    });
  }
  return res.status(503).json({
    error:
      "The scoring service is unavailable. Please retry or ask the administrator to check the server Firebase credentials.",
  });
}
function assessmentStore(
  db: ReturnType<typeof backend>["db"],
): AssessmentStore {
  return {
    test: async (id) => (await db.doc(`tests/${id}`).get()).data(),
    keys: async (id) => (await db.doc(`test_keys/${id}`).get()).data(),
    sections: async (id) =>
      (await db.collection(`tests/${id}/sections`).get()).docs.map((d) => ({
        ...d.data(),
        id: d.id,
      })),
  };
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// UID, email, and administrator status come from a verified token, never the request body.
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
        updatedAt: Date.now(),
      });
    res.json({
      role: isAdmin ? "admin" : "student",
      status: profile.data()?.status || "active",
    });
  } catch (error) {
    apiError(res, error);
  }
});

// Secure AI Dictionary & Vocabulary Lookup
app.post("/api/dictionary", async (req, res) => {
  try {
    await caller(req);
    if (!process.env.GEMINI_API_KEY)
      throw new AssessmentError(503, "Dictionary lookup is not configured.");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const { text, context, language = "en" } = req.body;
    if (
      !text ||
      typeof text !== "string" ||
      text.length > 500 ||
      (context && (typeof context !== "string" || context.length > 5000))
    ) {
      return res
        .status(400)
        .json({ error: "Text is required for dictionary lookup" });
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
        responseMimeType: "application/json",
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({
      word: parsed.word || text,
      partOfSpeech: parsed.partOfSpeech || "word",
      meaning: parsed.meaning || "No definition available",
      example: parsed.example || context || "",
    });
  } catch (error) {
    if (error instanceof AssessmentError) return apiError(res, error);
    console.error("Dictionary API error:", error);
    // Graceful fallback
    res.json({
      word: req.body.text,
      partOfSpeech: "phrase",
      meaning:
        req.body.language === "vi"
          ? "Kh�ng th? tra t? t? d?ng l�c n�y."
          : "Automatic lookup unavailable.",
      example: req.body.context || "",
    });
  }
});

// Practice review is explicit; question content and exam setup never receive private keys.
app.post("/api/test-review", async (req, res) => {
  try {
    const { db, isAdmin } = await optionalCaller(req);
    if (req.body.mode !== "practice")
      throw new AssessmentError(
        403,
        "Submit the exam before viewing solutions.",
      );
    const assessment = await loadAssessment(
      assessmentStore(db),
      req.body,
      isAdmin,
    );
    res.json({ keys: assessment.keys });
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
      isAdmin,
    );
    const { result, band, responses } = markAssessment(
      assessment,
      req.body.responses || {},
    );
    // Grading succeeds independently of optional cloud history sync.
    const attemptId =
      typeof req.body.attemptId === "string" &&
      /^[\w-]{1,128}$/.test(req.body.attemptId)
        ? req.body.attemptId
        : randomUUID();
    res.json({ attemptId, result, band, keys: assessment.keys });
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
    if (
      typeof targetUserId !== "string" ||
      !/^[\w-]{1,128}$/.test(targetUserId) ||
      !["active", "suspended"].includes(newStatus)
    ) {
      throw new AssessmentError(400, "Invalid user or status.");
    }
    await db
      .doc(`users/${targetUserId}`)
      .update({ status: newStatus, updatedAt: Date.now() });
    res.json({ success: true, targetUserId, status: newStatus });
  } catch (error) {
    apiError(res, error);
  }
});

registerPortalRoutes(app, {caller, backend, apiError});

// Unknown API requests must never be served the frontend HTML with status 200.
app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found. Check that the Express backend is deployed.", code: "API_ROUTE_NOT_FOUND" }));

// Mount Vite in development, serve static in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, port: PORT, host: "0.0.0.0" },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Reading Studio server running on port ${PORT}`);
  });
}

startServer();
