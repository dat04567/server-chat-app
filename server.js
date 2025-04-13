const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
dotenv.config();

const apiRoutes = require('./routes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
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

// Socket.IO connection handler
require('./utils/socket')(io);

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
      error: err.message
   });
});

// Start server
server.listen(PORT, () => {
   console.log(`Server is running on port ${PORT}`);
});