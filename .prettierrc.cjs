module.exports = {
  singleQuote: true,
  semi: false,
  trailingComma: 'all', // Match ESLint configuration
  arrowParens: 'avoid',
  printWidth: 100,
  endOfLine: 'auto', // Match ESLint configuration

  // Control blank lines - be more conservative
  bracketSpacing: true,
  bracketSameLine: false,

  // Vue-specific options to reduce aggressive formatting
  vueIndentScriptAndStyle: false, // Don't indent script/style content

  // Override for Vue files - remove all extra blank lines
  overrides: [
    {
      files: '*.vue',
      options: {
        // Ignore whitespace to collapse all extra blank lines
        htmlWhitespaceSensitivity: 'ignore',
        // Don't rewrap text content
        proseWrap: 'preserve',
        // Keep trailing commas in Vue files to match ESLint
        trailingComma: 'all',
        // Conservative bracket handling
        bracketSpacing: true,
        bracketSameLine: false,
        // Don't change Vue template structure aggressively
        singleAttributePerLine: false,
      },
    },
  ],
}
