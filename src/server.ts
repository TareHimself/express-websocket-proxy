import { ProxiedResponse, ProxyIdentify, RawProxiedRequest, ServerStartOptions } from "./types";
import express from 'express';
import http from 'http';
import https from 'https'
import { PROXY_PATH_REGEX } from "./constants";
import { Server as SocketIoServer, Socket } from "socket.io";
import { v4 as uuidv4 } from 'uuid';
import util from 'util'

const DEFAULT_SERVER_OPTIONS: ServerStartOptions = {
	port: 80,
	use_ssl: false
}

class Server<IdentifyType extends ProxyIdentify = ProxyIdentify> {
	app: any;
	server: http.Server | https.Server | null;
	socket: SocketIoServer | null;
	routes_to_sockets: Map<string, string>;
	socket_to_routes: Map<string, string[]>;
	client_request_timeout: number;
	authenticator: (Socket: Socket, data: IdentifyType) => boolean;
	authenticated_sockets: Map<string, number>;

	constructor(clientRequestTimeout = 10000) {
		this.client_request_timeout = clientRequestTimeout
		this.app = express();
		this.server = null;
		this.socket = null;
		this.routes_to_sockets = new Map()
		this.socket_to_routes = new Map()
		this.authenticated_sockets = new Map()
		this.authenticator = (Socket: Socket, data: IdentifyType) => true
	}

	getSocketResponse(req: any, socket: Socket, method: string, payload: Partial<RawProxiedRequest>, timeout = 10000) {
		return new Promise<ProxiedResponse | null>((resolve, reject) => {
			let resolved = false
			let requestTimeout: null | ReturnType<typeof setTimeout> = null
			const responseId = `${uuidv4()}`

			const onEnd = (result) => {
				if (resolved) return;
				socket.emit('close')
				resolve(result)
				resolved = true
				if (requestTimeout) {
					clearTimeout(requestTimeout)
					requestTimeout = null
				}
				req.off('close', onClose)
			}

			const onClose = () => {
				onEnd(null)
			}

			const onTimeout = () => {
				requestTimeout = null
				onEnd(null)
			}

			requestTimeout = setTimeout(onTimeout, timeout)

			socket.once(`${responseId}|result`, (d) => {
				onEnd(d)
			})

			socket.emit(method, { ...payload, id: responseId })

			req.once('close', onClose)
		})

	}


	async registerRoutes(routes: string[], socketId: string) {

		routes.forEach(route => {
			const [combined, method, path] = Array.from(PROXY_PATH_REGEX.exec(route)!)
			const callback = async (req, res) => {
				if (!this.socket) throw new Error('No Socket Before Registering Routes')
				const url = req.originalUrl
				const socket = this.socket.sockets.sockets.get(this.routes_to_sockets.get(route)!)
				if (socket && socket.connected) {
					const payload = {
						params: req.params,
						query: req.query,
						headers: req.headers,
						body: req.body,
						method: req.method,
						originalUrl: req.originalUrl,
						baseUrl: req.baseUrl,
						path: req.path
					}
					const dataToSend = await this.getSocketResponse(req, socket, route, payload)

					if (dataToSend && (dataToSend.body || dataToSend?.status)) {
						const { body, headers, status } = dataToSend
						if (headers) res.set(headers)
						if (body && status) {
							res.status(status)
							res.send(body)
						}
						else if (body) {
							res.send(body)
						} else {
							res.sendStatus(status)
						}
						return
					}
				}


				res.sendStatus(404)
			}

			const finalRoute = `/${path}`
			this.app[method](finalRoute, callback)
			this.routes_to_sockets.set(route, socketId)
		});

	}

	unRegisterRoutes(socket: Socket) {
		// format [method|route][]
		const routes = this.socket_to_routes.get(socket.id) || []


		if (routes.length == 0) return

		for (let i = 0; i < this.app._router.stack.length; i++) {
			const route = this.app._router.stack[i]

			if (!route?.route?.path) continue;

			const itemIndex = routes.findIndex((r) => {
				return r === `${route.route.stack[0].method}|${route.route.path.slice(1)}`
			})

			if (itemIndex < 0) continue;

			this.app._router.stack.splice(i, 1)

			routes.splice(itemIndex, 1)

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

			socket.once('identify', async (data) => {
				if (!this.authenticator(socket, data)) return
				this.authenticated_sockets.set(socket.id, 1)
				this.socket_to_routes.set(socket.id, data.routes)
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



export {
	Server,
	DEFAULT_SERVER_OPTIONS
}