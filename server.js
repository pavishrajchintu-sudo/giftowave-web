require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// VERIFICATION LOG
console.log("--- Giftowave Backend v2.0 - Clean Connect Start ---");

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI)
.then(() => console.log("✅ SUCCESS: Giftowave Database Connected!"))
.catch(err => {
    console.error("❌ CONNECTION ERROR:");
    console.error(err.message);
});

// Order Schema
const orderSchema = new mongoose.Schema({
    customerName: String,
    email: String,
    product: String,
    address: String,
    date: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// API Routes
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = new Order(req.body);
        await newOrder.save();
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Dynamic Port for Render
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Giftowave Server live on port ${PORT}`));