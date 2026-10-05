import { z } from 'zod'

export const categorySchema = z.object({
  name: z.string().min(1),
  tags: z.array(z.object({ tag: z.string(), weight: z.number().int() })),
  similar: z.array(z.string()).max(6),
})

export const catalogSchema = z.record(z.string(), categorySchema)

export type Catalog = z.infer<typeof catalogSchema>
