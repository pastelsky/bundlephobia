import { splitNpmDateRange } from '../server/clients/npm-downloads.client'

describe('npm downloads ranges', () => {
  it('splits long ranges into contiguous bounded requests', () => {
    expect(splitNpmDateRange('2023-09-21:2026-09-21')).toEqual([
      '2023-09-21:2024-09-19',
      '2024-09-20:2025-09-19',
      '2025-09-20:2026-09-19',
      '2026-09-20:2026-09-21',
    ])
  })

  it('leaves npm aliases and short ranges unchanged', () => {
    expect(splitNpmDateRange('last-year')).toEqual(['last-year'])
    expect(splitNpmDateRange('2025-01-01:2025-01-31')).toEqual([
      '2025-01-01:2025-01-31',
    ])
  })
})
