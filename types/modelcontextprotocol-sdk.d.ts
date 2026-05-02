declare module '@modelcontextprotocol/sdk/client' {
  export class Client {
    constructor(
      clientInfo: { name: string; version: string },
      options?: { capabilities?: Record<string, unknown> }
    )

    connect(transport: unknown, options?: { timeout?: number }): Promise<void>

    listTools(options?: { timeout?: number }): Promise<unknown>

    callTool(
      request: { name: string; arguments?: Record<string, unknown> },
      compatibility?: unknown,
      options?: { timeout?: number }
    ): Promise<unknown>
  }
}

declare module '@modelcontextprotocol/sdk/client/streamableHttp.js' {
  export class StreamableHTTPClientTransport {
    constructor(url: URL, options?: unknown)
  }
}
