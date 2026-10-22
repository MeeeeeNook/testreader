import { auth } from "../firebase";
import { requestJson } from "./apiRequest";
import { roleForIdentity } from "./access";
import { firestoreAdapter } from "./firestoreAdapter";
import { loadAssessment, markAssessment } from "../../server/assessment";
export async function assessmentRequest(
  url: "/api/submit-exam" | "/api/test-review",
  payload: any,
) {
  try {
    return await requestJson(url, payload, () => auth.currentUser);
  } catch (error) {
    // A verified owner can read their own private keys through existing Firestore rules.
    // This fallback never grants keys to a student or guest.
    if (
      (error as any)?.status !== 503 ||
      roleForIdentity(auth.currentUser) !== "admin"
    )
      throw error;
    const assessment = await loadAssessment(
      {
        test: (id) => firestoreAdapter.get("tests", id),
        sections: async (id) =>
          (await firestoreAdapter.getTestComplete(id)).parts,
        keys: (id) => firestoreAdapter.get("test_keys", id),
      },
      payload,
      true,
    );
    return url === "/api/test-review"
      ? { keys: assessment.keys }
      : {
          attemptId: payload.attemptId,
          ...markAssessment(assessment, payload.responses),
          keys: assessment.keys,
        };
  }
}
