export interface CVMeta {
  lastSynced: string
  sourceUrl: string
}

export interface Profile {
  name: string
  headline: string
  summary: string
  location: string
  email: string
  linkedinUrl: string
  githubUsername: string
  avatarUrl: string
}

export interface Experience {
  id: string
  company: string
  title: string
  location: string
  startDate: string
  endDate: string | null
  description: string
  logoUrl: string | null
}

export interface Education {
  id: string
  institution: string
  degree: string
  field: string
  startDate: string
  endDate: string | null
  description: string | null
}

export interface Skill {
  name: string
  category: string | null
  endorsements: number | null
}

export interface Language {
  name: string
  proficiency: string
}

export interface Project {
  name: string
  description: string
  url: string
  homepageUrl: string | null
  stars: number
  forks: number
  primaryLanguage: string | null
  topics: string[]
  updatedAt: string
}

export interface CVData {
  meta: CVMeta
  profile: Profile
  experience: Experience[]
  education: Education[]
  skills: Skill[]
  languages: Language[]
  projects: Project[]
}
