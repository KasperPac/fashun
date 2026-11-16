export const PHOTO_PROBLEM_MESSAGE =
  "We couldn't read your colours from that photo. Try again in daylight with your face filling most of the frame."

export const SERVICE_PROBLEM_MESSAGE =
  "We couldn't read your colours just now. That's on our side, not your photo, so try again in a few minutes."

/**
 * The message for a failed selfie reading. `status` is the HTTP status of the reading call,
 * or null when it couldn't be reached at all. 422 (and anything else the photo could cause,
 * including 401 which keeps today's wording) says the photo was the problem; 5xx and
 * network failures say the service was.
 */
export function selfieFailureMessage(status: number | null): string {
  if (status === null || status >= 500) return SERVICE_PROBLEM_MESSAGE
  return PHOTO_PROBLEM_MESSAGE
}
