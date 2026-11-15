import { useSyncExternalStore } from 'react'
import { isMotionReduced, subscribeMotion } from '@/lib/motion'

/**
 * Whether the visitor chose reduced animations in the app (the switch in the sidebar; see
 * `lib/motion.ts`). Live: a scene on screen follows the switch at once. Motion is on by
 * default — the system's setting alone does not reduce it.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, isMotionReduced, () => false)
}
