import type { LanguageStorageAdapter } from './contracts'

/** Storage capabilities will be added with the Kotlin backend. */
export class KotlinStorageAdapter implements LanguageStorageAdapter<'kotlin'> {
  readonly language = 'kotlin' as const
}
