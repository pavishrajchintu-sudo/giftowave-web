require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Database Connection Logic
const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 5000 // Fails fast if DNS is blocked
})
.then(() => console.log("✅ Giftowave Database: CLOUD CONNECTED"))
.catch(err => {
    console.error("❌ Database Error Detail:");
    console.error(err.message);
});

// Order Schema
const orderSchema = new mongoose.Schema({
    customerName: String,
    email: String,
    phone: String,
    address: String,
    product: String,
    status: { type: String, default: 'Pending' },
    date: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// API Routes
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = new Order(req.body);
        await newOrder.save();
        res.status(201).json({ success: true, message: "Order Received!" });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// Route for your Founder Dashboard to see orders
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ date: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: "Fetch failed" });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Giftowave Server live on port ${PORT}`);
});