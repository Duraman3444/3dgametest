import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Store connected players
const players = {};

// Store collectible items state (global for all players)
const collectibleItems = {
    coins: new Set(), // Set of coin IDs that have been collected
    keys: new Set(),  // Set of key IDs that have been collected
    initialized: false
};

// Store lobby state
const lobbyState = {
    players: {}, // Players in lobby: { socketId: { id, color, ready, joinedAt } }
    gameState: 'lobby', // 'lobby', 'starting', 'in-game'
    hostId: null, // First player becomes host
    countdown: null, // Countdown timer for game start
    maxPlayers: 8,
    minPlayers: 1,
    startDelay: 5000, // 5 seconds delay before game starts
    lastUpdate: Date.now()
};

// Store voting state
const votingState = {
    active: false,
    type: null, // 'level-completion'
    options: [], // ['restart', 'continue']
    votes: {}, // { socketId: 'restart'/'continue' }
    timeout: null,
    duration: 30000, // 30 seconds voting time
    startTime: null,
    completedBy: null, // Who completed the level
    levelInfo: null
};

// Store current game session state
const gameSession = {
    currentLevel: {
        type: null, // 'json' or 'random'
        number: 1,
        name: null,
        index: null,
        coinCount: 0,
        initialized: false,
        lastInitializedBy: null,
        lastInitializedAt: null
    },
    collectibleItems: collectibleItems,
    playerCount: 0,
    sessionStartTime: Date.now(),
    lastStateUpdate: Date.now()
};

// Color palette for players
const playerColors = [
    { name: 'Red', hex: 0xff4444, css: '#ff4444' },
    { name: 'Blue', hex: 0x4444ff, css: '#4444ff' },
    { name: 'Green', hex: 0x44ff44, css: '#44ff44' },
    { name: 'Yellow', hex: 0xffff44, css: '#ffff44' },
    { name: 'Purple', hex: 0xff44ff, css: '#ff44ff' },
    { name: 'Orange', hex: 0xff8844, css: '#ff8844' },
    { name: 'Cyan', hex: 0x44ffff, css: '#44ffff' },
    { name: 'Pink', hex: 0xff8888, css: '#ff8888' },
    { name: 'Lime', hex: 0x88ff88, css: '#88ff88' },
    { name: 'Teal', hex: 0x44ff88, css: '#44ff88' },
    { name: 'Indigo', hex: 0x8844ff, css: '#8844ff' },
    { name: 'Coral', hex: 0xff4488, css: '#ff4488' }
];

// Track used colors to avoid duplicates
const usedColors = new Set();

// Function to assign a random color to a player
function assignPlayerColor() {
    // If all colors are used, reset and start over
    if (usedColors.size >= playerColors.length) {
        usedColors.clear();
    }
    
    // Find available colors
    const availableColors = playerColors.filter(color => !usedColors.has(color.name));
    
    // Pick a random available color
    const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];
    
    // Mark color as used
    usedColors.add(randomColor.name);
    
    return randomColor;
}

// Function to release a player's color when they disconnect
function releasePlayerColor(colorName) {
    usedColors.delete(colorName);
}

// Lobby management functions
function addPlayerToLobby(socketId, playerData) {
    const playerColor = assignPlayerColor();
    const lobbyPlayer = {
        id: socketId,
        color: playerColor,
        ready: false,
        joinedAt: Date.now(),
        ...playerData
    };
    
    lobbyState.players[socketId] = lobbyPlayer;
    
    // First player becomes host
    if (!lobbyState.hostId) {
        lobbyState.hostId = socketId;
        lobbyPlayer.isHost = true;
    }
    
    lobbyState.lastUpdate = Date.now();
    return lobbyPlayer;
}

function removePlayerFromLobby(socketId) {
    const player = lobbyState.players[socketId];
    if (!player) return null;
    
    delete lobbyState.players[socketId];
    
    // If host left, assign new host
    if (lobbyState.hostId === socketId) {
        const remainingPlayers = Object.keys(lobbyState.players);
        lobbyState.hostId = remainingPlayers.length > 0 ? remainingPlayers[0] : null;
        
        // Mark new host
        if (lobbyState.hostId) {
            lobbyState.players[lobbyState.hostId].isHost = true;
        }
    }
    
    // Release player color
    if (player.color) {
        releasePlayerColor(player.color.name);
    }
    
    // Cancel countdown if not enough players
    if (lobbyState.countdown && Object.keys(lobbyState.players).length < lobbyState.minPlayers) {
        clearTimeout(lobbyState.countdown);
        lobbyState.countdown = null;
        lobbyState.gameState = 'lobby';
    }
    
    lobbyState.lastUpdate = Date.now();
    return player;
}

function setPlayerReady(socketId, ready) {
    const player = lobbyState.players[socketId];
    if (!player) return false;
    
    player.ready = ready;
    lobbyState.lastUpdate = Date.now();
    return true;
}

function canStartGame() {
    const playerCount = Object.keys(lobbyState.players).length;
    const readyCount = Object.values(lobbyState.players).filter(p => p.ready).length;
    
    return playerCount >= lobbyState.minPlayers && 
           readyCount === playerCount && 
           lobbyState.gameState === 'lobby';
}

function startGameCountdown() {
    if (lobbyState.countdown) {
        clearTimeout(lobbyState.countdown);
    }
    
    lobbyState.gameState = 'starting';
    lobbyState.lastUpdate = Date.now();
    
    // Broadcast countdown start
    io.emit('gameStartCountdown', {
        delay: lobbyState.startDelay,
        playerCount: Object.keys(lobbyState.players).length
    });
    
    lobbyState.countdown = setTimeout(() => {
        startGame();
    }, lobbyState.startDelay);
}

function startGame() {
    lobbyState.gameState = 'in-game';
    lobbyState.countdown = null;
    lobbyState.lastUpdate = Date.now();
    
    // Move lobby players to game session
    Object.values(lobbyState.players).forEach(player => {
        players[player.id] = {
            id: player.id,
            color: player.color,
            position: { x: 0, y: 0.55, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            gridPosition: { x: 5, z: 5 },
            isMoving: false
        };
    });
    
    gameSession.playerCount = Object.keys(players).length;
    gameSession.lastStateUpdate = Date.now();
    
    // Reset game state for new game
    collectibleItems.coins.clear();
    collectibleItems.keys.clear();
    collectibleItems.initialized = false;
    
    // Broadcast game start
    io.emit('gameStarted', {
        players: players,
        gameSession: gameSession
    });
    
    console.log(`Game started with ${gameSession.playerCount} players`);
}

function getLobbySnapshot() {
    return {
        players: lobbyState.players,
        gameState: lobbyState.gameState,
        hostId: lobbyState.hostId,
        playerCount: Object.keys(lobbyState.players).length,
        maxPlayers: lobbyState.maxPlayers,
        minPlayers: lobbyState.minPlayers,
        lastUpdate: lobbyState.lastUpdate
    };
}

// Voting management functions
function startVoting(type, options, completedBy, levelInfo) {
    // Don't start voting if already active
    if (votingState.active) {
        return false;
    }
    
    // Reset voting state
    votingState.active = true;
    votingState.type = type;
    votingState.options = options;
    votingState.votes = {};
    votingState.startTime = Date.now();
    votingState.completedBy = completedBy;
    votingState.levelInfo = levelInfo;
    
    // Clear any existing timeout
    if (votingState.timeout) {
        clearTimeout(votingState.timeout);
    }
    
    // Set timeout for voting
    votingState.timeout = setTimeout(() => {
        endVoting();
    }, votingState.duration);
    
    // Broadcast voting start to all players
    io.emit('votingStarted', {
        type: votingState.type,
        options: votingState.options,
        duration: votingState.duration,
        completedBy: votingState.completedBy,
        levelInfo: votingState.levelInfo
    });
    
    console.log(`Voting started: ${type} by ${completedBy} for ${votingState.duration}ms`);
    return true;
}

function castVote(socketId, vote) {
    if (!votingState.active) {
        return false;
    }
    
    if (!votingState.options.includes(vote)) {
        return false;
    }
    
    // Check if player is in game
    if (!players[socketId]) {
        return false;
    }
    
    votingState.votes[socketId] = vote;
    
    // Broadcast vote update
    io.emit('voteUpdate', {
        playerId: socketId,
        vote: vote,
        voteCounts: getVoteCounts()
    });
    
    console.log(`Player ${socketId} voted: ${vote}`);
    
    // Check if all players have voted
    const totalPlayers = Object.keys(players).length;
    const totalVotes = Object.keys(votingState.votes).length;
    
    if (totalVotes >= totalPlayers) {
        // All players voted, end voting immediately
        endVoting();
    }
    
    return true;
}

function getVoteCounts() {
    const counts = {};
    votingState.options.forEach(option => {
        counts[option] = 0;
    });
    
    Object.values(votingState.votes).forEach(vote => {
        counts[vote]++;
    });
    
    return counts;
}

function endVoting() {
    if (!votingState.active) {
        return;
    }
    
    // Clear timeout
    if (votingState.timeout) {
        clearTimeout(votingState.timeout);
        votingState.timeout = null;
    }
    
    // Calculate results
    const voteCounts = getVoteCounts();
    const totalVotes = Object.keys(votingState.votes).length;
    
    // Determine winner (most votes, or default to continue on tie)
    let winner = 'continue';
    let maxVotes = 0;
    
    Object.entries(voteCounts).forEach(([option, count]) => {
        if (count > maxVotes) {
            maxVotes = count;
            winner = option;
        }
    });
    
    // If no votes cast, default to continue
    if (totalVotes === 0) {
        winner = 'continue';
    }
    
    // Execute the decision
    executeVotingDecision(winner, voteCounts, totalVotes);
    
    // Reset voting state
    votingState.active = false;
    votingState.type = null;
    votingState.options = [];
    votingState.votes = {};
    votingState.completedBy = null;
    votingState.levelInfo = null;
    
    console.log(`Voting ended: ${winner} won with ${maxVotes}/${totalVotes} votes`);
}

function executeVotingDecision(decision, voteCounts, totalVotes) {
    // Broadcast results
    io.emit('votingEnded', {
        decision: decision,
        voteCounts: voteCounts,
        totalVotes: totalVotes
    });
    
    // Execute the decision
    setTimeout(() => {
        if (decision === 'restart') {
            // Restart current level
            restartCurrentLevel();
        } else {
            // Continue to next level
            continueToNextLevel();
        }
    }, 2000); // 2 second delay to show results
}

function restartCurrentLevel() {
    // Reset game state
    collectibleItems.coins.clear();
    collectibleItems.keys.clear();
    collectibleItems.initialized = false;
    
    // Reset player positions
    Object.values(players).forEach(player => {
        player.position = { x: 0, y: 0.55, z: 0 };
        player.rotation = { x: 0, y: 0, z: 0 };
        player.gridPosition = { x: 5, z: 5 };
        player.isMoving = false;
    });
    
    // Broadcast level restart
    io.emit('levelRestarted', {
        players: players,
        gameSession: gameSession
    });
    
    console.log('Level restarted by voting decision');
}

function continueToNextLevel() {
    // This will be handled by the clients - they'll proceed to next level
    io.emit('continueToNextLevel', {
        gameSession: gameSession
    });
    
    console.log('Continuing to next level by voting decision');
}

function getVotingSnapshot() {
    return {
        active: votingState.active,
        type: votingState.type,
        options: votingState.options,
        votes: votingState.votes,
        voteCounts: votingState.active ? getVoteCounts() : {},
        timeRemaining: votingState.active ? Math.max(0, votingState.duration - (Date.now() - votingState.startTime)) : 0,
        completedBy: votingState.completedBy,
        levelInfo: votingState.levelInfo
    };
}

// Handle socket connections
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Handle player join
    socket.on('playerJoin', (playerData) => {
        console.log(`Player attempting to join: ${socket.id}`);
        
        // Check if game is in progress
        if (lobbyState.gameState === 'in-game') {
            // If game is in progress, join directly (reconnection case)
            const playerColor = assignPlayerColor();
            playerData.color = playerColor;
            players[socket.id] = playerData;
            gameSession.playerCount = Object.keys(players).length;
            
            // Send game state to reconnecting player
            socket.emit('gameStateSnapshot', {
                collectibleItems: {
                    collectedCoins: Array.from(collectibleItems.coins),
                    collectedKeys: Array.from(collectibleItems.keys),
                    initialized: collectibleItems.initialized
                },
                currentLevel: gameSession.currentLevel,
                playerCount: gameSession.playerCount,
                sessionStartTime: gameSession.sessionStartTime,
                lastStateUpdate: gameSession.lastStateUpdate,
                voting: getVotingSnapshot()
            });
            
            socket.emit('playersSnapshot', players);
            socket.broadcast.emit('playerJoined', playerData);
            
            console.log(`Player joined ongoing game: ${socket.id} with color ${playerColor.name}`);
        } else {
            // Add player to lobby
            const lobbyPlayer = addPlayerToLobby(socket.id, playerData);
            
            // Send lobby state to new player
            socket.emit('lobbySnapshot', getLobbySnapshot());
            
            // Notify all other players about new lobby player
            socket.broadcast.emit('playerJoinedLobby', lobbyPlayer);
            
            console.log(`Player joined lobby: ${socket.id} with color ${lobbyPlayer.color.name} (${Object.keys(lobbyState.players).length}/${lobbyState.maxPlayers})`);
        }
    });
    
    // Handle player ready/unready in lobby
    socket.on('playerReady', (ready) => {
        if (lobbyState.gameState !== 'lobby') return;
        
        if (setPlayerReady(socket.id, ready)) {
            // Broadcast ready state change
            socket.broadcast.emit('playerReadyChanged', {
                playerId: socket.id,
                ready: ready
            });
            
            console.log(`Player ${socket.id} ${ready ? 'ready' : 'not ready'}`);
            
            // Check if all players are ready and can start game
            if (canStartGame()) {
                startGameCountdown();
            }
        }
    });
    
    // Handle host starting game manually
    socket.on('startGame', () => {
        if (socket.id !== lobbyState.hostId) {
            console.log(`Non-host ${socket.id} attempted to start game`);
            return;
        }
        
        const playerCount = Object.keys(lobbyState.players).length;
        if (playerCount >= lobbyState.minPlayers && lobbyState.gameState === 'lobby') {
            // Force all players to ready and start
            Object.values(lobbyState.players).forEach(player => {
                player.ready = true;
            });
            
            startGameCountdown();
            console.log(`Host ${socket.id} started game with ${playerCount} players`);
        }
    });

    // Handle player position updates
    socket.on('playerUpdate', (playerData) => {
        if (players[socket.id]) {
            players[socket.id] = playerData;
            
            // Broadcast updated position to all other players
            socket.broadcast.emit('playerUpdate', playerData);
        }
    });

    // Handle player disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        
        // Check if player was in lobby
        if (lobbyState.players[socket.id]) {
            const removedPlayer = removePlayerFromLobby(socket.id);
            
            // Notify remaining lobby players
            socket.broadcast.emit('playerLeftLobby', {
                playerId: socket.id,
                remainingPlayers: Object.keys(lobbyState.players).length,
                newHost: lobbyState.hostId
            });
            
            console.log(`Player left lobby: ${socket.id}, ${Object.keys(lobbyState.players).length} players remaining`);
            
            // If lobby is empty, reset to initial state
            if (Object.keys(lobbyState.players).length === 0) {
                lobbyState.gameState = 'lobby';
                lobbyState.hostId = null;
                if (lobbyState.countdown) {
                    clearTimeout(lobbyState.countdown);
                    lobbyState.countdown = null;
                }
                console.log('Lobby reset - no players remaining');
            }
        }
        
        // Check if player was in game
        if (players[socket.id]) {
            // Release the player's color if they had one
            if (players[socket.id].color) {
                releasePlayerColor(players[socket.id].color.name);
            }
            
            // Remove player from players object
            delete players[socket.id];
            
            // Remove from voting if active
            if (votingState.active && votingState.votes[socket.id]) {
                delete votingState.votes[socket.id];
                
                // Broadcast updated vote counts
                io.emit('voteUpdate', {
                    playerId: socket.id,
                    vote: null,
                    voteCounts: getVoteCounts()
                });
                
                // Check if all remaining players have voted
                const totalPlayers = Object.keys(players).length;
                const totalVotes = Object.keys(votingState.votes).length;
                
                if (totalVotes >= totalPlayers && totalPlayers > 0) {
                    endVoting();
                }
            }
            
            // Update player count
            gameSession.playerCount = Object.keys(players).length;
            
            // Notify all other players about player leaving
            socket.broadcast.emit('playerLeft', {
                playerId: socket.id,
                remainingPlayers: gameSession.playerCount
            });
            
            console.log(`Player left game: ${socket.id}, ${gameSession.playerCount} players remaining`);
            
            // If no players left in game, reset to lobby
            if (gameSession.playerCount === 0) {
                lobbyState.gameState = 'lobby';
                collectibleItems.coins.clear();
                collectibleItems.keys.clear();
                collectibleItems.initialized = false;
                
                // Cancel any active voting
                if (votingState.active) {
                    if (votingState.timeout) {
                        clearTimeout(votingState.timeout);
                    }
                    votingState.active = false;
                    votingState.votes = {};
                }
                
                console.log('Game reset - no players remaining');
            }
        }
        
        // Note: We intentionally keep the game state (collectibles, level info) 
        // so disconnected players can rejoin and see the current state
    });

    // Handle collectible item collection
    socket.on('collectItem', (itemData) => {
        const { itemType, itemId } = itemData;
        console.log(`Player ${socket.id} collected ${itemType} with ID: ${itemId}`);
        
        // Check if item was already collected
        if (collectibleItems[itemType + 's'].has(itemId)) {
            console.log(`Item ${itemId} already collected, ignoring duplicate`);
            return;
        }
        
        // Mark item as collected
        collectibleItems[itemType + 's'].add(itemId);
        
        // Update session timestamp
        gameSession.lastStateUpdate = Date.now();
        
        // Broadcast collection to all players
        io.emit('itemCollected', {
            itemType,
            itemId,
            collectedBy: socket.id,
            timestamp: gameSession.lastStateUpdate
        });
        
        console.log(`Broadcasted ${itemType} collection: ${itemId} by ${socket.id}`);
        console.log(`Current state: ${collectibleItems.coins.size} coins, ${collectibleItems.keys.size} keys collected`);
    });
    
    // Handle level initialization - reset collectible items
    socket.on('initializeLevel', (levelData) => {
        // Only allow level initialization if game is in progress
        if (lobbyState.gameState !== 'in-game') {
            console.log(`Player ${socket.id} attempted to initialize level but game is not in progress`);
            return;
        }
        
        console.log(`Player ${socket.id} initialized level:`, levelData);
        
        // Update game session level state
        gameSession.currentLevel = {
            type: levelData.levelType,
            number: levelData.levelNumber,
            name: levelData.levelName || `Level ${levelData.levelNumber}`,
            index: levelData.levelIndex || null,
            coinCount: levelData.coinCount || 0,
            initialized: true,
            lastInitializedBy: socket.id,
            lastInitializedAt: Date.now()
        };
        
        // Reset collectible items state
        collectibleItems.coins.clear();
        collectibleItems.keys.clear();
        collectibleItems.initialized = true;
        
        // Update session timestamp
        gameSession.lastStateUpdate = Date.now();
        
        // Broadcast level initialization to all players
        socket.broadcast.emit('levelInitialized', {
            initializedBy: socket.id,
            levelData,
            gameSession: {
                currentLevel: gameSession.currentLevel,
                collectibleItems: {
                    collectedCoins: Array.from(collectibleItems.coins),
                    collectedKeys: Array.from(collectibleItems.keys),
                    initialized: collectibleItems.initialized
                }
            }
        });
        
        console.log(`Game session updated: Level ${gameSession.currentLevel.number} (${gameSession.currentLevel.type}) initialized by ${socket.id}`);
    });
    
    // Handle return to lobby
    socket.on('returnToLobby', () => {
        console.log(`Player ${socket.id} wants to return to lobby`);
        
        // Remove from game session
        if (players[socket.id]) {
            delete players[socket.id];
            gameSession.playerCount = Object.keys(players).length;
        }
        
        // Add to lobby
        const lobbyPlayer = addPlayerToLobby(socket.id, {
            position: { x: 0, y: 0.55, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            gridPosition: { x: 5, z: 5 },
            isMoving: false
        });
        
        // Send lobby state to player
        socket.emit('lobbySnapshot', getLobbySnapshot());
        
        // Notify others
        socket.broadcast.emit('playerJoinedLobby', lobbyPlayer);
        socket.broadcast.emit('playerLeft', {
            playerId: socket.id,
            remainingPlayers: gameSession.playerCount
        });
        
        // If no players left in game, reset to lobby
        if (gameSession.playerCount === 0) {
            lobbyState.gameState = 'lobby';
            collectibleItems.coins.clear();
            collectibleItems.keys.clear();
            collectibleItems.initialized = false;
            console.log('Game reset - all players returned to lobby');
        }
    });
    
    // Handle level completion voting
    socket.on('levelCompleted', (levelData) => {
        console.log(`Player ${socket.id} completed level:`, levelData);
        
        // Only start voting if game is in progress and no voting is active
        if (lobbyState.gameState === 'in-game' && !votingState.active) {
            startVoting('level-completion', ['restart', 'continue'], socket.id, levelData);
        }
    });
    
    // Handle voting
    socket.on('castVote', (voteData) => {
        const { vote } = voteData;
        console.log(`Player ${socket.id} cast vote: ${vote}`);
        
        if (castVote(socket.id, vote)) {
            console.log(`Vote accepted from ${socket.id}: ${vote}`);
        } else {
            console.log(`Vote rejected from ${socket.id}: ${vote}`);
        }
    });
    
    // Handle voting snapshot request
    socket.on('getVotingSnapshot', () => {
        socket.emit('votingSnapshot', getVotingSnapshot());
    });
    
    // Handle game events (optional)
    socket.on('gameEvent', (eventData) => {
        console.log('Game event:', eventData);
        // Broadcast game events to all players
        io.emit('gameUpdate', eventData);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Socket.io server running on port ${PORT}`);
    console.log('Waiting for players to connect...');
}); 