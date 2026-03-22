require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const dns = require('dns');

// Force the app to use Google DNS (8.8.8.8) to find MongoDB
dns.setServers(['8.8.8.8', '1.1.1.1']);

const app = express();
app.use(express.json());
app.use(express.static('public'));

mongoose.connect(process.env.MONGO_URI, { family: 4 })
    .then(() => console.log("✅ SUCCESS: Giftowave is Connected!"))
    .catch(err => console.log("❌ Connection Error:", err.message));

// Order Schema
const orderSchema = new mongoose.Schema({
    customerName: String,
    email: String,
    phone: String,
    address: String,
    product: String,
    status: { type: String, default: 'Paid' },
    date: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// API Routes
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = new Order(req.body);
        await newOrder.save();
        res.status(201).json({ message: "Order synced to Cloud" });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

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
    console.log(`🚀 Server live at http://localhost:${PORT}`);
});