import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const toolDefinitions: Tool[] = [
  {
    name: "sap_connect",
    description: "Connect to SAP OData service",
    inputSchema: {
      type: "object",
      properties: {
        baseUrl: { type: "string", description: "SAP OData service base URL (e.g., https://sap-host:8000/sap/opu/odata/sap/)" },
        username: { type: "string", description: "SAP username" },
        password: { type: "string", description: "SAP password" },
        client: { type: "string", description: "SAP client number (optional)" },
        timeout: { type: "number", description: "Request timeout in milliseconds", default: 30000 },
        validateSSL: { type: "boolean", description: "Validate SSL certificates", default: true },
        enableCSRF: { type: "boolean", description: "Enable CSRF token handling", default: true },
      },
      required: ["baseUrl", "username", "password"],
    },
  },
  {
    name: "sap_get_services",
    description: "Get list of available OData services",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "sap_get_service_metadata",
    description: "Get metadata for a specific OData service",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: { type: "string", description: "Name of the OData service" },
      },
      required: ["serviceName"],
    },
  },
  {
    name: "sap_query_entity_set",
    description: "Query an OData entity set with filtering, sorting, and pagination",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: { type: "string", description: "Name of the OData service" },
        entitySet: { type: "string", description: "Name of the entity set" },
        select: { 
          type: "array", 
          items: { type: "string" },
          description: "Fields to select" 
        },
        filter: { type: "string", description: "OData filter expression" },
        orderby: { type: "string", description: "OData orderby expression" },
        top: { type: "number", description: "Number of records to return" },
        skip: { type: "number", description: "Number of records to skip" },
        expand: { 
          type: "array", 
          items: { type: "string" },
          description: "Navigation properties to expand" 
        },
      },
      required: ["serviceName", "entitySet"],
    },
  },
  {
    name: "sap_get_entity",
    description: "Get a specific entity by its key values",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: { type: "string", description: "Name of the OData service" },
        entitySet: { type: "string", description: "Name of the entity set" },
        keyValues: { 
          type: "object", 
          description: "Key-value pairs for entity keys",
          additionalProperties: true 
        },
      },
      required: ["serviceName", "entitySet", "keyValues"],
    },
  },
  {
    name: "sap_create_entity",
    description: "Create a new entity in an entity set",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: { type: "string", description: "Name of the OData service" },
        entitySet: { type: "string", description: "Name of the entity set" },
        data: { 
          type: "object", 
          description: "Entity data to create",
          additionalProperties: true 
        },
      },
      required: ["serviceName", "entitySet", "data"],
    },
  },
  {
    name: "sap_update_entity",
    description: "Update an existing entity",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: { type: "string", description: "Name of the OData service" },
        entitySet: { type: "string", description: "Name of the entity set" },
        keyValues: { 
          type: "object", 
          description: "Key-value pairs for entity keys",
          additionalProperties: true 
        },
        data: { 
          type: "object", 
          description: "Entity data to update",
          additionalProperties: true 
        },
      },
      required: ["serviceName", "entitySet", "keyValues", "data"],
    },
  },
  {
    name: "sap_delete_entity",
    description: "Delete an entity",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: { type: "string", description: "Name of the OData service" },
        entitySet: { type: "string", description: "Name of the entity set" },
        keyValues: { 
          type: "object", 
          description: "Key-value pairs for entity keys",
          additionalProperties: true 
        },
      },
      required: ["serviceName", "entitySet", "keyValues"],
    },
  },
  {
    name: "sap_call_function",
    description: "Call an OData function import",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: { type: "string", description: "Name of the OData service" },
        functionName: { type: "string", description: "Name of the function to call" },
        parameters: { 
          type: "object", 
          description: "Function parameters",
          additionalProperties: true 
        },
      },
      required: ["serviceName", "functionName"],
    },
  },
  {
    name: "sap_connection_status",
    description: "Check SAP OData connection status and get connection info",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "sap_disconnect",
    description: "Disconnect from SAP OData service",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];