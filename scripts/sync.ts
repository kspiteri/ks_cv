import { chromium } from 'playwright'
import { graphql } from '@octokit/graphql'
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { config as loadEnv } from 'dotenv'
import type { CVData, Profile, Experience, Education, Skill, Language, Project } from '../src/ts/types'
import type { BrowserContext } from 'playwright'

loadEnv()

const SESSION_FILE = '.playwright-session.json'
const OUT_FILE = 'src/data/cv.json'
const DRY_RUN = process.argv.includes('--dry-run')

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

function randomDelay(minMs = 800, maxMs = 2500): Promise<void> {
  return delay(minMs + Math.random() * (maxMs - minMs))
}

async function createContext(): Promise<BrowserContext> {
  const browser = await chromium.launch({ headless: true })
  const storageState = existsSync(SESSION_FILE)
    ? (JSON.parse(readFileSync(SESSION_FILE, 'utf-8')) as Parameters<typeof browser.newContext>[0] extends { storageState?: infer S } ? S : never)
    : undefined

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    storageState,
  })

  return context
}

async function ensureLoggedIn(context: BrowserContext): Promise<void> {
  const page = await context.newPage()
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' })

  const isLoggedIn = await page.locator('[data-test-global-nav-me-trigger]').isVisible().catch(() => false)

  if (!isLoggedIn) {
    console.log('Session expired or missing — logging in...')
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' })
    await page.fill('#username', requireEnv('LINKEDIN_EMAIL'))
    await page.fill('#password', requireEnv('LINKEDIN_PASSWORD'))
    await randomDelay()
    await page.click('[type="submit"]')
    await page.waitForURL('**/feed/**', { timeout: 15000 }).catch(() => {
      throw new Error('LinkedIn login failed — check credentials or 2FA challenge')
    })
    await context.storageState({ path: SESSION_FILE })
    console.log(`Session saved to ${SESSION_FILE}`)
  }

  await page.close()
}

async function scrapeLinkedIn(context: BrowserContext): Promise<{
  profile: Profile
  experience: Experience[]
  education: Education[]
  skills: Skill[]
  languages: Language[]
}> {
  const profileUrl = requireEnv('LINKEDIN_PROFILE_URL').replace(/\/$/, '')
  const page = await context.newPage()

  await page.goto(profileUrl, { waitUntil: 'domcontentloaded' })
  await randomDelay()

  // Scroll to trigger lazy loading
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
  await randomDelay(500, 1000)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await randomDelay()

  const name = await page.locator('h1').first().textContent().then((t) => t?.trim() ?? '')
  const headline = await page
    .locator('[data-generated-suggestion-target], .text-body-medium.break-words')
    .first()
    .textContent()
    .then((t) => t?.trim() ?? '')
    .catch(() => '')
  const location = await page
    .locator('.text-body-small.inline.t-black--light.break-words')
    .first()
    .textContent()
    .then((t) => t?.trim() ?? '')
    .catch(() => '')
  const summary = await page
    .locator('[data-generated-suggestion-target] + div, .pv-shared-text-with-see-more span')
    .first()
    .textContent()
    .then((t) => t?.trim() ?? '')
    .catch(() => '')
  const avatarUrl = await page
    .locator('img.profile-photo-edit__preview, .pv-top-card-profile-picture__image')
    .first()
    .getAttribute('src')
    .catch(() => '')

  const profile: Profile = {
    name,
    headline,
    summary,
    location,
    email: process.env['LINKEDIN_EMAIL'] ?? '',
    linkedinUrl: profileUrl,
    githubUsername: requireEnv('GITHUB_USERNAME'),
    avatarUrl: avatarUrl ?? '',
  }

  // --- Experience ---
  await page.goto(`${profileUrl}/details/experience/`, { waitUntil: 'domcontentloaded' })
  await randomDelay()

  const experience: Experience[] = []
  const expItems = await page.locator('li.pvs-list__paged-list-item').all()

  for (const item of expItems) {
    const title = await item.locator('div[aria-hidden="true"] span').nth(0).textContent().then((t) => t?.trim() ?? '').catch(() => '')
    const company = await item.locator('div[aria-hidden="true"] span').nth(1).textContent().then((t) => t?.trim() ?? '').catch(() => '')
    const dateRange = await item.locator('.pvs-entity__caption-wrapper, t-14.t-normal.t-black--light').first().textContent().then((t) => t?.trim() ?? '').catch(() => '')
    const location = await item.locator('span').filter({ hasText: /Remote|Hybrid|On-site|Oslo|London/ }).first().textContent().then((t) => t?.trim() ?? '').catch(() => '')
    const description = await item.locator('.pvs-list__outer-container, .pv-shared-text-with-see-more').first().textContent().then((t) => t?.trim() ?? '').catch(() => '')

    if (!title || !company) continue

    const [startRaw, endRaw] = dateRange.split('–').map((s) => s.trim())
    const parseDate = (raw: string | undefined): string => {
      if (!raw) return ''
      const match = raw.match(/(\w+ \d{4})/)
      if (!match?.[1]) return raw
      const d = new Date(match[1])
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }

    experience.push({
      id: `${company.toLowerCase().replace(/\s+/g, '-')}-${parseDate(startRaw)}`,
      company,
      title,
      location,
      startDate: parseDate(startRaw) || '2020-01',
      endDate: endRaw?.toLowerCase().includes('present') ? null : parseDate(endRaw) || null,
      description,
      logoUrl: null,
    })
  }

  // --- Education ---
  await page.goto(`${profileUrl}/details/education/`, { waitUntil: 'domcontentloaded' })
  await randomDelay()

  const education: Education[] = []
  const eduItems = await page.locator('li.pvs-list__paged-list-item').all()

  for (const item of eduItems) {
    const institution = await item.locator('div[aria-hidden="true"] span').nth(0).textContent().then((t) => t?.trim() ?? '').catch(() => '')
    const degreeField = await item.locator('div[aria-hidden="true"] span').nth(1).textContent().then((t) => t?.trim() ?? '').catch(() => '')
    const dateRange = await item.locator('.pvs-entity__caption-wrapper').first().textContent().then((t) => t?.trim() ?? '').catch(() => '')

    if (!institution) continue

    const parts = degreeField.split(',').map((s) => s.trim())
    const degree = parts[0] ?? ''
    const field = parts[1] ?? ''
    const [startRaw, endRaw] = dateRange.split('–').map((s) => s.trim())
    const parseYear = (raw: string | undefined): string => {
      const match = raw?.match(/\d{4}/)
      return match ? `${match[0]}-06` : ''
    }

    education.push({
      id: `${institution.toLowerCase().replace(/\s+/g, '-')}-${parseYear(startRaw)}`,
      institution,
      degree,
      field,
      startDate: parseYear(startRaw) || '2015-09',
      endDate: parseYear(endRaw) || null,
      description: null,
    })
  }

  // --- Skills ---
  await page.goto(`${profileUrl}/details/skills/`, { waitUntil: 'domcontentloaded' })
  await randomDelay()

  const skills: Skill[] = []
  const skillItems = await page.locator('li.pvs-list__paged-list-item').all()

  for (const item of skillItems) {
    const skillName = await item.locator('div[aria-hidden="true"] span').first().textContent().then((t) => t?.trim() ?? '').catch(() => '')
    const endorsementsText = await item.locator('span').filter({ hasText: /\d+ endorsement/ }).first().textContent().then((t) => t?.trim() ?? '').catch(() => '')
    const endorsements = endorsementsText ? parseInt(endorsementsText.match(/\d+/)?.[0] ?? '0', 10) : null

    if (skillName) {
      skills.push({ name: skillName, category: null, endorsements })
    }
  }

  // --- Languages ---
  await page.goto(`${profileUrl}/details/languages/`, { waitUntil: 'domcontentloaded' })
  await randomDelay()

  const languages: Language[] = []
  const langItems = await page.locator('li.pvs-list__paged-list-item').all()

  for (const item of langItems) {
    const langName = await item.locator('div[aria-hidden="true"] span').nth(0).textContent().then((t) => t?.trim() ?? '').catch(() => '')
    const proficiency = await item.locator('div[aria-hidden="true"] span').nth(1).textContent().then((t) => t?.trim() ?? '').catch(() => '')
    if (langName) languages.push({ name: langName, proficiency })
  }

  await page.close()
  return { profile, experience, education, skills, languages }
}

interface GitHubGraphQLResponse {
  user: {
    pinnedItems: {
      nodes: Array<{
        name: string
        description: string | null
        url: string
        homepageUrl: string | null
        stargazerCount: number
        forkCount: number
        primaryLanguage: { name: string } | null
        repositoryTopics: { nodes: Array<{ topic: { name: string } }> }
        updatedAt: string
      }>
    }
  }
}

async function fetchGitHub(): Promise<Project[]> {
  const username = requireEnv('GITHUB_USERNAME')
  const token = requireEnv('GITHUB_TOKEN')

  const { user } = await graphql<GitHubGraphQLResponse>(
    `query($login: String!) {
      user(login: $login) {
        pinnedItems(first: 6, types: REPOSITORY) {
          nodes {
            ... on Repository {
              name
              description
              url
              homepageUrl
              stargazerCount
              forkCount
              primaryLanguage { name }
              repositoryTopics(first: 5) { nodes { topic { name } } }
              updatedAt
            }
          }
        }
      }
    }`,
    { login: username, headers: { authorization: `token ${token}` } },
  )

  return user.pinnedItems.nodes.map((repo) => ({
    name: repo.name,
    description: repo.description ?? '',
    url: repo.url,
    homepageUrl: repo.homepageUrl ?? null,
    stars: repo.stargazerCount,
    forks: repo.forkCount,
    primaryLanguage: repo.primaryLanguage?.name ?? null,
    topics: repo.repositoryTopics.nodes.map((n) => n.topic.name),
    updatedAt: repo.updatedAt,
  }))
}

async function main(): Promise<void> {
  console.log(`Running sync${DRY_RUN ? ' (dry run)' : ''}...`)

  const context = await createContext()
  await ensureLoggedIn(context)

  const [linkedInData, projects] = await Promise.all([
    scrapeLinkedIn(context),
    fetchGitHub(),
  ])

  await context.browser()?.close()

  const cvData: CVData = {
    meta: {
      lastSynced: new Date().toISOString(),
      sourceUrl: requireEnv('LINKEDIN_PROFILE_URL'),
    },
    ...linkedInData,
    projects,
  }

  if (DRY_RUN) {
    console.log(JSON.stringify(cvData, null, 2))
  } else {
    writeFileSync(OUT_FILE, JSON.stringify(cvData, null, 2))
    console.log(`✓ Written to ${OUT_FILE}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
