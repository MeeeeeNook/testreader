import { AssessmentError } from "./assessment.ts";

export async function verifyIdentity<T>(
  verify: (token: string) => Promise<T>,
  token: string,
): Promise<T> {
  try {
    return await verify(token);
  } catch (error) {
    const code = (error as { code?: string })?.code || "";
    if (
      [
        "auth/id-token-expired",
        "auth/id-token-revoked",
        "auth/invalid-id-token",
        "auth/argument-error",
        "auth/user-disabled",
      ].includes(code)
    ) {
      throw new AssessmentError(
        401,
        "Your sign-in needs refreshing. Retry, or sign in again. Your answers are saved.",
      );
    }
    throw new AssessmentError(
      503,
      "The server could not verify your account. The administrator must check the Firebase server configuration. Your answers are saved.",
    );
  }
}
