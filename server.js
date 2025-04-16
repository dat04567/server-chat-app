require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const apiRoutes = require('./routes/index');
const chatSocket = require('./sockets/chatSocket');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
   transports: ['websocket'],
   cors: {
      origin: '*', // Trong môi trường sản xuất, hãy giới hạn nguồn gốc cụ thể
      methods: ['GET', 'POST']
   }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize Socket.IO with chatSocket - ONLY USE ONE SOCKET IMPLEMENTATION
chatSocket(io);

// Đặt Socket.IO vào app để routes có thể truy cập
app.set('io', io);

// Use routes
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
   res.json({ message: 'Welcome to the API!' });
});

// Error handling middleware
app.use((err, req, res, next) => {
   console.error(err.stack);
   res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: err.message,
   });
});

// Start server
server.listen(PORT, () => {
   console.log(`Server is running on port ${PORT}`);
});
