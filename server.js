const express = require('express');
// const mongoose = require('mongoose'); <-- Temporarily disabled

const app = express();

// Tell Express to serve your HTML/CSS from the 'public' folder
app.use(express.static('public'));
app.use(express.json());

// TEMPORARILY DISABLED MONGODB CONNECTION
// mongoose.connect('YOUR_MONGODB_URI');

// A simple API route to test the backend
app.post('/api/order', (req, res) => {
    console.log("Order received in backend!");
    res.send({ message: "Order Placed Successfully! (DB offline)" });
});

// Start the server
app.listen(5000, () => {
    console.log("🚀 Giftowave Server running at http://localhost:5000");
});