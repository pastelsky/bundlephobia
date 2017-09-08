import fetch from 'unfetch'

export default class API {
  static get(url) {
    const fullURL = process.env.NODE_ENV === 'production' ? process.env.API_ENDPOINT + url : url

    return fetch(fullURL)
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
}