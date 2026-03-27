/**
 * The useCurrentUser function retrieves the current user's Clerk ID, email address, and loading status
 * using the Clerk Next.js library.
 * @returns The `useCurrentUser` function is returning an object with three properties: `clerkId`,
 * `email`, and `isLoaded`. The `clerkId` property is set to the `id` of the user obtained from the
 * Clerk authentication service. The `email` property is set to the email address of the user obtained
 * from the Clerk authentication service. The `isLoaded` property indicates whether
 */
import { useUser } from "@clerk/nextjs";

export function useCurrentUser() {
    const { user, isLoaded } = useUser()

    return {
        clerkId: user?.id,
        email: user?.emailAddresses[0]?.emailAddress,
        isLoaded,
    }
}