import { z } from 'zod'

export const recommendationSchema = z.object({
  package: z.string(),
  repository: z.string(),
  discovery: z
    .object({ reason: z.string(), source: z.string().nullable() })
    .optional(),
  reason: z.string(),
  tradeoffs: z.string(),
  sources: z.array(z.string()),
})

export const categorySchema = z.object({
  name: z.string().min(1),
  tags: z.array(z.object({ tag: z.string(), weight: z.number().int() })),
  similar: z.array(z.string()).max(6),
  research: z
    .object({
      reason: z.string(),
      recommendations: z.record(z.string(), recommendationSchema),
    })
    .optional(),
})

export const catalogSchema = z.record(z.string(), categorySchema)

export type Catalog = z.infer<typeof catalogSchema>
