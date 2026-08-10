declare module 'lru-cache' {
  export default class LRU<K, V> {
    constructor(options: { max: number })
    get(key: K): V | undefined
    set(key: K, value: V, maxAge?: number): this
  }
}
