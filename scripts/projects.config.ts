// List of GitHub repos to feature in the Projects section.
// Only repos with a homepageUrl (GitHub Pages) are shown on the site.
// Run pnpm sync after updating this list.

export const featuredRepos: Array<{
  repo: string      // GitHub repo name (must match exactly)
  homepageUrl: string // GitHub Pages URL
}> = [
  {
    repo: 'raghaj',
    homepageUrl: 'https://kspiteri.github.io/raghaj',
  },
]
