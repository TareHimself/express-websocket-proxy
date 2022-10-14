const { response } = require('express');
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const process = require('process')
const { Server, Socket } = require("socket.io");
const { v4: uuidv4 } = require('uuid');

const io = new Server(server);
const clients = new Map()
const sockets_clients = new Map()
app.use(express.json())

app.get('/', (req, res) => {
	res.send('<h1>Hello world</h1>');

});

function GetSocketResponse(socket, method, payload, timeout = 10000) {
	return new Promise((resolve, reject) => {
		const responseId = `response-${uuidv4()}`
		socket.once(responseId, (d) => {
			resolve(d)
		})
		socket.emit(method, { ...payload, id: responseId })
	})
}

async function RegisterRoutes(routes, id) {
	routes.forEach(route => {
		const [method, path] = route.split('|')
		const callback = async (req, res) => {
			const url = req.originalUrl.slice(`/${id}`.length)
			const socket = clients.get(id)[0]
			const dataToSend = await GetSocketResponse(socket, route, { params: req.params, query: req.query, headers: req.headers, body: req.body })

			if (dataToSend) {
				res.send(dataToSend)
			}
			else {
				res.sendStatus(404)
			}
		}

		app[method](`/${id}/${path}`, callback)
	});

}

function UnRegisterRoutes(routes, id) {
	const items = routes.map(r => `/${id}/${r.split('|')[1]}`)
	app._router.stack = app._router.stack.filter(stackItem => {
		if (!stackItem?.route?.path) return true
		return !items.includes(stackItem.route.path)
	})
}

io.on('error', console.log)
io.on('connection', (socket) => {

	socket.once('identify', async (data) => {
		console.log('added client |', data.id);
		clients.set(data.id, [socket, data])
		sockets_clients.set(socket.id, data.id)
		await RegisterRoutes(data.routes, data.id)
	})

	socket.once('disconnect', () => {
		const clientId = sockets_clients.get(socket.id)
		if (!clientId) return
		const data = clients.get(clientId)[1]
		console.log('removing client |', clientId);
		UnRegisterRoutes(data.routes, data.id)
		clients.delete(clientId)
		sockets_clients.delete(socket.id)
	})
});

server.listen(process.argv.includes('debug') ? 3000 : 80, () => {
	console.log('listening on *:3000');
});