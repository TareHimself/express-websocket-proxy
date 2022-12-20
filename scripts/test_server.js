const { Server } = require('../dist/index')

const s = new Server()

s.start(9000, () => {
	console.log('SERVER STARTED')
})

s.on('CLIENT_CONNECT', (id, routes) => {
	console.log("Client Connected", id, routes)
})

