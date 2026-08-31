const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./db/database');
const { JWT_SECRET } = require('./middleware/auth');

let io = null;
const onlineUsers = new Map();

function isStaffRole(role) {
  return role === 'agent' || role === 'admin';
}

function trackConnect(socket) {
  const existing = onlineUsers.get(socket.user.id);
  if (existing) {
    existing.count += 1;
  } else {
    onlineUsers.set(socket.user.id, { id: socket.user.id, name: socket.user.name, role: socket.user.role, count: 1 });
  }
}

function trackDisconnect(socket) {
  const existing = onlineUsers.get(socket.user.id);
  if (!existing) return;
  existing.count -= 1;
  if (existing.count <= 0) onlineUsers.delete(socket.user.id);
}

function getOnlineUsers() {
  return Array.from(onlineUsers.values()).map(({ id, name, role }) => ({ id, name, role }));
}

async function canAccessTicket(user, ticketId) {
  const ticket = await db.get('SELECT id, created_by FROM tickets WHERE id = ?', [ticketId]);
  if (!ticket) return false;
  return isStaffRole(user.role) || ticket.created_by === user.id;
}

function leaveCurrentRoom(socket) {
  const room = socket.data.ticketRoom;
  if (!room) return;
  if (isStaffRole(socket.user.role)) {
    socket.to(room).emit('presence:staff-left', { name: socket.user.name });
  } else {
    socket.to(room).emit('presence:customer-left', { name: socket.user.name });
  }
  socket.leave(room);
  socket.data.ticketRoom = null;
}

function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('unauthorized'));
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await db.get('SELECT id, name, role FROM users WHERE id = ?', [payload.sub]);
      if (!user) return next(new Error('unauthorized'));
      socket.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.data.ticketRoom = null;
    socket.join(`user:${socket.user.id}`);
    trackConnect(socket);

    socket.on('ticket:join', async (ticketId) => {
      try {
        const id = Number(ticketId);
        if (!id || !(await canAccessTicket(socket.user, id))) return;
        leaveCurrentRoom(socket);
        const room = `ticket:${id}`;
        socket.join(room);
        socket.data.ticketRoom = room;
        if (isStaffRole(socket.user.role)) {
          socket.to(room).emit('presence:staff-joined', { name: socket.user.name });
        } else {
          socket.to(room).emit('presence:customer-joined', { name: socket.user.name });
        }
      } catch (err) {
        console.error('ticket:join fallito:', err.message);
      }
    });

    socket.on('ticket:leave', () => leaveCurrentRoom(socket));
    socket.on('disconnect', () => {
      leaveCurrentRoom(socket);
      trackDisconnect(socket);
    });
  });

  return io;
}

async function broadcastActivityItem(ticketId, item) {
  if (!io) return;
  const room = `ticket:${ticketId}`;
  if (item.is_internal) {
    const sockets = await io.in(room).fetchSockets();
    sockets.filter((s) => isStaffRole(s.user.role)).forEach((s) => s.emit('activity:new', item));
  } else {
    io.to(room).emit('activity:new', item);
  }
}

function broadcastTicketUpdate(ticketId, ticket) {
  if (!io) return;
  io.to(`ticket:${ticketId}`).emit('ticket:updated', ticket);
}

function broadcastNotification(userId, notification) {
  if (!io) return;
  io.to(`user:${userId}`).emit('notification:new', notification);
}

module.exports = { initRealtime, broadcastActivityItem, broadcastTicketUpdate, broadcastNotification, getOnlineUsers };
