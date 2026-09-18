export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export type JsonObject = {
  [key: string]: JsonValue
}

export type RuntimeValue =
  | object
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
