import { defineConfig } from 'vite'
import { resolve } from 'path'
import fs from 'fs'

const cvDataPlugin = {
  name: 'cv-data-injector',
  transformIndexHtml: {
    order: 'pre' as const,
    handler(html: string) {
      // Paths relative to project root (vite root is src/, __dirname is project root)
      const dataPath = fs.existsSync(resolve(__dirname, 'src/data/cv.json'))
        ? resolve(__dirname, 'src/data/cv.json')
        : resolve(__dirname, 'src/data/cv.stub.json')
      const cvData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      const tag = `<script id="cv-data" type="application/json">${JSON.stringify(cvData)}</script>`
      return html.replace('</head>', `${tag}\n</head>`)
    },
  },
}

export default defineConfig({
  root: 'src',
  base: process.env['GITHUB_PAGES'] === 'true' ? '/ks_cv/' : '/',
  plugins: [cvDataPlugin],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
})
