require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const app = express();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use(express.json());
app.use(express.static('public'));

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Giftowave DB Connected"))
    .catch(err => console.error("❌ DB Error:", err));

// --- Schemas ---
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
    status: { type: String, default: 'Pending' },
    date: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// --- Middleware: Verify Token ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Access Denied" });

    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Session Expired" });
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
                isAdmin: payload.email === "pavishrajchintu@gmail.com" // Set your email here
            });
            await user.save();
        }

        const sessionToken = jwt.sign(
            { userId: user._id, isAdmin: user.isAdmin },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ success: true, token: sessionToken, user });
    } catch (error) {
        console.error("❌ Google Auth Error Details:", error);
        res.status(401).json({ error: "Authentication Failed" });
    }
});

// --- USER ROUTES ---

// Create Order (Protected)
app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const newOrder = new Order({
            ...req.body,
            userId: req.user.userId
        });
        await newOrder.save();
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get User's own orders
app.get('/api/user/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.userId }).sort({ date: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch orders" });
    }
});

// --- ADMIN ROUTES (Founder Only) ---

// Get ALL orders across the platform
app.get('/api/admin/all-orders', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Forbidden" });
    
    try {
        // .populate('userId', 'name email') gets the user details for each order
        const orders = await Order.find().populate('userId', 'name email').sort({ date: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: "Admin fetch failed" });
    }
});

// Update Order Status (Mark as Shipped)
app.put('/api/admin/order/:id/ship', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Forbidden" });
    
    try {
        await Order.findByIdAndUpdate(req.params.id, { status: 'Shipped' });
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: "Update failed" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Giftowave Server running on ${PORT}`));