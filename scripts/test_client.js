const { Client } = require('../dist/index')

const c = new Client("test", "ws://localhost:9000", true)


c.get('/', (res) => {
	console.log('RECIEVED A REQUEST', res.originalUrl)
	res.send(res.originalUrl)
})

c.post('.*', (req) => {
	req.send('RESPONSE ' + req.originalUrl)
}, true)

c.connect((client, server) => {
	return { routes: client.routes.map(m => m[0]), msg: "SUCK MY COCK" }
})


