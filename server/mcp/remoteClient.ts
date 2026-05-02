import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import logger from '../Logger'

interface MpcCallToolRequest {
  name: string
  arguments?: Record<string, unknown>
}

interface McpConfig {
  endpoint?: string
  timeoutMs: number
}

class RemoteMcpClient {
  private client: Client | null = null

  private connectPromise: Promise<Client> | null = null

  private readonly config: McpConfig

  constructor(config: McpConfig) {
    this.config = config
  }

  isEnabled(): boolean {
    return Boolean(this.config.endpoint)
  }

  private async connect(): Promise<Client> {
    if (!this.config.endpoint) {
      throw new Error('MCP endpoint is not configured')
    }

    if (this.client) {
      return this.client
    }

    if (!this.connectPromise) {
      this.connectPromise = (async () => {
        const endpoint = this.config.endpoint
        if (!endpoint) {
          throw new Error('MCP endpoint is not configured')
        }

        const transport = new StreamableHTTPClientTransport(
          new URL(endpoint),
          {}
        )

        const client = new Client(
          {
            name: 'bundlephobia-mcp-client',
            version: '1.0.0',
          },
          {
            capabilities: {},
          }
        )

        await client.connect(transport, {
          timeout: this.config.timeoutMs,
        })

        this.client = client
        return client
      })()
    }

    return this.connectPromise
  }

  async listTools(): Promise<unknown> {
    const client = await this.connect()
    return client.listTools(undefined, {
      timeout: this.config.timeoutMs,
    })
  }

  async callTool(request: MpcCallToolRequest): Promise<unknown> {
    const client = await this.connect()
    return client.callTool(
      {
        name: request.name,
        arguments: request.arguments,
      },
      undefined,
      {
        timeout: this.config.timeoutMs,
      }
    )
  }

  resetConnection(error?: unknown): void {
    if (error) {
      logger.error('MCP_CLIENT', error, 'Resetting MCP client connection')
    }
    this.client = null
    this.connectPromise = null
  }
}

const remoteMcpClient = new RemoteMcpClient({
  endpoint: process.env.MCP_REMOTE_ENDPOINT,
  timeoutMs: 10000,
})

export default remoteMcpClient
