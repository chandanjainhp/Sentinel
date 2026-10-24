/**
 * Canonical page layout values.
 *
 * Pages must render <PageContainer> and use these constants instead of
 * repeating max-width / padding / media-query numbers inline. The numbers
 * were picked by auditing what the app already used most: five pages used
 * "32px 24px 64px" and 1080px, so those are the defaults.
 */

export const PAGE_MAX_WIDTH = 1080;

// Deliberate exception for table-heavy pages (Sensors, Incidents,
// Investigations) that need the extra columns. Not a free-form override.
export const PAGE_MAX_WIDTH_WIDE = 1400;

// Settings keeps a narrower reading width inside its own sidebar shell.
export const SETTINGS_CONTENT_MAX_WIDTH = 860;

export const PAGE_PADDING = '32px 24px 64px';

// Applied below BREAKPOINT_TABLET — the same point the app sidebar turns into
// a drawer, so padding and navigation collapse together.
export const PAGE_PADDING_MOBILE = '24px 16px 48px';

export const BREAKPOINT_MOBILE = 640;
export const BREAKPOINT_TABLET = 768;

/** `@media (max-width: <width>px)` for use in inline <style> blocks. */
export const mediaMax = (width) => `@media (max-width: ${width}px)`;
