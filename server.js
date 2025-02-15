require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*',  // Allow all origins
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
}));
app.use(express.json());
app.use(express.static(__dirname));  // Serve files from current directory

// At the top, after your requires
console.log('Starting server...');
console.log('MongoDB URI:', process.env.MONGODB_URI);

// At the top of your file, add this line to debug MongoDB URI
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'URI is set' : 'URI is missing');

// Modify the MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    dbName: 'waitlist-db',
    useNewUrlParser: true,
    useUnifiedTopology: true,
    retryWrites: true,
    w: 'majority'
}).then(() => {
    console.log('✅ Connected to MongoDB successfully');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});

// Handle MongoDB connection errors
mongoose.connection.on('error', err => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
});

// Email Schema
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

// Rate limiting middleware
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in milliseconds
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

// Update the waitlist endpoint
app.post('/api/waitlist', async (req, res) => {
    try {
        const { email } = req.body;
        console.log('Received request:', { email, body: req.body });

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Check MongoDB connection
        if (mongoose.connection.readyState !== 1) {
            throw new Error('Database connection is not ready');
        }

        // Check for existing email
        const existingEmail = await Waitlist.findOne({ email });
        if (existingEmail) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Create new entry
        const entry = new Waitlist({ email });
        await entry.save();
        
        console.log('Email saved:', email);
        return res.status(201).json({ message: 'Successfully added to waitlist' });

    } catch (error) {
        console.error('Server error:', {
            message: error.message,
            stack: error.stack,
            mongoState: mongoose.connection.readyState
        });

        return res.status(500).json({ 
            error: 'Server error',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// View all emails endpoint (password protected)
app.get('/api/admin/emails', async (req, res) => {
    try {
        const adminPassword = req.headers.authorization;
        
        if (!process.env.ADMIN_PASSWORD) {
            console.error('ADMIN_PASSWORD not set in environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }
        
        if (adminPassword !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const emails = await Waitlist.find()
            .select('-ipAddress -userAgent') // Exclude sensitive data
            .sort({ createdAt: -1 });
            
        res.json(emails);
    } catch (error) {
        console.error('Admin endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        mongoConnection: mongoose.connection.readyState === 1
    });
});

// Add a test route to check MongoDB connection
app.get('/api/test', (req, res) => {
    res.json({
        mongoState: mongoose.connection.readyState,
        dbName: mongoose.connection.name,
        collections: mongoose.connection.collections ? Object.keys(mongoose.connection.collections) : [],
        connected: mongoose.connection.readyState === 1
    });
});

// Add this test endpoint
app.get('/test-db', async (req, res) => {
    try {
        // Test database connection
        const connectionState = mongoose.connection.readyState;
        const testEntry = new Waitlist({ email: 'test@test.com' });
        await testEntry.validate(); // Only validate, don't save
        
        res.json({
            connection: connectionState === 1 ? 'Connected' : 'Disconnected',
            validation: 'Schema validation working',
            dbName: mongoose.connection.name
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            connectionState: mongoose.connection.readyState
        });
    }
});

// Add a simple test endpoint
app.get('/', (req, res) => {
    res.json({ message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    mongoose.connection.close(false, () => {
        console.log('MongoDB connection closed.');
        process.exit(0);
    });
});
