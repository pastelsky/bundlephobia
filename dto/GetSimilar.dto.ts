import { Tag } from '../types'

export type GetSimilarDto = {
  category: {
    label: string
    score: number
    similar: string[]
    tags: Tag[]
  }
  name: string
}
