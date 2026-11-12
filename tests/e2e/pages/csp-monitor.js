// Records Content-Security-Policy violations for the CSP test page. Loaded before the widget.
window.__cspViolations = []

function showCspStatus() {
  const status = document.getElementById('csp-status')
  if (!status) return
  const violations = window.__cspViolations
  status.className = violations.length ? 'status bad' : 'status ok'
  status.textContent = violations.length
    ? `${violations.length} violation(s): ${violations.join('; ')}`
    : 'No violations so far.'
}

document.addEventListener('securitypolicyviolation', event => {
  window.__cspViolations.push(`${event.violatedDirective} blocked ${event.blockedURI || 'inline'}`)
  showCspStatus()
})
document.addEventListener('DOMContentLoaded', showCspStatus)
