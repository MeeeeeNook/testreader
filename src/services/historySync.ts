import {requestJson} from './apiRequest';
import { auth } from "../firebase";
import { firestoreAdapter } from "./firestoreAdapter";
import { syncHistoryRecords } from "./localHistory.js";
import type { AttemptRecord } from "../types";
const pending = new Map<string, Promise<AttemptRecord[]>>();
export function syncHistory(uid: string): Promise<AttemptRecord[]> {
  if (pending.has(uid)) return pending.get(uid)!;
  const task = syncHistoryRecords(
    localStorage,
    uid,
    {
      list: () => firestoreAdapter.list("attempts"),
      put: async (data:AttemptRecord)=>{
        const response=await requestJson<{attempt:AttemptRecord}>('/api/history/save',data,()=>auth.currentUser);
        return response.attempt;
      },
    },
    () => auth.currentUser?.uid === uid,
  ) as Promise<AttemptRecord[]>;
  pending.set(uid, task);
  void task
    .finally(() => {
      if (pending.get(uid) === task) pending.delete(uid);
    })
    .catch(() => {});
  return task;
}
