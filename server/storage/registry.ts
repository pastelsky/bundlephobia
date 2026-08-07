import type { LanguageId } from '../../types/language-domain'
import type { LanguageStorageAdapter } from './contracts'
import { JavaStorageAdapter } from './java'
import { JavaScriptStorageAdapter } from './javascript'
import { KotlinStorageAdapter } from './kotlin'

export const javascriptStorage = new JavaScriptStorageAdapter()

const adapters: Record<LanguageId, LanguageStorageAdapter> = {
  javascript: javascriptStorage,
  java: new JavaStorageAdapter(),
  kotlin: new KotlinStorageAdapter(),
}

export function getLanguageStorageAdapter<L extends LanguageId>(
  language: L
): LanguageStorageAdapter<L> {
  return adapters[language] as LanguageStorageAdapter<L>
}
