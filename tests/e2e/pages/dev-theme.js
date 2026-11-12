// Dark mode switch for the development pages (index.html, dev.html and the test pages). An
// external file, so it also runs on the strict CSP page. It sets class="dark" or class="light" on
// <html>, like many sites' theme switchers: the page styles use it and the widget follows it. The
// choice is shared by all development pages; until one is made, the system preference applies.
;(function () {
  const KEY = 'dev-page-theme'
  const root = document.documentElement
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
  let toggle = null

  function saved() {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  }

  function apply(dark) {
    root.classList.toggle('dark', dark)
    root.classList.toggle('light', !dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
    if (toggle) {
      toggle.input.checked = dark
      // Styled from script so it also looks right on pages without page.css (the isolation page).
      Object.assign(toggle.label.style, {
        background: dark ? '#1f2937' : '#ffffff',
        color: dark ? '#e5e7eb' : '#1f2937',
        borderColor: dark ? '#4b5563' : '#d1d5db',
      })
    }
  }

  apply(saved() ? saved() === 'dark' : systemDark.matches)
  systemDark.addEventListener('change', event => {
    if (!saved()) apply(event.matches)
  })

  function addSwitch() {
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.id = 'dev-dark-mode'
    label.append(input, 'Dark mode')
    Object.assign(label.style, {
      position: 'fixed',
      top: '12px',
      right: '16px',
      zIndex: '1',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      border: '1px solid',
      borderRadius: '999px',
      font: '14px/1.2 system-ui, sans-serif',
      letterSpacing: 'normal',
      textTransform: 'none',
      cursor: 'pointer',
    })
    input.addEventListener('change', () => {
      try {
        localStorage.setItem(KEY, input.checked ? 'dark' : 'light')
      } catch {
        // Storage blocked: the switch still works for this page.
      }
      apply(input.checked)
    })
    document.body.append(label)
    toggle = { label, input }
    apply(root.classList.contains('dark'))
  }

  if (document.body) addSwitch()
  else document.addEventListener('DOMContentLoaded', addSwitch)
})()
