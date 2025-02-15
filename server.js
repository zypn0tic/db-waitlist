require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
}));
app.use(express.json());
app.use(express.static(__dirname));

// Debug logging
console.log('Starting server...');
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'URI is set' : 'URI is missing');

// MongoDB Configuration
mongoose.set('strictQuery', false);

// MongoDB Connection
const connectDB = async () => {
    try {
        console.log('Attempting to connect to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: 'waitlist-db',
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log(`MongoDB Connected: ${mongoose.connection.host}`);
        return true;
    } catch (error) {
        console.error('MongoDB connection error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        return false;
    }
};

// MongoDB Event Listeners
mongoose.connection.on('connected', () => {
    console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
    console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose disconnected from MongoDB');
});

// Waitlist Schema
const waitlistSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: props => `${props.value} is not a valid email address!`
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    ipAddress: String,
    userAgent: String
}, { 
    collection: 'emails',
    timestamps: true 
});

const Waitlist = mongoose.model('Waitlist', waitlistSchema);

// Rate Limiting
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 3600000; // 1 hour
const MAX_REQUESTS = 5;

const rateLimiter = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    if (rateLimit.has(ip)) {
        const userData = rateLimit.get(ip);
        const windowStart = userData.timestamp;
        
        if (now - windowStart < RATE_LIMIT_WINDOW) {
            if (userData.count >= MAX_REQUESTS) {
                return res.status(429).json({ 
                    error: 'Too many requests. Please try again later.' 
                });
            }
            userData.count++;
        } else {
            userData.count = 1;
            userData.timestamp = now;
        }
    } else {
        rateLimit.set(ip, { count: 1, timestamp: now });
    }
    next();
};

// Routes
app.post('/api/waitlist', rateLimiter, async (req, res) => {
    try {
        console.log('Request received:', {
            body: req.body,
            headers: req.headers,
            method: req.method
        });

        const { email } = req.body;
        
        if (!email) {
            console.log('No email provided in request');
            return res.status(400).json({ error: 'Email is required' });
        }

        if (mongoose.connection.readyState !== 1) {
            console.error('MongoDB not connected. State:', mongoose.connection.readyState);
            return res.status(503).json({ error: 'Database connection error' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('Invalid email format:', email);
            return res.status(400).json({ error: 'Invalid email format' });
        }

        const existingEmail = await Waitlist.findOne({ email });
        if (existingEmail) {
            console.log('Email already exists:', email);
            return res.status(409).json({ error: 'Email already registered' });
        }

        const entry = new Waitlist({ 
            email,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        await entry.save();
        console.log('Successfully saved email:', email);
        return res.status(201).json({ message: 'Successfully added to waitlist' });

    } catch (error) {
        console.error('Detailed error:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            mongoState: mongoose.connection.readyState
        });

        if (error.code === 11000) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        return res.status(500).json({ 
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Health Check Routes
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        mongoConnection: mongoose.connection.readyState === 1
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        server: 'running',
        mongoConnection: mongoose.connection.readyState,
        dbName: mongoose.connection.name,
        nodeEnv: process.env.NODE_ENV,
        time: new Date().toISOString()
    });
});

// Start Server
const startServer = async () => {
    const isConnected = await connectDB();
    
    if (!isConnected) {
        console.error('Could not connect to MongoDB. Exiting...');
        process.exit(1);
    }

    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
};

startServer();

// Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    mongoose.connection.close(false, () => {
        console.log('MongoDB connection closed.');
        process.exit(0);
    });
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Promise Rejection:', error);
});
