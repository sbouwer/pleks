/**
 * lib/dev/devTierConfig.ts — DEV-ONLY tier toggle config (REMOVE BEFORE LAUNCH)
 *
 * Notes:  Shared constant for the temporary tier switcher (components/dev/DevTierToggle + lib/dev/devTier).
 *         Gated to a single developer account so it never surfaces for real users. To remove the whole
 *         feature: delete lib/dev/, components/dev/DevTierToggle, and the <DevTierToggle/> line in TopBar.
 */
export const DEV_TIER_EMAIL = "stean@yoros.co.za"
