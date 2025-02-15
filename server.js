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
app.use(express.static(__dirname));

// Debug logging
console.log('Starting server...');
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'URI is set' : 'URI is missing');

// MongoDB Configuration
mongoose.set('strictQuery', false);

// Define Waitlist Schema
const waitlistSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        validate: {
            validator: function(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: props => `${props.value} is not a valid email!`
        }
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    company: {
        type: String,
        required: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create Waitlist Model
const Waitlist = mongoose.model('Waitlist', waitlistSchema);

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
        if (mongoose.connection.readyState !== 1) {
            const connected = await connectWithRetry();
            if (!connected) {
                return res.status(503).json({ error: 'Database connection error. Please try again later.' });
            }
        }

        const { email, company, name } = req.body;
        
        if (!email || !company || !name) {
            return res.status(400).json({ error: 'Email, name, and company name are required' });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Check for existing email
        const existingEmail = await Waitlist.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Save new entry with all fields
        const waitlistEntry = new Waitlist({
            email: email.toLowerCase(),
            name: name.trim(),
            company: company.trim()
        });
        await waitlistEntry.save();
        
        console.log('Successfully saved:', { email, name, company });
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

app.get('/api/status', (req, res) => {
    res.json({
        server: 'running',
        mongoConnection: mongoose.connection.readyState,
        dbName: mongoose.connection.name,
        nodeEnv: process.env.NODE_ENV,
        time: new Date().toISOString()
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

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    mongoose.connection.close(false, () => {
        console.log('MongoDB connection closed due to error.');
        process.exit(1);
    });
});

app.post('/deploy/srv-cuo3jnt2ng1s73e2fe70', (req, res) => {
    if (req.query.key === '9UNf5Soo8cE') {
        // Trigger your deployment logic here
        console.log('Deploy hook received');
        res.json({ status: 'Deployment triggered' });
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
});
