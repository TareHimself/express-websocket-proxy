import { ProxiedResponse, RawProxiedRequest } from "./types";
import express from 'express';
import http from 'http';
import { PROXY_PATH_REGEX } from "./constants";
import { Server as SocketIoServer, Socket } from "socket.io";
import { v4 as uuidv4 } from 'uuid';

class Server {
	app: any;
	httpServer: http.Server;
	socket: SocketIoServer;
	routesToSockets: Map<string, string>;
	socketToRoutes: Map<string, string[]>;
	clientRequestTimeout: number;

	constructor(clientRequestTimeout = 10000) {
		this.clientRequestTimeout = clientRequestTimeout
		this.app = express();
		this.httpServer = http.createServer(this.app);
		this.socket = new SocketIoServer(this.httpServer);
		this.routesToSockets = new Map()
		this.socketToRoutes = new Map()

		this.socket.on('error', console.log)
		this.socket.on('connection', (socket) => {

			socket.once('identify', async (data) => {
				this.socketToRoutes.set(socket.id, data.routes)
				await this.registerRoutes(data.routes, socket.id)
			})

			socket.once('disconnect', () => {
				this.unRegisterRoutes(socket)
			})
		});
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
				const url = req.originalUrl
				const socket = this.socket.sockets.sockets.get(this.routesToSockets.get(route)!)
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
			this.routesToSockets.set(route, socketId)
		});
	}
	unRegisterRoutes(socket: Socket) {
		// format [method|route][]
		const routes = this.socketToRoutes.get(socket.id)
		if (routes) {
			this.app._router.stack = this.app._router.stack.filter(stackItem => {
				if (!stackItem?.route?.path) return true
				return !routes.includes(stackItem.route.path)
			})

			routes.forEach((r) => {
				this.routesToSockets.delete(r);
			})

			this.socketToRoutes.delete(socket.id)
		}



	}
}



export {
	Server
}