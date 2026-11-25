import { z } from 'zod'

export const STAMP_INKS = [
  'blue',
  'green',
  'neptune',
  'dandelion',
  'orange',
  'lilac',
  'coral',
] as const

export const STAMP_MOTIONS = [
  'tick',
  'glide',
  'float',
  'bounce',
  'wiggle',
  'pulse',
  'register',
] as const

export const STAMP_MARK_ROLES = [
  'stroke',
  'thin',
  'fill',
  'cutout',
  'cutout-stroke',
  'cutout-thin',
] as const

export const stampInkSchema = z.enum(STAMP_INKS)

export const stampMotionSchema = z.enum(STAMP_MOTIONS)

export const stampMarkRoleSchema = z.enum(STAMP_MARK_ROLES)

const coord = z.number().finite().min(-12).max(48)

const positiveSize = z.number().finite().positive().max(48)

const svgPathData = z
  .string()
  .min(1)
  .max(400)
  .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/, 'Invalid SVG path data')

const svgPointsData = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[0-9.,\s-]+$/, 'Invalid SVG polygon points')

const commonMarkProps = {
  role: stampMarkRoleSchema.optional(),
  opacity: z.number().finite().min(0.05).max(1).optional(),
  dashed: z.boolean().optional(),
  rotate: z.tuple([z.number().finite(), coord, coord]).optional(),
  color: stampInkSchema.optional(),
}

export const stampMarkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('path'),
    d: svgPathData,
    ...commonMarkProps,
  }),
  z.object({
    type: z.literal('circle'),
    cx: coord,
    cy: coord,
    r: positiveSize,
    ...commonMarkProps,
  }),
  z.object({
    type: z.literal('rect'),
    x: coord,
    y: coord,
    width: positiveSize,
    height: positiveSize,
    rx: z.number().finite().nonnegative().max(24).optional(),
    ...commonMarkProps,
  }),
  z.object({
    type: z.literal('ellipse'),
    cx: coord,
    cy: coord,
    rx: positiveSize,
    ry: positiveSize,
    ...commonMarkProps,
  }),
  z.object({
    type: z.literal('line'),
    x1: coord,
    y1: coord,
    x2: coord,
    y2: coord,
    ...commonMarkProps,
  }),
  z.object({
    type: z.literal('polygon'),
    points: svgPointsData,
    ...commonMarkProps,
  }),
])

export const categoryStampSchema = z.object({
  ink: stampInkSchema,
  motion: stampMotionSchema,
  backdrop: z.array(stampMarkSchema).min(1).max(6),
  marks: z.array(stampMarkSchema).min(1).max(16),
})

export type StampInk = z.infer<typeof stampInkSchema>

export type StampMotion = z.infer<typeof stampMotionSchema>

export type StampMarkRole = z.infer<typeof stampMarkRoleSchema>

export type StampMark = z.infer<typeof stampMarkSchema>

export type CategoryStamp = z.infer<typeof categoryStampSchema>

export const categoryStampsSchema = z.record(z.string(), categoryStampSchema)

export type CategoryStamps = z.infer<typeof categoryStampsSchema>

export const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).max(160).optional(),
  tags: z.array(z.object({ tag: z.string(), weight: z.number().int() })),
  similar: z.array(z.string()).max(6),
})

export const catalogSchema = z.record(z.string(), categorySchema)

export type Catalog = z.infer<typeof catalogSchema>
