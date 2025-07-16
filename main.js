import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { io } from 'socket.io-client';
import soundManager from './src/systems/soundManager.js';

// Game configuration
let gameConfig = null;

// Load configuration from config.json
async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status}`);
        }
        gameConfig = await response.json();
        console.log('Game configuration loaded:', gameConfig);
        return gameConfig;
    } catch (error) {
        console.error('Error loading config:', error);
        // Fallback to default values
        gameConfig = {
            gameplay: {
                tileSize: 2,
                gridSize: 10,
                moveDuration: 0.3,
                rotationDuration: 1500,
                gravityShiftSpeed: 1.5,
                maxLives: 3,
                bounceDuration: 1.5,
                bounceHeight: 4
            },
            camera: {
                smoothness: 0.1,
                fov: 75,
                near: 0.1,
                far: 1000,
                defaultOffset: { x: 0, y: 4, z: 6 },
                defaultTarget: { x: 0, y: 1, z: 0 }
            },
            physics: {
                collisionDistance: 0.8,
                teleportDistance: 0.7,
                trapDistance: 0.6,
                platformDistance: 0.5
            },
            visual: {
                animationSpeed: 2,
                particleCount: 30,
                particleSize: 0.1,
                shadowMapSize: 2048,
                wallHeight: 0.5,
                wallThickness: 0.1,
                coinFloatHeight: 0.1,
                coinFloatSpeed: 2,
                keyFloatHeight: 0.15,
                keyFloatSpeed: 3,
                goalPulseSpeed: 6,
                goalPulseAmount: 0.1
            },
            audio: {
                masterVolume: 0.7,
                sfxVolume: 0.8,
                musicVolume: 0.5,
                soundEnabled: true,
                musicEnabled: true
            }
        };
        return gameConfig;
    }
}

// Helper function to get config value with fallback
function getConfigValue(path, fallback) {
    const keys = path.split('.');
    let value = gameConfig;
    
    for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
            value = value[key];
        } else {
            return fallback;
        }
    }
    
    return value;
}

// Function to reload configuration during gameplay
async function reloadConfig() {
    console.log('Reloading game configuration...');
    const oldConfig = gameConfig;
    
    try {
        await loadConfig();
        
        // Update systems with new config values
        initializeTileSettings();
        initializeMovementSettings();
        initializeCameraSystem();
        soundManager.updateFromConfig(gameConfig);
        
        // Show success message
        showMessage('Configuration reloaded successfully!', '#00ff00', 2000);
        
        console.log('Configuration reloaded successfully');
        return true;
    } catch (error) {
        console.error('Failed to reload configuration:', error);
        gameConfig = oldConfig; // Restore old config
        showMessage('Failed to reload configuration', '#ff0000', 2000);
        return false;
    }
}

// Socket.io connection
const socket = io('http://localhost:3001', {
    autoConnect: false // Don't auto-connect, we'll connect manually
});

// Scene setup
const scene = new THREE.Scene();
let camera, renderer;

// Initialize camera and renderer after config is loaded
function initializeRenderer() {
    const fov = getConfigValue('camera.fov', 75);
    const near = getConfigValue('camera.near', 0.1);
    const far = getConfigValue('camera.far', 1000);
    const antialiasing = getConfigValue('performance.antialiasing', true);
    
    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far);
    renderer = new THREE.WebGLRenderer({ antialias: antialiasing });
}

// Initialize renderer settings after config is loaded
function initializeRendererSettings() {
    const enableShadows = getConfigValue('performance.enableShadows', true);
    const shadowMapSize = getConfigValue('visual.shadowMapSize', 2048);
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000);
    
    if (enableShadows) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    document.body.appendChild(renderer.domElement);
}

// Create groups for different elements (moved here to fix initialization order)
const worldGroup = new THREE.Group(); // Contains floor, walls, cube, player
const lightGroup = new THREE.Group(); // Contains lights that should rotate with world
const cameraGroup = new THREE.Group(); // Contains camera positioning
scene.add(worldGroup);
scene.add(lightGroup);
scene.add(cameraGroup);

// Enhanced lighting setup
const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
scene.add(ambientLight); // Ambient light doesn't need to rotate

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
directionalLight.shadow.bias = -0.001;
lightGroup.add(directionalLight); // Add to light group for rotation

// Optional: Add point light for more dynamic lighting
const pointLight = new THREE.PointLight(0x00ff00, 0.5, 10);
pointLight.position.set(2, 3, 2);
pointLight.castShadow = true;
lightGroup.add(pointLight); // Add to light group for rotation

// Create a cube
const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
const cubeMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x00ff00,
    transparent: true,
    opacity: 0.8
});
const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
cube.castShadow = true;
cube.position.set(0, 1, 0);
worldGroup.add(cube);

// Create player sphere (local player is red)
const playerGeometry = new THREE.SphereGeometry(0.5, 16, 16);
const playerMaterial = new THREE.MeshLambertMaterial({ 
    color: 0xff4444, // Red color for local player
    transparent: true,
    opacity: 0.9
});
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.castShadow = true;
player.position.set(0, 0.55, 0); // Slightly above the tiles
worldGroup.add(player);

// Add name tag for local player (will be added after createPlayerNameTag is defined)
let localPlayerNameTag = null;

// Create collectible coins
const coins = [];
const coinGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8);
const coinMaterial = new THREE.MeshLambertMaterial({ 
    color: 0xffd700,
    emissive: 0x444400,
    transparent: true,
    opacity: 0.9
});

// Function to create a coin at a specific grid position
function createCoin(gridX, gridZ) {
    const coin = new THREE.Mesh(coinGeometry, coinMaterial);
    coin.position.copy(gridToWorld(gridX, gridZ));
    coin.position.y = 1.2; // Float above the tiles
    coin.rotation.x = Math.PI / 2; // Rotate to lay flat
    coin.castShadow = true;
    coin.receiveShadow = true;
    
    // Store grid position for collision detection
    coin.gridX = gridX;
    coin.gridZ = gridZ;
    
    // Generate unique ID for multiplayer sync
    coin.id = `coin_${gridX}_${gridZ}`;
    
    // Add floating animation
    coin.userData = {
        originalY: coin.position.y,
        animationOffset: Math.random() * Math.PI * 2
    };
    
    worldGroup.add(coin);
    coins.push(coin);
    
    return coin;
}

// Function to spawn coins randomly on the grid
function spawnCoins(count = 15) {
    // Clear existing coins
    clearAllCoins();
    
    const occupiedPositions = new Set();
    // Don't spawn coin at player starting position
    occupiedPositions.add(`${playerState.gridX},${playerState.gridZ}`);
    
    for (let i = 0; i < count; i++) {
        let gridX, gridZ;
        let attempts = 0;
        
        // Find an unoccupied position
        do {
            gridX = Math.floor(Math.random() * gridSize);
            gridZ = Math.floor(Math.random() * gridSize);
            attempts++;
        } while (occupiedPositions.has(`${gridX},${gridZ}`) && attempts < 100);
        
        if (attempts < 100) {
            occupiedPositions.add(`${gridX},${gridZ}`);
            createCoin(gridX, gridZ);
        }
    }
    
    gameScore.totalCoins = coins.length;
    updateScoreDisplay();
}

// Function to clear all coins
function clearAllCoins() {
    coins.forEach(coin => {
        worldGroup.remove(coin);
    });
    coins.length = 0;
}

// Function to collect a coin
function collectCoin(coin) {
    const index = coins.indexOf(coin);
    if (index > -1) {
        // Send collection event to server for multiplayer sync
        if (multiplayerState.isConnected && coin.id) {
            socket.emit('collectItem', {
                itemType: 'coin',
                itemId: coin.id
            });
        }
        
        // Remove from scene
        worldGroup.remove(coin);
        coins.splice(index, 1);
        
        // Update score
        gameScore.coins++;
        updateScoreDisplay({ animateCoins: true });
        
        // Track coin collection for statistics and achievements
        trackCoinCollection();
        
        // Play coin pickup sound effect
        soundManager.play('coin');
        
        // Show collection effect
        showCoinCollectionEffect(coin.position);
        
        // Check if all coins collected
        if (coins.length === 0) {
            showAllCoinsCollectedMessage();
        }
    }
}

// Function to show coin collection effect
function showCoinCollectionEffect(position) {
    // Create temporary visual effect
    const effectGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const effectMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffd700,
        transparent: true,
        opacity: 0.8
    });
    const effect = new THREE.Mesh(effectGeometry, effectMaterial);
    effect.position.copy(position);
    worldGroup.add(effect);
    
    // Animate effect
    const startTime = Date.now();
    const animateEffect = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / 500; // 0.5 second animation
        
        if (progress < 1) {
            effect.scale.setScalar(1 + progress * 2);
            effect.material.opacity = 0.8 * (1 - progress);
            requestAnimationFrame(animateEffect);
        } else {
            worldGroup.remove(effect);
        }
    };
    animateEffect();
}

// Function to show collection effect when other players collect items
function showOtherPlayerCollectionEffect(position, itemType) {
    // Create temporary visual effect with different color for other players
    const effectGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const color = itemType === 'coin' ? 0xffd700 : 0xff6600; // Gold for coins, orange for keys
    const effectMaterial = new THREE.MeshBasicMaterial({ 
        color: color,
        transparent: true,
        opacity: 0.6
    });
    const effect = new THREE.Mesh(effectGeometry, effectMaterial);
    effect.position.copy(position);
    worldGroup.add(effect);
    
    // Add pulsing effect to indicate it was collected by another player
    const startTime = Date.now();
    const animateEffect = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / 800; // 0.8 second animation
        
        if (progress < 1) {
            // Pulsing animation
            const scale = 1 + Math.sin(progress * Math.PI * 4) * 0.3;
            effect.scale.setScalar(scale);
            effect.material.opacity = 0.6 * (1 - progress);
            requestAnimationFrame(animateEffect);
        } else {
            worldGroup.remove(effect);
        }
    };
    animateEffect();
}

// Function to show all coins collected message
function showAllCoinsCollectedMessage() {
    showMessage('All coins collected! Great job!', '#ffd700', 3000);
}

// Function to update score display
function updateScoreDisplay(options = {}) {
    // Update level name
    const levelNameElement = document.getElementById('level-name');
    if (levelNameElement) {
        const oldLevelName = levelNameElement.textContent;
        let levelName = `Level ${gameScore.currentLevel}`;
        if (useJsonLevels && jsonLevels[currentJsonLevelIndex]) {
            levelName = jsonLevels[currentJsonLevelIndex].name;
        }
        
        if (oldLevelName !== levelName) {
            levelNameElement.textContent = levelName;
            if (options.animateLevelChange) {
                animateLevelChange();
            }
        }
    }
    
    // Update score with animation
    const scoreElement = document.getElementById('score-count');
    if (scoreElement) {
        const oldScore = parseInt(scoreElement.textContent.replace(/,/g, '')) || 0;
        const newScore = gameScore.totalScore;
        
        if (newScore !== oldScore) {
            if (options.animateScore !== false && newScore > oldScore) {
                animateScoreIncrease(newScore, oldScore);
                animateNumber('score-count', oldScore, newScore, 800);
            } else {
                scoreElement.textContent = newScore.toLocaleString();
            }
        }
    }
    
    // Update lives with animation
    const livesElement = document.getElementById('lives-count');
    if (livesElement) {
        const oldLives = parseInt(livesElement.textContent) || 0;
        const newLives = gameScore.lives;
        
        if (newLives !== oldLives) {
            livesElement.textContent = newLives;
            
            if (options.animateLives !== false && newLives < oldLives) {
                animateLivesDecrease();
            }
        }
        
        // Add visual feedback for low lives
        if (gameScore.lives <= 1) {
            livesElement.style.color = '#ff0000';
            livesElement.style.animation = 'glow 1s infinite';
        } else if (gameScore.lives <= 2) {
            livesElement.style.color = '#ff6600';
            livesElement.style.animation = 'none';
        } else {
            livesElement.style.color = '#ff4444';
            livesElement.style.animation = 'none';
        }
    }
    
    // Update coins with animation
    const coinsCountElement = document.getElementById('coins-count');
    const coinsTotalElement = document.getElementById('coins-total');
    if (coinsCountElement) {
        const oldValue = parseInt(coinsCountElement.textContent) || 0;
        const newValue = gameScore.coins;
        
        if (newValue !== oldValue) {
            if (options.animateCoins !== false && newValue > oldValue) {
                animateCoinCollection(newValue, oldValue);
                animateNumber('coins-count', oldValue, newValue, 400);
            } else {
                coinsCountElement.textContent = newValue;
            }
        }
    }
    
    if (coinsTotalElement) {
        const oldTotal = parseInt(coinsTotalElement.textContent) || 0;
        const newTotal = gameScore.totalCoins;
        
        if (newTotal !== oldTotal) {
            if (options.animateCoins !== false) {
                animateNumber('coins-total', oldTotal, newTotal, 600);
            } else {
                coinsTotalElement.textContent = newTotal;
            }
        }
    }
    
    // Update key status with animation
    const keyStatusElement = document.getElementById('key-status');
    if (keyStatusElement) {
        const oldKeyStatus = keyStatusElement.textContent;
        const newKeyStatus = gameScore.hasKey ? '✓' : '✗';
        
        if (oldKeyStatus !== newKeyStatus) {
            keyStatusElement.textContent = newKeyStatus;
            
            if (gameScore.hasKey) {
                keyStatusElement.classList.add('has-key');
                if (options.animateKey !== false) {
                    animateKeyCollection();
                }
            } else {
                keyStatusElement.classList.remove('has-key');
            }
        }
    }
}

// Function to animate coins (floating effect)
function animateCoins() {
    const time = Date.now() * 0.001;
    coins.forEach(coin => {
        if (coin.userData) {
            const floatHeight = getConfigValue('visual.coinFloatHeight', 0.1);
        const floatSpeed = getConfigValue('visual.coinFloatSpeed', 2);
        coin.position.y = coin.userData.originalY + Math.sin(time * floatSpeed + coin.userData.animationOffset) * floatHeight;
            coin.rotation.z += 0.02; // Slow rotation
        }
    });
}

// Function to check coin collection
function checkCoinCollection() {
    const playerPos = player.position;
    const collectDistance = getConfigValue('physics.collisionDistance', 0.8);
    
    for (let i = coins.length - 1; i >= 0; i--) {
        const coin = coins[i];
        const distance = playerPos.distanceTo(coin.position);
        
        if (distance < collectDistance) {
            collectCoin(coin);
        }
    }
}

// Key and Goal System
let gameKey = null;
let goalTile = null;

// Spike Trap System
const spikeTraps = [];
let playerStartPosition = { gridX: 5, gridZ: 5 };

// Teleport System
const teleportTiles = [];

// Bouncing Platform System
const bouncingPlatforms = [];

// JSON Level System
const jsonLevels = [];
let currentJsonLevelIndex = 0;
let useJsonLevels = false;
let levelDataLoaded = false;

// JSON Level Schema Documentation
const levelSchema = {
    // Level structure:
    // {
    //     "name": "Level Name",
    //     "number": 1,
    //     "gridSize": 10,
    //     "playerStart": { "x": 5, "z": 5 },
    //     "tiles": "auto", // "auto" for checkerboard or custom tile array
    //     "objects": [
    //         { "type": "coin", "x": 3, "z": 3 },
    //         { "type": "key", "x": 7, "z": 7 },
    //         { "type": "goal", "x": 9, "z": 9 },
    //         { "type": "spikeTrap", "x": 4, "z": 6 },
    //         { "type": "teleporter", "x": 2, "z": 2, "pairId": 1, "destination": { "x": 8, "z": 8 } },
    //         { "type": "bouncingPlatform", "x": 5, "z": 3 }
    //     ],
    //     "gravityAnchors": [
    //         { "x": 0, "z": 5, "direction": "left" },
    //         { "x": 9, "z": 5, "direction": "right" },
    //         { "x": 5, "z": 0, "direction": "forward" },
    //         { "x": 5, "z": 9, "direction": "backward" }
    //     ]
    // }
};

// Load level data from JSON file
async function loadLevelData(levelFile = 'levels.json') {
    try {
        console.log(`Loading level data from ${levelFile}...`);
        const response = await fetch(levelFile);
        
        if (!response.ok) {
            throw new Error(`Failed to load ${levelFile}: ${response.status} ${response.statusText}`);
        }
        
        const levelData = await response.json();
        
        // Validate level data structure
        if (!Array.isArray(levelData)) {
            throw new Error('Level data must be an array of level objects');
        }
        
        // Clear existing levels and load new ones
        jsonLevels.length = 0;
        jsonLevels.push(...levelData);
        
        console.log(`Successfully loaded ${jsonLevels.length} levels from ${levelFile}`);
        levelDataLoaded = true;
        
        // Show loading success message
        showMessage(`Loaded ${jsonLevels.length} levels from ${levelFile}`, '#00ff00');
        
        return true;
        
    } catch (error) {
        console.error('Error loading level data:', error);
        levelDataLoaded = false;
        
        // Show error message
        showMessage(`Failed to load level data: ${error.message}`, '#ff6666');
        
        return false;
    }
}

// Initialize JSON levels
async function initializeJsonLevels() {
    const success = await loadLevelData();
    
    if (success && jsonLevels.length > 0) {
        // Automatically switch to JSON mode if levels loaded successfully
        useJsonLevels = true;
        console.log(`Initialized with ${jsonLevels.length} JSON levels - switching to JSON mode`);
        
        // Show mode switch message
        showMessage('JSON level mode activated - Press ESC for level menu', '#00ccff');
    } else {
        // Fall back to random generation
        useJsonLevels = false;
        console.log('Falling back to random level generation');
        
        // Show fallback message
        showMessage('Using random level generation', '#ffaa00');
    }
}

// Function to load level from JSON
function loadJsonLevel(levelIndex) {
    if (levelIndex >= jsonLevels.length) {
        console.log("No more JSON levels, switching to random generation");
        useJsonLevels = false;
        return false;
    }
    
    const level = jsonLevels[levelIndex];
    console.log(`Loading JSON level: ${level.name} (${level.number})`);
    
    // Clear existing level
    clearAllCoins();
    clearSpikeTraps();
    clearTeleportTiles();
    clearAllBouncingPlatforms();
    
    // Update game state
    gameScore.currentLevel = level.number;
    
    // Set player start position
    playerStartPosition.gridX = level.playerStart.x;
    playerStartPosition.gridZ = level.playerStart.z;
    playerState.gridX = level.playerStart.x;
    playerState.gridZ = level.playerStart.z;
    
    // Reset player position
    const startPos = gridToWorld(level.playerStart.x, level.playerStart.z);
    player.position.copy(startPos);
    player.position.y = 0.55;
    
    // Reset player rotation
    playerState.baseRotation.x = 0;
    playerState.baseRotation.z = 0;
    player.rotation.x = 0;
    player.rotation.y = 0;
    player.rotation.z = 0;
    
    // Load tiles (for now, we'll use auto-generated checkerboard)
    // In the future, this could support custom tile patterns
    
    // Load objects
    level.objects.forEach(obj => {
        switch(obj.type) {
            case 'coin':
                createCoin(obj.x, obj.z);
                break;
            case 'key':
                createKeyAt(obj.x, obj.z);
                break;
            case 'goal':
                createGoalAt(obj.x, obj.z);
                break;
            case 'spikeTrap':
                createSpikeTrap(obj.x, obj.z);
                break;
            case 'teleporter':
                createTeleportTileAt(obj.x, obj.z, obj.pairId, obj.destination);
                break;
            case 'bouncingPlatform':
                createBouncingPlatform(obj.x, obj.z);
                break;
        }
    });
    
    // Link teleporter pairs
    linkTeleporterPairs();
    
    // Update UI
    gameScore.totalCoins = coins.length;
    updateScoreDisplay();
    updatePlayerPosition();
    
    // Show level start message
    showMessage(`Level ${level.number}: ${level.name}`, '#00ccff', 3000);
    
    // Update level info display
    updateLevelInfo();
    
    // Send level initialization event to server for multiplayer sync
    if (multiplayerState.isConnected) {
        socket.emit('initializeLevel', {
            levelType: 'json',
            levelIndex: levelIndex,
            levelNumber: level.number,
            levelName: level.name,
            coinCount: coins.length,
            objectCount: level.objects.length
        });
    }
    
    // Start the level timer
    startLevelTimer();
    
    return true;
}

// Function to create key at specific position
function createKeyAt(gridX, gridZ) {
    if (gameKey) {
        worldGroup.remove(gameKey);
    }
    
    // Create key geometry (cross-like shape)
    const keyGroup = new THREE.Group();
    
    // Key body (vertical part)
    const keyBodyGeometry = new THREE.BoxGeometry(0.1, 0.8, 0.1);
    const keyBodyMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xff6600,
        emissive: 0x331100
    });
    const keyBody = new THREE.Mesh(keyBodyGeometry, keyBodyMaterial);
    keyBody.position.set(0, 0, 0);
    keyGroup.add(keyBody);
    
    // Key head (horizontal part)
    const keyHeadGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.1);
    const keyHead = new THREE.Mesh(keyHeadGeometry, keyBodyMaterial);
    keyHead.position.set(0, 0.35, 0);
    keyGroup.add(keyHead);
    
    // Key teeth
    const keyTeethGeometry = new THREE.BoxGeometry(0.2, 0.05, 0.05);
    const keyTeeth = new THREE.Mesh(keyTeethGeometry, keyBodyMaterial);
    keyTeeth.position.set(0.15, 0.25, 0);
    keyGroup.add(keyTeeth);
    
    // Position key
    keyGroup.position.copy(gridToWorld(gridX, gridZ));
    keyGroup.position.y = 1.5;
    keyGroup.castShadow = true;
    keyGroup.receiveShadow = true;
    
    // Store grid position
    keyGroup.gridX = gridX;
    keyGroup.gridZ = gridZ;
    
    // Generate unique ID for multiplayer sync
    keyGroup.id = `key_${gridX}_${gridZ}`;
    
    // Add floating animation data
    keyGroup.userData = {
        originalY: keyGroup.position.y,
        animationOffset: Math.random() * Math.PI * 2
    };
    
    worldGroup.add(keyGroup);
    gameKey = keyGroup;
    
    return keyGroup;
}

// Function to create goal at specific position
function createGoalAt(gridX, gridZ) {
    if (goalTile) {
        worldGroup.remove(goalTile);
    }
    
    // Create goal tile geometry
    const goalGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16);
    const goalMaterial = new THREE.MeshLambertMaterial({ 
        color: gameScore.hasKey ? 0x00ff00 : 0x666666,
        emissive: gameScore.hasKey ? 0x003300 : 0x000000,
        transparent: true,
        opacity: gameScore.hasKey ? 0.9 : 0.5
    });
    
    const goal = new THREE.Mesh(goalGeometry, goalMaterial);
    
    goal.position.copy(gridToWorld(gridX, gridZ));
    goal.position.y = 0.15;
    goal.castShadow = true;
    goal.receiveShadow = true;
    
    // Store grid position
    goal.gridX = gridX;
    goal.gridZ = gridZ;
    
    // Add pulsing animation data
    goal.userData = {
        originalY: goal.position.y,
        animationOffset: Math.random() * Math.PI * 2
    };
    
    worldGroup.add(goal);
    goalTile = goal;
    
    return goal;
}

// Function to create teleport tile at specific position
function createTeleportTileAt(gridX, gridZ, pairId, destination) {
    const teleportGroup = new THREE.Group();
    
    // Base platform
    const baseGeometry = new THREE.CylinderGeometry(0.9, 0.9, 0.2, 16);
    const baseMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x4400ff,
        emissive: 0x220088,
        transparent: true,
        opacity: 0.8
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(0, 0.1, 0);
    teleportGroup.add(base);
    
    // Portal ring
    const ringGeometry = new THREE.TorusGeometry(0.6, 0.1, 8, 16);
    const ringMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x8800ff,
        emissive: 0x4400aa
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(0, 0.3, 0);
    ring.rotation.x = Math.PI / 2;
    teleportGroup.add(ring);
    
    // Energy particles
    for (let i = 0; i < 6; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xccaaff,
            transparent: true,
            opacity: 0.7
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        const angle = (i / 6) * Math.PI * 2;
        particle.position.set(
            Math.cos(angle) * 0.4,
            0.3,
            Math.sin(angle) * 0.4
        );
        teleportGroup.add(particle);
    }
    
    // Position the teleport group
    teleportGroup.position.copy(gridToWorld(gridX, gridZ));
    teleportGroup.position.y = 0.1;
    teleportGroup.castShadow = true;
    teleportGroup.receiveShadow = true;
    
    // Store grid position and pair info
    teleportGroup.gridX = gridX;
    teleportGroup.gridZ = gridZ;
    teleportGroup.pairId = pairId;
    teleportGroup.destination = destination;
    
    // Add animation data
    teleportGroup.userData = {
        originalY: teleportGroup.position.y,
        animationOffset: Math.random() * Math.PI * 2
    };
    
    worldGroup.add(teleportGroup);
    teleportTiles.push(teleportGroup);
    
    return teleportGroup;
}

// Function to link teleporter pairs
function linkTeleporterPairs() {
    teleportTiles.forEach(tile => {
        if (tile.destination) {
            // Find the destination teleporter
            const destinationTile = teleportTiles.find(t => 
                t.gridX === tile.destination.x && 
                t.gridZ === tile.destination.z &&
                t.pairId === tile.pairId
            );
            if (destinationTile) {
                tile.destinationTile = destinationTile;
            }
        }
    });
}

// Helper function to show messages
function showMessage(text, color = '#ffaa00', duration = 2000) {
    const messageElement = document.getElementById('message-display');
    if (messageElement) {
        messageElement.textContent = text;
        messageElement.style.color = color;
        messageElement.classList.add('show');
        
        // Clear any existing timeout
        if (messageElement.hideTimeout) {
            clearTimeout(messageElement.hideTimeout);
        }
        
        // Set new timeout to hide message
        messageElement.hideTimeout = setTimeout(() => {
            messageElement.classList.remove('show');
            setTimeout(() => {
                messageElement.textContent = '';
            }, 300); // Wait for fade out animation
        }, duration);
    }
}

// Function to toggle between JSON levels and random generation
function toggleLevelMode() {
    if (!levelDataLoaded && !useJsonLevels) {
        showMessage('No JSON level data loaded. Cannot switch to JSON mode.', '#ff6666');
        return;
    }
    
    useJsonLevels = !useJsonLevels;
    const mode = useJsonLevels ? 'JSON Levels' : 'Random Generation';
    showMessage(`Switched to ${mode} mode`, '#ffaa00');
    
    // Restart current level in new mode
    if (useJsonLevels && jsonLevels.length > 0) {
        currentJsonLevelIndex = 0;
        loadJsonLevel(currentJsonLevelIndex);
    } else {
        generateNewLevel(15);
        updateLevelInfo();
    }
}

// Function to go to next JSON level
function nextJsonLevel() {
    if (!levelDataLoaded || !useJsonLevels) {
        showMessage('Not in JSON level mode or no level data loaded', '#ff6666');
        return;
    }
    
    if (currentJsonLevelIndex < jsonLevels.length - 1) {
        currentJsonLevelIndex++;
        loadJsonLevel(currentJsonLevelIndex);
    } else {
        showMessage('No more JSON levels available', '#ffaa00');
    }
}

// Function to go to previous JSON level
function previousJsonLevel() {
    if (!levelDataLoaded || !useJsonLevels) {
        showMessage('Not in JSON level mode or no level data loaded', '#ff6666');
        return;
    }
    
    if (currentJsonLevelIndex > 0) {
        currentJsonLevelIndex--;
        loadJsonLevel(currentJsonLevelIndex);
    } else {
        showMessage('Already at the first JSON level', '#ffaa00');
    }
}

// Function to reload level data
async function reloadLevelData() {
    showMessage('Reloading level data...', '#00ccff');
    const success = await loadLevelData();
    
    if (success && useJsonLevels) {
        // Restart current level with new data
        currentJsonLevelIndex = 0;
        loadJsonLevel(currentJsonLevelIndex);
    }
    
    return success;
}

// Function to update level info display
function updateLevelInfo() {
    const currentLevel = useJsonLevels && jsonLevels.length > 0 ? jsonLevels[currentJsonLevelIndex] : null;
    const levelMode = useJsonLevels ? 'JSON' : 'Random';
    
    // Update the score display to include level mode
    updateScoreDisplay();
    
    // Add level info to the page
    const scoreElement = document.getElementById('score');
    if (scoreElement) {
        let scoreText = scoreElement.textContent;
        if (useJsonLevels && currentLevel) {
            const progress = `${currentJsonLevelIndex + 1}/${jsonLevels.length}`;
            const progressBar = createProgressBar(currentJsonLevelIndex + 1, jsonLevels.length);
            scoreText += ` | Mode: ${levelMode} (${progress}) ${progressBar}`;
        } else {
            scoreText += ` | Mode: ${levelMode}`;
        }
        scoreElement.textContent = scoreText;
    }
    
    // Update level menu if it's open
    if (levelMenu.isVisible) {
        updateLevelMenuDisplay();
    }
}

// Function to create a simple text progress bar
function createProgressBar(current, total, width = 10) {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

// Function to create bouncing platforms
function createBouncingPlatforms(count = 3) {
    // Clear existing platforms
    clearAllBouncingPlatforms();
    
    const occupiedPositions = new Set();
    // Don't spawn platform at player starting position
    occupiedPositions.add(`${playerState.gridX},${playerState.gridZ}`);
    
    for (let i = 0; i < count; i++) {
        let gridX, gridZ;
        let attempts = 0;
        
        // Find an unoccupied position
        do {
            gridX = Math.floor(Math.random() * gridSize);
            gridZ = Math.floor(Math.random() * gridSize);
            attempts++;
        } while (occupiedPositions.has(`${gridX},${gridZ}`) && attempts < 100);
        
        if (attempts < 100) {
            occupiedPositions.add(`${gridX},${gridZ}`);
            createBouncingPlatform(gridX, gridZ);
        }
    }
}

// Function to create a single bouncing platform
function createBouncingPlatform(gridX, gridZ) {
    const platformGroup = new THREE.Group();
    
    // Base platform (spring-like appearance)
    const baseGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.3, 16);
    const baseMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x00aa00,
        emissive: 0x004400,
        transparent: true,
        opacity: 0.9
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(0, 0.15, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    platformGroup.add(base);
    
    // Spring coils (visual effect)
    for (let i = 0; i < 4; i++) {
        const coilGeometry = new THREE.TorusGeometry(0.3, 0.05, 8, 16);
        const coilMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x00ff00,
            emissive: 0x002200
        });
        const coil = new THREE.Mesh(coilGeometry, coilMaterial);
        coil.position.set(0, 0.1 + i * 0.08, 0);
        coil.rotation.x = Math.PI / 2;
        coil.castShadow = true;
        platformGroup.add(coil);
    }
    
    // Top platform (where player lands)
    const topGeometry = new THREE.CylinderGeometry(0.7, 0.7, 0.1, 16);
    const topMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x44ff44,
        emissive: 0x006600
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.set(0, 0.4, 0);
    top.castShadow = true;
    top.receiveShadow = true;
    platformGroup.add(top);
    
    // Energy effect particles
    for (let i = 0; i < 8; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.03, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x88ff88,
            transparent: true,
            opacity: 0.6
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        // Position particles around the platform
        const angle = (i / 8) * Math.PI * 2;
        particle.position.set(
            Math.cos(angle) * 0.5,
            0.2,
            Math.sin(angle) * 0.5
        );
        platformGroup.add(particle);
    }
    
    // Position the platform group
    platformGroup.position.copy(gridToWorld(gridX, gridZ));
    platformGroup.position.y = 0.1;
    platformGroup.castShadow = true;
    platformGroup.receiveShadow = true;
    
    // Store grid position and platform state
    platformGroup.gridX = gridX;
    platformGroup.gridZ = gridZ;
    
    // Add animation data
    platformGroup.userData = {
        originalY: platformGroup.position.y,
        animationOffset: Math.random() * Math.PI * 2,
        isCompressed: false,
        compressionAmount: 0,
        lastBounceTime: 0
    };
    
    worldGroup.add(platformGroup);
    bouncingPlatforms.push(platformGroup);
    
    return platformGroup;
}

// Function to clear all bouncing platforms
function clearAllBouncingPlatforms() {
    bouncingPlatforms.forEach(platform => {
        worldGroup.remove(platform);
    });
    bouncingPlatforms.length = 0;
}

// Function to animate bouncing platforms
function animateBouncingPlatforms() {
    const time = Date.now() * 0.001;
    
    bouncingPlatforms.forEach(platform => {
        const userData = platform.userData;
        const timeSinceLastBounce = Date.now() - userData.lastBounceTime;
        
        // Gentle floating animation when not compressed
        if (!userData.isCompressed) {
            const floatOffset = Math.sin(time * 2 + userData.animationOffset) * 0.05;
            platform.position.y = userData.originalY + floatOffset;
        }
        
        // Compression animation after bounce
        if (userData.isCompressed && timeSinceLastBounce < 1000) {
            const compressionProgress = timeSinceLastBounce / 1000;
            const easeOut = 1 - Math.pow(1 - compressionProgress, 3);
            userData.compressionAmount = 0.2 * (1 - easeOut);
            platform.position.y = userData.originalY - userData.compressionAmount;
            
            if (compressionProgress >= 1) {
                userData.isCompressed = false;
                userData.compressionAmount = 0;
            }
        }
        
        // Animate energy particles
        platform.children.forEach((child, index) => {
            if (child.geometry && child.geometry.type === 'SphereGeometry' && child.material.opacity < 1) {
                const particleTime = time * 3 + index * 0.5;
                child.position.y = 0.2 + Math.sin(particleTime) * 0.1;
                child.material.opacity = 0.6 + Math.sin(particleTime * 2) * 0.3;
            }
        });
    });
}

// Function to check bouncing platform collision
function checkBouncingPlatformCollision() {
    if (playerState.isMoving || worldState.isRotating) return;
    
    bouncingPlatforms.forEach(platform => {
        if (platform.gridX === playerState.gridX && platform.gridZ === playerState.gridZ) {
            // Player is on the platform
            if (!platform.userData.isCompressed) {
                bouncePlayer(platform);
            }
        }
    });
}

// Function to bounce the player upward
function bouncePlayer(platform) {
    if (playerState.isMoving || worldState.isRotating) return;
    
    // Mark platform as compressed
    platform.userData.isCompressed = true;
    platform.userData.lastBounceTime = Date.now();
    
    // Play jump sound effect
    soundManager.play('jump');
    
    // Track bounce platform usage for statistics and achievements
    trackBouncePlatformUsage();
    
    // Create bounce effect
    showBounceEffect(platform.position);
    
    // Calculate bounce trajectory
    const bounceHeight = getConfigValue('gameplay.bounceHeight', 4);
    const bounceDuration = getConfigValue('gameplay.bounceDuration', 1.5);
    const startPosition = player.position.clone();
    const peakPosition = startPosition.clone();
    peakPosition.y += bounceHeight;
    
    playerState.isMoving = true;
    
    // Animate the bounce
    const bounceStartTime = Date.now();
    const animateBounce = () => {
        const elapsed = (Date.now() - bounceStartTime) / 1000;
        const progress = Math.min(elapsed / bounceDuration, 1);
        
        if (progress < 1) {
            // Parabolic arc for realistic bounce
            const height = bounceHeight * Math.sin(progress * Math.PI);
            player.position.y = startPosition.y + height;
            
            // Add slight rotation during bounce
            player.rotation.y += 0.05;
            
            requestAnimationFrame(animateBounce);
        } else {
            // Bounce complete - land on elevated platform
            landOnElevatedPlatform();
        }
    };
    
    animateBounce();
}

// Function to create elevated platform for landing
function landOnElevatedPlatform() {
    // Create a temporary elevated platform
    const elevatedPlatform = new THREE.Group();
    
    // Platform base
    const platformGeometry = new THREE.CylinderGeometry(0.9, 0.9, 0.2, 16);
    const platformMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x8888ff,
        emissive: 0x222244,
        transparent: true,
        opacity: 0.8
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.set(0, 0.1, 0);
    platform.castShadow = true;
    platform.receiveShadow = true;
    elevatedPlatform.add(platform);
    
    // Position elevated platform at player's current grid position
    const playerWorldPos = gridToWorld(playerState.gridX, playerState.gridZ);
    elevatedPlatform.position.copy(playerWorldPos);
    elevatedPlatform.position.y = 3; // Elevated height
    
    worldGroup.add(elevatedPlatform);
    
    // Land the player on the elevated platform
    player.position.copy(elevatedPlatform.position);
    player.position.y = 3.55; // Player height on elevated platform
    playerState.isMoving = false;
    
    // Show landing effect
    showLandingEffect(player.position);
    
    // Remove elevated platform after some time and return player to ground
    setTimeout(() => {
        // Animate player descending back to ground
        const descendStartTime = Date.now();
        const descendDuration = 1.0;
        const startY = player.position.y;
        const endY = 0.55;
        
        const animateDescend = () => {
            const elapsed = (Date.now() - descendStartTime) / 1000;
            const progress = Math.min(elapsed / descendDuration, 1);
            
            if (progress < 1) {
                // Smooth descent
                const easeProgress = 1 - Math.pow(1 - progress, 2);
                player.position.y = startY + (endY - startY) * easeProgress;
                requestAnimationFrame(animateDescend);
            } else {
                player.position.y = endY;
                playerState.isMoving = false;
            }
        };
        
        playerState.isMoving = true;
        animateDescend();
        
        // Remove elevated platform
        worldGroup.remove(elevatedPlatform);
    }, 3000); // Platform exists for 3 seconds
}

// Function to show bounce effect
function showBounceEffect(position) {
    // Create expanding ring effect
    const ringGeometry = new THREE.TorusGeometry(0.5, 0.1, 8, 16);
    const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(position);
    ring.position.y += 0.1;
    ring.rotation.x = Math.PI / 2;
    worldGroup.add(ring);
    
    // Animate ring expansion
    const startTime = Date.now();
    const animateRing = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / 800; // 0.8 second animation
        
        if (progress < 1) {
            const scale = 1 + progress * 3;
            ring.scale.setScalar(scale);
            ring.material.opacity = 0.8 * (1 - progress);
            requestAnimationFrame(animateRing);
        } else {
            worldGroup.remove(ring);
        }
    };
    animateRing();
    
    // Create upward particles
    for (let i = 0; i < 12; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x44ff44,
            transparent: true,
            opacity: 0.9
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.copy(position);
        particle.position.y += 0.2;
        worldGroup.add(particle);
        
        // Random upward direction
        const direction = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            Math.random() * 2 + 1,
            (Math.random() - 0.5) * 0.5
        ).normalize();
        
        // Animate particle
        const particleStartTime = Date.now();
        const animateParticle = () => {
            const elapsed = Date.now() - particleStartTime;
            const progress = elapsed / 1000; // 1 second animation
            
            if (progress < 1) {
                particle.position.add(direction.clone().multiplyScalar(0.05));
                particle.material.opacity = 0.9 * (1 - progress);
                requestAnimationFrame(animateParticle);
            } else {
                worldGroup.remove(particle);
            }
        };
        animateParticle();
    }
}

// Function to show landing effect
function showLandingEffect(position) {
    // Create impact effect
    for (let i = 0; i < 8; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x8888ff,
            transparent: true,
            opacity: 0.8
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.copy(position);
        worldGroup.add(particle);
        
        // Radial outward direction
        const angle = (i / 8) * Math.PI * 2;
        const direction = new THREE.Vector3(
            Math.cos(angle),
            0,
            Math.sin(angle)
        ).normalize();
        
        // Animate particle
        const startTime = Date.now();
        const animateParticle = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / 600; // 0.6 second animation
            
            if (progress < 1) {
                particle.position.add(direction.clone().multiplyScalar(0.04));
                particle.material.opacity = 0.8 * (1 - progress);
                requestAnimationFrame(animateParticle);
            } else {
                worldGroup.remove(particle);
            }
        };
        animateParticle();
    }
}

// Function to create the key
function createKey() {
    if (gameKey) {
        worldGroup.remove(gameKey);
    }
    
    // Create key geometry (cross-like shape)
    const keyGroup = new THREE.Group();
    
    // Key body (vertical part)
    const keyBodyGeometry = new THREE.BoxGeometry(0.1, 0.8, 0.1);
    const keyBodyMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xff6600,
        emissive: 0x331100
    });
    const keyBody = new THREE.Mesh(keyBodyGeometry, keyBodyMaterial);
    keyBody.position.set(0, 0, 0);
    keyGroup.add(keyBody);
    
    // Key head (horizontal part)
    const keyHeadGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.1);
    const keyHead = new THREE.Mesh(keyHeadGeometry, keyBodyMaterial);
    keyHead.position.set(0, 0.35, 0);
    keyGroup.add(keyHead);
    
    // Key teeth
    const keyTeethGeometry = new THREE.BoxGeometry(0.2, 0.05, 0.05);
    const keyTeeth = new THREE.Mesh(keyTeethGeometry, keyBodyMaterial);
    keyTeeth.position.set(0.15, 0.25, 0);
    keyGroup.add(keyTeeth);
    
    // Position key
    let keyGridX, keyGridZ;
    do {
        keyGridX = Math.floor(Math.random() * gridSize);
        keyGridZ = Math.floor(Math.random() * gridSize);
    } while (keyGridX === playerState.gridX && keyGridZ === playerState.gridZ);
    
    keyGroup.position.copy(gridToWorld(keyGridX, keyGridZ));
    keyGroup.position.y = 1.5;
    keyGroup.castShadow = true;
    keyGroup.receiveShadow = true;
    
    // Store grid position
    keyGroup.gridX = keyGridX;
    keyGroup.gridZ = keyGridZ;
    
    // Generate unique ID for multiplayer sync
    keyGroup.id = `key_${keyGridX}_${keyGridZ}`;
    
    // Add floating animation data
    keyGroup.userData = {
        originalY: keyGroup.position.y,
        animationOffset: Math.random() * Math.PI * 2
    };
    
    worldGroup.add(keyGroup);
    gameKey = keyGroup;
    
    return keyGroup;
}

// Function to create the goal tile
function createGoalTile() {
    if (goalTile) {
        worldGroup.remove(goalTile);
    }
    
    // Create goal tile geometry
    const goalGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16);
    const goalMaterial = new THREE.MeshLambertMaterial({ 
        color: gameScore.hasKey ? 0x00ff00 : 0x666666,
        emissive: gameScore.hasKey ? 0x003300 : 0x000000,
        transparent: true,
        opacity: gameScore.hasKey ? 0.9 : 0.5
    });
    
    const goal = new THREE.Mesh(goalGeometry, goalMaterial);
    
    // Position goal tile (opposite corner from player start)
    const goalGridX = gridSize - 1;
    const goalGridZ = gridSize - 1;
    
    goal.position.copy(gridToWorld(goalGridX, goalGridZ));
    goal.position.y = 0.15;
    goal.castShadow = true;
    goal.receiveShadow = true;
    
    // Store grid position
    goal.gridX = goalGridX;
    goal.gridZ = goalGridZ;
    
    // Add pulsing animation data
    goal.userData = {
        originalY: goal.position.y,
        animationOffset: Math.random() * Math.PI * 2
    };
    
    worldGroup.add(goal);
    goalTile = goal;
    
    return goal;
}

// Function to collect the key
function collectKey() {
    if (gameKey) {
        // Send collection event to server for multiplayer sync
        if (multiplayerState.isConnected && gameKey.id) {
            socket.emit('collectItem', {
                itemType: 'key',
                itemId: gameKey.id
            });
        }
        
        worldGroup.remove(gameKey);
        gameKey = null;
        gameScore.hasKey = true;
        
        // Track key collection for statistics and achievements
        trackKeyCollection();
        
        // Play key pickup sound effect
        soundManager.play('key');
        
        // Update goal tile appearance
        if (goalTile) {
            goalTile.material.color.setHex(0x00ff00);
            goalTile.material.emissive.setHex(0x003300);
            goalTile.material.opacity = 0.9;
        }
        
        // Show key collection message
        showMessage('Key collected! The exit is now unlocked!', '#ff6600', 3000);
        
        updateScoreDisplay({ animateKey: true });
        
        // Create collection effect
        showKeyCollectionEffect();
    }
}

// Function to complete the level
function completeLevel() {
    if (!gameScore.hasKey) {
        // Show locked message
        showMessage('Exit is locked! Find the key first!', '#ff6666', 2000);
        return;
    }
    
    gameScore.levelComplete = true;
    
    // Play level completion sound effect
    soundManager.play('levelComplete');
    
    // Stop the timer and get completion time
    const completionTime = stopLevelTimer();
    
    // Calculate level score (coins collected + time bonus + speed bonus)
    const timeBonus = completionTime ? Math.max(0, Math.floor(1000 - completionTime * 10)) : 0;
    const levelScore = (gameScore.coins * 100) + (gameScore.hasKey ? 500 : 0) + timeBonus;
    gameScore.totalScore += levelScore;
    
    // Track level completion for statistics and achievements
    trackLevelCompletion(levelScore, completionTime);
    
    // Update level progress for JSON levels
    if (useJsonLevels && levelDataLoaded && currentJsonLevelIndex < jsonLevels.length) {
        updateLevelProgress(currentJsonLevelIndex, levelScore, completionTime);
    }
    
    // Show completion message with time and progression info
    let timeInfo = '';
    let bestTimeInfo = '';
    
    if (completionTime) {
        timeInfo = ` | Time: ${formatTime(completionTime)}`;
        
        // Check if this is a best time
        if (useJsonLevels && levelDataLoaded && currentJsonLevelIndex < jsonLevels.length) {
            const progress = levelProgress.jsonLevels[currentJsonLevelIndex];
            const previousBestTime = progress?.bestTime;
            
            if (!previousBestTime || completionTime < previousBestTime) {
                bestTimeInfo = ' | 🏆 NEW BEST TIME!';
            } else {
                bestTimeInfo = ` | Best: ${formatTime(previousBestTime)}`;
            }
        }
    }
    
    let progressInfo = '';
    if (useJsonLevels && levelDataLoaded) {
        const currentLevel = jsonLevels[currentJsonLevelIndex];
        const nextIndex = currentJsonLevelIndex + 1;
        
        if (nextIndex < jsonLevels.length) {
            const nextLevel = jsonLevels[nextIndex];
            progressInfo = ` | Next: ${nextLevel.name} (${nextIndex + 1}/${jsonLevels.length})`;
        } else {
            progressInfo = ` | Series Complete! (${jsonLevels.length}/${jsonLevels.length})`;
        }
    } else {
        progressInfo = ` | Next: Random Level ${gameScore.currentLevel + 1}`;
    }
    
    const completionMessage = `Level Complete! Score: ${levelScore}${timeInfo}${bestTimeInfo}`;
    showMessage(completionMessage, '#00ff00', 3000);
    
    // Create completion effect
    showLevelCompletionEffect();
    
    updateScoreDisplay({ animateScore: true });
    
    // Start voting for multiplayer or auto-transition for single player
    if (multiplayerState.isConnected && Object.keys(multiplayerState.otherPlayers).length > 0) {
        // Multiplayer: Start voting
        setTimeout(() => {
            const levelData = {
                levelNumber: gameScore.currentLevel,
                levelName: useJsonLevels && jsonLevels[currentJsonLevelIndex] ? jsonLevels[currentJsonLevelIndex].name : `Level ${gameScore.currentLevel}`,
                levelScore: levelScore,
                completionTime: completionTime,
                timeBonus: timeBonus,
                progressInfo: progressInfo
            };
            
            socket.emit('levelCompleted', levelData);
        }, 2000);
    } else {
        // Single player: Auto-transition as before
        setTimeout(() => {
            if (useJsonLevels && currentJsonLevelIndex >= jsonLevels.length - 1) {
                // Don't show transition message for completion screen
                transitionToNextLevel();
            } else {
                showMessage('Transitioning to next level...', '#ffff00', 1000);
                
                // Transition to next level after 1 more second
                setTimeout(() => {
                    transitionToNextLevel();
                }, 1000);
            }
        }, 2000);
    }
}

// Function to transition to next level
function transitionToNextLevel() {
    // Reset level state (but keep lives)
    gameScore.hasKey = false;
    gameScore.levelComplete = false;
    gameScore.coins = 0;
    
    // Reset timer for next level
    resetTimer();
    
    if (useJsonLevels && levelDataLoaded) {
        // Use JSON levels
        if (currentJsonLevelIndex < jsonLevels.length - 1) {
            // Load next JSON level
            currentJsonLevelIndex++;
            loadJsonLevel(currentJsonLevelIndex);
        } else {
            // All JSON levels completed - offer options
            handleAllJsonLevelsCompleted();
        }
    } else {
        // Use random generation
        gameScore.currentLevel++;
        const coinsForLevel = Math.min(15 + (gameScore.currentLevel - 1) * 2, 25);
        generateNewLevel(coinsForLevel);
        
        // Show new level message for random levels
        showMessage(`Level ${gameScore.currentLevel} - Find the key and reach the goal! Avoid spikes!`, '#00ccff', 3000);
    }
    
    updateScoreDisplay();
}

// Function to handle completion of all JSON levels
function handleAllJsonLevelsCompleted() {
    // Play victory sound
    soundManager.play('victory');
    
    // Stop background music for victory screen
    soundManager.stopBackgroundMusic();
    
    // Set flag to enable progression choice inputs
    gameState.awaitingProgressionChoice = true;
    gameState.progressionChoiceTimeout = null;
    
    // Calculate completion statistics
    const completionStats = calculateCompletionStats();
    
    // Check for champion achievement
    checkChampionAchievement();
    
    // Show victory screen
    showVictoryScreen(completionStats);
    
    // Create celebratory effect
    showAllLevelsCompletedEffect();
    
    // Log detailed stats to console
    console.log('🎉 JSON Level Completion Statistics:', completionStats);
}

// Function to calculate completion statistics and achievements
function calculateCompletionStats() {
    const totalCoins = calculateTotalCoinsCollected();
    const bestTime = calculateBestTime();
    const achievements = calculateAchievements();
    
    return {
        totalLevels: jsonLevels.length,
        totalScore: gameScore.totalScore,
        avgScorePerLevel: Math.round(gameScore.totalScore / jsonLevels.length),
        lives: gameScore.lives,
        maxLives: gameScore.maxLives,
        totalCoins: totalCoins,
        bestTime: bestTime,
        achievements: achievements
    };
}

// Function to calculate total coins collected across all levels
function calculateTotalCoinsCollected() {
    if (!levelProgress || !levelProgress.jsonLevels) return 0;
    
    return levelProgress.jsonLevels.reduce((total, level) => {
        return total + (level ? level.coinsCollected || 0 : 0);
    }, 0);
}

// Function to calculate best completion time
function calculateBestTime() {
    if (!levelProgress || !levelProgress.jsonLevels) return null;
    
    const times = levelProgress.jsonLevels
        .map(level => level ? level.bestTime : null)
        .filter(time => time !== null);
    
    return times.length > 0 ? Math.min(...times) : null;
}

// Function to calculate achievements
function calculateAchievements() {
    const achievements = [];
    
    // Perfect completion (all levels with max lives)
    if (gameScore.lives === gameScore.maxLives) {
        achievements.push({
            icon: '💎',
            name: 'Flawless Victory',
            description: 'Completed all levels without losing a single life!'
        });
    }
    
    // Speed runner
    const avgTime = calculateBestTime();
    if (avgTime && avgTime < 30) {
        achievements.push({
            icon: '⚡',
            name: 'Speed Demon',
            description: 'Completed a level in under 30 seconds!'
        });
    }
    
    // Coin collector
    const totalCoins = calculateTotalCoinsCollected();
    if (totalCoins >= jsonLevels.length * 5) { // Assuming avg 5 coins per level
        achievements.push({
            icon: '💰',
            name: 'Treasure Hunter',
            description: 'Collected most coins across all levels!'
        });
    }
    
    // High scorer
    if (gameScore.totalScore > jsonLevels.length * 1000) {
        achievements.push({
            icon: '🏆',
            name: 'High Scorer',
            description: 'Achieved an impressive total score!'
        });
    }
    
    // Completion achievement
    achievements.push({
        icon: '🎯',
        name: 'Level Master',
        description: `Completed all ${jsonLevels.length} levels!`
    });
    
    return achievements;
}

// Function to show victory screen
function showVictoryScreen(stats) {
    const victoryScreen = document.getElementById('victory-screen');
    
    // Populate statistics
    document.getElementById('total-levels').textContent = stats.totalLevels;
    document.getElementById('total-score').textContent = stats.totalScore.toLocaleString();
    document.getElementById('average-score').textContent = stats.avgScorePerLevel.toLocaleString();
    document.getElementById('lives-remaining').textContent = `${stats.lives}/${stats.maxLives}`;
    document.getElementById('total-coins').textContent = stats.totalCoins;
    document.getElementById('best-time').textContent = stats.bestTime ? formatTime(stats.bestTime) : '--:--';
    
    // Populate achievements
    const achievementsList = document.getElementById('achievements-list');
    achievementsList.innerHTML = '';
    
    stats.achievements.forEach((achievement, index) => {
        const achievementItem = document.createElement('div');
        achievementItem.className = 'achievement-item';
        achievementItem.style.animationDelay = `${index * 0.1}s`;
        achievementItem.innerHTML = `
            <span>${achievement.icon}</span>
            <span>${achievement.name}</span>
        `;
        achievementItem.title = achievement.description;
        achievementsList.appendChild(achievementItem);
    });
    
    // Show victory screen
    victoryScreen.classList.remove('hidden');
}

// Function to hide victory screen
function hideVictoryScreen() {
    const victoryScreen = document.getElementById('victory-screen');
    victoryScreen.classList.add('hidden');
}

// Victory screen action functions
function restartFromVictory() {
    soundManager.play('menuClick');
    gameState.awaitingProgressionChoice = false;
    hideVictoryScreen();
    restartJsonLevels();
}

function switchToRandomMode() {
    soundManager.play('menuClick');
    gameState.awaitingProgressionChoice = false;
    hideVictoryScreen();
    switchToRandomGeneration();
}

function returnToLobbyFromVictory() {
    soundManager.play('menuClick');
    gameState.awaitingProgressionChoice = false;
    hideVictoryScreen();
    returnToLobby();
}

// Function to show all levels completed effect
function showAllLevelsCompletedEffect() {
    const playerPos = player.position.clone();
    playerPos.y += 2;
    
    // Create spectacular fireworks effect
    for (let i = 0; i < 30; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const colors = [0xffd700, 0xff6600, 0x00ff00, 0x0088ff, 0xff00ff];
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: colors[i % colors.length],
            transparent: true,
            opacity: 1
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.copy(playerPos);
        worldGroup.add(particle);
        
        // Explosive direction
        const direction = new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            Math.random() * 4 + 2,
            (Math.random() - 0.5) * 6
        ).normalize();
        
        // Animate particle
        const startTime = Date.now();
        const animateParticle = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / 2000; // 2 second animation
            
            if (progress < 1) {
                particle.position.add(direction.clone().multiplyScalar(0.1));
                particle.material.opacity = 1 - progress;
                particle.scale.setScalar(1 + progress * 0.5);
                requestAnimationFrame(animateParticle);
            } else {
                worldGroup.remove(particle);
            }
        };
        
        // Stagger the start times
        setTimeout(animateParticle, i * 50);
    }
}

// Function to handle progression choice
function handleProgressionChoice(choice) {
    if (!gameState.awaitingProgressionChoice) return;
    
    // Clear the timeout and flag
    if (gameState.progressionChoiceTimeout) {
        clearTimeout(gameState.progressionChoiceTimeout);
        gameState.progressionChoiceTimeout = null;
    }
    gameState.awaitingProgressionChoice = false;
    
    // Hide victory screen if it's showing
    hideVictoryScreen();
    
    switch(choice) {
        case 'restart':
            restartJsonLevels();
            break;
        case 'random':
            switchToRandomGeneration();
            break;
        case 'loop':
            loopToFirstJsonLevel();
            break;
        default:
            restartJsonLevels();
    }
}



// Function to restart JSON levels from beginning
function restartJsonLevels() {
    currentJsonLevelIndex = 0;
    showMessage('🔄 Restarting JSON levels from the beginning!', '#00ffff', 3000);
    
    // Small delay for message visibility
    setTimeout(() => {
        loadJsonLevel(currentJsonLevelIndex);
    }, 1000);
}

// Function to switch to random generation
function switchToRandomGeneration() {
    useJsonLevels = false;
    gameScore.currentLevel = jsonLevels.length + 1; // Continue numbering from where JSON left off
    
    showMessage('🎲 Switching to infinite random levels!', '#ff6600', 3000);
    
    // Small delay for message visibility
    setTimeout(() => {
        const coinsForLevel = Math.min(15 + (gameScore.currentLevel - 1) * 2, 25);
        generateNewLevel(coinsForLevel);
    }, 1000);
}

// Function to loop back to first JSON level
function loopToFirstJsonLevel() {
    currentJsonLevelIndex = 0;
    showMessage('🔁 Looping back to first JSON level!', '#ff00ff', 3000);
    
    // Small delay for message visibility
    setTimeout(() => {
        loadJsonLevel(currentJsonLevelIndex);
    }, 1000);
}

// Function to generate a new level
function generateNewLevel(coinCount = 15) {
    // Clear existing level objects
    clearAllCoins();
    clearSpikeTraps();
    clearTeleportTiles();
    clearAllBouncingPlatforms();
    
    // Create new level objects
    spawnCoins(coinCount);
    createKey();
    createGoalTile();
    
    // Add spike traps (more on higher levels)
    const trapCount = Math.min(3 + Math.floor(gameScore.currentLevel / 2), 8);
    createSpikeTraps(trapCount);
    
    // Add teleport tiles (more on higher levels)
    const teleportPairs = Math.min(1 + Math.floor(gameScore.currentLevel / 3), 3);
    createTeleportTiles(teleportPairs);
    
    // Add bouncing platforms (more on higher levels)
    const platformCount = Math.min(2 + Math.floor(gameScore.currentLevel / 4), 5);
    createBouncingPlatforms(platformCount);
    
    // Add level-specific challenges (every 3rd level)
    if (gameScore.currentLevel % 3 === 0) {
        addLevelChallenge();
    }
    
    console.log(`Generated Level ${gameScore.currentLevel} with ${coinCount} coins, ${trapCount} spike traps, ${teleportPairs} teleport pairs, and ${platformCount} bouncing platforms`);
    
    // Update level info display
    updateLevelInfo();
    
    // Send level initialization event to server for multiplayer sync
    if (multiplayerState.isConnected) {
        socket.emit('initializeLevel', {
            levelType: 'random',
            levelNumber: gameScore.currentLevel,
            coinCount: coinCount,
            trapCount: trapCount,
            teleportPairs: teleportPairs,
            platformCount: platformCount
        });
    }
    
    // Start the level timer
    startLevelTimer();
}

// Function to add level challenges
function addLevelChallenge() {
    // For now, just add more visual flair
    // In future versions, could add obstacles, moving platforms, etc.
    const messageElement = document.getElementById('message');
    if (messageElement) {
        const currentMsg = messageElement.textContent;
        messageElement.textContent = currentMsg + ' (Challenge Level!)';
        messageElement.style.color = '#ff6600';
    }
}

// Function to restart game - moved to prevent duplicate declaration

// Function to show key collection effect
function showKeyCollectionEffect() {
    if (!gameKey) return;
    
    const position = gameKey.position.clone();
    
    // Create multiple particles
    for (let i = 0; i < 8; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff6600,
            transparent: true,
            opacity: 0.8
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.copy(position);
        worldGroup.add(particle);
        
        // Random direction
        const direction = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() + 0.5,
            (Math.random() - 0.5) * 2
        ).normalize();
        
        // Animate particle
        const startTime = Date.now();
        const animateParticle = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / 1000; // 1 second animation
            
            if (progress < 1) {
                particle.position.add(direction.clone().multiplyScalar(0.05));
                particle.material.opacity = 0.8 * (1 - progress);
                particle.scale.setScalar(1 - progress * 0.5);
                requestAnimationFrame(animateParticle);
            } else {
                worldGroup.remove(particle);
            }
        };
        animateParticle();
    }
}

// Function to show level completion effect
function showLevelCompletionEffect() {
    if (!goalTile) return;
    
    const position = goalTile.position.clone();
    position.y += 0.5;
    
    // Create celebration particles
    for (let i = 0; i < 20; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: [0x00ff00, 0xffd700, 0x00ffff][i % 3],
            transparent: true,
            opacity: 1
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.copy(position);
        worldGroup.add(particle);
        
        // Random direction upward
        const direction = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() * 2 + 1,
            (Math.random() - 0.5) * 2
        ).normalize();
        
        // Animate particle
        const startTime = Date.now();
        const animateParticle = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / 2000; // 2 second animation
            
            if (progress < 1) {
                particle.position.add(direction.clone().multiplyScalar(0.03));
                particle.material.opacity = 1 - progress;
                requestAnimationFrame(animateParticle);
            } else {
                worldGroup.remove(particle);
            }
        };
        animateParticle();
    }
}

// Function to animate key and goal
function animateKeyAndGoal() {
    const time = Date.now() * 0.001;
    
    // Animate key
    if (gameKey && gameKey.userData) {
        const keyFloatHeight = getConfigValue('visual.keyFloatHeight', 0.15);
        const keyFloatSpeed = getConfigValue('visual.keyFloatSpeed', 3);
        gameKey.position.y = gameKey.userData.originalY + Math.sin(time * keyFloatSpeed + gameKey.userData.animationOffset) * keyFloatHeight;
        gameKey.rotation.y += 0.03;
    }
    
    // Animate goal tile
    if (goalTile && goalTile.userData) {
        if (gameScore.hasKey) {
            // Pulsing animation when unlocked
            goalTile.position.y = goalTile.userData.originalY + Math.sin(time * 4 + goalTile.userData.animationOffset) * 0.05;
            const pulseSpeed = getConfigValue('visual.goalPulseSpeed', 6);
        const pulseAmount = getConfigValue('visual.goalPulseAmount', 0.1);
        const pulseScale = 1 + Math.sin(time * pulseSpeed) * pulseAmount;
            goalTile.scale.setScalar(pulseScale);
        } else {
            // Subtle animation when locked
            goalTile.position.y = goalTile.userData.originalY + Math.sin(time * 1 + goalTile.userData.animationOffset) * 0.02;
        }
    }
}

// Function to check key and goal collection
function checkKeyAndGoalCollection() {
    const playerPos = player.position;
    const collectDistance = getConfigValue('physics.collisionDistance', 0.8);
    
    // Check key collection
    if (gameKey && !gameScore.hasKey) {
        const distance = playerPos.distanceTo(gameKey.position);
        if (distance < collectDistance) {
            collectKey();
        }
    }
    
    // Check goal completion
    if (goalTile && !gameScore.levelComplete) {
        const distance = playerPos.distanceTo(goalTile.position);
        if (distance < collectDistance) {
            completeLevel();
        }
    }
}

// Function to create spike traps
function createSpikeTraps(count = 5) {
    // Clear existing spike traps
    clearSpikeTraps();
    
    const occupiedPositions = new Set();
    // Mark player start position as occupied
    occupiedPositions.add(`${playerStartPosition.gridX},${playerStartPosition.gridZ}`);
    // Mark goal position as occupied
    occupiedPositions.add(`${gridSize - 1},${gridSize - 1}`);
    
    for (let i = 0; i < count; i++) {
        let trapGridX, trapGridZ;
        let attempts = 0;
        
        // Find an unoccupied position
        do {
            trapGridX = Math.floor(Math.random() * gridSize);
            trapGridZ = Math.floor(Math.random() * gridSize);
            attempts++;
        } while (occupiedPositions.has(`${trapGridX},${trapGridZ}`) && attempts < 100);
        
        if (attempts < 100) {
            occupiedPositions.add(`${trapGridX},${trapGridZ}`);
            createSpikeTrap(trapGridX, trapGridZ);
        }
    }
}

// Function to create a single spike trap
function createSpikeTrap(gridX, gridZ) {
    const trapGroup = new THREE.Group();
    
    // Base of the trap (dark platform)
    const baseGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 8);
    const baseMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x444444,
        emissive: 0x220000
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(0, 0.05, 0);
    trapGroup.add(base);
    
    // Create multiple spikes
    for (let i = 0; i < 4; i++) {
        const spikeGeometry = new THREE.ConeGeometry(0.1, 0.6, 6);
        const spikeMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x660000,
            emissive: 0x330000
        });
        const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
        
        // Position spikes around the base
        const angle = (i / 4) * Math.PI * 2;
        spike.position.set(
            Math.cos(angle) * 0.3,
            0.4,
            Math.sin(angle) * 0.3
        );
        spike.castShadow = true;
        trapGroup.add(spike);
    }
    
    // Central spike
    const centralSpikeGeometry = new THREE.ConeGeometry(0.08, 0.8, 6);
    const centralSpikeMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x880000,
        emissive: 0x440000
    });
    const centralSpike = new THREE.Mesh(centralSpikeGeometry, centralSpikeMaterial);
    centralSpike.position.set(0, 0.5, 0);
    centralSpike.castShadow = true;
    trapGroup.add(centralSpike);
    
    // Position the trap group
    trapGroup.position.copy(gridToWorld(gridX, gridZ));
    trapGroup.position.y = 0.05;
    trapGroup.receiveShadow = true;
    
    // Store grid position
    trapGroup.gridX = gridX;
    trapGroup.gridZ = gridZ;
    
    // Add animation data
    trapGroup.userData = {
        originalY: trapGroup.position.y,
        animationOffset: Math.random() * Math.PI * 2
    };
    
    worldGroup.add(trapGroup);
    spikeTraps.push(trapGroup);
    
    return trapGroup;
}

// Function to clear all spike traps
function clearSpikeTraps() {
    spikeTraps.forEach(trap => {
        worldGroup.remove(trap);
    });
    spikeTraps.length = 0;
}

// Function to handle player damage
function damagePlayer() {
    if (gameScore.lives <= 0) return;
    
    gameScore.lives--;
    
    // Track player death for statistics and achievements
    trackPlayerDeath();
    
    // Play trap sound effect
    soundManager.play('trap');
    
    // Show damage effect
    showDamageEffect();
    
    // Respawn player at start position
    respawnPlayer();
    
    // Update UI
    updateScoreDisplay({ animateLives: true });
    
    // Check for game over
    if (gameScore.lives <= 0) {
        gameOver();
    } else {
        // Show damage message
        showMessage(`Ouch! Lives remaining: ${gameScore.lives}`, '#ff3333', 2000);
    }
}

// Function to respawn player
function respawnPlayer() {
    // Reset player position
    playerState.gridX = playerStartPosition.gridX;
    playerState.gridZ = playerStartPosition.gridZ;
    playerState.isMoving = false;
    
    // Reset player world position
    const startPos = gridToWorld(playerStartPosition.gridX, playerStartPosition.gridZ);
    player.position.copy(startPos);
    
    // Reset player rotation
    playerState.baseRotation.x = 0;
    playerState.baseRotation.z = 0;
    player.rotation.x = 0;
    player.rotation.y = 0;
    player.rotation.z = 0;
    
    // Restart the level timer
    startLevelTimer();
    
    // Update position display
    updatePlayerPosition();
}

// Function to handle game over
function gameOver() {
    // Play level failed sound effect
    soundManager.play('levelFailed');
    
    showMessage('Game Over! Press N to restart', '#ff0000', 10000);
    
    // Create game over effect
    showGameOverEffect();
}

// Function to show damage effect
function showDamageEffect() {
    const position = player.position.clone();
    
    // Screen flash effect (change player color briefly)
    const originalColor = player.material.color.clone();
    player.material.color.setHex(0xff0000);
    
    setTimeout(() => {
        player.material.color.copy(originalColor);
    }, 200);
    
    // Create damage particles
    for (let i = 0; i < 6; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            transparent: true,
            opacity: 0.8
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.copy(position);
        particle.position.y += 0.5;
        worldGroup.add(particle);
        
        // Random direction
        const direction = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() + 0.5,
            (Math.random() - 0.5) * 2
        ).normalize();
        
        // Animate particle
        const startTime = Date.now();
        const animateParticle = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / 800; // 0.8 second animation
            
            if (progress < 1) {
                particle.position.add(direction.clone().multiplyScalar(0.03));
                particle.material.opacity = 0.8 * (1 - progress);
                requestAnimationFrame(animateParticle);
            } else {
                worldGroup.remove(particle);
            }
        };
        animateParticle();
    }
}

// Function to show game over effect
function showGameOverEffect() {
    const position = player.position.clone();
    position.y += 1;
    
    // Create dramatic effect
    for (let i = 0; i < 15; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            transparent: true,
            opacity: 1
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.copy(position);
        worldGroup.add(particle);
        
        // Explosive direction
        const direction = new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            Math.random() * 2 + 1,
            (Math.random() - 0.5) * 4
        ).normalize();
        
        // Animate particle
        const startTime = Date.now();
        const animateParticle = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / 1500; // 1.5 second animation
            
            if (progress < 1) {
                particle.position.add(direction.clone().multiplyScalar(0.08));
                particle.material.opacity = 1 - progress;
                requestAnimationFrame(animateParticle);
            } else {
                worldGroup.remove(particle);
            }
        };
        animateParticle();
    }
}

// Function to animate spike traps
function animateSpikeTraps() {
    const time = Date.now() * 0.001;
    
    spikeTraps.forEach(trap => {
        if (trap.userData) {
            // Subtle menacing animation
            trap.position.y = trap.userData.originalY + Math.sin(time * 2 + trap.userData.animationOffset) * 0.02;
            trap.rotation.y += 0.01;
        }
    });
}

// Function to check spike trap collision
function checkSpikeTrapCollision() {
    if (playerState.isMoving || gameScore.lives <= 0) return;
    
    const playerPos = player.position;
    const trapDistance = getConfigValue('physics.trapDistance', 0.6);
    
    for (let i = 0; i < spikeTraps.length; i++) {
        const trap = spikeTraps[i];
        const distance = playerPos.distanceTo(trap.position);
        
        if (distance < trapDistance) {
            // Track trap triggering for statistics and achievements
            trackTrapTriggered();
            
            damagePlayer();
            break; // Only one trap can damage per frame
        }
    }
}

// Function to create teleport tiles
function createTeleportTiles(pairCount = 2) {
    // Clear existing teleport tiles
    clearTeleportTiles();
    
    const occupiedPositions = new Set();
    // Mark important positions as occupied
    occupiedPositions.add(`${playerStartPosition.gridX},${playerStartPosition.gridZ}`);
    occupiedPositions.add(`${gridSize - 1},${gridSize - 1}`);
    
    // Also mark spike trap positions as occupied
    spikeTraps.forEach(trap => {
        occupiedPositions.add(`${trap.gridX},${trap.gridZ}`);
    });
    
    // Create teleport pairs
    for (let i = 0; i < pairCount; i++) {
        const pairPositions = [];
        
        // Find two positions for the teleport pair
        for (let j = 0; j < 2; j++) {
            let teleportGridX, teleportGridZ;
            let attempts = 0;
            
            do {
                teleportGridX = Math.floor(Math.random() * gridSize);
                teleportGridZ = Math.floor(Math.random() * gridSize);
                attempts++;
            } while (occupiedPositions.has(`${teleportGridX},${teleportGridZ}`) && attempts < 100);
            
            if (attempts < 100) {
                occupiedPositions.add(`${teleportGridX},${teleportGridZ}`);
                pairPositions.push({ gridX: teleportGridX, gridZ: teleportGridZ });
            }
        }
        
        // Create the teleport pair if we found two positions
        if (pairPositions.length === 2) {
            const teleportA = createTeleportTile(pairPositions[0].gridX, pairPositions[0].gridZ, i);
            const teleportB = createTeleportTile(pairPositions[1].gridX, pairPositions[1].gridZ, i);
            
            // Link them together
            teleportA.destination = teleportB;
            teleportB.destination = teleportA;
        }
    }
}

// Function to create a single teleport tile
function createTeleportTile(gridX, gridZ, pairId) {
    const teleportGroup = new THREE.Group();
    
    // Base platform
    const baseGeometry = new THREE.CylinderGeometry(0.9, 0.9, 0.2, 16);
    const baseMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x4400ff,
        emissive: 0x220088,
        transparent: true,
        opacity: 0.8
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(0, 0.1, 0);
    teleportGroup.add(base);
    
    // Portal ring
    const ringGeometry = new THREE.TorusGeometry(0.6, 0.1, 8, 16);
    const ringMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x8800ff,
        emissive: 0x4400aa
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(0, 0.3, 0);
    ring.rotation.x = Math.PI / 2;
    teleportGroup.add(ring);
    
    // Energy particles (multiple small spheres)
    for (let i = 0; i < 6; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xccaaff,
            transparent: true,
            opacity: 0.7
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        // Position particles in a circle
        const angle = (i / 6) * Math.PI * 2;
        particle.position.set(
            Math.cos(angle) * 0.4,
            0.3,
            Math.sin(angle) * 0.4
        );
        teleportGroup.add(particle);
    }
    
    // Position the teleport group
    teleportGroup.position.copy(gridToWorld(gridX, gridZ));
    teleportGroup.position.y = 0.1;
    teleportGroup.castShadow = true;
    teleportGroup.receiveShadow = true;
    
    // Store grid position and pair info
    teleportGroup.gridX = gridX;
    teleportGroup.gridZ = gridZ;
    teleportGroup.pairId = pairId;
    teleportGroup.destination = null; // Will be set when pair is created
    
    // Add animation data
    teleportGroup.userData = {
        originalY: teleportGroup.position.y,
        animationOffset: Math.random() * Math.PI * 2
    };
    
    worldGroup.add(teleportGroup);
    teleportTiles.push(teleportGroup);
    
    return teleportGroup;
}

// Function to clear all teleport tiles
function clearTeleportTiles() {
    teleportTiles.forEach(tile => {
        worldGroup.remove(tile);
    });
    teleportTiles.length = 0;
}

// Function to teleport player
function teleportPlayer(teleportTile) {
    if (!teleportTile.destination || playerState.isMoving) return;
    
    // Play teleport sound effect
    soundManager.play('teleport');
    
    // Show teleport effect at current position
    showTeleportEffect(player.position);
    
    // Update player position
    playerState.gridX = teleportTile.destination.gridX;
    playerState.gridZ = teleportTile.destination.gridZ;
    
    // Update player world position
    const destinationPos = gridToWorld(teleportTile.destination.gridX, teleportTile.destination.gridZ);
    player.position.copy(destinationPos);
    
    // Track teleport usage for statistics and achievements
    trackTeleportUsage();
    
    // Show teleport effect at destination
    setTimeout(() => {
        showTeleportEffect(player.position);
    }, 200);
    
    // Update UI
    updatePlayerPosition();
    
    // Show teleport message
    showMessage('Teleported!', '#8800ff', 1500);
}

// Function to show teleport effect
function showTeleportEffect(position) {
    // Create swirling particles
    for (let i = 0; i < 12; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x8800ff,
            transparent: true,
            opacity: 0.9
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.copy(position);
        particle.position.y += 0.5;
        worldGroup.add(particle);
        
        // Swirling motion
        const radius = 0.5;
        const height = 1.5;
        const speed = 0.1;
        const startAngle = (i / 12) * Math.PI * 2;
        
        // Animate particle in spiral
        const startTime = Date.now();
        const animateParticle = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / 1000; // 1 second animation
            
            if (progress < 1) {
                const angle = startAngle + progress * Math.PI * 4;
                const currentRadius = radius * (1 - progress);
                const currentHeight = height * progress;
                
                particle.position.x = position.x + Math.cos(angle) * currentRadius;
                particle.position.z = position.z + Math.sin(angle) * currentRadius;
                particle.position.y = position.y + currentHeight;
                
                particle.material.opacity = 0.9 * (1 - progress);
                requestAnimationFrame(animateParticle);
            } else {
                worldGroup.remove(particle);
            }
        };
        animateParticle();
    }
}

// Function to animate teleport tiles
function animateTeleportTiles() {
    const time = Date.now() * 0.001;
    
    teleportTiles.forEach(tile => {
        if (tile.userData) {
            // Floating animation
            tile.position.y = tile.userData.originalY + Math.sin(time * 3 + tile.userData.animationOffset) * 0.1;
            
            // Rotate the portal ring
            const ring = tile.children[1]; // Second child is the ring
            if (ring) {
                ring.rotation.z += 0.05;
            }
            
            // Animate particles around the ring
            for (let i = 2; i < tile.children.length; i++) {
                const particle = tile.children[i];
                if (particle) {
                    const angle = time * 2 + (i - 2) * (Math.PI * 2 / 6);
                    particle.position.x = Math.cos(angle) * 0.4;
                    particle.position.z = Math.sin(angle) * 0.4;
                    particle.position.y = 0.3 + Math.sin(time * 4 + i) * 0.1;
                }
            }
        }
    });
}

// Function to check teleport tile collision
function checkTeleportTileCollision() {
    if (playerState.isMoving || gameScore.lives <= 0) return;
    
    const playerPos = player.position;
    const teleportDistance = getConfigValue('physics.teleportDistance', 0.7);
    
    for (let i = 0; i < teleportTiles.length; i++) {
        const tile = teleportTiles[i];
        const distance = playerPos.distanceTo(tile.position);
        
        if (distance < teleportDistance) {
            teleportPlayer(tile);
            break; // Only one teleport per frame
        }
    }
}

// Create floor tiles with configurable size
let tileSize, gridSize;
const floorTiles = [];

// Initialize tile and grid settings from config
function initializeTileSettings() {
    tileSize = getConfigValue('gameplay.tileSize', 2);
    gridSize = getConfigValue('gameplay.gridSize', 10);
}

// Create materials for checkerboard pattern
const lightTileMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
const darkTileMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });

// Create tile geometry (thin boxes)
const tileGeometry = new THREE.BoxGeometry(tileSize, 0.1, tileSize);

// Generate the grid of tiles
for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
        // Determine tile color using checkerboard pattern
        const isLight = (i + j) % 2 === 0;
        const material = isLight ? lightTileMaterial : darkTileMaterial;
        
        // Create tile
        const tile = new THREE.Mesh(tileGeometry, material);
        
        // Position tile in grid
        const x = (i - gridSize / 2 + 0.5) * tileSize;
        const z = (j - gridSize / 2 + 0.5) * tileSize;
        tile.position.set(x, 0, z);
        
        // Enable shadow receiving
        tile.receiveShadow = true;
        
        // Add to world group and store reference
        worldGroup.add(tile);
        floorTiles.push(tile);
    }
}

// Add visual boundary markers around the grid
const boundaryMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x444444,
    transparent: true,
    opacity: 0.8
});

// Create boundary walls
const wallHeight = getConfigValue('visual.wallHeight', 0.5);
const wallThickness = getConfigValue('visual.wallThickness', 0.1);
const gridWorldSize = gridSize * tileSize;

// North wall (negative Z)
const northWall = new THREE.Mesh(
    new THREE.BoxGeometry(gridWorldSize + wallThickness * 2, wallHeight, wallThickness),
    boundaryMaterial
);
northWall.position.set(0, wallHeight / 2, -gridWorldSize / 2 - wallThickness / 2);
northWall.receiveShadow = true;
worldGroup.add(northWall);

// South wall (positive Z)
const southWall = new THREE.Mesh(
    new THREE.BoxGeometry(gridWorldSize + wallThickness * 2, wallHeight, wallThickness),
    boundaryMaterial
);
southWall.position.set(0, wallHeight / 2, gridWorldSize / 2 + wallThickness / 2);
southWall.receiveShadow = true;
worldGroup.add(southWall);

// West wall (negative X)
const westWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, gridWorldSize),
    boundaryMaterial
);
westWall.position.set(-gridWorldSize / 2 - wallThickness / 2, wallHeight / 2, 0);
westWall.receiveShadow = true;
worldGroup.add(westWall);

// East wall (positive X)
const eastWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, gridWorldSize),
    boundaryMaterial
);
eastWall.position.set(gridWorldSize / 2 + wallThickness / 2, wallHeight / 2, 0);
eastWall.receiveShadow = true;
worldGroup.add(eastWall);

// Third-person camera system
let cameraSystem;

// Initialize camera system from config
function initializeCameraSystem() {
    const smoothness = getConfigValue('camera.smoothness', 0.1);
    const defaultOffset = getConfigValue('camera.defaultOffset', { x: 0, y: 4, z: 6 });
    const defaultTarget = getConfigValue('camera.defaultTarget', { x: 0, y: 1, z: 0 });
    
    cameraSystem = {
        offset: new THREE.Vector3(defaultOffset.x, defaultOffset.y, defaultOffset.z),
        target: new THREE.Vector3(defaultTarget.x, defaultTarget.y, defaultTarget.z),
        smoothness: smoothness,
        currentPosition: new THREE.Vector3(5, 5, 5),
        currentTarget: new THREE.Vector3(0, 1, 0),
        enabled: true,
        currentPreset: 'default',
        presets: {
            default: {
                offset: new THREE.Vector3(defaultOffset.x, defaultOffset.y, defaultOffset.z),
                target: new THREE.Vector3(defaultTarget.x, defaultTarget.y, defaultTarget.z),
                name: 'Default (Behind)'
            },
            front: {
                offset: new THREE.Vector3(0, 4, -6),
                target: new THREE.Vector3(0, 1, 0),
                name: 'Front View'
            },
            top: {
                offset: new THREE.Vector3(0, 8, 0),
                target: new THREE.Vector3(0, 0, 0),
                name: 'Top View'
            },
            side: {
                offset: new THREE.Vector3(6, 4, 0),
                target: new THREE.Vector3(0, 1, 0),
                name: 'Side View'
            }
        }
    };
}

// Camera positioning is now handled in the init function

// Store original camera settings for rotation calculations
const originalCameraOffset = cameraSystem.presets.default.offset.clone();
const originalCameraTarget = cameraSystem.presets.default.target.clone();

// Optional: Keep OrbitControls for debugging (disabled by default)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false; // Disable orbit controls for third-person camera
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 1, 0); // Set initial target for controls

// Store original controls target for rotation calculations
const originalControlsTarget = controls.target.clone();

// Player movement system
const playerState = {
    gridX: 5, // Center of 10x10 grid (0-indexed, so 5 is middle)
    gridZ: 5,
    isMoving: false,
    targetPosition: new THREE.Vector3(0, 0.55, 0),
    baseRotation: {
        x: 0,
        z: 0
    }
};

// Game scoring system
const gameScore = {
    coins: 0,
    totalCoins: 0,
    hasKey: false,
    levelComplete: false,
    currentLevel: 1,
    totalScore: 0,
    lives: 3,
    maxLives: 3
};

// World rotation system
const worldState = {
    isRotating: false,
    currentRotation: new THREE.Vector3(0, 0, 0),
    targetRotation: new THREE.Vector3(0, 0, 0),
    gravityDirection: new THREE.Vector3(0, -1, 0) // Current gravity direction
};

// Groups have been moved to the beginning of the file for proper initialization order

// Movement animation variables
let moveStartTime = 0;
let moveDuration = 0.3; // seconds (loaded from config)
let moveStartPos = new THREE.Vector3();
let moveEndPos = new THREE.Vector3();

// Initialize movement settings from config
function initializeMovementSettings() {
    moveDuration = getConfigValue('gameplay.moveDuration', 0.3);
}

// Convert grid coordinates to world position
function gridToWorld(gridX, gridZ) {
    const x = (gridX - gridSize / 2 + 0.5) * tileSize;
    const z = (gridZ - gridSize / 2 + 0.5) * tileSize;
    return new THREE.Vector3(x, 0.55, z);
}

// Move player to grid position with animation
function movePlayerTo(newGridX, newGridZ) {
    // Don't move if already moving or rotating
    if (playerState.isMoving || worldState.isRotating) {
        return false;
    }
    
    // Check if this is a boundary movement (trying to move beyond grid)
    if (newGridX < 0 || newGridX >= gridSize || newGridZ < 0 || newGridZ >= gridSize) {
        // Calculate movement direction
        const deltaX = newGridX - playerState.gridX;
        const deltaZ = newGridZ - playerState.gridZ;
        
        // Try to transition to a new surface
        const surfaceTransition = detectSurfaceTransition(deltaX, deltaZ);
        if (surfaceTransition.isValid) {
            return transitionToSurface(surfaceTransition);
        }
        
        // If not a valid surface transition, provide boundary feedback
        triggerBoundaryFeedback();
        console.log(`Blocked: Cannot move to (${newGridX}, ${newGridZ}) - outside grid bounds`);
        return false;
    }
    
    // Verify target tile exists (additional safety check)
    const targetTileIndex = newGridZ * gridSize + newGridX;
    if (targetTileIndex < 0 || targetTileIndex >= floorTiles.length) {
        console.log(`Blocked: Target tile index ${targetTileIndex} out of range`);
        return false;
    }
    
    // Start normal movement
    playerState.isMoving = true;
    playerState.gridX = newGridX;
    playerState.gridZ = newGridZ;
    
    moveStartPos.copy(player.position);
    moveEndPos.copy(gridToWorld(newGridX, newGridZ));
    moveStartTime = Date.now();
    
    // Play rolling sound effect
    soundManager.play('roll');
    
    console.log(`Moving to grid position (${newGridX}, ${newGridZ})`);
    updatePlayerPosition();
    return true;
}

// Check if player is at an edge of the grid
function isPlayerAtEdge() {
    const { gridX, gridZ } = playerState;
    return {
        isAtEdge: gridX === 0 || gridX === gridSize - 1 || gridZ === 0 || gridZ === gridSize - 1,
        edge: gridX === 0 ? 'west' : 
              gridX === gridSize - 1 ? 'east' : 
              gridZ === 0 ? 'north' : 
              gridZ === gridSize - 1 ? 'south' : null
    };
}

// Detect if player is trying to move onto a valid surface
function detectSurfaceTransition(deltaX, deltaZ) {
    const { gridX, gridZ } = playerState;
    
    // Check if player is at an edge and trying to move beyond it
    let surfaceDirection = null;
    let isValidTransition = false;
    
    if (deltaX < 0 && gridX === 0) {
        // Moving west beyond west edge
        surfaceDirection = 'west';
        isValidTransition = true;
    } else if (deltaX > 0 && gridX === gridSize - 1) {
        // Moving east beyond east edge
        surfaceDirection = 'east';
        isValidTransition = true;
    } else if (deltaZ < 0 && gridZ === 0) {
        // Moving north beyond north edge
        surfaceDirection = 'north';
        isValidTransition = true;
    } else if (deltaZ > 0 && gridZ === gridSize - 1) {
        // Moving south beyond south edge
        surfaceDirection = 'south';
        isValidTransition = true;
    }
    
    return {
        isValid: isValidTransition,
        direction: surfaceDirection,
        deltaX: deltaX,
        deltaZ: deltaZ
    };
}

// Transition to a new surface by rotating the world
function transitionToSurface(surfaceTransition) {
    if (!surfaceTransition.isValid) return false;
    
    // Show transition message
    const messageElement = document.getElementById('message');
    if (messageElement) {
        messageElement.textContent = `Transitioning to ${surfaceTransition.direction} surface...`;
        messageElement.style.color = '#66ccff';
    }
    
    // Determine rotation based on surface direction
    let rotationAxis, rotationAmount;
    switch (surfaceTransition.direction) {
        case 'north':
            rotationAxis = 'x';
            rotationAmount = Math.PI / 2;
            break;
        case 'south':
            rotationAxis = 'x';
            rotationAmount = -Math.PI / 2;
            break;
        case 'east':
            rotationAxis = 'z';
            rotationAmount = Math.PI / 2;
            break;
        case 'west':
            rotationAxis = 'z';
            rotationAmount = -Math.PI / 2;
            break;
        default:
            return false;
    }
    
    // Calculate where player should be on the new surface
    const newPlayerPos = calculateSurfaceTransitionPosition(surfaceTransition.direction);
    
    // Execute the gravity shift
    executeGravityShift(rotationAxis, rotationAmount, newPlayerPos, `${surfaceTransition.direction} surface`);
    
    return true;
}

// Execute gravity shift animation
function executeGravityShift(rotationAxis, rotationAmount, newPlayerPos, surfaceDescription) {
    if (worldState.isRotating || playerState.isMoving) return false;
    
    worldState.isRotating = true;
    const rotationStartTime = Date.now();
    const rotationDuration = getConfigValue('gameplay.rotationDuration', 1500);
    
    // Play gravity shift sound effect
    soundManager.play('gravityShift');
    
    // Store starting rotations for all groups
    const startWorldRotation = worldState.currentRotation.clone();
    const startLightRotation = lightGroup.rotation.clone();
    const startCameraRotation = cameraGroup.rotation.clone();
    
    // Set target rotation
    worldState.targetRotation[rotationAxis] = startWorldRotation[rotationAxis] + rotationAmount;
    
    // Update gravity direction
    const gravityRotation = new THREE.Euler();
    gravityRotation[rotationAxis] = rotationAmount;
    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(gravityRotation);
    worldState.gravityDirection.applyMatrix4(rotationMatrix);
    
    // Animate world rotation
    const animateRotation = () => {
        const elapsed = Date.now() - rotationStartTime;
        const progress = Math.min(elapsed / rotationDuration, 1);
        
        // Smooth easing with ease-in-out for gravity shift feeling
        const easeProgress = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        // Update all group rotations consistently
        const currentRotationAmount = rotationAmount * easeProgress;
        
        // Update world rotation
        worldState.currentRotation[rotationAxis] = startWorldRotation[rotationAxis] + currentRotationAmount;
        worldGroup.rotation[rotationAxis] = worldState.currentRotation[rotationAxis];
        
        // Update light rotation (lights rotate with world)
        lightGroup.rotation[rotationAxis] = startLightRotation[rotationAxis] + currentRotationAmount;
        
        // Update camera rotation (camera rotates with world for gravity consistency)
        cameraGroup.rotation[rotationAxis] = startCameraRotation[rotationAxis] + currentRotationAmount;
        
        // Update camera system orientation during rotation
        const rotationEuler = new THREE.Euler();
        rotationEuler[rotationAxis] = currentRotationAmount;
        const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(rotationEuler);
        
        // Update camera offset and target based on rotation
        const currentPreset = cameraSystem.presets[cameraSystem.currentPreset];
        cameraSystem.offset.copy(currentPreset.offset).applyMatrix4(rotationMatrix);
        cameraSystem.target.copy(currentPreset.target).applyMatrix4(rotationMatrix);
        
        // Update controls target if orbit controls are enabled
        if (controls.enabled) {
            const rotatedTarget = originalControlsTarget.clone().applyMatrix4(rotationMatrix);
            controls.target.copy(rotatedTarget);
        }
        
        if (progress < 1) {
            requestAnimationFrame(animateRotation);
        } else {
            // Rotation complete
            worldState.isRotating = false;
            worldState.currentRotation[rotationAxis] = worldState.targetRotation[rotationAxis];
            
            // Update player position
            playerState.gridX = newPlayerPos.gridX;
            playerState.gridZ = newPlayerPos.gridZ;
            
            // Update player world position
            const newWorldPos = gridToWorld(playerState.gridX, playerState.gridZ);
            player.position.copy(newWorldPos);
            
            // Update controls for new gravity orientation
            updateControlsForGravity();
            
            updatePlayerPosition();
            
            // Show completion message
            const messageElement = document.getElementById('message');
            if (messageElement) {
                messageElement.textContent = `Gravity shifted to ${surfaceDescription}!`;
                messageElement.style.color = '#66ff66';
                setTimeout(() => {
                    messageElement.textContent = '';
                }, 2000);
            }
        }
    };
    
    animateRotation();
    return true;
}

// Rotate world 90 degrees around the appropriate axis (manual Space key)
function rotateWorld() {
    if (worldState.isRotating || playerState.isMoving) return false;
    
    const edgeInfo = isPlayerAtEdge();
    if (!edgeInfo.isAtEdge) return false;
    
    // Show rotation message
    const messageElement = document.getElementById('message');
    if (messageElement) {
        messageElement.textContent = 'Manually shifting gravity...';
        messageElement.style.color = '#66ccff';
    }
    
    // Determine rotation axis and direction based on edge
    let rotationAxis, rotationAmount;
    switch (edgeInfo.edge) {
        case 'north': // Player at top edge, rotate around X axis
            rotationAxis = 'x';
            rotationAmount = Math.PI / 2;
            break;
        case 'south': // Player at bottom edge, rotate around X axis
            rotationAxis = 'x';
            rotationAmount = -Math.PI / 2;
            break;
        case 'east': // Player at right edge, rotate around Z axis
            rotationAxis = 'z';
            rotationAmount = Math.PI / 2;
            break;
        case 'west': // Player at left edge, rotate around Z axis
            rotationAxis = 'z';
            rotationAmount = -Math.PI / 2;
            break;
    }
    
    // Calculate new player position after rotation
    const newPlayerPos = calculateNewPlayerPosition(edgeInfo.edge);
    
    // Execute the gravity shift
    return executeGravityShift(rotationAxis, rotationAmount, newPlayerPos, `${edgeInfo.edge} edge surface`);
}

// Set camera preset
function setCameraPreset(presetName) {
    if (!cameraSystem.enabled) return;
    
    const preset = cameraSystem.presets[presetName];
    if (!preset) return;
    
    cameraSystem.currentPreset = presetName;
    cameraSystem.offset.copy(preset.offset);
    cameraSystem.target.copy(preset.target);
    
    // Track camera preset usage for statistics and achievements
    trackCameraPresetUsage(presetName);
    
    // Apply current world rotation to the new preset
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeRotationFromEuler(worldGroup.rotation);
    cameraSystem.offset.applyMatrix4(rotationMatrix);
    cameraSystem.target.applyMatrix4(rotationMatrix);
    
    // Show preset change message
    const messageElement = document.getElementById('message');
    if (messageElement) {
        messageElement.textContent = `Camera preset: ${preset.name}`;
        messageElement.style.color = '#66ccff';
        setTimeout(() => {
            messageElement.textContent = '';
        }, 1500);
    }
    
    // Update UI
    updateCameraPresetUI();
}

// Cycle through camera presets
function cycleCameraPreset() {
    if (!cameraSystem.enabled) return;
    
    const presetNames = Object.keys(cameraSystem.presets);
    const currentIndex = presetNames.indexOf(cameraSystem.currentPreset);
    const nextIndex = (currentIndex + 1) % presetNames.length;
    const nextPreset = presetNames[nextIndex];
    
    setCameraPreset(nextPreset);
}

// Update camera preset UI
function updateCameraPresetUI() {
    const presetElement = document.getElementById('camera-preset');
    if (presetElement && cameraSystem.enabled) {
        const preset = cameraSystem.presets[cameraSystem.currentPreset];
        presetElement.textContent = `Current preset: ${preset.name}`;
    }
}

// Update third-person camera to follow player
function updateThirdPersonCamera() {
    if (!cameraSystem.enabled) return;
    
    // Get player position in world space
    const playerWorldPos = new THREE.Vector3();
    player.getWorldPosition(playerWorldPos);
    
    // Calculate desired camera position using current offset
    const desiredCameraPos = playerWorldPos.clone().add(cameraSystem.offset);
    
    // Calculate desired camera target (what to look at) using current target offset
    const desiredCameraTarget = playerWorldPos.clone().add(cameraSystem.target);
    
    // Smooth interpolation for camera position and target
    cameraSystem.currentPosition.lerp(desiredCameraPos, cameraSystem.smoothness);
    cameraSystem.currentTarget.lerp(desiredCameraTarget, cameraSystem.smoothness);
    
    // Update camera position and orientation
    camera.position.copy(cameraSystem.currentPosition);
    camera.lookAt(cameraSystem.currentTarget);
    
    // Update camera up vector based on gravity
    const up = worldState.gravityDirection.clone().negate();
    camera.up.copy(up);
}

// Toggle between third-person and orbit camera modes
function toggleCameraMode() {
    cameraSystem.enabled = !cameraSystem.enabled;
    controls.enabled = !controls.enabled;
    
    // Track camera mode switching for statistics and achievements
    trackCameraModeSwitch();
    
    const messageElement = document.getElementById('message');
    const cameraMode = document.getElementById('camera-mode');
    const presetElement = document.getElementById('camera-preset');
    
    if (cameraSystem.enabled) {
        // Switching to third-person
        if (messageElement) {
            messageElement.textContent = 'Camera mode: Third-person';
            messageElement.style.color = '#66ccff';
            setTimeout(() => {
                messageElement.textContent = '';
            }, 1500);
        }
        if (cameraMode) {
            cameraMode.textContent = 'Third-person camera: Follows player smoothly with gravity-aware orientation';
        }
        
        // Update preset UI
        updateCameraPresetUI();
        if (presetElement) {
            presetElement.style.display = 'block';
        }
    } else {
        // Switching to orbit controls
        if (messageElement) {
            messageElement.textContent = 'Camera mode: Orbit (Left click + drag: Orbit | Right click + drag: Pan | Mouse wheel: Zoom)';
            messageElement.style.color = '#66ccff';
            setTimeout(() => {
                messageElement.textContent = '';
            }, 2000);
        }
        if (cameraMode) {
            cameraMode.textContent = 'Orbit camera: Left click + drag: Orbit | Right click + drag: Pan | Mouse wheel: Zoom';
        }
        
        // Hide preset UI
        if (presetElement) {
            presetElement.style.display = 'none';
        }
        
        // Reset orbit controls when switching to it
        controls.reset();
        controls.target.set(0, 1, 0);
    }
}

// Reset camera position to default
function resetCameraPosition() {
    if (cameraSystem.enabled) {
        // Reset third-person camera to default preset
        setCameraPreset('default');
        cameraSystem.currentPosition.set(5, 5, 5);
        cameraSystem.currentTarget.set(0, 1, 0);
    } else {
        // Reset orbit controls
        controls.reset();
        controls.target.set(0, 1, 0);
    }
    
    const messageElement = document.getElementById('message');
    if (messageElement) {
        messageElement.textContent = 'Camera position reset';
        messageElement.style.color = '#66ccff';
        setTimeout(() => {
            messageElement.textContent = '';
        }, 1500);
    }
}

// Update controls based on current gravity direction
function updateControlsForGravity() {
    // Calculate the "up" direction based on current gravity
    const up = worldState.gravityDirection.clone().negate();
    
    // Update camera up vector
    camera.up.copy(up);
    
    // Update third-person camera
    updateThirdPersonCamera();
    
    // Update orbit controls if enabled
    if (controls.enabled) {
        controls.update();
    }
}

// Calculate player's new position when transitioning to a surface
function calculateSurfaceTransitionPosition(surfaceDirection) {
    const { gridX, gridZ } = playerState;
    
    switch (surfaceDirection) {
        case 'north': // Moving to north wall (becomes floor)
            // Player was at gridZ = 0, now should be at the "far" edge of rotated surface
            return { gridX: gridZ, gridZ: gridSize - 1 };
        case 'south': // Moving to south wall (becomes floor)
            // Player was at gridZ = gridSize-1, now should be at the "near" edge of rotated surface
            return { gridX: gridSize - 1 - gridZ, gridZ: 0 };
        case 'east': // Moving to east wall (becomes floor)
            // Player was at gridX = gridSize-1, now should be at the "left" edge of rotated surface
            return { gridX: 0, gridZ: gridSize - 1 - gridX };
        case 'west': // Moving to west wall (becomes floor)
            // Player was at gridX = 0, now should be at the "right" edge of rotated surface
            return { gridX: gridSize - 1, gridZ: gridX };
        default:
            return { gridX, gridZ };
    }
}

// Calculate player's new position after world rotation (legacy function for Space key)
function calculateNewPlayerPosition(edge) {
    // Use the same logic as surface transition
    return calculateSurfaceTransitionPosition(edge);
}

// Visual feedback for boundary collisions
function triggerBoundaryFeedback() {
    // Create a brief shake effect
    const originalPosition = player.position.clone();
    const shakeIntensity = 0.1;
    const shakeDuration = 200; // milliseconds
    
    // Red flash effect for boundary collision
    const originalColor = player.material.color.clone();
    player.material.color.setHex(0xff0000);
    
    // Show boundary message
    const messageElement = document.getElementById('message');
    if (messageElement) {
        messageElement.textContent = 'Cannot move beyond grid boundary!';
        setTimeout(() => {
            messageElement.textContent = '';
        }, 1500);
    }
    
    // Shake animation
    const shakeStart = Date.now();
    const shakeAnimation = () => {
        const elapsed = Date.now() - shakeStart;
        const progress = elapsed / shakeDuration;
        
        if (progress < 1) {
            // Apply shake offset
            const shakeX = (Math.random() - 0.5) * shakeIntensity * (1 - progress);
            const shakeZ = (Math.random() - 0.5) * shakeIntensity * (1 - progress);
            
            player.position.x = originalPosition.x + shakeX;
            player.position.z = originalPosition.z + shakeZ;
            
            requestAnimationFrame(shakeAnimation);
        } else {
            // Reset position and color
            player.position.copy(originalPosition);
            player.material.color.copy(originalColor);
        }
    };
    
    shakeAnimation();
}

// Keyboard input handling
const keys = {};
document.addEventListener('keydown', (event) => {
    keys[event.code] = true;
    
    // Handle pause menu toggle first (works even when paused)
    if (event.code === 'KeyP') {
        togglePauseMenu();
        return;
    }
    
    // Handle ESC key for level menu (works even when paused)
    if (event.code === 'Escape') {
        event.preventDefault();
        toggleLevelMenu();
        return;
    }
    
    // Skip all other inputs if game is paused
    if (gameState.isPaused) {
        return;
    }
    
    // Handle movement
    if (!playerState.isMoving && !worldState.isRotating) {
        switch(event.code) {
            case 'ArrowUp':
            case 'KeyW':
                movePlayerTo(playerState.gridX, playerState.gridZ - 1);
                break;
            case 'ArrowDown':
            case 'KeyS':
                movePlayerTo(playerState.gridX, playerState.gridZ + 1);
                break;
            case 'ArrowLeft':
            case 'KeyA':
                movePlayerTo(playerState.gridX - 1, playerState.gridZ);
                break;
            case 'ArrowRight':
            case 'KeyD':
                movePlayerTo(playerState.gridX + 1, playerState.gridZ);
                break;
            case 'Space':
                event.preventDefault(); // Prevent page scroll
                const edgeInfo = isPlayerAtEdge();
                if (edgeInfo.isAtEdge) {
                    rotateWorld();
                } else {
                    const messageElement = document.getElementById('message');
                    if (messageElement) {
                        messageElement.textContent = 'Move to an edge tile for manual gravity shift, or walk into walls for automatic surface transitions!';
                        messageElement.style.color = '#ffaa00';
                        setTimeout(() => {
                            messageElement.textContent = '';
                        }, 3000);
                    }
                }
                break;
            case 'KeyC':
                // Toggle between third-person and orbit camera
                toggleCameraMode();
                break;
            case 'KeyR':
                // Reload config (when holding Ctrl), reload level data (when holding Shift) or reset camera position
                if (event.ctrlKey) {
                    event.preventDefault();
                    reloadConfig();
                } else if (event.shiftKey) {
                    event.preventDefault();
                    reloadLevelData();
                } else {
                    // Reset camera position
                    resetCameraPosition();
                }
                break;
            case 'Digit1':
                // Set default camera preset
                setCameraPreset('default');
                break;
            case 'Digit2':
                // Set front camera preset
                setCameraPreset('front');
                break;
            case 'Digit3':
                // Set top camera preset
                setCameraPreset('top');
                break;
            case 'Digit4':
                // Set side camera preset
                setCameraPreset('side');
                break;
            case 'Tab':
                // Cycle through camera presets
                event.preventDefault();
                cycleCameraPreset();
                break;
            case 'KeyN':
                // Restart game from level 1
                restartGame();
                break;
            case 'KeyM':
                // Skip to next level (cheat code)
                if (!gameScore.levelComplete) {
                    gameScore.hasKey = true;
                    updateScoreDisplay();
                    
                    const messageElement = document.getElementById('message');
                    if (messageElement) {
                        messageElement.textContent = 'Cheat: Key obtained! Now reach the goal!';
                        messageElement.style.color = '#ff6600';
                        setTimeout(() => {
                            messageElement.textContent = '';
                        }, 2000);
                    }
                    
                    // Update goal tile appearance
                    if (goalTile) {
                        goalTile.material.color.setHex(0x00ff00);
                        goalTile.material.emissive.setHex(0x003300);
                        goalTile.material.opacity = 0.9;
                    }
                }
                break;
            case 'KeyL':
                // Toggle level mode (JSON vs Random)
                toggleLevelMode();
                break;
            case 'BracketLeft':
                // Previous JSON level
                previousJsonLevel();
                break;
            case 'BracketRight':
                // Next JSON level
                nextJsonLevel();
                break;
            case 'KeyQ':
                // Return to lobby (when in game)
                if (gameState.currentState === 'in-game') {
                    returnToLobby();
                }
                break;

        }
    }
    
    // Handle progression choice during completion screen
    if (gameState.awaitingProgressionChoice) {
        switch(event.code) {
            case 'Digit1':
                handleProgressionChoice('restart');
                break;
            case 'Digit2':
                handleProgressionChoice('random');
                break;
            case 'Digit3':
                handleProgressionChoice('loop');
                break;
        }
    }
    

});

document.addEventListener('keyup', (event) => {
    keys[event.code] = false;
});

// Update player position and animation
function updatePlayer() {
    // Don't update player movement during world rotation
    if (worldState.isRotating) return;
    
    if (playerState.isMoving) {
        const elapsed = (Date.now() - moveStartTime) / 1000;
        const progress = Math.min(elapsed / moveDuration, 1);
        
        // Smooth interpolation with ease-in-out for more natural movement
        const easeProgress = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        // Update position
        player.position.lerpVectors(moveStartPos, moveEndPos, easeProgress);
        
        // Enhanced rolling animation
        const distance = moveStartPos.distanceTo(moveEndPos);
        const sphereRadius = 0.5; // Match the sphere's radius
        const circumference = 2 * Math.PI * sphereRadius;
        
        // Calculate how much the sphere should rotate based on distance traveled
        const totalRotation = (distance / circumference) * 2 * Math.PI;
        const currentRotation = totalRotation * easeProgress;
        
        // Determine movement direction
        const deltaX = moveEndPos.x - moveStartPos.x;
        const deltaZ = moveEndPos.z - moveStartPos.z;
        
        // Store the base rotation to accumulate rolls
        if (!playerState.baseRotation) {
            playerState.baseRotation = {
                x: 0,
                z: 0
            };
        }
        
        // Apply rotation based on movement direction
        if (Math.abs(deltaX) > Math.abs(deltaZ)) {
            // Moving along X axis (left/right)
            player.rotation.x = playerState.baseRotation.x;
            player.rotation.z = playerState.baseRotation.z - currentRotation * Math.sign(deltaX);
        } else {
            // Moving along Z axis (forward/backward)
            player.rotation.x = playerState.baseRotation.x + currentRotation * Math.sign(deltaZ);
            player.rotation.z = playerState.baseRotation.z;
        }
        
        // Add a subtle bounce effect at the peak of movement
        const bounceHeight = 0.1 * Math.sin(easeProgress * Math.PI);
        player.position.y = 0.55 + bounceHeight;
        
        // Check if movement is complete
        if (progress >= 1) {
            playerState.isMoving = false;
            player.position.copy(moveEndPos);
            player.position.y = 0.55; // Reset to ground level
            
            // Update base rotation to accumulate the roll
            if (Math.abs(deltaX) > Math.abs(deltaZ)) {
                playerState.baseRotation.z -= totalRotation * Math.sign(deltaX);
            } else {
                playerState.baseRotation.x += totalRotation * Math.sign(deltaZ);
            }
            
            // Keep rotations within reasonable bounds to prevent overflow
            playerState.baseRotation.x = playerState.baseRotation.x % (2 * Math.PI);
            playerState.baseRotation.z = playerState.baseRotation.z % (2 * Math.PI);
            
            // Update position display after movement completes
            updatePlayerPosition();
        }
    }
}

// Socket.io client setup (moved to top of file)

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    updateStatus('Connected');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateStatus('Disconnected');
});

socket.on('connect_error', (error) => {
    console.log('Connection error:', error);
    updateStatus('Connection Error');
    
    // Show connection error message
    showMessage('Connection error. Retrying...', '#ff6666', 2000);
    
    // Attempt to reconnect
    attemptReconnection();
});

// Game state management
const gameState = {
    players: {},
    objects: {},
    awaitingProgressionChoice: false,
    progressionChoiceTimeout: null,
    currentState: 'lobby', // 'lobby', 'starting', 'in-game'
    isPaused: false
};

// Pause menu functions
function togglePauseMenu() {
    if (gameState.currentState !== 'in-game') return;
    
    // Play menu click sound
    soundManager.play('menuClick');
    
    gameState.isPaused = !gameState.isPaused;
    const pauseMenu = document.getElementById('pause-menu');
    
    if (gameState.isPaused) {
        pauseMenu.classList.remove('hidden');
        // Disable game controls while paused
        document.body.style.cursor = 'default';
        // Pause background music
        soundManager.stopBackgroundMusic();
    } else {
        pauseMenu.classList.add('hidden');
        // Re-enable game controls
        document.body.style.cursor = 'none';
        // Resume background music
        soundManager.startBackgroundMusic();
    }
}

function resumeGame() {
    if (gameState.isPaused) {
        // Play menu click sound
        soundManager.play('menuClick');
        
        gameState.isPaused = false;
        const pauseMenu = document.getElementById('pause-menu');
        pauseMenu.classList.add('hidden');
        document.body.style.cursor = 'none';
        // Resume background music
        soundManager.startBackgroundMusic();
    }
}

function restartGame() {
    // Play menu click sound
    soundManager.play('menuClick');
    
    // Resume the game first
    resumeGame();
    
    // Reset player state
    playerState.gridX = 5;
    playerState.gridZ = 5;
    playerState.isMoving = false;
    
    // Reset game score
    gameScore.score = 0;
    gameScore.lives = 3;
    gameScore.hasKey = false;
    gameScore.levelComplete = false;
    
    // Reset world state
    worldState.isRotating = false;
    worldState.currentRotation = { x: 0, y: 0, z: 0 };
    worldState.targetRotation = { x: 0, y: 0, z: 0 };
    worldState.gravityDirection = new THREE.Vector3(0, -1, 0);
    
    // Reset world group rotation
    worldGroup.rotation.set(0, 0, 0);
    lightGroup.rotation.set(0, 0, 0);
    
    // Reload the current level
    loadLevel(currentLevel);
    
    // Update displays
    updateScoreDisplay();
    updateHUDDisplay();
    
    // Show restart message
    showMessage('Level restarted!', '#00ff00');
}

function exitGame() {
    // Play menu click sound
    soundManager.play('menuClick');
    
    // Resume the game first
    resumeGame();
    
    // Return to lobby
    if (gameState.currentState === 'in-game') {
        // Stop background music when exiting
        soundManager.stopBackgroundMusic();
        returnToLobby();
    }
}

// Lobby state management
const lobbyState = {
    players: {},
    gameState: 'lobby',
    hostId: null,
    isReady: false,
    isHost: false,
    countdown: null,
    countdownInterval: null,
    maxPlayers: 8,
    minPlayers: 1
};

// Voting state management
const votingState = {
    active: false,
    type: null,
    options: [],
    votes: {},
    voteCounts: {},
    timeRemaining: 0,
    completedBy: null,
    levelInfo: null,
    hasVoted: false,
    myVote: null,
    timerInterval: null
};

// Multiplayer state
const multiplayerState = {
    isConnected: false,
    localPlayerId: null,
    localPlayerColor: null,
    otherPlayers: {},
    lastPositionUpdate: 0,
    updateThrottle: 50, // ms between position updates
    serverGameState: null, // Tracks server-side game state
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
    isReconnecting: false
};

// Level progress tracking
const levelProgress = {
    jsonLevels: {}, // levelIndex: { completed: bool, score: number, attempts: number, bestTime: number }
    currentLevel: 0,
    totalScore: 0,
    unlockedLevels: 1 // Number of levels unlocked (1-based)
};

// Timer state
const levelTimer = {
    startTime: null,
    currentTime: 0,
    isRunning: false,
    displayElement: null
};

// Level menu state
const levelMenu = {
    isVisible: false,
    currentMode: 'json' // 'json' or 'random'
};

// Timer functions
function startLevelTimer() {
    levelTimer.startTime = Date.now();
    levelTimer.isRunning = true;
    updateTimerDisplay();
    console.log('Level timer started');
}

function stopLevelTimer() {
    if (!levelTimer.isRunning) return 0;
    
    const endTime = Date.now();
    const totalTime = (endTime - levelTimer.startTime) / 1000; // Convert to seconds
    levelTimer.isRunning = false;
    levelTimer.currentTime = totalTime;
    
    console.log(`Level timer stopped: ${formatTime(totalTime)}`);
    return totalTime;
}

function updateTimerDisplay() {
    const timerElement = document.getElementById('level-timer');
    if (!timerElement) return;
    
    if (levelTimer.isRunning && levelTimer.startTime) {
        const currentTime = (Date.now() - levelTimer.startTime) / 1000;
        const newTimeText = formatTime(currentTime);
        
        // Only update if the text has changed to avoid unnecessary DOM updates
        if (timerElement.textContent !== newTimeText) {
            timerElement.textContent = newTimeText;
            
            // Add subtle animation every second
            const seconds = Math.floor(currentTime);
            if (seconds !== levelTimer.lastAnimatedSecond) {
                animateTimerUpdate();
                levelTimer.lastAnimatedSecond = seconds;
            }
        }
    } else {
        timerElement.textContent = '00:00.00';
    }
    
    // Continue updating if timer is running
    if (levelTimer.isRunning) {
        requestAnimationFrame(updateTimerDisplay);
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 100);
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

function resetTimer() {
    levelTimer.startTime = null;
    levelTimer.currentTime = 0;
    levelTimer.isRunning = false;
    
    const timerElement = document.getElementById('level-timer');
    if (timerElement) {
        timerElement.textContent = '00:00.00';
    }
}

// Level progress persistence
function saveLevelProgress() {
    try {
        localStorage.setItem('3dgame_progress', JSON.stringify(levelProgress));
    } catch (error) {
        console.warn('Failed to save level progress:', error);
    }
}

function loadLevelProgress() {
    try {
        const saved = localStorage.getItem('3dgame_progress');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(levelProgress, parsed);
            console.log('Loaded level progress:', levelProgress);
        }
    } catch (error) {
        console.warn('Failed to load level progress:', error);
    }
}

// Update level progress when level is completed
function updateLevelProgress(levelIndex, score, completionTime = null) {
    const wasCompleted = levelProgress.jsonLevels[levelIndex]?.completed || false;
    
    if (!levelProgress.jsonLevels[levelIndex]) {
        levelProgress.jsonLevels[levelIndex] = { completed: false, score: 0, attempts: 0, bestTime: null, coinsCollected: 0 };
    }
    
    levelProgress.jsonLevels[levelIndex].attempts++;
    
    if (!wasCompleted) {
        levelProgress.jsonLevels[levelIndex].completed = true;
        levelProgress.jsonLevels[levelIndex].score = score;
        levelProgress.jsonLevels[levelIndex].coinsCollected = gameScore.coins;
        levelProgress.totalScore += score;
        
        // Set initial best time
        if (completionTime) {
            levelProgress.jsonLevels[levelIndex].bestTime = completionTime;
        }
        
        // Unlock next level
        if (levelIndex + 1 < jsonLevels.length) {
            levelProgress.unlockedLevels = Math.max(levelProgress.unlockedLevels, levelIndex + 2);
        }
    } else {
        // Update score if it's higher
        if (score > levelProgress.jsonLevels[levelIndex].score) {
            levelProgress.totalScore += (score - levelProgress.jsonLevels[levelIndex].score);
            levelProgress.jsonLevels[levelIndex].score = score;
        }
        
        // Update coins collected if it's higher
        if (gameScore.coins > (levelProgress.jsonLevels[levelIndex].coinsCollected || 0)) {
            levelProgress.jsonLevels[levelIndex].coinsCollected = gameScore.coins;
        }
        
        // Update best time if it's faster
        if (completionTime && (!levelProgress.jsonLevels[levelIndex].bestTime || completionTime < levelProgress.jsonLevels[levelIndex].bestTime)) {
            levelProgress.jsonLevels[levelIndex].bestTime = completionTime;
        }
    }
    
    saveLevelProgress();
    updateLevelMenuDisplay();
}

// Reset level progress
function resetLevelProgress() {
    levelProgress.jsonLevels = {};
    levelProgress.currentLevel = 0;
    levelProgress.totalScore = 0;
    levelProgress.unlockedLevels = 1;
    resetTimer();
    saveLevelProgress();
    updateLevelMenuDisplay();
    showMessage('Level progress and times reset!', '#ff6600');
}

// ============ COMPREHENSIVE PLAYER PROGRESS SYSTEM ============

// Player profile data structure
const playerProfile = {
    name: '',
    createdAt: null,
    lastPlayed: null,
    totalPlayTime: 0, // in milliseconds
    sessionStartTime: null,
    totalAttempts: 0,
    totalDeaths: 0,
    gamesPlayed: 0,
    version: '1.0'
};

// Game settings data structure
const gameSettings = {
    audio: {
        masterVolume: 0.7,
        sfxVolume: 0.8,
        musicVolume: 0.5,
        soundEnabled: true,
        musicEnabled: true
    },
    camera: {
        currentPreset: 'default',
        smoothness: 0.1,
        fov: 75
    },
    controls: {
        keyBindings: {
            up: ['ArrowUp', 'KeyW'],
            down: ['ArrowDown', 'KeyS'],
            left: ['ArrowLeft', 'KeyA'],
            right: ['ArrowRight', 'KeyD'],
            pause: ['KeyP'],
            restart: ['KeyN'],
            gravityShift: ['Space'],
            cheat: ['KeyM']
        },
        mouseSensitivity: 1.0
    },
    ui: {
        showFPS: false,
        showDebugInfo: false,
        messageDisplayDuration: 2000,
        enableParticleEffects: true
    },
    version: '1.0'
};

// Achievement system
const achievements = {
    firstSteps: { unlocked: false, unlockedAt: null, name: 'First Steps', description: 'Complete your first level' },
    coinCollector: { unlocked: false, unlockedAt: null, name: 'Coin Collector', description: 'Collect 100 coins total' },
    keyMaster: { unlocked: false, unlockedAt: null, name: 'Key Master', description: 'Collect 25 keys total' },
    speedRunner: { unlocked: false, unlockedAt: null, name: 'Speed Runner', description: 'Complete a level in under 30 seconds' },
    perfectionist: { unlocked: false, unlockedAt: null, name: 'Perfectionist', description: 'Complete 5 levels without dying' },
    survivor: { unlocked: false, unlockedAt: null, name: 'Survivor', description: 'Complete 10 levels in a row without dying' },
    explorer: { unlocked: false, unlockedAt: null, name: 'Explorer', description: 'Try all camera presets' },
    dedicated: { unlocked: false, unlockedAt: null, name: 'Dedicated', description: 'Play for 1 hour total' },
    champion: { unlocked: false, unlockedAt: null, name: 'Champion', description: 'Complete all JSON levels' },
    highScorer: { unlocked: false, unlockedAt: null, name: 'High Scorer', description: 'Achieve 10,000 total points' },
    trapDodger: { unlocked: false, unlockedAt: null, name: 'Trap Dodger', description: 'Avoid spike traps for 10 consecutive levels' },
    teleportMaster: { unlocked: false, unlockedAt: null, name: 'Teleport Master', description: 'Use teleporters 50 times' },
    version: '1.0'
};

// Game statistics
const gameStatistics = {
    totalLevelsCompleted: 0,
    totalLevelsAttempted: 0,
    totalCoinsCollected: 0,
    totalKeysCollected: 0,
    totalDeaths: 0,
    totalTeleportsUsed: 0,
    totalTrapsTriggered: 0,
    totalBouncePlatformsUsed: 0,
    fastestLevelTime: null,
    longestPlaySession: 0,
    averageScorePerLevel: 0,
    perfectLevelsCompleted: 0, // levels completed without dying
    consecutiveLevelsWithoutDeath: 0,
    currentDeathStreak: 0,
    cameraModesSwitched: 0,
    presetsUsed: new Set(),
    configReloads: 0,
    multiplayerGames: 0,
    totalScore: 0,
    version: '1.0'
};

// High scores system
const highScores = {
    topScores: [], // { score, level, date, time }
    bestTimes: [], // { time, level, date, score }
    maxEntries: 10,
    version: '1.0'
};

// ============ SAVE/LOAD FUNCTIONS ============

// Save player profile
function savePlayerProfile() {
    try {
        localStorage.setItem('3dgame_profile', JSON.stringify(playerProfile));
    } catch (error) {
        console.warn('Failed to save player profile:', error);
    }
}

// Load player profile
function loadPlayerProfile() {
    try {
        const saved = localStorage.getItem('3dgame_profile');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(playerProfile, parsed);
            console.log('Loaded player profile:', playerProfile);
        } else {
            // Initialize new profile
            playerProfile.createdAt = Date.now();
            playerProfile.name = `Player_${Math.floor(Math.random() * 10000)}`;
            savePlayerProfile();
        }
    } catch (error) {
        console.warn('Failed to load player profile:', error);
    }
}

// Save game settings
function saveGameSettings() {
    try {
        localStorage.setItem('3dgame_settings', JSON.stringify(gameSettings));
    } catch (error) {
        console.warn('Failed to save game settings:', error);
    }
}

// Load game settings
function loadGameSettings() {
    try {
        const saved = localStorage.getItem('3dgame_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge with defaults to handle new settings
            mergeDeep(gameSettings, parsed);
            console.log('Loaded game settings:', gameSettings);
            applyGameSettings();
        }
    } catch (error) {
        console.warn('Failed to load game settings:', error);
    }
}

// Save achievements
function saveAchievements() {
    try {
        localStorage.setItem('3dgame_achievements', JSON.stringify(achievements));
    } catch (error) {
        console.warn('Failed to save achievements:', error);
    }
}

// Load achievements
function loadAchievements() {
    try {
        const saved = localStorage.getItem('3dgame_achievements');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(achievements, parsed);
            console.log('Loaded achievements:', achievements);
        }
    } catch (error) {
        console.warn('Failed to load achievements:', error);
    }
}

// Save game statistics
function saveGameStatistics() {
    try {
        // Convert Set to Array for JSON serialization
        const statsToSave = { ...gameStatistics };
        if (statsToSave.presetsUsed instanceof Set) {
            statsToSave.presetsUsed = Array.from(statsToSave.presetsUsed);
        }
        localStorage.setItem('3dgame_statistics', JSON.stringify(statsToSave));
    } catch (error) {
        console.warn('Failed to save game statistics:', error);
    }
}

// Load game statistics
function loadGameStatistics() {
    try {
        const saved = localStorage.getItem('3dgame_statistics');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(gameStatistics, parsed);
            // Convert Array back to Set
            if (Array.isArray(gameStatistics.presetsUsed)) {
                gameStatistics.presetsUsed = new Set(gameStatistics.presetsUsed);
            }
            console.log('Loaded game statistics:', gameStatistics);
        }
    } catch (error) {
        console.warn('Failed to load game statistics:', error);
    }
}

// Save high scores
function saveHighScores() {
    try {
        localStorage.setItem('3dgame_highscores', JSON.stringify(highScores));
    } catch (error) {
        console.warn('Failed to save high scores:', error);
    }
}

// Load high scores
function loadHighScores() {
    try {
        const saved = localStorage.getItem('3dgame_highscores');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(highScores, parsed);
            console.log('Loaded high scores:', highScores);
        }
    } catch (error) {
        console.warn('Failed to load high scores:', error);
    }
}

// ============ UTILITY FUNCTIONS ============

// Deep merge function for settings
function mergeDeep(target, source) {
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            mergeDeep(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
}

// Apply game settings to game systems
function applyGameSettings() {
    // Apply audio settings
    if (soundManager) {
        soundManager.masterVolume = gameSettings.audio.masterVolume;
        soundManager.sfxVolume = gameSettings.audio.sfxVolume;
        soundManager.musicVolume = gameSettings.audio.musicVolume;
        soundManager.isEnabled = gameSettings.audio.soundEnabled;
        soundManager.isMusicEnabled = gameSettings.audio.musicEnabled;
        soundManager.updateMusicVolume();
    }
    
    // Apply camera settings
    if (cameraSystem) {
        cameraSystem.smoothness = gameSettings.camera.smoothness;
        cameraSystem.currentPreset = gameSettings.camera.currentPreset;
        if (camera) {
            camera.fov = gameSettings.camera.fov;
            camera.updateProjectionMatrix();
        }
    }
    
    // Update UI elements if they exist
    updateSettingsUI();
}

// Update settings UI elements
function updateSettingsUI() {
    const elements = {
        'toggle-sound': `Sound: ${gameSettings.audio.soundEnabled ? 'ON' : 'OFF'}`,
        'toggle-music': `Music: ${gameSettings.audio.musicEnabled ? 'ON' : 'OFF'}`,
        'master-volume': gameSettings.audio.masterVolume * 100,
        'sfx-volume': gameSettings.audio.sfxVolume * 100,
        'music-volume': gameSettings.audio.musicVolume * 100
    };
    
    for (const [id, value] of Object.entries(elements)) {
        const element = document.getElementById(id);
        if (element) {
            if (element.type === 'range') {
                element.value = value;
            } else {
                element.textContent = value;
                element.style.background = value.includes('ON') ? '#333' : '#666';
            }
        }
    }
}

// ============ PROGRESS TRACKING FUNCTIONS ============

// Start play session
function startPlaySession() {
    playerProfile.sessionStartTime = Date.now();
    playerProfile.lastPlayed = Date.now();
    playerProfile.gamesPlayed++;
    savePlayerProfile();
}

// Update play time
function updatePlayTime() {
    if (playerProfile.sessionStartTime) {
        const sessionTime = Date.now() - playerProfile.sessionStartTime;
        playerProfile.totalPlayTime += sessionTime;
        
        // Check for play time achievements
        if (playerProfile.totalPlayTime >= 3600000 && !achievements.dedicated.unlocked) { // 1 hour
            unlockAchievement('dedicated');
        }
        
        // Update longest session
        if (sessionTime > gameStatistics.longestPlaySession) {
            gameStatistics.longestPlaySession = sessionTime;
        }
        
        playerProfile.sessionStartTime = Date.now(); // Reset for next update
        savePlayerProfile();
        saveGameStatistics();
    }
}

// Track level attempt
function trackLevelAttempt() {
    playerProfile.totalAttempts++;
    gameStatistics.totalLevelsAttempted++;
    savePlayerProfile();
    saveGameStatistics();
}

// Track level completion
function trackLevelCompletion(score, completionTime) {
    gameStatistics.totalLevelsCompleted++;
    gameStatistics.totalScore += score;
    gameStatistics.averageScorePerLevel = gameStatistics.totalScore / gameStatistics.totalLevelsCompleted;
    
    // Track fastest time
    if (!gameStatistics.fastestLevelTime || completionTime < gameStatistics.fastestLevelTime) {
        gameStatistics.fastestLevelTime = completionTime;
    }
    
    // Check for speed runner achievement
    if (completionTime <= 30 && !achievements.speedRunner.unlocked) {
        unlockAchievement('speedRunner');
    }
    
    // Track perfect levels (no deaths)
    if (gameStatistics.currentDeathStreak === 0) {
        gameStatistics.perfectLevelsCompleted++;
        gameStatistics.consecutiveLevelsWithoutDeath++;
        
        // Check achievements
        if (gameStatistics.consecutiveLevelsWithoutDeath >= 5 && !achievements.perfectionist.unlocked) {
            unlockAchievement('perfectionist');
        }
        if (gameStatistics.consecutiveLevelsWithoutDeath >= 10 && !achievements.survivor.unlocked) {
            unlockAchievement('survivor');
        }
        
        // Check trap dodger achievement
        checkTrapDodgerAchievement();
    }
    
    // Check first level achievement
    if (gameStatistics.totalLevelsCompleted === 1 && !achievements.firstSteps.unlocked) {
        unlockAchievement('firstSteps');
    }
    
    // Check high scorer achievement
    if (gameStatistics.totalScore >= 10000 && !achievements.highScorer.unlocked) {
        unlockAchievement('highScorer');
    }
    
    // Add to high scores
    addHighScore(score, currentJsonLevelIndex, completionTime);
    
    // Reset death streak on successful completion
    gameStatistics.currentDeathStreak = 0;
    
    saveGameStatistics();
}

// Track player death
function trackPlayerDeath() {
    playerProfile.totalDeaths++;
    gameStatistics.totalDeaths++;
    gameStatistics.currentDeathStreak++;
    gameStatistics.consecutiveLevelsWithoutDeath = 0;
    savePlayerProfile();
    saveGameStatistics();
}

// Track coin collection
function trackCoinCollection() {
    gameStatistics.totalCoinsCollected++;
    
    // Check coin collector achievement
    if (gameStatistics.totalCoinsCollected >= 100 && !achievements.coinCollector.unlocked) {
        unlockAchievement('coinCollector');
    }
    
    saveGameStatistics();
}

// Track key collection
function trackKeyCollection() {
    gameStatistics.totalKeysCollected++;
    
    // Check key master achievement
    if (gameStatistics.totalKeysCollected >= 25 && !achievements.keyMaster.unlocked) {
        unlockAchievement('keyMaster');
    }
    
    saveGameStatistics();
}

// Track teleport usage
function trackTeleportUsage() {
    gameStatistics.totalTeleportsUsed++;
    
    // Check teleport master achievement
    if (gameStatistics.totalTeleportsUsed >= 50 && !achievements.teleportMaster.unlocked) {
        unlockAchievement('teleportMaster');
    }
    
    saveGameStatistics();
}

// Track trap triggering
function trackTrapTriggered() {
    gameStatistics.totalTrapsTriggered++;
    saveGameStatistics();
}

// Track bounce platform usage
function trackBouncePlatformUsage() {
    gameStatistics.totalBouncePlatformsUsed++;
    saveGameStatistics();
}

// Track camera mode switching
function trackCameraModeSwitch() {
    gameStatistics.cameraModesSwitched++;
    saveGameStatistics();
}

// Track camera preset usage
function trackCameraPresetUsage(preset) {
    gameStatistics.presetsUsed.add(preset);
    
    // Check explorer achievement (all 4 presets used)
    if (gameStatistics.presetsUsed.size >= 4 && !achievements.explorer.unlocked) {
        unlockAchievement('explorer');
    }
    
    saveGameStatistics();
}

// ============ ACHIEVEMENT SYSTEM ============

// Unlock achievement
function unlockAchievement(achievementKey) {
    if (achievements[achievementKey] && !achievements[achievementKey].unlocked) {
        achievements[achievementKey].unlocked = true;
        achievements[achievementKey].unlockedAt = Date.now();
        
        // Show achievement notification
        showAchievementNotification(achievements[achievementKey]);
        
        // Play achievement sound
        if (soundManager) {
            soundManager.play('achievement');
        }
        
        saveAchievements();
    }
}

// Show achievement notification
function showAchievementNotification(achievement) {
    const notification = document.createElement('div');
    notification.className = 'achievement-notification';
    notification.innerHTML = `
        <div class="achievement-content">
            <div class="achievement-icon">🏆</div>
            <div class="achievement-text">
                <div class="achievement-title">Achievement Unlocked!</div>
                <div class="achievement-name">${achievement.name}</div>
                <div class="achievement-description">${achievement.description}</div>
            </div>
        </div>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #ffd700, #ffb347);
        color: #333;
        padding: 15px;
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 10000;
        min-width: 300px;
        animation: slideInRight 0.5s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.5s ease-in';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 500);
    }, 5000);
    
    console.log(`🏆 Achievement Unlocked: ${achievement.name} - ${achievement.description}`);
}

// ============ HIGH SCORES SYSTEM ============

// Add high score
function addHighScore(score, level, time) {
    const entry = {
        score: score,
        level: level,
        time: time,
        date: Date.now(),
        playerName: playerProfile.name
    };
    
    // Add to top scores
    highScores.topScores.push(entry);
    highScores.topScores.sort((a, b) => b.score - a.score);
    highScores.topScores = highScores.topScores.slice(0, highScores.maxEntries);
    
    // Add to best times
    if (time) {
        highScores.bestTimes.push(entry);
        highScores.bestTimes.sort((a, b) => a.time - b.time);
        highScores.bestTimes = highScores.bestTimes.slice(0, highScores.maxEntries);
    }
    
    saveHighScores();
}

// ============ IMPORT/EXPORT FUNCTIONS ============

// Export all progress data
function exportProgressData() {
    const exportData = {
        profile: playerProfile,
        settings: gameSettings,
        achievements: achievements,
        statistics: { ...gameStatistics, presetsUsed: Array.from(gameStatistics.presetsUsed) },
        highScores: highScores,
        levelProgress: levelProgress,
        exportDate: Date.now(),
        version: '1.0'
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `3dgame_progress_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    showMessage('Progress data exported successfully!', '#00ff00', 3000);
}

// Import progress data
function importProgressData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importData = JSON.parse(e.target.result);
                
                // Validate data structure
                if (importData.version && importData.profile && importData.settings) {
                    // Import data
                    Object.assign(playerProfile, importData.profile);
                    mergeDeep(gameSettings, importData.settings);
                    Object.assign(achievements, importData.achievements || {});
                    Object.assign(gameStatistics, importData.statistics || {});
                    if (importData.statistics?.presetsUsed) {
                        gameStatistics.presetsUsed = new Set(importData.statistics.presetsUsed);
                    }
                    Object.assign(highScores, importData.highScores || {});
                    Object.assign(levelProgress, importData.levelProgress || {});
                    
                    // Save all data
                    saveAllProgressData();
                    
                    // Apply settings
                    applyGameSettings();
                    updateLevelMenuDisplay();
                    
                    showMessage('Progress data imported successfully!', '#00ff00', 3000);
                    console.log('Progress data imported from file');
                } else {
                    throw new Error('Invalid file format');
                }
            } catch (error) {
                console.error('Failed to import progress data:', error);
                showMessage('Failed to import progress data - invalid file format', '#ff0000', 3000);
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
}

// ============ RESET FUNCTIONS ============

// Reset all progress data
function resetAllProgressData() {
    if (confirm('Are you sure you want to reset ALL progress data? This cannot be undone!')) {
        localStorage.removeItem('3dgame_profile');
        localStorage.removeItem('3dgame_settings');
        localStorage.removeItem('3dgame_achievements');
        localStorage.removeItem('3dgame_statistics');
        localStorage.removeItem('3dgame_highscores');
        localStorage.removeItem('3dgame_progress');
        
        showMessage('All progress data has been reset!', '#ff6600', 3000);
        
        // Reload page to reinitialize
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    }
}

// Reset specific data types
function resetSpecificData(dataType) {
    const confirmMessages = {
        profile: 'Reset player profile (name, play time, etc.)?',
        settings: 'Reset game settings to defaults?',
        achievements: 'Reset all achievements?',
        statistics: 'Reset game statistics?',
        highscores: 'Reset high scores?',
        progress: 'Reset level progress?'
    };
    
    if (confirm(confirmMessages[dataType] + ' This cannot be undone!')) {
        switch (dataType) {
            case 'profile':
                localStorage.removeItem('3dgame_profile');
                Object.assign(playerProfile, {
                    name: `Player_${Math.floor(Math.random() * 10000)}`,
                    createdAt: Date.now(),
                    lastPlayed: null,
                    totalPlayTime: 0,
                    sessionStartTime: null,
                    totalAttempts: 0,
                    totalDeaths: 0,
                    gamesPlayed: 0
                });
                savePlayerProfile();
                break;
            case 'settings':
                localStorage.removeItem('3dgame_settings');
                window.location.reload();
                break;
            case 'achievements':
                localStorage.removeItem('3dgame_achievements');
                for (const key in achievements) {
                    if (typeof achievements[key] === 'object') {
                        achievements[key].unlocked = false;
                        achievements[key].unlockedAt = null;
                    }
                }
                saveAchievements();
                break;
            case 'statistics':
                localStorage.removeItem('3dgame_statistics');
                Object.assign(gameStatistics, {
                    totalLevelsCompleted: 0,
                    totalLevelsAttempted: 0,
                    totalCoinsCollected: 0,
                    totalKeysCollected: 0,
                    totalDeaths: 0,
                    totalTeleportsUsed: 0,
                    totalTrapsTriggered: 0,
                    totalBouncePlatformsUsed: 0,
                    fastestLevelTime: null,
                    longestPlaySession: 0,
                    averageScorePerLevel: 0,
                    perfectLevelsCompleted: 0,
                    consecutiveLevelsWithoutDeath: 0,
                    currentDeathStreak: 0,
                    cameraModesSwitched: 0,
                    presetsUsed: new Set(),
                    configReloads: 0,
                    multiplayerGames: 0,
                    totalScore: 0
                });
                saveGameStatistics();
                break;
            case 'highscores':
                localStorage.removeItem('3dgame_highscores');
                highScores.topScores = [];
                highScores.bestTimes = [];
                saveHighScores();
                break;
            case 'progress':
                resetLevelProgress();
                break;
        }
        
        showMessage(`${dataType.charAt(0).toUpperCase() + dataType.slice(1)} data has been reset!`, '#ff6600', 3000);
    }
}

// ============ INITIALIZATION FUNCTIONS ============

// Save all progress data
function saveAllProgressData() {
    saveLevelProgress();
    savePlayerProfile();
    saveGameSettings();
    saveAchievements();
    saveGameStatistics();
    saveHighScores();
}

// Load all progress data
function loadAllProgressData() {
    loadLevelProgress();
    loadPlayerProfile();
    loadGameSettings();
    loadAchievements();
    loadGameStatistics();
    loadHighScores();
}

// Initialize progress tracking
function initializeProgressTracking() {
    // Load all saved data
    loadAllProgressData();
    
    // Start play session
    startPlaySession();
    
    // Set up periodic save and play time updates
    setInterval(() => {
        updatePlayTime();
        saveAllProgressData();
    }, 30000); // Save every 30 seconds
    
    // Add window beforeunload event to save on exit
    window.addEventListener('beforeunload', () => {
        updatePlayTime();
        saveAllProgressData();
    });
    
    console.log('Progress tracking system initialized');
}

// ============ HUD ANIMATION FUNCTIONS ============

// Animate HUD element with specified animation
function animateHudElement(elementId, animationType, duration = null) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    // Remove any existing animation classes
    element.classList.remove('animate-score', 'animate-lives', 'animate-coin', 'animate-pulse', 'animate-shake');
    
    // Add the new animation class
    element.classList.add(`animate-${animationType}`);
    
    // Remove the animation class after completion
    const animationDuration = duration || getAnimationDuration(animationType);
    setTimeout(() => {
        element.classList.remove(`animate-${animationType}`);
    }, animationDuration);
}

// Get animation duration for different types
function getAnimationDuration(animationType) {
    const durations = {
        score: 500,
        lives: 600,
        coin: 700,
        pulse: 400,
        shake: 500
    };
    return durations[animationType] || 500;
}

// Animate score increase
function animateScoreIncrease(newScore, oldScore) {
    if (newScore > oldScore) {
        animateHudElement('score-count', 'score');
        
        // Add score popup effect
        showFloatingScoreText(`+${newScore - oldScore}`, '#00ff00');
    }
}

// Animate lives decrease
function animateLivesDecrease() {
    animateHudElement('lives-count', 'lives');
    
    // Shake the entire lives display
    const livesDisplay = document.getElementById('lives-display');
    if (livesDisplay) {
        livesDisplay.classList.add('animate-shake');
        setTimeout(() => {
            livesDisplay.classList.remove('animate-shake');
        }, 500);
    }
}

// Animate coin collection
function animateCoinCollection(newCount, oldCount) {
    if (newCount > oldCount) {
        animateHudElement('coins-count', 'coin');
        
        // Add coin popup effect
        showFloatingScoreText('+1 💰', '#ffd700');
    }
}

// Animate key collection
function animateKeyCollection() {
    animateHudElement('key-status', 'pulse');
    
    // Add key collection popup
    showFloatingScoreText('🔑 Key Collected!', '#ff6600');
}

// Animate connection status change
function animateConnectionStatus() {
    animateHudElement('status-indicator', 'pulse');
    animateHudElement('status-text', 'pulse');
}

// Animate level change
function animateLevelChange() {
    animateHudElement('level-name', 'pulse');
    
    // Flash the level info container
    const levelInfo = document.getElementById('level-info');
    if (levelInfo) {
        levelInfo.style.boxShadow = '0 4px 15px rgba(0, 255, 255, 0.8)';
        setTimeout(() => {
            levelInfo.style.boxShadow = '0 4px 15px rgba(0, 255, 255, 0.2)';
        }, 300);
    }
}

// Show floating score text animation
function showFloatingScoreText(text, color) {
    const popup = document.createElement('div');
    popup.textContent = text;
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: ${color};
        font-size: 24px;
        font-weight: bold;
        text-shadow: 0 0 10px ${color};
        pointer-events: none;
        z-index: 10001;
        animation: floatUp 2s ease-out forwards;
    `;
    
    // Add floating animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes floatUp {
            0% {
                opacity: 1;
                transform: translate(-50%, -50%) scale(0.8);
            }
            50% {
                opacity: 1;
                transform: translate(-50%, -60%) scale(1.2);
            }
            100% {
                opacity: 0;
                transform: translate(-50%, -80%) scale(0.6);
            }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(popup);
    
    // Remove after animation
    setTimeout(() => {
        document.body.removeChild(popup);
        document.head.removeChild(style);
    }, 2000);
}

// Smooth number animation for counters
function animateNumber(elementId, from, to, duration = 500) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const startTime = Date.now();
    const startValue = from;
    const endValue = to;
    const changeValue = endValue - startValue;
    
    function updateNumber() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Use easing function for smooth animation
        const easeProgress = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const currentValue = Math.round(startValue + (changeValue * easeProgress));
        
        element.textContent = currentValue;
        
        if (progress < 1) {
            requestAnimationFrame(updateNumber);
        }
    }
    
    requestAnimationFrame(updateNumber);
}

// Animate timer display with smooth transitions
function animateTimerUpdate() {
    const timerElement = document.getElementById('level-timer');
    if (timerElement) {
        timerElement.style.transform = 'scale(1.05)';
        setTimeout(() => {
            timerElement.style.transform = 'scale(1)';
        }, 100);
    }
}

// Animate progress bar
function animateProgressBar(elementId, percentage, duration = 1000) {
    const progressBar = document.getElementById(elementId);
    if (!progressBar) return;
    
    progressBar.style.setProperty('--target-width', `${percentage}%`);
    progressBar.style.animation = `progressFill ${duration}ms ease-out forwards`;
    
    setTimeout(() => {
        progressBar.style.animation = '';
        progressBar.style.width = `${percentage}%`;
    }, duration);
}

// ============ ADVANCED RESET UI FUNCTIONS ============

// Show advanced reset menu
function showAdvancedResetMenu() {
    const options = [
        { key: 'profile', label: 'Player Profile (name, play time, etc.)' },
        { key: 'settings', label: 'Game Settings (audio, camera, etc.)' },
        { key: 'achievements', label: 'All Achievements' },
        { key: 'statistics', label: 'Game Statistics' },
        { key: 'highscores', label: 'High Scores' },
        { key: 'progress', label: 'Level Progress' }
    ];
    
    let message = 'Choose what to reset:\n\n';
    options.forEach((option, index) => {
        message += `${index + 1}. ${option.label}\n`;
    });
    message += '\n0. Cancel\n\nEnter the number of your choice:';
    
    const choice = prompt(message);
    const choiceNum = parseInt(choice);
    
    if (choiceNum > 0 && choiceNum <= options.length) {
        const selectedOption = options[choiceNum - 1];
        resetSpecificData(selectedOption.key);
    } else if (choice !== null && choice !== '0') {
        showMessage('Invalid choice. Reset cancelled.', '#ff6600', 2000);
    }
}

// ============ ACHIEVEMENT COMPLETION CHECKS ============

// Check for champion achievement when all JSON levels completed
function checkChampionAchievement() {
    if (useJsonLevels && jsonLevels.length > 0) {
        const completedLevels = Object.values(levelProgress.jsonLevels).filter(l => l.completed).length;
        if (completedLevels >= jsonLevels.length && !achievements.champion.unlocked) {
            unlockAchievement('champion');
        }
    }
}

// Check for trap dodger achievement
function checkTrapDodgerAchievement() {
    if (gameStatistics.consecutiveLevelsWithoutDeath >= 10 && !achievements.trapDodger.unlocked) {
        unlockAchievement('trapDodger');
    }
}

// Toggle level menu visibility
function toggleLevelMenu() {
    levelMenu.isVisible = !levelMenu.isVisible;
    const menuElement = document.getElementById('level-menu');
    
    if (levelMenu.isVisible) {
        menuElement.classList.remove('hidden');
        updateLevelMenuDisplay();
    } else {
        menuElement.classList.add('hidden');
    }
}

// Switch level mode in menu
function switchLevelMode(mode) {
    levelMenu.currentMode = mode;
    
    // Update UI buttons
    const jsonBtn = document.getElementById('json-mode-btn');
    const randomBtn = document.getElementById('random-mode-btn');
    
    jsonBtn.classList.toggle('active', mode === 'json');
    randomBtn.classList.toggle('active', mode === 'random');
    
    // Actually switch the game mode
    if (mode === 'json' && levelDataLoaded) {
        if (!useJsonLevels) {
            useJsonLevels = true;
            if (currentJsonLevelIndex < jsonLevels.length) {
                loadJsonLevel(currentJsonLevelIndex);
            }
        }
    } else if (mode === 'random') {
        if (useJsonLevels) {
            useJsonLevels = false;
            generateNewLevel(15);
        }
    }
    
    updateLevelMenuDisplay();
}

// Update level menu display
function updateLevelMenuDisplay() {
    if (!levelMenu.isVisible) return;
    
    // Sync menu mode with actual game mode
    levelMenu.currentMode = useJsonLevels ? 'json' : 'random';
    
    const progressText = document.getElementById('progress-text');
    const scoreText = document.getElementById('score-text');
    const progressBar = document.getElementById('progress-bar');
    const levelGrid = document.getElementById('level-grid');
    
    // Update mode buttons
    const jsonBtn = document.getElementById('json-mode-btn');
    const randomBtn = document.getElementById('random-mode-btn');
    if (jsonBtn && randomBtn) {
        jsonBtn.classList.toggle('active', levelMenu.currentMode === 'json');
        randomBtn.classList.toggle('active', levelMenu.currentMode === 'random');
    }
    
    if (levelMenu.currentMode === 'json' && jsonLevels.length > 0) {
        // JSON levels mode
        const completed = Object.values(levelProgress.jsonLevels).filter(l => l.completed).length;
        const total = jsonLevels.length;
        const progressPercent = (completed / total) * 100;
        
        progressText.textContent = `Progress: ${completed}/${total}`;
        scoreText.textContent = `Total Score: ${levelProgress.totalScore}`;
        progressBar.style.width = `${progressPercent}%`;
        
        // Create level buttons
        levelGrid.innerHTML = '';
        jsonLevels.forEach((level, index) => {
            const button = createLevelButton(level, index);
            levelGrid.appendChild(button);
        });
    } else {
        // Random mode
        progressText.textContent = `Mode: Random Generation`;
        scoreText.textContent = `Current Score: ${gameScore.totalScore}`;
        progressBar.style.width = '0%';
        
        levelGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #ccc; padding: 40px;">Random levels are generated infinitely.<br>No progress tracking available.</div>';
    }
}

// Create level button element
function createLevelButton(level, index) {
    const button = document.createElement('button');
    button.className = 'level-btn';
    
    const progress = levelProgress.jsonLevels[index];
    const isCompleted = progress?.completed || false;
    const isCurrent = useJsonLevels && currentJsonLevelIndex === index;
    const isLocked = index >= levelProgress.unlockedLevels;
    
    // Apply appropriate classes
    if (isCompleted) {
        button.classList.add('completed');
    }
    if (isCurrent) {
        button.classList.add('current');
    }
    if (isLocked) {
        button.classList.add('locked');
    }
    
    // Create button content
    const levelNumber = document.createElement('div');
    levelNumber.className = 'level-number';
    levelNumber.textContent = `${index + 1}`;
    
    const levelName = document.createElement('div');
    levelName.className = 'level-name';
    levelName.textContent = level.name;
    
    const levelScore = document.createElement('div');
    levelScore.className = 'level-score';
    if (progress?.score) {
        levelScore.textContent = `Score: ${progress.score}`;
    }
    
    const levelTime = document.createElement('div');
    levelTime.className = 'level-time';
    levelTime.style.fontSize = '10px';
    levelTime.style.color = '#88ffff';
    levelTime.style.marginTop = '3px';
    if (progress?.bestTime) {
        levelTime.textContent = `Best: ${formatTime(progress.bestTime)}`;
    }
    
    const levelStatus = document.createElement('div');
    levelStatus.className = 'level-status';
    if (isCompleted) {
        levelStatus.textContent = '✓';
    } else if (isCurrent) {
        levelStatus.textContent = '▶';
    } else if (isLocked) {
        levelStatus.textContent = '🔒';
    }
    
    button.appendChild(levelNumber);
    button.appendChild(levelName);
    button.appendChild(levelScore);
    button.appendChild(levelTime);
    button.appendChild(levelStatus);
    
    // Add click handler
    if (!isLocked) {
        button.addEventListener('click', () => {
            selectLevel(index);
        });
    }
    
    return button;
}

// Select and load a specific level
function selectLevel(levelIndex) {
    if (levelIndex >= jsonLevels.length) return;
    
    currentJsonLevelIndex = levelIndex;
    levelProgress.currentLevel = levelIndex;
    
    if (!useJsonLevels) {
        useJsonLevels = true;
        updateLevelInfo();
    }
    
    loadJsonLevel(levelIndex);
    toggleLevelMenu(); // Close menu
    
    showMessage(`Loading ${jsonLevels[levelIndex].name}...`, '#00ccff');
}

// Reset progress (called from HTML)
function resetProgress() {
    const confirmed = confirm('Are you sure you want to reset all level progress? This cannot be undone.');
    if (confirmed) {
        resetLevelProgress();
    }
}

// Socket.io event handlers for multiplayer
socket.on('connect', () => {
    console.log('Connected to server');
    multiplayerState.isConnected = true;
    multiplayerState.localPlayerId = socket.id;
    
    // Reset reconnection state on successful connection
    resetReconnectionState();
    
    // Send initial player data
    const playerData = {
        id: socket.id,
        position: {
            x: player.position.x,
            y: player.position.y,
            z: player.position.z
        },
        rotation: {
            x: player.rotation.x,
            y: player.rotation.y,
            z: player.rotation.z
        },
        gridPosition: {
            x: playerState.gridX,
            z: playerState.gridZ
        },
        isMoving: playerState.isMoving
    };
    
    socket.emit('playerJoin', playerData);
    updateConnectionStatus();
    
    // Show reconnection success message if this was a reconnect
    if (multiplayerState.reconnectAttempts > 0) {
        showMessage('Successfully reconnected! Game state synchronized.', '#00ff00', 3000);
    }
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    multiplayerState.isConnected = false;
    multiplayerState.localPlayerId = null;
    
    // Clear all other players
    Object.keys(multiplayerState.otherPlayers).forEach(playerId => {
        removeOtherPlayer(playerId);
    });
    
    updateConnectionStatus();
    
    // Show disconnection message
    showMessage('Disconnected from server. Game state will be preserved.', '#ff9900', 3000);
    
    // Attempt to reconnect if it wasn't a manual disconnect
    if (reason !== 'client namespace disconnect' && reason !== 'server namespace disconnect') {
        attemptReconnection();
    }
});

socket.on('playerJoined', (playerData) => {
    console.log('Player joined:', playerData);
    if (playerData.id !== multiplayerState.localPlayerId) {
        addOtherPlayer(playerData);
    }
});

socket.on('playerColor', (colorData) => {
    console.log('Received player color:', colorData);
    if (colorData.id === multiplayerState.localPlayerId) {
        multiplayerState.localPlayerColor = colorData.color;
        updateLocalPlayerColor();
    }
});

socket.on('playerLeft', (data) => {
    // Handle both old and new formats
    let playerId, remainingPlayers;
    if (typeof data === 'string') {
        // Old format - just playerId
        playerId = data;
        remainingPlayers = Object.keys(multiplayerState.otherPlayers).length;
    } else {
        // New format - object with playerId and remainingPlayers
        playerId = data.playerId;
        remainingPlayers = data.remainingPlayers;
    }
    
    console.log('Player left:', playerId, 'Remaining players:', remainingPlayers);
    removeOtherPlayer(playerId);
    
    // Update connection status
    if (multiplayerState.serverGameState) {
        multiplayerState.serverGameState.playerCount = remainingPlayers;
    }
    updateConnectionStatus();
});

// Legacy support for old collectibleSnapshot format
socket.on('collectibleSnapshot', (data) => {
    console.log('Received legacy collectible snapshot, converting to new format');
    const gameStateData = {
        collectibleItems: data,
        currentLevel: {
            type: null,
            number: 1,
            name: 'Unknown Level',
            initialized: data.initialized || false
        },
        playerCount: Object.keys(multiplayerState.otherPlayers).length + 1,
        sessionStartTime: Date.now(),
        lastStateUpdate: Date.now()
    };
    
    // Emit the same handler as gameStateSnapshot
    socket.emit('gameStateSnapshot', gameStateData);
});

// Lobby socket event handlers
socket.on('lobbySnapshot', (data) => {
    console.log('Received lobby snapshot:', data);
    
    // Update lobby state
    lobbyState.players = data.players;
    lobbyState.gameState = data.gameState;
    lobbyState.hostId = data.hostId;
    lobbyState.maxPlayers = data.maxPlayers;
    lobbyState.minPlayers = data.minPlayers;
    
    // Check if we're the host
    lobbyState.isHost = data.hostId === multiplayerState.localPlayerId;
    
    // Check our ready state
    const localPlayer = lobbyState.players[multiplayerState.localPlayerId];
    lobbyState.isReady = localPlayer ? localPlayer.ready : false;
    
    // Update game state
    gameState.currentState = 'lobby';
    
    // Stop background music when returning to lobby
    soundManager.stopBackgroundMusic();
    
    // Show lobby UI
    showLobby();
    updateLobbyUI();
});

socket.on('playerJoinedLobby', (playerData) => {
    console.log('Player joined lobby:', playerData);
    
    // Add player to lobby state
    lobbyState.players[playerData.id] = playerData;
    
    // Update UI
    updateLobbyUI();
    
    // Show message
    showMessage(`${playerData.color.name} player joined the lobby`, '#00ff88', 2000);
});

socket.on('playerLeftLobby', (data) => {
    console.log('Player left lobby:', data);
    
    // Remove player from lobby state
    delete lobbyState.players[data.playerId];
    
    // Update host status
    if (data.newHost) {
        lobbyState.hostId = data.newHost;
        lobbyState.isHost = data.newHost === multiplayerState.localPlayerId;
    }
    
    // Update UI
    updateLobbyUI();
    
    // Show message
    showMessage(`Player left the lobby`, '#ff9900', 2000);
});

socket.on('playerReadyChanged', (data) => {
    console.log('Player ready state changed:', data);
    
    // Update player ready state
    if (lobbyState.players[data.playerId]) {
        lobbyState.players[data.playerId].ready = data.ready;
    }
    
    // Update UI
    updateLobbyUI();
});

socket.on('gameStartCountdown', (data) => {
    console.log('Game start countdown:', data);
    
    lobbyState.gameState = 'starting';
    lobbyState.countdown = data.delay;
    
    // Start countdown display
    startCountdownDisplay(data.delay);
    
    // Update UI
    updateLobbyUI();
});

socket.on('gameStarted', (data) => {
    console.log('Game started:', data);
    
    // Update game state
    gameState.currentState = 'in-game';
    lobbyState.gameState = 'in-game';
    
    // Start background music when entering game
    soundManager.startBackgroundMusic();
    
    // Update multiplayer state
    multiplayerState.otherPlayers = {};
    Object.values(data.players).forEach(playerData => {
        if (playerData.id !== multiplayerState.localPlayerId) {
            addOtherPlayer(playerData);
        }
    });
    
    // Hide lobby UI
    hideLobby();
    
    // Show game start message
    showMessage('Game started! Good luck!', '#00ff00', 3000);
    
    // Initialize level (first player to connect typically does this)
    setTimeout(() => {
        if (useJsonLevels && jsonLevels.length > 0) {
            loadJsonLevel(0);
        } else {
            generateNewLevel(15);
        }
    }, 1000);
});

// Voting socket event handlers
socket.on('votingStarted', (data) => {
    console.log('Voting started:', data);
    
    // Update voting state
    votingState.active = true;
    votingState.type = data.type;
    votingState.options = data.options;
    votingState.votes = {};
    votingState.voteCounts = {};
    votingState.timeRemaining = data.duration;
    votingState.completedBy = data.completedBy;
    votingState.levelInfo = data.levelInfo;
    votingState.hasVoted = false;
    votingState.myVote = null;
    
    // Initialize vote counts
    data.options.forEach(option => {
        votingState.voteCounts[option] = 0;
    });
    
    // Show voting UI
    showVotingUI();
    
    // Start countdown
    startVotingTimer();
});

socket.on('voteUpdate', (data) => {
    console.log('Vote update:', data);
    
    if (votingState.active) {
        votingState.voteCounts = data.voteCounts;
        updateVotingDisplay();
    }
});

socket.on('votingEnded', (data) => {
    console.log('Voting ended:', data);
    
    // Stop timer
    if (votingState.timerInterval) {
        clearInterval(votingState.timerInterval);
        votingState.timerInterval = null;
    }
    
    // Show results
    showVotingResults(data.decision, data.voteCounts, data.totalVotes);
    
    // Hide voting UI after showing results
    setTimeout(() => {
        hideVotingUI();
        resetVotingState();
    }, 3000);
});

socket.on('levelRestarted', (data) => {
    console.log('Level restarted:', data);
    
    // Reset player positions
    playerState.gridX = 5;
    playerState.gridZ = 5;
    playerState.isMoving = false;
    
    const startPos = gridToWorld(5, 5);
    player.position.copy(startPos);
    player.position.y = 0.55;
    
    // Reset player rotation
    playerState.baseRotation.x = 0;
    playerState.baseRotation.z = 0;
    player.rotation.x = 0;
    player.rotation.y = 0;
    player.rotation.z = 0;
    
    // Reset game state
    gameScore.hasKey = false;
    gameScore.coins = 0;
    gameScore.levelComplete = false;
    
    // Show restart message
    showMessage('Level restarted! Good luck!', '#ff6600', 3000);
});

socket.on('continueToNextLevel', (data) => {
    console.log('Continue to next level:', data);
    
    // Trigger level transition
    setTimeout(() => {
        transitionToNextLevel();
    }, 1000);
});

socket.on('votingSnapshot', (data) => {
    console.log('Voting snapshot:', data);
    
    if (data.active) {
        // Restore voting state
        votingState.active = true;
        votingState.type = data.type;
        votingState.options = data.options;
        votingState.votes = data.votes;
        votingState.voteCounts = data.voteCounts;
        votingState.timeRemaining = data.timeRemaining;
        votingState.completedBy = data.completedBy;
        votingState.levelInfo = data.levelInfo;
        votingState.hasVoted = data.votes[multiplayerState.localPlayerId] !== undefined;
        votingState.myVote = data.votes[multiplayerState.localPlayerId] || null;
        
        // Show voting UI
        showVotingUI();
        
        // Start countdown with remaining time
        startVotingTimer();
    }
});

socket.on('playerUpdate', (playerData) => {
    if (playerData.id !== multiplayerState.localPlayerId) {
        updateOtherPlayer(playerData);
    }
});

socket.on('playersSnapshot', (players) => {
    console.log('Received players snapshot:', players);
    
    // Get local player color from the snapshot
    const localPlayerData = players[multiplayerState.localPlayerId];
    if (localPlayerData && localPlayerData.color) {
        multiplayerState.localPlayerColor = localPlayerData.color;
        updateLocalPlayerColor();
    }
    
    // Clear existing other players
    Object.keys(multiplayerState.otherPlayers).forEach(playerId => {
        if (!players[playerId]) {
            removeOtherPlayer(playerId);
        }
    });
    
    // Add/update all players
    Object.values(players).forEach(playerData => {
        if (playerData.id !== multiplayerState.localPlayerId) {
            if (multiplayerState.otherPlayers[playerData.id]) {
                updateOtherPlayer(playerData);
            } else {
                addOtherPlayer(playerData);
            }
        }
    });
});

socket.on('gameUpdate', (data) => {
    // Handle game state updates here
    console.log('Game update:', data);
});

socket.on('itemCollected', (data) => {
    const { itemType, itemId, collectedBy } = data;
    console.log(`Item collected by ${collectedBy}: ${itemType} ${itemId}`);
    
    // Don't process our own collection events
    if (collectedBy === multiplayerState.localPlayerId) {
        return;
    }
    
    // Remove the item from the game world
    if (itemType === 'coin') {
        // Find and remove the coin
        const coinToRemove = coins.find(coin => coin.id === itemId);
        if (coinToRemove) {
            const index = coins.indexOf(coinToRemove);
            if (index > -1) {
                worldGroup.remove(coinToRemove);
                coins.splice(index, 1);
                
                // Update total coins count but don't increase player's score
                gameScore.totalCoins = coins.length;
                updateScoreDisplay();
                
                // Show visual effect to indicate someone else collected it
                showOtherPlayerCollectionEffect(coinToRemove.position, 'coin');
            }
        }
    } else if (itemType === 'key') {
        // Remove the key if it exists
        if (gameKey && gameKey.id === itemId) {
            worldGroup.remove(gameKey);
            gameKey = null;
            
            // Update goal tile appearance for everyone
            if (goalTile) {
                goalTile.material.color.setHex(0x00ff00);
                goalTile.material.emissive.setHex(0x003300);
                goalTile.material.opacity = 0.9;
            }
            
            // Show visual effect to indicate someone else collected it
            showOtherPlayerCollectionEffect(gameKey ? gameKey.position : player.position, 'key');
            
            // Show message
            const messageElement = document.getElementById('message');
            if (messageElement) {
                messageElement.textContent = 'Another player collected the key! The exit is now unlocked!';
                messageElement.style.color = '#ff9900';
                setTimeout(() => {
                    messageElement.textContent = '';
                }, 3000);
            }
        }
    }
});

socket.on('gameStateSnapshot', (data) => {
    const { collectibleItems, currentLevel, playerCount, sessionStartTime, lastStateUpdate, voting } = data;
    console.log('Received game state snapshot:', data);
    
    // Update game state
    gameState.currentState = 'in-game';
    
    // Start background music when entering game
    soundManager.startBackgroundMusic();
    
    // Hide lobby if it's showing
    hideLobby();
    
    // Update local game state tracking
    multiplayerState.serverGameState = {
        currentLevel,
        playerCount,
        sessionStartTime,
        lastStateUpdate
    };
    
    // Process collectible items
    const { collectedCoins, collectedKeys, initialized } = collectibleItems;
    
    // Remove already collected coins
    collectedCoins.forEach(coinId => {
        const coinToRemove = coins.find(coin => coin.id === coinId);
        if (coinToRemove) {
            const index = coins.indexOf(coinToRemove);
            if (index > -1) {
                worldGroup.remove(coinToRemove);
                coins.splice(index, 1);
            }
        }
    });
    
    // Remove already collected keys
    collectedKeys.forEach(keyId => {
        if (gameKey && gameKey.id === keyId) {
            worldGroup.remove(gameKey);
            gameKey = null;
            
            // Update goal tile appearance
            if (goalTile) {
                goalTile.material.color.setHex(0x00ff00);
                goalTile.material.emissive.setHex(0x003300);
                goalTile.material.opacity = 0.9;
            }
        }
    });
    
    // Update score display
    gameScore.totalCoins = coins.length;
    updateScoreDisplay();
    
    // Handle voting state if active
    if (voting && voting.active) {
        // Restore voting state
        votingState.active = true;
        votingState.type = voting.type;
        votingState.options = voting.options;
        votingState.votes = voting.votes;
        votingState.voteCounts = voting.voteCounts;
        votingState.timeRemaining = voting.timeRemaining;
        votingState.completedBy = voting.completedBy;
        votingState.levelInfo = voting.levelInfo;
        votingState.hasVoted = voting.votes[multiplayerState.localPlayerId] !== undefined;
        votingState.myVote = voting.votes[multiplayerState.localPlayerId] || null;
        
        // Show voting UI
        showVotingUI();
        
        // Start countdown with remaining time
        startVotingTimer();
    }
    
    // Show reconnection message if this is a reconnect
    if (currentLevel.initialized && currentLevel.lastInitializedBy !== multiplayerState.localPlayerId) {
        showMessage(`Reconnected to ${currentLevel.name} (${playerCount} players)`, '#00ff88', 3000);
    }
});

socket.on('levelInitialized', (data) => {
    console.log('Level initialized by another player:', data);
    const { initializedBy, levelData, gameSession } = data;
    
    // Update local game state tracking
    if (gameSession) {
        multiplayerState.serverGameState = {
            currentLevel: gameSession.currentLevel,
            collectibleItems: gameSession.collectibleItems,
            lastStateUpdate: Date.now()
        };
        
        // Clear local collectibles to match server state
        clearAllCoins();
        if (gameKey) {
            worldGroup.remove(gameKey);
            gameKey = null;
        }
        
        // Update score display
        gameScore.totalCoins = 0;
        gameScore.hasKey = false;
        updateScoreDisplay();
        
        // Show level change message
        showMessage(`Level changed by another player: ${gameSession.currentLevel.name}`, '#ffaa00', 3000);
    }
});

socket.on('playerLeft', (playerId) => {
    console.log('Player left:', playerId);
    delete gameState.players[playerId];
});

// Multiplayer player management functions
function addOtherPlayer(playerData) {
    const playerId = playerData.id;
    
    // Create visual representation for other player
    const otherPlayerGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const playerColor = playerData.color ? playerData.color.hex : 0x4444ff; // Use assigned color or default to blue
    const otherPlayerMaterial = new THREE.MeshLambertMaterial({ 
        color: playerColor,
        transparent: true,
        opacity: 0.8
    });
    const otherPlayerMesh = new THREE.Mesh(otherPlayerGeometry, otherPlayerMaterial);
    
    // Position the other player
    otherPlayerMesh.position.set(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z
    );
    
    otherPlayerMesh.rotation.set(
        playerData.rotation.x,
        playerData.rotation.y,
        playerData.rotation.z
    );
    
    otherPlayerMesh.castShadow = true;
    worldGroup.add(otherPlayerMesh);
    
    // Create name tag with player color
    const playerName = playerData.color ? playerData.color.name : playerId.substring(0, 8);
    const nameTag = createPlayerNameTag(playerName, playerData.color);
    nameTag.position.set(0, 1, 0);
    otherPlayerMesh.add(nameTag);
    
    // Store player data
    multiplayerState.otherPlayers[playerId] = {
        id: playerId,
        mesh: otherPlayerMesh,
        nameTag: nameTag,
        position: { ...playerData.position },
        rotation: { ...playerData.rotation },
        gridPosition: { ...playerData.gridPosition },
        isMoving: playerData.isMoving,
        color: playerData.color,
        lastUpdate: Date.now()
    };
    
    console.log(`Added other player: ${playerId}`);
}

function removeOtherPlayer(playerId) {
    const otherPlayer = multiplayerState.otherPlayers[playerId];
    if (otherPlayer) {
        worldGroup.remove(otherPlayer.mesh);
        delete multiplayerState.otherPlayers[playerId];
        console.log(`Removed other player: ${playerId}`);
    }
}

function updateOtherPlayer(playerData) {
    const playerId = playerData.id;
    const otherPlayer = multiplayerState.otherPlayers[playerId];
    
    if (otherPlayer) {
        // Update position
        otherPlayer.position = { ...playerData.position };
        otherPlayer.rotation = { ...playerData.rotation };
        otherPlayer.gridPosition = { ...playerData.gridPosition };
        otherPlayer.isMoving = playerData.isMoving;
        otherPlayer.lastUpdate = Date.now();
        
        // Update color if it changed
        if (playerData.color && playerData.color.hex !== otherPlayer.color?.hex) {
            otherPlayer.color = playerData.color;
            otherPlayer.mesh.material.color.setHex(playerData.color.hex);
            
            // Update name tag
            if (otherPlayer.nameTag) {
                otherPlayer.mesh.remove(otherPlayer.nameTag);
            }
            const playerName = playerData.color ? playerData.color.name : playerId.substring(0, 8);
            otherPlayer.nameTag = createPlayerNameTag(playerName, playerData.color);
            otherPlayer.nameTag.position.set(0, 1, 0);
            otherPlayer.mesh.add(otherPlayer.nameTag);
        }
        
        // Apply position to mesh (with smooth interpolation)
        const targetPosition = new THREE.Vector3(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
        );
        
        // Smooth interpolation for better visual experience
        otherPlayer.mesh.position.lerp(targetPosition, 0.3);
        
        // Update rotation
        otherPlayer.mesh.rotation.set(
            playerData.rotation.x,
            playerData.rotation.y,
            playerData.rotation.z
        );
    }
}

function createPlayerNameTag(name, colorData = null) {
    // Create a simple text sprite for the name tag
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    // Clear canvas with transparent background
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background with player color
    if (colorData) {
        context.fillStyle = colorData.css;
        context.fillRect(0, 16, canvas.width, 32);
    }
    
    // Draw text
    context.font = '20px Arial';
    context.fillStyle = 'white';
    context.strokeStyle = 'black';
    context.lineWidth = 2;
    context.textAlign = 'center';
    
    // Add text outline for better visibility
    context.strokeText(name, canvas.width / 2, canvas.height / 2 + 6);
    context.fillText(name, canvas.width / 2, canvas.height / 2 + 6);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.5, 0.4, 1);
    
    return sprite;
}

function sendPlayerUpdate() {
    if (!multiplayerState.isConnected) return;
    
    const now = Date.now();
    if (now - multiplayerState.lastPositionUpdate < multiplayerState.updateThrottle) {
        return;
    }
    
    multiplayerState.lastPositionUpdate = now;
    
    const playerData = {
        id: multiplayerState.localPlayerId,
        position: {
            x: player.position.x,
            y: player.position.y,
            z: player.position.z
        },
        rotation: {
            x: player.rotation.x,
            y: player.rotation.y,
            z: player.rotation.z
        },
        gridPosition: {
            x: playerState.gridX,
            z: playerState.gridZ
        },
        isMoving: playerState.isMoving
    };
    
    socket.emit('playerUpdate', playerData);
}

function updateConnectionStatus() {
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    
    if (statusIndicator && statusText) {
        let indicator, text;
        const oldIndicator = statusIndicator.textContent;
        const oldText = statusText.textContent;
        
        if (multiplayerState.isReconnecting) {
            indicator = '🟡';
            text = `Reconnecting... (${multiplayerState.reconnectAttempts}/${multiplayerState.maxReconnectAttempts})`;
        } else if (multiplayerState.isConnected) {
            indicator = '🟢';
            const playerCount = multiplayerState.serverGameState ? 
                multiplayerState.serverGameState.playerCount : 
                Object.keys(multiplayerState.otherPlayers).length + 1;
            text = `Connected (${playerCount} players)`;
        } else {
            indicator = '🔴';
            text = 'Disconnected';
        }
        
        // Only update and animate if status has changed
        if (oldIndicator !== indicator || oldText !== text) {
            statusIndicator.textContent = indicator;
            statusText.textContent = text;
            
            // Animate the status change
            animateConnectionStatus();
        }
    }
}

// Function to attempt reconnection
function attemptReconnection() {
    if (multiplayerState.isReconnecting || multiplayerState.reconnectAttempts >= multiplayerState.maxReconnectAttempts) {
        return;
    }
    
    multiplayerState.isReconnecting = true;
    multiplayerState.reconnectAttempts++;
    
    console.log(`Attempting reconnection ${multiplayerState.reconnectAttempts}/${multiplayerState.maxReconnectAttempts}`);
    updateConnectionStatus();
    
    setTimeout(() => {
        if (!multiplayerState.isConnected) {
            socket.connect();
        }
        multiplayerState.isReconnecting = false;
        updateConnectionStatus();
    }, multiplayerState.reconnectDelay * multiplayerState.reconnectAttempts);
}

// Function to reset reconnection state
function resetReconnectionState() {
    multiplayerState.reconnectAttempts = 0;
    multiplayerState.isReconnecting = false;
}

// Lobby UI management functions
function showLobby() {
    const lobbyOverlay = document.getElementById('lobby-overlay');
    if (lobbyOverlay) {
        lobbyOverlay.classList.remove('hidden');
    }
}

function hideLobby() {
    const lobbyOverlay = document.getElementById('lobby-overlay');
    if (lobbyOverlay) {
        lobbyOverlay.classList.add('hidden');
    }
}

function updateLobbyUI() {
    const playerList = document.getElementById('lobby-player-list');
    const playerCount = document.getElementById('lobby-player-count');
    const maxPlayers = document.getElementById('lobby-max-players');
    const statusElement = document.getElementById('lobby-status');
    const readyBtn = document.getElementById('lobby-ready-btn');
    const startBtn = document.getElementById('lobby-start-btn');
    
    if (!playerList || !playerCount || !maxPlayers || !statusElement || !readyBtn || !startBtn) {
        return;
    }
    
    // Update player count
    const currentPlayerCount = Object.keys(lobbyState.players).length;
    playerCount.textContent = currentPlayerCount;
    maxPlayers.textContent = lobbyState.maxPlayers;
    
    // Update status
    if (lobbyState.gameState === 'starting') {
        statusElement.textContent = 'Game starting...';
        statusElement.style.color = '#ff6600';
    } else if (currentPlayerCount < lobbyState.minPlayers) {
        statusElement.textContent = `Waiting for more players (${lobbyState.minPlayers} minimum)`;
        statusElement.style.color = '#ff9900';
    } else {
        const readyCount = Object.values(lobbyState.players).filter(p => p.ready).length;
        if (readyCount === currentPlayerCount) {
            statusElement.textContent = 'All players ready!';
            statusElement.style.color = '#00ff00';
        } else {
            statusElement.textContent = `${readyCount}/${currentPlayerCount} players ready`;
            statusElement.style.color = '#00ff88';
        }
    }
    
    // Update ready button
    if (lobbyState.isReady) {
        readyBtn.textContent = 'Ready';
        readyBtn.className = 'lobby-btn ready';
    } else {
        readyBtn.textContent = 'Not Ready';
        readyBtn.className = 'lobby-btn not-ready';
    }
    
    // Update start button
    if (lobbyState.isHost) {
        startBtn.style.display = 'inline-block';
        startBtn.disabled = currentPlayerCount < lobbyState.minPlayers || lobbyState.gameState !== 'lobby';
    } else {
        startBtn.style.display = 'none';
    }
    
    // Update player list
    playerList.innerHTML = '';
    Object.values(lobbyState.players).forEach(player => {
        const playerItem = createPlayerListItem(player);
        playerList.appendChild(playerItem);
    });
}

function createPlayerListItem(player) {
    const playerItem = document.createElement('div');
    playerItem.className = 'player-item';
    
    if (player.ready) {
        playerItem.classList.add('ready');
    }
    
    if (player.isHost) {
        playerItem.classList.add('host');
    }
    
    // Player info section
    const playerInfo = document.createElement('div');
    playerInfo.className = 'player-info';
    
    // Color indicator
    const colorIndicator = document.createElement('div');
    colorIndicator.className = 'player-color';
    colorIndicator.style.backgroundColor = player.color.css;
    
    // Player name
    const playerName = document.createElement('span');
    playerName.className = 'player-name';
    playerName.textContent = player.id === multiplayerState.localPlayerId ? 'You' : player.color.name;
    
    // Host badge
    if (player.isHost) {
        const hostBadge = document.createElement('span');
        hostBadge.className = 'player-badge host';
        hostBadge.textContent = 'HOST';
        playerInfo.appendChild(hostBadge);
    }
    
    playerInfo.appendChild(colorIndicator);
    playerInfo.appendChild(playerName);
    
    // Ready status
    const readyStatus = document.createElement('div');
    readyStatus.className = `player-status ${player.ready ? 'ready' : 'not-ready'}`;
    readyStatus.textContent = player.ready ? '✓' : '✗';
    
    playerItem.appendChild(playerInfo);
    playerItem.appendChild(readyStatus);
    
    return playerItem;
}

function startCountdownDisplay(delay) {
    const countdownElement = document.getElementById('lobby-countdown');
    if (!countdownElement) return;
    
    countdownElement.style.display = 'block';
    
    let remaining = Math.ceil(delay / 1000);
    
    const updateCountdown = () => {
        if (remaining > 0) {
            countdownElement.textContent = `Game starting in ${remaining}...`;
            remaining--;
        } else {
            countdownElement.textContent = 'Starting now!';
            clearInterval(lobbyState.countdownInterval);
        }
    };
    
    updateCountdown();
    lobbyState.countdownInterval = setInterval(updateCountdown, 1000);
}

// Global functions for lobby actions (called from HTML)
function toggleReady() {
    if (lobbyState.gameState !== 'lobby') return;
    
    const newReadyState = !lobbyState.isReady;
    lobbyState.isReady = newReadyState;
    
    // Update local player state
    if (lobbyState.players[multiplayerState.localPlayerId]) {
        lobbyState.players[multiplayerState.localPlayerId].ready = newReadyState;
    }
    
    // Send to server
    socket.emit('playerReady', newReadyState);
    
    // Update UI
    updateLobbyUI();
    
    console.log(`Ready state changed to: ${newReadyState}`);
}

function startGame() {
    if (!lobbyState.isHost) return;
    
    socket.emit('startGame');
    console.log('Host requested game start');
}

function leaveLobby() {
    // This would disconnect the player
    socket.disconnect();
    showMessage('Left the lobby', '#ff9900', 2000);
}

// Function to return to lobby from game
function returnToLobby() {
    if (gameState.currentState === 'in-game') {
        socket.emit('returnToLobby');
        showMessage('Returning to lobby...', '#ffaa00', 2000);
    }
}

// Voting UI management functions
function showVotingUI() {
    const votingOverlay = document.getElementById('voting-overlay');
    if (votingOverlay) {
        votingOverlay.classList.remove('hidden');
    }
    
    // Update initial content
    updateVotingDisplay();
}

function hideVotingUI() {
    const votingOverlay = document.getElementById('voting-overlay');
    if (votingOverlay) {
        votingOverlay.classList.add('hidden');
    }
    
    // Clear timer
    if (votingState.timerInterval) {
        clearInterval(votingState.timerInterval);
        votingState.timerInterval = null;
    }
}

function updateVotingDisplay() {
    const completedByElement = document.getElementById('voting-completed-by');
    const timerElement = document.getElementById('voting-timer');
    
    if (completedByElement && votingState.completedBy) {
        const completedByPlayer = multiplayerState.otherPlayers[votingState.completedBy];
        const playerName = votingState.completedBy === multiplayerState.localPlayerId ? 'You' : 
                          (completedByPlayer ? completedByPlayer.color.name : 'Someone');
        completedByElement.textContent = `${playerName} completed the level!`;
    }
    
    if (timerElement) {
        const seconds = Math.ceil(votingState.timeRemaining / 1000);
        timerElement.textContent = `Time remaining: ${seconds}s`;
    }
    
    // Update vote counts and bars
    updateVoteCounts();
    
    // Update voting status
    updateVotingStatus();
    
    // Update option selection
    updateOptionSelection();
}

function updateVoteCounts() {
    const totalVotes = Object.values(votingState.voteCounts).reduce((sum, count) => sum + count, 0);
    
    votingState.options.forEach(option => {
        const count = votingState.voteCounts[option] || 0;
        const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
        
        const countElement = document.getElementById(`${option}-vote-count`);
        const fillElement = document.getElementById(`${option}-vote-fill`);
        
        if (countElement) {
            countElement.textContent = count;
        }
        
        if (fillElement) {
            fillElement.style.width = `${percentage}%`;
        }
    });
}

function updateVotingStatus() {
    const statusElement = document.getElementById('voting-status');
    if (!statusElement) return;
    
    if (votingState.hasVoted) {
        statusElement.textContent = `You voted: ${votingState.myVote}`;
        statusElement.className = 'voting-status voted';
    } else {
        statusElement.textContent = 'Click an option to cast your vote';
        statusElement.className = 'voting-status waiting';
    }
}

function updateOptionSelection() {
    votingState.options.forEach(option => {
        const optionElement = document.getElementById(`voting-option-${option}`);
        if (optionElement) {
            if (votingState.myVote === option) {
                optionElement.classList.add('selected');
            } else {
                optionElement.classList.remove('selected');
            }
        }
    });
}

function startVotingTimer() {
    if (votingState.timerInterval) {
        clearInterval(votingState.timerInterval);
    }
    
    votingState.timerInterval = setInterval(() => {
        votingState.timeRemaining -= 1000;
        
        if (votingState.timeRemaining <= 0) {
            votingState.timeRemaining = 0;
            clearInterval(votingState.timerInterval);
            votingState.timerInterval = null;
        }
        
        updateVotingDisplay();
    }, 1000);
}

function showVotingResults(decision, voteCounts, totalVotes) {
    const resultsElement = document.getElementById('voting-results');
    const winnerElement = document.getElementById('voting-results-winner');
    const statsElement = document.getElementById('voting-results-stats');
    
    if (resultsElement) {
        resultsElement.classList.remove('hidden');
    }
    
    if (winnerElement) {
        const actionText = decision === 'restart' ? 'Restart Level' : 'Continue to Next Level';
        winnerElement.textContent = `${actionText} wins!`;
    }
    
    if (statsElement) {
        const restartVotes = voteCounts.restart || 0;
        const continueVotes = voteCounts.continue || 0;
        statsElement.textContent = `Restart: ${restartVotes} | Continue: ${continueVotes} | Total: ${totalVotes} votes`;
    }
    
    // Hide voting options
    const optionsElement = document.getElementById('voting-options');
    if (optionsElement) {
        optionsElement.style.display = 'none';
    }
}

function resetVotingState() {
    votingState.active = false;
    votingState.type = null;
    votingState.options = [];
    votingState.votes = {};
    votingState.voteCounts = {};
    votingState.timeRemaining = 0;
    votingState.completedBy = null;
    votingState.levelInfo = null;
    votingState.hasVoted = false;
    votingState.myVote = null;
    
    // Reset UI elements
    const optionsElement = document.getElementById('voting-options');
    if (optionsElement) {
        optionsElement.style.display = 'block';
    }
    
    const resultsElement = document.getElementById('voting-results');
    if (resultsElement) {
        resultsElement.classList.add('hidden');
    }
}

// Global function for casting votes (called from HTML)
function castVote(option) {
    if (!votingState.active || votingState.hasVoted) {
        return;
    }
    
    // Update local state
    votingState.hasVoted = true;
    votingState.myVote = option;
    
    // Send vote to server
    socket.emit('castVote', { vote: option });
    
    // Update display
    updateVotingDisplay();
    
    console.log(`Cast vote: ${option}`);
}

function updateLocalPlayerColor() {
    if (multiplayerState.localPlayerColor && player) {
        // Update the local player's color
        player.material.color.setHex(multiplayerState.localPlayerColor.hex);
        
        // Update the local player's name tag
        if (localPlayerNameTag) {
            player.remove(localPlayerNameTag);
        }
        
        localPlayerNameTag = createPlayerNameTag('You', multiplayerState.localPlayerColor);
        localPlayerNameTag.position.set(0, 1, 0);
        player.add(localPlayerNameTag);
        
        console.log(`Local player color updated to: ${multiplayerState.localPlayerColor.name}`);
    }
}

// Utility functions
function updateStatus(status) {
    const statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.textContent = status;
    }
}

function updatePlayerPosition() {
    const positionElement = document.getElementById('position');
    if (positionElement) {
        const edgeInfo = isPlayerAtEdge();
        const edgeText = edgeInfo.isAtEdge ? ` - At ${edgeInfo.edge} edge (can transition to surface)` : '';
        positionElement.textContent = `Grid: (${playerState.gridX}, ${playerState.gridZ})${edgeText}`;
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Handle resize for orbit controls if enabled
    if (controls.enabled) {
        controls.handleResize();
    }
    
    // Update controls for current gravity orientation
    updateControlsForGravity();
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Always update controls for damping (if enabled) - allows camera movement even when paused
    if (controls.enabled) {
        controls.update();
    }
    
    // Always update third-person camera - allows camera movement even when paused
    updateThirdPersonCamera();
    
    // Always render the scene
    renderer.render(scene, camera);
    
    // Skip all game logic if paused
    if (gameState.isPaused) {
        return;
    }
    
    // Update player movement
    updatePlayer();
    
    // Animate coins
    animateCoins();
    
    // Animate key and goal
    animateKeyAndGoal();
    
    // Animate spike traps
    animateSpikeTraps();
    
    // Animate teleport tiles
    animateTeleportTiles();
    
    // Animate bouncing platforms
    animateBouncingPlatforms();
    
    // Send player position updates to other clients
    sendPlayerUpdate();
    
    // Check coin collection
    checkCoinCollection();
    
    // Check key and goal collection
    checkKeyAndGoalCollection();
    
    // Check spike trap collision
    checkSpikeTrapCollision();
    
    // Check teleport tile collision
    checkTeleportTileCollision();
    
    // Check bouncing platform collision
    checkBouncingPlatformCollision();
    
    // Rotate the cube
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
}

// Initialize the game
async function init() {
    console.log('Initializing 3D Game...');
    updateStatus('Loading...');
    
    // Load configuration first
    await loadConfig();
    
    // Initialize renderer and camera with config values
    initializeRenderer();
    initializeRendererSettings();
    
    // Initialize game systems with config values
    initializeTileSettings();
    initializeMovementSettings();
    initializeCameraSystem();
    
    // Update sound manager with config values
    soundManager.updateFromConfig(gameConfig);
    
    // Position camera initially
    camera.position.copy(cameraSystem.currentPosition);
    camera.lookAt(cameraSystem.currentTarget);
    
    // Add camera to camera group for rotation
    cameraGroup.add(camera);
    
    // Initialize camera preset UI
    updateCameraPresetUI();
    
    // Load saved progress
    loadLevelProgress();
    
    // Initialize comprehensive progress tracking system
    initializeProgressTracking();
    
    // Initialize JSON levels (this will also switch to JSON mode if successful)
    await initializeJsonLevels();
    
    // Don't load initial level - wait for lobby
    // The level will be loaded when the game starts from the lobby
    
    // Initialize controls for initial gravity orientation
    updateControlsForGravity();
    
    // Initialize sound system - enable audio context on first user interaction
    document.addEventListener('click', () => {
        if (soundManager.audioContext && soundManager.audioContext.state === 'suspended') {
            soundManager.audioContext.resume();
        }
        // Start background music after first user interaction
        if (!soundManager.isPlayingMusic) {
            soundManager.startBackgroundMusic();
        }
    }, { once: true });
    
    // Update status and player position
    updateStatus('Connecting to lobby...');
    updatePlayerPosition();
    
    // Start animation loop
    animate();
    
    // Name tag will be added when color is assigned
    
    // Try to connect to socket server
    console.log('Attempting to connect to Socket.io server...');
    socket.connect();
}

// Start the game
init();

// Export for debugging
window.THREE = THREE;
window.scene = scene;
window.camera = camera;
window.renderer = renderer;
window.controls = controls;
window.socket = socket;
window.floorTiles = floorTiles;
window.player = player;
window.playerState = playerState;
window.gameScore = gameScore;
window.coins = coins;
window.worldState = worldState;
// Groups are now properly initialized at the beginning of the file
window.cameraGroup = cameraGroup;
window.cameraSystem = cameraSystem;

// Make pause menu functions globally accessible
window.togglePauseMenu = togglePauseMenu;
window.resumeGame = resumeGame;
window.exitGame = exitGame;

// Make victory screen functions globally accessible
window.restartFromVictory = restartFromVictory;
window.switchToRandomMode = switchToRandomMode;
window.returnToLobbyFromVictory = returnToLobbyFromVictory;
window.rotateWorld = rotateWorld;
window.updateControlsForGravity = updateControlsForGravity;

// Make config functions globally accessible
window.reloadConfig = reloadConfig;
window.getConfigValue = getConfigValue;
window.updateThirdPersonCamera = updateThirdPersonCamera;
window.toggleCameraMode = toggleCameraMode;
window.resetCameraPosition = resetCameraPosition;
window.setCameraPreset = setCameraPreset;
window.cycleCameraPreset = cycleCameraPreset;
window.updateCameraPresetUI = updateCameraPresetUI;
window.spawnCoins = spawnCoins;
window.collectCoin = collectCoin;
window.updateScoreDisplay = updateScoreDisplay;
window.gameKey = gameKey;
window.goalTile = goalTile;
window.createKey = createKey;
window.createGoalTile = createGoalTile;
window.collectKey = collectKey;
window.completeLevel = completeLevel;
window.transitionToNextLevel = transitionToNextLevel;
window.generateNewLevel = generateNewLevel;
window.restartGame = restartGame;
window.spikeTraps = spikeTraps;
window.createSpikeTraps = createSpikeTraps;
window.damagePlayer = damagePlayer;
window.respawnPlayer = respawnPlayer;
window.teleportTiles = teleportTiles;
window.createTeleportTiles = createTeleportTiles;
window.teleportPlayer = teleportPlayer;
window.bouncingPlatforms = bouncingPlatforms;
window.createBouncingPlatforms = createBouncingPlatforms;
window.bouncePlayer = bouncePlayer;
window.jsonLevels = jsonLevels;
window.useJsonLevels = useJsonLevels;
window.loadJsonLevel = loadJsonLevel;
window.loadLevelData = loadLevelData;
window.reloadLevelData = reloadLevelData;
window.toggleLevelMode = toggleLevelMode;
window.nextJsonLevel = nextJsonLevel;
window.previousJsonLevel = previousJsonLevel;
window.updateLevelInfo = updateLevelInfo;
window.handleAllJsonLevelsCompleted = handleAllJsonLevelsCompleted;
window.handleProgressionChoice = handleProgressionChoice;
window.restartJsonLevels = restartJsonLevels;
window.switchToRandomGeneration = switchToRandomGeneration;
window.loopToFirstJsonLevel = loopToFirstJsonLevel;
window.showAllLevelsCompletedEffect = showAllLevelsCompletedEffect;
window.createProgressBar = createProgressBar;
window.levelProgress = levelProgress;
window.levelMenu = levelMenu;
window.saveLevelProgress = saveLevelProgress;
window.loadLevelProgress = loadLevelProgress;
window.updateLevelProgress = updateLevelProgress;
window.resetLevelProgress = resetLevelProgress;
window.toggleLevelMenu = toggleLevelMenu;
window.switchLevelMode = switchLevelMode;
window.updateLevelMenuDisplay = updateLevelMenuDisplay;
window.createLevelButton = createLevelButton;
window.selectLevel = selectLevel;
window.resetProgress = resetProgress;
window.levelTimer = levelTimer;
window.startLevelTimer = startLevelTimer;
window.stopLevelTimer = stopLevelTimer;
window.updateTimerDisplay = updateTimerDisplay;
window.formatTime = formatTime;
window.resetTimer = resetTimer;
window.multiplayerState = multiplayerState;
window.addOtherPlayer = addOtherPlayer;
window.removeOtherPlayer = removeOtherPlayer;
window.updateOtherPlayer = updateOtherPlayer;
window.sendPlayerUpdate = sendPlayerUpdate;
window.updateConnectionStatus = updateConnectionStatus;
window.updateLocalPlayerColor = updateLocalPlayerColor;
window.createPlayerNameTag = createPlayerNameTag;
window.detectSurfaceTransition = detectSurfaceTransition;
window.transitionToSurface = transitionToSurface;
window.executeGravityShift = executeGravityShift;
window.lobbyState = lobbyState;
window.showLobby = showLobby;
window.hideLobby = hideLobby;
window.updateLobbyUI = updateLobbyUI;
window.toggleReady = toggleReady;
window.startGame = startGame;
window.leaveLobby = leaveLobby;
window.returnToLobby = returnToLobby;
window.votingState = votingState;
window.showVotingUI = showVotingUI;
window.hideVotingUI = hideVotingUI;
window.castVote = castVote;
window.updateVotingDisplay = updateVotingDisplay;

// Progress tracking system exports
window.playerProfile = playerProfile;
window.gameSettings = gameSettings;
window.achievements = achievements;
window.gameStatistics = gameStatistics;
window.highScores = highScores;
window.savePlayerProfile = savePlayerProfile;
window.loadPlayerProfile = loadPlayerProfile;
window.saveGameSettings = saveGameSettings;
window.loadGameSettings = loadGameSettings;
window.saveAchievements = saveAchievements;
window.loadAchievements = loadAchievements;
window.saveGameStatistics = saveGameStatistics;
window.loadGameStatistics = loadGameStatistics;
window.saveHighScores = saveHighScores;
window.loadHighScores = loadHighScores;
window.applyGameSettings = applyGameSettings;
window.updateSettingsUI = updateSettingsUI;
window.startPlaySession = startPlaySession;
window.updatePlayTime = updatePlayTime;
window.trackLevelAttempt = trackLevelAttempt;
window.trackLevelCompletion = trackLevelCompletion;
window.trackPlayerDeath = trackPlayerDeath;
window.trackCoinCollection = trackCoinCollection;
window.trackKeyCollection = trackKeyCollection;
window.trackTeleportUsage = trackTeleportUsage;
window.trackTrapTriggered = trackTrapTriggered;
window.trackBouncePlatformUsage = trackBouncePlatformUsage;
window.trackCameraModeSwitch = trackCameraModeSwitch;
window.trackCameraPresetUsage = trackCameraPresetUsage;
window.unlockAchievement = unlockAchievement;
window.showAchievementNotification = showAchievementNotification;
window.addHighScore = addHighScore;
window.exportProgressData = exportProgressData;
window.importProgressData = importProgressData;
window.resetAllProgressData = resetAllProgressData;
window.resetSpecificData = resetSpecificData;
window.saveAllProgressData = saveAllProgressData;
window.loadAllProgressData = loadAllProgressData;
window.initializeProgressTracking = initializeProgressTracking;
window.showAdvancedResetMenu = showAdvancedResetMenu;
window.checkChampionAchievement = checkChampionAchievement;
window.checkTrapDodgerAchievement = checkTrapDodgerAchievement;

// HUD Animation system exports
window.animateHudElement = animateHudElement;
window.animateScoreIncrease = animateScoreIncrease;
window.animateLivesDecrease = animateLivesDecrease;
window.animateCoinCollection = animateCoinCollection;
window.animateKeyCollection = animateKeyCollection;
window.animateConnectionStatus = animateConnectionStatus;
window.animateLevelChange = animateLevelChange;
window.showFloatingScoreText = showFloatingScoreText;
window.animateNumber = animateNumber;
window.animateTimerUpdate = animateTimerUpdate;
window.animateProgressBar = animateProgressBar; 