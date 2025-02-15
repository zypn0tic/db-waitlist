require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['https://kalpitsharma.com.np', 'https://api.render.com'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));
app.use(express.json());

// MongoDB Connection with retries
const connectWithRetry = async () => {
    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            console.log(`MongoDB connection attempt ${retries + 1} of ${maxRetries}`);
            await mongoose.connect(process.env.MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                retryWrites: true,
                w: 'majority'
            });
            console.log('MongoDB connected successfully');
            return true;
        } catch (err) {
            retries += 1;
            console.log(`MongoDB connection attempt failed. Retrying... (${retries}/${maxRetries})`);
            if (retries === maxRetries) {
                console.error('Failed to connect to MongoDB after maximum retries:', err);
                return false;
            }
            // Wait for 5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    return false;
};

// Routes
app.post('/api/waitlist', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            // Try to reconnect if not connected
            const connected = await connectWithRetry();
            if (!connected) {
                return res.status(503).json({ error: 'Database connection error. Please try again later.' });
            }
        }

        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Check for existing email
        const existingEmail = await Waitlist.findOne({ email });
        if (existingEmail) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Save new email
        const waitlistEntry = new Waitlist({ email });
        await waitlistEntry.save();
        
        return res.status(201).json({ message: 'Successfully joined waitlist' });
    } catch (error) {
        console.error('Error handling waitlist submission:', error);
        return res.status(500).json({ error: 'Server error. Please try again later.' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mongoConnection: mongoose.connection.readyState === 1,
        timestamp: new Date().toISOString()
    });
});

// Start server
const startServer = async () => {
    try {
        const connected = await connectWithRetry();
        if (!connected) {
            console.error('Could not connect to MongoDB after retries. Starting server anyway...');
        }
        
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Server startup error:', error);
        process.exit(1);
    }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    mongoose.connection.close(false, () => {
        console.log('MongoDB connection closed.');
        process.exit(0);
    });
});
