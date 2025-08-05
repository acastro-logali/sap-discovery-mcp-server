import { z } from "zod";

// SAP OData Connection Configuration Schema
export const SAPODataConfigSchema = z.object({
  baseUrl: z.string().describe("SAP OData service base URL (e.g., https://sap-host:8000/sap/opu/odata/sap/)"),
  username: z.string().describe("SAP username"),
  password: z.string().describe("SAP password"),
  client: z.string().optional().describe("SAP client number (if required)"),
  // Optional HTTP configuration
  timeout: z.number().default(30000).describe("Request timeout in milliseconds"),
  validateSSL: z.boolean().default(true).describe("Validate SSL certificates"),
  // CSRF token handling
  enableCSRF: z.boolean().default(true).describe("Enable CSRF token handling"),
});

export type SAPODataConfig = z.infer<typeof SAPODataConfigSchema>;

export interface ODataQueryOptions {
  select?: string[];
  filter?: string;
  orderby?: string;
  top?: number;
  skip?: number;
  expand?: string[];
}

export interface ODataService {
  name: string;
  title: string;
  version?: string;
  url?: string;
}

export interface ODataEntity {
  name: string;
  properties: ODataProperty[];
}

export interface ODataProperty {
  name: string;
  type: string;
  nullable: boolean;
}

export interface ODataFunction {
  name: string;
  returnType?: string;
}

export interface ODataMetadata {
  entities: ODataEntity[];
  functions: ODataFunction[];
  raw?: any;
}

export interface ODataServiceList {
  services: ODataService[];
  source?: 'gateway_catalog' | 'common_services_test' | 'none_found' | string;
  catalogUrl?: string;
  message?: string;
  raw?: any;
}

export interface ConnectionInfo {
  connected: boolean;
  baseUrl: string;
  username: string;
  client?: string;
  timeout: number;
  enableCSRF: boolean;
  hasCSRFToken: boolean;
}