import {
  BREAKPOINT_TABLET,
  PAGE_MAX_WIDTH,
  PAGE_MAX_WIDTH_WIDE,
  PAGE_PADDING,
  PAGE_PADDING_MOBILE,
  mediaMax,
} from '@/lib/layout-tokens';

// One shared rule set for every page, so max width, padding and the mobile
// collapse cannot drift page to page.
const CONTAINER_CSS = `
.page-container {
  width: 100%;
  min-height: 100vh;
  box-sizing: border-box;
  margin: 0 auto;
  padding: ${PAGE_PADDING};
  background: var(--bg-base);
}
.page-container--standard { max-width: ${PAGE_MAX_WIDTH}px; }
.page-container--wide { max-width: ${PAGE_MAX_WIDTH_WIDE}px; }
${mediaMax(BREAKPOINT_TABLET)} {
  .page-container { padding: ${PAGE_PADDING_MOBILE}; }
}
`;

/**
 * Shared page wrapper: centered content column with the app's standard
 * padding, collapsing at the tablet breakpoint. Renders a div because
 * RootFrame already provides the page's single <main> landmark.
 */
export default function PageContainer({ wide = false, className = '', children, ...rest }) {
  return (
    <div
      className={`page-container ${wide ? 'page-container--wide' : 'page-container--standard'}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      <style dangerouslySetInnerHTML={{ __html: CONTAINER_CSS }} />
      {children}
    </div>
  );
}
