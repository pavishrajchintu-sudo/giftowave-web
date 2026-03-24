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
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.use(express.json());
app.use(express.static('public'));

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Giftowave DB Connected"))
    .catch(err => console.error("❌ DB Error Details:", err));

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
    amount: Number,
    paymentId: String,
    status: { type: String, default: 'Paid' },
    date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

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