import { io, Socket } from 'socket.io-client';
import { ProxiedResponse, ProxyIdentify, RawProxiedRequest } from './types';
import { EventEmitter } from 'events';
import { PROXY_PATH_REGEX } from './constants';


class WebRequest extends EventEmitter {
	webSocket: Socket;
	id: string;
	url: string;
	onCloseCallback: (() => void) | null;

	constructor(req: RawProxiedRequest, socket: Socket) {
		super()
		this.webSocket = socket
		Object.assign(this, req)
		this.onCloseCallback = (() => { this.emit('close'); this.onCloseCallback = null }).bind(this)
		this.webSocket.once(`${this.id}|close`, this.onCloseCallback)
	}

	removeAllCallbacks() {
		if (this.onCloseCallback) {
			this.webSocket.off(`${this.id}|close`, this.onCloseCallback)
		}

	}

	sendStatus(status: ProxiedResponse['status'], headers?: ProxiedResponse['headers']) {
		this.webSocket.emit(`${this.id}|result`, { status, headers })
		this.removeAllCallbacks()
	}

	sendBody(body: ProxiedResponse['body']) {
		this.webSocket.emit(`${this.id}|result`, { body: body })
		this.removeAllCallbacks()
	}

	send(response: ProxiedResponse) {
		this.webSocket.emit(`${this.id}|result`, response)
		this.removeAllCallbacks()
	}
}

type ProxiedMethod = 'get' | 'head' | 'post' | 'put' | 'delete' | 'patch'

type ProxiedPath = `${ProxiedMethod}|${string}`

class Client<IdentifyType extends ProxyIdentify = ProxyIdentify> {
	routes: [string, (req: WebRequest) => void][];
	webSocket: Socket | null;
	url: string;
	identifyGenerator: (this_client: Client<IdentifyType>, this_socket: Socket) => IdentifyType;
	constructor(url: string) {
		this.routes = []
		this.webSocket = null
		this.url = url
		this.identifyGenerator = (this_client, this_socket) => {
			return { routes: this_client.routes.map(m => m[0]) } as IdentifyType
		}
	}

	on(proxyPath: ProxiedPath, callback: (req: WebRequest) => void) {
		if (!PROXY_PATH_REGEX.exec(proxyPath)) throw Error(`Path "${proxyPath}" does not match required format "${PROXY_PATH_REGEX.source}"`)
		this.routes.push([proxyPath, callback])
	}

	get(path: string, callback: (req: WebRequest) => void) {
		this.on(`get|${path}`, callback)
	}

	head(path: string, callback: (req: WebRequest) => void) {
		this.on(`head|${path}`, callback)
	}

	post(path: string, callback: (req: WebRequest) => void) {
		this.on(`post|${path}`, callback)
	}

	put(path: string, callback: (req: WebRequest) => void) {
		this.on(`put|${path}`, callback)
	}

	delete(path: string, callback: (req: WebRequest) => void) {
		this.on(`delete|${path}`, callback)
	}

	patch(path: string, callback: (req: WebRequest) => void) {
		this.on(`patch|${path}`, callback)
	}

	methodProxy(method: (req: WebRequest) => void, req: RawProxiedRequest) {
		if (this.webSocket) {
			method(new WebRequest(req, this.webSocket))
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
				this.webSocket.emit('identify', this.identifyGenerator(this, this.webSocket))
			}

		}).bind(this))
	}
}

export {
	Client,
	ProxiedMethod,
	ProxiedPath
}