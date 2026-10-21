import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));

// Initialize server-side Firebase instance
const serverFirebaseApp = initializeApp(firebaseConfig, 'SERVER_INSTANCE');
const serverDb = getFirestore(serverFirebaseApp, firebaseConfig.firestoreDatabaseId);

// Gemini API instance for dictionary lookup
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Auth sync & role determination
app.post('/api/auth/sync', async (req, res) => {
  try {
    const { uid, email, displayName } = req.body;
    if (!uid || !email) {
      return res.status(400).json({ error: 'UID and email are required' });
    }

    const isAdminEmail = email.toLowerCase() === 'manhcuong2006ht@gmail.com';

    // 1. If user is the designated initial administrator, ensure record in /admins/{uid}
    if (isAdminEmail) {
      try {
        await setDoc(
          doc(serverDb, 'admins', uid),
          {
            email,
            addedBy: 'system',
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Could not auto-provision admin record:', err);
      }
    }

    // 2. Check if admin record exists
    let isAdmin = isAdminEmail;
    if (!isAdmin) {
      try {
        const adminDoc = await getDoc(doc(serverDb, 'admins', uid));
        isAdmin = adminDoc.exists();
      } catch {
        isAdmin = false;
      }
    }

    // 3. Ensure user profile exists in /users/{uid}
    let userStatus = 'active';
    try {
      const userRef = doc(serverDb, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        userStatus = userSnap.data().status || 'active';
      } else {
        await setDoc(userRef, {
          id: uid,
          email,
          name: displayName || email.split('@')[0],
          target: 7.5,
          language: 'en',
          theme: 'light',
          fontSize: 16,
          favorites: [],
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    } catch (err) {
      console.warn('Could not sync user profile:', err);
    }

    res.json({
      role: isAdmin ? 'admin' : 'student',
      status: userStatus,
    });
  } catch (error) {
    console.error('Auth sync error:', error);
    res.status(500).json({ error: 'Internal server error during auth sync' });
  }
});

// Secure AI Dictionary & Vocabulary Lookup
app.post('/api/dictionary', async (req, res) => {
  try {
    const { text, context, language = 'en' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for dictionary lookup' });
    }

    const prompt = `You are a world-class IELTS Academic English lexicographer.
Explain the word or phrase "${text}" as used in this context:
"${context || text}"

Provide the output in pure JSON format without markdown code blocks.
Fields required:
- "word": "${text}",
- "partOfSpeech": "noun" | "verb" | "adjective" | "adverb" | "phrase",
- "meaning": clear concise definition ${language === 'vi' ? 'written in Vietnamese with Vietnamese translation and explanation' : 'written in clear English with nuance'},
- "example": a high-quality illustrative sentence matching IELTS style`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({
      word: parsed.word || text,
      partOfSpeech: parsed.partOfSpeech || 'word',
      meaning: parsed.meaning || 'No definition available',
      example: parsed.example || context || '',
    });
  } catch (error) {
    console.error('Dictionary API error:', error);
    // Graceful fallback
    res.json({
      word: req.body.text,
      partOfSpeech: 'phrase',
      meaning: req.body.language === 'vi' ? 'Không thể tra từ tự động lúc này.' : 'Automatic lookup unavailable.',
      example: req.body.context || '',
    });
  }
});

// Authoritative Server-Side Exam Submission & Scoring
app.post('/api/submit-exam', async (req, res) => {
  try {
    const { testId, responses = {}, userId, mode = 'exam' } = req.body;
    if (!testId) {
      return res.status(400).json({ error: 'testId is required' });
    }

    // Fetch private answer keys from server Firestore
    const keyDocRef = doc(serverDb, 'test_keys', testId);
    const keySnap = await getDoc(keyDocRef);

    if (!keySnap.exists()) {
      return res.status(404).json({ error: 'Private answer keys not found for this test.' });
    }

    const { keys = {}, multiGroups = [] } = keySnap.data();

    // Import deterministic scoring logic
    const { scoreTest, estimatedBand } = await import('./src/services/scoring.ts');

    const questionNumbers = Object.keys(keys).map(Number).sort((a, b) => a - b);
    const scoringPart = {
      numbers: questionNumbers,
      keys,
      multiGroups,
    };

    const result = scoreTest([scoringPart], responses);
    const band = estimatedBand(result);

    // Save attempt record if user is identified
    const attemptId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (userId) {
      try {
        const attemptDoc = {
          id: attemptId,
          owner: userId,
          testId,
          mode,
          createdAt: Date.now(),
          responses,
          result,
          band,
        };
        await setDoc(doc(serverDb, `users/${userId}/attempts`, attemptId), attemptDoc);
      } catch (saveErr) {
        console.warn('Could not save attempt record on server:', saveErr);
      }
    }

    // Now that test is submitted, return the result AND keys for review
    res.json({
      attemptId,
      result,
      band,
      keys,
    });
  } catch (error) {
    console.error('Exam submission error:', error);
    res.status(500).json({ error: 'Failed to score exam submission.' });
  }
});

// Admin learner status management
app.post('/api/admin/user-status', async (req, res) => {
  try {
    const { targetUserId, newStatus, adminUid } = req.body;
    if (!targetUserId || !newStatus || !adminUid) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    // Verify adminUid is an admin
    const adminDoc = await getDoc(doc(serverDb, 'admins', adminUid));
    if (!adminDoc.exists()) {
      return res.status(403).json({ error: 'Forbidden: caller is not an administrator.' });
    }

    await setDoc(
      doc(serverDb, 'users', targetUserId),
      {
        status: newStatus === 'suspended' ? 'suspended' : 'active',
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    res.json({ success: true, targetUserId, status: newStatus });
  } catch (error) {
    console.error('User status update error:', error);
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

// Mount Vite in development, serve static in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, port: PORT, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Reading Studio server running on port ${PORT}`);
  });
}

startServer();
