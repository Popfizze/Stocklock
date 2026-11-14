import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { toast } from 'sonner'

// Sonner's toast store is module-level and OUTLIVES Testing Library's unmount:
// on subscribe it replays every still-active toast to the newly mounted
// Toaster. So a toast raised in one test reappears in the next test's DOM,
// which makes `findByText` ambiguous and — worse — makes any assertion that a
// toast is ABSENT pass or fail on test order. Retire them between tests;
// `dismiss()` marks them inactive, which is what the replay filters on.
afterEach(() => {
  toast.dismiss()
})

// The active profile lives in localStorage, which jsdom keeps across tests.
afterEach(() => {
  window.localStorage.clear()
})

// jsdom doesn't implement matchMedia. Any page rendered through AppLayout
// hits it via the sidebar's useIsMobile() hook, so polyfill it globally
// rather than in each page test.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// jsdom doesn't implement the Pointer Events capture API or scrollIntoView,
// both of which Radix UI's popover-based components (Select, Dropdown,
// Tooltip, …) use internally — without these, interacting with them via
// userEvent in tests throws or silently no-ops (the dropdown never opens).
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
}
