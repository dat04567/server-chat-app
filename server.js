const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const http = require('http')
const socketIo = require('socket.io')
dotenv.config()

const path = require('path')

const apiRoutes = require('./routes')

// For real-time communication
const chatSocket = require('./sockets/chatSocket')

const app = express()
const PORT = process.env.PORT || 3000

// Serve the test client
app.use('/test', express.static(path.join(__dirname, 'testClient.html')))

// Create an HTTP server and attach Socket.IO
const server = http.createServer(app)
const io = socketIo(server, {
  cors: {
    origin: '*', // Allow all origins (adjust for production)
    methods: ['GET', 'POST'],
  },
})

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Use routes
app.use('/api', apiRoutes)

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API!' })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: err.message,
  })
})

chatSocket(io) // Initialize chat socket

// Start server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
