import BuildProgressIndicator from '../client/components/BuildProgressIndicator'

describe('BuildProgressIndicator', () => {
  it('updates when a fast build completes before progress starts', () => {
    const onDone = jest.fn()
    const indicator = new BuildProgressIndicator({
      isDone: false,
      onDone,
    })

    expect(
      indicator.shouldComponentUpdate({ isDone: true, onDone }, indicator.state)
    ).toBe(true)
  })
})
