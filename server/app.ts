import {getStorage} from "firebase-admin/storage";
import {summarizeFiles} from "../src/services/storageUsage";
import { registerPortalRoutes } from "./portalRoutes";
import express from "express";
import { verifyIdentity } from "./identity";
import { randomUUID } from "node:crypto";
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
} from "./assessment.ts";
import firebaseConfig from "../firebase-applet-config.json" with { type: "json" };

dotenv.config();


const app = express();


app.use(express.json({ limit: "4mb" }));
app.get("/api/health", (_req,res)=>res.json({ok:true,service:"ielts-studio-api"}));

function parseServiceAccount(raw: string) {
  let text = raw.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  if (!text.startsWith("{")) {
    try {
      const decoded = Buffer.from(text, "base64").toString("utf8");
      if (decoded.trim().startsWith("{")) {
        text = decoded.trim();
      }
    } catch {}
  }
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

function getFirebaseCredential() {
  const rawKey =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
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

// Server-only credentials use Application Default Credentials. Never expose a service-account key to Vite.
function backend() {
  const instance =
    getApps().find((a) => a.name === "READING_SERVER") ||
    initializeApp(
      {
        credential: getFirebaseCredential(),
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
      },
      "READING_SERVER",
    );
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ||
    firebaseConfig.storageBucket ||
    `${firebaseConfig.projectId}.firebasestorage.app`;
  return {
    auth: getAuth(instance),
    bucket: getStorage(instance).bucket(bucketName),
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
  const message = (error as Error)?.message || "";
  const details = (error as { details?: string })?.details || "";
  if (
    backendCode === 7 ||
    backendCode === "permission-denied" ||
    backendCode === "PERMISSION_DENIED" ||
    message.includes("PERMISSION_DENIED") ||
    details.includes("PERMISSION_DENIED")
  ) {
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

// Inventory is owner-only and explicitly requested; no background polling or file downloads.
app.post("/api/admin/storage-usage", async (req,res)=>{
  try {
    const {isAdmin}=await caller(req);
    if(!isAdmin)throw new AssessmentError(403,"Administrator access required.");
    const { bucket } = backend();
    let targetBucket = bucket;
    const files:{name:string;size:number}[]=[];
    let query:any={autoPaginate:false,maxResults:1000};
    try {
      do {
        const [page,next]=await targetBucket.getFiles(query);
        files.push(...page.map(file=>({name:file.name,size:Number(file.metadata.size)||0})));
        query=next;
      }while(query&&files.length<10000);
    } catch (primaryErr: any) {
      if ((primaryErr?.code === 404 || primaryErr?.message?.includes("does not exist")) && targetBucket.name.endsWith(".firebasestorage.app")) {
        const fallbackBucket = getStorage(getApps().find(a => a.name === "READING_SERVER")!).bucket(`${firebaseConfig.projectId}.appspot.com`);
        try {
          query = { autoPaginate: false, maxResults: 1000 };
          do {
            const [page, next] = await fallbackBucket.getFiles(query);
            files.push(...page.map(file => ({ name: file.name, size: Number(file.metadata.size) || 0 })));
            query = next;
          } while (query && files.length < 10000);
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
      truncated:Boolean(query),
      scannedAt:Date.now(),
      bucket: targetBucket.name,
    });
  }catch(error){
    console.error("Storage inventory failed:", error);
    if (error instanceof AssessmentError) {
      return res.status(error.status).json({ error: error.message });
    }
    const err = error as { code?: number | string; message?: string; details?: string };
    const code = err?.code;
    const message = err?.message || "";
    const details = err?.details || "";

    const bucketName = firebaseConfig.storageBucket || `${firebaseConfig.projectId}.firebasestorage.app`;
    let userMessage = "Uploaded file sizes are unavailable. The owner needs to configure server Firebase credentials with Storage Object Viewer access. Test content can still be measured below.";
    let diagnosticCode = "STORAGE_UNAVAILABLE";

    if (code === 404 || message.includes("The specified bucket does not exist") || message.includes("Not Found")) {
      userMessage = `Storage bucket '${bucketName}' was not found. Please ensure Cloud Storage is initialized in Firebase Console for project '${firebaseConfig.projectId}'.`;
      diagnosticCode = "BUCKET_NOT_FOUND";
    } else if (
      code === 403 ||
      code === 7 ||
      code === "permission-denied" ||
      code === "PERMISSION_DENIED" ||
      message.includes("PERMISSION_DENIED") ||
      message.includes("permission") ||
      details.includes("storage.objects.list") ||
      details.includes("PERMISSION_DENIED")
    ) {
      userMessage = `Service account does not have permission to list objects in bucket '${bucketName}'. Grant the 'Storage Object Viewer' (roles/storage.objectViewer) role in Google Cloud IAM.`;
      diagnosticCode = "STORAGE_PERMISSION_DENIED";
    } else if (
      message.includes("Could not load the default credentials") ||
      message.includes("FIREBASE_SERVICE_ACCOUNT_JSON") ||
      message.includes("credential")
    ) {
      userMessage = "Firebase Admin credentials missing or invalid on server. Ensure FIREBASE_SERVICE_ACCOUNT_JSON is set in Vercel environment variables.";
      diagnosticCode = "CREDENTIALS_MISSING";
    }

    res.status(503).json({
      error: userMessage,
      code: diagnosticCode,
      bucket: bucketName,
    });
  }
});

// Reports are available to guests; identity is derived only from the optional verified token.
const reportLimits=new Map<string,{count:number;until:number}>();
app.post("/api/content-report",async(req,res)=>{
  try {
    const {db,identity}=await optionalCaller(req);
    const {testId,message,question,category}=req.body;
    if(typeof testId!=="string"||!/^[-\w]{1,128}$/.test(testId)||typeof message!=="string"||!message.trim()||message.length>3000)throw new AssessmentError(400,"Please describe the issue in up to 3000 characters.");
    const key=req.ip||"unknown",now=Date.now();
    if(reportLimits.size>10000)for(const [id,entry]of reportLimits)if(entry.until<now)reportLimits.delete(id);
    const entry=reportLimits.get(key);if(entry&&entry.until>now&&entry.count>=10)throw new AssessmentError(429,"Please wait before sending another report.");
    reportLimits.set(key,{count:entry&&entry.until>now?entry.count+1:1,until:entry&&entry.until>now?entry.until:now+600000});
    const meta=await db.doc(`tests/${testId}`).get();if(meta.data()?.status!=="published")throw new AssessmentError(404,"This test is unavailable.");
    const id=randomUUID();await db.doc(`reports/${id}`).set({id,owner:identity?.uid||"guest",testId,testTitle:meta.data()?.title||"",message:message.trim(),question:Number.isInteger(question)?question:0,category:typeof category==="string"?category.slice(0,80):"content",status:"open",createdAt:now});
    res.json({success:true});
  }catch(error){apiError(res,error);}
});

registerPortalRoutes(app, {caller, backend, apiError});

// Unknown API requests must never be served the frontend HTML with status 200.
app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found. Check that the Express backend is deployed.", code: "API_ROUTE_NOT_FOUND" }));


export default app;
