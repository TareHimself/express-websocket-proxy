const { Client } = require('../dist/index')

const c = new Client("ws://localhost:9000")


c.on('-get|nlu.*', (res) => {
	console.log('RECIEVED A REQUEST')
	res.sendBody(res.originalUrl)
})

c.on('post|', (res) => {
	console.log('RECIEVED A REQUEST')
	res.sendBody('YOOOOOOO')
})

c.on('post|', (res) => {
	console.log('RECIEVED A REQUEST')
	res.sendBody('YOOOOOOO')
})

c.connect((client, server) => {
	return { routes: client.routes.map(m => m[0]), msg: "SUCK MY COCK" }
})


