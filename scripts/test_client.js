const { Client } = require('../dist/index')

const c = new Client("ws://localhost:9000")


c.on('get|', (res) => {
	console.log('RECIEVED A REQUEST')
	res.sendBody('YOOOOOOO')
})

c.on('post|', (res) => {
	console.log('RECIEVED A REQUEST')
	res.sendBody('YOOOOOOO')
})

c.on('post|', (res) => {
	console.log('RECIEVED A REQUEST')
	res.sendBody('YOOOOOOO')
})

c.connect()