import type { Context, Middleware } from 'koa'

import remoteMcpClient from '../clients/remote-mcp.client'
import type { JsonObject, JsonValue } from '../../types/json'

type McpArguments = JsonObject

type McpPayload = { name: string; arguments?: McpArguments }

type BodyRequest = Context['request'] & { body?: JsonValue }

interface McpController {
  listTools: Middleware
  callTool: Middleware
}

function isStringJsonValue(value: JsonValue | undefined): value is string {
  return Object.prototype.toString.call(value) === '[object String]'
}

function getMcpString(value: JsonValue | undefined): string | undefined {
  return isStringJsonValue(value) ? value : undefined
}

const localMcpPathBuilders = new Map([
  [
    'bundlephobia.size',
    ({ packageName }: { packageName: string }) =>
      `/api/size?package=${packageName}`,
  ],
  [
    'bundlephobia.exports',
    ({ packageName }: { packageName: string }) =>
      `/api/exports?package=${packageName}`,
  ],
  [
    'bundlephobia.exportsSizes',
    ({ packageName }: { packageName: string }) =>
      `/api/exports-sizes?package=${packageName}`,
  ],
  [
    'bundlephobia.packageHistory',
    ({ packageName, args }: { packageName: string; args: McpArguments }) => {
      const params = new URLSearchParams({
        package: decodeURIComponent(packageName),
        limit: String(Number(args.limit ?? 40)),
      })

      const from = getMcpString(args.from)
      const to = getMcpString(args.to)

      if (from) params.set('from', from)

      if (to) params.set('to', to)

      return `/api/package-history?${params}`
    },
  ],
  [
    'bundlephobia.similarPackages',
    ({ packageName }: { packageName: string }) =>
      `/api/similar-packages?package=${packageName}`,
  ],
])

function getLocalMcpRequest(name: string, args: McpArguments) {
  const buildPath = localMcpPathBuilders.get(name)

  if (!buildPath) return null

  const packageNameValue = getMcpString(args.package)

  const packageName = packageNameValue
    ? encodeURIComponent(packageNameValue)
    : undefined

  return packageName
    ? { path: buildPath({ packageName, args }) }
    : { invalid: true as const }
}

function isMcpPayload(value: unknown): value is McpPayload {
  if (
    value === null ||
    value === undefined ||
    Object.prototype.toString.call(value) !== '[object Object]' ||
    !('name' in Object(value))
  ) {
    return false
  }

  // SAFETY: the object-tag and property-presence checks establish the payload shape.
  const name = (value as { name: unknown }).name

  return (
    Object.prototype.toString.call(name) === '[object String]' &&
    String(name).length > 0
  )
}

const localTools = [
  {
    name: 'bundlephobia.size',
    description: 'Get package size result via /api/size',
    inputSchema: {
      type: 'object',
      required: ['package'],
      properties: {
        package: { type: 'string' },
      },
    },
  },
  {
    name: 'bundlephobia.exports',
    description: 'Get package exports via /api/exports',
    inputSchema: {
      type: 'object',
      required: ['package'],
      properties: {
        package: { type: 'string' },
      },
    },
  },
  {
    name: 'bundlephobia.exportsSizes',
    description: 'Get package exports sizes via /api/exports-sizes',
    inputSchema: {
      type: 'object',
      required: ['package'],
      properties: {
        package: { type: 'string' },
      },
    },
  },
  {
    name: 'bundlephobia.packageHistory',
    description: 'Get package history via /api/package-history',
    inputSchema: {
      type: 'object',
      required: ['package'],
      properties: {
        package: { type: 'string' },
        limit: { type: 'number' },
        from: { type: 'string', format: 'date' },
        to: { type: 'string', format: 'date' },
      },
    },
  },
  {
    name: 'bundlephobia.similarPackages',
    description: 'Get similar packages via /api/similar-packages',
    inputSchema: {
      type: 'object',
      required: ['package'],
      properties: {
        package: { type: 'string' },
      },
    },
  },
]

export function createMcpController(port: number): McpController {
  return {
    listTools: async ctx => {
      try {
        if (!remoteMcpClient.isEnabled()) {
          ctx.body = { tools: localTools }

          return
        }

        const remote = await remoteMcpClient.listTools()

        ctx.body = {
          tools: [...localTools, ...remote.tools],
        }
      } catch (error) {
        remoteMcpClient.resetConnection(error)
        ctx.status = 502
        ctx.body = { error: { code: 'McpListToolsFailed' } }
      }
    },

    callTool: async ctx => {
      // SAFETY: koa-bodyparser augments the Koa request with a parsed JSON body.
      const payload = (ctx.request as BodyRequest).body

      if (!isMcpPayload(payload)) {
        ctx.status = 400
        ctx.body = {
          error: { code: 'InvalidMcpPayload', message: '`name` is required' },
        }

        return
      }

      try {
        const args = payload.arguments ?? {}
        const localRequest = getLocalMcpRequest(payload.name, args)

        if (localRequest?.invalid) {
          ctx.status = 400
          ctx.body = { error: { code: 'InvalidMcpPayload' } }

          return
        }

        if (localRequest) {
          const response = await fetch(
            `http://127.0.0.1:${port}${localRequest.path}`,
            {
              headers: {
                'X-Bundlephobia-User': 'bundlephobia mcp tool',
              },
            },
          )

          ctx.body = {
            status: response.status,
            body: await response.json(),
          }

          return
        }

        if (!remoteMcpClient.isEnabled()) {
          ctx.status = 404
          ctx.body = { error: { code: 'McpNotConfigured' } }

          return
        }

        ctx.body = await remoteMcpClient.callTool({
          name: payload.name,
          arguments: payload.arguments,
        })
      } catch (error) {
        remoteMcpClient.resetConnection(error)
        ctx.status = 502
        ctx.body = { error: { code: 'McpCallToolFailed' } }
      }
    },
  }
}
