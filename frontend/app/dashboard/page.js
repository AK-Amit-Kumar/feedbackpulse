/**
 * The `Dashboard` function renders a page with a title "FeedbackPulse Dashboard" and includes a
 * `UserButton` component.
 * @returns The `Dashboard` component is being returned. It contains a `div` element with inline
 * styling for padding, a heading "FeedbackPulse Dashboard", and a `UserButton` component from the
 * `@clerk/nextjs` library.
 */
import { UserButton } from '@clerk/nextjs'

export default function Dashboard() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>FeedbackPulse Dashboard</h1>
      <UserButton />
    </div>
  )
}