export type Awaitable<T> = T | PromiseLike<T>;

export interface RawProxiedRequest {
	params: { [param: string]: string };
	query: { [query: string]: string };
	headers: { [header: string]: string };
	body?: any;
	id: string;
	method: string;
	originalUrl: string,
	baseUrl: string,
	path: string
}

export interface ProxiedResponse {
	body: any;
	status: number | null;
	headers: { [param: string]: string } | null;
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

export interface ServerEvents {
	CLIENT_CONNECT: (socketId: string, routes: string[]) => Awaitable<void>,
	CLIENT_DISCONNECT: (socketId: string) => Awaitable<void>,
}


