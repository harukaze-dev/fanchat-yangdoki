// public/client.js

// 전역 변수
const socket = io();
let gameConfig = null;
let currentUserData = {};
let currentRoomId = null;
let currentOwnerId = null;
let currentMode = 'fakefan';
let userIntent = null;
let roomToJoin = null;
let allUsers = [];
let currentGuesses = {};
let currentRoundNumber = 1;
let isGameOver = false;
let currentLayout = 'list';

// 사운드 및 TTS 관련
let currentVolume = 1.0;
let lastVolumeBeforeMute = 1.0;
let ttsVoices = [];
const ttsQueue = [];
let isProcessingTTS = false;

// DOM 요소 캐싱
const toastPopup = document.getElementById('toast-popup');
const mainMenu = document.getElementById('main-menu');
const createRoomBtn = document.getElementById('create-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const profileSetup = document.getElementById('profile-setup');
const confirmProfileBtn = document.getElementById('confirm-profile-btn');
// const profileSetupTitle = document.getElementById('profile-setup-title'); 
const roleRadios = document.querySelectorAll('input[name="role"]');
const streamerOptions = document.getElementById('streamer-options');
const streamerKeyGroup = document.getElementById('streamer-key-group');
const streamerKeyInput = document.getElementById('streamer-key-input');
const fanOptions = document.getElementById('fan-options');
const streamerSelect = document.getElementById('streamer-select');
const fanGroupSelect = document.getElementById('fan-group-select');
const fanTierSelect = document.getElementById('fan-tier-select');
const profilePreview = document.getElementById('profile-preview');
const nicknameGroup = document.getElementById('nickname-group');
const nicknameInput = document.getElementById('nickname-input');
const chatContainer = document.getElementById('chat-container');
const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
const multiChatView = document.getElementById('multi-chat-view');
const privateGuessModal = document.getElementById('private-guess-modal');
const privateGuessTargetInfo = document.getElementById('private-guess-target-info');
const privateGuessOptionsContainer = document.getElementById('private-guess-options-container');
const privateChatLog = document.getElementById('private-chat-log');
const privateGuessModalClose = document.getElementById('private-guess-modal-close');
const privateGuessAdminControls = document.getElementById('private-guess-admin-controls');
const privateKickBtn = document.getElementById('private-kick-btn');
let privateGuessTargetUser = null;
const channelParticipantsModal = document.getElementById('channel-participants-modal');
const channelParticipantsTitle = document.getElementById('channel-participants-title');
const channelParticipantsList = document.getElementById('channel-participants-list');
const channelParticipantsModalClose = document.getElementById('channel-participants-modal-close');
const otherFansListContainer = document.getElementById('other-fans-list');
const gameOverModal = document.getElementById('game-over-modal');
const gameOverBody = document.getElementById('game-over-body');
const gameOverCloseBtn = document.getElementById('game-over-close-btn');
const frame02 = document.getElementById('frame-02');

// 기타 전역 변수
let sortable = null;
let resizingColumn = null;

// [신규] frame01 이미지 비율 계산을 위한 변수
const frame01Img = new Image();
frame01Img.src = '/images/frame01.png';
let frame01Ratio = 0;

// [신규] 이미지가 로드되면 비율 계산 및 레이아웃 적용
frame01Img.onload = () => {
    if (frame01Img.naturalWidth > 0) {
        frame01Ratio = frame01Img.naturalHeight / frame01Img.naturalWidth;
        adjustLayout(); // 초기 로드 시 적용
    }
};

// [신규] 화면 크기에 따라 하단 패딩과 frame02 높이 조절
function adjustLayout() {
    // 1. 하단 패딩 계산 (frame01 높이만큼)
    if (frame01Ratio > 0) {
        const w = window.innerWidth;
        // background-size: 100% auto 이므로 높이는 너비 * 비율
        const h = w * frame01Ratio - 15;
        // CSS 변수에 적용
        document.documentElement.style.setProperty('--frame-bottom-padding', `${h}px`);
    }
    
    // 2. frame02 높이 동기화
    updateFrame02Height();
}

// 화면 레이아웃을 적용하는 함수
function applyLayout(layout) {
    currentLayout = layout; 
    if (layout === 'grid') {
        multiChatView.classList.remove('layout-list');
        multiChatView.classList.add('layout-grid');
    } else {
        multiChatView.classList.remove('layout-grid');
        multiChatView.classList.add('layout-list');
    }

    document.querySelectorAll('.menu-change-layout-btn').forEach(btn => {
        btn.textContent = layout === 'grid' ? '리스트형 보기' : '그리드형 보기';
    });
}

// 방장 전용 UI를 업데이트하는 함수
function updateOwnerSpecificUI() {
    const isOwner = socket.id === currentOwnerId;
    document.querySelectorAll('.menu-change-layout-btn').forEach(btn => {
        btn.style.display = isOwner ? 'block' : 'none';
    });
}


/**
 * TTS 및 사운드 관련 함수들...
 */
function initializeTTS() {
    const assignVoices = () => { ttsVoices = window.speechSynthesis.getVoices(); };
    if (window.speechSynthesis.getVoices().length > 0) { assignVoices(); } 
    else { window.speechSynthesis.onvoiceschanged = assignVoices; }
}
function processTTSQueue() {
    if (ttsQueue.length === 0) { isProcessingTTS = false; return; }
    isProcessingTTS = true;
    const toSpeak = ttsQueue.shift();
    const utterance = new SpeechSynthesisUtterance(toSpeak.text);
    const speakingElement = toSpeak.messageElement;
    const selectedVoice = ttsVoices.find(voice => voice.lang === 'ko-KR');
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.volume = currentVolume;
    setTimeout(() => { if (speakingElement) speakingElement.classList.add('speaking'); }, 0);
    utterance.onend = () => { if (speakingElement) speakingElement.classList.remove('speaking'); processTTSQueue(); };
    utterance.onerror = (event) => { console.error('TTS Error:', event); if (speakingElement) speakingElement.classList.remove('speaking'); processTTSQueue(); };
    window.speechSynthesis.speak(utterance);
}
function speak(text, fanGroup, messageElement) {
    if (currentVolume === 0) return;
    ttsQueue.push({ text, fanGroup, messageElement });
    if (!isProcessingTTS) processTTSQueue();
}
function playSound(src) {
    if (currentVolume === 0) return;
    const sound = new Audio(`/sounds/${src}`);
    sound.volume = currentVolume;
    const playPromise = sound.play();
    if (playPromise !== undefined) playPromise.catch(error => console.log(`Audio play failed:`, error));
}
function showToast(message) {
    toastPopup.textContent = message;
    toastPopup.classList.remove('hidden');
    setTimeout(() => { toastPopup.classList.add('hidden'); }, 2500);
}

/**
 * UI 업데이트 관련 함수들...
 */
function updateRoundEndButtons() {
    document.querySelectorAll('.end-round-btn').forEach(btn => {
        btn.textContent = `${currentRoundNumber}라운드 종료`;
        btn.disabled = false;
    });
}
function updateEndRoundButtonsAfterGameOver() {
    document.querySelectorAll('.end-round-btn').forEach(btn => {
        btn.textContent = '결과 다시보기';
        btn.disabled = false;
    });
}
function updateColumnUIVisibility() {
    if (!gameConfig) return; // config 체크 추가
    const streamerIdToFandomId = new Map(gameConfig.streamers.map(s => [s.id, s.fandom.id]));
    document.querySelectorAll('.chat-column').forEach(column => {
        const columnStreamerId = column.dataset.streamerId;
        const form = column.querySelector('.chat-form');
        const settingsContainer = column.querySelector('.settings-container');
        const headerTitle = column.querySelector('.column-title');
        const endRoundBtn = form.querySelector('.end-round-btn');
        const volumeContainer = column.querySelector('.volume-control-container');
        let isMyChannel = currentUserData.role === 'streamer' && currentUserData.streamerId === columnStreamerId;
        if (isMyChannel || socket.id === currentOwnerId) {
            headerTitle.style.cursor = 'pointer';
            headerTitle.onclick = () => openChannelParticipantsModal(columnStreamerId);
        } else {
            headerTitle.style.cursor = 'default';
            headerTitle.onclick = null;
        }
        let belongsToChannel = (isMyChannel) || (currentUserData.role === 'fan' && currentUserData.fanGroup === streamerIdToFandomId.get(columnStreamerId));
        form.classList.toggle('hidden', !belongsToChannel);
        if (settingsContainer) settingsContainer.classList.toggle('hidden', !belongsToChannel);
        if (volumeContainer) volumeContainer.classList.toggle('hidden', currentUserData.role !== 'streamer' || !isMyChannel);
        endRoundBtn.classList.toggle('hidden', !isMyChannel);
    });
}
function updateProfileSetupUI() {
    if (!gameConfig) return;
    const role = document.querySelector('input[name="role"]:checked').value;
    if (role === 'streamer') {
        streamerOptions.classList.remove('hidden'); fanOptions.classList.add('hidden');
        nicknameGroup.classList.add('hidden'); streamerKeyGroup.classList.remove('hidden');
        streamerKeyInput.value = '';
        const selectedStreamer = gameConfig.streamers.find(s => s.id === streamerSelect.value);
        if (selectedStreamer) nicknameInput.value = selectedStreamer.name;
    } else {
        streamerOptions.classList.add('hidden'); fanOptions.classList.remove('hidden');
        nicknameGroup.classList.remove('hidden'); streamerKeyGroup.classList.add('hidden');
        nicknameInput.value = ''; nicknameInput.focus(); updateFanTiers();
    }
    updateProfilePreview();
}
function getPfp(user) {
    if (!gameConfig || !user) return '/images/ghost.png';
    if (user.role === 'streamer') return user.pfp;
    const streamer = gameConfig.streamers.find(s => s.fandom.id === user.fanGroup);
    if (!streamer) return user.pfp;
    if (user.isRevealed) {
        const role = user.actualRole || getRole(user);
        if (role === 'yasik') return streamer.fandom.yasikPfp;
        if (role === 'superfan') return streamer.fandom.superFanPfp;
        return streamer.fandom.pfp;
    } else {
        return user.pfp;
    }
}
function getRole(user) {
    if (!user || !user.fanTier) return 'fan';
    const streamer = gameConfig.streamers.find(s => s.fandom.id === user.fanGroup);
    if (!streamer) return 'fan';
    const tierInfo = streamer.fandom.tiers.find(t => t.name === user.fanTier);
    if (!tierInfo) return 'fan';
    if (tierInfo.isYasik) return 'yasik';
    if (tierInfo.isSuperFan) return 'superfan';
    return 'fan';
}
function updateProfilePreview() {
    if (!gameConfig) return;
    const role = document.querySelector('input[name="role"]:checked').value;
    if (role === 'streamer') {
        const streamer = gameConfig.streamers.find(s => s.id === streamerSelect.value);
        if (streamer) profilePreview.src = streamer.pfp;
    } else {
        const streamer = gameConfig.streamers.find(s => s.fandom.id === fanGroupSelect.value);
        if (!streamer) return;
        const selectedTierName = fanTierSelect.value;
        const tierInfo = streamer.fandom.tiers.find(t => t.name === selectedTierName);
        if (tierInfo?.isYasik) profilePreview.src = streamer.fandom.yasikPfp;
        else if (tierInfo?.isSuperFan) profilePreview.src = streamer.fandom.superFanPfp;
        else profilePreview.src = streamer.fandom.pfp;
    }
}
function updateFanTiers() {
    if (!gameConfig) return;
    const selectedGroupId = fanGroupSelect.value;
    const streamer = gameConfig.streamers.find(s => s.fandom.id === selectedGroupId);
    if (!streamer) return;
    let tiers = streamer.fandom.tiers;
    fanTierSelect.innerHTML = '';
    tiers.forEach(tier => {
        const option = document.createElement('option');
        option.value = tier.name; option.textContent = tier.name;
        fanTierSelect.appendChild(option);
    });
}
function initializeResizeHandles() {
    document.querySelectorAll('.column-resize-handle').forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('.volume-control-container')) return;
            e.preventDefault(); resizingColumn = handle.closest('.chat-column');
            document.body.style.userSelect = 'none'; document.body.style.cursor = 'ns-resize';
        });
    });
}
function setupSettingsMenus() {
    const hideAllSettingsMenus = () => {
        document.querySelectorAll('.settings-menu').forEach(menu => menu.classList.add('hidden'));
    };
    document.querySelectorAll('.settings-container > button').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation(); const menu = button.nextElementSibling;
            const isHidden = menu.classList.contains('hidden');
            hideAllSettingsMenus(); if (isHidden) menu.classList.remove('hidden');
        });
    });
    // 레이아웃 변경 버튼 이벤트 리스너
    document.querySelectorAll('.menu-change-layout-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const newLayout = currentLayout === 'grid' ? 'list' : 'grid';
            socket.emit('change layout', newLayout);
            hideAllSettingsMenus();
        });
    });
    document.querySelectorAll('.menu-copy-code-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentRoomId) navigator.clipboard.writeText(currentRoomId).then(() => showToast('코드 복사 완료!'));
            hideAllSettingsMenus();
        });
    });
    document.querySelectorAll('.menu-leave-room-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('정말로 방을 나가시겠습니까? 로비로 이동합니다.')) window.location.reload();
            hideAllSettingsMenus();
        });
    });
    document.addEventListener('click', hideAllSettingsMenus);
}

// frame02 높이를 채팅창 하단에 맞춰 업데이트하는 함수
function updateFrame02Height() {
    const container = document.getElementById('chat-container');
    if (container && frame02) {
        const rect = container.getBoundingClientRect();
        // frame02는 top:0에서 시작하므로, 높이를 컨테이너의 bottom 좌표로 설정하면
        // 화면 맨 위부터 컨테이너 바닥까지 덮게 됩니다.
        frame02.style.height = `${rect.bottom}px`;
    }
}

function showChatRoom() {
    mainMenu.classList.add('hidden'); profileSetup.classList.add('hidden');
    chatContainer.classList.remove('hidden'); document.body.classList.add('in-chat');
    
    // frame02 표시
    if (frame02) frame02.classList.remove('hidden');
    
    chatContainer.className = 'multi-view-active';
    multiChatView.classList.remove('hidden');
    updateColumnUIVisibility(); updateRoundEndButtons();
    if (sortable) sortable.destroy();
    sortable = Sortable.create(multiChatView, { animation: 150, handle: '.chat-column-header', filter: '.volume-control-container, .settings-container' });
    initializeResizeHandles(); setupSettingsMenus();
    
    // 초기 레이아웃 계산 (높이 및 패딩)
    adjustLayout();

    if (currentUserData.role !== 'streamer') return;
    document.querySelectorAll('.volume-btn').forEach(btn => {
        btn.textContent = currentVolume > 0 ? '🔊' : '🔇';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentVolume > 0) { lastVolumeBeforeMute = currentVolume; currentVolume = 0; } 
            else { currentVolume = lastVolumeBeforeMute; }
            document.querySelectorAll('.volume-slider-vertical').forEach(s => s.value = currentVolume);
            document.querySelectorAll('.volume-btn').forEach(b => b.textContent = currentVolume > 0 ? '🔊' : '🔇');
        });
    });
    document.querySelectorAll('.volume-slider-vertical').forEach(slider => {
        slider.value = currentVolume;
        slider.addEventListener('input', (e) => {
            currentVolume = parseFloat(e.target.value);
            if (currentVolume > 0) lastVolumeBeforeMute = currentVolume;
            document.querySelectorAll('.volume-slider-vertical').forEach(s => s.value = currentVolume);
            document.querySelectorAll('.volume-btn').forEach(b => b.textContent = currentVolume > 0 ? '🔊' : '🔇');
        });
    });
}

//--- 이벤트 리스너 설정 ---//

// [수정] '새로운 팬채팅 만들기' 클릭 시
createRoomBtn.addEventListener('click', () => { 
    userIntent = 'create'; 
    mainMenu.classList.add('hidden'); 
    profileSetup.classList.remove('hidden'); 
    document.getElementById('role-streamer').checked = true;
    document.getElementById('role-fan').style.display = 'none';
    document.querySelector('label[for="role-fan"]').style.display = 'none';
    updateProfileSetupUI(); 
});

// [수정] '코드로 참여하기' 클릭 시
joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase(); 
    if (!code) return alert('초대 코드를 입력해주세요.');
    userIntent = 'join'; 
    roomToJoin = code; 
    mainMenu.classList.add('hidden');
    profileSetup.classList.remove('hidden'); 
    document.getElementById('role-fan').style.display = '';
    document.querySelector('label[for="role-fan"]').style.display = '';
    document.getElementById('role-fan').checked = true;
    updateProfileSetupUI();
});

// [수정] 뒤로가기 버튼
backToLobbyBtn.addEventListener('click', () => { 
    profileSetup.classList.add('hidden'); 
    mainMenu.classList.remove('hidden'); 
    document.getElementById('role-fan').style.display = '';
    document.querySelector('label[for="role-fan"]').style.display = '';
    document.getElementById('role-fan').checked = true;
});

roleRadios.forEach(radio => radio.addEventListener('change', updateProfileSetupUI));
streamerSelect.addEventListener('change', updateProfileSetupUI);
fanGroupSelect.addEventListener('change', () => { updateFanTiers(); updateProfilePreview(); });
fanTierSelect.addEventListener('change', updateProfilePreview);

confirmProfileBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim(); 
    if (!nickname) return alert('닉네임을 입력해주세요!');
    
    const role = document.querySelector('input[name="role"]:checked').value;
    const userData = { nickname, role };
    
    if (role === 'streamer') {
        const streamer = gameConfig.streamers.find(s => s.id === streamerSelect.value);
        userData.pfp = streamer.pfp; userData.streamerId = streamer.id;
        userData.streamerKey = streamerKeyInput.value.trim();
        if (!userData.streamerKey) return alert('스트리머 인증 키를 입력해주세요.');
    } else {
        const streamer = gameConfig.streamers.find(s => s.fandom.id === fanGroupSelect.value);
        userData.pfp = streamer.fandom.pfp; userData.fanGroup = streamer.fandom.id;
        userData.fanTier = fanTierSelect.value;
    }
    currentUserData = userData;
    if (userIntent === 'create') socket.emit('create room', { userData });
    else if (userIntent === 'join') socket.emit('join room', { roomId: roomToJoin, userData: userData });
});


privateGuessModalClose.onclick = () => { privateGuessModal.classList.add('hidden'); privateGuessTargetUser = null; };
channelParticipantsModalClose.onclick = () => channelParticipantsModal.classList.add('hidden');
gameOverCloseBtn.onclick = () => gameOverModal.classList.add('hidden');
document.querySelectorAll('.chat-form').forEach(form => {
    form.addEventListener('submit', (e) => {
        e.preventDefault(); const input = form.querySelector('input[type="text"]');
        const message = input.value.trim(); if (message) {
            const chatGroupId = form.dataset.groupid; if (!chatGroupId) return;
            socket.emit('chat message', { message, chatGroupId }); input.value = '';
        }
    });
});
document.querySelectorAll('.end-round-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isGameOver) gameOverModal.classList.remove('hidden');
        else if (confirm('정말로 라운드를 종료하고 결과를 확인하시겠습니까?')) {
            btn.disabled = true; socket.emit('end round');
        }
    });
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        [privateGuessModal, channelParticipantsModal, gameOverModal].forEach(modal => modal.classList.add('hidden'));
        document.querySelectorAll('.settings-menu').forEach(menu => menu.classList.add('hidden'));
    }
});

// [수정] 마우스 이동 이벤트 (리사이징 처리)
document.addEventListener('mousemove', (e) => {
    if (!resizingColumn) return;
    
    const container = document.getElementById('chat-container');
    if (container) {
        const rect = container.getBoundingClientRect();
        const newHeight = e.clientY - rect.top;
        container.style.height = `${Math.max(300, newHeight)}px`;
        
        // 채팅창 크기 변경 시 frame02 높이도 동기화
        updateFrame02Height();
    }
});

document.addEventListener('mouseup', () => {
    if (resizingColumn) { resizingColumn = null; document.body.style.userSelect = ''; document.body.style.cursor = ''; }
});

// [수정] 창 크기 변경 시 레이아웃 재계산 (패딩 및 높이)
window.addEventListener('resize', () => {
    if (currentRoomId) {
        adjustLayout();
    }
});

//--- 소켓 이벤트 핸들러 ---//
socket.on('server config', (config) => { gameConfig = config; initialize(); initializeTTS(); });
function onRoomJoined(data) {
    const { roomId, users, ownerId, mode, currentRound, layout } = data; 
    currentRoomId = roomId; currentOwnerId = ownerId; currentMode = mode;
    allUsers = users; currentRoundNumber = currentRound; isGameOver = false;
    currentGuesses = {};
    document.querySelectorAll('#multi-chat-view .messages').forEach(ul => ul.innerHTML = '');
    updateUserList(users);
    showChatRoom();
    applyLayout(layout); 
    updateOwnerSpecificUI(); 
    addSystemMessage(null, `채팅방에 오신 것을 환영합니다!`);
}
socket.on('room created', onRoomJoined);
socket.on('join success', onRoomJoined);
socket.on('layout changed', ({ layout }) => { applyLayout(layout); }); 
socket.on('round advanced', (newRound) => { currentRoundNumber = newRound; updateRoundEndButtons(); });
socket.on('user joined', (data) => { playSound('join.MP3'); allUsers = data.users; updateUserList(data.users); addSystemMessage(data.user, '님이 입장했습니다.'); });
socket.on('user left', (data) => { playSound('leave.MP3'); allUsers = data.users; updateUserList(data.users); const message = data.reason ? `님이 ${data.reason} 처리되었습니다.` : '님이 퇴장했습니다.'; addSystemMessage(data.user, message); });
socket.on('new host', (data) => {
    currentOwnerId = data.newOwner.id; allUsers = data.users; updateUserList(data.users);
    updateColumnUIVisibility(); updateOwnerSpecificUI(); 
    addGameMessage(`👑 ${data.newOwner.nickname}님이 새로운 방장이 되었습니다.`, 'reveal');
});
socket.on('user list', (data) => {
    currentOwnerId = data.ownerId; allUsers = data.users; updateUserList(data.users);
    updateColumnUIVisibility(); updateOwnerSpecificUI(); 
});
socket.on('kicked', (reason) => { alert(reason); window.location.reload(); });
socket.on('room closed', (reason) => { alert(reason); window.location.reload(); });
socket.on('error message', (message) => {
    alert(message); currentMode = 'fakefan'; userIntent = null; roomToJoin = null;
    mainMenu.classList.remove('hidden'); profileSetup.classList.add('hidden');
    chatContainer.classList.add('hidden'); document.body.classList.remove('in-chat');
});

/**
 * 메시지 및 게임 로직 관련 함수들... 
 */
function addChatMessage(data) {
    playSound('chat.MP3');
    const { user, message, chatGroupId } = data;
    const targetMessageList = document.getElementById(`messages-${chatGroupId}`);
    if (!targetMessageList) return;
    const item = document.createElement('li');
    if (currentUserData.role === 'streamer' && user.role === 'fan') {
        if (chatGroupId === currentUserData.streamerId) speak(message, user.fanGroup, item);
    }
    item.dataset.userId = user.id; item.dataset.userRole = user.role;
    const liClasses = ['message-item'];
    if (user.role === 'streamer') liClasses.push('streamer-message', `streamer-${user.streamerId}`);
    else if (user.role === 'fan') {
        const fanData = allUsers.find(u => u.id === user.id);
        if (fanData?.isRevealed) liClasses.push(`fan-group-${user.fanGroup}`);
    }
    item.className = liClasses.join(' ');
    const pfpSrc = getPfp(allUsers.find(u => u.id === user.id) || user);
    const senderInfoDiv = document.createElement('div');
    senderInfoDiv.className = 'sender-info';
    senderInfoDiv.innerHTML = `<img src="${pfpSrc}" alt="pfp" class="chat-pfp"><span class="chat-nickname">${user.nickname}</span>`;
    if (user.role === 'fan' && currentUserData.role === 'streamer' && !isGameOver) {
        const channelStreamerId = targetMessageList.closest('.chat-column').dataset.streamerId;
        const guessData = currentGuesses[user.id] && currentGuesses[user.id][channelStreamerId];
        if (guessData) {
            const guessTag = document.createElement('div');
            guessTag.className = 'guess-tag';
            guessTag.textContent = `${guessData.guessedTierName}?`;
            if (guessData.guessedRole === 'superfan') guessTag.classList.add('guess-tag-superfan');
            else if (guessData.guessedRole === 'yasik') guessTag.classList.add('guess-tag-yasik');
            senderInfoDiv.appendChild(guessTag);
        }
    }
    const messageBubbleDiv = document.createElement('div');
    messageBubbleDiv.className = 'message-bubble';
    messageBubbleDiv.innerHTML = `<p class="chat-message-text">${message}</p>`;
    if (user.role === 'fan' && currentUserData.role === 'streamer') {
        messageBubbleDiv.style.cursor = 'pointer';
        messageBubbleDiv.dataset.fanGroup = user.fanGroup;
        messageBubbleDiv.addEventListener('click', () => speak(message, user.fanGroup, item));
    }
    item.appendChild(senderInfoDiv); item.appendChild(messageBubbleDiv);
    const pfpElement = item.querySelector('.chat-pfp');
    if (currentUserData.role === 'streamer' && user.role === 'fan' && !isGameOver) {
        pfpElement.classList.add('clickable');
        const channelStreamerId = targetMessageList.closest('.chat-column').dataset.streamerId;
        if (currentUserData.streamerId === channelStreamerId) {
            pfpElement.onclick = () => openPrivateGuessModal(user, channelStreamerId);
        }
    }
    targetMessageList.appendChild(item);
    targetMessageList.scrollTop = targetMessageList.scrollHeight;
    if (!privateGuessModal.classList.contains('hidden') && privateGuessTargetUser) {
        const modalStreamerId = privateGuessTargetInfo.dataset.streamerId;
        if (chatGroupId === modalStreamerId && (user.id === privateGuessTargetUser.id || user.id === currentUserData.id)) {
            privateChatLog.appendChild(item.cloneNode(true));
            privateChatLog.scrollTop = privateChatLog.scrollHeight;
        }
    }
}
socket.on('chat message', addChatMessage);
socket.on('guesses updated', (guesses) => {
    currentGuesses = guesses;
    document.querySelectorAll('.message-item .guess-tag').forEach(tag => tag.remove());
    if (currentUserData.role === 'streamer') {
        document.querySelectorAll('.chat-column').forEach(column => {
            const channelStreamerId = column.dataset.streamerId;
            const messagesInColumn = column.querySelectorAll('.message-item[data-user-role="fan"]');
            messagesInColumn.forEach(msgItem => {
                const userId = msgItem.dataset.userId; const senderInfo = msgItem.querySelector('.sender-info');
                const guessData = currentGuesses[userId] && currentGuesses[userId][channelStreamerId];
                if (guessData) {
                    const guessTag = document.createElement('div');
                    guessTag.className = 'guess-tag'; guessTag.textContent = `${guessData.guessedTierName}?`;
                    if (guessData.guessedRole === 'superfan') guessTag.classList.add('guess-tag-superfan');
                    else if (guessData.guessedRole === 'yasik') guessTag.classList.add('guess-tag-yasik');
                    senderInfo.appendChild(guessTag);
                }
            });
        });
    }
    if (!privateGuessModal.classList.contains('hidden') && privateGuessTargetUser) {
        const streamerId = privateGuessTargetInfo.dataset.streamerId;
        openPrivateGuessModal(privateGuessTargetUser, streamerId);
    }
    if (!channelParticipantsModal.classList.contains('hidden')) {
        const streamerId = channelParticipantsTitle.dataset.streamerId;
        if (streamerId) openChannelParticipantsModal(streamerId);
    }
});
socket.on('reveal fandom', ({ streamerId, fans }) => {
    const column = document.getElementById(`chat-column-${streamerId}`);
    if (column) column.classList.add(`revealed-${streamerId}`);
    fans.forEach(revealedFan => {
        const userIndex = allUsers.findIndex(u => u.id === revealedFan.id);
        if (userIndex !== -1) { allUsers[userIndex].isRevealed = true; allUsers[userIndex].actualRole = revealedFan.actualRole; }
        document.querySelectorAll(`[data-user-id="${revealedFan.id}"] .chat-pfp, .participant-card[data-user-id="${revealedFan.id}"] img`).forEach(pfp => { pfp.src = getPfp(allUsers[userIndex]); });
        document.querySelectorAll(`.message-item[data-user-id="${revealedFan.id}"]`).forEach(item => {
            item.classList.add(`fan-group-${revealedFan.fanGroup}`);
            const guessTag = item.querySelector('.guess-tag'); if (guessTag) guessTag.remove();
        });
    });
});
function revealAllFans() {
    allUsers.forEach(user => {
        if (user.role === 'fan') {
            const fanData = { ...user, isRevealed: true };
            document.querySelectorAll(`[data-user-id="${user.id}"]`).forEach(el => {
                const pfpElement = el.querySelector('.chat-pfp, .player-pfp, .system-pfp');
                if (pfpElement) pfpElement.src = getPfp(fanData);
                const nicknameElement = el.querySelector('.chat-nickname, .system-nickname');
                if (nicknameElement) {
                    nicknameElement.className = '';
                    const baseClass = el.classList.contains('system-message') ? 'system-nickname' : 'chat-nickname';
                    nicknameElement.classList.add(baseClass, `fan-group-${user.fanGroup}`);
                }
            });
        }
    });
}
socket.on('game over', (results) => {
    playSound('special.MP3'); isGameOver = true; updateEndRoundButtonsAfterGameOver();
    allUsers = results.allUsers.map(u => ({ ...u, isRevealed: true, actualRole: u.actualRole || getRole(u) }));
    revealAllFans(); gameOverBody.innerHTML = ''; gameOverBody.className = '';
    results.rankings.forEach(rankedStreamer => {
        const rankerDiv = document.createElement('div'); rankerDiv.className = 'ranking-item';
        const streamerInfo = allUsers.find(u => u.streamerId === rankedStreamer.id);
        rankerDiv.innerHTML = `<img src="${streamerInfo.pfp}" alt="${rankedStreamer.name}" class="ranking-pfp"><div class="ranking-text-group"><div class="rank-and-name"><span class="rank rank-${rankedStreamer.rank}">${rankedStreamer.rank}</span> <span class="name">${rankedStreamer.name}</span></div><span class="round-info">(${rankedStreamer.finishedInRound}라운드 완료)</span></div>`;
        const groupDiv = document.createElement('div'); groupDiv.className = 'fandom-identity-group';
        const streamerConfig = gameConfig.streamers.find(s => s.id === rankedStreamer.id);
        const fansOfStreamer = allUsers.filter(u => u.role === 'fan' && u.fanGroup === streamerConfig.fandom.id);
        fansOfStreamer.forEach(user => {
            const card = document.createElement('div'); card.className = `identity-card fandom-${user.fanGroup}`;
            const tier = streamerConfig.fandom.tiers.find(t => t.name === user.fanTier);
            const roleText = tier ? tier.name : "팬";
            card.innerHTML = `<img src="${getPfp(user)}" alt="${user.nickname}"><p class="name">${user.nickname}</p><p class="role ${user.actualRole || ''}">${roleText}</p>`;
            groupDiv.appendChild(card);
        });
        gameOverBody.appendChild(rankerDiv); gameOverBody.appendChild(groupDiv);
    });
    gameOverModal.classList.remove('hidden');
});
function updateUserList(users) {
    allUsers = users.map(u => ({ ...u, isRevealed: allUsers.find(au => au.id === u.id)?.isRevealed || false }));
    if (!channelParticipantsModal.classList.contains('hidden')) {
        const streamerId = channelParticipantsTitle.dataset.streamerId;
        if (streamerId) openChannelParticipantsModal(streamerId);
    }
    updateColumnUIVisibility();
}
function initialize() {
    if (!gameConfig) return;
    streamerSelect.innerHTML = '';
    gameConfig.streamers.forEach(streamer => {
        const option = document.createElement('option');
        option.value = streamer.id; option.textContent = streamer.name;
        streamerSelect.appendChild(option);
    });
    fanGroupSelect.innerHTML = '';
    gameConfig.streamers.forEach(streamer => {
        const option = document.createElement('option');
        option.value = streamer.fandom.id; option.textContent = streamer.fandom.name;
        fanGroupSelect.appendChild(option);
    });
    updateProfileSetupUI();
}