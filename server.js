require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// --- Razorpay Setup ---
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
    : null;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static('public'));
app.use('/vendor/three', express.static('node_modules/three/build'));

// --- Database Connection ---
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log("✅ Giftowave DB Connected"))
        .catch(err => console.error("❌ DB Error Details:", err));
} else {
    console.warn("MONGO_URI is not set. Database-backed routes will fail until it is configured.");
}

// --- Database Schemas ---
const userSchema = new mongoose.Schema({
    googleId: String,
    name: String,
    email: String,
    picture: String,
    isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    product: String,
    address: String,
    customerName: String,
    customerPhone: String,
    customization: mongoose.Schema.Types.Mixed,
    amount: Number,
    paymentId: String,
    status: { type: String, default: 'Order Placed' },
    date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

const magazineSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    rating: { type: Number, default: 5 },
    review: { type: String, default: "A premium personalized magazine gift." },
    category: { type: String, default: "Custom Gift" },
    coverImage: String,
    pageImages: [String],
    isPublished: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
const Magazine = mongoose.model('Magazine', magazineSchema);

const seedMagazines = [
    {
        _id: 'seed-vogue',
        name: 'The Vogue Edition',
        description: 'A luxury editorial-style magazine for birthdays, creators, solo portraits, and statement gifts.',
        price: 999,
        rating: 4.9,
        review: 'Customers love this for premium birthday surprises and polished portrait covers.',
        category: 'Luxury Birthday',
        coverImage: 'priyanka.jpeg',
        pageImages: ['priyanka.jpeg', 'friends.jpeg', 'kylo.jpeg', 'logo.jpeg']
    },
    {
        _id: 'seed-friends',
        name: 'The F.R.I.E.N.D.S Issue',
        description: 'A playful friendship magazine with group memories, inside jokes, farewell pages, and candid photos.',
        price: 1299,
        rating: 4.8,
        review: 'Best for college groups, farewell gifts, and funny memory collections.',
        category: 'Friendship',
        coverImage: 'friends.jpeg',
        pageImages: ['friends.jpeg', 'priyanka.jpeg', 'kylo.jpeg', 'logo.jpeg']
    },
    {
        _id: 'seed-love',
        name: 'The Love Story Issue',
        description: 'A romantic keepsake magazine for anniversaries, proposals, long-distance couples, and relationship milestones.',
        price: 1499,
        rating: 5,
        review: 'A strong pick when the gift needs to feel emotional and personal.',
        category: 'Couple Gift',
        coverImage: 'kylo.jpeg',
        pageImages: ['kylo.jpeg', 'priyanka.jpeg', 'friends.jpeg', 'logo.jpeg']
    }
];

const ORDER_STATUSES = [
    'Order Placed',
    'Photos Received',
    'Designing',
    'Preview Sent',
    'Customer Approved',
    'Printing',
    'Packed',
    'Shipped',
    'Delivered'
];

function isDbReady() {
    return mongoose.connection.readyState === 1;
}

function matchesMagazineQuery(magazine, query) {
    if (!query) return true;
    const haystack = [
        magazine.name,
        magazine.description,
        magazine.category,
        magazine.review
    ].join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase());
}

// --- Middleware: Auth Verification ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        console.error("❌ Auth Error: No header found");
        return res.status(401).json({ error: "Access Denied: No Token Provided" });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error("❌ JWT Error:", err.message);
            return res.status(403).json({ error: "Session Expired. Please login again." });
        }
        req.user = decoded;
        next();
    });
};

// --- AUTH: Google Login ---
app.post('/api/auth/google', async (req, res) => {
    const { idToken } = req.body;
    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        
        let user = await User.findOne({ email: payload.email });
        if (!user) {
            user = new User({
                googleId: payload.sub,
                name: payload.name,
                email: payload.email,
                picture: payload.picture,
                isAdmin: payload.email === "pavishrajchintu@gmail.com"
            });
            await user.save();
            console.log("👤 New User Created:", user.email);
        }

        const sessionToken = jwt.sign(
            { userId: user._id, isAdmin: user.isAdmin },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ success: true, token: sessionToken, user });
    } catch (error) {
        console.error("❌ Google Auth Failure:", error);
        res.status(401).json({ error: "Authentication Failed at Google level" });
    }
});

// --- PAYMENT: Razorpay Order Creation ---
app.post('/api/create-order', authenticateToken, async (req, res) => {
    const { amount } = req.body;
    if (!razorpay) {
        return res.status(500).json({ error: "Razorpay is not configured" });
    }

    try {
        const options = {
            amount: amount * 100, // Amount in paise
            currency: "INR",
            receipt: `gift_rcpt_${Date.now()}`,
        };
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (err) {
        console.error("❌ Razorpay Order creation failed:", err);
        res.status(500).json({ error: "Could not initialize Payment Gateway" });
    }
});

// --- USER ROUTES ---

app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const newOrder = new Order({
            ...req.body,
            userId: req.user.userId
        });
        await newOrder.save();
        res.status(201).json({ success: true, message: "Order saved to vault" });
    } catch (err) {
        console.error("❌ Order Save Error:", err.message);
        res.status(400).json({ error: "Failed to save order details" });
    }
});

app.get('/api/user/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.userId }).sort({ date: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: "Failed to retrieve your order history" });
    }
});

// --- PUBLIC MAGAZINE CATALOG ROUTES ---

app.get('/api/magazines', async (req, res) => {
    const query = (req.query.q || '').toString().trim();

    try {
        if (!isDbReady()) {
            return res.json(seedMagazines.filter(magazine => matchesMagazineQuery(magazine, query)));
        }

        const filter = { isPublished: true };
        if (query) {
            filter.$or = [
                { name: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } },
                { category: { $regex: query, $options: 'i' } },
                { review: { $regex: query, $options: 'i' } }
            ];
        }

        const magazines = await Magazine.find(filter).sort({ createdAt: -1 });
        const combined = magazines.length ? magazines : seedMagazines.filter(magazine => matchesMagazineQuery(magazine, query));
        res.json(combined);
    } catch (err) {
        console.error("Magazine search failed:", err.message);
        res.json(seedMagazines.filter(magazine => matchesMagazineQuery(magazine, query)));
    }
});

app.get('/api/magazines/:id', async (req, res) => {
    try {
        const seedMagazine = seedMagazines.find(magazine => magazine._id === req.params.id);
        if (seedMagazine) return res.json(seedMagazine);

        if (!isDbReady()) return res.status(503).json({ error: "Magazine database is not configured" });

        const magazine = await Magazine.findOne({ _id: req.params.id, isPublished: true });
        if (!magazine) return res.status(404).json({ error: "Magazine not found" });
        res.json(magazine);
    } catch (err) {
        res.status(404).json({ error: "Magazine not found" });
    }
});

// --- ADMIN ROUTES (Founder Dashboard) ---

app.get('/api/admin/all-orders', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Founder access only" });
    
    try {
        const orders = await Order.find()
            .populate('userId', 'name email')
            .sort({ date: -1 });
        res.json(orders);
    } catch (err) {
        console.error("❌ Admin Fetch Error:", err);
        res.status(500).json({ error: "Founder dashboard sync failed" });
    }
});

app.put('/api/admin/order/:id/ship', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Founder access only" });
    
    try {
        const updated = await Order.findByIdAndUpdate(req.params.id, { status: 'Shipped' });
        if (!updated) return res.status(404).json({ error: "Order not found" });
        res.json({ success: true, message: "Order marked as shipped" });
    } catch (err) {
        res.status(400).json({ error: "Update failed" });
    }
});

app.put('/api/admin/order/:id/status', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Founder access only" });

    const { status } = req.body;
    if (!ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Invalid order status" });
    }

    try {
        const updated = await Order.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        if (!updated) return res.status(404).json({ error: "Order not found" });
        res.json({ success: true, order: updated });
    } catch (err) {
        res.status(400).json({ error: "Status update failed" });
    }
});

app.get('/api/admin/magazines', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Founder access only" });
    if (!isDbReady()) return res.json(seedMagazines);

    try {
        const magazines = await Magazine.find().sort({ createdAt: -1 });
        res.json(magazines);
    } catch (err) {
        res.status(500).json({ error: "Magazine list failed" });
    }
});

app.post('/api/admin/magazines', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Founder access only" });
    if (!isDbReady()) return res.status(503).json({ error: "MongoDB is required to save founder uploads" });

    const {
        name,
        description,
        price,
        rating,
        review,
        category,
        coverImage,
        pageImages,
        isPublished
    } = req.body;

    if (!name || !description || !price || !coverImage) {
        return res.status(400).json({ error: "Name, description, price, and cover image are required" });
    }

    try {
        const magazine = new Magazine({
            name: name.trim(),
            description: description.trim(),
            price: Number(price),
            rating: Math.min(Math.max(Number(rating) || 5, 1), 5),
            review: (review || '').trim(),
            category: (category || 'Custom Gift').trim(),
            coverImage,
            pageImages: Array.isArray(pageImages) ? pageImages.slice(0, 12) : [],
            isPublished: isPublished !== false
        });
        await magazine.save();
        res.status(201).json({ success: true, magazine });
    } catch (err) {
        console.error("Magazine save failed:", err.message);
        res.status(400).json({ error: "Failed to save magazine" });
    }
});

app.delete('/api/admin/magazines/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Founder access only" });
    if (!isDbReady()) return res.status(503).json({ error: "MongoDB is required to delete uploads" });

    try {
        const deleted = await Magazine.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Magazine not found" });
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: "Delete failed" });
    }
});


// --- AI AGENT ROUTE ---
app.post('/api/ask-giftowave-agent', async (req, res) => {
    try {
        // 1. Get the message the user typed on the React frontend
        const userMessage = req.body.message;

        // 2. Send that message over to your new Python AI server!
        const aiResponse = await fetch('https://giftowave-ai-agent.onrender.com/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage })
        });

        // 3. Get the AI's answer
        const aiData = await aiResponse.json();

        // 4. Send the AI's answer back to your React frontend
        res.json({ reply: aiData.reply });

    } catch (error) {
        console.error("Error talking to Python Agent:", error);
        res.status(500).json({ error: "Agent is offline" });
    }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Giftowave Server live on port ${PORT}`));
