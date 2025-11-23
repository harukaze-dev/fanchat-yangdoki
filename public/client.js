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
// layout 변수는 더이상 필요 없으나 호환성을 위해 'list'로 고정
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

// 확인 모달 요소
const confirmationModal = document.getElementById('confirmation-modal');
const confirmEndRoundBtn = document.getElementById('confirm-end-round');
const cancelEndRoundBtn = document.getElementById('cancel-end-round');

// 기타 전역 변수
let sortable = null;
let resizingColumn = null;

// frame01 이미지 비율 계산을 위한 변수
const frame01Img = new Image();
frame01Img.src = '/images/frame01.png';
let frame01Ratio = 0;

frame01Img.onload = () => {
    if (frame01Img.naturalWidth > 0) {
        frame01Ratio = frame01Img.naturalHeight / frame01Img.naturalWidth;
        adjustLayout();
    }
};

// 화면 크기에 따라 하단 패딩과 frame02 높이 조절
function adjustLayout() {
    if (frame01Ratio > 0) {
        const w = window.innerWidth;
        const h = w * frame01Ratio - 15;
        document.documentElement.style.setProperty('--frame-bottom-padding', `${h}px`);
    }
    updateFrame02Height();
}

// [수정] 그리드 전환 함수 삭제 및 기본 동작만 남김
// function applyLayout(layout) { ... } // 삭제됨

function updateOwnerSpecificUI() {
    const isOwner = socket.id === currentOwnerId;
    // 레이아웃 변경 버튼 관련 로직 삭제됨
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
 * 시스템 메시지 및 게임 메시지 추가 함수
 */
function addSystemMessage(user, text, targetStreamerId = null) {
    let targetUls = [];
    
    if (targetStreamerId) {
        const ul = document.getElementById(`messages-${targetStreamerId}`);
        if (ul) targetUls.push(ul);
    } else {
        targetUls = document.querySelectorAll('.messages');
    }

    targetUls.forEach(ul => {
        const li = document.createElement('li');
        li.className = 'system-message';
        let pfpSrc = '/images/ghost.png';
        let nickname = 'System';
        let nicknameClass = 'system-nickname';
        
        if (user) {
            pfpSrc = getPfp(user);
            nickname = user.nickname;
            if (user.role === 'streamer') {
                nicknameClass += ` streamer-${user.streamerId}`;
            } else {
                nicknameClass += ` fan-group-${user.fanGroup}`;
            }
        }
        
        li.innerHTML = `
            <img src="${pfpSrc}" class="system-pfp">
            <span class="${nicknameClass}">${nickname}</span>
            <span class="system-text">${text}</span>
        `;
        ul.appendChild(li);
        ul.scrollTop = ul.scrollHeight;
    });
}

function addGameMessage(message, type, chatGroupId = null) {
    const createMsg = () => {
        const li = document.createElement('li');
        li.className = `game-message game-message-${type}`;
        li.innerHTML = message;
        return li;
    };
    
    if (chatGroupId) {
        const targetUl = document.getElementById(`messages-${chatGroupId}`);
        if (targetUl) {
            targetUl.appendChild(createMsg());
            targetUl.scrollTop = targetUl.scrollHeight;
        }
    } else {
        document.querySelectorAll('.messages').forEach(ul => {
            ul.appendChild(createMsg());
            ul.scrollTop = ul.scrollHeight;
        });
    }
}

function getStreamerIdByFanGroup(fanGroupId) {
    if (!gameConfig) return null;
    const streamer = gameConfig.streamers.find(s => s.fandom.id === fanGroupId);
    return streamer ? streamer.id : null;
}


/**
 * 모달 열기 함수
 */

function openChannelParticipantsModal(streamerId) {
    const streamerConfig = gameConfig.streamers.find(s => s.id === streamerId);
    if (!streamerConfig) return;

    channelParticipantsTitle.textContent = `${streamerConfig.name} 채널 참가자`;
    channelParticipantsTitle.dataset.streamerId = streamerId; 
    channelParticipantsList.innerHTML = '';

    const participants = allUsers.filter(u => 
        (u.role === 'streamer' && u.streamerId === streamerId) ||
        (u.role === 'fan' && u.fanGroup === streamerConfig.fandom.id)
    );

    participants.forEach(user => {
        const item = document.createElement('div');
        item.className = 'participant-card';
        if (user.role === 'streamer') item.classList.add('is-streamer');
        
        if (user.role === 'fan' && currentUserData.role === 'streamer' && currentUserData.streamerId === streamerId) {
            const guessData = currentGuesses[user.id] && currentGuesses[user.id][streamerId];
            if (guessData) {
                item.classList.add('guessed');
            }
            item.style.cursor = 'pointer';
            item.onclick = (e) => {
                if(e.target.classList.contains('kick-btn')) return;
                openPrivateGuessModal(user, streamerId);
            };
        }

        let extraInfo = '';
        if (socket.id === currentOwnerId && user.id !== socket.id && user.role !== 'streamer') {
             extraInfo = `<button class="kick-btn" style="margin-top:auto; width:100%; font-size:0.8rem; padding:0.3rem;" onclick="socket.emit('kick player', '${user.id}')">강퇴</button>`;
        } else if (user.role === 'fan' && currentUserData.role === 'streamer' && currentUserData.streamerId === streamerId) {
             const guessData = currentGuesses[user.id] && currentGuesses[user.id][streamerId];
             const statusText = guessData ? guessData.guessedTierName : '미판단';
             extraInfo = `<div class="participant-role" style="background-color: ${guessData ? '#ffd700' : '#555'}; color: ${guessData ? '#333' : '#ccc'};">${statusText}</div>`;
        } else {
             const roleLabel = user.role === 'streamer' ? '스트리머' : '팬';
             extraInfo = `<div class="participant-role" style="background-color: #555;">${roleLabel}</div>`;
        }

        item.innerHTML = `
            <img src="${getPfp(user)}">
            <div style="font-weight:bold; color:white; margin-bottom:0.5rem; font-size:0.9rem;">${user.nickname}</div>
            ${extraInfo}
        `;
        channelParticipantsList.appendChild(item);
    });

    channelParticipantsModal.classList.remove('hidden');
}

function openPrivateGuessModal(targetUser, streamerId) {
    if (!targetUser) return;
    privateGuessTargetUser = targetUser;
    
    const streamerConfig = gameConfig.streamers.find(s => s.id === streamerId);
    if (!streamerConfig) return;

    privateGuessTargetInfo.dataset.streamerId = streamerId;
    
    privateGuessTargetInfo.innerHTML = `
        <img src="${getPfp(targetUser)}" class="target-pfp">
        <div class="target-name">${targetUser.nickname}</div>
    `;

    privateGuessOptionsContainer.innerHTML = '';
    if (currentUserData.role === 'streamer' && currentUserData.streamerId === streamerId) {
        const guessData = currentGuesses[targetUser.id] && currentGuesses[targetUser.id][streamerId];
        const currentGuessTier = guessData ? guessData.guessedTierName : null;

        const tiers = streamerConfig.fandom.tiers;
        tiers.forEach(tier => {
            const btn = document.createElement('button');
            btn.className = 'tier-btn';
            if (currentGuessTier === tier.name) btn.classList.add('selected');
            
            let roleLabel = "팬";
            if (tier.isSuperFan) roleLabel = "열혈팬";
            if (tier.isYasik) roleLabel = "유동팬"; 
            
            btn.textContent = `${tier.name} (${roleLabel})`;
            btn.onclick = () => {
                let guessedRole = 'fan';
                if (tier.isSuperFan) guessedRole = 'superfan';
                if (tier.isYasik) guessedRole = 'yasik';
                
                socket.emit('guess role', {
                    targetUser: targetUser,
                    guessedRole: guessedRole,
                    guessedTierName: tier.name
                });
                document.querySelectorAll('.tier-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            };
            privateGuessOptionsContainer.appendChild(btn);
        });
        
        privateGuessAdminControls.classList.remove('hidden');
        privateKickBtn.onclick = () => {
            if (confirm('정말로 이 플레이어를 강퇴하시겠습니까?')) {
                socket.emit('kick player', targetUser.id);
                privateGuessModal.classList.add('hidden');
            }
        };
    } else {
        privateGuessAdminControls.classList.add('hidden');
        privateGuessOptionsContainer.innerHTML = '<p style="text-align:center; color:#999;">추리 권한이 없습니다.</p>';
    }

    privateChatLog.innerHTML = '';
    const channelMessages = document.getElementById(`messages-${streamerId}`);
    if (channelMessages) {
        const clonedMessages = channelMessages.cloneNode(true);
        Array.from(clonedMessages.children).forEach(li => {
             const uid = li.dataset.userId;
             if (uid === targetUser.id || (currentUserData.role === 'streamer' && uid === currentUserData.id)) {
                 const newItem = li.cloneNode(true);
                 privateChatLog.appendChild(newItem);
             }
        });
        setTimeout(() => privateChatLog.scrollTop = privateChatLog.scrollHeight, 0);
    }

    otherFansListContainer.innerHTML = '';
    const sameChannelFans = allUsers.filter(u => u.role === 'fan' && u.fanGroup === streamerConfig.fandom.id && u.id !== targetUser.id);
    
    if (sameChannelFans.length === 0) {
        otherFansListContainer.innerHTML = '<p style="color:#777; font-size:0.8rem; text-align:center;">다른 팬이 없습니다.</p>';
    }
    
    sameChannelFans.forEach(fan => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.padding = '0.5rem';
        div.style.backgroundColor = '#40444b';
        div.style.borderRadius = '5px';
        div.style.marginBottom = '0.5rem';
        div.style.cursor = 'pointer';
        
        div.innerHTML = `<img src="${getPfp(fan)}" style="width:30px;height:30px;border-radius:50%;margin-right:0.5rem;object-fit:cover;"> <span style="font-size:0.9rem;color:white;">${fan.nickname}</span>`;
        div.onclick = () => openPrivateGuessModal(fan, streamerId); 
        otherFansListContainer.appendChild(div);
    });

    privateGuessModal.classList.remove('hidden');
}

// UI 업데이트 및 기타 함수들...
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
    if (!gameConfig) return; 
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

function updateFrame02Height() {
    const container = document.getElementById('chat-container');
    if (container && frame02) {
        const rect = container.getBoundingClientRect();
        frame02.style.height = `${rect.bottom}px`;
    }
}

function showChatRoom() {
    mainMenu.classList.add('hidden'); profileSetup.classList.add('hidden');
    chatContainer.classList.remove('hidden'); document.body.classList.add('in-chat');
    
    if (frame02) frame02.classList.remove('hidden');
    
    chatContainer.className = 'multi-view-active';
    multiChatView.classList.remove('hidden');
    updateColumnUIVisibility(); updateRoundEndButtons();
    if (sortable) sortable.destroy();
    sortable = Sortable.create(multiChatView, { animation: 150, handle: '.chat-column-header', filter: '.volume-control-container, .settings-container' });
    initializeResizeHandles(); setupSettingsMenus();
    
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

createRoomBtn.addEventListener('click', () => { 
    userIntent = 'create'; 
    mainMenu.classList.add('hidden'); 
    profileSetup.classList.remove('hidden'); 
    document.getElementById('role-streamer').checked = true;
    document.getElementById('role-fan').style.display = 'none';
    document.querySelector('label[for="role-fan"]').style.display = 'none';
    updateProfileSetupUI(); 
});

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


// 모달 외부 클릭 시 닫기
const modals = [privateGuessModal, channelParticipantsModal, gameOverModal, confirmationModal];
modals.forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
            if (modal === privateGuessModal) privateGuessTargetUser = null;
        }
    });
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

// 라운드 종료 버튼 클릭 시 확인 모달 표시
document.querySelectorAll('.end-round-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isGameOver) {
            gameOverModal.classList.remove('hidden');
        } else {
            confirmationModal.classList.remove('hidden');
        }
    });
});

// 확인 모달 버튼 이벤트
confirmEndRoundBtn.addEventListener('click', () => {
    socket.emit('end round');
    confirmationModal.classList.add('hidden');
    document.querySelectorAll('.end-round-btn').forEach(b => b.disabled = true);
});

cancelEndRoundBtn.addEventListener('click', () => {
    confirmationModal.classList.add('hidden');
});


document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        modals.forEach(modal => modal.classList.add('hidden'));
        document.querySelectorAll('.settings-menu').forEach(menu => menu.classList.add('hidden'));
    }
});

document.addEventListener('mousemove', (e) => {
    if (!resizingColumn) return;
    
    const container = document.getElementById('chat-container');
    if (container) {
        const rect = container.getBoundingClientRect();
        const newHeight = e.clientY - rect.top;
        container.style.height = `${Math.max(300, newHeight)}px`;
        updateFrame02Height();
    }
});

document.addEventListener('mouseup', () => {
    if (resizingColumn) { resizingColumn = null; document.body.style.userSelect = ''; document.body.style.cursor = ''; }
});

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
// layout changed 이벤트는 무시하거나 기본 동작만 수행
socket.on('layout changed', ({ layout }) => { /* 기능 삭제됨 */ }); 
socket.on('round advanced', (newRound) => { currentRoundNumber = newRound; updateRoundEndButtons(); });
socket.on('user joined', (data) => { 
    playSound('join.MP3'); 
    allUsers = data.users; 
    updateUserList(data.users); 
    
    let targetStreamerId = null;
    if (data.user.role === 'streamer') {
        targetStreamerId = data.user.streamerId;
    } else {
        targetStreamerId = getStreamerIdByFanGroup(data.user.fanGroup);
    }
    addSystemMessage(data.user, '님이 입장했습니다.', targetStreamerId); 
});
socket.on('user left', (data) => { 
    playSound('leave.MP3'); 
    allUsers = data.users; 
    updateUserList(data.users); 
    const message = data.reason ? `님이 ${data.reason} 처리되었습니다.` : '님이 퇴장했습니다.'; 
    
    let targetStreamerId = null;
    if (data.user.role === 'streamer') {
        targetStreamerId = data.user.streamerId;
    } else {
        targetStreamerId = getStreamerIdByFanGroup(data.user.fanGroup);
    }
    addSystemMessage(data.user, message, targetStreamerId); 
});
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
socket.on('game message', (data) => {
    addGameMessage(data.message, data.type, data.chatGroupId);
    if (data.type === 'success') playSound('success.MP3');
    else if (data.type === 'reveal') playSound('reveal.MP3');
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
        const rankerDiv = document.createElement('div'); 
        rankerDiv.className = 'ranking-item';
        const streamerInfo = allUsers.find(u => u.streamerId === rankedStreamer.id);
        
        const rankClass = `rank-${rankedStreamer.rank <= 3 ? rankedStreamer.rank : 'other'}`;
        
        rankerDiv.innerHTML = `
            <span class="rank ${rankClass}">${rankedStreamer.rank}</span>
            <img src="${streamerInfo.pfp}" alt="${rankedStreamer.name}" class="ranking-pfp">
            <div class="ranking-text-group">
                <div class="name">${rankedStreamer.name}</div>
                <div class="round-info">${rankedStreamer.finishedInRound}라운드 완료</div>
            </div>
        `;
        gameOverBody.appendChild(rankerDiv);
        
        const groupDiv = document.createElement('div'); 
        groupDiv.className = 'fandom-identity-group';
        const streamerConfig = gameConfig.streamers.find(s => s.id === rankedStreamer.id);
        const fansOfStreamer = allUsers.filter(u => u.role === 'fan' && u.fanGroup === streamerConfig.fandom.id);
        
        fansOfStreamer.forEach(user => {
            const card = document.createElement('div'); 
            card.className = `identity-card`;
            
            const tier = streamerConfig.fandom.tiers.find(t => t.name === user.fanTier);
            const roleText = tier ? tier.name : "팬";
            
            let roleClass = '';
            if (user.actualRole === 'yasik') roleClass = 'yasik';
            else if (user.actualRole === 'superfan') roleClass = 'superfan';
            
            card.innerHTML = `
                <img src="${getPfp(user)}" alt="${user.nickname}">
                <p class="name">${user.nickname}</p>
                <p class="role ${roleClass}">${roleText}</p>
            `;
            groupDiv.appendChild(card);
        });
        gameOverBody.appendChild(groupDiv);
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