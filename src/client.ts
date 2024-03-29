import { io, Socket } from 'socket.io-client';
import { ProxiedResponse, ProxyIdentify, RawProxiedRequest } from './types';
import { EventEmitter } from 'events';
import { PROXY_PATH_REGEX, SOCKET_PROXIED_REQUEST_CLOSE, SOCKET_PROXIED_RESPONSE } from './constants';


export class WebRequest extends EventEmitter {

	webSocket: Socket;
	id: string;
	url: string;
	params: { [param: string]: string };
	query: { [query: string]: string };
	headers: { [header: string]: string };
	body?: any;
	method: string;
	originalUrl: string;
	baseUrl: string;
	path: string
	res: ProxiedResponse
	responded: boolean
	onCloseCallback: (() => void) | null;
	debug: boolean;


	constructor(req: RawProxiedRequest, socket: Socket, debug = false) {
		super()
		this.webSocket = socket
		this.res = {
			body: null,
			headers: null,
			status: null
		}
		this.debug = debug
		this.responded = false
		Object.assign(this, req)
		this.onCloseCallback = this._onClosed.bind(this)
		this.webSocket.once(`${this.id}|${SOCKET_PROXIED_REQUEST_CLOSE}`, this.onCloseCallback)
		if (this.debug) console.log(this.id, "<< New proxied request")
	}

	private _onClosed() {
		if (this.responded) {
			return;
		}

		this.emit(SOCKET_PROXIED_REQUEST_CLOSE);
		this.onCloseCallback = null;
		this.responded = true;
		if (this.debug) console.log(this.id, "<< Connection closed")
	}

	removeAllCallbacks() {
		if (this.onCloseCallback) {
			this.webSocket.off(`${this.id}|${SOCKET_PROXIED_REQUEST_CLOSE}`, this.onCloseCallback)
		}
	}

	sendStatus(status: number) {
		this.res.status = status
		this._sendPayload()
	}

	status(status: number) {
		this.res.status = status
	}

	setHeader(field: string, value: string) {
		if (!this.headers) {
			this.res.headers = {}
		}
		this.res.headers![field] = value
	}

	setHeaders(newHeaders: { [key: string]: string }) {
		this.res.headers = newHeaders
	}

	send(body: any) {
		this.res.body = body
		this._sendPayload()
	}

	_sendPayload() {
		if (this.responded) return
		this.responded = true;
		this.webSocket.emit(`${this.id}|${SOCKET_PROXIED_RESPONSE}`, this.res);
		this.removeAllCallbacks();
		if (this.debug) console.log(this.id, ">> Sending", this.res)
	}
}

export type ProxiedMethod = 'get' | 'head' | 'post' | 'put' | 'delete' | 'patch'

export type ProxiedPath = `${ProxiedMethod}|${string}` | `-${ProxiedMethod}|${string}`

export class Client<IdentifyType extends ProxyIdentify = ProxyIdentify> {
	routes: [string, (req: WebRequest) => void][];
	webSocket: Socket | null;
	url: string;
	clientId: string;
	identifyGenerator: (this_client: Client<IdentifyType>, this_socket: Socket) => IdentifyType;
	debug: boolean;
	constructor(clientId: string, serverUrl: string, debug = false) {
		this.clientId = clientId
		this.routes = []
		this.webSocket = null
		this.url = serverUrl
		this.debug = debug;
		this.identifyGenerator = (this_client, this_socket) => {
			return { routes: this_client.routes.map(m => m[0]) } as IdentifyType
		}
	}

	on(proxyPath: ProxiedPath, callback: (req: WebRequest) => void) {
		if (!PROXY_PATH_REGEX.exec(proxyPath)) throw Error(`Path "${proxyPath}" does not match required format "${PROXY_PATH_REGEX.source}"`)
		this.routes.push([proxyPath.replace("|", `|${this.clientId}`), callback])
	}

	get(path: string, callback: (req: WebRequest) => void, isRegex = false) {
		this.on(`${isRegex ? "-" : ""}get|${path}`, callback)
	}

	head(path: string, callback: (req: WebRequest) => void, isRegex = false) {
		this.on(`${isRegex ? "-" : ""}head|${path}`, callback)
	}

	post(path: string, callback: (req: WebRequest) => void, isRegex = false) {
		this.on(`${isRegex ? "-" : ""}post|${path}`, callback)
	}

	put(path: string, callback: (req: WebRequest) => void, isRegex = false) {
		this.on(`${isRegex ? "-" : ""}put|${path}`, callback)
	}

	delete(path: string, callback: (req: WebRequest) => void, isRegex = false) {
		this.on(`${isRegex ? "-" : ""}delete|${path}`, callback)
	}

	patch(path: string, callback: (req: WebRequest) => void, isRegex = false) {
		this.on(`${isRegex ? "-" : ""}patch|${path}`, callback)
	}

	methodProxy(method: (req: WebRequest) => void, req: RawProxiedRequest) {
		if (this.webSocket) {
			method(new WebRequest(req, this.webSocket, this.debug))
		}
	}

	connect(getIdentify?: (this_client: Client<IdentifyType>, this_socket: Socket) => IdentifyType) {

		if (getIdentify) this.identifyGenerator = getIdentify

		this.webSocket = io(this.url, {
			reconnectionDelayMax: 10000,
		});

		this.routes.forEach(([path, method]) => {
			if (this.webSocket) {
				this.webSocket.on(path, this.methodProxy.bind(this, method))
			}
		})

		this.webSocket.on('connect', (() => {
			if (this.webSocket) {
				this.webSocket.emit('client-identify', this.identifyGenerator(this, this.webSocket))
			}

		}).bind(this))
	}
}