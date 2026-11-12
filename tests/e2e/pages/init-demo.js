// Shared by the e2e test pages (an external file, so it also runs under a strict CSP). The test
// server's address comes from /dev-config.js.
window.testWidget = window.ClearIdeasWidget.init({
  accessKey: 'demo-public-key',
  apiBaseUrl: window.CHAT_DEV_API_URL,
})
