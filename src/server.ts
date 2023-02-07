import { ProxiedResponse, ProxyIdentify, RawProxiedRequest, ServerEvents, ServerStartOptions } from "./types";
import express, { Application, Request as ExpressRequest, Response as ExpressResponse } from 'express';
import http from 'http';
import https from 'https'
import { PROXY_PATH_REGEX, SOCKET_PROXIED_REQUEST_CLOSE, SOCKET_PROXIED_RESPONSE } from "./constants";
import { Server as SocketIoServer, Socket } from "socket.io";
import { v4 as uuidv4 } from 'uuid';
import EventEmitter from "events";

export const DEFAULT_SERVER_OPTIONS: ServerStartOptions = {
	port: 80,
	use_ssl: false
}

export type ExpressCallback = (req: ExpressRequest, res: ExpressResponse) => Promise<void>

export class Server<IdentifyType extends ProxyIdentify = ProxyIdentify> {
	app: Application;
	server: http.Server | https.Server | null;
	socket: SocketIoServer | null;
	callbacks_to_sockets: Map<ExpressCallback, string>;
	sockets_to_callbacks: Map<string, ExpressCallback[]>;
	client_request_timeout: number;
	authenticator: (Socket: Socket, data: IdentifyType) => boolean;
	authenticated_sockets: Map<string, number>;
	private _emitter: EventEmitter;
	debug: boolean;

	constructor(clientRequestTimeout = 10000, debug = false) {
		this.client_request_timeout = clientRequestTimeout
		this.app = express();
		this.server = null;
		this.socket = null;
		this.callbacks_to_sockets = new Map()
		this.sockets_to_callbacks = new Map()
		this.authenticated_sockets = new Map()
		this.debug = debug
		this._emitter = new EventEmitter()
		this.authenticator = (Socket: Socket, data: IdentifyType) => true
	}

	on<T extends keyof ServerEvents>(event: T, callback: ServerEvents[T]) {
		return this._emitter.on(event, callback);
	}

	once<T extends keyof ServerEvents>(event: T, callback: ServerEvents[T]) {
		return this._emitter.once(event, callback);
	}

	off<T extends keyof ServerEvents>(event: T, callback: ServerEvents[T]) {
		return this._emitter.off(event, callback);
	}

	emit<T extends keyof ServerEvents>(event: T, ...data: Parameters<ServerEvents[T]>) {
		return this._emitter.emit(event, ...data)
	}

	handleSocket(req: ExpressRequest, res: ExpressResponse, socket: Socket, method: string, payload: Partial<RawProxiedRequest>, timeout = 10000) {
		return new Promise<void>((resolve, reject) => {
			let requestCompleted = false
			const responseId = `${uuidv4()}`

			const onSocketResponse = (response: ProxiedResponse) => {
				requestCompleted = true;
				req.off('close', onRequestClosed)
				if (response.headers) {
					res.set(response.headers)
				}

				if (response.body === null && response.status !== null) {
					res.sendStatus(response.status)
				}
				else {
					if (response.status !== null) res.status(response.status)
					res.send(response.body);
				}
				resolve()
			}

			const onRequestClosed = () => {
				if (!requestCompleted) {
					socket.off(`${responseId}|${SOCKET_PROXIED_RESPONSE}`, onSocketResponse)
					socket.emit(`${responseId}|${SOCKET_PROXIED_REQUEST_CLOSE}`)
				}

				req.off('close', onRequestClosed)
				resolve()
			}

			socket.on(`${responseId}|${SOCKET_PROXIED_RESPONSE}`, onSocketResponse)

			socket.emit(method, { ...payload, id: responseId })

			req.on('close', onRequestClosed)
		})

	}

	async registerRoutes(routes: string[], socketId: string) {
		if (this.debug) console.log("Registering routes", routes, "from socket with id", socketId)
		this.emit("CLIENT_CONNECT", socketId, routes);
		const callbacks = routes.map(route => {
			const [combined, method, path] = Array.from(PROXY_PATH_REGEX.exec(route)!)
			const callback = async (req: ExpressRequest, res: ExpressResponse) => {
				const funcHandle = req.route.stack[0].handle
				if (!this.socket) throw new Error('Main Io Server is invalid')
				const socket = this.socket.sockets.sockets.get(this.callbacks_to_sockets.get(funcHandle)!)
				if (socket && socket.connected) {

					const payload: RawProxiedRequest = {
						params: req.params,
						query: req.query,
						headers: req.headers,
						body: req.body,
						method: req.method,
						originalUrl: req.originalUrl,
						baseUrl: req.baseUrl,
						path: req.path
					} as unknown as RawProxiedRequest
					return await this.handleSocket(req, res, socket, route, payload)
				}
				res.sendStatus(404)
			}

			const finalRoute = route.trim().startsWith('-') ? new RegExp(path) : `/${path}`;
			this.app[method](finalRoute, callback)
			this.callbacks_to_sockets.set(callback, socketId)

			return callback
		});

		this.sockets_to_callbacks.set(socketId, callbacks)
	}

	unRegisterRoutes(socket: Socket) {
		this.emit("CLIENT_DISCONNECT", socket.id)
		const callbacks = this.sockets_to_callbacks.get(socket.id) || []
		if (callbacks.length == 0) return

		for (let i = 0; i < this.app._router.stack.length; i++) {
			const route = this.app._router.stack[i]


			if (!route?.route?.path) continue;

			const funcHandle = route.route.stack[0].handle;

			const itemIndex = callbacks.findIndex((c) => {
				return c === funcHandle
			})

			if (itemIndex < 0) continue;

			this.app._router.stack.splice(i, 1)

			callbacks.splice(itemIndex, 1)

			i--
		}

	}

	async onIdentify(authenticator: (Socket: Socket, data: IdentifyType) => boolean) {
		this.authenticator = authenticator
	}

	start(options: ServerStartOptions | null | number, callback?: () => void) {
		if (typeof options === 'number') {
			options = DEFAULT_SERVER_OPTIONS && { port: options }
		}
		else if (!options) {
			options = DEFAULT_SERVER_OPTIONS
		}

		if (options.use_ssl) {
			if (!options.ssl_cert || !options.ssl_key) {
				throw new Error(`Missing SSl Cert (and/or) Key`)
			}

			this.server = https.createServer({ key: options.ssl_key, cert: options.ssl_cert }, this.app);
		}
		else {
			this.server = http.createServer(this.app);
		}

		this.socket = new SocketIoServer(this.server);

		this.socket.on('error', console.log)
		this.socket.on('connection', (socket) => {

			socket.once('client-identify', async (data) => {
				if (!this.authenticator(socket, data)) return
				this.authenticated_sockets.set(socket.id, 1)
				this.sockets_to_callbacks.set(socket.id, data.routes)
				await this.registerRoutes(data.routes, socket.id)
			})

			socket.once('disconnect', () => {
				if (!this.authenticated_sockets.get(socket.id)) return
				this.unRegisterRoutes(socket)
			})
		});

		this.server.listen(options.port, options.hostname, undefined, callback)
	}
}

