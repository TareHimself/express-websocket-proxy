const { io } = require('socket.io-client')

class AppSocket {
	constructor(id, url) {
		this.methods = []
		this.io = null
		this.id = id
		this.url = url
	}

	async on(path, callback) {
		this.methods.push([path, callback])
	}

	start() {
		this.io = io(this.url, {
			reconnectionDelayMax: 10000,
		});

		this.methods.forEach(([path, method]) => {
			this.io.on(path, method)
		})

		this.io.on('connect', () => {
			console.log({
				id: this.id,
				routes: this.methods.map(m => m[0])
			})
			socket.emit('identify', {
				id: this.id,
				routes: this.methods.map(m => m[0])
			})
		})



	}
}

const testClient = new AppSocket("assistant", "ws://localhost:3000/")
const routes = ['get|spotify', 'post|spotify']

testClient.on("get|spotify", (req) => {
	console.log(req)
	socket.emit(req.id, { 'result': "Spotify GET working" })
})

testClient.on("post|spotify", (req) => {
	console.log(req)
	socket.emit(req.id, { 'result': req.body })
})

testClient.start()