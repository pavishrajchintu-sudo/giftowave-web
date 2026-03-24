require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');

const app = express();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.use(express.json());
app.use(express.static('public'));

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
    amount: Number,
    paymentId: String,
    razorpayOrderId: String,
    status: { type: String, default: 'Paid' },
    date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// --- Middleware ---
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

// --- Routes ---
app.post('/api/auth/google', async (req, res) => {
    const { idToken } = req.body;
    try {
        const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
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
        }
        const sessionToken = jwt.sign({ userId: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token: sessionToken, user });
    } catch (error) {
        res.status(401).json({ error: "Authentication Failed" });
    }
});

app.post('/api/create-order', authenticateToken, async (req, res) => {
    try {
        const order = await razorpay.orders.create({
            amount: req.body.amount * 100,
            currency: "INR",
            receipt: `rcpt_${Date.now()}`
        });
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const newOrder = new Order({ ...req.body, userId: req.user.userId });
        await newOrder.save();
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/user/orders', authenticateToken, async (req, res) => {
    const orders = await Order.find({ userId: req.user.userId }).sort({ date: -1 });
    res.json(orders);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));