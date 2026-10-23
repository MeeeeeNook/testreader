import {dividerIssues} from './listening';
import {importError} from "./importProgress";
import {contentHash} from "./importIdentity";
import {organizationPatch,type LibraryFolder,type MenuFolder} from "./folders";
import { sectionSummaries } from "./portal";
import { passageTitle } from "./passageTitle";
import { buildPrivateKeys } from "./privateKeys";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  runTransaction,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  DocumentSnapshot,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  db,
  auth,
  storage,
  handleFirestoreError,
  OperationType,
} from "../firebase";
import {cleanLayout} from "./importer";
import type {EditableTest,EditablePart,TestMeta} from "../types";

export class FirestoreAdapter {
  async saveLibraryFolders(folders:LibraryFolder[],expectedVersion:number):Promise<number> {
    const user=auth.currentUser;if(!user||(await this.getRole())!=="admin")throw new Error("Administrator access required.");
    if(folders.length>1000)throw new Error("The library supports up to 1000 folders.");
    const profile=doc(db,"users",user.uid);
    return runTransaction(db,async transaction=>{
      const snap=await transaction.get(profile);if(!snap.exists())throw new Error("Your account profile is still loading. Please retry.");
      const version=snap.data().libraryFolderVersion||0;
      if(version!==expectedVersion)throw new Error("Folders changed in another tab. Reload before editing them.");
      transaction.update(profile,{libraryFolders:folders,libraryFolderVersion:version+1});return version+1;
    });
  }

  private cacheUserId: string | null = null;
  private roleCache: "admin" | "student" | null = null;
  private testCache: Map<string, EditableTest> = new Map();

  async getRole(): Promise<"admin" | "student"> {
    const user = auth.currentUser;
    if (this.cacheUserId !== (user?.uid || null)) {
      this.clearRoleCache();
      this.cacheUserId = user?.uid || null;
    }
    if (!user) return "student";

    // Fast-path: Check server or token or admin collection
    if (this.roleCache) return this.roleCache;

    try {
      // Sole admin check
      if (user.email === "manhcuong2006ht@gmail.com" && user.emailVerified) {
        this.roleCache = "admin";
        return "admin";
      }
      this.roleCache = "student";
      return "student";
    } catch {
      return "student";
    }
  }

  clearRoleCache() {
    this.roleCache = null;
    this.testCache.clear();
  }

  // Generic item get
  async get(kind: string, id: string): Promise<any | null> {
    const user = auth.currentUser;
    const path = this.getPath(kind, id, user?.uid);
    try {
      const snap = await getDoc(doc(db, path, id));
      return snap.exists() ? snap.data() : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${path}/${id}`);
    }
  }

  // Generic item put
  async put(kind: string, value: any): Promise<any> {
    const user = auth.currentUser;
    const id = value.id;
    const path = this.getPath(kind, id, user?.uid);
    try {
      const cleanValue = JSON.parse(JSON.stringify(value));
      cleanValue.updatedAt = Date.now();
      await setDoc(doc(db, path, id), cleanValue, { merge: true });
      return cleanValue;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${path}/${id}`);
    }
  }

  // Generic item list (scoped to user where appropriate)
  async list(kind: string): Promise<any[]> {
    const user = auth.currentUser;
    const path = this.getPath(kind, "", user?.uid);
    try {
      const snap = await getDocs(collection(db, path));
      return snap.docs.map((d) => d.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  // Generic delete
  async delete(kind: string, id: string): Promise<void> {
    const user = auth.currentUser;
    const path = this.getPath(kind, id, user?.uid);
    try {
      await deleteDoc(doc(db, path, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${path}/${id}`);
    }
  }

  async updateTestMeta(
    id: string,
    changes: Partial<TestMeta> & {
      deletedAt?: number | null;
      restoreStatus?: string;
      folderId?:string|null;
      folderPath?:string;
    },
  ): Promise<void> {
    if ((await this.getRole()) !== "admin")
      throw new Error("Administrator access required.");
    const allowed: any = { updatedAt: Date.now() };
    for (const key of [
      "coverImage",
      "contentBytes",
      "source",
      "title",
      "passageTitles",
      "sectionSummaries",
      "access",
      "status",
      "deletedAt",
      "restoreStatus",
      "folderId",
      "folderPath",
      "fullTestMenuFolders",
      "folderPages",
    ] as const)
      if (changes[key] !== undefined) allowed[key] = changes[key];
    await setDoc(doc(db, "tests", id), allowed, { merge: true });
    this.testCache.delete(id);
  }

  async updateTestOrganizations(patches:({id:string;folderId:string|null;folderPath:string;fullTestMenuFolders:MenuFolder[];folderPages?:import("./folders").PublicFolder[]})[]):Promise<void>{
    if((await this.getRole())!=="admin")throw new Error("Administrator access required.");
    // Write metadata only, in bounded batches; never touch questions or answer keys.
    for(let offset=0;offset<patches.length;offset+=400){
      const batch=writeBatch(db),items=patches.slice(offset,offset+400);
      for(const {id,...patch}of items)batch.update(doc(db,"tests",id),patch);
      await batch.commit();for(const item of items)this.testCache.delete(item.id);
    }
  }

  async getStudentAttempt(uid: string, id: string) {
    if ((await this.getRole()) !== "admin")
      throw new Error("Administrator access required.");
    if (![uid, id].every((value) => /^[\w-]{1,128}$/.test(value)))
      throw new Error("Invalid record identifier.");
    const snap = await getDoc(doc(db, `users/${uid}/attempts`, id));
    return snap.exists() ? { ...snap.data(), id: snap.id } : null;
  }

  async listStudentAttempts(uid: string, cursor?: DocumentSnapshot) {
    if ((await this.getRole()) !== "admin")
      throw new Error("Administrator access required.");
    if (!/^[\w-]{1,128}$/.test(uid))
      throw new Error("Invalid student identifier.");
    const constraints: any[] = [
      orderBy("createdAt", "desc"),
      firestoreLimit(30),
    ];
    if (cursor) constraints.push(startAfter(cursor));
    const snap = await getDocs(
      query(collection(db, `users/${uid}/attempts`), ...constraints),
    );
    return {
      attempts: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
      cursor: snap.docs.at(-1),
      hasMore: snap.size === 30,
    };
  }

  // Efficient Paginated Test Catalog Fetching (reads lightweight metadata only!)
  async listTests(
    options: {
      skill?: "reading" | "listening";
      status?: "published" | "draft" | "archived";
      pageSize?: number;
      lastDoc?: DocumentSnapshot;
    } = {},
  ): Promise<{ tests: TestMeta[]; lastDoc?: DocumentSnapshot }> {
    const path = "tests";
    try {
      const constraints: any[] = [];
      const role = await this.getRole();

      if (role !== "admin") {
        constraints.push(where("status", "==", "published"));
      } else if (options.status) {
        constraints.push(where("status", "==", options.status));
      }

      if (options.skill) {
        constraints.push(where("skill", "==", options.skill));
      }

      constraints.push(orderBy("updatedAt", "desc"));
      constraints.push(firestoreLimit(options.pageSize || 50));

      if (options.lastDoc) {
        constraints.push(startAfter(options.lastDoc));
      }

      const q = query(collection(db, path), ...constraints);
      const snap = await getDocs(q);
      const tests = snap.docs.map((d) => d.data() as TestMeta);
      const last = snap.docs[snap.docs.length - 1];
      return { tests, lastDoc: last };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  // Load a complete test on-demand (metadata + sections) with in-memory caching
  async getTestComplete(testId: string): Promise<EditableTest> {
    const requestUserId = auth.currentUser?.uid || null;
    await this.getRole();
    if (this.testCache.has(testId)) {
      return JSON.parse(JSON.stringify(this.testCache.get(testId)!));
    }

    try {
      const metaSnap = await getDoc(doc(db, "tests", testId));
      if (!metaSnap.exists()) throw new Error("Test not found in library.");
      const meta = metaSnap.data() as TestMeta;

      // Fetch sections from subcollection
      const sectionsSnap = await getDocs(
        collection(db, `tests/${testId}/sections`),
      );
      const parts: EditablePart[] = sectionsSnap.docs
        .map((d) => d.data() as EditablePart & { index?: number })
        .sort(
          (a, b) =>
            (a.index ?? 0) - (b.index ?? 0) ||
            a.id.localeCompare(b.id, undefined, { numeric: true }),
        );

      parts.forEach((part, index) => { if(meta.skill!=='listening')part.title = passageTitle(part.passageHtml, part.title, index); });

      // If user is admin, also fetch the private keys
      const role = await this.getRole();
      if (role === "admin") {
        const keySnap = await getDoc(doc(db, "test_keys", testId));
        if (keySnap.exists()) {
          const keysData = keySnap.data().keys || {};
          // Merge private answers and explanations into question objects for the admin editor
          for (const part of parts) {
            if(meta.skill==='listening')part.passageHtml=keySnap.data().transcripts?.[part.id]??part.passageHtml;
            for (const q of part.questions) {
              if (keysData[q.number]) {
                q.answer = keysData[q.number].answer || q.answer;
                q.explanationHtml =
                  keysData[q.number].explanationHtml || q.explanationHtml;
                q.referenceQuote =
                  keysData[q.number].referenceQuote || q.referenceQuote;
              }
            }
          }
        }
      }

      const fullTest: EditableTest = {
        schemaVersion: 1,
        id: meta.id,
        title: meta.title,
        skill: meta.skill,
        audioFiles:meta.audioFiles||[],
        source: meta.source,
        folderId:meta.folderId||null,folderPath:meta.folderPath||"",contentHash:meta.contentHash,
        coverImage: meta.coverImage,
        access: meta.access,
        status: meta.status,
        duration: meta.duration,
        parts,
        createdAt: meta.createdAt || Date.now(),
        updatedAt: meta.updatedAt || Date.now(),
      };

      if (requestUserId !== (auth.currentUser?.uid || null))
        throw new Error(
          "Account changed while loading this test. Please open it again.",
        );
      this.testCache.set(testId, fullTest);
      return fullTest;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `tests/${testId}`);
    }
  }

  // Calculate and persist test content bytes to metadata (admin only)
  async measureTestContent(testId: string): Promise<number> {
    if ((await this.getRole()) !== "admin")
      throw new Error("Administrator access required.");
    const full = await this.getTestComplete(testId);
    const size = new TextEncoder().encode(JSON.stringify(full)).length;
    await this.updateTestMeta(testId, { contentBytes: size });
    return size;
  }

  // Lightweight title repair never reads answer keys. Cache by test revision.
  private summaryRequests = new Map<string, Promise<Partial<TestMeta>>>();
  getCatalogSummary(test: TestMeta): Promise<Partial<TestMeta>> {
    const key = `${auth.currentUser?.uid || "guest"}:${test.id}:${test.updatedAt}`;
    if (this.summaryRequests.has(key)) return this.summaryRequests.get(key)!;
    const task = (async () => {
      const cached = (() => {try {return JSON.parse(localStorage.getItem(`reading-room:summary:${test.id}`) || "null");} catch {return null;}})();
      let patch: Partial<TestMeta>;
      if (cached?.version === 2 && cached.updatedAt === test.updatedAt && Array.isArray(cached.patch?.sectionSummaries) && Array.isArray(cached.patch?.passageTitles)) patch = {sectionSummaries:cached.patch.sectionSummaries,passageTitles:cached.patch.passageTitles,...(typeof cached.patch.title === "string" ? {title:cached.patch.title} : {})};
      else {
        const snap = await getDocs(collection(db, `tests/${test.id}/sections`));
        const parts = snap.docs.map(d => ({...d.data(), id:d.id} as EditablePart & {index?:number})).sort((a,b) => (a.index || 0) - (b.index || 0));
        if (!parts.length) throw new Error("This test has no sections.");
        parts.forEach((p,i) => {if(test.skill!=='listening')p.title = passageTitle(p.passageHtml,p.title,i);});
        patch = {passageTitles:parts.map(p=>p.title),sectionSummaries:sectionSummaries({...test,schemaVersion:1,createdAt:test.createdAt||test.updatedAt,parts}),...(test.skill==='reading'&&parts.length===1 ? {title:parts[0].title} : {})};
        try {localStorage.setItem(`reading-room:summary:${test.id}`,JSON.stringify({version:2,updatedAt:test.updatedAt,patch}));} catch {}
      }
      if ((await this.getRole()) === "admin") await this.updateTestMeta(test.id,patch);
      return patch;
    })();
    this.summaryRequests.set(key,task);
    void task.catch(()=>this.summaryRequests.delete(key));
    return task;
  }

  // Save a complete test: splits into metadata, sections subcollection, and private test_keys
  async saveTestComplete(test: EditableTest,folders:LibraryFolder[]=[]): Promise<void> {
    const user = auth.currentUser;
    if (!user || (await this.getRole()) !== "admin")
      throw new Error("Administrator access required.");
    if(test.skill==='listening'&&dividerIssues(test.parts).length)throw new Error(dividerIssues(test.parts).join(' '));
    if(test.skill==='listening'&&test.status==='published'&&test.parts.some(p=>!p.audio||(p.audioEnd&&p.audioEnd<=(p.audioStart||0))))throw new Error('Assign a recording and valid start/end times to every Listening part before publishing.');
    const now = Date.now();
    test.updatedAt = now;

    // 1. Lightweight metadata
    const meta: TestMeta = {
      id: test.id,
      title: test.skill==='reading'&&test.parts.length === 1 ? passageTitle(test.parts[0].passageHtml, test.parts[0].title, 0) : test.title,
      skill: test.skill,
      source: test.source || "My Collection",
      access: "free",
      status: test.status || "published",
      duration: test.duration || (test.skill==='listening'?30:60),
      audioFiles:test.audioFiles||[],
      passages: test.parts.length,
      passageTitles: test.parts.map((p, i) => test.skill==='listening'?p.title:passageTitle(p.passageHtml, p.title, i)),
      sectionSummaries: sectionSummaries({...test, parts:test.parts.map((p,i)=>({...p,title:test.skill==='listening'?p.title:passageTitle(p.passageHtml,p.title,i)}))}),
      questions: test.parts.reduce((sum, p) => sum + p.questions.length, 0),
      createdAt: test.createdAt || now,
      updatedAt: now,
      custom: true,
      coverImage: test.coverImage ?? (test.parts.flatMap(p => [...(p.passageHtml || "").matchAll(/<img[^>]+src=['"]([^'"]+)['"]/gi)].map(m => m[1])).find(url => /^https:\/\//.test(url)) || ""),
      contentBytes: new TextEncoder().encode(JSON.stringify(test)).length,
      ...organizationPatch(test as unknown as TestMeta,folders),
      contentHash:test.contentHash||await contentHash(test),
    };

    try {
      const batch = writeBatch(db);
      const previous = await getDocs(
        collection(db, `tests/${test.id}/sections`),
      );
      const ids = new Set(test.parts.map((p, index) => p.id || `p${index}`));
      if (ids.size !== test.parts.length)
        throw new Error("Section IDs must be unique.");
      previous.docs
        .filter((d) => !ids.has(d.id))
        .forEach((d) => batch.delete(d.ref));
      batch.set(doc(db, "tests", test.id), meta);

      // 2. Sections subcollection
      for (const [index, part] of test.parts.entries()) {
        const sectionDoc = {
          id: part.id || `p${index}`,
          testId: test.id,
          index,
          position: part.position || index + 1,
          title: test.skill==='listening'?part.title:passageTitle(part.passageHtml, part.title, index),
          passageHtml: test.skill==='listening'?'':cleanLayout(part.passageHtml || ""),
          questionHtml: cleanLayout(part.questionHtml || ""),
          slots: part.slots || {},
          questions: part.questions.map((q) => ({
            number: q.number,
            kind: q.kind,
            missing: q.missing || false,
          })),
          audio: part.audio || "",
          audioName:part.audioName||'',
          audioStart:Math.max(0,Number(part.audioStart)||0),
          audioEnd:Math.max(0,Number(part.audioEnd)||0),
        };
        batch.set(
          doc(db, `tests/${test.id}/sections`, sectionDoc.id),
          sectionDoc,
        );
      }

      // 3. Private keys use Firestore-compatible group objects, never nested arrays.
      batch.set(doc(db, "test_keys", test.id), buildPrivateKeys(test, now));
      await batch.commit();

      this.testCache.set(test.id, JSON.parse(JSON.stringify(test)));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tests/${test.id}`);
    }
  }

  async existingMedia(customPath:string):Promise<string|null>{
    if(customPath.startsWith('media/audio/')){const {storageConfiguration}=await import('./mediaStorage');if((await storageConfiguration()).provider==='r2')return null;}
    storage.maxOperationRetryTime=30000;
    try{return await getDownloadURL(ref(storage,customPath))}catch(error){if((error as {code?:string}).code==='storage/object-not-found')return null;throw new Error(importError(error))}
  }
  // Upload audio/diagrams to Firebase Storage
  async uploadMedia(file: File | Blob, customPath: string, onProgress?:(sent:number,total:number)=>void): Promise<string> {
    try {
      if(/^(audio|image)\//.test(file.type)){const {uploadToR2}=await import('./mediaStorage');const url=await uploadToR2(file,onProgress);if(url)return url;}
      storage.maxOperationRetryTime=30000;storage.maxUploadRetryTime=120000;
      const task=uploadBytesResumable(ref(storage,customPath),file);
      const snap=await new Promise<import('firebase/storage').UploadTaskSnapshot>((resolve,reject)=>{
        let sent=-1,settled=false;
        const finish=(error?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(task.snapshot);};
        const timeout=()=>{finish(Object.assign(new Error('No upload progress for 120 seconds. File: '+customPath.split('/').pop()),{code:'storage/upload-timeout'}));task.cancel();};
        let timer=setTimeout(timeout,120000);
        task.on('state_changed',snapshot=>{if(snapshot.bytesTransferred!==sent){sent=snapshot.bytesTransferred;clearTimeout(timer);timer=setTimeout(timeout,120000)}onProgress?.(snapshot.bytesTransferred,snapshot.totalBytes);},error=>finish(error),()=>finish());
      });
      return await getDownloadURL(snap.ref);
    } catch (error) {
      console.error('Storage upload failed:',error);
      throw new Error(importError(error));
    }
  }

  private getPath(kind: string, _id: string, uid?: string): string {
    if (!uid && ["attempts", "vocabulary"].includes(kind)) throw new Error(`Sign in to save ${kind === "vocabulary" ? "vocabulary" : "test results"}.`);
    switch (kind) {
      case "tests":
        return "tests";
      case "attempts":
        return uid ? `users/${uid}/attempts` : "attempts";
      case "vocabulary":
        return uid ? `users/${uid}/vocabulary` : "vocabulary";
      case "users":
        return "users";
      case "reports":
        return "reports";
      case "admins":
        return "admins";
      default:
        return kind;
    }
  }
}

export const firestoreAdapter = new FirestoreAdapter();

