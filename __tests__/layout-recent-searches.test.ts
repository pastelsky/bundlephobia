import API from '../client/api'
import Layout from '../client/components/Layout/Layout'

jest.mock('../client/assets/heart.svg', () => () => null)
jest.mock('../client/assets/digital-ocean-logo.svg', () => () => null)

describe('Layout recent searches', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does not leave a rejected recent-search request unhandled', async () => {
    jest
      .spyOn(API, 'getRecentSearches')
      .mockRejectedValue({ error: { code: 'ServiceUnavailableError' } })

    const layout = new Layout({})
    const setState = jest.spyOn(layout, 'setState')
    layout.componentDidMount()

    await new Promise(resolve => setImmediate(resolve))

    expect(setState).not.toHaveBeenCalled()
  })
})
