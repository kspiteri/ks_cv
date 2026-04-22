import type { CVData, Experience, Education, Skill, Project } from './types'

// GitHub language colours (subset — add more as needed)
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  CSS: '#563d7c',
  HTML: '#e34c26',
  Shell: '#89e051',
  Vue: '#41b883',
  Svelte: '#ff3e00',
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (HTMLElement | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, v)
  }
  for (const child of children) {
    if (typeof child === 'string') {
      node.appendChild(document.createTextNode(child))
    } else {
      node.appendChild(child)
    }
  }
  return node
}

function formatDateRange(startDate: string, endDate: string | null): string {
  const fmt = (d: string) => {
    const [year, month] = d.split('-')
    return new Date(Number(year), Number(month) - 1).toLocaleDateString('en-GB', {
      month: 'short',
      year: 'numeric',
    })
  }
  return `${fmt(startDate)} — ${endDate ? fmt(endDate) : 'Present'}`
}

function renderHero(data: CVData['profile']): void {
  const section = document.getElementById('hero')
  if (!section) return

  const avatarEl = data.avatarUrl
    ? el('img', { src: data.avatarUrl, alt: data.name, class: 'hero__avatar' })
    : el('div', { class: 'hero__avatar-placeholder', 'aria-hidden': 'true' }, ['👤'])

  const links: HTMLElement[] = []

  if (data.githubUsername) {
    links.push(
      el('a', { href: `https://github.com/${data.githubUsername}`, class: 'hero__link', target: '_blank', rel: 'noopener noreferrer' }, [
        '⌥ GitHub',
      ]),
    )
  }
  if (data.linkedinUrl) {
    links.push(
      el('a', { href: data.linkedinUrl, class: 'hero__link', target: '_blank', rel: 'noopener noreferrer' }, [
        '↗ LinkedIn',
      ]),
    )
  }
  if (data.email) {
    links.push(
      el('a', { href: `mailto:${data.email}`, class: 'hero__link' }, ['✉ Email']),
    )
  }

  const nameEl = el('h1', { class: 'hero__name' }, [data.name])
  const headlineEl = el('p', { class: 'hero__headline' }, [data.headline])
  const summaryEl = el('p', { class: 'hero__summary' }, [data.summary])
  const linksEl = el('div', { class: 'hero__links' }, links)
  const textEl = el('div', { class: 'hero__text' }, [nameEl, headlineEl, summaryEl, linksEl])
  const inner = el('div', { class: 'hero__inner' }, [textEl, avatarEl])

  section.appendChild(inner)

  // Update page title and description meta
  document.title = `${data.name} — CV`
  const metaDesc = document.querySelector('meta[name="description"]')
  if (metaDesc) metaDesc.setAttribute('content', data.headline)
}

function renderExperience(items: Experience[]): void {
  const section = document.getElementById('experience')
  if (!section) return

  section.appendChild(el('h2', { class: 'section__title' }, ['Experience']))

  const timeline = el('ol', { class: 'timeline' })

  for (const item of items) {
    const titleEl = el('div', { class: 'timeline-item__title' }, [item.title])
    const companyEl = el('div', { class: 'timeline-item__company' }, [item.company])
    const datesEl = el('div', { class: 'timeline-item__dates' }, [formatDateRange(item.startDate, item.endDate)])
    const locationEl = el('div', { class: 'timeline-item__location' }, [item.location])
    const metaEl = el('div', { class: 'timeline-item__meta' }, [datesEl, locationEl])
    const headerEl = el('div', { class: 'timeline-item__header' }, [
      el('div', {}, [titleEl, companyEl]),
      metaEl,
    ])
    const descEl = el('p', { class: 'timeline-item__description' }, [item.description])
    const li = el('li', { class: 'timeline-item' }, [headerEl, descEl])
    timeline.appendChild(li)
  }

  section.appendChild(timeline)
}

function renderProjects(items: Project[]): void {
  const section = document.getElementById('projects')
  if (!section) return

  section.appendChild(el('h2', { class: 'section__title' }, ['Projects']))

  const grid = el('div', { class: 'projects__grid' })

  for (const item of items) {
    const nameEl = el('div', { class: 'project-card__name' }, [item.name])
    const descEl = el('p', { class: 'project-card__description' }, [item.description])

    const footerChildren: HTMLElement[] = []

    if (item.primaryLanguage) {
      const langColor = LANG_COLORS[item.primaryLanguage] ?? '#888'
      const dot = el('span', { class: 'project-card__lang-dot', style: `--lang-color: ${langColor}` })
      footerChildren.push(el('span', { class: 'project-card__lang' }, [dot, item.primaryLanguage]))
    }

    if (item.stars > 0) {
      footerChildren.push(el('span', { class: 'project-card__stat' }, [`★ ${item.stars}`]))
    }

    const topicsEl = el('div', { class: 'project-card__topics' })
    for (const topic of item.topics.slice(0, 3)) {
      topicsEl.appendChild(el('span', { class: 'project-card__topic' }, [topic]))
    }

    const footer = el('div', { class: 'project-card__footer' }, footerChildren)

    const cardChildren: HTMLElement[] = [nameEl, descEl]
    if (item.topics.length > 0) cardChildren.push(topicsEl)
    cardChildren.push(footer)

    const cardUrl = item.homepageUrl ?? item.url
    const card = el('a', { href: cardUrl, class: 'project-card', target: '_blank', rel: 'noopener noreferrer' }, cardChildren)
    grid.appendChild(card)
  }

  section.appendChild(grid)
}

function renderSkills(skills: Skill[], languages: CVData['languages']): void {
  const section = document.getElementById('skills')
  if (!section) return

  section.appendChild(el('h2', { class: 'section__title' }, ['Skills']))

  const groupsEl = el('div', { class: 'skills__groups' })

  // Group by category
  const groups = new Map<string, Skill[]>()
  for (const skill of skills) {
    const cat = skill.category ?? 'Other'
    const existing = groups.get(cat) ?? []
    existing.push(skill)
    groups.set(cat, existing)
  }

  for (const [category, categorySkills] of groups) {
    const titleEl = el('div', { class: 'skills__group-title' }, [category])
    const listEl = el('ul', { class: 'skills__list' })
    for (const skill of categorySkills) {
      const pillChildren: (HTMLElement | string)[] = [skill.name]
      if (skill.endorsements) {
        pillChildren.push(el('span', { class: 'skill-pill__count' }, [`·${skill.endorsements}`]))
      }
      listEl.appendChild(el('li', { class: 'skill-pill' }, pillChildren))
    }
    groupsEl.appendChild(el('div', { class: 'skills__group' }, [titleEl, listEl]))
  }

  section.appendChild(groupsEl)

  if (languages.length > 0) {
    const langTitle = el('h3', { class: 'skills__group-title', style: 'margin-top: var(--space-lg)' }, ['Languages'])
    const langList = el('div', { class: 'skills__languages' })
    for (const lang of languages) {
      langList.appendChild(
        el('div', { class: 'language-item' }, [
          el('span', { class: 'language-item__name' }, [lang.name]),
          el('span', { class: 'language-item__proficiency' }, [lang.proficiency]),
        ]),
      )
    }
    section.appendChild(langTitle)
    section.appendChild(langList)
  }
}

function renderEducation(items: Education[]): void {
  const section = document.getElementById('education')
  if (!section) return

  section.appendChild(el('h2', { class: 'section__title' }, ['Education']))

  const list = el('div', { class: 'education-list' })

  for (const item of items) {
    const degreeEl = el('div', { class: 'education-card__degree' }, [`${item.degree} — ${item.field}`])
    const institutionEl = el('div', { class: 'education-card__institution' }, [item.institution])
    const datesEl = el('div', { class: 'education-card__dates' }, [formatDateRange(item.startDate, item.endDate)])

    const headerChildren: HTMLElement[] = [
      el('div', {}, [degreeEl, institutionEl]),
      datesEl,
    ]

    const cardChildren: HTMLElement[] = [el('div', { class: 'education-card__header' }, headerChildren)]
    if (item.description) {
      cardChildren.push(el('p', { class: 'education-card__description' }, [item.description]))
    }

    list.appendChild(el('div', { class: 'education-card' }, cardChildren))
  }

  section.appendChild(list)
}

function renderNav(sections: Array<{ id: string; label: string }>): void {
  const nav = document.querySelector('.section-nav')
  if (!nav) return
  for (const { id, label } of sections) {
    nav.appendChild(el('a', { href: `#${id}` }, [label]))
  }
}

function renderFooter(name: string): void {
  const footer = document.querySelector('.site-footer')
  if (!footer) return
  const year = new Date().getFullYear()
  footer.appendChild(document.createTextNode(`${name} · ${year}`))
}

function applyRevealClasses(): void {
  const targets = document.querySelectorAll(
    '.timeline-item, .project-card, .skill-pill, .education-card',
  )
  for (const el of targets) {
    el.classList.add('reveal')
  }
}

function initTheme(): void {
  const toggle = document.getElementById('theme-toggle') as HTMLButtonElement | null
  if (!toggle) return

  const getCurrentTheme = () => document.documentElement.dataset['theme'] ?? 'light'
  const updateToggle = (theme: string) => {
    toggle.textContent = theme === 'dark' ? '☀' : '☾'
    toggle.setAttribute('aria-pressed', String(theme === 'dark'))
  }

  updateToggle(getCurrentTheme())

  toggle.addEventListener('click', () => {
    const next = getCurrentTheme() === 'dark' ? 'light' : 'dark'
    const applyTheme = () => {
      document.documentElement.dataset['theme'] = next
      updateToggle(next)
    }
    if ('startViewTransition' in document) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(document as any).startViewTransition(applyTheme)
    } else {
      applyTheme()
    }
    localStorage.setItem('theme', next)
  })
}

function init(): void {
  const scriptEl = document.getElementById('cv-data')
  if (!scriptEl?.textContent) {
    console.error('cv-data script element not found')
    return
  }

  const cvData: CVData = JSON.parse(scriptEl.textContent)

  renderHero(cvData.profile)
  renderExperience(cvData.experience)
  renderProjects(cvData.projects)
  renderSkills(cvData.skills, cvData.languages)
  renderEducation(cvData.education)
  renderNav([
    { id: 'hero', label: 'Intro' },
    { id: 'experience', label: 'Experience' },
    { id: 'projects', label: 'Projects' },
    { id: 'skills', label: 'Skills' },
    { id: 'education', label: 'Education' },
  ])
  renderFooter(cvData.profile.name)
  initTheme()
  applyRevealClasses()
}

document.addEventListener('DOMContentLoaded', init)
