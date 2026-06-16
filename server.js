const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve a simple status page
app.get('/', (req, res) => {
    res.send('✅ Conquest Artz Signaling Server is running!');
});

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Signaling server running on port ${PORT}`);
});