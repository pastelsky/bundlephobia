import { isPotatoQuery } from '../client/components/PotatoRain/potato.utils'

describe('isPotatoQuery', () => {
  it('matches the easter egg query regardless of case and padding', () => {
    expect(isPotatoQuery('potato')).toBe(true)
    expect(isPotatoQuery('  Potato ')).toBe(true)
    expect(isPotatoQuery('POTATO')).toBe(true)
  })

  it('does not match package names that merely contain potato', () => {
    expect(isPotatoQuery('potatoes')).toBe(false)
    expect(isPotatoQuery('sweet-potato')).toBe(false)
    expect(isPotatoQuery('potato@1.0.0')).toBe(false)
    expect(isPotatoQuery('')).toBe(false)
  })
})
