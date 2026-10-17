import { useAuth } from "./AuthProvider";

/** True when a signed-in person lands on a guest page and nothing is in progress there. */
export function useShouldLeaveGuestPage(busy: boolean) {
  const { loading, session } = useAuth();
  return !loading && !!session && !busy;
}
