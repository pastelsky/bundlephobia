import npa from 'npm-package-arg'
import validatePackageName from 'validate-npm-package-name'

export function dependencyNames(
  manifest,
  fields = ['dependencies', 'devDependencies', 'optionalDependencies'],
) {
  const names = new Set()

  for (const field of fields) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      try {
        const parsed = npa.resolve(name, spec)
        const dependency = parsed.type === 'alias' ? parsed.subSpec : parsed

        if (
          dependency.registry &&
          validatePackageName(dependency.name).validForNewPackages
        )
          names.add(dependency.name)
      } catch {
        // Invalid, workspace-only and non-registry declarations are not npm candidates.
      }
    }
  }

  return names
}

export function isWebApplication(manifest, frameworks = []) {
  if (manifest.private !== true) return false
  const dependencies = dependencyNames(manifest)
  const framework = frameworks.some(name => dependencies.has(name))

  return Object.entries(manifest.scripts ?? {}).some(
    ([name, command]) =>
      /^(dev|build|start)(?::|$)/.test(name) &&
      (framework ||
        /(?:vite|nuxt|next|svelte-kit|astro|ng |webpack|react-scripts)/.test(
          command,
        )),
  )
}

export function supportsBrowser(manifest) {
  return (
    Boolean(manifest.browser) ||
    /"browser"\s*:/.test(JSON.stringify(manifest.exports ?? {})) ||
    /\b(?:browser|isomorphic|front[ -]?end)\b/i.test(
      (manifest.keywords ?? []).join(' '),
    )
  )
}
