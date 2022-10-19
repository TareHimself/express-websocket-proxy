const { Server } = require('../dist/index')

const s = new Server()

s.httpServer.listen(9000, () => {
	console.log("SERVER ON")
})