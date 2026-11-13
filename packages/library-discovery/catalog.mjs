import { z } from 'zod'
import validatePackageName from 'validate-npm-package-name'

export const stateSchema = z
  .object({
    version: z.literal(1),
    cursor: z.number().int().nonnegative(),
    surfaced: z.array(
      z.string().refine(name => validatePackageName(name).validForNewPackages),
    ),
  })
  .strict()

export function readState(value = { version: 1, cursor: 0, surfaced: [] }) {
  return stateSchema.parse(value)
}

export function catalogPackages(catalog) {
  return [
    ...new Set(Object.values(catalog).flatMap(category => category.similar)),
  ].sort()
}

export function rotate(items, cursor, count) {
  if (!items.length) return []

  return Array.from(
    { length: Math.min(count, items.length) },
    (_, i) => items[(cursor + i) % items.length],
  )
}
