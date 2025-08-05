import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodRawShape, ZodTypeAny } from "zod";
import { SAPODataHandlers } from "./handlers.js";
import { toolDefinitions } from "./tool-definitions.js";

export interface Env {
  // tus bindings de Cloudflare
}

function convertSchemaToZodShape(inputSchema: any): ZodRawShape {
  const shape: ZodRawShape = {};
  if (!inputSchema.properties) {
    return shape;
  }
  for (const key in inputSchema.properties) {
    const prop = inputSchema.properties[key];
    let zodType: ZodTypeAny;
    switch (prop.type) {
      case "string":
        zodType = z.string();
        break;
      case "number":
        zodType = z.number();
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      case "array":
        zodType = z.array(z.string());
        break;
      case "object":
        zodType = z.object({}).passthrough();
        break;
      default:
        zodType = z.any();
    }
    if (!inputSchema.required?.includes(key)) {
      zodType = zodType.optional();
    }
    if (prop.description) {
      zodType = zodType.describe(prop.description);
    }
    shape[key] = zodType;
  }
  return shape;
}

export class MyMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "sap-odata-mcp-server",
    version: "0.1.0",
  });

  private handlers = new SAPODataHandlers();

  async init() {
    for (const tool of toolDefinitions) {
      const zodShape = convertSchemaToZodShape(tool.inputSchema);

      console.log(`🔧 Registering tool: ${tool.name}`);

      // ***** CORRECCIÓN AQUÍ *****
      // Usamos zodShape como segundo argumento para que el SDK sepa
      // qué parámetros espera la herramienta.
      this.server.tool(
        tool.name,
        zodShape, 
        async (args: any) => {
          switch (tool.name) {
            case "sap_connect":
              return this.handlers.handleConnect(args);
            case "sap_get_services":
              return this.handlers.handleGetServices();
            case "sap_get_service_metadata":
              return this.handlers.handleGetServiceMetadata(args);
            case "sap_query_entity_set":
              return this.handlers.handleQueryEntitySet(args);
            case "sap_get_entity":
              return this.handlers.handleGetEntity(args);
            case "sap_create_entity":
              return this.handlers.handleCreateEntity(args);
            case "sap_update_entity":
              return this.handlers.handleUpdateEntity(args);
            case "sap_delete_entity":
              return this.handlers.handleDeleteEntity(args);
            case "sap_call_function":
              return this.handlers.handleCallFunction(args);
            case "sap_connection_status":
              return this.handlers.handleConnectionStatus();
            case "sap_disconnect":
              return this.handlers.handleDisconnect();
            default:
              return {
                content: [
                  { type: "text" as const, text: `Tool ${tool.name} not implemented.` }
                ]
              };
          }
        }
      );
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

     // Extraemos el Session-Id y lo mostramos por consola
    const sessionId = request.headers.get("Mcp-Session-Id");
    if (sessionId) {
      console.log("🆔 Mcp-Session-Id:", sessionId);
    }

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  }
};