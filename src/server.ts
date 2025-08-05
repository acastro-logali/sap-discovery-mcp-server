import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { toolDefinitions } from "./tool-definitions.js";
import { SAPODataHandlers } from "./handlers.js";
import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export class SAPODataMCPServer {
  public server: Server;
  private handlers: SAPODataHandlers;

  constructor() {
    this.server = new Server(
      { name: "sap-odata-mcp-server", version: "0.1.0" },
     
    );

    this.handlers = new SAPODataHandlers();
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.handlers.handleDisconnect();
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(InitializeRequestSchema, async () => {
      return {
        capabilities: { tools: { listChanged: true } }
      };
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefinitions,
    };
  });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "sap_connect":
            return await this.handlers.handleConnect(args);
          case "sap_get_services":
            return await this.handlers.handleGetServices();
          case "sap_get_service_metadata":
            return await this.handlers.handleGetServiceMetadata(args);
          case "sap_query_entity_set":
            return await this.handlers.handleQueryEntitySet(args);
          case "sap_get_entity":
            return await this.handlers.handleGetEntity(args);
          case "sap_create_entity":
            return await this.handlers.handleCreateEntity(args);
          case "sap_update_entity":
            return await this.handlers.handleUpdateEntity(args);
          case "sap_delete_entity":
            return await this.handlers.handleDeleteEntity(args);
          case "sap_call_function":
            return await this.handlers.handleCallFunction(args);
          case "sap_connection_status":
            return await this.handlers.handleConnectionStatus();
          case "sap_disconnect":
            return await this.handlers.handleDisconnect();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, errorMessage);
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("SAP OData MCP server running on stdio");
  }
}