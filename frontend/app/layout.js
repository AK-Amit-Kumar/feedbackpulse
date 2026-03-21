import { ClerkProvider } from "@clerk/nextjs";
import './globals.css'

/**
 * The `RootLayout` function is a React component that wraps its children with a `ClerkProvider`
 * component inside an HTML body tag.
 * @returns The `RootLayout` function is returning a JSX structure that includes a `ClerkProvider`
 * component wrapping the content of the `html` and `body` tags. The `children` prop is rendered inside
 * the `body` tag.
 */
export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}