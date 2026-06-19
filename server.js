const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// =============================================
// 📁 CODE STORAGE
// =============================================
const CODES_FILE = path.join(__dirname, 'codes.json');

// Initialize codes file if it doesn't exist
if (!fs.existsSync(CODES_FILE)) {
    fs.writeFileSync(CODES_FILE, JSON.stringify({}, null, 2));
}

function readCodes() {
    try {
        if (fs.existsSync(CODES_FILE)) {
            const data = fs.readFileSync(CODES_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading codes:', e);
    }
    return {};
}

function writeCodes(codes) {
    try {
        fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 2));
    } catch (e) {
        console.error('Error writing codes:', e);
    }
}

// =============================================
// 📋 API ROUTES
// =============================================

// Home page
app.get('/', (req, res) => {
    res.send('✅ Conquest Artz Signaling Server is running!');
});

// Get all codes
app.get('/codes', (req, res) => {
    const codes = readCodes();
    res.json(codes);
});

// Save a code
app.post('/save-code', (req, res) => {
    const { code, client, event, active } = req.body;
    const codes = readCodes();
    codes[code.toUpperCase()] = {
        client: client || 'Auto-generated',
        event: event || 'Live Stream',
        active: active !== undefined ? active : true,
        created: new Date().toISOString()
    };
    writeCodes(codes);
    res.json({ success: true, code: code.toUpperCase() });
});

// Verify a code
app.get('/verify-code/:code', (req, res) => {
    const codes = readCodes();
    const code = req.params.code.toUpperCase();
    if (codes[code] && codes[code].active) {
        res.json({
            valid: true,
            client: codes[code].client,
            event: codes[code].event
        });
    } else {
        res.json({ valid: false });
    }
});

// Delete a code
app.delete('/delete-code/:code', (req, res) => {
    const codes = readCodes();
    const code = req.params.code.toUpperCase();
    if (codes[code]) {
        delete codes[code];
        writeCodes(codes);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Code not found' });
    }
});

// =============================================
// 🎯 WEBRTC SIGNALING
// =============================================
const rooms = {};

io.on('connection', (socket) => {
    console.log('🔗 User connected:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`📺 ${socket.id} joined room: ${roomId}`);
        socket.to(roomId).emit('user-joined', socket.id);

        if (rooms[roomId] && rooms[roomId].broadcaster) {
            socket.emit('broadcaster-exists', rooms[roomId].broadcaster);
        }
    });

    socket.on('broadcaster-ready', (roomId) => {
        if (!rooms[roomId]) rooms[roomId] = {};
        rooms[roomId].broadcaster = socket.id;
        socket.join(roomId);
        console.log(`🎥 Broadcaster ready in room: ${roomId}`);
        socket.to(roomId).emit('broadcaster-ready');
    });

    socket.on('request-stream', (roomId) => {
        if (rooms[roomId] && rooms[roomId].broadcaster) {
            io.to(rooms[roomId].broadcaster).emit('request-stream', socket.id);
        }
    });

    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', {
            sdp: data.sdp,
            sender: socket.id
        });
    });

    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', {
            sdp: data.sdp,
            sender: socket.id
        });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            sender: socket.id
        });
    });

    socket.on('disconnect', () => {
        console.log('🔌 User disconnected:', socket.id);
        for (const [roomId, room] of Object.entries(rooms)) {
            if (room.broadcaster === socket.id) {
                delete room.broadcaster;
                io.to(roomId).emit('broadcaster-left');
                console.log(`📴 Broadcaster left room: ${roomId}`);
            }
        }
    });
});

// =============================================
// 🚀 START SERVER
// =============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Signaling server running on port ${PORT}`);
    console.log(`📁 Codes saved to: ${CODES_FILE}`);
});