// server.js

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const config = require('./config.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 정적 파일(HTML, CSS, JS)을 제공하기 위한 미들웨어 설정
app.use(express.static(__dirname + '/public'));

// 방 정보를 저장할 Map 객체
const rooms = new Map();

// config.json에서 팬덤 및 역할 정보를 미리 매핑하여 빠른 조회를 위함
const fandomNameMap = new Map();
const roleCheckMap = new Map();
config.streamers.forEach(s => {
    fandomNameMap.set(s.fandom.id, s.fandom.name);
    s.fandom.tiers.forEach(tier => {
        roleCheckMap.set(tier.name, { isSuperFan: tier.isSuperFan, isYasik: tier.isYasik });
    });
});

/**
 * 유저 객체로부터 역할을('fan', 'superfan', 'yasik') 반환하는 함수 (가짜팬 찾기 모드용)
 * @param {object} user - 유저 정보 객체
 * @returns {string} - 유저의 역할
 */
function getUserRole(user) {
    if (!user || !user.fanTier) return 'fan';
    const tierInfo = roleCheckMap.get(user.fanTier);
    if (!tierInfo) return 'fan';
    if (tierInfo.isYasik) return 'yasik';
    if (tierInfo.isSuperFan) return 'superfan';
    return 'fan';
}

/**
 * 특정 방에 있는 유저 목록을 배열로 반환하는 함수
 * @param {string} roomId - 방 ID
 * @returns {Array<object>} - 유저 객체 배열
 */
function getUsersInRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.users.values());
}

/**
 * 랜덤한 6자리 방 ID를 생성하는 함수
 * @returns {string} - 생성된 방 ID
 */
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * 방에 스트리머가 한 명이라도 있는지 확인하는 함수
 * @param {string} roomId - 방 ID
 * @returns {boolean} - 스트리머 존재 여부
 */
function hasStreamer(roomId) {
    const users = getUsersInRoom(roomId);
    return users.some(user => user.role === 'streamer');
}

/**
 * 방을 닫고 모든 참여자에게 알리는 함수
 * @param {string} roomId - 닫을 방의 ID
 * @param {string} reason - 방이 닫히는 이유
 */
function closeRoom(roomId, reason) {
    const room = rooms.get(roomId);
    if (!room) return;
    console.log(`Closing room ${roomId}. Reason: ${reason}`);
    io.to(roomId).emit('room closed', reason); // 모든 클라이언트에게 방 종료 알림
    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    if (socketsInRoom) {
        socketsInRoom.forEach(socketId => {
            const socketInstance = io.sockets.sockets.get(socketId);
            if (socketInstance) socketInstance.leave(roomId);
        });
    }
    rooms.delete(roomId); // 방 정보 삭제
}

/**
 * 중첩된 Map 객체를 일반 JavaScript 객체로 변환하는 함수 (JSON으로 전송하기 위함)
 * @param {Map} map - 변환할 Map 객체
 * @returns {object} - 변환된 객체
 */
function mapToObject(map) {
    const obj = {};
    for (let [key, value] of map.entries()) {
        if (value instanceof Map) {
            obj[key] = mapToObject(value);
        } else {
            obj[key] = value;
        }
    }
    return obj;
}

// 클라이언트와의 WebSocket 연결 처리
io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id} from IP: ${socket.handshake.address}`);
  
  // 연결된 클라이언트에게 서버 설정(config.json) 전송
  socket.emit('server config', config);

  // 방 생성 요청 처리
  socket.on('create room', (data) => {
    const { userData } = data;
    
    if (userData.role === 'streamer') {
        const STREAMER_KEY = 'dancohankki';
        if (userData.streamerKey !== STREAMER_KEY) {
            return socket.emit('error message', '스트리머 인증 키가 올바르지 않습니다.');
        }
    }

    const roomId = generateRoomId();
    socket.join(roomId);
    
    const { streamerKey, ...safeUserData } = userData;
    socket.userData = { ...safeUserData, id: socket.id };
    
    socket.roomId = roomId;
    const mode = 'fakefan';
    
    // 새 방 정보 생성 및 저장
    rooms.set(roomId, {
        users: new Map([[socket.id, socket.userData]]),
        ownerId: socket.id,
        kickedIPs: new Set(),
        mode: mode,
        guesses: new Map(),
        finishedStreamers: [],
        currentRound: 1,
        layout: 'list' // [수정] 기본 레이아웃을 'list'로 설정
    });
    
    // 방 생성 성공 이벤트 전송
    socket.emit('room created', { 
        roomId, 
        users: getUsersInRoom(roomId), 
        ownerId: socket.id, 
        mode: mode, 
        currentRound: 1,
        layout: 'list' // [수정] 생성 시 'list' 레이아웃 정보 전송
    });
    console.log(`User ${userData.nickname} created room ${roomId} with mode: ${mode}`);
  });

  // 방 참가 요청 처리
  socket.on('join room', (data) => {
    const { roomId, userData } = data;

    if (userData.role === 'streamer') {
        const STREAMER_KEY = 'mhyam3';
        if (userData.streamerKey !== STREAMER_KEY) {
            return socket.emit('error message', '스트리머 인증 키가 올바르지 않습니다.');
        }
    }
    
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error message', '존재하지 않는 방입니다.');
    if (room.kickedIPs.has(socket.handshake.address)) return socket.emit('error message', '이 방에서 강퇴당하여 입장할 수 없습니다.');
    if (userData.role === 'streamer' && getUsersInRoom(roomId).some(u => u.streamerId === userData.streamerId)) {
        return socket.emit('error message', '이미 같은 스트리머가 방에 참여하고 있습니다.');
    }
    socket.join(roomId);

    const { streamerKey, ...safeUserData } = userData;
    socket.userData = { ...safeUserData, id: socket.id };

    socket.roomId = roomId;
    room.users.set(socket.id, socket.userData);
    
    // 참가 성공 이벤트 전송
    socket.emit('join success', { 
        roomId, 
        users: getUsersInRoom(roomId), 
        ownerId: room.ownerId, 
        mode: room.mode, 
        currentRound: room.currentRound,
        layout: room.layout // 참가 시 현재 방의 레이아웃 정보 전송
    });
    
    socket.to(roomId).emit('user joined', { user: socket.userData, users: getUsersInRoom(roomId) });
    if (room.guesses.size > 0) {
        socket.emit('guesses updated', mapToObject(room.guesses));
    }
    console.log(`User ${userData.nickname} joined room ${roomId}`);
  });
  
  // '가짜팬 찾기' 모드에서 역할 추측 처리
  socket.on('guess role', (data) => {
    const { targetUser, guessedRole, guessedTierName } = data;
    const room = rooms.get(socket.roomId);
    if (!room || !targetUser || !socket.userData || socket.userData.role !== 'streamer') return;

    const streamerId = socket.userData.streamerId;

    if (!room.guesses.has(targetUser.id)) {
        room.guesses.set(targetUser.id, new Map());
    }
    
    const userGuesses = room.guesses.get(targetUser.id);
    userGuesses.set(streamerId, { guessedRole, guessedTierName });
    
    io.to(socket.roomId).emit('guesses updated', mapToObject(room.guesses));
  });

  // 레이아웃 변경 요청 처리
  socket.on('change layout', (newLayout) => {
    const room = rooms.get(socket.roomId);
    // 방장만 변경 가능하도록 체크
    if (!room || socket.id !== room.ownerId) return;

    // 유효한 레이아웃 값인지 확인
    if (newLayout === 'grid' || newLayout === 'list') {
        room.layout = newLayout;
        // 방의 모든 클라이언트에게 변경된 레이아웃 알림
        io.to(socket.roomId).emit('layout changed', { layout: newLayout });
    }
  });

  // 라운드 종료 처리
  socket.on('end round', () => {
    const room = rooms.get(socket.roomId);
    const user = socket.userData;
    if (!room || !user || user.role !== 'streamer') return;

    const allUsersInRoom = getUsersInRoom(socket.roomId);
    const streamersInRoom = allUsersInRoom.filter(u => u.role === 'streamer');
    
    streamersInRoom.forEach(streamer => {
        if (room.finishedStreamers.some(f => f.streamerId === streamer.streamerId)) return;
        const streamerConfig = config.streamers.find(s => s.id === streamer.streamerId);
        if (!streamerConfig) return;
        const myFandomId = streamerConfig.fandom.id;
        const myFans = allUsersInRoom.filter(u => u.role === 'fan' && u.fanGroup === myFandomId);
        
        let correctCount = 0;
        myFans.forEach(fan => {
            const fanGuesses = room.guesses.get(fan.id);
            if (fanGuesses && fanGuesses.has(streamer.streamerId)) {
                const guess = fanGuesses.get(streamer.streamerId);
                const actualRole = getUserRole(fan);
                if (guess.guessedRole === actualRole) correctCount++;
            }
        });

        if (myFans.length > 0 && correctCount === myFans.length) {
             const tempFinished = [...room.finishedStreamers, { streamerId: streamer.streamerId, finishedInRound: room.currentRound }];
             tempFinished.sort((a, b) => a.finishedInRound - b.finishedInRound);
             let currentRank = 0, lastRound = -1, rankForMessage = 0;
             tempFinished.forEach((fin, index) => {
                 if (fin.finishedInRound > lastRound) currentRank = index + 1;
                 if (fin.streamerId === streamer.streamerId) rankForMessage = currentRank;
                 lastRound = fin.finishedInRound;
             });
             room.finishedStreamers.push({ streamerId: streamer.streamerId, finishedInRound: room.currentRound });
             const celebrationMessage = `🎉 ${streamer.nickname}님이 모든 팬의 정체를 맞혔습니다! (${rankForMessage}등) 🎉`;
             io.to(socket.roomId).emit('game message', { message: celebrationMessage, type: 'success', chatGroupId: streamer.streamerId });
             const revealedFanData = myFans.map(fan => ({ ...fan, actualRole: getUserRole(fan) }));
             io.to(socket.roomId).emit('reveal fandom', { streamerId: streamer.streamerId, fans: revealedFanData });
        } else {
             const resultMessage = `📢 [${room.currentRound}라운드] ${streamer.nickname}님이 ${myFans.length}명 중 ${correctCount}명을 찾아냈습니다.`;
             io.to(socket.roomId).emit('game message', { message: resultMessage, type: 'reveal', chatGroupId: streamer.streamerId });
        }
    });

    if (streamersInRoom.length > 0 && room.finishedStreamers.length === streamersInRoom.length) {
        let rank = 0, lastRound = -1;
        room.finishedStreamers.sort((a, b) => a.finishedInRound - b.finishedInRound);
        const rankings = room.finishedStreamers.map((finishedData, index) => {
            if (finishedData.finishedInRound > lastRound) rank = index + 1;
            lastRound = finishedData.finishedInRound;
            const streamerUser = streamersInRoom.find(s => s.streamerId === finishedData.streamerId);
            return { rank, name: streamerUser.nickname, id: finishedData.streamerId, finishedInRound: finishedData.finishedInRound };
        });
        const finalResults = {
            rankings,
            allUsers: allUsersInRoom.map(u => ({...u, actualRole: getUserRole(u)}))
        };
        io.to(socket.roomId).emit('game over', finalResults);
    } else {
        room.currentRound++;
        io.to(socket.roomId).emit('round advanced', room.currentRound);
    }
  });

  // 플레이어 강퇴 처리
  socket.on('kick player', (targetUserId) => {
    const room = rooms.get(socket.roomId);
    if (!room || socket.id !== room.ownerId) return;
    const targetSocket = io.sockets.sockets.get(targetUserId);
    if (targetSocket && targetSocket.userData) {
        const targetUserData = targetSocket.userData;
        room.kickedIPs.add(targetSocket.handshake.address);
        targetSocket.emit('kicked', '방장에 의해 강퇴당했습니다.');
        targetSocket.leave(socket.roomId);
        room.users.delete(targetUserId);
        io.to(socket.roomId).emit('user left', { user: targetUserData, reason: '강퇴됨', users: getUsersInRoom(socket.roomId) });
        console.log(`User ${targetUserData.nickname} (IP: ${targetSocket.handshake.address}) was kicked.`);
    }
  });

  // 연결 종료 처리
  socket.on('disconnect', () => {
    if (socket.userData && socket.roomId) {
      const roomId = socket.roomId;
      const room = rooms.get(roomId);
      if (room) {
        const departingUser = socket.userData;
        room.users.delete(socket.id);
        console.log(`User ${departingUser.nickname} left room ${roomId}`);
        if (room.users.size > 0) {
            if (socket.id === room.ownerId) {
                const newOwner = Array.from(room.users.values()).find(user => user.role === 'streamer');
                if (newOwner) {
                    room.ownerId = newOwner.id;
                    io.to(roomId).emit('new host', { newOwner, users: getUsersInRoom(roomId) });
                    console.log(`Host left. New host is ${newOwner.nickname}`);
                }
            }
            if (!hasStreamer(roomId)) {
                closeRoom(roomId, '스트리머가 모두 퇴장하여 방이 종료됩니다.');
                return;
            }
            io.to(roomId).emit('user left', { user: departingUser, users: getUsersInRoom(roomId) });
        } else {
            rooms.delete(roomId);
            console.log(`Room ${roomId} is now empty and closed.`);
        }
      }
    }
    console.log(`A user disconnected: ${socket.id}`);
  });

  // 채팅 메시지 처리
  socket.on('chat message', (data) => {
    const { message, chatGroupId } = data;
    const user = socket.userData;
    const room = rooms.get(socket.roomId);
    if (!user || !room || !message || !chatGroupId) return;

    const streamerConfig = config.streamers.find(s => s.id === chatGroupId);
    if (!streamerConfig) return;

    if ((user.role === 'streamer' && user.streamerId === chatGroupId) || 
        (user.role === 'fan' && user.fanGroup === streamerConfig.fandom.id)) {
        io.to(socket.roomId).emit('chat message', { user: user, message: message, chatGroupId: chatGroupId });
    }
  });

  // 유저 목록 재요청 처리
  socket.on('request user list', () => {
    if (socket.roomId) {
        const room = rooms.get(socket.roomId);
        if (room) socket.emit('user list', { users: getUsersInRoom(socket.roomId), ownerId: room.ownerId });
    }
  });
});

// 서버 실행
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});