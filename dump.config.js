export default {
  outputFile: 'context-dump.md',
  ignoredDirs: ['.git', 'node_modules', 'packages'],
  ignoredPatterns: ['package-lock.json', '.gitignore', 'dump.config.js', 'LICENSE'],
  languageMap: {
    js: 'javascript',
    md: 'markdown',
    yml: 'yaml',
    txt: 'text',
  } 
};