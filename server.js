require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));  // Serve files from root directory

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    dbName: 'waitlist-db'
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Email Schema
const waitlistSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { collection: 'emails' });

const Waitlist = mongoose.model('Waitlist', waitlistSchema);

// Submit email endpoint
app.post('/api/waitlist', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if email already exists
        const existingEmail = await Waitlist.findOne({ email });
        if (existingEmail) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Save new email
        const waitlistEntry = new Waitlist({ email });
        await waitlistEntry.save();
        
        console.log('New submission:', email);
        res.status(201).json({ message: 'Successfully added to waitlist' });
        
    } catch (error) {
        console.error('Submission error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// View all emails endpoint (password protected)
app.get('/api/admin/emails', async (req, res) => {
    try {
        const adminPassword = req.headers.authorization;
        
        // Simple password protection (use a more secure method in production)
        if (adminPassword !== 'your-secret-password') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const emails = await Waitlist.find().sort({ createdAt: -1 });
        res.json(emails);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});