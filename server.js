const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files

// In-memory data storage (in production, use a proper database)
let systemData = {
  rooms: [
    {
      id: 1,
      name: 'Classroom',
      occupied: false,
      lastActivity: null,
      appliances: [
        { id: 1, name: 'Lights', type: 'light', status: 'off', icon: '💡' },
        { id: 2, name: 'AC', type: 'ac', status: 'off', icon: '❄️' }
      ]
    },
    {
      id: 2,
      name: 'ICT Lab',
      occupied: true,
      lastActivity: new Date(),
      appliances: [
        { id: 3, name: 'Lights', type: 'light', status: 'on', icon: '💡' },
        { id: 4, name: 'Computers', type: 'computer', status: 'on', icon: '🖥️' },
        { id: 5, name: 'AC', type: 'ac', status: 'on', icon: '❄️' }
      ]
    },
    {
      id: 3,
      name: 'Office',
      occupied: false,
      lastActivity: null,
      appliances: [
        { id: 6, name: 'Lights', type: 'light', status: 'off', icon: '💡' },
        { id: 7, name: 'Computer', type: 'computer', status: 'off', icon: '🖥️' }
      ]
    }
  ],
  settings: {
    inactivityTimer: 30, // minutes
    autoShutdownTime: '22:00',
    sensitivity: 'medium',
    weekendMode: 'normal'
  },
  systemStatus: {
    online: true,
    lastUpdate: new Date(),
    totalEnergyUsage: 0,
    activeAppliances: 0
  }
};

// Calculate system statistics
function calculateStats() {
  let totalAppliances = 0;
  let activeAppliances = 0;
  let occupiedRooms = 0;

  systemData.rooms.forEach(room => {
    totalAppliances += room.appliances.length;
    if (room.occupied) occupiedRooms++;
    
    room.appliances.forEach(appliance => {
      if (appliance.status === 'on') activeAppliances++;
    });
  });

  return {
    totalRooms: systemData.rooms.length,
    occupiedRooms,
    totalAppliances,
    activeAppliances,
    energySaved: Math.max(0, totalAppliances - activeAppliances) * 50 // Simulate energy saved in watts
  };
}

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send initial data
  socket.emit('systemData', {
    rooms: systemData.rooms,
    settings: systemData.settings,
    stats: calculateStats(),
    systemStatus: systemData.systemStatus
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Broadcast updates to all connected clients
function broadcastUpdate() {
  io.emit('systemData', {
    rooms: systemData.rooms,
    settings: systemData.settings,
    stats: calculateStats(),
    systemStatus: systemData.systemStatus
  });
}

// API Routes

// Get all rooms and system data
app.get('/api/system', (req, res) => {
  res.json({
    rooms: systemData.rooms,
    settings: systemData.settings,
    stats: calculateStats(),
    systemStatus: systemData.systemStatus
  });
});

// Get specific room
app.get('/api/rooms/:id', (req, res) => {
  const room = systemData.rooms.find(r => r.id === parseInt(req.params.id));
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(room);
});

// Update room occupancy
app.post('/api/rooms/:id/occupancy', (req, res) => {
  const room = systemData.rooms.find(r => r.id === parseInt(req.params.id));
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const { occupied } = req.body;
  room.occupied = occupied;
  room.lastActivity = occupied ? new Date() : null;

  // Auto-control appliances based on occupancy
  if (!occupied) {
    // Turn off appliances when room becomes unoccupied
    setTimeout(() => {
      if (!room.occupied) { // Double check room is still unoccupied
        room.appliances.forEach(appliance => {
          appliance.status = 'off';
        });
        broadcastUpdate();
      }
    }, systemData.settings.inactivityTimer * 60 * 1000); // Convert minutes to milliseconds
  }

  systemData.systemStatus.lastUpdate = new Date();
  broadcastUpdate();
  
  res.json({ message: 'Room occupancy updated', room });
});

// Control appliance
app.post('/api/appliances/:id/control', (req, res) => {
  const { status } = req.body;
  let appliance = null;
  let room = null;

  // Find appliance across all rooms
  for (const r of systemData.rooms) {
    const a = r.appliances.find(app => app.id === parseInt(req.params.id));
    if (a) {
      appliance = a;
      room = r;
      break;
    }
  }

  if (!appliance) {
    return res.status(404).json({ error: 'Appliance not found' });
  }

  appliance.status = status;
  systemData.systemStatus.lastUpdate = new Date();
  
  // Log the activity
  console.log(`${appliance.name} in ${room.name} turned ${status.toUpperCase()}`);
  
  broadcastUpdate();
  res.json({ message: 'Appliance status updated', appliance });
});

// Update system settings
app.post('/api/settings', (req, res) => {
  const { inactivityTimer, autoShutdownTime, sensitivity, weekendMode } = req.body;
  
  if (inactivityTimer) systemData.settings.inactivityTimer = inactivityTimer;
  if (autoShutdownTime) systemData.settings.autoShutdownTime = autoShutdownTime;
  if (sensitivity) systemData.settings.sensitivity = sensitivity;
  if (weekendMode) systemData.settings.weekendMode = weekendMode;

  systemData.systemStatus.lastUpdate = new Date();
  broadcastUpdate();
  
  res.json({ message: 'Settings updated', settings: systemData.settings });
});

// Emergency shutdown
app.post('/api/emergency-shutdown', (req, res) => {
  // Turn off all appliances
  systemData.rooms.forEach(room => {
    room.appliances.forEach(appliance => {
      appliance.status = 'off';
    });
  });

  systemData.systemStatus.lastUpdate = new Date();
  broadcastUpdate();
  
  console.log('EMERGENCY SHUTDOWN ACTIVATED');
  res.json({ message: 'Emergency shutdown completed' });
});

// Get activity log (simulated)
app.get('/api/activity-log', (req, res) => {
  const log = [
    { timestamp: new Date(Date.now() - 300000), message: 'ICT Lab - Motion detected, lights turned ON' },
    { timestamp: new Date(Date.now() - 600000), message: 'Classroom - No motion for 30 minutes, appliances turned OFF' },
    { timestamp: new Date(Date.now() - 900000), message: 'Office - Computer manually turned ON' },
    { timestamp: new Date(Date.now() - 1200000), message: 'System - Settings updated by admin' },
    { timestamp: new Date(Date.now() - 1500000), message: 'ICT Lab - AC turned ON due to temperature threshold' }
  ];
  
  res.json(log);
});

// Simulate sensor data updates (ESP32 would send this data)
function simulateSensorData() {
  // Randomly change room occupancy for demonstration
  if (Math.random() < 0.1) { // 10% chance every interval
    const room = systemData.rooms[Math.floor(Math.random() * systemData.rooms.length)];
    const wasOccupied = room.occupied;
    room.occupied = Math.random() < 0.3; // 30% chance of being occupied
    
    if (room.occupied !== wasOccupied) {
      room.lastActivity = room.occupied ? new Date() : null;
      
      // Auto-control appliances
      if (room.occupied) {
        // Turn on essential appliances when occupied
        room.appliances.forEach(appliance => {
          if (appliance.type === 'light') {
            appliance.status = 'on';
          }
        });
      } else {
        // Schedule appliances to turn off after inactivity timer
        setTimeout(() => {
          if (!room.occupied) {
            room.appliances.forEach(appliance => {
              appliance.status = 'off';
            });
            broadcastUpdate();
          }
        }, systemData.settings.inactivityTimer * 60 * 1000);
      }
      
      systemData.systemStatus.lastUpdate = new Date();
      broadcastUpdate();
      console.log(`${room.name} occupancy changed to: ${room.occupied ? 'OCCUPIED' : 'UNOCCUPIED'}`);
    }
  }
}

// Auto-shutdown at specified time
function checkAutoShutdown() {
  const now = new Date();
  const shutdownTime = systemData.settings.autoShutdownTime;
  const [hours, minutes] = shutdownTime.split(':').map(Number);
  
  if (now.getHours() === hours && now.getMinutes() === minutes) {
    console.log('Auto-shutdown time reached');
    // Turn off all appliances
    systemData.rooms.forEach(room => {
      room.appliances.forEach(appliance => {
        appliance.status = 'off';
      });
    });
    broadcastUpdate();
  }
}

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MUBAS Energy-Saving System Backend running on port ${PORT}`);
  console.log(`Access the system at: http://localhost:${PORT}`);
  
  // Start simulation intervals
  setInterval(simulateSensorData, 10000); // Check every 10 seconds
  setInterval(checkAutoShutdown, 60000); // Check every minute
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});