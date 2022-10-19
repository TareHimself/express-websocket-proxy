import { FSWatcher } from "fs";

export interface RawProxiedRequest {
	params: { [param: string]: number };
	query: { [query: string]: number };
	headers: { [header: string]: number };
	body?: any;
	id: string;
	method: string;
	originalUrl: string,
	baseUrl: string,
	path: string
}

export interface ProxiedResponse {
	body?: any;
	status?: number;
	headers?: { [param: string]: number };
}

export interface ProxyIdentify {
	routes: string[];
}

export interface ServerStartOptions {
	port?: number;
	hostname?: string;
	use_ssl?: boolean;
	ssl_key?: string | Buffer;
	ssl_cert?: string | Buffer;
}

