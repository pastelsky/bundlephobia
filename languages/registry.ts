import {
  LANGUAGE_CAPABILITIES,
  LANGUAGE_IDS,
  type LanguageDescriptor,
  type LanguageId,
} from '../types/language-domain'

export const LANGUAGE_DESCRIPTORS = [
  {
    id: 'javascript',
    label: 'JavaScript',
    state: 'enabled',
    visibility: 'public',
    capabilities: LANGUAGE_CAPABILITIES,
  },
  {
    id: 'java',
    label: 'Java',
    state: 'disabled',
    visibility: 'hidden',
    capabilities: [],
  },
  {
    id: 'kotlin',
    label: 'Kotlin',
    state: 'disabled',
    visibility: 'hidden',
    capabilities: [],
  },
] as const satisfies readonly LanguageDescriptor[]

export interface LanguageRegistry {
  all(): readonly LanguageDescriptor[]
  get(id: LanguageId): LanguageDescriptor
  isLanguageId(value: string): value is LanguageId
  enabled(): readonly LanguageDescriptor[]
  visible(): readonly LanguageDescriptor[]
}

export function createLanguageRegistry(
  descriptors: readonly LanguageDescriptor[],
): LanguageRegistry {
  const byId = new Map<LanguageId, LanguageDescriptor>()

  descriptors.forEach(descriptor => {
    if (byId.has(descriptor.id)) {
      throw new Error(`Duplicate language descriptor: ${descriptor.id}`)
    }
    byId.set(descriptor.id, descriptor)
  })

  const missingIds = LANGUAGE_IDS.filter(id => !byId.has(id))
  if (missingIds.length > 0) {
    throw new Error(`Missing language descriptors: ${missingIds.join(', ')}`)
  }

  const all = Object.freeze([...descriptors])

  return Object.freeze({
    all: () => all,
    get(id: LanguageId) {
      const descriptor = byId.get(id)
      if (!descriptor) {
        throw new Error(`Unknown language descriptor: ${id}`)
      }
      return descriptor
    },
    isLanguageId(value: string): value is LanguageId {
      return byId.has(value as LanguageId)
    },
    enabled: () => all.filter(descriptor => descriptor.state === 'enabled'),
    visible: () => all.filter(descriptor => descriptor.visibility === 'public'),
  })
}

export const languageRegistry = createLanguageRegistry(LANGUAGE_DESCRIPTORS)
