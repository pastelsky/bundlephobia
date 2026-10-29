import fetch from 'unfetch'

import API, { setFetchImplementation } from '../client/api'
import type { JsonValue } from '../types/json'

const mockedFetch = jest.fn<typeof fetch>()

type APIResponse = Awaited<ReturnType<typeof fetch>>

function mockJSONResponse(body: JsonValue): APIResponse {
  // SAFETY: this fixture supplies the response members consumed by client/api.
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as APIResponse
}

function suggestion(name: string, searchScore: number, popularity: number) {
  return {
    package: { name, description: `${name} description` },
    searchScore,
    score: { detail: { popularity } },
  }
}

function mockSearchResults(npms: JsonValue, registry?: JsonValue) {
  mockedFetch.mockImplementation(url => {
    if (String(url).startsWith('https://api.npms.io/')) {
      return Promise.resolve(mockJSONResponse(npms))
    }

    if (String(url).startsWith('https://registry.npmjs.org/')) {
      return registry === undefined
        ? Promise.reject(new Error('registry unavailable'))
        : Promise.resolve(mockJSONResponse(registry))
    }

    throw new Error(`Unexpected request: ${String(url)}`)
  })
}

async function getSuggestionNames(query: string) {
  const suggestions = await API.getSuggestions(query)

  return suggestions.map(item => item.package.name)
}

describe('API.getSuggestions', () => {
  let restoreFetch: () => void

  beforeEach(() => {
    mockedFetch.mockReset()
    restoreFetch = setFetchImplementation(mockedFetch)
  })

  afterEach(() => {
    restoreFetch()
  })

  test('adds the exact match from the npm registry when npms.io misses it', async () => {
    mockSearchResults([suggestion('vaulted', 10, 0.1)], {
      objects: [suggestion('vaul', 2300, 1)],
    })

    await expect(getSuggestionNames('vaul')).resolves.toEqual([
      'vaul',
      'vaulted',
    ])
  })

  test('moves an exact match from npms.io to the top without querying the registry', async () => {
    mockSearchResults([
      suggestion('react-dom', 100000, 1),
      suggestion('react', 10, 1),
    ])

    await expect(getSuggestionNames('react')).resolves.toEqual([
      'react',
      'react-dom',
    ])
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  test('ignores registry results that are not an exact match', async () => {
    mockSearchResults([suggestion('vaulted', 10, 0.1)], {
      objects: [suggestion('vaul-drawer', 2300, 1)],
    })

    await expect(getSuggestionNames('vaul')).resolves.toEqual(['vaulted'])
  })

  test('keeps npms.io suggestions when the registry request fails', async () => {
    mockSearchResults([suggestion('vaulted', 10, 0.1)])

    await expect(getSuggestionNames('vaul')).resolves.toEqual(['vaulted'])
  })
})
