import type { LanguageStorageAdapter } from './contracts'

/** Storage capabilities will be added with the Java backend. */
export class JavaStorageAdapter implements LanguageStorageAdapter<'java'> {
  readonly language = 'java' as const
}
