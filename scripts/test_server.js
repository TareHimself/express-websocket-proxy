const { Server } = require('../dist/index')

const s = new Server({
	timeout: 10000,
	debug: true,
	port: 9000
})

s.start(9000, () => {
	console.log('SERVER STARTED')
})

s.on('CLIENT_CONNECT', (id, routes) => {
	console.log("Client Connected", id, routes)
})

