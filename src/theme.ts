/**
 * Legacy theme variables, kept for backward compatibility of the package export.
 *
 * The widget defines all of its variables on its own root element and no longer injects this CSS.
 * To theme the widget, set --ci-widget-accent and --ci-widget-font-family on the page's :root
 * (see README, "Styling"), or configure the accent color on the server (style.color).
 */
export const themeCSS = `
:root {
  --ci-widget-surface: 255, 255, 255;
  --ci-widget-on-surface: 33, 33, 33;
  --ci-widget-background: 255, 255, 255;
  --ci-widget-on-background: 33, 33, 33;
  --ci-widget-feature: 237, 97, 63;
  --ci-widget-feature-secondary: 237, 152, 88;
  --ci-widget-error: 229, 57, 53;
  --ci-widget-secondary: 163, 177, 198;
  --ci-widget-border-color: 145, 145, 145;
  --ci-widget-border-opacity: 0.24;
  --ci-widget-medium-emphasis-opacity: 0.8;
  --ci-widget-high-emphasis-opacity: 0.9;
  --ci-widget-shadow-6: 0 6px 16px rgba(0, 0, 0, 0.15);
  --ci-widget-shadow-8: 0 8px 24px rgba(0, 0, 0, 0.2);
  --ci-widget-border-radius: 12px;
}

[data-theme="dark"],
.dark {
  --ci-widget-surface: 31, 31, 31;
  --ci-widget-on-surface: 255, 255, 255;
  --ci-widget-background: 24, 24, 24;
  --ci-widget-on-background: 255, 255, 255;
  --ci-widget-feature: 237, 97, 63;
  --ci-widget-feature-secondary: 237, 152, 88;
  --ci-widget-error: 211, 47, 47;
  --ci-widget-secondary: 107, 124, 145;
  --ci-widget-border-color: 234, 234, 234;
  --ci-widget-border-opacity: 0.12;
}
`
