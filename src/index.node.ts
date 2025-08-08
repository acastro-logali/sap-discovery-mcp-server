import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { z, ZodRawShape, ZodTypeAny } from "zod";
import { toolDefinitions } from "./tool-definitions.js";
import { SAPODataHandlers } from "./handlers.js";

function toZodShape(inputSchema: any): ZodRawShape {
  const shape: ZodRawShape = {};
  if (!inputSchema?.properties) return shape;

  for (const key in inputSchema.properties) {
    const prop = inputSchema.properties[key];
    let t: ZodTypeAny;
    switch (prop.type) {
      case "string": t = z.string(); break;
      case "number": t = z.number(); break;
      case "boolean": t = z.boolean(); break;
      case "array": t = z.array(z.string()); break;
      case "object": t = z.object({}).passthrough(); break;
      default: t = z.any();
    }
    if (!inputSchema.required?.includes(key)) t = t.optional();
    if (prop.description) t = t.describe(prop.description);
    shape[key] = t;
  }
  return shape;
}

const server = new McpServer({ name: "sap-odata-mcp-server", version: "0.1.0" });
const handlers = new SAPODataHandlers();

// == Registrar tools (McpServer) ==
for (const tool of toolDefinitions) {
  const schema = toZodShape(tool.inputSchema);
  console.log(`🔧 Registering tool: ${tool.name}`);
  server.tool(tool.name, schema, async (args: any) => {
    switch (tool.name) {
      case "sap_connect":            return handlers.handleConnect(args);
      case "sap_get_services":       return handlers.handleGetServices();
      case "sap_get_service_metadata":return handlers.handleGetServiceMetadata(args);
      case "sap_query_entity_set":   return handlers.handleQueryEntitySet(args);
      case "sap_get_entity":         return handlers.handleGetEntity(args);
      case "sap_create_entity":      return handlers.handleCreateEntity(args);
      case "sap_update_entity":      return handlers.handleUpdateEntity(args);
      case "sap_delete_entity":      return handlers.handleDeleteEntity(args);
      case "sap_call_function":      return handlers.handleCallFunction(args);
      case "sap_connection_status":  return handlers.handleConnectionStatus();
      case "sap_disconnect":         return handlers.handleDisconnect();
      default:
        return { content: [{ type: "text", text: `Tool ${tool.name} not implemented.` }] };
    }
  });
}

const app = express();
app.use(cors({
  origin: "*",
  exposedHeaders: ["Mcp-Session-Id"],
  allowedHeaders: ["Content-Type", "Mcp-Session-Id", "mcp-session-id", "authorization"],
}));

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  enableJsonResponse: true,
  onsessioninitialized: (sid) => console.error(`🆕 MCP session initialized: ${sid}`),
});

await server.connect(transport); // 👈 IMPORTANTE

// Rutas: usa los handlers del transporte *sin* pasar server
app.post("/mcp", (req, res) => transport.handleRequest(req, res));
app.get("/sse",  (req, res) => transport.handleRequest(req, res));
app.get("/", (_req, res) => res.status(200).send("OK"));

const PORT = Number(process.env.PORT || 3007);
app.listen(PORT, () => {
  console.log(`✅ SAP OData MCP (HTTP) on http://0.0.0.0:${PORT}/mcp`);
});