import axios, { AxiosInstance } from "axios";
import { parseString } from "xml2js";
import { promisify } from "util";
import https from "https";
import { 
  SAPODataConfig, 
  ODataQueryOptions, 
  ODataServiceList, 
  ODataMetadata, 
  ConnectionInfo,
  ODataService,
  ODataEntity,
  ODataFunction
} from "./types.js";

const parseXML = promisify(parseString);

export class SAPODataClient {
  private httpClient: AxiosInstance;
  private config: SAPODataConfig;
  private connected: boolean = false;
  private csrfToken: string | null = null;
  private cookies: string[] = [];

  constructor(config: SAPODataConfig) {
    this.config = config;
    
    // Create HTTPS agent if SSL validation is disabled
    const httpsAgent = config.validateSSL 
      ? undefined 
      : new https.Agent({ rejectUnauthorized: false });

    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout,
      auth: {
        username: config.username,
        password: config.password,
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(config.client && { 'sap-client': config.client }),
      },
      httpsAgent: httpsAgent,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Add request interceptor for CSRF token and cookies
    this.httpClient.interceptors.request.use((config) => {
      if (this.csrfToken && config.method !== 'get') {
        config.headers['X-CSRF-Token'] = this.csrfToken;
      }
      if (this.cookies.length > 0) {
        config.headers['Cookie'] = this.cookies.join('; ');
      }
      return config;
    });

    // Add response interceptor for CSRF token and cookie handling
    this.httpClient.interceptors.response.use(
      (response) => {
        // Extract CSRF token from response headers
        const csrfToken = response.headers['x-csrf-token'];
        if (csrfToken && csrfToken !== 'Required') {
          this.csrfToken = csrfToken;
        }

        // Extract cookies from response
        const setCookies = response.headers['set-cookie'];
        if (setCookies) {
          this.cookies = setCookies.map(cookie => cookie.split(';')[0]);
        }

        return response;
      },
      (error) => {
        // Handle 401 unauthorized
        if (error.response?.status === 401) {
          this.connected = false;
          this.csrfToken = null;
          this.cookies = [];
        }
        return Promise.reject(error);
      }
    );
  }

  async connect(): Promise<void> {
    try {
      console.log(`Connecting to SAP OData service at ${this.config.baseUrl}`);
      
      // Fetch CSRF token if enabled
      if (this.config.enableCSRF) {
        await this.fetchCSRFToken();
      }

      // For SAP OData, the base URL might not have a service document
      // Instead, we'll test connectivity by trying to access the catalog service
      // or by making a simple request that should return something other than 404
      
      let connectionTest = false;
      
      // Method 1: Try catalog service
      try {
        await this.httpClient.get('../iwfnd/catalogservice;v=2/ServiceCollection', {
          headers: { 'Accept': 'application/json' },
          timeout: 10000
        });
        connectionTest = true;
        console.log("Connection verified via catalog service");
      } catch (catalogError) {
        console.log("Catalog service not accessible, trying alternative methods");
      }
      
      // Method 2: Try a simple request to test authentication
      if (!connectionTest) {
        try {
          // This might return 404 but if we get 404 instead of 401/403, 
          // it means authentication worked
          await this.httpClient.get('', {
            headers: { 'Accept': 'application/xml' },
            timeout: 10000
          });
          connectionTest = true;
        } catch (error) {
          const axiosError = error as any;
          if (axiosError.response?.status === 404) {
            // 404 is expected for incomplete URL - this means connection works
            connectionTest = true;
            console.log("Connection verified - base URL returns 404 as expected");
          } else if (axiosError.response?.status === 401) {
            throw new Error("Authentication failed - check username/password");
          } else if (axiosError.response?.status === 403) {
            throw new Error("Access forbidden - check user authorizations");
          } else {
            throw error;
          }
        }
      }

      if (connectionTest) {
        this.connected = true;
        console.log("Successfully connected to SAP OData service");
      } else {
        throw new Error("Could not verify SAP OData connection");
      }
      
    } catch (error) {
      this.connected = false;
      this.csrfToken = null;
      this.cookies = [];
      throw new Error(`Failed to connect to SAP OData service: ${this.getErrorMessage(error)}`);
    }
  }

  private async fetchCSRFToken(): Promise<void> {
    try {
      await this.httpClient.get('', {
        headers: {
          'X-CSRF-Token': 'Fetch',
          'Accept': 'application/xml'
        }
      });
    } catch (error) {
      // CSRF token fetch might fail on some systems, continue anyway
      console.warn('Could not fetch CSRF token:', this.getErrorMessage(error));
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.csrfToken = null;
    this.cookies = [];
    console.log("Disconnected from SAP OData service");
  }

  async isConnected(): Promise<boolean> {
    if (!this.connected) return false;

    try {
      // Test connection with a request that should work
      // Even if it returns 404, that means the connection is working
      await this.httpClient.get('', {
        headers: { 'Accept': 'application/xml' },
        timeout: 5000
      });
      return true;
    } catch (error) {
      const axiosError = error as any;
      if (axiosError.response?.status === 404) {
        // 404 is expected for incomplete base URL - connection is still working
        return true;
      } else if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
        // Authentication issues mean we need to reconnect
        this.connected = false;
        return false;
      } else {
        // Other errors might be network issues
        this.connected = false;
        return false;
      }
    }
  }

  async getServices(): Promise<ODataServiceList> {
    this.ensureConnected();

    try {
      // Method 1: Try SAP Gateway Catalog Service
      const catalogPaths = [
        '../iwfnd/catalogservice;v=2/ServiceCollection',
        '../IWFND/CATALOGSERVICE;v=2/ServiceCollection',
        '../iwfnd/catalogservice/ServiceCollection',
        '../IWFND/CATALOGSERVICE/ServiceCollection'
      ];

      for (const catalogPath of catalogPaths) {
        try {
          console.log(`Trying catalog service at: ${catalogPath}`);
          const response = await this.httpClient.get(catalogPath, {
            headers: { 'Accept': 'application/json' }
          });

          if (response.data && response.data.d && response.data.d.results) {
            const services = response.data.d.results.map((service: any) => ({
              name: service.ID,
              title: service.Title || service.ID,
              version: service.Version,
              url: `${this.config.baseUrl}${service.ID}/`
            }));

            return { 
              services,
              source: 'gateway_catalog' as const,
              catalogUrl: catalogPath
            } as ODataServiceList;
          }
        } catch (error) {
          const axiosError = error as any;
          console.log(`Catalog service failed at ${catalogPath}: ${axiosError.response?.status || axiosError.message}`);
          continue;
        }
      }

      // Method 2: Try common service names if catalog fails
      console.log("Catalog service not available, testing common service names");
      const commonServices = [
        'GWSAMPLE_BASIC',
        'GWDEMO', 
        'RMTSAMPLEFLIGHT',
        'API_MATERIAL_SRV',
        'API_BUSINESS_PARTNER',
        'API_SALES_ORDER_SRV',
        'ZMM_MATERIAL_SRV',
        'ZSD_SALES_SRV',
        'ZFI_GL_SRV'
      ];

      const foundServices = [];
      for (const serviceName of commonServices) {
        try {
          await this.httpClient.get(`${serviceName}/`, {
            headers: { 'Accept': 'application/xml' },
            timeout: 5000
          });
          
          foundServices.push({
            name: serviceName,
            title: serviceName,
            url: `${this.config.baseUrl}${serviceName}/`
          });
        } catch (error) {
          // Service not found or not accessible, continue
          continue;
        }
      }

      if (foundServices.length > 0) {
        return {
          services: foundServices,
          source: 'common_services_test' as const
        } as ODataServiceList;
      }

      // Method 3: Return empty with helpful message
      return {
        services: [],
        source: 'none_found' as const,
        message: 'No services found. The base URL exists but specific services need to be discovered through SAP GUI or by testing known service names.'
      } as ODataServiceList;

    } catch (error) {
      throw new Error(`Failed to get OData services: ${this.getErrorMessage(error)}`);
    }
  }

  async getServiceMetadata(serviceName: string): Promise<ODataMetadata> {
    this.ensureConnected();

    try {
      const response = await this.httpClient.get(`${serviceName}/$metadata`, {
        headers: { 'Accept': 'application/xml' }
      });

      const parsed = await parseXML(response.data);
      return this.extractMetadata(parsed);
    } catch (error) {
      throw new Error(`Failed to get service metadata: ${this.getErrorMessage(error)}`);
    }
  }

  async queryEntitySet(serviceName: string, entitySet: string, options: ODataQueryOptions = {}): Promise<any> {
    this.ensureConnected();

    try {
      const params = new URLSearchParams();
      
      if (options.select && options.select.length > 0) {
        params.append('$select', options.select.join(','));
      }
      
      if (options.filter) {
        params.append('$filter', options.filter);
      }
      
      if (options.orderby) {
        params.append('$orderby', options.orderby);
      }
      
      if (options.top) {
        params.append('$top', options.top.toString());
      }
      
      if (options.skip) {
        params.append('$skip', options.skip.toString());
      }
      
      if (options.expand && options.expand.length > 0) {
        params.append('$expand', options.expand.join(','));
      }

      const url = `${serviceName}/${entitySet}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.httpClient.get(url);

      return response.data;
    } catch (error) {
      throw new Error(`Failed to query entity set ${entitySet}: ${this.getErrorMessage(error)}`);
    }
  }

  async getEntity(serviceName: string, entitySet: string, keyValues: Record<string, any>): Promise<any> {
    this.ensureConnected();

    try {
      const keyString = Object.entries(keyValues)
        .map(([key, value]) => `${key}='${encodeURIComponent(value)}'`)
        .join(',');

      const url = `${serviceName}/${entitySet}(${keyString})`;
      const response = await this.httpClient.get(url);

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get entity: ${this.getErrorMessage(error)}`);
    }
  }

  async createEntity(serviceName: string, entitySet: string, data: any): Promise<any> {
    this.ensureConnected();

    try {
      const response = await this.httpClient.post(`${serviceName}/${entitySet}`, data);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create entity: ${this.getErrorMessage(error)}`);
    }
  }

  async updateEntity(serviceName: string, entitySet: string, keyValues: Record<string, any>, data: any): Promise<any> {
    this.ensureConnected();

    try {
      const keyString = Object.entries(keyValues)
        .map(([key, value]) => `${key}='${encodeURIComponent(value)}'`)
        .join(',');

      const response = await this.httpClient.put(`${serviceName}/${entitySet}(${keyString})`, data);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to update entity: ${this.getErrorMessage(error)}`);
    }
  }

  async deleteEntity(serviceName: string, entitySet: string, keyValues: Record<string, any>): Promise<void> {
    this.ensureConnected();

    try {
      const keyString = Object.entries(keyValues)
        .map(([key, value]) => `${key}='${encodeURIComponent(value)}'`)
        .join(',');

      await this.httpClient.delete(`${serviceName}/${entitySet}(${keyString})`);
    } catch (error) {
      throw new Error(`Failed to delete entity: ${this.getErrorMessage(error)}`);
    }
  }

  async callFunction(serviceName: string, functionName: string, parameters: Record<string, any> = {}): Promise<any> {
    this.ensureConnected();

    try {
      const params = new URLSearchParams();
      Object.entries(parameters).forEach(([key, value]) => {
        params.append(key, String(value));
      });

      const url = `${serviceName}/${functionName}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await this.httpClient.get(url);

      return response.data;
    } catch (error) {
      throw new Error(`Failed to call function ${functionName}: ${this.getErrorMessage(error)}`);
    }
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error("Not connected to SAP OData service. Use sap_connect first.");
    }
  }

  private extractServices(parsed: any): ODataServiceList {
    try {
      const workspace = parsed?.service?.workspace;
      if (!workspace) return { services: [] };

      const collections = workspace[0]?.collection || [];
      const services: ODataService[] = collections.map((collection: any) => ({
        name: collection.$.href,
        title: collection.$.title || collection.$.href
      }));

      return { services };
    } catch (error) {
      return { services: [], raw: parsed };
    }
  }

  private extractMetadata(parsed: any): ODataMetadata {
    try {
      const schema = parsed?.['edmx:Edmx']?.['edmx:DataServices']?.[0]?.Schema?.[0];
      if (!schema) return { entities: [], functions: [] };

      const entityTypes = schema.EntityType || [];
      const functionImports = schema.EntityContainer?.[0]?.FunctionImport || [];

      const entities: ODataEntity[] = entityTypes.map((entity: any) => ({
        name: entity.$.Name,
        properties: (entity.Property || []).map((prop: any) => ({
          name: prop.$.Name,
          type: prop.$.Type,
          nullable: prop.$.Nullable !== 'false'
        }))
      }));

      const functions: ODataFunction[] = functionImports.map((func: any) => ({
        name: func.$.Name,
        returnType: func.$.ReturnType
      }));

      return { entities, functions };
    } catch (error) {
      return { entities: [], functions: [], raw: parsed };
    }
  }

  private getErrorMessage(error: any): string {
    if (error.response) {
      return `HTTP ${error.response.status}: ${error.response.statusText}`;
    } else if (error.request) {
      return "No response received from server";
    } else {
      return error.message || "Unknown error";
    }
  }

  getConnectionInfo(): ConnectionInfo {
    return {
      connected: this.connected,
      baseUrl: this.config.baseUrl,
      username: this.config.username,
      client: this.config.client,
      timeout: this.config.timeout,
      enableCSRF: this.config.enableCSRF,
      hasCSRFToken: !!this.csrfToken
    };
  }
}