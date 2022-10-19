import { io, Socket } from 'socket.io-client';
import { ProxiedResponse, ProxyIdentify, RawProxiedRequest } from './types';
import { EventEmitter } from 'events';
import { PROXY_PATH_REGEX } from './constants';


class WebRequest extends EventEmitter {
	sc: Socket;
	id: string;
	url: string;
	onCloseCallback: (() => void) | null;

	constructor(req: RawProxiedRequest, socket: Socket) {
		super()
		this.sc = socket
		Object.assign(this, req)
		this.onCloseCallback = (() => { this.emit('close'); this.onCloseCallback = null }).bind(this)
		this.sc.once(`${this.id}|close`, this.onCloseCallback)
	}

	removeAllCallbacks() {
		if (this.onCloseCallback) {
			this.sc.off(`${this.id}|close`, this.onCloseCallback)
		}

	}

	sendStatus(status: ProxiedResponse['status'], headers?: ProxiedResponse['headers']) {
		this.sc.emit(`${this.id}|result`, { status, headers })
		this.removeAllCallbacks()
	}

	sendBody(body: ProxiedResponse['body']) {
		this.sc.emit(`${this.id}|result`, { body: body })
		this.removeAllCallbacks()
	}

	send(response: ProxiedResponse) {
		this.sc.emit(`${this.id}|result`, response)
		this.removeAllCallbacks()
	}
}

class Client<IdentifyType extends ProxyIdentify = ProxyIdentify> {
	routes: [string, (req: WebRequest) => void][];
	socket: Socket | null;
	url: string;
	constructor(url: string) {
		this.routes = []
		this.socket = null
		this.url = url
	}

	on(path: string, callback: (req: WebRequest) => void) {
		if (!PROXY_PATH_REGEX.exec(path)) throw Error(`Path "${path}" does not match required format "${PROXY_PATH_REGEX.source}"`)
		this.routes.push([path, callback])
	}

	methodProxy(method: (req: WebRequest) => void, req: RawProxiedRequest) {
		if (this.socket) {
			method(new WebRequest(req, this.socket))
		}
	}

	connect(getIdentify?: (this_client: Client<IdentifyType>, this_socket: Socket) => IdentifyType) {

		this.socket = io(this.url, {
			reconnectionDelayMax: 10000,
		});

		this.routes.forEach(([path, method]) => {
			if (this.socket) {
				this.socket.on(path, this.methodProxy.bind(this, method))
			}
		})

		this.socket.on('connect', (() => {
			if (this.socket) {

				if (!getIdentify) {
					getIdentify = (this_client: Client<IdentifyType>, this_socket: Socket) => {
						return { routes: this_client.routes.map(m => m[0]) } as IdentifyType
					}
				}

				this.socket.emit('identify', getIdentify(this, this.socket))
			}

		}).bind(this))
	}
}

export {
	Client
}