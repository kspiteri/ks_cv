import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { graphql } from '@octokit/graphql'
import { readFileSync, writeFileSync } from 'fs'
import { config as loadEnv } from 'dotenv'
import type { CVData, Profile, Experience, Education, Skill, Language, Project } from '../src/ts/types'
import { featuredRepos } from './projects.config'

loadEnv({ path: '.env.local' })

const PDF_PATH = 'assets/Profile.pdf'
const OUT_FILE = 'src/data/cv.json'
const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_GITHUB = process.argv.includes('--skip-github')

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

// LinkedIn PDF exports dates like "January 2023 - Present (3 years 4 months)"
// or "January 2018 - January 2020 (2 years 1 month)"
function parseDateRange(raw: string): { startDate: string; endDate: string | null } {
  const match = raw.match(/^([A-Za-z]+ \d{4})\s*-\s*(.+?)(?:\s*\(.*\))?$/)
  if (!match) return { startDate: '', endDate: null }

  const toYYYYMM = (s: string): string => {
    if (s.trim().toLowerCase() === 'present') return ''
    const d = new Date(s.trim())
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const startDate = toYYYYMM(match[1] ?? '')
  const endRaw = match[2]?.trim() ?? ''
  const endDate = endRaw.toLowerCase() === 'present' ? null : toYYYYMM(endRaw)

  return { startDate, endDate }
}

function parsePDF(text: string): {
  profile: Profile
  experience: Experience[]
  education: Education[]
  skills: Skill[]
  languages: Language[]
} {
  // pdfjs splits "Page 1 of 4" into 4 tokens — collapse before filtering
  const raw = text.split('\n').map(l => l.trim()).filter(Boolean)
  const lines: string[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 'Page' && raw[i + 2] === 'of') {
      i += 3
    } else {
      lines.push(raw[i] ?? '')
    }
  }

  const isDateRange = (l: string) => /^[A-Za-z]+ \d{4} - /.test(l)
  const isDuration  = (l: string) => /^\(\d+/.test(l)

  const expIdx     = lines.indexOf('Experience')
  const eduIdx     = lines.indexOf('Education')
  const skillsIdx  = lines.indexOf('Top Skills')
  const langIdx    = lines.indexOf('Languages')
  const certIdx    = lines.indexOf('Certifications')
  const summaryIdx = lines.indexOf('Summary')

  // --- Profile ---
  // In LinkedIn PDF exports: Summary is always preceded by location, headline, name (3 lines back)
  const nameIdx = summaryIdx !== -1 ? summaryIdx - 3 : -1

  const linkedinRaw = lines.find(l => l.includes('linkedin.com/in/')) ?? ''
  const linkedinSlug = linkedinRaw.replace(/.*linkedin\.com\/in\/([\w-]+).*/, '$1').replace(/-+$/, '')

  const profile: Profile = {
    name:     nameIdx !== -1 ? lines[nameIdx] ?? ''     : '',
    headline: nameIdx !== -1 ? lines[nameIdx + 1] ?? '' : '',
    location: nameIdx !== -1 ? lines[nameIdx + 2] ?? '' : '',
    summary:  summaryIdx !== -1 && expIdx !== -1
      ? lines.slice(summaryIdx + 1, expIdx).join(' ')
      : '',
    email:       lines.find(l => /^[\w.+-]+@[\w-]+\.\w+$/.test(l)) ?? '',
    linkedinUrl: linkedinSlug ? `https://www.linkedin.com/in/${linkedinSlug}/` : '',
    githubUsername: requireEnv('GITHUB_USERNAME'),
    avatarUrl: '',
  }

  // --- Experience ---
  // Per entry: company, title, date-range, duration (skip), location, ...desc
  const experience: Experience[] = []

  if (expIdx !== -1 && eduIdx !== -1) {
    const expLines = lines.slice(expIdx + 1, eduIdx)
    let i = 0

    while (i < expLines.length) {
      const dateIdx = expLines.findIndex((l, idx) => idx >= i && isDateRange(l))
      if (dateIdx === -1 || dateIdx < 2) break

      const company  = expLines[dateIdx - 2] ?? ''
      const title    = expLines[dateIdx - 1] ?? ''
      const dateStr  = expLines[dateIdx] ?? ''
      const afterDate = dateIdx + 1
      // Skip duration "(N months)" if present
      const locOffset = isDuration(expLines[afterDate] ?? '') ? afterDate + 1 : afterDate
      const location  = expLines[locOffset] ?? ''

      const nextDateIdx = expLines.findIndex((l, idx) => idx > dateIdx && isDateRange(l))
      const descEnd = nextDateIdx !== -1 ? nextDateIdx - 2 : expLines.length
      const description = expLines.slice(locOffset + 1, descEnd).join(' ')

      const { startDate, endDate } = parseDateRange(dateStr)

      if (company && title && startDate) {
        experience.push({
          id: `${company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${startDate}`,
          company, title, location, startDate, endDate, description, logoUrl: null,
        })
      }

      if (nextDateIdx === -1) break
      i = nextDateIdx - 2
    }
  }

  // --- Education ---
  // Per entry: institution, degree+field, "· (YYYY - YYYY)" on its own line
  const education: Education[] = []

  if (eduIdx !== -1) {
    const eduLines = lines.slice(eduIdx + 1)
    let i = 0

    while (i < eduLines.length) {
      const institution = eduLines[i] ?? ''
      const degreeField = eduLines[i + 1] ?? ''
      const dateLine    = eduLines[i + 2] ?? ''

      if (dateLine.startsWith('·')) {
        const commaIdx = degreeField.indexOf(',')
        const degree = commaIdx !== -1 ? degreeField.slice(0, commaIdx).trim() : degreeField
        const field  = commaIdx !== -1 ? degreeField.slice(commaIdx + 1).trim() : ''
        const dateMatch = dateLine.match(/\((\d{4})\s*-\s*(\d{4})\)/)

        if (institution && degree && dateMatch) {
          education.push({
            id: `${institution.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${dateMatch[1]}-09`,
            institution, degree, field,
            startDate: `${dateMatch[1]}-09`,
            endDate:   `${dateMatch[2]}-06`,
            description: null,
          })
        }
        i += 3
      } else {
        i++
      }
    }
  }

  // --- Skills ---
  const skills: Skill[] = []
  if (skillsIdx !== -1 && langIdx !== -1) {
    for (const l of lines.slice(skillsIdx + 1, langIdx)) {
      skills.push({ name: l, category: null, endorsements: null })
    }
  }

  // --- Languages ---
  // pdfjs splits "Maltese (Native or Bilingual)" into "Maltese" + "(Native or Bilingual)"
  const languages: Language[] = []
  if (langIdx !== -1) {
    const langEnd = certIdx !== -1 ? certIdx : langIdx + 12
    const langLines = lines.slice(langIdx + 1, langEnd)
    for (let i = 0; i < langLines.length; i += 2) {
      const name = langLines[i] ?? ''
      const prof = (langLines[i + 1] ?? '').replace(/^\(|\)$/g, '')
      if (name && prof) languages.push({ name, proficiency: prof })
    }
  }

  return { profile, experience, education, skills, languages }
}

interface GitHubGraphQLResponse {
  repository: {
    name: string
    description: string | null
    url: string
    stargazerCount: number
    forkCount: number
    primaryLanguage: { name: string } | null
    repositoryTopics: { nodes: Array<{ topic: { name: string } }> }
    updatedAt: string
  }
}

async function fetchGitHub(): Promise<Project[]> {
  const username = requireEnv('GITHUB_USERNAME')
  const token = requireEnv('GITHUB_TOKEN')

  const projects: Project[] = []

  for (const { repo, homepageUrl } of featuredRepos) {
    const { repository } = await graphql<GitHubGraphQLResponse>(
      `query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          name
          description
          url
          stargazerCount
          forkCount
          primaryLanguage { name }
          repositoryTopics(first: 5) { nodes { topic { name } } }
          updatedAt
        }
      }`,
      { owner: username, name: repo, headers: { authorization: `token ${token}` } },
    )

    projects.push({
      name: repository.name,
      description: repository.description ?? '',
      url: repository.url,
      homepageUrl,
      stars: repository.stargazerCount,
      forks: repository.forkCount,
      primaryLanguage: repository.primaryLanguage?.name ?? null,
      topics: repository.repositoryTopics.nodes.map(n => n.topic.name),
      updatedAt: repository.updatedAt,
    })
  }

  return projects
}

async function main(): Promise<void> {
  console.log(`Running sync${DRY_RUN ? ' (dry run)' : ''}...`)

  const pdfBuffer = readFileSync(PDF_PATH)
  const doc = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise
  const textChunks: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join('\n')
    textChunks.push(pageText)
  }
  const rawText = textChunks.join('\n')

  const { profile, experience, education, skills, languages } = parsePDF(rawText)
  const projects = SKIP_GITHUB ? [] : await fetchGitHub()

  const cvData: CVData = {
    meta: {
      lastSynced: new Date().toISOString(),
      sourceUrl: profile.linkedinUrl,
    },
    profile,
    experience,
    education,
    skills,
    languages,
    projects,
  }

  if (DRY_RUN) {
    console.log(JSON.stringify(cvData, null, 2))
  } else {
    writeFileSync(OUT_FILE, JSON.stringify(cvData, null, 2))
    console.log(`✓ Written to ${OUT_FILE}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
