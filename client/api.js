import fetch from 'unfetch'

export default class API {
  static get(url) {
    return fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    })
      .then(res => {
        if (!res.ok) {
          return res.json()
            .then(err => Promise.reject(err))
        }
        return res.json()
      })
  }

  static getInfo(packageString) {
    return API.get(`/api/size?package=${packageString}&record=true`)
  }

  static getHistory(packageString) {
    return API.get(`/api/package-history?package=${packageString}`)
  }

  static getRecentSearches(limit) {
    return API.get(`/api/recent?limit=${limit}`)
  }

  static getSuggestions(query) {

    const suggestionSort = (packageA, packageB) => {
      // Rank closely matching packages followed
      // by most popular ones
      if (
        Math.abs(
          Math.log(packageB.searchScore) -
          Math.log(packageA.searchScore),
        ) > 1
      ) {
        return packageB.searchScore - packageA.searchScore
      } else {
        return packageB.score.detail.popularity -
          packageA.score.detail.popularity
      }
    }


    return API
      .get(`https://api.npms.io/v2/search/suggestions?q=${query}`)
      .then(result => result.sort(suggestionSort))

    // backup when npms.io is down

    //return API.get(`/-/search?text=${query}`)
    //  .then(result => result.objects
    //    .sort(suggestionSort)
    //    .map(suggestion => {
    //      const name = suggestion.package.name
    //      const hasMatch = name.indexOf(query) > -1
    //      const startIndex = name.indexOf(query)
    //      const endIndex = startIndex + query.length
    //      let highlight
    //
    //      if (hasMatch) {
    //        highlight =
    //          name.substring(0, startIndex) +
    //          '<em>' + name.substring(startIndex, endIndex) + '</em>' +
    //          name.substring(endIndex)
    //      } else {
    //        highlight = name
    //      }
    //
    //      return {
    //        ...suggestion,
    //        highlight,
    //      }
    //    }),
    //  )
  }
}