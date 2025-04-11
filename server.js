const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const apiRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
app.listen(PORT, () => {
   console.log(`Server is running on port ${PORT}`);
});