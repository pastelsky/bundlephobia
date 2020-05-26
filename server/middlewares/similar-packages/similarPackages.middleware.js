const got = require('got')
const remark = require('remark')
const strip = require('strip-markdown')
const natural = require('natural')
const { categories } = require('./fixtures')
const debugTest = require('debug')('classifier:test')
const flatten = require('flatten')
const { parsePackageString } = require('../../../utils/common.utils')
const logger = require('../../Logger')
const debug = require('debug')('bp:similar')
const CONFIG = require('../../config')

const MIN_CUTOFF_SCORE = 12

const prefixURL = (url, { base, user, project, head, path }) => {
  if (url.includes('//')) {
    return url
  } else {
    return new URL(
      (path ? path.replace(/^\//, '') + '/' : '') +
        url.replace(/^(\.?\/?)/, ''),
      `${base}/${user}/${project}/${path ? '' : `${head}/`}`
    )
  }
}

async function getPackageDetails(packageName) {
  let readme
  const {
    body,
  } = await got(
    `https://ofcncog2cu-dsn.algolia.net/1/indexes/npm-search/${encodeURIComponent(
      packageName
    )}?x-algolia-application-id=OFCNCOG2CU&x-algolia-api-key=f54e21fa3a2a0160595bb058179bfb1e`,
    { json: true }
  )

  if ('readme' in body && body.readme.trim()) {
    readme = await stripMarkdown(body.readme)
  } else {
    const readmeMD = await getReadme(body.repository)
    readme = await stripMarkdown(readmeMD)
  }

  return { ...body, readme }
}

async function getReadme(repository) {
  const { host, user, project, branch, path } = repository
  if (host === 'github.com') {
    const getGithubFile = async fileName =>
      await got(
        prefixURL(fileName, {
          base: 'https://raw.githubusercontent.com',
          user,
          project,
          head: branch,
          path: path.replace(/\/tree\//, ''),
        })
      )

    try {
      const { body } = await getGithubFile('README.md')
      return body
    } catch (e) {
      const { body } = await getGithubFile('readme.md')
      return body
    }
  } else if (host === 'gitlab.com') {
    const getGitlabFile = async ({ user, project, branch, filePath }) => {
      // We need to use the Gitlab API because the raw url does not support cors
      // https://gitlab.com/gitlab-org/gitlab-ce/issues/25736
      // So we need to 'translate' raw urls to api urls.
      // E.g (https://gitlab.com/janslow/gitlab-fetch/raw/master/CHANGELOG.md) -> (https://gitlab.com/api/v4/projects/janslow%2Fgitlab-fetch/repository/files/CHANGELOG.md?ref=master)
      // Once gitlab adds support, we can get rid of this workaround.
      const apiUrl = `https://gitlab.com/api/v4/projects/${user}%2F${project}/repository/files/${encodeURIComponent(
        filePath
      )}?ref=${branch}`
      const { body } = await got(apiUrl, { json: true })

      if (body.encoding === 'base64') {
        return Buffer.from(body.content, 'base64').toString()
      } else {
        return body.content
      }
    }

    return getGitlabFile({
      user,
      project,
      branch,
      filePath: `${path}/README.md`,
    })
  } else if (host === 'bitbucket.org') {
    const { body } = await got(
      `https://bitbucket.org/${user}/${project}${
        path ? path.replace('src', 'raw') : `/raw/${branch}`
      }/README.md`
    )
    return body
  }
}

async function stripMarkdown(readme) {
  return new Promise((resolve, reject) => {
    remark()
      .use(strip)
      .process(readme, function (err, file) {
        if (err) reject(err)
        resolve(
          String(file).replace(
            /\b(npm|code|library|Node|example|project|license|MIT)\b/gi,
            ''
          )
        )
      })
  })
}

function getScore(categoryTokens, packageTokens) {
  const packageTokenWithoutDupes = Array.from(new Set(packageTokens))
  return packageTokenWithoutDupes.reduce((acc, curToken) => {
    const match = categoryTokens.find(token => token.tag === curToken)
    if (match) {
      return acc + match.weight
    }
    return acc
  }, 0)
}

function getInCategoryMap(packageName) {
  return Object.keys(categories).find(label =>
    categories[label].similar.some(
      similarPackage => similarPackage === packageName
    )
  )
}

async function getCategory(packageName) {
  if (getInCategoryMap(packageName)) {
    return {
      label: getInCategoryMap(packageName),
      score: 999,
    }
  }

  const { description, keywords } = await getPackageDetails(packageName)
  const tokenizer = new natural.WordTokenizer()
  const tokenString =
    (await stripMarkdown(description)) + ' ' + keywords.join(' ')
  const packageTokens = tokenizer
    .tokenize(tokenString)
    .map(token => token.toLowerCase())
    .map(natural.PorterStemmer.stem)
    .concat(tokenizer.tokenize(packageName).map(natural.PorterStemmer.stem))

  const scores = {}
  let maxScoreCategory = {
    category: '',
    score: 0,
  }

  Object.keys(categories).forEach(label => {
    const categoryTokens = flatten(
      categories[label].tags.map(tagObj =>
        tokenizer.tokenize(tagObj.tag).map(tokenizedTag => ({
          tag: natural.PorterStemmer.stem(tokenizedTag).toLowerCase(),
          weight: tagObj.weight,
        }))
      )
    )

    const score = getScore(categoryTokens, packageTokens)
    scores[label] = score
    if (score > maxScoreCategory.score) {
      maxScoreCategory = {
        label,
        score,
      }
    }
  })

  return maxScoreCategory
}

async function test() {
  Object.keys(categories).forEach(label => {
    categories[label].similar.forEach(async pack => {
      const actualCategory = await getCategory(pack)

      if (
        !actualCategory ||
        actualCategory.category !== label ||
        actualCategory.score < MIN_CUTOFF_SCORE
      ) {
        debugTest(
          'Package %s. Category expected: %s, got: %o',
          pack,
          label,
          actualCategory
        )
      }
    })
  })
}

async function similarPackagesMiddleware(ctx) {
  const { name } = parsePackageString(ctx.query.package)

  try {
    const matchedCategory = await getCategory(name)
    debug('Category for %s : %o', name, matchedCategory)
    if (matchedCategory.label) {
      const value = categories[matchedCategory.label]

      ctx.cacheControl = {
        maxAge: CONFIG.CACHE.SIMILAR_API,
      }

      ctx.body = {
        name,
        category: {
          ...matchedCategory,
          label: value.name,
          tags: value.tags,
          similar: value.similar.filter(pack => pack !== name),
        },
      }
    } else {
      ctx.body = {
        name,
        category: {
          label: null,
          score: 0,
          similarPackages: [],
        },
      }
    }
  } catch (err) {
    console.error(err)
    ctx.status = 500
    ctx.body = {
      error: err,
    }

    logger.error(
      'SIMILAR_PACKAGES_ERROR',
      {
        type: 'SIMIAR_PACKAGES',
        requestId: ctx.state.id,
        name,
        details: err,
      },
      `SIMILAR PACKAGES FAILED: ${name}`
    )
  }
}

module.exports = similarPackagesMiddleware
