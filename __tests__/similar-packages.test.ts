import { classifyPackage } from '../server/middlewares/similar-packages/similarPackages.middleware'
import { categories } from '../server/middlewares/similar-packages/fixtures'

// Same tokenizer the middleware scores with, so the check below compares what
// scoring compares rather than the raw tag strings.
const natural = require('natural')

// npm `description` and `keywords` exactly as published, so the classifier is
// exercised on the same input the live Algolia lookup returns. Re-read a row
// rather than trusting this comment:
//
//   curl -fsS https://registry.npmjs.org/<name> \
//     | jq -r '.versions[.["dist-tags"].latest] | .description, (.keywords|tostring)'
//
// A short list still passes here, because the dropped words match no tag. That
// is exactly why the claim needs a command behind it.
const PACKAGES: Record<
  string,
  { description: string; keywords: string[]; category: string }
> = {
  'chrono-node': {
    description: 'A natural language date parser in Javascript',
    keywords: [],
    category: 'date-nlp',
  },
  'its-a-date': {
    description: 'A Natural Language Date Description Processor',
    keywords: [
      'date',
      'time',
      'parse',
      'free text',
      'format',
      'parse date',
      'date formatter',
      'date parser',
      'natural language',
    ],
    category: 'date-nlp',
  },
  'parse-messy-time': {
    description: 'parse messy human date and time strings',
    keywords: ['date', 'time', 'parse', 'human'],
    category: 'date-nlp',
  },
  'date-fns': {
    description: 'Modern JavaScript date utility library',
    keywords: [],
    category: 'general-purpose-date-time',
  },
  dayjs: {
    description:
      '2KB immutable date time library alternative to Moment.js with the same modern API',
    keywords: ['dayjs', 'date', 'time', 'immutable', 'moment'],
    category: 'general-purpose-date-time',
  },
  luxon: {
    description: 'Immutable date wrapper',
    keywords: ['date', 'immutable'],
    category: 'general-purpose-date-time',
  },
  moment: {
    description: 'Parse, validate, manipulate, and display dates',
    keywords: [
      'moment',
      'date',
      'time',
      'parse',
      'format',
      'validate',
      'i18n',
      'l10n',
      'ender',
    ],
    category: 'general-purpose-date-time',
  },
  '@formkit/tempo': {
    description:
      'The easiest way to work with dates in JavaScript and TypeScript.',
    keywords: ['date', 'time', 'internationalization', 'date format'],
    category: 'general-purpose-date-time',
  },
}

describe('similar package categories', () => {
  describe('classifyPackage', () => {
    Object.entries(PACKAGES).forEach(([name, expected]) => {
      it(`puts ${name} in ${expected.category}`, async () => {
        const match = await classifyPackage(name, expected)

        expect(match.label).toBe(expected.category)
      })
    })
  })

  // A category whose tags are all present in an EARLIER category at the same or
  // a higher weight can never win, because the winner is chosen with `>` and a
  // tie therefore keeps the earlier key. Such a category is dead data: only an
  // explicit `similar` entry can ever reach it.
  //
  // The comparison runs on TOKENS, not on the raw tag strings, because that is
  // what scoring compares. `getCategory` tokenizes each tag, stems it and
  // lowercases it, so `animation` and `animations` are one token to the scorer
  // and two different strings to a naive check. A multi-word tag also becomes
  // several independent tokens, each carrying the tag's whole weight.
  it('leaves no category unreachable by scoring', () => {
    const tokenizer = new natural.WordTokenizer()

    /** The tag tokens a category can match, keyed by token, as scoring sees them. */
    const tokenWeights = (label: string) => {
      const weights = new Map<string, number>()

      categories[label].tags.forEach(tag => {
        tokenizer.tokenize(tag.tag).forEach(part => {
          const token = natural.PorterStemmer.stem(part).toLowerCase()
          // getScore stops at the FIRST matching tag, so that weight is the one
          // a duplicated token actually scores.
          if (!weights.has(token)) weights.set(token, tag.weight)
        })
      })

      return weights
    }

    const labels = Object.keys(categories)
    const unreachable: string[] = []

    labels.forEach((label, index) => {
      const tokens = tokenWeights(label)

      labels.slice(0, index).forEach(earlier => {
        const earlierTokens = tokenWeights(earlier)

        const dominated = [...tokens].every(([token, weight]) => {
          const earlierWeight = earlierTokens.get(token)
          return earlierWeight !== undefined && earlierWeight >= weight
        })

        if (dominated) {
          unreachable.push(`${label} can never outscore ${earlier}`)
        }
      })
    })

    expect(unreachable).toEqual([])
  })
})
