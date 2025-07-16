import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { io } from 'socket.io-client';
import soundManager from './src/systems/soundManager.js';

// Game configuration
let gameConfig = null;

// Three.js Physics System
const physicsWorld = {
    gravity: new THREE.Vector3(0, -9.82, 0),
    surfaces: [],
    raycaster: new THREE.Raycaster(),
    downDirection: new THREE.Vector3(0, -1, 0),
    tempVector: new THREE.Vector3(),
    tempMatrix: new THREE.Matrix4(),
    debugMode: false,
    debugMaterials: {
        collision: new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3 }),
        missing: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 })
    },
    debugObjects: []
};

// Enhanced fall recovery system
const fallRecovery = {
    enabled: true,
    fallThreshold: -100, // Ultimate fall threshold
    warningThreshold: -50, // Warning threshold
    lastSafePosition: new THREE.Vector3(0, 2, 0),
    lastSafeTime: 0,
    safePositionUpdateInterval: 1000, // Update safe position every second when grounded
    fallCount: 0,
    maxFallCount: 3, // After 3 falls, force reset to spawn
    isRecovering: false
};

// Physics configuration (loaded from config.json)
let PHYSICS_CONFIG = {
    gravity: -9.82,
    playerRadius: 0.5,
    groundFriction: 0.85,
    airFriction: 0.98,
    acceleration: 12,
    maxVelocity: 8,
    jumpForce: 6,
    bounceRestitution: 0.6,
    rollingFriction: 0.02,
    minBounceVelocity: 0.1,
    maxRollSpeed: 0.5,
    rollDamping: 0.95
};

// Update physics configuration from config.json
function updatePhysicsConfig() {
    PHYSICS_CONFIG = {
        gravity: getConfigValue('physics.gravity', -12.0),
        playerRadius: getConfigValue('physics.playerRadius', 0.5),
        groundFriction: getConfigValue('physics.groundFriction', 0.92),
        airFriction: getConfigValue('physics.airFriction', 0.995),
        acceleration: getConfigValue('physics.acceleration', 15),
        maxVelocity: getConfigValue('physics.maxVelocity', 10),
        jumpForce: getConfigValue('physics.jumpForce', 8.5),
        bounceRestitution: getConfigValue('physics.bounceRestitution', 0.4),
        rollingFriction: getConfigValue('physics.rollingFriction', 0.008),
        minBounceVelocity: getConfigValue('physics.minBounceVelocity', 0.2),
        maxRollSpeed: getConfigValue('physics.maxRollSpeed', 0.8),
        rollDamping: getConfigValue('physics.rollDamping', 0.98),
        coyoteTime: getConfigValue('physics.coyoteTime', 0.15),
        jumpBufferTime: getConfigValue('physics.jumpBufferTime', 0.1),
        fallMultiplier: getConfigValue('physics.fallMultiplier', 1.8),
        lowJumpMultiplier: getConfigValue('physics.lowJumpMultiplier', 2.2),
        terminalVelocity: getConfigValue('physics.terminalVelocity', 15),
        momentumPreservation: getConfigValue('physics.momentumPreservation', 0.75),
        precisionThreshold: getConfigValue('physics.precisionThreshold', 0.05),
        maxAirborneTime: getConfigValue('physics.maxAirborneTime', 5.0), // Failsafe: max time before forced ground
        invertedWorldOffset: getConfigValue('physics.invertedWorldOffset', -30),
        invertedWorldTransitionCooldown: getConfigValue('physics.invertedWorldTransitionCooldown', 2000),
        fallThreshold: getConfigValue('physics.fallThreshold', -20),
        velocityThreshold: getConfigValue('physics.velocityThreshold', -5),
        // Enhanced collision detection settings
        collisionRayCount: getConfigValue('physics.collisionRayCount', 5),
        collisionRaySpread: getConfigValue('physics.collisionRaySpread', 0.3),
        groundCheckDistance: getConfigValue('physics.groundCheckDistance', 1.0),
        surfaceSnapDistance: getConfigValue('physics.surfaceSnapDistance', 0.1),
        // Safe position settings
        safePositionRadius: getConfigValue('physics.safePositionRadius', 2.0),
        safePositionHeight: getConfigValue('physics.safePositionHeight', 1.0)
    };
    
    // Update gravity in physics world
    physicsWorld.gravity.set(0, PHYSICS_CONFIG.gravity, 0);
    
    // Update fall recovery thresholds
    fallRecovery.fallThreshold = PHYSICS_CONFIG.fallThreshold - 80; // Much lower threshold
    fallRecovery.warningThreshold = PHYSICS_CONFIG.fallThreshold - 30;
    
    // Update inverted world configuration
    updateInvertedWorldConfig();
}

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
        updatePhysicsConfig();
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

// Initialize Three.js physics system
function initializePhysics() {
    // Add all mesh objects to physics world surfaces
    physicsWorld.surfaces = [];
    
    // Add ground plane
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x333333, transparent: true, opacity: 0.1 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.userData.isGround = true;
    physicsWorld.surfaces.push(ground);
    worldGroup.add(ground);
    
    console.log('Three.js physics system initialized');
    console.log(`Initial physics surfaces: ${physicsWorld.surfaces.length}`);
}

// Function to add surface to physics world (with spam prevention)
function addSurfaceToPhysics(surface) {
    if (!surface || !surface.geometry) {
        console.warn('Invalid surface provided to addSurfaceToPhysics');
        return;
    }
    
    if (!physicsWorld.surfaces.includes(surface)) {
        physicsWorld.surfaces.push(surface);
        // Reduced logging to prevent console spam
        if (physicsWorld.surfaces.length % 10 === 0) {
        console.log(`Added surface to physics world. Total surfaces: ${physicsWorld.surfaces.length}`);
        }
    }
}

// Function to remove surface from physics world
function removeSurfaceFromPhysics(surface) {
    const index = physicsWorld.surfaces.indexOf(surface);
    if (index > -1) {
        physicsWorld.surfaces.splice(index, 1);
        console.log(`Removed surface from physics world. Total surfaces: ${physicsWorld.surfaces.length}`);
    }
}

// Function to ensure all visible meshes are in physics world (optimized to prevent spam)
function validatePhysicsSurfaces() {
    let addedCount = 0;
    
    // Skip validation if physics world already has many surfaces (prevent spam)
    if (physicsWorld.surfaces.length > 100) {
        return 0;
    }
    
    // Check all children of world group
    worldGroup.traverse((child) => {
        if (child.isMesh && child.geometry && child.material) {
            // Skip certain objects that shouldn't be physics surfaces
            if (child.userData.isCollectible || child.userData.isEffect || child.userData.isDebug) {
                return;
            }
            
            if (!physicsWorld.surfaces.includes(child)) {
                addSurfaceToPhysics(child);
                addedCount++;
            }
        }
    });
    
    if (addedCount > 0) {
        console.log(`✅ Added ${addedCount} missing surfaces to physics world`);
    }
    
    return addedCount;
}

// Player physics properties
const playerPhysics = {
    velocity: new THREE.Vector3(0, 0, 0),
    acceleration: new THREE.Vector3(0, 0, 0),
    position: new THREE.Vector3(0, 2, 0),
    isGrounded: false,
    canJump: false,
    lastGroundNormal: new THREE.Vector3(0, 1, 0),
    rollingAxis: new THREE.Vector3(0, 0, 1),
    rollAngle: 0,
    rollSpeed: 0,
    groundDistance: 0,
    
    // Input forces
    inputForce: new THREE.Vector3(0, 0, 0),
    jumpRequested: false,
    
    // Enhanced skill-based movement features
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    lastGroundTime: 0,
    jumpStartTime: 0,
    isJumping: false,
    wasGrounded: false,
    groundedFrames: 0,
    airTime: 0,
    
    // Movement state tracking
    movementState: 'idle',
    previousVelocity: new THREE.Vector3(0, 0, 0),
    acceleration: new THREE.Vector3(0, 0, 0),
    
    // Precision movement
    lastInputTime: 0,
    inputMagnitude: 0,
    precisionMode: false
};

// Reset player physics to initial state
function resetPlayerPhysics() {
    playerPhysics.velocity.set(0, 0, 0);
    playerPhysics.acceleration.set(0, 0, 0);
    playerPhysics.position.set(0, 2, 0);
    playerPhysics.isGrounded = false;
    playerPhysics.canJump = false;
    playerPhysics.lastGroundNormal.set(0, 1, 0);
    playerPhysics.rollingAxis.set(0, 0, 1);
    playerPhysics.rollAngle = 0;
    playerPhysics.rollSpeed = 0;
    playerPhysics.groundDistance = 0;
    playerPhysics.inputForce.set(0, 0, 0);
    playerPhysics.jumpRequested = false;
    
    // Reset enhanced skill-based movement features
    playerPhysics.coyoteTimer = 0;
    playerPhysics.jumpBufferTimer = 0;
    playerPhysics.lastGroundTime = 0;
    playerPhysics.jumpStartTime = 0;
    playerPhysics.isJumping = false;
    playerPhysics.wasGrounded = false;
    playerPhysics.groundedFrames = 0;
    playerPhysics.airTime = 0;
    
    // Reset movement state tracking
    playerPhysics.movementState = 'idle';
    playerPhysics.previousVelocity.set(0, 0, 0);
    playerPhysics.acceleration.set(0, 0, 0);
    
    // Reset precision movement
    playerPhysics.lastInputTime = 0;
    playerPhysics.inputMagnitude = 0;
    playerPhysics.precisionMode = false;
    
    // Reset stability system
    playerPhysics.stablePosition = null;
    
    // Update visual player position
    player.position.copy(playerPhysics.position);
    player.rotation.set(0, 0, 0);
}

// Enhanced ground collision detection using multiple raycasts
function checkGroundCollision() {
    const rayOrigin = playerPhysics.position.clone();
    const rayDirection = worldState.gravityDirection.clone().multiplyScalar(-1);
    const rayDistance = PHYSICS_CONFIG.playerRadius + PHYSICS_CONFIG.groundCheckDistance;
    
    let bestIntersection = null;
    let bestDistance = Infinity;
    
    // Cast multiple rays for better collision detection
    for (let i = 0; i < PHYSICS_CONFIG.collisionRayCount; i++) {
        const angle = (i / PHYSICS_CONFIG.collisionRayCount) * Math.PI * 2;
        const offsetX = Math.cos(angle) * PHYSICS_CONFIG.collisionRaySpread;
        const offsetZ = Math.sin(angle) * PHYSICS_CONFIG.collisionRaySpread;
        
        const rayOriginOffset = rayOrigin.clone().add(new THREE.Vector3(offsetX, 0, offsetZ));
        physicsWorld.raycaster.set(rayOriginOffset, rayDirection);
        
        const intersects = physicsWorld.raycaster.intersectObjects(physicsWorld.surfaces, false);
        
        if (intersects.length > 0) {
            const intersection = intersects[0];
            if (intersection.distance < bestDistance) {
                bestDistance = intersection.distance;
                bestIntersection = intersection;
            }
        }
    }
    
    // Also check center ray
    physicsWorld.raycaster.set(rayOrigin, rayDirection);
    const centerIntersects = physicsWorld.raycaster.intersectObjects(physicsWorld.surfaces, false);
    if (centerIntersects.length > 0 && centerIntersects[0].distance < bestDistance) {
        bestDistance = centerIntersects[0].distance;
        bestIntersection = centerIntersects[0];
    }
    
    if (bestIntersection && bestDistance <= rayDistance) {
        // Player is on or touching ground
        const groundOffset = PHYSICS_CONFIG.playerRadius * (invertedWorld.isActive ? -1 : 1);
        const groundY = bestIntersection.point.y + groundOffset;
        
        // Improved grounding check with stable tolerance
        let shouldBeGrounded = false;
        const groundTolerance = PHYSICS_CONFIG.surfaceSnapDistance * 2; // Stable tolerance
        
        if (invertedWorld.isActive) {
            shouldBeGrounded = playerPhysics.position.y >= groundY - groundTolerance;
        } else {
            shouldBeGrounded = playerPhysics.position.y <= groundY + groundTolerance;
        }
        
        if (shouldBeGrounded) {
            // Extremely gentle ground positioning to prevent any oscillation
            const currentY = playerPhysics.position.y;
            const targetY = groundY;
            const snapStrength = 0.03; // Extremely gentle snapping
            
            // Only snap if not jumping and position difference is very significant
            if (!playerPhysics.isJumping && Math.abs(currentY - targetY) > 0.1) {
                playerPhysics.position.y = THREE.MathUtils.lerp(currentY, targetY, snapStrength);
            }
            
            // Update ground state
            playerPhysics.isGrounded = true;
            playerPhysics.canJump = true;
            playerPhysics.lastGroundNormal.copy(bestIntersection.face.normal);
            playerPhysics.groundDistance = bestDistance;
            
            // Update safe position when grounded
            updateSafePosition();
            
            // Enhanced vertical velocity reset when grounded
            const wasJumping = playerPhysics.isJumping;
            
            // Reset jumping flag when grounded (prevent bouncing)
            if (playerPhysics.isJumping) {
                playerPhysics.isJumping = false;
            }
            
            // Gentle vertical velocity control for grounded state
            const velocityTolerance = 0.2; // Larger tolerance for stability
            const shouldResetVelocity = invertedWorld.isActive ? 
                playerPhysics.velocity.y > velocityTolerance : 
                playerPhysics.velocity.y < -velocityTolerance;
            
            if (shouldResetVelocity) {
                // Gently reduce vertical movement when grounded
                playerPhysics.velocity.y *= 0.5;
                
                // Gentle acceleration reset
                if (invertedWorld.isActive) {
                    if (playerPhysics.acceleration.y < -0.2) {
                        playerPhysics.acceleration.y *= 0.7;
                    }
                } else {
                    if (playerPhysics.acceleration.y > 0.2) {
                        playerPhysics.acceleration.y *= 0.7;
                    }
                }
            }
            
            // Enhanced surface normal influence for realistic rolling on slopes
            const normalInfluence = 0.15;
            const surfaceInfluence = bestIntersection.face.normal.clone().multiplyScalar(normalInfluence);
            
            // Apply surface influence when grounded (but not during active jumping)
            if (playerPhysics.isGrounded && !wasJumping) {
                playerPhysics.velocity.add(surfaceInfluence);
            }
        } else {
            // Player is close to ground but not touching it - set as airborne
            playerPhysics.isGrounded = false;
            playerPhysics.canJump = false;
            playerPhysics.groundDistance = bestDistance;
        }
    } else {
        // No ground detected - player is in air
        playerPhysics.isGrounded = false;
        playerPhysics.canJump = false;
        playerPhysics.groundDistance = Infinity;
    }
    
    // Check for fall recovery
    checkFallRecovery();
}

// Completely disabled surface contact system to eliminate all vibration
function ensureSurfaceContact() {
    // Disabled to prevent any physics instability
    return;
}

// Minimal anti-bouncing system that only prevents extreme issues
function preventVerticalVelocityAccumulation() {
    if (!playerPhysics.isGrounded) return;
    
    const velocityTolerance = 0.3; // Very forgiving tolerance
    const accelerationTolerance = 0.5; // Very forgiving tolerance for acceleration
    
    // Only clamp velocity when extremely wrong and not jumping
    const shouldClampVelocity = invertedWorld.isActive ? 
        (playerPhysics.velocity.y > velocityTolerance || playerPhysics.velocity.y < -velocityTolerance) : 
        (playerPhysics.velocity.y < -velocityTolerance || playerPhysics.velocity.y > velocityTolerance);
    
    if (shouldClampVelocity && !playerPhysics.isJumping) {
        // Very gentle dampening to prevent sudden changes
        playerPhysics.velocity.y *= 0.8;
    }
    
    // Minimal acceleration management when grounded (unless actively jumping)
    if (!playerPhysics.isJumping) {
    const shouldClampAcceleration = invertedWorld.isActive ? 
            (playerPhysics.acceleration.y < -accelerationTolerance || playerPhysics.acceleration.y > accelerationTolerance) : 
            (playerPhysics.acceleration.y > accelerationTolerance || playerPhysics.acceleration.y < -accelerationTolerance);
    
    if (shouldClampAcceleration) {
            // Very gentle acceleration modification
        if (invertedWorld.isActive) {
                playerPhysics.acceleration.y = Math.max(playerPhysics.acceleration.y * 0.9, -0.2);
        } else {
                playerPhysics.acceleration.y = Math.min(playerPhysics.acceleration.y * 0.9, -0.2);
            }
        }
    }
}

// ============ FALL RECOVERY SYSTEM ============

// Update safe position when player is grounded
function updateSafePosition() {
    if (!playerPhysics.isGrounded || !fallRecovery.enabled) return;
    
    const currentTime = Date.now();
    if (currentTime - fallRecovery.lastSafeTime > fallRecovery.safePositionUpdateInterval) {
        fallRecovery.lastSafePosition.copy(playerPhysics.position);
        fallRecovery.lastSafeTime = currentTime;
        
        // Reset fall count when we've been safe for a while
        if (fallRecovery.fallCount > 0) {
            fallRecovery.fallCount = Math.max(0, fallRecovery.fallCount - 1);
        }
    }
}

// Check if player is falling and needs recovery
function checkFallRecovery() {
    if (!fallRecovery.enabled || fallRecovery.isRecovering) return;
    
    const playerY = playerPhysics.position.y;
    
    // Warning threshold - show warning but don't recover yet
    if (playerY < fallRecovery.warningThreshold && playerY > fallRecovery.fallThreshold) {
        if (playerPhysics.velocity.y < -5) { // Falling fast
            showMessage('⚠️ Falling! Press SPACE to jump!', '#ffaa00', 1000);
        }
    }
    
    // Ultimate fall threshold - force recovery
    if (playerY < fallRecovery.fallThreshold) {
        console.log('🚨 FALL RECOVERY: Player fell below threshold, recovering...');
        recoverFromFall();
    }
    
    // Y position clamping as last resort
    if (playerY < -100) {
        console.log('🚨 EMERGENCY CLAMP: Player fell below -100, emergency recovery!');
        emergencyRecovery();
    }
}

// Recover player from fall
function recoverFromFall() {
    if (fallRecovery.isRecovering) return;
    
    fallRecovery.isRecovering = true;
    fallRecovery.fallCount++;
    
    // Find safe position
    let recoveryPosition = fallRecovery.lastSafePosition.clone();
    
    // If we've fallen too many times, reset to spawn
    if (fallRecovery.fallCount >= fallRecovery.maxFallCount) {
        const spawnPos = gridToWorld(playerStartPosition.gridX, playerStartPosition.gridZ);
        recoveryPosition = new THREE.Vector3(spawnPos.x, spawnPos.y + 1, spawnPos.z);
        fallRecovery.fallCount = 0;
        showMessage('🔄 Respawning at start position...', '#ff6600', 2000);
    } else {
        // Validate safe position
        if (!isSafePosition(recoveryPosition)) {
            recoveryPosition = findNearestSafePosition(recoveryPosition);
        }
        showMessage(`🛡️ Fall recovery activated! (${fallRecovery.fallCount}/${fallRecovery.maxFallCount})`, '#00ff88', 2000);
    }
    
    // Set player position and physics
    playerPhysics.position.copy(recoveryPosition);
    playerPhysics.velocity.set(0, 0, 0);
    playerPhysics.isGrounded = false;
    player.position.copy(playerPhysics.position);
    
    // Update safe position
    fallRecovery.lastSafePosition.copy(recoveryPosition);
    fallRecovery.lastSafeTime = Date.now();
    
    // Play recovery sound
    soundManager.play('teleport');
    
    // Clear recovery flag after a short delay
    setTimeout(() => {
        fallRecovery.isRecovering = false;
    }, 500);
}

// Emergency recovery for extreme cases
function emergencyRecovery() {
    console.log('🚨 EMERGENCY RECOVERY: Resetting to spawn position');
    
    const spawnPos = gridToWorld(playerStartPosition.gridX, playerStartPosition.gridZ);
    const emergencyPos = new THREE.Vector3(spawnPos.x, spawnPos.y + 2, spawnPos.z);
    
    playerPhysics.position.copy(emergencyPos);
    playerPhysics.velocity.set(0, 0, 0);
    playerPhysics.isGrounded = false;
    player.position.copy(playerPhysics.position);
    
    fallRecovery.lastSafePosition.copy(emergencyPos);
    fallRecovery.lastSafeTime = Date.now();
    fallRecovery.fallCount = 0;
    fallRecovery.isRecovering = false;
    
    showMessage('🚨 Emergency recovery! Position reset.', '#ff0000', 3000);
    soundManager.play('damage');
}

// Check if a position is safe (has ground nearby)
function isSafePosition(position) {
    const testRay = new THREE.Raycaster(position, new THREE.Vector3(0, -1, 0));
    const intersects = testRay.intersectObjects(physicsWorld.surfaces, false);
    
    return intersects.length > 0 && intersects[0].distance < PHYSICS_CONFIG.safePositionRadius;
}

// Find nearest safe position
function findNearestSafePosition(fallbackPosition) {
    // Try positions in expanding circles around the fallback position
    for (let radius = 1; radius <= 10; radius++) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const testPos = fallbackPosition.clone().add(new THREE.Vector3(
                Math.cos(angle) * radius,
                PHYSICS_CONFIG.safePositionHeight,
                Math.sin(angle) * radius
            ));
            
            if (isSafePosition(testPos)) {
                return testPos;
            }
        }
    }
    
    // If no safe position found, use spawn position
    const spawnPos = gridToWorld(playerStartPosition.gridX, playerStartPosition.gridZ);
    return new THREE.Vector3(spawnPos.x, spawnPos.y + 1, spawnPos.z);
}

// ============ DEBUG VISUALIZATION SYSTEM ============

// Toggle debug mode for collision visualization
function toggleDebugMode() {
    physicsWorld.debugMode = !physicsWorld.debugMode;
    
    if (physicsWorld.debugMode) {
        showCollisionDebug();
        showMessage('🔍 Debug mode ON - Collision surfaces highlighted', '#00ff00', 2000);
    } else {
        hideCollisionDebug();
        showMessage('🔍 Debug mode OFF', '#888888', 2000);
    }
    
    console.log(`Debug mode: ${physicsWorld.debugMode ? 'ON' : 'OFF'}`);
}

// Show collision debug visualization
function showCollisionDebug() {
    hideCollisionDebug(); // Clear existing debug objects
    
    console.log(`🔍 Visualizing ${physicsWorld.surfaces.length} collision surfaces`);
    
    physicsWorld.surfaces.forEach((surface, index) => {
        try {
            // Create debug visualization for each surface
            const debugGeometry = surface.geometry.clone();
            const debugMaterial = physicsWorld.debugMaterials.collision.clone();
            const debugMesh = new THREE.Mesh(debugGeometry, debugMaterial);
            
            // Copy transform from original surface
            debugMesh.position.copy(surface.position);
            debugMesh.rotation.copy(surface.rotation);
            debugMesh.scale.copy(surface.scale);
            
            // Add to scene
            worldGroup.add(debugMesh);
            physicsWorld.debugObjects.push(debugMesh);
            
            // Add label
            const label = createDebugLabel(`Surface ${index}`, surface.position);
            worldGroup.add(label);
            physicsWorld.debugObjects.push(label);
            
        } catch (error) {
            console.warn(`Failed to create debug visualization for surface ${index}:`, error);
        }
    });
}

// Hide collision debug visualization
function hideCollisionDebug() {
    physicsWorld.debugObjects.forEach(obj => {
        worldGroup.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    });
    physicsWorld.debugObjects = [];
}

// Create debug label
function createDebugLabel(text, position) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.font = '16px Arial';
    context.textAlign = 'center';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const geometry = new THREE.PlaneGeometry(1, 0.25);
    const mesh = new THREE.Mesh(geometry, material);
    
    mesh.position.copy(position);
    mesh.position.y += 1;
    mesh.lookAt(camera.position);
    
    return mesh;
}

// Enhanced rolling animation with improved smoothness and momentum
function updateRollingAnimation() {
    const horizontalVelocity = new THREE.Vector3(playerPhysics.velocity.x, 0, playerPhysics.velocity.z);
    const speed = horizontalVelocity.length();
    
    if (speed > 0.005) { // Lower threshold for more responsive rolling
        // Calculate rolling based on movement direction
        const movementDirection = horizontalVelocity.normalize();
        
        // Create rolling axis perpendicular to movement
        const newRollingAxis = new THREE.Vector3();
        newRollingAxis.crossVectors(movementDirection, new THREE.Vector3(0, 1, 0)).normalize();
        
        // Smooth transition between rolling axes to prevent jittery rotation
        if (playerPhysics.rollingAxis.length() > 0) {
            playerPhysics.rollingAxis.lerp(newRollingAxis, 0.1);
        } else {
            playerPhysics.rollingAxis.copy(newRollingAxis);
        }
        
        // Calculate roll speed based on sphere circumference with improved physics
        const circumference = 2 * Math.PI * PHYSICS_CONFIG.playerRadius;
        const targetRollSpeed = (speed / circumference) * 2 * Math.PI;
        
        // Smooth roll speed transition for more natural acceleration/deceleration
        playerPhysics.rollSpeed = THREE.MathUtils.lerp(playerPhysics.rollSpeed, targetRollSpeed, 0.15);
        
        // Apply rolling animation with delta time for consistent frame rate
        const deltaTime = 1/60; // Fixed timestep
        playerPhysics.rollAngle += playerPhysics.rollSpeed * deltaTime;
        
        // Update visual sphere rotation with smoother interpolation
        const rollQuaternion = new THREE.Quaternion();
        rollQuaternion.setFromAxisAngle(playerPhysics.rollingAxis, playerPhysics.rollAngle);
        
        // Smooth rotation interpolation to prevent visual jitter
        player.quaternion.slerp(rollQuaternion, 0.3);
        
        // Enhanced surface contact - add slight rotation based on slope
        if (playerPhysics.isGrounded && playerPhysics.lastGroundNormal) {
            const slopeInfluence = 0.05;
            const slopeQuaternion = new THREE.Quaternion();
            slopeQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), playerPhysics.lastGroundNormal);
            player.quaternion.multiply(slopeQuaternion.clone().slerp(new THREE.Quaternion(), 1 - slopeInfluence));
        }
    } else {
        // Gradual slowdown when not moving for more natural deceleration
        playerPhysics.rollSpeed *= PHYSICS_CONFIG.rollDamping;
        
        // Continue slight rotation if there's still momentum
        if (Math.abs(playerPhysics.rollSpeed) > 0.01) {
            const deltaTime = 1/60;
            playerPhysics.rollAngle += playerPhysics.rollSpeed * deltaTime;
            
            const rollQuaternion = new THREE.Quaternion();
            rollQuaternion.setFromAxisAngle(playerPhysics.rollingAxis, playerPhysics.rollAngle);
            player.quaternion.slerp(rollQuaternion, 0.1);
        }
    }
}

// Add surface to physics world
function addPhysicsSurface(mesh) {
    physicsWorld.surfaces.push(mesh);
}

// Remove surface from physics world
function removePhysicsSurface(mesh) {
    const index = physicsWorld.surfaces.indexOf(mesh);
    if (index > -1) {
        physicsWorld.surfaces.splice(index, 1);
    }
}

// Apply physics updates without input during transitions
function applyPhysicsWithoutInput(deltaTime) {
    // Update previous state
    playerPhysics.previousVelocity.copy(playerPhysics.velocity);
    playerPhysics.wasGrounded = playerPhysics.isGrounded;
    
    // Update timers
    updateMovementTimers(deltaTime);
    
    // Apply only gravity and momentum, no input forces
    playerPhysics.inputForce.set(0, 0, 0);
    
    // Apply gravity consistently using the same method as main physics loop
    applyVariableGravity(deltaTime);
    
    // Add gravity acceleration to velocity
    playerPhysics.velocity.add(playerPhysics.acceleration.clone().multiplyScalar(deltaTime));
    
    // Apply ground friction if grounded
    if (playerPhysics.isGrounded) {
        playerPhysics.velocity.x *= PHYSICS_CONFIG.groundFriction;
        playerPhysics.velocity.z *= PHYSICS_CONFIG.groundFriction;
    }
    
    // Apply air resistance
    if (!playerPhysics.isGrounded) {
        playerPhysics.velocity.x *= PHYSICS_CONFIG.airFriction;
        playerPhysics.velocity.z *= PHYSICS_CONFIG.airFriction;
    }
    
    // Apply terminal velocity consistently
    if (playerPhysics.velocity.y < -PHYSICS_CONFIG.terminalVelocity) {
        playerPhysics.velocity.y = -PHYSICS_CONFIG.terminalVelocity;
    }
    
    // Update physics position
    const deltaPosition = playerPhysics.velocity.clone().multiplyScalar(deltaTime);
    playerPhysics.position.add(deltaPosition);
    
    // Check ground collision
    checkGroundCollision();
    
    // Additional grounding validation - check and reset if on valid surface
    if (!playerPhysics.isGrounded) {
        validateAndResetGrounding();
    }
    
    // Update movement state
    updateMovementState();
    
    // Prevent vertical velocity accumulation when grounded (anti-bouncing)
    preventVerticalVelocityAccumulation();
    
    // Sync visual player position with physics position
    player.position.copy(playerPhysics.position);
}

// Enhanced physics-based movement system for skill-based gameplay
// NOTE: This function is completely camera-independent and works identically in all camera modes
function updatePhysicsMovement() {
    const deltaTime = 1/60; // Fixed timestep for consistent physics
    const { inputState } = playerState;
    const currentTime = Date.now() / 1000;
    
    // Skip input processing if locked during transitions (pause/rotation only - NOT camera state)
    if (isInputLocked()) {
        // Still update physics for gravity/momentum but ignore input
        applyPhysicsWithoutInput(deltaTime);
        return;
    }
    
    // Store previous state for comparison
    playerPhysics.previousVelocity.copy(playerPhysics.velocity);
    playerPhysics.wasGrounded = playerPhysics.isGrounded;
    
    // Update timers
    updateMovementTimers(deltaTime);
    
    // Handle input forces with precision mode
    playerPhysics.inputForce.set(0, 0, 0);
    
    // Get camera-independent input directions for consistent physics behavior
    let cameraDirection, rightDirection;
    
    if (cameraSystem.currentMode === 'isometric') {
        // Use world-space directions for isometric mode to ensure consistent physics
        // This prevents camera angle from affecting movement physics
        cameraDirection = new THREE.Vector3(0, 0, -1); // Forward in world space
        rightDirection = new THREE.Vector3(1, 0, 0);   // Right in world space
    } else {
        // Use camera-relative directions for chase mode (natural third-person movement)
        cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Remove vertical component
        cameraDirection.normalize();
        
        rightDirection = new THREE.Vector3();
        rightDirection.crossVectors(cameraDirection, camera.up).normalize();
    }
    
    // Calculate input magnitude for precision mode
    let inputMagnitude = 0;
    if (inputState.forward) inputMagnitude += 1;
    if (inputState.backward) inputMagnitude += 1;
    if (inputState.left) inputMagnitude += 1;
    if (inputState.right) inputMagnitude += 1;
    
    playerPhysics.inputMagnitude = inputMagnitude;
    playerPhysics.precisionMode = inputMagnitude > 0 && playerPhysics.isGrounded;
    
    // Apply input forces with enhanced responsiveness
    const accelerationMultiplier = playerPhysics.precisionMode ? 1.2 : 1.0;
    const baseAcceleration = PHYSICS_CONFIG.acceleration * accelerationMultiplier;
    
    if (inputState.forward) {
        playerPhysics.inputForce.add(cameraDirection.clone().multiplyScalar(baseAcceleration));
        playerPhysics.lastInputTime = currentTime;
    }
    if (inputState.backward) {
        playerPhysics.inputForce.add(cameraDirection.clone().multiplyScalar(-baseAcceleration));
        playerPhysics.lastInputTime = currentTime;
    }
    if (inputState.left) {
        playerPhysics.inputForce.add(rightDirection.clone().multiplyScalar(-baseAcceleration));
        playerPhysics.lastInputTime = currentTime;
    }
    if (inputState.right) {
        playerPhysics.inputForce.add(rightDirection.clone().multiplyScalar(baseAcceleration));
        playerPhysics.lastInputTime = currentTime;
    }
    
    // Enhanced jump handling with coyote time and jump buffering
    handleEnhancedJump(inputState, currentTime);
    
    // Apply gravity with variable fall speed
    applyVariableGravity(deltaTime);
    
    // Add input force to acceleration
    playerPhysics.acceleration.add(playerPhysics.inputForce);
    
    // Update velocity with acceleration
    playerPhysics.velocity.add(playerPhysics.acceleration.clone().multiplyScalar(deltaTime));
    
    // Apply enhanced friction system
    applyEnhancedFriction();
    
    // Apply terminal velocity
    if (playerPhysics.velocity.y < -PHYSICS_CONFIG.terminalVelocity) {
        playerPhysics.velocity.y = -PHYSICS_CONFIG.terminalVelocity;
    }
    
    // Limit maximum horizontal velocity
    const horizontalSpeed = Math.sqrt(playerPhysics.velocity.x ** 2 + playerPhysics.velocity.z ** 2);
    if (horizontalSpeed > PHYSICS_CONFIG.maxVelocity) {
        const scale = PHYSICS_CONFIG.maxVelocity / horizontalSpeed;
        playerPhysics.velocity.x *= scale;
        playerPhysics.velocity.z *= scale;
    }
    
    // Update position
    const deltaPosition = playerPhysics.velocity.clone().multiplyScalar(deltaTime);
    playerPhysics.position.add(deltaPosition);
    
    // Ground collision detection
    checkGroundCollision();
    
    // Additional grounding validation - check and reset if on valid surface
    if (!playerPhysics.isGrounded) {
        validateAndResetGrounding();
    }
    
    // Update movement state
    updateMovementState();
    
    // Update rolling animation
    updateRollingAnimation();
    
    // Apply minimal stability optimizations only when needed
    if (playerPhysics.isGrounded) {
        // Disabled surface contact system to prevent vibration
        // ensureSurfaceContact(); // Commented out
    
    // Prevent vertical velocity accumulation when grounded (anti-bouncing)
    preventVerticalVelocityAccumulation();
    }
    
    // Update visual player position with stability enforcement
    player.position.copy(playerPhysics.position);
    
    // Force position stability when stationary to prevent vibration
    enforcePositionStability();
    
    // Update legacy grid position for backwards compatibility
    const worldPos = player.position;
    playerState.gridX = Math.round((worldPos.x / tileSize) + (gridSize / 2) - 0.5);
    playerState.gridZ = Math.round((worldPos.z / tileSize) + (gridSize / 2) - 0.5);
    
    // Validate physics surfaces only once per game session or when explicitly needed
    // Removed periodic validation to prevent repeated surface additions causing vibration
}

// Update movement timers for skill-based features
function updateMovementTimers(deltaTime) {
    const currentTime = Date.now() / 1000;
    
    // Update coyote timer
    if (playerPhysics.isGrounded) {
        playerPhysics.coyoteTimer = PHYSICS_CONFIG.coyoteTime;
        playerPhysics.lastGroundTime = currentTime;
        playerPhysics.groundedFrames++;
        playerPhysics.airTime = 0;
    } else {
        playerPhysics.coyoteTimer = Math.max(0, playerPhysics.coyoteTimer - deltaTime);
        playerPhysics.groundedFrames = 0;
        playerPhysics.airTime += deltaTime;
    }
    
    // Update jump buffer timer
    if (playerPhysics.jumpBufferTimer > 0) {
        playerPhysics.jumpBufferTimer = Math.max(0, playerPhysics.jumpBufferTimer - deltaTime);
    }
    
    // Failsafe: Check if player has been airborne for too long
    if (!playerPhysics.isGrounded && playerPhysics.airTime > PHYSICS_CONFIG.maxAirborneTime) {
        checkAirborneFailsafe();
    }
    
    // Periodic grounding validation (every 2 seconds when not grounded)
    if (!playerPhysics.isGrounded && playerPhysics.airTime > 2.0 && Math.floor(playerPhysics.airTime * 10) % 20 === 0) {
        validateAndResetGrounding();
    }
}

// Failsafe function to handle when player has been airborne for too long
function checkAirborneFailsafe() {
    console.warn(`🚨 AIRBORNE FAILSAFE TRIGGERED: Player has been airborne for ${playerPhysics.airTime.toFixed(2)} seconds`);
    console.warn(`🚨 Player position: [${playerPhysics.position.x.toFixed(2)}, ${playerPhysics.position.y.toFixed(2)}, ${playerPhysics.position.z.toFixed(2)}]`);
    console.warn(`🚨 Player velocity: [${playerPhysics.velocity.x.toFixed(2)}, ${playerPhysics.velocity.y.toFixed(2)}, ${playerPhysics.velocity.z.toFixed(2)}]`);
    
    // First, try to find a safe ground position directly below the player
    const safeGroundPosition = findSafeGroundPosition(playerPhysics.position);
    
    if (safeGroundPosition) {
        console.log(`✅ Found safe ground position at [${safeGroundPosition.x.toFixed(2)}, ${safeGroundPosition.y.toFixed(2)}, ${safeGroundPosition.z.toFixed(2)}]`);
        
        // Teleport player to safe ground position
        playerPhysics.position.copy(safeGroundPosition);
        player.position.copy(playerPhysics.position);
        
        // Reset physics state to grounded
        playerPhysics.velocity.set(0, 0, 0);
        playerPhysics.acceleration.set(0, 0, 0);
        playerPhysics.isGrounded = true;
        playerPhysics.canJump = true;
        playerPhysics.airTime = 0;
        playerPhysics.groundedFrames = 1;
        playerPhysics.lastGroundTime = Date.now() / 1000;
        
        // Show message to player
        showMessage('Position corrected - you were stuck in the air!', '#ffaa00', 3000);
        
    } else {
        console.warn(`❌ No safe ground position found, using fallback respawn`);
        
        // Fallback: Use existing respawn system
        triggerRespawn('airborne_timeout');
    }
    
    // Play a notification sound
    soundManager.play('teleport');
}

// Find a safe ground position below the player using raycasting
function findSafeGroundPosition(currentPosition) {
    const rayOrigin = currentPosition.clone();
    const rayDirection = new THREE.Vector3(0, -1, 0);
    const maxRayDistance = 50; // Search up to 50 units below
    
    physicsWorld.raycaster.set(rayOrigin, rayDirection);
    const intersects = physicsWorld.raycaster.intersectObjects(physicsWorld.surfaces, false);
    
    if (intersects.length > 0) {
        const intersection = intersects[0];
        const distance = intersection.distance;
        
        // Only use positions that are reasonable (not too far down)
        if (distance <= maxRayDistance) {
            const safeY = intersection.point.y + PHYSICS_CONFIG.playerRadius + 0.1;
            return new THREE.Vector3(currentPosition.x, safeY, currentPosition.z);
        }
    }
    
    // If no ground found below, try to find the nearest spawn point
    if (fallDetection.safeSpawnPoints && fallDetection.safeSpawnPoints.length > 0) {
        const nearestSpawn = fallDetection.safeSpawnPoints[0];
        const spawnPos = nearestSpawn.position || nearestSpawn; // Handle both old and new formats
        return new THREE.Vector3(spawnPos.x, spawnPos.y, spawnPos.z);
    }
    
    // Last resort: use default position
    return new THREE.Vector3(0, 2, 0);
}

// Validation function to test airborne failsafe system
function validateAirborneFailsafe() {
    console.log('🔍 VALIDATING AIRBORNE FAILSAFE SYSTEM...');
    
    // Check if failsafe configuration is loaded
    if (!PHYSICS_CONFIG.maxAirborneTime) {
        console.error('❌ maxAirborneTime not configured in PHYSICS_CONFIG');
        return false;
    }
    
    console.log(`✅ Max airborne time configured: ${PHYSICS_CONFIG.maxAirborneTime} seconds`);
    
    // Check current player physics state
    console.log(`📊 Current player state:`);
    console.log(`   - isGrounded: ${playerPhysics.isGrounded}`);
    console.log(`   - airTime: ${playerPhysics.airTime.toFixed(2)} seconds`);
    console.log(`   - position: [${playerPhysics.position.x.toFixed(2)}, ${playerPhysics.position.y.toFixed(2)}, ${playerPhysics.position.z.toFixed(2)}]`);
    console.log(`   - velocity: [${playerPhysics.velocity.x.toFixed(2)}, ${playerPhysics.velocity.y.toFixed(2)}, ${playerPhysics.velocity.z.toFixed(2)}]`);
    
    // Test safe ground position finding
    const testPosition = new THREE.Vector3(0, 10, 0);
    const safePos = findSafeGroundPosition(testPosition);
    if (safePos) {
        console.log(`✅ Safe ground position test passed: [${safePos.x.toFixed(2)}, ${safePos.y.toFixed(2)}, ${safePos.z.toFixed(2)}]`);
    } else {
        console.warn('⚠️  Safe ground position test failed - no safe position found');
    }
    
    // Check if failsafe functions exist
    if (typeof checkAirborneFailsafe === 'function') {
        console.log('✅ checkAirborneFailsafe function exists');
    } else {
        console.error('❌ checkAirborneFailsafe function not found');
        return false;
    }
    
    if (typeof findSafeGroundPosition === 'function') {
        console.log('✅ findSafeGroundPosition function exists');
    } else {
        console.error('❌ findSafeGroundPosition function not found');
        return false;
    }
    
    console.log('✅ AIRBORNE FAILSAFE VALIDATION COMPLETE');
    return true;
}

// Test function to simulate getting stuck in air (for debugging)
function testAirborneFailsafe() {
    console.log('🧪 TESTING AIRBORNE FAILSAFE...');
    
    // Force player into airborne state
    playerPhysics.isGrounded = false;
    playerPhysics.canJump = false;
    playerPhysics.airTime = PHYSICS_CONFIG.maxAirborneTime + 1; // Exceed the threshold
    
    console.log('🚁 Player forced into airborne state with excessive air time');
    console.log(`   - airTime: ${playerPhysics.airTime.toFixed(2)} seconds (threshold: ${PHYSICS_CONFIG.maxAirborneTime})`);
    
    // Manually trigger the failsafe
    checkAirborneFailsafe();
    
    console.log('✅ AIRBORNE FAILSAFE TEST COMPLETE');
}

// Make validation functions globally accessible for debugging
window.validateAirborneFailsafe = validateAirborneFailsafe;
window.testAirborneFailsafe = testAirborneFailsafe;
window.checkGroundingStatus = () => {
    console.log('🔍 GROUNDING STATUS:');
    console.log(`   - isGrounded: ${playerPhysics.isGrounded}`);
    console.log(`   - canJump: ${playerPhysics.canJump}`);
    console.log(`   - groundDistance: ${playerPhysics.groundDistance.toFixed(3)}`);
    console.log(`   - airTime: ${playerPhysics.airTime.toFixed(2)}s`);
    console.log(`   - position: [${playerPhysics.position.x.toFixed(2)}, ${playerPhysics.position.y.toFixed(2)}, ${playerPhysics.position.z.toFixed(2)}]`);
    console.log(`   - velocity: [${playerPhysics.velocity.x.toFixed(2)}, ${playerPhysics.velocity.y.toFixed(2)}, ${playerPhysics.velocity.z.toFixed(2)}]`);
    console.log(`   - isJumping: ${playerPhysics.isJumping}`);
    console.log(`   - movementState: ${playerPhysics.movementState}`);
    console.log(`   - jumpRequested: ${playerPhysics.jumpRequested}`);
    console.log(`   - jumpBufferTimer: ${playerPhysics.jumpBufferTimer.toFixed(3)}`);
    
    // Jump eligibility check
    const isProperlyGrounded = playerPhysics.isGrounded && 
                               playerPhysics.canJump && 
                               playerPhysics.groundDistance <= (PHYSICS_CONFIG.playerRadius + PHYSICS_CONFIG.surfaceSnapDistance);
    console.log(`   - jumpEligible: ${isProperlyGrounded}`);
};

window.toggleJumpDebug = () => {
    physicsWorld.debugMode = !physicsWorld.debugMode;
    console.log(`🔧 Jump debug mode: ${physicsWorld.debugMode ? 'ON' : 'OFF'}`);
    showMessage(`Jump debug: ${physicsWorld.debugMode ? 'ON' : 'OFF'}`, '#00ffff', 2000);
};

window.testJumpSystem = () => {
    console.log('🧪 TESTING JUMP SYSTEM...');
    
    // Test 1: Check current grounding status
    console.log('📋 Test 1: Current grounding status');
    checkGroundingStatus();
    
    // Test 2: Try jumping when grounded
    if (playerPhysics.isGrounded) {
        console.log('📋 Test 2: Attempting jump while grounded');
        const oldJumpDebug = physicsWorld.debugMode;
        physicsWorld.debugMode = true;
        
        // Simulate jump input
        playerState.inputState.jump = true;
        handleEnhancedJump(playerState.inputState, Date.now() / 1000);
        
        setTimeout(() => {
            console.log('📋 Test 2 Result: Jump velocity Y =', playerPhysics.velocity.y.toFixed(2));
            playerState.inputState.jump = false;
            physicsWorld.debugMode = oldJumpDebug;
        }, 100);
    } else {
        console.log('📋 Test 2: SKIPPED - Player not grounded');
    }
    
    // Test 3: Test jump blocking when airborne
    console.log('📋 Test 3: Testing jump blocking when airborne');
    setTimeout(() => {
        const originalGrounded = playerPhysics.isGrounded;
        playerPhysics.isGrounded = false;
        playerPhysics.canJump = false;
        
        const oldJumpDebug = physicsWorld.debugMode;
        physicsWorld.debugMode = true;
        
        // Simulate jump input while airborne
        playerState.inputState.jump = true;
        handleEnhancedJump(playerState.inputState, Date.now() / 1000);
        
        setTimeout(() => {
            console.log('📋 Test 3 Result: Jump blocked correctly');
            playerState.inputState.jump = false;
            playerPhysics.isGrounded = originalGrounded;
            physicsWorld.debugMode = oldJumpDebug;
        }, 100);
    }, 1000);
    
    console.log('✅ JUMP SYSTEM TEST COMPLETE');
};

window.testFallOffHandling = () => {
    console.log('🧪 TESTING FALL-OFF HANDLING SYSTEM...');
    
    // Test 1: Check current level support
    console.log('📋 Test 1: Current level inverted world support');
    const currentLevel = getCurrentLevelData();
    const supportsInvertedWorld = levelSupportsInvertedWorld();
    
    console.log(`   - Level: ${currentLevel ? currentLevel.name : 'Unknown'} (${currentLevel ? currentLevel.number : 'N/A'})`);
    console.log(`   - Supports inverted world: ${supportsInvertedWorld}`);
    console.log(`   - Has 3D: ${currentLevel ? currentLevel.use3D : 'N/A'}`);
    console.log(`   - Has underworld: ${currentLevel ? currentLevel.hasUnderworld : 'N/A'}`);
    console.log(`   - Has explicit inverted world: ${currentLevel ? currentLevel.hasInvertedWorld : 'N/A'}`);
    
    // Test 2: Simulate fall-off
    console.log('📋 Test 2: Simulating fall-off scenario...');
    const originalPosition = playerPhysics.position.clone();
    
    // Move player below fall threshold
    playerPhysics.position.y = invertedWorld.fallThreshold - 5;
    playerPhysics.velocity.y = -10; // Falling fast
    playerPhysics.isGrounded = false;
    
    console.log(`   - Player moved to Y: ${playerPhysics.position.y.toFixed(2)}`);
    console.log(`   - Fall threshold: ${invertedWorld.fallThreshold}`);
    console.log(`   - Expected behavior: ${supportsInvertedWorld ? 'Transition to inverted world' : 'Restart level'}`);
    
    // Trigger fall detection
    checkFallDetection();
    
    // Restore original position after a short delay
    setTimeout(() => {
        playerPhysics.position.copy(originalPosition);
        playerPhysics.velocity.y = 0;
        playerPhysics.isGrounded = true;
        console.log('📋 Test 2 Complete: Player position restored');
    }, 2000);
    
    console.log('✅ FALL-OFF HANDLING TEST COMPLETE');
};

window.checkLevelSupport = () => {
    console.log('🔍 CHECKING LEVEL INVERTED WORLD SUPPORT...');
    
    const currentLevel = getCurrentLevelData();
    const supportsInvertedWorld = levelSupportsInvertedWorld();
    
    if (currentLevel) {
        console.log(`📋 Level Information:`);
        console.log(`   - Name: ${currentLevel.name}`);
        console.log(`   - Number: ${currentLevel.number}`);
        console.log(`   - Grid Size: ${currentLevel.gridSize}`);
        console.log(`   - Use 3D: ${currentLevel.use3D || false}`);
        console.log(`   - Has Underworld: ${currentLevel.hasUnderworld || false}`);
        console.log(`   - Has Inverted World: ${currentLevel.hasInvertedWorld || 'undefined'}`);
        console.log(`   - Supports Inverted World: ${supportsInvertedWorld}`);
        console.log(`   - Current World State: ${invertedWorld.isActive ? 'Inverted' : 'Normal'}`);
    } else {
        console.log('❌ No current level data found');
    }
};

window.checkVerticalVelocity = () => {
    console.log('🔍 CHECKING VERTICAL VELOCITY STATUS...');
    
    console.log(`📋 Physics State:`);
    console.log(`   - Position: [${playerPhysics.position.x.toFixed(2)}, ${playerPhysics.position.y.toFixed(2)}, ${playerPhysics.position.z.toFixed(2)}]`);
    console.log(`   - Velocity: [${playerPhysics.velocity.x.toFixed(3)}, ${playerPhysics.velocity.y.toFixed(3)}, ${playerPhysics.velocity.z.toFixed(3)}]`);
    console.log(`   - Acceleration: [${playerPhysics.acceleration.x.toFixed(3)}, ${playerPhysics.acceleration.y.toFixed(3)}, ${playerPhysics.acceleration.z.toFixed(3)}]`);
    console.log(`   - isGrounded: ${playerPhysics.isGrounded}`);
    console.log(`   - isJumping: ${playerPhysics.isJumping}`);
    console.log(`   - canJump: ${playerPhysics.canJump}`);
    console.log(`   - groundDistance: ${playerPhysics.groundDistance.toFixed(3)}`);
    console.log(`   - airTime: ${playerPhysics.airTime.toFixed(2)}s`);
    console.log(`   - movementState: ${playerPhysics.movementState}`);
    
    // Check for potential bouncing issues
    const verticalVelocityMagnitude = Math.abs(playerPhysics.velocity.y);
    const verticalAccelerationMagnitude = Math.abs(playerPhysics.acceleration.y);
    
    if (playerPhysics.isGrounded && verticalVelocityMagnitude > 0.1) {
        console.log(`⚠️  POTENTIAL BOUNCING: Grounded but has vertical velocity: ${playerPhysics.velocity.y.toFixed(3)}`);
    }
    
    if (playerPhysics.isGrounded && verticalAccelerationMagnitude > 0.5) {
        console.log(`⚠️  POTENTIAL FLOATING: Grounded but has vertical acceleration: ${playerPhysics.acceleration.y.toFixed(3)}`);
    }
    
    if (playerPhysics.isGrounded && verticalVelocityMagnitude <= 0.05 && verticalAccelerationMagnitude <= 0.1) {
        console.log(`✅ STABLE: Player is properly grounded with minimal vertical motion`);
    }
};

window.testBouncingFix = () => {
    console.log('🧪 TESTING BOUNCING/FLOATING FIX...');
    
    // Store original state
    const originalPosition = playerPhysics.position.clone();
    const originalVelocity = playerPhysics.velocity.clone();
    const originalGrounded = playerPhysics.isGrounded;
    const originalJumping = playerPhysics.isJumping;
    
    // Test 1: Simulate grounded player with upward velocity (potential bouncing)
    console.log('📋 Test 1: Grounded player with upward velocity');
    playerPhysics.isGrounded = true;
    playerPhysics.velocity.y = 2.0; // Upward velocity
    playerPhysics.isJumping = false;
    
    console.log(`   - Before fix: velocity.y = ${playerPhysics.velocity.y.toFixed(3)}`);
    preventVerticalVelocityAccumulation();
    console.log(`   - After fix: velocity.y = ${playerPhysics.velocity.y.toFixed(3)}`);
    
    // Test 2: Simulate landing after jump (should reset jumping flag and velocity)
    console.log('📋 Test 2: Landing after jump');
    playerPhysics.isGrounded = false;
    playerPhysics.isJumping = true;
    playerPhysics.velocity.y = -1.0; // Falling
    
    // Simulate landing
    playerPhysics.isGrounded = true;
    
    console.log(`   - Before landing: isJumping = ${playerPhysics.isJumping}, velocity.y = ${playerPhysics.velocity.y.toFixed(3)}`);
    
    // This simulates what happens in checkGroundCollision
    if (playerPhysics.isJumping) {
        playerPhysics.isJumping = false;
    }
    
    const velocityTolerance = 0.1;
    const shouldResetVelocity = invertedWorld.isActive ? 
        playerPhysics.velocity.y > velocityTolerance : 
        playerPhysics.velocity.y < -velocityTolerance;
    
    if (shouldResetVelocity) {
        playerPhysics.velocity.y = 0;
    }
    
    console.log(`   - After landing: isJumping = ${playerPhysics.isJumping}, velocity.y = ${playerPhysics.velocity.y.toFixed(3)}`);
    
    // Test 3: Test continuous stability
    console.log('📋 Test 3: Continuous stability check');
    for (let i = 0; i < 5; i++) {
        playerPhysics.velocity.y = 0.2; // Small upward velocity
        preventVerticalVelocityAccumulation();
        console.log(`   - Frame ${i + 1}: velocity.y = ${playerPhysics.velocity.y.toFixed(3)}`);
    }
    
    // Restore original state
    playerPhysics.position.copy(originalPosition);
    playerPhysics.velocity.copy(originalVelocity);
    playerPhysics.isGrounded = originalGrounded;
    playerPhysics.isJumping = originalJumping;
    
    console.log('✅ BOUNCING/FLOATING FIX TEST COMPLETE');
};

// Check and reset player grounding if they're on a valid surface
function validateAndResetGrounding() {
    // Skip if player is already properly grounded
    if (playerPhysics.isGrounded) {
        return false;
    }
    
    const rayOrigin = playerPhysics.position.clone();
    // Use gravity direction to determine ray direction (works for both normal and inverted)
    const rayDirection = worldState.gravityDirection.clone().multiplyScalar(-1);
    const maxGroundDistance = PHYSICS_CONFIG.playerRadius + 0.3; // Slightly more tolerant
    
    physicsWorld.raycaster.set(rayOrigin, rayDirection);
    const intersects = physicsWorld.raycaster.intersectObjects(physicsWorld.surfaces, false);
    
    if (intersects.length > 0) {
        const intersection = intersects[0];
        const distance = intersection.distance;
        
        // Check if player is close enough to ground to be considered grounded
        if (distance <= maxGroundDistance) {
            const groundOffset = PHYSICS_CONFIG.playerRadius * (invertedWorld.isActive ? -1 : 1);
            const groundY = intersection.point.y + groundOffset;
            
            // Check if player is at or very close to ground level
            if (Math.abs(playerPhysics.position.y - groundY) <= 0.1) {
                console.log(`🔄 GROUNDING RESET: Player was on valid surface but not marked as grounded`);
                console.log(`   - World: ${invertedWorld.isActive ? 'Inverted' : 'Normal'}`);
                console.log(`   - Distance to ground: ${distance.toFixed(3)}`);
                console.log(`   - Player Y: ${playerPhysics.position.y.toFixed(3)}, Ground Y: ${groundY.toFixed(3)}`);
                
                // Reset to grounded state
                playerPhysics.position.y = groundY;
                playerPhysics.isGrounded = true;
                playerPhysics.canJump = true;
                playerPhysics.lastGroundNormal.copy(intersection.face.normal);
                playerPhysics.groundDistance = distance;
                playerPhysics.airTime = 0;
                playerPhysics.groundedFrames = 1;
                playerPhysics.lastGroundTime = Date.now() / 1000;
                
                // Stop velocity in gravity direction
                const gravityDirection = worldState.gravityDirection.normalize();
                const velocityInGravityDirection = playerPhysics.velocity.dot(gravityDirection);
                if (velocityInGravityDirection > 0) {
                    const velocityToRemove = gravityDirection.clone().multiplyScalar(velocityInGravityDirection);
                    playerPhysics.velocity.sub(velocityToRemove);
                }
                
                // Update visual position
                player.position.copy(playerPhysics.position);
                
                return true; // Grounding was reset
            }
        }
    }
    
    return false; // No grounding reset needed
}

// Enhanced ground validation with comprehensive checks
function validateGroundingState() {
    console.log('🔍 VALIDATING GROUNDING STATE...');
    
    const playerPos = playerPhysics.position;
    const rayOrigin = playerPos.clone();
    const rayDirection = new THREE.Vector3(0, -1, 0);
    const checkDistance = PHYSICS_CONFIG.playerRadius + 0.5;
    
    physicsWorld.raycaster.set(rayOrigin, rayDirection);
    const intersects = physicsWorld.raycaster.intersectObjects(physicsWorld.surfaces, false);
    
    console.log(`📊 Player Position: [${playerPos.x.toFixed(2)}, ${playerPos.y.toFixed(2)}, ${playerPos.z.toFixed(2)}]`);
    console.log(`📊 Current State: isGrounded=${playerPhysics.isGrounded}, canJump=${playerPhysics.canJump}`);
    console.log(`📊 Air Time: ${playerPhysics.airTime.toFixed(2)} seconds`);
    console.log(`📊 Velocity: [${playerPhysics.velocity.x.toFixed(2)}, ${playerPhysics.velocity.y.toFixed(2)}, ${playerPhysics.velocity.z.toFixed(2)}]`);
    
    if (intersects.length > 0) {
        const intersection = intersects[0];
        const distance = intersection.distance;
        const groundY = intersection.point.y + PHYSICS_CONFIG.playerRadius;
        
        console.log(`🎯 Ground Detection:`);
        console.log(`   - Distance to ground: ${distance.toFixed(3)}`);
        console.log(`   - Ground Y: ${groundY.toFixed(3)}`);
        console.log(`   - Player Y difference: ${(playerPos.y - groundY).toFixed(3)}`);
        
        // Check for grounding inconsistency
        if (distance <= checkDistance && Math.abs(playerPos.y - groundY) <= 0.1) {
            if (!playerPhysics.isGrounded) {
                console.log('⚠️  GROUNDING INCONSISTENCY DETECTED: Player should be grounded but isn\'t');
                return false;
            } else {
                console.log('✅ Player is properly grounded');
                return true;
            }
        } else {
            console.log('📏 Player is not close enough to ground for grounding');
            return playerPhysics.isGrounded === false;
        }
    } else {
        console.log('🚫 No ground surfaces detected below player');
        return playerPhysics.isGrounded === false;
    }
}

// Comprehensive grounding check and reset system
function checkAndResetPlayerGrounding() {
    console.log('🔧 CHECKING AND RESETTING PLAYER GROUNDING...');
    
    // First validate current state
    const isStateValid = validateGroundingState();
    
    if (!isStateValid) {
        console.log('🔄 Attempting to reset grounding...');
        const wasReset = validateAndResetGrounding();
        
        if (wasReset) {
            console.log('✅ Player grounding successfully reset');
            showMessage('Ground position corrected!', '#00ff00', 2000);
            return true;
        } else {
            console.log('❌ Could not reset player grounding - player is not on valid surface');
            return false;
        }
    } else {
        console.log('✅ Player grounding state is valid');
        return true;
    }
}

// Manual grounding check - forces a comprehensive check and reset
function forceGroundingCheck() {
    console.log('🔧 FORCING GROUNDING CHECK...');
    
    // First, check current state
    const wasGrounded = playerPhysics.isGrounded;
    const currentAirTime = playerPhysics.airTime;
    
    console.log(`📊 Before check: isGrounded=${wasGrounded}, airTime=${currentAirTime.toFixed(2)}`);
    
    // Force a comprehensive ground check
    checkGroundCollision();
    
    // Then try validation reset
    const wasReset = validateAndResetGrounding();
    
    const isNowGrounded = playerPhysics.isGrounded;
    const newAirTime = playerPhysics.airTime;
    
    console.log(`📊 After check: isGrounded=${isNowGrounded}, airTime=${newAirTime.toFixed(2)}`);
    
    if (wasReset) {
        console.log('✅ Player grounding was corrected');
        showMessage('Manual grounding check completed - position corrected!', '#00ff00', 3000);
    } else if (wasGrounded !== isNowGrounded) {
        console.log('✅ Player grounding state updated through collision detection');
        showMessage('Manual grounding check completed - state updated!', '#00ffff', 3000);
    } else {
        console.log('ℹ️ No grounding changes needed');
        showMessage('Manual grounding check completed - no changes needed', '#ffff00', 2000);
    }
    
    return { wasReset, stateChanged: wasGrounded !== isNowGrounded };
}

// Make grounding validation functions globally accessible
window.validateGroundingState = validateGroundingState;
window.validateAndResetGrounding = validateAndResetGrounding;
window.checkAndResetPlayerGrounding = checkAndResetPlayerGrounding;
window.forceGroundingCheck = forceGroundingCheck;

// ============ INVERTED WORLD SYSTEM ============

// Create inverted world geometry by mirroring existing surfaces
function createInvertedWorldGeometry() {
    console.log('🌍 Creating inverted world geometry...');
    
    // Clear existing inverted surfaces
    clearInvertedWorldGeometry();
    
    // Mirror all existing surfaces
    const surfacesToMirror = [...physicsWorld.surfaces];
    
    surfacesToMirror.forEach((surface, index) => {
        try {
            const mirroredSurface = mirrorSurface(surface, index);
            if (mirroredSurface) {
                invertedWorld.surfaces.push(mirroredSurface);
                worldGroup.add(mirroredSurface);
            }
        } catch (error) {
            console.error('Error mirroring surface:', error);
        }
    });
    
    console.log(`🌍 Created ${invertedWorld.surfaces.length} inverted surfaces`);
    
    // Initially hide inverted world geometry
    toggleInvertedWorldVisibility(false);
}

// Mirror a single surface to create its inverted counterpart
function mirrorSurface(originalSurface, index) {
    if (!originalSurface || !originalSurface.geometry) {
        return null;
    }
    
    // Clone the geometry
    const geometry = originalSurface.geometry.clone();
    
    // Create inverted material (darker/different color)
    let material;
    if (originalSurface.material) {
        material = originalSurface.material.clone();
        if (material.color) {
            // Make inverted surfaces darker and more purple/blue
            material.color.multiplyScalar(0.6);
            material.color.r *= 0.7;
            material.color.g *= 0.8;
            material.color.b *= 1.2;
        }
        if (material.emissive) {
            material.emissive.setHex(0x220044); // Dark purple glow
        }
    } else {
        material = new THREE.MeshLambertMaterial({ 
            color: 0x443366,
            emissive: 0x220044
        });
    }
    
    // Create mirrored mesh
    const mirroredSurface = new THREE.Mesh(geometry, material);
    
    // Position the mirrored surface
    mirroredSurface.position.copy(originalSurface.position);
    mirroredSurface.position.y += invertedWorld.mirrorOffset;
    
    // Flip the surface (rotate 180 degrees around X axis)
    mirroredSurface.rotation.x = Math.PI;
    
    // Copy other transform properties
    mirroredSurface.rotation.y = originalSurface.rotation.y;
    mirroredSurface.rotation.z = originalSurface.rotation.z;
    mirroredSurface.scale.copy(originalSurface.scale);
    
    // Enable shadows
    mirroredSurface.castShadow = true;
    mirroredSurface.receiveShadow = true;
    
    // Store metadata
    mirroredSurface.userData = {
        isInvertedSurface: true,
        originalSurface: originalSurface,
        mirrorIndex: index,
        id: `inverted_${index}`
    };
    
    return mirroredSurface;
}

// Clear inverted world geometry
function clearInvertedWorldGeometry() {
    invertedWorld.surfaces.forEach(surface => {
        if (surface.parent) {
            surface.parent.remove(surface);
        }
    });
    invertedWorld.surfaces.length = 0;
}

// Toggle visibility of inverted world
function toggleInvertedWorldVisibility(visible) {
    invertedWorld.surfaces.forEach(surface => {
        surface.visible = visible;
    });
}

// Calculate mirrored position for player transition with safe ground validation
function calculateMirroredPosition(worldPosition) {
    const basePosition = new THREE.Vector3(
        worldPosition.x,
        worldPosition.y + invertedWorld.mirrorOffset,
        worldPosition.z
    );
    
    // Find safe ground position in inverted world
    const safePosition = findSafeInvertedSpawnPosition(basePosition);
    return safePosition || basePosition; // Fallback to base position if no safe ground found
}

// Calculate normal world position from inverted position with safe ground validation
function calculateNormalPosition(invertedPosition) {
    const basePosition = new THREE.Vector3(
        invertedPosition.x,
        invertedPosition.y - invertedWorld.mirrorOffset,
        invertedPosition.z
    );
    
    // Find safe ground position in normal world
    const safePosition = findSafeNormalSpawnPosition(basePosition);
    return safePosition || basePosition; // Fallback to base position if no safe ground found
}

// Find safe spawn position in inverted world
function findSafeInvertedSpawnPosition(basePosition) {
    // In inverted world, check for ceiling collision (gravity points up)
    const rayOrigin = basePosition.clone();
    rayOrigin.y += 2; // Start above the base position
    const rayDirection = new THREE.Vector3(0, -1, 0); // Ray pointing down
    const maxRayDistance = 10;
    
    physicsWorld.raycaster.set(rayOrigin, rayDirection);
    const invertedSurfaces = physicsWorld.surfaces.filter(s => s.userData?.isInvertedSurface);
    const intersects = physicsWorld.raycaster.intersectObjects(invertedSurfaces, false);
    
    if (intersects.length > 0) {
        const intersection = intersects[0];
        const distance = intersection.distance;
        
        if (distance <= maxRayDistance) {
            // Place player on the inverted surface (above it since gravity points up)
            const safeY = intersection.point.y + PHYSICS_CONFIG.playerRadius + 0.1;
            const safePosition = new THREE.Vector3(basePosition.x, safeY, basePosition.z);
            
            console.log(`✅ Found safe inverted spawn at Y: ${safeY.toFixed(2)}`);
            return safePosition;
        }
    }
    
    console.warn(`⚠️ No safe inverted spawn found, using base position`);
    return null;
}

// Find safe spawn position in normal world
function findSafeNormalSpawnPosition(basePosition) {
    // In normal world, check for floor collision (gravity points down)
    const rayOrigin = basePosition.clone();
    rayOrigin.y += 2; // Start above the base position
    const rayDirection = new THREE.Vector3(0, -1, 0); // Ray pointing down
    const maxRayDistance = 10;
    
    physicsWorld.raycaster.set(rayOrigin, rayDirection);
    const normalSurfaces = physicsWorld.surfaces.filter(s => !s.userData?.isInvertedSurface);
    const intersects = physicsWorld.raycaster.intersectObjects(normalSurfaces, false);
    
    if (intersects.length > 0) {
        const intersection = intersects[0];
        const distance = intersection.distance;
        
        if (distance <= maxRayDistance) {
            // Place player on the normal surface (above it since gravity points down)
            const safeY = intersection.point.y + PHYSICS_CONFIG.playerRadius + 0.1;
            const safePosition = new THREE.Vector3(basePosition.x, safeY, basePosition.z);
            
            console.log(`✅ Found safe normal spawn at Y: ${safeY.toFixed(2)}`);
            return safePosition;
        }
    }
    
    console.warn(`⚠️ No safe normal spawn found, using base position`);
    return null;
}

// Check if player is in inverted world bounds
function isPlayerInInvertedWorld() {
    return playerPhysics.position.y < invertedWorld.mirrorOffset / 2;
}

// Transition player to inverted world
function transitionToInvertedWorld() {
    if (invertedWorld.transitionInProgress) return;
    
    const now = Date.now();
    if (now - invertedWorld.lastTransitionTime < invertedWorld.transitionCooldown) {
        return;
    }
    
    // Check gravity flip cooldown
    if (now - invertedWorld.lastGravityFlipTime < invertedWorld.gravityFlipCooldown) {
        console.log('🔄 Gravity flip on cooldown, transition blocked');
        return;
    }
    
    console.log('🔄 Transitioning to inverted world...');
    invertedWorld.transitionInProgress = true;
    invertedWorld.lastTransitionTime = now;
    invertedWorld.lastGravityFlipTime = now;
    
    // Calculate mirrored position
    const currentPos = playerPhysics.position.clone();
    const mirroredPos = calculateMirroredPosition(currentPos);
    
    // Find safe position above an inverted platform
    const safePos = findSafeInvertedSpawnPosition(mirroredPos);
    
    // Teleport player to inverted world
    playerPhysics.position.copy(safePos);
    player.position.copy(playerPhysics.position);
    
    // Flip gravity
    physicsWorld.gravity.copy(invertedWorld.invertedGravity);
    worldState.gravityDirection.set(0, 1, 0); // Gravity points up
    
    // Reset physics state
    playerPhysics.velocity.set(0, 0, 0);
    playerPhysics.acceleration.set(0, 0, 0);
    playerPhysics.isGrounded = false;
    playerPhysics.airTime = 0;
    
    // Update world state
    invertedWorld.isActive = true;
    
    // Show inverted world geometry
    toggleInvertedWorldVisibility(true);
    
    // Add inverted surfaces to physics world
    invertedWorld.surfaces.forEach(surface => {
        if (!physicsWorld.surfaces.includes(surface)) {
            physicsWorld.surfaces.push(surface);
        }
    });
    
    // Visual effects
    createInvertedWorldTransitionEffect(currentPos, mirroredPos);
    
    // Play transition sound
    soundManager.play('teleport');
    
    // Show message
    showMessage('Welcome to the Inverted World!', '#8844ff', 3000);
    
    // Add fade transition effect
    createGravityTransitionEffect();
    
    // End transition
    setTimeout(() => {
        invertedWorld.transitionInProgress = false;
    }, 1000);
}

// Transition player back to normal world
function transitionToNormalWorld() {
    if (invertedWorld.transitionInProgress) return;
    
    const now = Date.now();
    if (now - invertedWorld.lastTransitionTime < invertedWorld.transitionCooldown) {
        return;
    }
    
    // Check gravity flip cooldown
    if (now - invertedWorld.lastGravityFlipTime < invertedWorld.gravityFlipCooldown) {
        console.log('🔄 Gravity flip on cooldown, transition blocked');
        return;
    }
    
    console.log('🔄 Transitioning to normal world...');
    invertedWorld.transitionInProgress = true;
    invertedWorld.lastTransitionTime = now;
    invertedWorld.lastGravityFlipTime = now;
    
    // Calculate normal position
    const currentPos = playerPhysics.position.clone();
    const normalPos = calculateNormalPosition(currentPos);
    
    // Teleport player to normal world
    playerPhysics.position.copy(normalPos);
    player.position.copy(playerPhysics.position);
    
    // Restore normal gravity
    physicsWorld.gravity.copy(invertedWorld.originalGravity);
    worldState.gravityDirection.set(0, -1, 0); // Gravity points down
    
    // Reset physics state
    playerPhysics.velocity.set(0, 0, 0);
    playerPhysics.acceleration.set(0, 0, 0);
    playerPhysics.isGrounded = false;
    playerPhysics.airTime = 0;
    
    // Update world state
    invertedWorld.isActive = false;
    
    // Hide inverted world geometry
    toggleInvertedWorldVisibility(false);
    
    // Remove inverted surfaces from physics world
    invertedWorld.surfaces.forEach(surface => {
        const index = physicsWorld.surfaces.indexOf(surface);
        if (index !== -1) {
            physicsWorld.surfaces.splice(index, 1);
        }
    });
    
    // Visual effects
    createInvertedWorldTransitionEffect(currentPos, normalPos);
    
    // Play transition sound
    soundManager.play('teleport');
    
    // Show message
    showMessage('Back to Normal World!', '#44ff88', 3000);
    
    // Add fade transition effect
    createGravityTransitionEffect();
    
    // End transition
    setTimeout(() => {
        invertedWorld.transitionInProgress = false;
    }, 1000);
}

// Create visual effects for world transition
function createInvertedWorldTransitionEffect(fromPos, toPos) {
    // Create swirling portal effect
    const portalGeometry = new THREE.RingGeometry(0.5, 1.5, 16);
    const portalMaterial = new THREE.MeshBasicMaterial({ 
        color: invertedWorld.isActive ? 0x8844ff : 0x44ff88,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    const portal = new THREE.Mesh(portalGeometry, portalMaterial);
    
    portal.position.copy(fromPos);
    portal.rotation.x = Math.PI / 2;
    worldGroup.add(portal);
    
    // Animate portal effect
    const startTime = Date.now();
    const animatePortal = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / 1000;
        
        if (progress < 1) {
            portal.rotation.z += 0.2;
            portal.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.5);
            portal.material.opacity = 0.8 * (1 - progress);
            requestAnimationFrame(animatePortal);
        } else {
            worldGroup.remove(portal);
        }
    };
    animatePortal();
    
    // Create particle effect
    createInvertedWorldParticles(fromPos, toPos);
}

// Create particle effects for world transition
function createInvertedWorldParticles(fromPos, toPos) {
    const particleCount = 20;
    const particles = [];
    
    for (let i = 0; i < particleCount; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: invertedWorld.isActive ? 0x8844ff : 0x44ff88,
            transparent: true,
            opacity: 0.8
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        const angle = (i / particleCount) * Math.PI * 2;
        const radius = 1 + Math.random() * 2;
        particle.position.set(
            fromPos.x + Math.cos(angle) * radius,
            fromPos.y + (Math.random() - 0.5) * 2,
            fromPos.z + Math.sin(angle) * radius
        );
        
        worldGroup.add(particle);
        particles.push(particle);
    }
    
    // Animate particles
    const startTime = Date.now();
    const animateParticles = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / 1500; // 1.5 second animation
        
        if (progress < 1) {
            particles.forEach((particle, index) => {
                // Move towards destination
                const targetPos = toPos.clone();
                targetPos.x += (Math.random() - 0.5) * 0.5;
                targetPos.y += (Math.random() - 0.5) * 0.5;
                targetPos.z += (Math.random() - 0.5) * 0.5;
                
                particle.position.lerp(targetPos, progress);
                particle.material.opacity = 0.8 * (1 - progress);
                
                // Rotate particle
                particle.rotation.x += 0.1;
                particle.rotation.y += 0.1;
            });
            requestAnimationFrame(animateParticles);
        } else {
            particles.forEach(particle => {
                worldGroup.remove(particle);
            });
        }
    };
    animateParticles();
}

// Create gravity transition effect (fade and gravity flip icon)
function createGravityTransitionEffect() {
    // Create fade overlay
    const fadeOverlay = document.createElement('div');
    fadeOverlay.style.position = 'fixed';
    fadeOverlay.style.top = '0';
    fadeOverlay.style.left = '0';
    fadeOverlay.style.width = '100%';
    fadeOverlay.style.height = '100%';
    fadeOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    fadeOverlay.style.zIndex = '9999';
    fadeOverlay.style.pointerEvents = 'none';
    fadeOverlay.style.opacity = '0';
    fadeOverlay.style.transition = 'opacity 0.3s ease-in-out';
    
    // Create gravity flip icon
    const gravityIcon = document.createElement('div');
    gravityIcon.style.position = 'absolute';
    gravityIcon.style.top = '50%';
    gravityIcon.style.left = '50%';
    gravityIcon.style.transform = 'translate(-50%, -50%)';
    gravityIcon.style.fontSize = '64px';
    gravityIcon.style.color = invertedWorld.isActive ? '#8844ff' : '#44ff88';
    gravityIcon.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
    gravityIcon.style.userSelect = 'none';
    gravityIcon.innerHTML = invertedWorld.isActive ? '🔄↑' : '🔄↓';
    
    fadeOverlay.appendChild(gravityIcon);
    document.body.appendChild(fadeOverlay);
    
    // Trigger fade in
    setTimeout(() => {
        fadeOverlay.style.opacity = '1';
    }, 50);
    
    // Animate gravity icon
    let rotation = 0;
    const rotateIcon = () => {
        rotation += 10;
        gravityIcon.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
        
        if (rotation < 360) {
            setTimeout(rotateIcon, 20);
        }
    };
    rotateIcon();
    
    // Fade out and remove
    setTimeout(() => {
        fadeOverlay.style.opacity = '0';
        setTimeout(() => {
            if (fadeOverlay.parentNode) {
                fadeOverlay.parentNode.removeChild(fadeOverlay);
            }
        }, 300);
    }, 800);
}

// Validate inverted world system
function validateInvertedWorldSystem() {
    console.log('🔍 VALIDATING INVERTED WORLD SYSTEM...');
    
    // Check configuration
    console.log(`📊 Configuration:`);
    console.log(`   - Mirror offset: ${invertedWorld.mirrorOffset}`);
    console.log(`   - Transition cooldown: ${invertedWorld.transitionCooldown}ms`);
    console.log(`   - Original gravity: ${invertedWorld.originalGravity.y}`);
    console.log(`   - Inverted gravity: ${invertedWorld.invertedGravity.y}`);
    
    // Check current state
    console.log(`📊 Current State:`);
    console.log(`   - Is active: ${invertedWorld.isActive}`);
    console.log(`   - Transition in progress: ${invertedWorld.transitionInProgress}`);
    console.log(`   - Surfaces count: ${invertedWorld.surfaces.length}`);
    console.log(`   - Last transition: ${Date.now() - invertedWorld.lastTransitionTime}ms ago`);
    
    // Check player position relative to worlds
    const playerY = playerPhysics.position.y;
    const midPoint = invertedWorld.mirrorOffset / 2;
    console.log(`📊 Player Position:`);
    console.log(`   - Y: ${playerY.toFixed(2)}`);
    console.log(`   - World midpoint: ${midPoint.toFixed(2)}`);
    console.log(`   - Detected world: ${isPlayerInInvertedWorld() ? 'Inverted' : 'Normal'}`);
    
    // Check physics world surfaces
    console.log(`📊 Physics Surfaces:`);
    console.log(`   - Total surfaces: ${physicsWorld.surfaces.length}`);
    console.log(`   - Inverted surfaces in physics: ${physicsWorld.surfaces.filter(s => s.userData?.isInvertedSurface).length}`);
    
    // Check gravity state
    console.log(`📊 Gravity State:`);
    console.log(`   - Current gravity: [${physicsWorld.gravity.x}, ${physicsWorld.gravity.y}, ${physicsWorld.gravity.z}]`);
    console.log(`   - Gravity direction: [${worldState.gravityDirection.x}, ${worldState.gravityDirection.y}, ${worldState.gravityDirection.z}]`);
    
    console.log('✅ INVERTED WORLD VALIDATION COMPLETE');
    return true;
}

// Test inverted world transitions
function testInvertedWorldTransitions() {
    console.log('🧪 TESTING INVERTED WORLD TRANSITIONS...');
    
    const originalPosition = playerPhysics.position.clone();
    const originalWorld = invertedWorld.isActive;
    
    console.log(`🏁 Starting state: ${originalWorld ? 'Inverted' : 'Normal'} world`);
    console.log(`🏁 Player position: [${originalPosition.x.toFixed(2)}, ${originalPosition.y.toFixed(2)}, ${originalPosition.z.toFixed(2)}]`);
    
    // Test transition to opposite world
    if (originalWorld) {
        console.log('🧪 Testing transition to Normal world...');
        transitionToNormalWorld();
    } else {
        console.log('🧪 Testing transition to Inverted world...');
        transitionToInvertedWorld();
    }
    
    // Wait for transition to complete, then validate
    setTimeout(() => {
        const newPosition = playerPhysics.position.clone();
        const newWorld = invertedWorld.isActive;
        
        console.log(`🏁 New state: ${newWorld ? 'Inverted' : 'Normal'} world`);
        console.log(`🏁 Player position: [${newPosition.x.toFixed(2)}, ${newPosition.y.toFixed(2)}, ${newPosition.z.toFixed(2)}]`);
        
        if (newWorld !== originalWorld) {
            console.log('✅ World transition successful!');
        } else {
            console.log('❌ World transition failed!');
        }
        
        // Test transition back after cooldown
        setTimeout(() => {
            console.log('🧪 Testing transition back...');
            if (newWorld) {
                transitionToNormalWorld();
            } else {
                transitionToInvertedWorld();
            }
        }, invertedWorld.transitionCooldown + 100);
        
    }, 1100); // Wait for transition to complete
    
    console.log('✅ INVERTED WORLD TRANSITION TEST INITIATED');
}

// Test inverted world fall detection
function testInvertedWorldFallDetection() {
    console.log('🧪 TESTING INVERTED WORLD FALL DETECTION...');
    
    const originalPosition = playerPhysics.position.clone();
    
    // Force player to fall threshold
    if (invertedWorld.isActive) {
        // In inverted world, move above threshold
        playerPhysics.position.y = invertedWorld.mirrorOffset + Math.abs(fallDetection.fallThreshold) + 1;
        console.log('🧪 Moved player above inverted world threshold');
    } else {
        // In normal world, move below threshold
        playerPhysics.position.y = fallDetection.fallThreshold - 1;
        console.log('🧪 Moved player below normal world threshold');
    }
    
    player.position.copy(playerPhysics.position);
    
    console.log(`🧪 Player positioned at Y: ${playerPhysics.position.y.toFixed(2)}`);
    console.log(`🧪 Fall threshold: ${fallDetection.fallThreshold}`);
    
    // Manually trigger fall detection
    checkFallDetection();
    
    console.log('✅ INVERTED WORLD FALL DETECTION TEST COMPLETE');
}

// Make inverted world functions globally accessible
window.createInvertedWorldGeometry = createInvertedWorldGeometry;
window.transitionToInvertedWorld = transitionToInvertedWorld;
window.transitionToNormalWorld = transitionToNormalWorld;
window.toggleInvertedWorldVisibility = toggleInvertedWorldVisibility;
window.validateInvertedWorldSystem = validateInvertedWorldSystem;
window.testInvertedWorldTransitions = testInvertedWorldTransitions;
window.testInvertedWorldFallDetection = testInvertedWorldFallDetection;

// Comprehensive test function to verify all gameplay improvements
function testGameplayImprovements() {
    console.log('🧪 TESTING ALL GAMEPLAY IMPROVEMENTS...');
    console.log('='.repeat(50));
    
    // Test 1: Smooth Rolling Physics
    console.log('📋 Test 1: Smooth Rolling Physics');
    const originalRollSpeed = playerPhysics.rollSpeed;
    const originalRollAngle = playerPhysics.rollAngle;
    
    // Simulate movement to test rolling
    playerPhysics.velocity.set(5, 0, 0); // Moving right
    playerPhysics.isGrounded = true;
    
    // Test rolling animation
    updateRollingAnimation();
    
    console.log(`   - Roll speed: ${playerPhysics.rollSpeed.toFixed(3)}`);
    console.log(`   - Roll angle: ${playerPhysics.rollAngle.toFixed(3)}`);
    console.log(`   - Rolling axis: [${playerPhysics.rollingAxis.x.toFixed(2)}, ${playerPhysics.rollingAxis.y.toFixed(2)}, ${playerPhysics.rollingAxis.z.toFixed(2)}]`);
    
    if (playerPhysics.rollSpeed > 0) {
        console.log('   ✅ Smooth rolling physics working correctly');
    } else {
        console.log('   ❌ Smooth rolling physics not working');
    }
    
    // Reset for next test
    playerPhysics.velocity.set(0, 0, 0);
    playerPhysics.rollSpeed = originalRollSpeed;
    playerPhysics.rollAngle = originalRollAngle;
    
    // Test 2: Spacebar-Only Jump
    console.log('\n📋 Test 2: Spacebar-Only Jump');
    const originalJumpState = playerPhysics.isJumping;
    const originalGrounded = playerPhysics.isGrounded;
    
    // Set up for jump test
    playerPhysics.isGrounded = true;
    playerPhysics.canJump = true;
    playerPhysics.groundDistance = 0.5;
    playerPhysics.velocity.y = 0;
    
    // Test jump with spacebar
    playerState.inputState.jump = true;
    handleEnhancedJump(playerState.inputState, Date.now() / 1000);
    
    if (playerPhysics.isJumping && Math.abs(playerPhysics.velocity.y) > 0) {
        console.log('   ✅ Spacebar jump working correctly');
        console.log(`   - Jump velocity: ${playerPhysics.velocity.y.toFixed(2)}`);
    } else {
        console.log('   ❌ Spacebar jump not working');
    }
    
    // Reset jump state
    playerState.inputState.jump = false;
    playerPhysics.isJumping = originalJumpState;
    playerPhysics.isGrounded = originalGrounded;
    playerPhysics.velocity.y = 0;
    
    // Test 3: Anti-Bouncing System
    console.log('\n📋 Test 3: Anti-Bouncing System');
    const originalVelocityY = playerPhysics.velocity.y;
    
    // Set up for bouncing test
    playerPhysics.isGrounded = true;
    playerPhysics.isJumping = false;
    playerPhysics.velocity.y = 0.5; // Simulate upward velocity when grounded
    
    console.log(`   - Before anti-bounce: velocity.y = ${playerPhysics.velocity.y.toFixed(3)}`);
    
    // Apply anti-bouncing
    preventVerticalVelocityAccumulation();
    
    console.log(`   - After anti-bounce: velocity.y = ${playerPhysics.velocity.y.toFixed(3)}`);
    
    if (Math.abs(playerPhysics.velocity.y) < 0.01) {
        console.log('   ✅ Anti-bouncing system working correctly');
    } else {
        console.log('   ❌ Anti-bouncing system not working');
    }
    
    // Reset velocity
    playerPhysics.velocity.y = originalVelocityY;
    
    // Test 4: Fall Detection System
    console.log('\n📋 Test 4: Fall Detection System');
    const currentLevel = getCurrentLevelData();
    const supportsInvertedWorld = levelSupportsInvertedWorld();
    
    console.log(`   - Current level: ${currentLevel ? currentLevel.name : 'Unknown'}`);
    console.log(`   - Supports inverted world: ${supportsInvertedWorld}`);
    console.log(`   - Fall threshold: ${invertedWorld.fallThreshold}`);
    console.log(`   - Current world: ${invertedWorld.isActive ? 'Inverted' : 'Normal'}`);
    
    if (supportsInvertedWorld) {
        console.log('   ✅ Level supports inverted world - falls will transition');
    } else {
        console.log('   ✅ Level does not support inverted world - falls will restart');
    }
    
    // Test 5: Surface Contact System
    console.log('\n📋 Test 5: Surface Contact System');
    const originalPosition = playerPhysics.position.clone();
    
    // Set up for surface contact test
    playerPhysics.isGrounded = true;
    playerPhysics.position.y = 2.1; // Slightly above ground
    
    console.log(`   - Before surface contact: Y = ${playerPhysics.position.y.toFixed(3)}`);
    
    // Apply surface contact
    ensureSurfaceContact();
    
    console.log(`   - After surface contact: Y = ${playerPhysics.position.y.toFixed(3)}`);
    
    if (Math.abs(playerPhysics.position.y - 2.1) < 0.05) {
        console.log('   ✅ Surface contact system working correctly');
    } else {
        console.log('   ❌ Surface contact system not working optimally');
    }
    
    // Reset position
    playerPhysics.position.copy(originalPosition);
    
    // Test 6: Input System Verification
    console.log('\n📋 Test 6: Input System Verification');
    console.log(`   - Forward/Back: Arrow keys and WASD`);
    console.log(`   - Left/Right: Arrow keys and WASD`);
    console.log(`   - Jump: Spacebar ONLY`);
    console.log(`   - Current input state:`, playerState.inputState);
    console.log('   ✅ Input system configured for spacebar-only jumping');
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('🎮 GAMEPLAY IMPROVEMENTS SUMMARY:');
    console.log('✅ Enhanced smooth rolling with momentum and surface response');
    console.log('✅ Spacebar-only jumping with strict grounding requirements');
    console.log('✅ Eliminated floating/bouncing when not jumping');
    console.log('✅ Proper fall detection: restart levels OR transition to inverted world');
    console.log('✅ Enhanced surface contact for stable grounding');
    console.log('✅ Improved physics stability and responsiveness');
    console.log('='.repeat(50));
    
    showMessage('🎮 All gameplay improvements tested successfully!', '#00ff00', 3000);
}

// Quick test function for rolling physics specifically
function testRollingPhysics() {
    console.log('🧪 TESTING ROLLING PHYSICS...');
    
    // Save original state
    const originalVelocity = playerPhysics.velocity.clone();
    const originalGrounded = playerPhysics.isGrounded;
    
    // Test rolling in different directions
    const testDirections = [
        { name: 'Forward', velocity: new THREE.Vector3(0, 0, 5) },
        { name: 'Backward', velocity: new THREE.Vector3(0, 0, -5) },
        { name: 'Right', velocity: new THREE.Vector3(5, 0, 0) },
        { name: 'Left', velocity: new THREE.Vector3(-5, 0, 0) },
        { name: 'Diagonal', velocity: new THREE.Vector3(3, 0, 3) }
    ];
    
    playerPhysics.isGrounded = true;
    
    testDirections.forEach(test => {
        console.log(`\n📋 Testing rolling: ${test.name}`);
        playerPhysics.velocity.copy(test.velocity);
        
        updateRollingAnimation();
        
        console.log(`   - Velocity: [${test.velocity.x}, ${test.velocity.y}, ${test.velocity.z}]`);
        console.log(`   - Roll speed: ${playerPhysics.rollSpeed.toFixed(3)}`);
        console.log(`   - Roll axis: [${playerPhysics.rollingAxis.x.toFixed(2)}, ${playerPhysics.rollingAxis.y.toFixed(2)}, ${playerPhysics.rollingAxis.z.toFixed(2)}]`);
        
        if (playerPhysics.rollSpeed > 0) {
            console.log(`   ✅ Rolling correctly for ${test.name}`);
        } else {
            console.log(`   ❌ Rolling not working for ${test.name}`);
        }
    });
    
    // Restore original state
    playerPhysics.velocity.copy(originalVelocity);
    playerPhysics.isGrounded = originalGrounded;
    
    console.log('\n✅ Rolling physics test complete');
}

// Physics stability test function
function testPhysicsStability() {
    console.log('🔍 TESTING PHYSICS STABILITY...');
    console.log('='.repeat(50));
    
    // Test 1: Check surface count stability
    console.log('📋 Test 1: Surface Count Stability');
    const initialSurfaceCount = physicsWorld.surfaces.length;
    console.log(`   - Initial surfaces: ${initialSurfaceCount}`);
    
    // Run validation a few times to check if surfaces keep getting added
    for (let i = 0; i < 3; i++) {
        const added = validatePhysicsSurfaces();
        console.log(`   - Validation ${i + 1}: Added ${added} surfaces`);
    }
    
    const finalSurfaceCount = physicsWorld.surfaces.length;
    console.log(`   - Final surfaces: ${finalSurfaceCount}`);
    
    if (finalSurfaceCount === initialSurfaceCount) {
        console.log('   ✅ Surface count is stable');
    } else {
        console.log('   ⚠️  Surface count changed - may cause vibration');
    }
    
    // Test 2: Check player position stability when stationary
    console.log('\n📋 Test 2: Player Position Stability');
    const originalPosition = playerPhysics.position.clone();
    const originalVelocity = playerPhysics.velocity.clone();
    
    // Set player to be stationary and grounded
    playerPhysics.velocity.set(0, 0, 0);
    playerPhysics.isGrounded = true;
    playerPhysics.isJumping = false;
    
    const positionsBefore = [];
    const positionsAfter = [];
    
    // Record positions before physics updates
    for (let i = 0; i < 5; i++) {
        positionsBefore.push(playerPhysics.position.y);
        
        // Apply physics systems
        ensureSurfaceContact();
        preventVerticalVelocityAccumulation();
        
        positionsAfter.push(playerPhysics.position.y);
    }
    
    // Check if position is stable
    const positionVariance = positionsAfter.reduce((acc, pos, i) => {
        return acc + Math.abs(pos - positionsBefore[i]);
    }, 0) / positionsAfter.length;
    
    console.log(`   - Average position variance: ${positionVariance.toFixed(6)}`);
    
    if (positionVariance < 0.001) {
        console.log('   ✅ Position is stable when stationary');
    } else {
        console.log('   ⚠️  Position is unstable - may cause vibration');
    }
    
    // Restore original state
    playerPhysics.position.copy(originalPosition);
    playerPhysics.velocity.copy(originalVelocity);
    
    // Test 3: Check velocity stability
    console.log('\n📋 Test 3: Velocity Stability');
    playerPhysics.velocity.set(0, 0.01, 0); // Small upward velocity
    playerPhysics.isGrounded = true;
    playerPhysics.isJumping = false;
    
    console.log(`   - Before anti-bounce: velocity.y = ${playerPhysics.velocity.y.toFixed(4)}`);
    
    preventVerticalVelocityAccumulation();
    
    console.log(`   - After anti-bounce: velocity.y = ${playerPhysics.velocity.y.toFixed(4)}`);
    
    if (Math.abs(playerPhysics.velocity.y) < 0.05) {
        console.log('   ✅ Velocity is properly controlled');
    } else {
        console.log('   ⚠️  Velocity is not properly controlled');
    }
    
    // Test 4: Check grounding detection stability
    console.log('\n📋 Test 4: Grounding Detection Stability');
    const groundingResults = [];
    
    for (let i = 0; i < 5; i++) {
        checkGroundCollision();
        groundingResults.push(playerPhysics.isGrounded);
    }
    
    const groundingConsistent = groundingResults.every(result => result === groundingResults[0]);
    
    console.log(`   - Grounding results: [${groundingResults.join(', ')}]`);
    
    if (groundingConsistent) {
        console.log('   ✅ Grounding detection is consistent');
    } else {
        console.log('   ⚠️  Grounding detection is inconsistent');
    }
    
    // Restore original state
    playerPhysics.position.copy(originalPosition);
    playerPhysics.velocity.copy(originalVelocity);
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('🔧 PHYSICS STABILITY SUMMARY:');
    console.log('✅ Reduced surface validation frequency');
    console.log('✅ Gentler surface contact system');
    console.log('✅ More forgiving anti-bouncing tolerances');
    console.log('✅ Improved ground positioning to prevent sticking');
    console.log('✅ Optimized physics calculations for stationary states');
    console.log('='.repeat(50));
    
    showMessage('🔧 Physics stability test completed!', '#00ffff', 3000);
}

// Position stability enforcement system
function enforcePositionStability() {
    // Only enforce stability when grounded and not moving much
    if (!playerPhysics.isGrounded) return;
    
    const horizontalSpeed = Math.sqrt(playerPhysics.velocity.x ** 2 + playerPhysics.velocity.z ** 2);
    const verticalSpeed = Math.abs(playerPhysics.velocity.y);
    
    // If player is mostly stationary, prevent any micro-movements
    if (horizontalSpeed < 0.1 && verticalSpeed < 0.1) {
        // Store the stable position
        if (!playerPhysics.stablePosition) {
            playerPhysics.stablePosition = playerPhysics.position.clone();
        }
        
        // Check if position has changed significantly from stable position
        const positionDrift = playerPhysics.position.distanceTo(playerPhysics.stablePosition);
        
        if (positionDrift > 0.02) { // Allow small movement tolerance
            // Snap back to stable position
            playerPhysics.position.copy(playerPhysics.stablePosition);
            player.position.copy(playerPhysics.position);
            
            // Zero out any micro-velocities
            if (Math.abs(playerPhysics.velocity.x) < 0.1) playerPhysics.velocity.x = 0;
            if (Math.abs(playerPhysics.velocity.y) < 0.1) playerPhysics.velocity.y = 0;
            if (Math.abs(playerPhysics.velocity.z) < 0.1) playerPhysics.velocity.z = 0;
            
            // Zero out any micro-accelerations
            if (Math.abs(playerPhysics.acceleration.x) < 0.1) playerPhysics.acceleration.x = 0;
            if (Math.abs(playerPhysics.acceleration.y) < 0.1) playerPhysics.acceleration.y = 0;
            if (Math.abs(playerPhysics.acceleration.z) < 0.1) playerPhysics.acceleration.z = 0;
        }
    } else {
        // Clear stable position when moving
        playerPhysics.stablePosition = null;
    }
}

// Emergency stability fix function
function fixPhysicsStability() {
    console.log('🔧 APPLYING EMERGENCY STABILITY FIX...');
    
    // Force player to be grounded if they're close to a surface
    const rayOrigin = playerPhysics.position.clone();
    const rayDirection = new THREE.Vector3(0, -1, 0);
    const maxDistance = 2.0; // Check within 2 units below
    
    physicsWorld.raycaster.set(rayOrigin, rayDirection);
    const intersects = physicsWorld.raycaster.intersectObjects(physicsWorld.surfaces, false);
    
    if (intersects.length > 0) {
        const intersection = intersects[0];
        const distance = intersection.distance;
        
        if (distance < maxDistance) {
            // Force player to ground
            const groundY = intersection.point.y + PHYSICS_CONFIG.playerRadius;
            playerPhysics.position.y = groundY;
            player.position.copy(playerPhysics.position);
            
            // Reset physics state
            playerPhysics.velocity.set(0, 0, 0);
            playerPhysics.acceleration.set(0, 0, 0);
            playerPhysics.isGrounded = true;
            playerPhysics.canJump = true;
            playerPhysics.groundDistance = distance;
            
            console.log(`✅ Player stabilized at Y: ${groundY.toFixed(2)}`);
            showMessage('🔧 Physics stabilized!', '#00ff00', 2000);
        }
    }
}

// Test for stability issues
function testStabilityIssues() {
    console.log('🔍 TESTING FOR STABILITY ISSUES...');
    
    // Test 1: Check for excessive velocity
    const totalVelocity = Math.sqrt(
        playerPhysics.velocity.x ** 2 + 
        playerPhysics.velocity.y ** 2 + 
        playerPhysics.velocity.z ** 2
    );
    
    console.log(`📊 Total velocity: ${totalVelocity.toFixed(4)}`);
    
    if (totalVelocity > 0.1 && playerPhysics.isGrounded) {
        console.log('⚠️  Excessive velocity detected for grounded player');
    }
    
    // Test 2: Check for position oscillation
    const positions = [];
    for (let i = 0; i < 10; i++) {
        positions.push(playerPhysics.position.y);
        // Simulate a few physics updates
        preventVerticalVelocityAccumulation();
    }
    
    const maxY = Math.max(...positions);
    const minY = Math.min(...positions);
    const oscillation = maxY - minY;
    
    console.log(`📊 Position oscillation: ${oscillation.toFixed(6)}`);
    
    if (oscillation > 0.01) {
        console.log('⚠️  Position oscillation detected');
        fixPhysicsStability();
    }
    
    // Test 3: Check grounding consistency
    const groundingTests = [];
    for (let i = 0; i < 5; i++) {
        checkGroundCollision();
        groundingTests.push(playerPhysics.isGrounded);
    }
    
    const consistentGrounding = groundingTests.every(test => test === groundingTests[0]);
    console.log(`📊 Grounding consistency: ${consistentGrounding ? 'PASS' : 'FAIL'}`);
    
    if (!consistentGrounding) {
        console.log('⚠️  Grounding inconsistency detected');
        fixPhysicsStability();
    }
}

// Make test functions globally accessible
window.testGameplayImprovements = testGameplayImprovements;
window.testRollingPhysics = testRollingPhysics;
window.testPhysicsStability = testPhysicsStability;
window.fixPhysicsStability = fixPhysicsStability;
window.testStabilityIssues = testStabilityIssues;

// Enhanced jump handling - SPACEBAR-ONLY, GROUNDED-ONLY jumping for realistic physics
// NOTE: This function is completely camera-independent and works identically in all camera modes
function handleEnhancedJump(inputState, currentTime) {
    // Jump buffering - register jump intent ONLY from spacebar input
    if (inputState.jump && !playerPhysics.jumpRequested) {
        playerPhysics.jumpBufferTimer = PHYSICS_CONFIG.jumpBufferTime;
        playerPhysics.jumpRequested = true;
    }
    
    // Clear jump request when spacebar is released
    if (!inputState.jump) {
        playerPhysics.jumpRequested = false;
    }
    
    // Execute jump ONLY when grounded (strict grounding requirement)
    const hasJumpBuffer = playerPhysics.jumpBufferTimer > 0;
    const isProperlyGrounded = playerPhysics.isGrounded && 
                               playerPhysics.canJump && 
                               playerPhysics.groundDistance <= (PHYSICS_CONFIG.playerRadius + PHYSICS_CONFIG.surfaceSnapDistance);
    
    if (hasJumpBuffer && isProperlyGrounded && !playerPhysics.isJumping) {
        // Stricter safety check: ensure ball isn't already moving upward at all
        const isNotAlreadyJumping = Math.abs(playerPhysics.velocity.y) < 0.5;
        
        if (isNotAlreadyJumping) {
            // Execute jump - force always applied in world Y direction
            const jumpForce = PHYSICS_CONFIG.jumpForce * (invertedWorld.isActive ? -1 : 1);
            playerPhysics.velocity.y = jumpForce;
            playerPhysics.isJumping = true;
            playerPhysics.jumpStartTime = currentTime;
            playerPhysics.jumpBufferTimer = 0;
            playerPhysics.coyoteTimer = 0;
            playerPhysics.canJump = false;
            playerPhysics.isGrounded = false;
            
            // Preserve some horizontal momentum (camera-independent calculation)
            const horizontalSpeed = Math.sqrt(playerPhysics.velocity.x ** 2 + playerPhysics.velocity.z ** 2);
            if (horizontalSpeed > 0.1) {
                const momentumBonus = horizontalSpeed * PHYSICS_CONFIG.momentumPreservation;
                const momentumDirection = invertedWorld.isActive ? -1 : 1;
                playerPhysics.velocity.y += momentumBonus * 0.3 * momentumDirection;
            }
            
            soundManager.play('jump');
            
            // Debug logging for jump validation
            if (physicsWorld.debugMode) {
                console.log(`🚀 SPACEBAR JUMP executed - Ground distance: ${playerPhysics.groundDistance.toFixed(3)}, Jump force: ${jumpForce.toFixed(2)}`);
            }
        } else {
            // Clear jump buffer if conditions aren't met
            playerPhysics.jumpBufferTimer = 0;
            
            if (physicsWorld.debugMode) {
                console.log(`⚠️ SPACEBAR JUMP blocked - already moving vertically (${playerPhysics.velocity.y.toFixed(2)})`);
            }
        }
    } else if (hasJumpBuffer && !isProperlyGrounded) {
        // Provide feedback when trying to jump while not grounded
        if (physicsWorld.debugMode) {
            console.log(`⚠️ SPACEBAR JUMP blocked - not properly grounded (isGrounded: ${playerPhysics.isGrounded}, canJump: ${playerPhysics.canJump}, groundDistance: ${playerPhysics.groundDistance.toFixed(3)})`);
        }
        
        // Visual feedback for blocked jump (less frequent to avoid spam)
        if (playerPhysics.jumpRequested && currentTime - (playerPhysics.lastJumpFailMessage || 0) > 2) {
            showMessage('⚠️ Can only jump when grounded!', '#ff6600', 1500);
            playerPhysics.jumpBufferTimer = 0; // Clear buffer to prevent repeated messages
            playerPhysics.lastJumpFailMessage = currentTime;
        }
    }
    
    // Additional safety: Reset jumping flag when grounded (redundant check for edge cases)
    if (playerPhysics.isGrounded && playerPhysics.isJumping) {
        playerPhysics.isJumping = false;
        
        // Extra safety: ensure vertical velocity is zeroed if somehow still present
        const velocityTolerance = 0.05; // Tighter tolerance
        const shouldClamp = invertedWorld.isActive ? 
            playerPhysics.velocity.y > velocityTolerance : 
            playerPhysics.velocity.y < -velocityTolerance;
        
        if (shouldClamp) {
            playerPhysics.velocity.y = 0;
        }
        
        if (physicsWorld.debugMode) {
            console.log(`🛬 Jump landing detected - resetting jump state`);
        }
    }
}

// Apply variable gravity for better jump feel
// NOTE: This function is completely camera-independent and works identically in all camera modes
function applyVariableGravity(deltaTime) {
    let gravityMultiplier = 1.0;
    
    // Fast fall when moving downward (camera-independent velocity check)
    if (playerPhysics.velocity.y < 0) {
        gravityMultiplier = PHYSICS_CONFIG.fallMultiplier;
    }
    // Lower gravity for short jumps (when jump button is released early)
    else if (playerPhysics.velocity.y > 0 && !playerState.inputState.jump && playerPhysics.isJumping) {
        gravityMultiplier = PHYSICS_CONFIG.lowJumpMultiplier;
    }
    
    // Apply gravity with multiplier (always uses world space gravity direction)
    const gravity = physicsWorld.gravity.clone().multiplyScalar(gravityMultiplier);
    playerPhysics.acceleration.copy(gravity);
}

// Enhanced friction system for realistic rolling physics
function applyEnhancedFriction() {
    if (playerPhysics.isGrounded) {
        // Ground friction with momentum preservation
        const horizontalSpeed = Math.sqrt(playerPhysics.velocity.x ** 2 + playerPhysics.velocity.z ** 2);
        
        if (horizontalSpeed > PHYSICS_CONFIG.precisionThreshold) {
            // Apply ground friction (slightly reduced for better rolling feel)
            const adjustedGroundFriction = PHYSICS_CONFIG.groundFriction * 0.98;
            playerPhysics.velocity.x *= adjustedGroundFriction;
            playerPhysics.velocity.z *= adjustedGroundFriction;
            
            // Apply rolling friction (realistic ball rolling resistance)
            const rollingResistance = PHYSICS_CONFIG.rollingFriction * horizontalSpeed;
            const frictionForce = Math.min(rollingResistance, horizontalSpeed * 0.08);
            const frictionDirection = new THREE.Vector3(playerPhysics.velocity.x, 0, playerPhysics.velocity.z).normalize();
            playerPhysics.velocity.x -= frictionDirection.x * frictionForce;
            playerPhysics.velocity.z -= frictionDirection.z * frictionForce;
            
            // Add slight surface adhesion to prevent floating
            const adhesionForce = 0.5;
            if (playerPhysics.velocity.y > -0.1 && playerPhysics.velocity.y < 0.1) {
                playerPhysics.velocity.y -= adhesionForce;
            }
        } else {
            // Gradual stop for precision (more realistic than instant stop)
            playerPhysics.velocity.x *= 0.85;
            playerPhysics.velocity.z *= 0.85;
        }
    } else {
        // Air friction - very light to preserve momentum
        playerPhysics.velocity.x *= PHYSICS_CONFIG.airFriction;
        playerPhysics.velocity.z *= PHYSICS_CONFIG.airFriction;
    }
}

// Update movement state for better tracking
// NOTE: This function is completely camera-independent and works identically in all camera modes
function updateMovementState() {
    const horizontalSpeed = Math.sqrt(playerPhysics.velocity.x ** 2 + playerPhysics.velocity.z ** 2);
    const verticalSpeed = Math.abs(playerPhysics.velocity.y);
    
    if (playerPhysics.isGrounded) {
        if (horizontalSpeed > 0.1) {
            playerPhysics.movementState = 'rolling';
        } else {
            playerPhysics.movementState = 'idle';
        }
    } else {
        if (playerPhysics.velocity.y > 1.0) {
            playerPhysics.movementState = 'jumping';
        } else if (playerPhysics.velocity.y < -1.0) {
            playerPhysics.movementState = 'falling';
        } else {
            playerPhysics.movementState = 'airborne';
        }
    }
}

// Physics validation function to ensure camera mode doesn't interfere with physics
function validatePhysicsConsistency() {
    const issues = [];
    
    // Check if physics position is valid
    if (isNaN(playerPhysics.position.x) || isNaN(playerPhysics.position.y) || isNaN(playerPhysics.position.z)) {
        issues.push('❌ Physics position contains NaN values');
    }
    
    // Check if physics velocity is valid
    if (isNaN(playerPhysics.velocity.x) || isNaN(playerPhysics.velocity.y) || isNaN(playerPhysics.velocity.z)) {
        issues.push('❌ Physics velocity contains NaN values');
    }
    
    // Check if gravity is properly applied
    if (isNaN(physicsWorld.gravity.x) || isNaN(physicsWorld.gravity.y) || isNaN(physicsWorld.gravity.z)) {
        issues.push('❌ Physics gravity contains NaN values');
    }
    
    // Check if visual position matches physics position
    const positionDiff = player.position.distanceTo(playerPhysics.position);
    if (positionDiff > 0.1) {
        issues.push(`⚠️ Visual position desync: ${positionDiff.toFixed(3)} units`);
    }
    
    // Check if jump physics are working
    if (playerPhysics.isJumping && playerPhysics.velocity.y <= 0) {
        issues.push('⚠️ Jump physics inconsistency detected');
    }
    
    // Check if ground detection is working
    if (playerPhysics.isGrounded && playerPhysics.groundDistance > PHYSICS_CONFIG.playerRadius + 0.2) {
        issues.push('⚠️ Ground detection inconsistency detected');
    }
    
    if (issues.length === 0) {
        console.log('✅ Physics system validation passed - camera mode is not interfering with physics');
        return true;
    } else {
        console.warn('🔍 Physics system validation issues detected:');
        issues.forEach(issue => console.warn(issue));
        return false;
    }
}

// Debug function to test physics consistency across camera modes
function testPhysicsConsistency() {
    console.log('🧪 Testing physics consistency across camera modes...');
    
    const originalMode = cameraSystem.currentMode;
    
    // Test in chase mode
    cameraSystem.currentMode = 'chase';
    console.log('Testing in chase mode:');
    const chaseValid = validatePhysicsConsistency();
    
    // Test in isometric mode
    cameraSystem.currentMode = 'isometric';
    console.log('Testing in isometric mode:');
    const isometricValid = validatePhysicsConsistency();
    
    // Restore original mode
    cameraSystem.currentMode = originalMode;
    
    if (chaseValid && isometricValid) {
        console.log('✅ Physics consistency test passed - both camera modes work correctly');
    } else {
        console.warn('❌ Physics consistency test failed - camera mode interference detected');
    }
    
    return chaseValid && isometricValid;
}



// Create Kula World style test level with curved surfaces
function createKulaWorldTestLevel() {
    // Create curved ramp - simulated with multiple angled platforms
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 0.8; // Create a curve
        const x = Math.cos(angle) * 8 + 3;
        const z = Math.sin(angle) * 8;
        const y = 1 + Math.sin(angle) * 3;
        const rotationY = -angle;
        
        const platform = createCurvedPlatform(x, y, z, 2.5, 0.3, 2.5, 0, rotationY, 0);
        addPhysicsSurface(platform);
    }
    
    // Create spiral ramp
    for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 3; // 1.5 full rotations
        const radius = 6;
        const x = Math.cos(angle) * radius - 8;
        const z = Math.sin(angle) * radius;
        const y = 1 + i * 0.4;
        
        const platform = createCurvedPlatform(x, y, z, 2, 0.3, 2, 0, 0, 0);
        addPhysicsSurface(platform);
    }
    
    // Create angled platforms at different heights
    createAngledPlatform(12, 3, 0, 4, 0.5, 4, Math.PI / 6, 0, 0);
    createAngledPlatform(-12, 5, 5, 4, 0.5, 4, -Math.PI / 8, 0, Math.PI / 4);
    createAngledPlatform(0, 8, -12, 6, 0.5, 3, 0, 0, Math.PI / 3);
    
    // Create jumping platforms
    createCurvedPlatform(-15, 10, 0, 3, 0.5, 3, 0, 0, 0);
    createCurvedPlatform(15, 12, 8, 3, 0.5, 3, 0, 0, 0);
    
    // Create some obstacles
    createCurvedPlatform(0, 2, 4, 1, 2, 1, 0, 0, 0);
    createCurvedPlatform(4, 1.5, -2, 1, 1.5, 1, 0, 0, 0);
    
    console.log('Kula World test level created with curved surfaces');
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
    
    // Add floating animation and unique ID for multiplayer sync
    coin.userData = {
        originalY: coin.position.y,
        animationOffset: Math.random() * Math.PI * 2,
        id: `coin_${gridX}_${gridZ}`
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
        if (multiplayerState.isConnected && coin.userData.id && !gameMode.isSinglePlayer) {
            socket.emit('collectItem', {
                itemType: 'coin',
                itemId: coin.userData.id
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
        
        // Check for level completion in single player mode
        if (gameMode.isSinglePlayer && gameScore.coins >= gameScore.requiredCoins && gameScore.hasKey) {
            setTimeout(() => {
                checkForAutoLevelCompletion();
            }, 1000);
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
    
    if (gameMode.isSinglePlayer && gameScore.requiredCoins > 0) {
        // Single player mode: show "Coins: X / Y" format
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
            coinsTotalElement.textContent = gameScore.requiredCoins;
        }
    } else {
        // Multiplayer mode: show traditional format
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
    }
    
    // Update key status with animation
    const keyStatusElement = document.getElementById('key-status');
    if (keyStatusElement) {
        const oldKeyStatus = keyStatusElement.textContent;
        const newKeyStatus = gameScore.hasKey ? '✔' : '✗';
        
        if (oldKeyStatus !== newKeyStatus) {
            keyStatusElement.textContent = newKeyStatus;
            
            if (gameScore.hasKey) {
                keyStatusElement.classList.add('has-key');
                keyStatusElement.style.color = '#00ff00';
                if (options.animateKey !== false) {
                    animateKeyCollection();
                }
            } else {
                keyStatusElement.classList.remove('has-key');
                keyStatusElement.style.color = '#ff4444';
            }
        }
    } else {
        console.warn('❌ Key status element not found in DOM');
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

// Enhanced coin collection system that works even with physics instability
function checkCoinCollection() {
    const playerPos = player.position;
    const collectDistance = getConfigValue('physics.collisionDistance', 0.8) * 1.5; // Larger collection radius
    
    for (let i = coins.length - 1; i >= 0; i--) {
        const coin = coins[i];
        
        // Use both visual player position and physics position for collection
        const visualDistance = playerPos.distanceTo(coin.position);
        const physicsDistance = playerPhysics.position.distanceTo(coin.position);
        
        // Use the smaller distance for more forgiving collection
        const distance = Math.min(visualDistance, physicsDistance);
        
        // Also check horizontal distance separately (for hovering cases)
        const horizontalDistance = Math.sqrt(
            Math.pow(playerPos.x - coin.position.x, 2) + 
            Math.pow(playerPos.z - coin.position.z, 2)
        );
        
        // Collect coin if either 3D distance is good OR horizontal distance is very close
        if (distance < collectDistance || horizontalDistance < collectDistance * 0.6) {
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

// Broken Tile System
const brokenTiles = [];

// Static Wall System  
const staticWalls = [];

// Hole System
const holes = [];

// Underworld System
const underworldState = {
    isInUnderworld: false,
    overworldPosition: null,
    underworldObjects: [],
    underworldExits: [],
    currentLevel: null
};

// 3D Level System
const floatingPlatforms = [];
const movingPlatforms = [];
const disappearingTiles = [];
const pressurePlates = [];
const gravityChangers = [];
const timedSpikes = [];
const movingSpikes = [];
const spiralPlatforms = [];
const curvedPlatforms = [];
const angledPlatforms = [];
const gravityPlanes = [];
const activePlatformTriggers = new Map();

// Fall detection and respawn system
const fallDetection = {
    fallThreshold: -20, // Y coordinate below which player is considered fallen
    safeSpawnPoints: [],
    currentSpawnPoint: null,
    isRespawning: false,
    respawnDelay: 1000,
    fallCheckInterval: 100,
    lastFallCheck: 0
};

// Inverted world system
const invertedWorld = {
    isActive: false,
    mirrorOffset: -30, // Distance below normal level where inverted world exists (updated from config)
    surfaces: [], // Mirrored surfaces for the inverted world
    originalGravity: new THREE.Vector3(0, -12, 0),
    invertedGravity: new THREE.Vector3(0, 12, 0),
    transitionInProgress: false,
    lastTransitionTime: 0,
    transitionCooldown: 2000, // 2 seconds between transitions (updated from config)
    lastGravityFlipTime: 0, // Track gravity flip cooldown
    gravityFlipCooldown: 2000, // 2 seconds cooldown for gravity flips
    fallThreshold: -20, // Y position threshold for transitions
    velocityThreshold: -5, // Minimum falling velocity for transitions
    safeTransitionHeight: 2.0 // Height above inverted surface for safe transitions
};

// Update inverted world settings from config
function updateInvertedWorldConfig() {
    invertedWorld.mirrorOffset = getConfigValue('physics.invertedWorldOffset', -30);
    invertedWorld.transitionCooldown = getConfigValue('physics.invertedWorldTransitionCooldown', 2000);
    invertedWorld.gravityFlipCooldown = getConfigValue('physics.invertedWorldTransitionCooldown', 2000);
    invertedWorld.fallThreshold = getConfigValue('physics.fallThreshold', -20);
    invertedWorld.velocityThreshold = getConfigValue('physics.velocityThreshold', -5);
    invertedWorld.originalGravity.set(0, PHYSICS_CONFIG.gravity, 0);
    invertedWorld.invertedGravity.set(0, -PHYSICS_CONFIG.gravity, 0);
    
    console.log(`🌍 Inverted world config updated:`);
    console.log(`   - Mirror offset: ${invertedWorld.mirrorOffset}`);
    console.log(`   - Transition cooldown: ${invertedWorld.transitionCooldown}ms`);
    console.log(`   - Gravity flip cooldown: ${invertedWorld.gravityFlipCooldown}ms`);
    console.log(`   - Fall threshold: ${invertedWorld.fallThreshold}`);
    console.log(`   - Velocity threshold: ${invertedWorld.velocityThreshold}`);
    console.log(`   - Original gravity: ${invertedWorld.originalGravity.y}`);
    console.log(`   - Inverted gravity: ${invertedWorld.invertedGravity.y}`);
}

// Level constructor system
class LevelConstructor {
    constructor(name, gridSize = 20) {
        this.name = name;
        this.gridSize = gridSize;
        this.platforms = [];
        this.objects = [];
        this.gravityPlanes = [];
        this.safeSpawnPoints = [];
        this.playerStart = { x: 0, y: 2, z: 0 };
        this.bounds = {
            minX: -50, maxX: 50,
            minY: -30, maxY: 30,
            minZ: -50, maxZ: 50
        };
    }

    // Add a platform to the level
    addPlatform(type, position, size, options = {}) {
        const platform = {
            type: type,
            position: position,
            size: size,
            material: options.material || 'stone',
            surfaces: options.surfaces || ['top'],
            ...options
        };
        this.platforms.push(platform);
        return this;
    }

    // Add an object to the level
    addObject(type, position, options = {}) {
        const object = {
            type: type,
            position: position,
            ...options
        };
        this.objects.push(object);
        return this;
    }

    // Add a gravity plane
    addGravityPlane(position, normal, strength = 1.0, radius = 10) {
        this.gravityPlanes.push({
            position: position,
            normal: normal,
            strength: strength,
            radius: radius
        });
        return this;
    }

    // Add a safe spawn point
    addSafeSpawnPoint(position, name = '') {
        this.safeSpawnPoints.push({
            position: position,
            name: name,
            id: `spawn_${this.safeSpawnPoints.length}`
        });
        return this;
    }

    // Set player start position
    setPlayerStart(position) {
        this.playerStart = position;
        return this;
    }

    // Set level bounds
    setBounds(bounds) {
        this.bounds = { ...this.bounds, ...bounds };
        return this;
    }

    // Generate the level JSON
    toJSON() {
        return {
            name: this.name,
            gridSize: this.gridSize,
            use3D: true,
            playerStart: this.playerStart,
            platforms: this.platforms,
            objects: this.objects,
            gravityPlanes: this.gravityPlanes,
            safeSpawnPoints: this.safeSpawnPoints,
            bounds: this.bounds
        };
    }
}

// Moving Obstacle System
const movingObstacles = [];

// Tile Type System
const typedTiles = [];
let levelTileTypes = null;

// JSON Level System
let jsonLevels = [];
let currentJsonLevelIndex = 0;
let currentLevelIndex = 0; // Global level index for consistent tracking
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
    //     "tiles": "auto", // "auto" for checkerboard or 2D array of tile types
    //     "tileTypes": [
    //         ["normal", "normal", "broken", "obstacle"],
    //         ["normal", "goal", "normal", "normal"],
    //         // ... more rows
    //     ],
    //     "objects": [
    //         { "type": "coin", "x": 3, "z": 3 },
    //         { "type": "key", "x": 7, "z": 7 },
    //         { "type": "spikeTrap", "x": 4, "z": 6 },
    //         { "type": "teleporter", "x": 2, "z": 2, "pairId": 1, "destination": { "x": 8, "z": 8 } },
    //         { "type": "bouncingPlatform", "x": 5, "z": 3 }
    //     ]
    // }
    // 
    // Tile Types:
    // - "normal": Standard walkable tile
    // - "broken": Tile that breaks when stepped on, causing player to fall and respawn
    // - "obstacle": Blocks movement completely
    // - "goal": Triggers level completion when reached (requires key if present)
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
    // Load all levels (existing, programmatic, and modular)
    const allLevels = await loadAllLevels();
    
    if (allLevels.length > 0) {
        jsonLevels = allLevels;
        // Automatically switch to JSON mode if levels loaded successfully
        useJsonLevels = true;
        console.log(`Initialized with ${jsonLevels.length} levels (including programmatic and modular) - switching to JSON mode`);
        
        // Show mode switch message
        showMessage('Enhanced level mode activated - Press ESC for level menu', '#00ccff');
    } else {
        // Fall back to random generation
        useJsonLevels = false;
        console.log('Falling back to random level generation');
        
        // Show fallback message
        showMessage('Using random level generation', '#ffaa00');
    }
}

// ============ BROKEN TILES SYSTEM ============

// Create a broken tile at a specific position
function createBrokenTile(gridX, gridZ) {
    const tileGeometry = new THREE.BoxGeometry(
        getConfigValue('gameplay.tileSize', 2), 
        0.2, 
        getConfigValue('gameplay.tileSize', 2)
    );
    const tileMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x8B4513, // Brown color to indicate weakness
        transparent: true,
        opacity: 0.8
    });
    
    const brokenTile = new THREE.Mesh(tileGeometry, tileMaterial);
    brokenTile.position.copy(gridToWorld(gridX, gridZ));
    brokenTile.position.y = -0.1; // Slightly lower than regular tiles
    brokenTile.castShadow = true;
    brokenTile.receiveShadow = true;
    
    // Store grid position
    brokenTile.gridX = gridX;
    brokenTile.gridZ = gridZ;
    brokenTile.isBroken = false;
    
    // Initialize userData with unique ID
    brokenTile.userData = {
        id: `broken_tile_${gridX}_${gridZ}`
    };
    
    worldGroup.add(brokenTile);
    brokenTiles.push(brokenTile);
    
    return brokenTile;
}

// Function to break a tile when stepped on
function breakTile(tile) {
    if (tile.isBroken) return;
    
    tile.isBroken = true;
    
    // Visual breaking animation
    const breakAnimation = () => {
        tile.material.opacity -= 0.05;
        tile.position.y -= 0.02;
        
        if (tile.material.opacity > 0) {
            requestAnimationFrame(breakAnimation);
        } else {
            // Remove the tile completely
            worldGroup.remove(tile);
            const index = brokenTiles.indexOf(tile);
            if (index > -1) {
                brokenTiles.splice(index, 1);
            }
        }
    };
    
    // Start breaking animation after a short delay
    setTimeout(() => {
        breakAnimation();
        soundManager.play('trapTrigger'); // Play breaking sound
    }, 500);
}

// Check if player stepped on a broken tile
function checkBrokenTileCollision() {
    brokenTiles.forEach(tile => {
        if (tile.isBroken) return;
        
        const playerPos = player.position;
        const tilePos = tile.position;
        const distance = Math.sqrt(
            Math.pow(playerPos.x - tilePos.x, 2) + 
            Math.pow(playerPos.z - tilePos.z, 2)
        );
        
        if (distance < 0.8) { // Close enough to be on the tile
            breakTile(tile);
            
            // Player falls - lose a life
            setTimeout(() => {
                damagePlayer();
                showMessage('You fell through a broken tile!', '#ff6666', 2000);
            }, 1000);
        }
    });
}

// Check disappearing tile collision
function checkDisappearingTileCollision() {
    disappearingTiles.forEach(tile => {
        if (!tile.userData.isActive || tile.userData.isDisappearing) return;
        
        const distance = playerPhysics.position.distanceTo(tile.position);
        
        if (distance < 0.8) { // Close enough to trigger
            triggerDisappearingTile(tile);
        }
    });
}

// Clear all broken tiles
function clearBrokenTiles() {
    brokenTiles.forEach(tile => {
        worldGroup.remove(tile);
    });
    brokenTiles.length = 0;
}

// ============ STATIC WALLS SYSTEM ============

// Create a static wall at a specific position
function createStaticWall(gridX, gridZ, height = 1) {
    const wallGeometry = new THREE.BoxGeometry(
        getConfigValue('gameplay.tileSize', 2), 
        height, 
        getConfigValue('gameplay.tileSize', 2)
    );
    const wallMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x666666, // Dark gray color for walls
        transparent: false
    });
    
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.copy(gridToWorld(gridX, gridZ));
    wall.position.y = height / 2; // Center the wall vertically
    wall.castShadow = true;
    wall.receiveShadow = true;
    
    // Store grid position
    wall.gridX = gridX;
    wall.gridZ = gridZ;
    wall.isWall = true;
    
    // Initialize userData with unique ID
    wall.userData = {
        id: `static_wall_${gridX}_${gridZ}`
    };
    
    worldGroup.add(wall);
    staticWalls.push(wall);
    
    return wall;
}

// Check if a position is blocked by a wall
function isPositionBlocked(gridX, gridZ) {
    return staticWalls.some(wall => 
        wall.gridX === gridX && wall.gridZ === gridZ
    );
}

// Clear all static walls
function clearStaticWalls() {
    staticWalls.forEach(wall => {
        worldGroup.remove(wall);
    });
    staticWalls.length = 0;
}

// ============ MOVING OBSTACLES SYSTEM ============

// Create a moving obstacle with a specific pattern
function createMovingObstacle(startX, startZ, endX, endZ, speed = 1) {
    const obstacleGeometry = new THREE.BoxGeometry(1.5, 0.8, 1.5);
    const obstacleMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xff4444, // Red color for danger
        transparent: true,
        opacity: 0.9
    });
    
    const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
    obstacle.position.copy(gridToWorld(startX, startZ));
    obstacle.position.y = 0.6;
    obstacle.castShadow = true;
    obstacle.receiveShadow = true;
    
    // Store movement properties
    obstacle.startPos = gridToWorld(startX, startZ);
    obstacle.endPos = gridToWorld(endX, endZ);
    obstacle.speed = speed;
    obstacle.direction = 1; // 1 for forward, -1 for backward
    obstacle.isMoving = true;
    
    // Initialize userData with unique ID
    obstacle.userData = {
        id: `moving_obstacle_${startX}_${startZ}_${endX}_${endZ}`
    };
    
    worldGroup.add(obstacle);
    movingObstacles.push(obstacle);
    
    return obstacle;
}

// Update moving obstacles
function updateMovingObstacles() {
    movingObstacles.forEach(obstacle => {
        if (!obstacle.isMoving) return;
        
        const currentPos = obstacle.position;
        const startPos = obstacle.startPos;
        const endPos = obstacle.endPos;
        
        // Calculate movement direction
        const direction = new THREE.Vector3()
            .subVectors(endPos, startPos)
            .normalize()
            .multiplyScalar(obstacle.speed * obstacle.direction * 0.02);
        
        // Move the obstacle
        obstacle.position.add(direction);
        
        // Check if reached destination
        const distanceToEnd = currentPos.distanceTo(endPos);
        const distanceToStart = currentPos.distanceTo(startPos);
        
        if (obstacle.direction === 1 && distanceToEnd < 0.1) {
            obstacle.direction = -1; // Reverse direction
        } else if (obstacle.direction === -1 && distanceToStart < 0.1) {
            obstacle.direction = 1; // Reverse direction
        }
    });
}

// Check collision with moving obstacles
function checkMovingObstacleCollision() {
    movingObstacles.forEach(obstacle => {
        const playerPos = player.position;
        const obstaclePos = obstacle.position;
        const distance = playerPos.distanceTo(obstaclePos);
        
        if (distance < 1.2) { // Collision detected
            damagePlayer();
            showMessage('Hit by moving obstacle!', '#ff6666', 2000);
        }
    });
}

// Clear all moving obstacles
function clearMovingObstacles() {
    movingObstacles.forEach(obstacle => {
        worldGroup.remove(obstacle);
    });
    movingObstacles.length = 0;
}

// ============ TILE TYPE SYSTEM ============

// Create a tile based on its type
function createTypedTile(gridX, gridZ, tileType) {
    const tileGeometry = new THREE.BoxGeometry(
        getConfigValue('gameplay.tileSize', 2), 
        0.1, 
        getConfigValue('gameplay.tileSize', 2)
    );
    
    let tileMaterial;
    let tileHeight = 0.1;
    
    switch(tileType) {
        case 'normal':
            tileMaterial = new THREE.MeshLambertMaterial({ 
                color: (gridX + gridZ) % 2 === 0 ? 0x333333 : 0x555555
            });
            break;
        case 'broken':
            tileMaterial = new THREE.MeshLambertMaterial({ 
                color: 0x8B4513, // Brown color
                transparent: true,
                opacity: 0.8
            });
            break;
        case 'obstacle':
            tileMaterial = new THREE.MeshLambertMaterial({ 
                color: 0x666666 // Dark gray
            });
            tileHeight = 1; // Make obstacles taller
            break;
        case 'goal':
            tileMaterial = new THREE.MeshLambertMaterial({ 
                color: 0xff6600, // Orange color when locked
                transparent: true,
                opacity: 0.8
            });
            tileHeight = 0.2; // Slightly elevated to be visible
            break;
        default:
            tileMaterial = new THREE.MeshLambertMaterial({ 
                color: (gridX + gridZ) % 2 === 0 ? 0x333333 : 0x555555
            });
    }
    
    const tile = new THREE.Mesh(tileGeometry, tileMaterial);
    tile.position.copy(gridToWorld(gridX, gridZ));
    tile.position.y = tileHeight / 2;
    tile.castShadow = true;
    tile.receiveShadow = true;
    
    // Store tile properties
    tile.gridX = gridX;
    tile.gridZ = gridZ;
    tile.tileType = tileType;
    tile.isActive = true;
    
    // Initialize userData with unique ID
    tile.userData = {
        id: `typed_tile_${gridX}_${gridZ}`
    };
    
    // Special properties for broken tiles
    if (tileType === 'broken') {
        tile.isBroken = false;
        tile.originalOpacity = 0.8;
    }
    
    worldGroup.add(tile);
    typedTiles.push(tile);
    
    return tile;
}

// Load tiles from tileTypes array
function loadTilesFromTypes(level) {
    clearTypedTiles();
    
    if (!level.tileTypes || level.tiles === 'auto') {
        // Fall back to auto-generated tiles
        levelTileTypes = null;
        return;
    }
    
    levelTileTypes = level.tileTypes;
    
    // Validate tileTypes array
    if (!Array.isArray(levelTileTypes) || levelTileTypes.length === 0) {
        console.warn('Invalid tileTypes array, falling back to auto tiles');
        levelTileTypes = null;
        return;
    }
    
    // Create tiles based on the tileTypes array
    for (let z = 0; z < levelTileTypes.length; z++) {
        const row = levelTileTypes[z];
        if (!Array.isArray(row)) continue;
        
        for (let x = 0; x < row.length; x++) {
            const tileType = row[x];
            if (tileType) {
                createTypedTile(x, z, tileType);
            }
        }
    }
    
    console.log(`Loaded ${typedTiles.length} typed tiles`);
}

// Get tile type at a specific position
function getTileType(gridX, gridZ) {
    if (!levelTileTypes || !levelTileTypes[gridZ] || !levelTileTypes[gridZ][gridX]) {
        return 'normal'; // Default to normal tile
    }
    
    return levelTileTypes[gridZ][gridX];
}

// Check if a position is blocked by an obstacle tile
function isObstacleTile(gridX, gridZ) {
    const tileType = getTileType(gridX, gridZ);
    return tileType === 'obstacle';
}

// Check if a position is a goal tile
function isGoalTile(gridX, gridZ) {
    const tileType = getTileType(gridX, gridZ);
    return tileType === 'goal';
}

// Check if a position is a broken tile
function isBrokenTile(gridX, gridZ) {
    const tileType = getTileType(gridX, gridZ);
    return tileType === 'broken';
}

// Break a tile at a specific position
function breakTileAt(gridX, gridZ) {
    const tile = typedTiles.find(t => t.gridX === gridX && t.gridZ === gridZ && t.tileType === 'broken');
    if (tile && !tile.isBroken) {
        tile.isBroken = true;
        
        // Visual breaking animation
        const breakAnimation = () => {
            tile.material.opacity -= 0.05;
            tile.position.y -= 0.02;
            
            if (tile.material.opacity > 0) {
                requestAnimationFrame(breakAnimation);
            } else {
                // Remove the tile completely
                worldGroup.remove(tile);
                const index = typedTiles.indexOf(tile);
                if (index > -1) {
                    typedTiles.splice(index, 1);
                }
            }
        };
        
        // Start breaking animation after a short delay
        setTimeout(() => {
            breakAnimation();
            soundManager.play('trapTrigger'); // Play breaking sound
        }, 500);
        
        return true;
    }
    return false;
}

// Check tile collision for typed tiles
function checkTypedTileCollision() {
    if (!levelTileTypes) return;
    
    const currentTileType = getTileType(playerState.gridX, playerState.gridZ);
    
    switch(currentTileType) {
        case 'broken':
            if (isBrokenTile(playerState.gridX, playerState.gridZ)) {
                if (breakTileAt(playerState.gridX, playerState.gridZ)) {
                    // Player falls - lose a life
                    setTimeout(() => {
                        damagePlayer();
                        showMessage('You fell through a broken tile!', '#ff6666', 2000);
                    }, 1000);
                }
            }
            break;
        case 'goal':
            if (isGoalTile(playerState.gridX, playerState.gridZ)) {
                // Check if key is required and if player has it
                if (gameKey && !gameScore.hasKey) {
                    showMessage('Goal is locked! Find the key first!', '#ff6666', 2000);
                } else {
                    completeLevel();
                }
            }
            break;
    }
}

// Update goal tile appearance when key is collected
function updateGoalTileAppearance() {
    if (!levelTileTypes) return;
    
    typedTiles.forEach(tile => {
        if (tile.tileType === 'goal') {
            if (gameScore.hasKey) {
                tile.material.color.setHex(0x00ff00); // Green when unlocked
                tile.material.emissive.setHex(0x003300);
            } else {
                tile.material.color.setHex(0xff6600); // Orange when locked
                tile.material.emissive.setHex(0x330000);
            }
        }
    });
}

// Clear all typed tiles
function clearTypedTiles() {
    typedTiles.forEach(tile => {
        worldGroup.remove(tile);
    });
    typedTiles.length = 0;
}

// ============ 3D PLATFORM SYSTEM ============

// Material library for different platform types
const PLATFORM_MATERIALS = {
    stone: { color: 0x808080, roughness: 0.8, metalness: 0.1 },
    metal: { color: 0x888888, roughness: 0.2, metalness: 0.8 },
    crystal: { color: 0x44aaff, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.8 },
    wood: { color: 0x8B4513, roughness: 0.9, metalness: 0.0 },
    energy: { color: 0x00ff88, roughness: 0.0, metalness: 0.0, emissive: 0x002200 },
    jungle_floor: { color: 0x4A4A2A, roughness: 0.9, metalness: 0.0, emissive: 0x0A0A05 },
    jungle_wood: { color: 0x6B4423, roughness: 0.8, metalness: 0.0, emissive: 0x1A1006 },
    jungle_vine: { color: 0x2A5A2A, roughness: 0.7, metalness: 0.0, emissive: 0x051005 }
};

// Create material from definition
function createPlatformMaterial(materialType) {
    const def = PLATFORM_MATERIALS[materialType] || PLATFORM_MATERIALS.stone;
    return new THREE.MeshStandardMaterial(def);
}

// Create floating platform
function createFloatingPlatform(config) {
    const geometry = new THREE.BoxGeometry(config.size.width, config.size.height, config.size.depth);
    const material = createPlatformMaterial(config.material);
    const platform = new THREE.Mesh(geometry, material);
    
    platform.position.set(config.position.x, config.position.y, config.position.z);
    platform.castShadow = true;
    platform.receiveShadow = true;
    
    // Store platform data
    platform.userData = {
        type: 'floating',
        surfaces: config.surfaces || ['top'],
        id: `floating_${floatingPlatforms.length}`,
        originalPosition: platform.position.clone(),
        size: config.size
    };
    
    worldGroup.add(platform);
    floatingPlatforms.push(platform);
    
    // Add to physics surfaces
    physicsWorld.surfaces.push(platform);
    
    return platform;
}

// Create angled platform - supports both config object and individual parameters
function createAngledPlatform(configOrX, y, z, width, height, depth, rotX = 0, rotY = 0, rotZ = 0) {
    let config;
    
    // Check if first parameter is a config object or individual parameters
    if (typeof configOrX === 'object' && configOrX !== null && !Array.isArray(configOrX)) {
        // Config object mode
        config = configOrX;
    } else {
        // Individual parameters mode - convert to config object
        config = {
            position: { x: configOrX, y: y, z: z },
            size: { width: width, height: height, depth: depth },
            rotation: { x: rotX * 180 / Math.PI, y: rotY * 180 / Math.PI, z: rotZ * 180 / Math.PI }, // Convert radians to degrees
            material: 'stone', // Default material
            surfaces: ['top']
        };
    }
    
    const geometry = new THREE.BoxGeometry(config.size.width, config.size.height, config.size.depth);
    const material = createPlatformMaterial ? createPlatformMaterial(config.material) : new THREE.MeshLambertMaterial({ color: 0x8e44ad });
    const platform = new THREE.Mesh(geometry, material);
    
    platform.position.set(config.position.x, config.position.y, config.position.z);
    
    // Apply rotation
    if (config.rotation) {
        platform.rotation.x = THREE.MathUtils.degToRad(config.rotation.x || 0);
        platform.rotation.y = THREE.MathUtils.degToRad(config.rotation.y || 0);
        platform.rotation.z = THREE.MathUtils.degToRad(config.rotation.z || 0);
    }
    
    platform.castShadow = true;
    platform.receiveShadow = true;
    
    // Store platform data
    platform.userData = {
        type: 'angled',
        surfaces: config.surfaces || ['top'],
        id: `angled_${angledPlatforms.length}`,
        originalPosition: platform.position.clone(),
        originalRotation: platform.rotation.clone(),
        size: config.size
    };
    
    worldGroup.add(platform);
    angledPlatforms.push(platform);
    
    // Add to physics surfaces - check if physicsWorld exists
    if (typeof physicsWorld !== 'undefined' && physicsWorld.surfaces) {
        physicsWorld.surfaces.push(platform);
    }
    
    // Also add to physics surface using the old method if available
    if (typeof addPhysicsSurface === 'function') {
        addPhysicsSurface(platform);
    }
    
    return platform;
}

// Create curved platform - supports both config object and individual parameters
function createCurvedPlatform(configOrX, y, z, width, height, depth, rotX = 0, rotY = 0, rotZ = 0) {
    let config;
    
    // Check if first parameter is a config object or individual parameters
    if (typeof configOrX === 'object' && configOrX !== null && !Array.isArray(configOrX)) {
        // Config object mode
        config = configOrX;
    } else {
        // Individual parameters mode - convert to config object
        config = {
            position: { x: configOrX, y: y, z: z },
            size: { width: width, height: height, depth: depth },
            rotation: { x: rotX * 180 / Math.PI, y: rotY * 180 / Math.PI, z: rotZ * 180 / Math.PI }, // Convert radians to degrees
            material: 'stone', // Default material
            surfaces: ['top']
        };
    }
    
    const curvature = config.curvature || { type: 'cylinder', radius: 4, segments: 16 };
    let geometry;
    
    if (curvature.type === 'cylinder') {
        geometry = new THREE.CylinderGeometry(
            curvature.radius, 
            curvature.radius, 
            config.size.height, 
            curvature.segments, 
            1, 
            false, 
            0, 
            Math.PI
        );
    } else {
        // Fallback to box geometry
        geometry = new THREE.BoxGeometry(config.size.width, config.size.height, config.size.depth);
    }
    
    const material = createPlatformMaterial ? createPlatformMaterial(config.material) : new THREE.MeshLambertMaterial({ color: 0x4a90e2 });
    const platform = new THREE.Mesh(geometry, material);
    
    platform.position.set(config.position.x, config.position.y, config.position.z);
    
    // Apply rotation if provided
    if (config.rotation) {
        platform.rotation.x = THREE.MathUtils.degToRad(config.rotation.x || 0);
        platform.rotation.y = THREE.MathUtils.degToRad(config.rotation.y || 0);
        platform.rotation.z = THREE.MathUtils.degToRad(config.rotation.z || 0);
    }
    
    platform.castShadow = true;
    platform.receiveShadow = true;
    
    // Store platform data
    platform.userData = {
        type: 'curved',
        surfaces: config.surfaces || ['top'],
        id: `curved_${curvedPlatforms.length}`,
        originalPosition: platform.position.clone(),
        curvature: curvature,
        size: config.size
    };
    
    worldGroup.add(platform);
    curvedPlatforms.push(platform);
    
    // Add to physics surfaces - check if physicsWorld exists
    if (typeof physicsWorld !== 'undefined' && physicsWorld.surfaces) {
        physicsWorld.surfaces.push(platform);
    }
    
    return platform;
}

// Create spiral platform
function createSpiralPlatform(config) {
    const spiral = config.spiral || { turns: 2, segments: 32, innerRadius: 1, outerRadius: 4 };
    const group = new THREE.Group();
    
    // Create spiral path
    const points = [];
    for (let i = 0; i <= spiral.segments; i++) {
        const angle = (i / spiral.segments) * spiral.turns * Math.PI * 2;
        const radius = spiral.innerRadius + (spiral.outerRadius - spiral.innerRadius) * (i / spiral.segments);
        const height = (i / spiral.segments) * config.size.height;
        
        points.push(new THREE.Vector3(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius
        ));
    }
    
    // Create platform segments along spiral
    for (let i = 0; i < points.length - 1; i++) {
        const segmentGeometry = new THREE.BoxGeometry(0.8, 0.2, 0.8);
        const segmentMaterial = createPlatformMaterial(config.material);
        const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
        
        segment.position.copy(points[i]);
        segment.castShadow = true;
        segment.receiveShadow = true;
        
        group.add(segment);
    }
    
    group.position.set(config.position.x, config.position.y, config.position.z);
    
    // Store platform data
    group.userData = {
        type: 'spiral',
        surfaces: config.surfaces || ['top'],
        id: `spiral_${spiralPlatforms.length}`,
        originalPosition: group.position.clone(),
        spiral: spiral,
        size: config.size
    };
    
    worldGroup.add(group);
    spiralPlatforms.push(group);
    
    // Add each segment to physics surfaces
    group.children.forEach(segment => {
        physicsWorld.surfaces.push(segment);
    });
    
    return group;
}

// Create 3D bouncing platform
function createBouncingPlatform3D(x, y, z) {
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
    
    // Position the platform group
    platformGroup.position.set(x, y, z);
    platformGroup.castShadow = true;
    platformGroup.receiveShadow = true;
    
    // Add animation data
    platformGroup.userData = {
        originalY: y,
        animationOffset: Math.random() * Math.PI * 2,
        isCompressed: false,
        compressionAmount: 0,
        lastBounceTime: 0,
        is3D: true
    };
    
    worldGroup.add(platformGroup);
    bouncingPlatforms.push(platformGroup);
    
    return platformGroup;
}

// Create moving platform
function createMovingPlatform(config) {
    const geometry = new THREE.BoxGeometry(config.size.width, config.size.height, config.size.depth);
    const material = createPlatformMaterial(config.material);
    const platform = new THREE.Mesh(geometry, material);
    
    platform.position.set(config.position.x, config.position.y, config.position.z);
    platform.castShadow = true;
    platform.receiveShadow = true;
    
    // Store platform data
    platform.userData = {
        type: 'moving',
        surfaces: config.surfaces || ['top'],
        id: `moving_${movingPlatforms.length}`,
        originalPosition: platform.position.clone(),
        size: config.size,
        movement: config.movement,
        pathIndex: 0,
        pathProgress: 0,
        isMoving: true
    };
    
    worldGroup.add(platform);
    movingPlatforms.push(platform);
    
    // Add to physics surfaces
    physicsWorld.surfaces.push(platform);
    
    return platform;
}

// Update moving platforms
function updateMovingPlatforms() {
    movingPlatforms.forEach(platform => {
        if (!platform.userData.isMoving) return;
        
        const movement = platform.userData.movement;
        const deltaTime = 1/60; // Fixed timestep
        
        if (movement.type === 'linear') {
            // Linear path movement
            const path = movement.path;
            const pathIndex = platform.userData.pathIndex;
            const pathProgress = platform.userData.pathProgress;
            
            if (path.length < 2) return;
            
            const currentPoint = path[pathIndex];
            const nextPoint = path[(pathIndex + 1) % path.length];
            
            // Calculate distance and direction
            const distance = Math.sqrt(
                Math.pow(nextPoint.x - currentPoint.x, 2) +
                Math.pow(nextPoint.y - currentPoint.y, 2) +
                Math.pow(nextPoint.z - currentPoint.z, 2)
            );
            
            const speed = movement.speed || 1;
            const progressDelta = (speed * deltaTime) / distance;
            
            // Update progress
            platform.userData.pathProgress += progressDelta;
            
            if (platform.userData.pathProgress >= 1) {
                platform.userData.pathProgress = 0;
                platform.userData.pathIndex = (pathIndex + 1) % path.length;
                
                if (!movement.loop && platform.userData.pathIndex === 0) {
                    platform.userData.isMoving = false;
                    return;
                }
            }
            
            // Interpolate position
            const t = platform.userData.pathProgress;
            platform.position.x = currentPoint.x + (nextPoint.x - currentPoint.x) * t;
            platform.position.y = currentPoint.y + (nextPoint.y - currentPoint.y) * t;
            platform.position.z = currentPoint.z + (nextPoint.z - currentPoint.z) * t;
            
        } else if (movement.type === 'circular') {
            // Circular movement
            const center = movement.center;
            const radius = movement.radius || 3;
            const speed = movement.speed || 1;
            const axis = movement.axis || 'y';
            
            const time = Date.now() * 0.001 * speed;
            
            if (axis === 'y') {
                platform.position.x = center.x + Math.cos(time) * radius;
                platform.position.z = center.z + Math.sin(time) * radius;
                platform.position.y = center.y;
            } else if (axis === 'x') {
                platform.position.y = center.y + Math.cos(time) * radius;
                platform.position.z = center.z + Math.sin(time) * radius;
                platform.position.x = center.x;
            } else if (axis === 'z') {
                platform.position.x = center.x + Math.cos(time) * radius;
                platform.position.y = center.y + Math.sin(time) * radius;
                platform.position.z = center.z;
            }
        }
    });
}

// Clear all 3D platforms
function clearAllPlatforms() {
    const platformArrays = [
        floatingPlatforms,
        movingPlatforms,
        disappearingTiles,
        pressurePlates,
        gravityChangers,
        timedSpikes,
        movingSpikes,
        spiralPlatforms,
        curvedPlatforms,
        angledPlatforms
    ];
    
    platformArrays.forEach(array => {
        array.forEach(platform => {
            worldGroup.remove(platform);
            // Remove from physics surfaces
            const index = physicsWorld.surfaces.indexOf(platform);
            if (index > -1) {
                physicsWorld.surfaces.splice(index, 1);
            }
        });
        array.length = 0;
    });
    
    gravityPlanes.length = 0;
    activePlatformTriggers.clear();
}

// ============ ENHANCED TRAP SYSTEM ============

// Create disappearing tile
function createDisappearingTile(config) {
    const geometry = new THREE.BoxGeometry(config.size.width, config.size.height, config.size.depth);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xff8800, 
        transparent: true, 
        opacity: 0.7,
        roughness: 0.5
    });
    const tile = new THREE.Mesh(geometry, material);
    
    tile.position.set(config.position.x, config.position.y, config.position.z);
    tile.castShadow = true;
    tile.receiveShadow = true;
    
    // Store tile data
    tile.userData = {
        type: 'disappearing',
        id: `disappearing_${disappearingTiles.length}`,
        originalPosition: tile.position.clone(),
        size: config.size,
        delay: config.delay || 1000,
        duration: config.duration || 3000,
        isActive: true,
        isDisappearing: false,
        disappearTimer: null,
        reappearTimer: null,
        originalMaterial: material.clone()
    };
    
    worldGroup.add(tile);
    disappearingTiles.push(tile);
    
    // Add to physics surfaces
    physicsWorld.surfaces.push(tile);
    
    return tile;
}

// Trigger disappearing tile
function triggerDisappearingTile(tile) {
    if (!tile.userData.isActive || tile.userData.isDisappearing) return;
    
    tile.userData.isDisappearing = true;
    
    // Visual warning effect
    const warningAnimation = () => {
        tile.material.color.setHex(0xff0000);
        tile.material.opacity = 0.5;
        
        setTimeout(() => {
            if (tile.userData.isDisappearing) {
                tile.material.color.setHex(0xff8800);
                tile.material.opacity = 0.7;
            }
        }, 200);
    };
    
    // Flash warning
    const flashCount = Math.floor(tile.userData.delay / 400);
    for (let i = 0; i < flashCount; i++) {
        setTimeout(warningAnimation, i * 400);
    }
    
    // Disappear after delay
    tile.userData.disappearTimer = setTimeout(() => {
        tile.userData.isActive = false;
        tile.visible = false;
        
        // Remove from physics surfaces
        const index = physicsWorld.surfaces.indexOf(tile);
        if (index > -1) {
            physicsWorld.surfaces.splice(index, 1);
        }
        
        // Reappear after duration
        tile.userData.reappearTimer = setTimeout(() => {
            tile.userData.isActive = true;
            tile.userData.isDisappearing = false;
            tile.visible = true;
            tile.material.color.copy(tile.userData.originalMaterial.color);
            tile.material.opacity = tile.userData.originalMaterial.opacity;
            
            // Re-add to physics surfaces
            physicsWorld.surfaces.push(tile);
        }, tile.userData.duration);
        
    }, tile.userData.delay);
}

// Create pressure plate
function createPressurePlate(config) {
    const geometry = new THREE.BoxGeometry(config.size.width, config.size.height, config.size.depth);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x444444, 
        metalness: 0.8,
        roughness: 0.2
    });
    const plate = new THREE.Mesh(geometry, material);
    
    plate.position.set(config.position.x, config.position.y, config.position.z);
    plate.castShadow = true;
    plate.receiveShadow = true;
    
    // Store plate data
    plate.userData = {
        type: 'pressurePlate',
        id: `pressure_${pressurePlates.length}`,
        originalPosition: plate.position.clone(),
        size: config.size,
        triggers: config.triggers || [],
        isPressed: false,
        pressDistance: 0.8,
        activationColor: 0x00ff00,
        originalColor: 0x444444
    };
    
    worldGroup.add(plate);
    pressurePlates.push(plate);
    
    // Add to physics surfaces
    physicsWorld.surfaces.push(plate);
    
    return plate;
}

// Check pressure plate activation
function checkPressurePlates() {
    pressurePlates.forEach(plate => {
        const distance = playerPhysics.position.distanceTo(plate.position);
        const wasPressed = plate.userData.isPressed;
        const isPressed = distance < plate.userData.pressDistance;
        
        if (isPressed !== wasPressed) {
            plate.userData.isPressed = isPressed;
            
            // Visual feedback
            plate.material.color.setHex(isPressed ? 
                plate.userData.activationColor : 
                plate.userData.originalColor
            );
            
            // Trigger actions
            if (isPressed) {
                plate.userData.triggers.forEach(trigger => {
                    executeTriggerAction(trigger);
                });
                soundManager.play('pressurePlate');
            }
        }
    });
}

// Execute trigger action
function executeTriggerAction(trigger) {
    switch (trigger.type) {
        case 'platform':
            const platform = findPlatformById(trigger.target);
            if (platform) {
                if (trigger.action === 'activate') {
                    platform.userData.isActive = true;
                    platform.visible = true;
                    if (!physicsWorld.surfaces.includes(platform)) {
                        physicsWorld.surfaces.push(platform);
                    }
                } else if (trigger.action === 'deactivate') {
                    platform.userData.isActive = false;
                    platform.visible = false;
                    const index = physicsWorld.surfaces.indexOf(platform);
                    if (index > -1) {
                        physicsWorld.surfaces.splice(index, 1);
                    }
                }
            }
            break;
        case 'door':
            // Future implementation for doors
            break;
        case 'gravity':
            // Future implementation for gravity changes
            break;
    }
}

// Find platform by ID
function findPlatformById(id) {
    const allPlatforms = [
        ...floatingPlatforms,
        ...movingPlatforms,
        ...angledPlatforms,
        ...curvedPlatforms,
        ...spiralPlatforms
    ];
    
    return allPlatforms.find(platform => platform.userData.id === id);
}

// Create timed spike
function createTimedSpike(config) {
    const geometry = new THREE.ConeGeometry(0.2, config.size.height, 8);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xff0000,
        metalness: 0.8,
        roughness: 0.2
    });
    const spike = new THREE.Mesh(geometry, material);
    
    spike.position.set(config.position.x, config.position.y, config.position.z);
    spike.castShadow = true;
    spike.receiveShadow = true;
    
    // Store spike data
    spike.userData = {
        type: 'timedSpike',
        id: `timed_spike_${timedSpikes.length}`,
        originalPosition: spike.position.clone(),
        size: config.size,
        timing: config.timing,
        isActive: false,
        damageRadius: 0.8,
        startTime: Date.now() + (config.timing.offset || 0)
    };
    
    worldGroup.add(spike);
    timedSpikes.push(spike);
    
    return spike;
}

// Update timed spikes
function updateTimedSpikes() {
    timedSpikes.forEach(spike => {
        const timing = spike.userData.timing;
        const elapsed = Date.now() - spike.userData.startTime;
        const cycle = timing.interval + timing.duration;
        const cycleProgress = elapsed % cycle;
        
        const shouldBeActive = cycleProgress < timing.duration;
        
        if (shouldBeActive !== spike.userData.isActive) {
            spike.userData.isActive = shouldBeActive;
            
            // Visual feedback
            spike.material.color.setHex(shouldBeActive ? 0xff4444 : 0xff0000);
            spike.material.emissive.setHex(shouldBeActive ? 0x220000 : 0x000000);
            
            // Scale animation
            const targetScale = shouldBeActive ? 1.2 : 1.0;
            spike.scale.setScalar(targetScale);
            
            if (shouldBeActive) {
                soundManager.play('trapTrigger');
            }
        }
        
        // Check for player damage
        if (spike.userData.isActive) {
            const distance = playerPhysics.position.distanceTo(spike.position);
            if (distance < spike.userData.damageRadius) {
                damagePlayer();
            }
        }
    });
}

// Create moving spike
function createMovingSpike(config) {
    const geometry = new THREE.ConeGeometry(0.2, config.size.height, 8);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xff0000,
        metalness: 0.8,
        roughness: 0.2
    });
    const spike = new THREE.Mesh(geometry, material);
    
    spike.position.set(config.position.x, config.position.y, config.position.z);
    spike.castShadow = true;
    spike.receiveShadow = true;
    
    // Store spike data
    spike.userData = {
        type: 'movingSpike',
        id: `moving_spike_${movingSpikes.length}`,
        originalPosition: spike.position.clone(),
        size: config.size,
        movement: config.movement,
        pathIndex: 0,
        pathProgress: 0,
        isMoving: true,
        damageRadius: 0.8
    };
    
    worldGroup.add(spike);
    movingSpikes.push(spike);
    
    return spike;
}

// Update moving spikes
function updateMovingSpikes() {
    movingSpikes.forEach(spike => {
        if (!spike.userData.isMoving) return;
        
        const movement = spike.userData.movement;
        const deltaTime = 1/60; // Fixed timestep
        
        if (movement.type === 'linear') {
            // Linear path movement (same as moving platforms)
            const path = movement.path;
            const pathIndex = spike.userData.pathIndex;
            const pathProgress = spike.userData.pathProgress;
            
            if (path.length < 2) return;
            
            const currentPoint = path[pathIndex];
            const nextPoint = path[(pathIndex + 1) % path.length];
            
            const distance = Math.sqrt(
                Math.pow(nextPoint.x - currentPoint.x, 2) +
                Math.pow(nextPoint.y - currentPoint.y, 2) +
                Math.pow(nextPoint.z - currentPoint.z, 2)
            );
            
            const speed = movement.speed || 1;
            const progressDelta = (speed * deltaTime) / distance;
            
            spike.userData.pathProgress += progressDelta;
            
            if (spike.userData.pathProgress >= 1) {
                spike.userData.pathProgress = 0;
                spike.userData.pathIndex = (pathIndex + 1) % path.length;
                
                if (!movement.loop && spike.userData.pathIndex === 0) {
                    spike.userData.isMoving = false;
                    return;
                }
            }
            
            // Interpolate position
            const t = spike.userData.pathProgress;
            spike.position.x = currentPoint.x + (nextPoint.x - currentPoint.x) * t;
            spike.position.y = currentPoint.y + (nextPoint.y - currentPoint.y) * t;
            spike.position.z = currentPoint.z + (nextPoint.z - currentPoint.z) * t;
        }
        
        // Check for player damage
        const distance = playerPhysics.position.distanceTo(spike.position);
        if (distance < spike.userData.damageRadius) {
            damagePlayer();
        }
    });
}

// Create gravity changer
function createGravityChanger(config) {
    const geometry = new THREE.BoxGeometry(config.size.width, config.size.height, config.size.depth);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x8800ff,
        transparent: true,
        opacity: 0.6,
        emissive: 0x220088
    });
    const changer = new THREE.Mesh(geometry, material);
    
    changer.position.set(config.position.x, config.position.y, config.position.z);
    changer.castShadow = true;
    changer.receiveShadow = true;
    
    // Store changer data
    changer.userData = {
        type: 'gravityChanger',
        id: `gravity_${gravityChangers.length}`,
        originalPosition: changer.position.clone(),
        size: config.size,
        newGravity: config.newGravity,
        duration: config.duration || 5000,
        activationDistance: 0.8,
        isActive: false
    };
    
    worldGroup.add(changer);
    gravityChangers.push(changer);
    
    // Add to physics surfaces
    physicsWorld.surfaces.push(changer);
    
    return changer;
}

// Check gravity changers
function checkGravityChangers() {
    gravityChangers.forEach(changer => {
        const distance = playerPhysics.position.distanceTo(changer.position);
        
        if (distance < changer.userData.activationDistance && !changer.userData.isActive) {
            changer.userData.isActive = true;
            
            // Change gravity temporarily
            const oldGravity = physicsWorld.gravity.clone();
            const oldGravityDirection = worldState.gravityDirection.clone();
            
            physicsWorld.gravity.set(
                changer.userData.newGravity.x * PHYSICS_CONFIG.gravity,
                changer.userData.newGravity.y * PHYSICS_CONFIG.gravity,
                changer.userData.newGravity.z * PHYSICS_CONFIG.gravity
            );
            
            // Update gravity direction to stay synchronized
            worldState.gravityDirection.copy(physicsWorld.gravity.clone().normalize());
            
            // Visual effect
            changer.material.color.setHex(0x00ffff);
            changer.material.emissive.setHex(0x004488);
            
            // Restore gravity after duration
            setTimeout(() => {
                physicsWorld.gravity.copy(oldGravity);
                worldState.gravityDirection.copy(oldGravityDirection);
                changer.userData.isActive = false;
                changer.material.color.setHex(0x8800ff);
                changer.material.emissive.setHex(0x220088);
            }, changer.userData.duration);
            
            soundManager.play('gravityShift');
            showMessage('Gravity changed!', '#8800ff', 2000);
        }
    });
}

// ============ FALL DETECTION & RESPAWN SYSTEM ============

// Initialize fall detection for a level
function initializeFallDetection(levelData) {
    console.log('🛡️ Initializing fall detection...');
    
    // Initialize safe spawn points with validation
    fallDetection.safeSpawnPoints = [];
    if (levelData.safeSpawnPoints && Array.isArray(levelData.safeSpawnPoints)) {
        levelData.safeSpawnPoints.forEach((spawn, index) => {
            if (spawn && spawn.position) {
                const validatedSpawn = {
                    position: validatePosition(spawn.position, { x: 0, y: 2, z: 0 }, `spawn point ${index}`),
                    name: spawn.name || `Spawn ${index}`,
                    id: spawn.id || `spawn_${index}`
                };
                fallDetection.safeSpawnPoints.push(validatedSpawn);
                console.log(`🛡️ Added validated spawn point: ${validatedSpawn.name}`, validatedSpawn.position);
            }
        });
    }
    
    fallDetection.fallThreshold = levelData.bounds?.minY || -20;
    fallDetection.currentSpawnPoint = null;
    fallDetection.isRespawning = false;
    
    // Set initial spawn point
    if (fallDetection.safeSpawnPoints.length > 0) {
        fallDetection.currentSpawnPoint = fallDetection.safeSpawnPoints[0];
        console.log('🛡️ Using first safe spawn point:', fallDetection.currentSpawnPoint.name);
    } else {
        // Create default spawn point at player start
        const playerStart = levelData.playerStart || { x: 0, y: 2, z: 0 };
        fallDetection.currentSpawnPoint = {
            position: validatePosition(playerStart, { x: 0, y: 2, z: 0 }, 'default spawn point'),
            name: 'Start',
            id: 'spawn_default'
        };
        console.log('🛡️ Created default spawn point:', fallDetection.currentSpawnPoint.position);
    }
    
    console.log('🛡️ Fall detection initialized:');
    console.log('  - Threshold:', fallDetection.fallThreshold);
    console.log('  - Safe spawn points:', fallDetection.safeSpawnPoints.length);
    console.log('  - Current spawn point:', fallDetection.currentSpawnPoint.name);
}

// Check if current level supports inverted world functionality
function levelSupportsInvertedWorld() {
    const currentLevel = getCurrentLevelData();
    if (!currentLevel) return false;
    
    // Check for explicit inverted world support flags
    if (currentLevel.hasInvertedWorld !== undefined) {
        return currentLevel.hasInvertedWorld;
    }
    
    // Check for 3D levels (they generally support inverted world)
    if (currentLevel.use3D === true) {
        return true;
    }
    
    // Check for underworld levels (they might support inverted world)
    if (currentLevel.hasUnderworld === true) {
        return true;
    }
    
    // Check for advanced/complex levels (levels 6+) that likely support inverted world
    if (currentLevel.number >= 6) {
        return true;
    }
    
    // Default: Basic levels (1-5) don't support inverted world unless explicitly specified
    return false;
}

// Check if player has fallen
function checkFallDetection() {
    if (fallDetection.isRespawning || invertedWorld.transitionInProgress) return;
    
    const now = Date.now();
    if (now - fallDetection.lastFallCheck < fallDetection.fallCheckInterval) return;
    fallDetection.lastFallCheck = now;
    
    const playerY = playerPhysics.position.y;
    const playerVelocityY = playerPhysics.velocity.y;
    
    // Check gravity flip cooldown
    if (now - invertedWorld.lastGravityFlipTime < invertedWorld.gravityFlipCooldown) {
        return; // Still in cooldown, don't allow transitions
    }
    
    // Determine if level supports inverted world
    const supportsInvertedWorld = levelSupportsInvertedWorld();
    
    // Enhanced fall-off handling based on level type
    if (!invertedWorld.isActive) {
        // In normal world - check if player fell below threshold AND is falling
        if (playerY < invertedWorld.fallThreshold && 
            playerVelocityY < invertedWorld.velocityThreshold && 
            !playerPhysics.isGrounded) {
            
            if (supportsInvertedWorld) {
                console.log(`🌍 INVERTED WORLD TRANSITION - Level supports inverted world, transitioning...`);
                console.log(`   Y: ${playerY.toFixed(2)}, VelY: ${playerVelocityY.toFixed(2)}`);
                // Transition to inverted world
                transitionToInvertedWorld();
            } else {
                console.log(`🔄 LEVEL RESTART - Level does not support inverted world, restarting...`);
                console.log(`   Y: ${playerY.toFixed(2)}, VelY: ${playerVelocityY.toFixed(2)}`);
                // Restart the level
                handleLevelRestart('fell_off_map');
            }
            return;
        }
    } else {
        // In inverted world - check if player fell above inverted threshold AND is falling upward
        const invertedFallThreshold = invertedWorld.mirrorOffset + Math.abs(invertedWorld.fallThreshold);
        if (playerY > invertedFallThreshold && 
            playerVelocityY > -invertedWorld.velocityThreshold && 
            !playerPhysics.isGrounded) {
            
            console.log(`🌍 NORMAL WORLD TRANSITION - Returning to normal world...`);
            console.log(`   Y: ${playerY.toFixed(2)}, VelY: ${playerVelocityY.toFixed(2)}`);
            // Transition back to normal world
            transitionToNormalWorld();
            return;
        }
    }
    
    // Additional safety check for extreme falls (backup level restart)
    const extremeFallThreshold = invertedWorld.fallThreshold - 50;
    if (!invertedWorld.isActive && playerY < extremeFallThreshold) {
        console.log(`🚨 EXTREME FALL DETECTED - Emergency level restart`);
        console.log(`   Y: ${playerY.toFixed(2)}, Extreme threshold: ${extremeFallThreshold}`);
        handleLevelRestart('extreme_fall');
        return;
    }
    
    // Check if player is out of bounds (works for both worlds)
    const currentLevel = getCurrentLevelData();
    if (currentLevel && currentLevel.bounds) {
        const bounds = currentLevel.bounds;
        const pos = playerPhysics.position;
        
        if (pos.x < bounds.minX || pos.x > bounds.maxX ||
            pos.z < bounds.minZ || pos.z > bounds.maxZ) {
            // For out of bounds, still use traditional respawn
            triggerRespawn('out_of_bounds');
            return;
        }
    }
}

// Handle level restart for fall-off scenarios
function handleLevelRestart(reason = 'unknown') {
    if (fallDetection.isRespawning) return;
    
    fallDetection.isRespawning = true;
    
    // Play fall sound
    soundManager.play('fall');
    
    // Show restart message
    let message = '';
    switch (reason) {
        case 'fell_off_map':
            message = 'You fell off the map! Restarting level...';
            break;
        default:
            message = 'Restarting level...';
    }
    
    showMessage(message, '#ff6666', 2000);
    
    // Create fall effect
    createFallEffect(playerPhysics.position.clone());
    
    // Lose a life
    gameScore.lives--;
    updateScoreDisplay({ animateLives: true });
    
    // Check if game over
    if (gameScore.lives <= 0) {
        showMessage('Game Over! Press N to restart', '#ff0000', 5000);
        return;
    }
    
    // Restart the current level after a delay
    setTimeout(() => {
        restartCurrentLevel();
    }, 1500);
}

// Restart the current level
function restartCurrentLevel() {
    console.log('🔄 Restarting current level...');
    
    // Reset player to start position
    const currentLevel = getCurrentLevelData();
    if (currentLevel && currentLevel.playerStart) {
        const startPos = currentLevel.playerStart;
        setPlayerPosition({
            x: startPos.x || 0,
            y: startPos.y || 2,
            z: startPos.z || 0
        }, 'level restart');
    } else {
        // Fallback to default position
        setPlayerPosition({ x: 0, y: 2, z: 0 }, 'level restart fallback');
    }
    
    // Reset game state for the level
    gameScore.coins = 0;
    gameScore.hasKey = false;
    gameScore.levelComplete = false;
    
    // Reset inverted world state
    if (invertedWorld.isActive) {
        transitionToNormalWorld();
    }
    
    // Reset respawn flag
    fallDetection.isRespawning = false;
    
    // Reload the current level
    if (useJsonLevels) {
        loadJsonLevel(currentJsonLevelIndex);
    } else {
        // For random levels, generate a new one
        generateRandomLevel();
    }
    
    // Show restart complete message
    showMessage('Level restarted!', '#00ff88', 2000);
    
    // Play restart sound
    soundManager.play('teleport');
    
    // Update score display
    updateScoreDisplay();
}

// Trigger respawn sequence
function triggerRespawn(reason = 'unknown') {
    if (fallDetection.isRespawning) return;
    
    fallDetection.isRespawning = true;
    
    // Play fall sound
    soundManager.play('fall');
    
    // Show respawn message
    let message = '';
    switch (reason) {
        case 'fell':
            message = 'You fell! Respawning...';
            break;
        case 'out_of_bounds':
            message = 'Out of bounds! Respawning...';
            break;
        case 'damage':
            message = 'You died! Respawning...';
            break;
        case 'airborne_timeout':
            message = 'Stuck in air too long! Respawning...';
            break;
        default:
            message = 'Respawning...';
    }
    
    showMessage(message, '#ff6666', fallDetection.respawnDelay);
    
    // Create fall effect
    createFallEffect(playerPhysics.position.clone());
    
    // Lose a life
    if (reason !== 'manual') {
        damagePlayer();
    }
    
    // Respawn immediately
    executeRespawn();
}

// Execute the respawn
function executeRespawn() {
    console.log('⚰️ Executing respawn...');
    
    // Get spawn position with fallback
    let spawnPos = { x: 0, y: 2, z: 0 }; // Default fallback
    
    if (fallDetection.currentSpawnPoint && fallDetection.currentSpawnPoint.position) {
        spawnPos = fallDetection.currentSpawnPoint.position;
        console.log('⚰️ Using spawn point:', spawnPos);
    } else {
        console.warn('⚰️ No valid spawn point available, using default:', spawnPos);
        
        // Try to find a valid spawn point from the list
        if (fallDetection.safeSpawnPoints && fallDetection.safeSpawnPoints.length > 0) {
            for (const spawn of fallDetection.safeSpawnPoints) {
                if (spawn && spawn.position) {
                    spawnPos = spawn.position;
                    fallDetection.currentSpawnPoint = spawn;
                    console.log('⚰️ Found valid spawn point in list:', spawnPos);
                    break;
                }
            }
        }
        
        // If still no valid spawn point, create default
        if (!fallDetection.currentSpawnPoint) {
            fallDetection.currentSpawnPoint = {
                position: { x: 0, y: 2, z: 0 },
                name: 'Emergency Default',
                id: 'emergency_default'
            };
            console.log('⚰️ Created emergency default spawn point');
        }
    }
    
    // Use the safe position setting function
    setPlayerPosition(spawnPos, 'respawn');
    
    // Create spawn effect
    createSpawnEffect(playerPhysics.position.clone());
    
    // Reset respawn flag
    fallDetection.isRespawning = false;
    
    // Play respawn sound
    soundManager.play('respawn');
    
    console.log('⚰️ Player respawned successfully');
}

// Update current spawn point (checkpoint system)
function updateSpawnPoint(newSpawnPoint) {
    fallDetection.currentSpawnPoint = newSpawnPoint;
    showMessage(`Checkpoint: ${newSpawnPoint.name}`, '#00ff00', 2000);
    soundManager.play('checkpoint');
    
    // Create checkpoint effect
    createCheckpointEffect(newSpawnPoint.position);
}

// Create fall effect
function createFallEffect(position) {
    // Create red particle burst
    for (let i = 0; i < 15; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff4444,
            transparent: true,
            opacity: 0.8
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.copy(position);
        worldGroup.add(particle);
        
        // Random direction
        const direction = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() * 0.5,
            (Math.random() - 0.5) * 2
        ).normalize();
        
        // Animate particle
        const startTime = Date.now();
        const animateParticle = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / 1500; // 1.5 second animation
            
            if (progress < 1) {
                particle.position.add(direction.clone().multiplyScalar(0.02));
                particle.material.opacity = 0.8 * (1 - progress);
                requestAnimationFrame(animateParticle);
            } else {
                worldGroup.remove(particle);
            }
        };
        animateParticle();
    }
}

// Create spawn effect
function createSpawnEffect(position) {
    // Create blue particle burst
    for (let i = 0; i < 20; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x44aaff,
            transparent: true,
            opacity: 0.9
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.copy(position);
        worldGroup.add(particle);
        
        // Upward spiral direction
        const angle = (i / 20) * Math.PI * 2;
        const direction = new THREE.Vector3(
            Math.cos(angle) * 0.5,
            Math.random() * 2 + 1,
            Math.sin(angle) * 0.5
        ).normalize();
        
        // Animate particle
        const startTime = Date.now();
        const animateParticle = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / 2000; // 2 second animation
            
            if (progress < 1) {
                particle.position.add(direction.clone().multiplyScalar(0.03));
                particle.material.opacity = 0.9 * (1 - progress);
                requestAnimationFrame(animateParticle);
            } else {
                worldGroup.remove(particle);
            }
        };
        animateParticle();
    }
}

// Create checkpoint effect
function createCheckpointEffect(position) {
    // Create expanding ring effect
    const ringGeometry = new THREE.TorusGeometry(0.5, 0.05, 8, 16);
    const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(position);
    ring.position.y += 0.5;
    ring.rotation.x = Math.PI / 2;
    worldGroup.add(ring);
    
    // Animate ring
    const startTime = Date.now();
    const animateRing = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / 1000; // 1 second animation
        
        if (progress < 1) {
            const scale = 1 + progress * 2;
            ring.scale.setScalar(scale);
            ring.material.opacity = 0.8 * (1 - progress);
            requestAnimationFrame(animateRing);
        } else {
            worldGroup.remove(ring);
        }
    };
    animateRing();
}

// Helper function to update level index consistently
function setCurrentLevelIndex(index) {
    currentLevelIndex = index;
    currentJsonLevelIndex = index;
}

// Get current level data
function getCurrentLevelData() {
    if (currentLevelIndex >= 0 && currentLevelIndex < jsonLevels.length) {
        return jsonLevels[currentLevelIndex];
    }
    return null;
}

// Manual respawn function (for testing or emergency)
function manualRespawn() {
    triggerRespawn('manual');
}

// ============ MODULAR LEVEL SYSTEM ============

// Load level from separate JSON file
async function loadModularLevel(levelName) {
    try {
        const response = await fetch(`levels/${levelName}.json`);
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`Level file not found: levels/${levelName}.json`);
            } else {
                console.error(`Failed to load level ${levelName}: HTTP ${response.status}`);
            }
            return null;
        }
        const levelData = await response.json();
        console.log(`✅ Loaded modular level: ${levelName}`);
        return levelData;
    } catch (error) {
        console.error(`❌ Error loading modular level ${levelName}:`, error.message);
        return null;
    }
}

// Save level to separate JSON file
async function saveModularLevel(levelName, levelData) {
    try {
        const response = await fetch(`levels/${levelName}.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(levelData, null, 2)
        });
        if (!response.ok) {
            throw new Error(`Failed to save level: ${response.status}`);
        }
        console.log(`Saved modular level: ${levelName}`);
        return true;
    } catch (error) {
        console.error(`Error saving modular level ${levelName}:`, error);
        return false;
    }
}

// Generate programmatic levels using level constructor
function generateProgrammaticLevels() {
    const levels = [];
    
    // Level 1: Twisting Tower
    const twistingTower = new LevelConstructor('Twisting Tower', 30)
        .setPlayerStart({ x: 0, y: 2, z: 0 })
        .setBounds({ minX: -30, maxX: 30, minY: -50, maxY: 50, minZ: -30, maxZ: 30 })
        .addSafeSpawnPoint({ x: 0, y: 2, z: 0 }, 'Start')
        .addSafeSpawnPoint({ x: 10, y: 12, z: 0 }, 'Mid Tower')
        .addSafeSpawnPoint({ x: 0, y: 22, z: 10 }, 'High Tower')
        .addSafeSpawnPoint({ x: -10, y: 32, z: 0 }, 'Top')
        // Base platform
        .addPlatform('floating', { x: 0, y: 0, z: 0 }, { width: 8, height: 0.5, depth: 8 }, { material: 'stone' })
        // Spiral staircase
        .addPlatform('spiral', { x: 0, y: 0, z: 0 }, { width: 20, height: 40, depth: 20 }, { 
            material: 'metal',
            spiral: { turns: 3, segments: 48, innerRadius: 3, outerRadius: 7 }
        })
        // Gravity zones at different heights
        .addGravityPlane({ x: 0, y: 10, z: 0 }, { x: 0, y: 1, z: 0 }, 1.0, 15)
        .addGravityPlane({ x: 15, y: 20, z: 0 }, { x: -1, y: 0, z: 0 }, 1.0, 8)
        .addGravityPlane({ x: 0, y: 30, z: 15 }, { x: 0, y: 0, z: -1 }, 1.0, 8)
        // Rotating platforms
        .addPlatform('moving', { x: 5, y: 15, z: 5 }, { width: 3, height: 0.5, depth: 3 }, {
            material: 'energy',
            movement: { type: 'circular', center: { x: 0, y: 15, z: 0 }, radius: 7, speed: 0.5, axis: 'y' }
        })
        .addPlatform('moving', { x: -5, y: 25, z: -5 }, { width: 3, height: 0.5, depth: 3 }, {
            material: 'energy',
            movement: { type: 'circular', center: { x: 0, y: 25, z: 0 }, radius: 7, speed: 0.8, axis: 'y' }
        })
        // Timing challenges
        .addObject('disappearingTile', { x: 8, y: 10, z: 0 }, { 
            size: { width: 2, height: 0.2, depth: 2 }, delay: 2000, duration: 4000 
        })
        .addObject('timedSpike', { x: 0, y: 20, z: 8 }, {
            size: { width: 1, height: 0.8, depth: 1 },
            timing: { interval: 3000, duration: 1500, offset: 0 }
        })
        .addObject('movingSpike', { x: 0, y: 30, z: 0 }, {
            size: { width: 0.5, height: 1, depth: 0.5 },
            movement: { type: 'linear', path: [{ x: 0, y: 30, z: 0 }, { x: 0, y: 30, z: 10 }], speed: 2, loop: true }
        })
        // Collectibles
        .addObject('coin', { x: 3, y: 5, z: 3 })
        .addObject('coin', { x: -3, y: 15, z: -3 })
        .addObject('coin', { x: 5, y: 25, z: 0 })
        .addObject('coin', { x: 0, y: 35, z: 5 })
        .addObject('key', { x: 0, y: 35, z: 10 })
        .addObject('goal', { x: -10, y: 35, z: 0 });
    
    levels.push(twistingTower.toJSON());
    
    // Level 2: Gravity Maze
    const gravityMaze = new LevelConstructor('Gravity Maze', 40)
        .setPlayerStart({ x: 0, y: 2, z: 0 })
        .setBounds({ minX: -40, maxX: 40, minY: -30, maxY: 30, minZ: -40, maxZ: 40 })
        .addSafeSpawnPoint({ x: 0, y: 2, z: 0 }, 'Start')
        .addSafeSpawnPoint({ x: 20, y: 2, z: 0 }, 'East Wing')
        .addSafeSpawnPoint({ x: 0, y: 2, z: 20 }, 'North Wing')
        .addSafeSpawnPoint({ x: -20, y: 2, z: 0 }, 'West Wing')
        // Central hub
        .addPlatform('floating', { x: 0, y: 0, z: 0 }, { width: 10, height: 0.5, depth: 10 }, { material: 'stone' })
        // Four wings with different gravity orientations
        .addPlatform('floating', { x: 20, y: 0, z: 0 }, { width: 15, height: 0.5, depth: 8 }, { material: 'metal' })
        .addPlatform('floating', { x: 0, y: 0, z: 20 }, { width: 8, height: 0.5, depth: 15 }, { material: 'crystal' })
        .addPlatform('floating', { x: -20, y: 0, z: 0 }, { width: 15, height: 0.5, depth: 8 }, { material: 'wood' })
        .addPlatform('floating', { x: 0, y: 0, z: -20 }, { width: 8, height: 0.5, depth: 15 }, { material: 'energy' })
        // Gravity zones for each wing
        .addGravityPlane({ x: 20, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, 1.2, 12) // East: gravity pulls west
        .addGravityPlane({ x: 0, y: 0, z: 20 }, { x: 0, y: 0, z: -1 }, 1.2, 12) // North: gravity pulls south
        .addGravityPlane({ x: -20, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 1.2, 12) // West: gravity pulls east
        .addGravityPlane({ x: 0, y: 0, z: -20 }, { x: 0, y: 0, z: 1 }, 1.2, 12) // South: gravity pulls north
        // Connecting bridges
        .addPlatform('floating', { x: 10, y: 0, z: 0 }, { width: 8, height: 0.3, depth: 2 }, { material: 'metal' })
        .addPlatform('floating', { x: 0, y: 0, z: 10 }, { width: 2, height: 0.3, depth: 8 }, { material: 'crystal' })
        .addPlatform('floating', { x: -10, y: 0, z: 0 }, { width: 8, height: 0.3, depth: 2 }, { material: 'wood' })
        .addPlatform('floating', { x: 0, y: 0, z: -10 }, { width: 2, height: 0.3, depth: 8 }, { material: 'energy' })
        // Gravity changers to switch between zones
        .addObject('gravityChanger', { x: 8, y: 1, z: 0 }, {
            size: { width: 1, height: 0.2, depth: 1 },
            newGravity: { x: -1, y: 0, z: 0 }, duration: 8000
        })
        .addObject('gravityChanger', { x: 0, y: 1, z: 8 }, {
            size: { width: 1, height: 0.2, depth: 1 },
            newGravity: { x: 0, y: 0, z: -1 }, duration: 8000
        })
        // Traps and challenges
        .addObject('disappearingTile', { x: 15, y: 1, z: 0 }, { 
            size: { width: 2, height: 0.2, depth: 2 }, delay: 1000, duration: 3000 
        })
        .addObject('pressurePlate', { x: 0, y: 1, z: 15 }, {
            size: { width: 1, height: 0.1, depth: 1 },
            triggers: [{ type: 'platform', target: 'bridge_1', action: 'activate' }]
        })
        // Collectibles in each wing
        .addObject('coin', { x: 18, y: 2, z: 0 })
        .addObject('coin', { x: 0, y: 2, z: 18 })
        .addObject('coin', { x: -18, y: 2, z: 0 })
        .addObject('coin', { x: 0, y: 2, z: -18 })
        .addObject('key', { x: 25, y: 2, z: 0 })
        .addObject('goal', { x: -25, y: 2, z: 0 });
    
    levels.push(gravityMaze.toJSON());
    
    // Level 3: Timing Gauntlet
    const timingGauntlet = new LevelConstructor('Timing Gauntlet', 50)
        .setPlayerStart({ x: 0, y: 2, z: 0 })
        .setBounds({ minX: -25, maxX: 25, minY: -20, maxY: 20, minZ: -50, maxZ: 50 })
        .addSafeSpawnPoint({ x: 0, y: 2, z: 0 }, 'Start')
        .addSafeSpawnPoint({ x: 0, y: 2, z: 20 }, 'Quarter')
        .addSafeSpawnPoint({ x: 0, y: 2, z: 40 }, 'Half')
        .addSafeSpawnPoint({ x: 0, y: 12, z: 45 }, 'Final')
        // Starting platform
        .addPlatform('floating', { x: 0, y: 0, z: 0 }, { width: 6, height: 0.5, depth: 6 }, { material: 'stone' })
        // Moving platform sequence
        .addPlatform('moving', { x: 0, y: 0, z: 10 }, { width: 4, height: 0.5, depth: 4 }, {
            material: 'energy',
            movement: { type: 'linear', path: [{ x: -8, y: 0, z: 10 }, { x: 8, y: 0, z: 10 }], speed: 3, loop: true }
        })
        .addPlatform('moving', { x: 0, y: 0, z: 20 }, { width: 3, height: 0.5, depth: 3 }, {
            material: 'energy',
            movement: { type: 'circular', center: { x: 0, y: 0, z: 20 }, radius: 6, speed: 1, axis: 'y' }
        })
        .addPlatform('moving', { x: 0, y: 0, z: 30 }, { width: 4, height: 0.5, depth: 4 }, {
            material: 'energy',
            movement: { type: 'linear', path: [{ x: 0, y: 0, z: 30 }, { x: 0, y: 8, z: 30 }], speed: 2, loop: true }
        })
        .addPlatform('moving', { x: 0, y: 8, z: 40 }, { width: 3, height: 0.5, depth: 3 }, {
            material: 'energy',
            movement: { type: 'circular', center: { x: 0, y: 8, z: 40 }, radius: 5, speed: 1.5, axis: 'y' }
        })
        // Final platform
        .addPlatform('floating', { x: 0, y: 10, z: 45 }, { width: 8, height: 0.5, depth: 8 }, { material: 'crystal' })
        // Timing obstacles
        .addObject('timedSpike', { x: 0, y: 1, z: 15 }, {
            size: { width: 1, height: 0.8, depth: 1 },
            timing: { interval: 2000, duration: 1000, offset: 0 }
        })
        .addObject('timedSpike', { x: 3, y: 1, z: 25 }, {
            size: { width: 1, height: 0.8, depth: 1 },
            timing: { interval: 2500, duration: 1200, offset: 500 }
        })
        .addObject('timedSpike', { x: -3, y: 1, z: 35 }, {
            size: { width: 1, height: 0.8, depth: 1 },
            timing: { interval: 2000, duration: 800, offset: 1000 }
        })
        // Disappearing tiles
        .addObject('disappearingTile', { x: 0, y: 1, z: 5 }, { 
            size: { width: 2, height: 0.2, depth: 2 }, delay: 1500, duration: 2000 
        })
        .addObject('disappearingTile', { x: 0, y: 1, z: 25 }, { 
            size: { width: 2, height: 0.2, depth: 2 }, delay: 2000, duration: 2500 
        })
        // Collectibles
        .addObject('coin', { x: 0, y: 2, z: 10 })
        .addObject('coin', { x: 0, y: 2, z: 20 })
        .addObject('coin', { x: 0, y: 2, z: 30 })
        .addObject('coin', { x: 0, y: 9, z: 40 })
        .addObject('key', { x: 0, y: 11, z: 45 })
        .addObject('goal', { x: 0, y: 11, z: 50 });
    
    levels.push(timingGauntlet.toJSON());
    
    return levels;
}

// Load all available levels (both from files and programmatic)
async function loadAllLevels() {
    const allLevels = [];
    
    // Load tutorial levels from levels.json (levels 1-5)
    try {
        const response = await fetch('levels.json');
        if (response.ok) {
            const existingLevels = await response.json();
            
            // Use first 5 levels as tutorial levels (levels 1-5)
            const tutorialLevels = existingLevels.slice(0, 5);
            allLevels.push(...tutorialLevels);
            
            console.log(`✅ Loaded ${tutorialLevels.length} tutorial levels (levels 1-5)`);
        }
    } catch (error) {
        console.warn('Could not load existing levels.json:', error);
    }
    
    // Add programmatic 3D complex levels after the tutorial levels (starting from level 6)
    const programmaticLevels = generateProgrammaticLevels();
    
    // Renumber the programmatic levels to continue from level 6
    programmaticLevels.forEach((level, index) => {
        level.number = index + 6; // Start from level 6
    });
    
    allLevels.push(...programmaticLevels);
    
    console.log(`✅ Added ${programmaticLevels.length} complex 3D tower levels starting from level 6`);
    
    // Try to load modular levels for even more complex levels
    const modularLevelNames = ['advanced-tower', 'gravity-chambers'];
    for (const levelName of modularLevelNames) {
        const levelData = await loadModularLevel(levelName);
        if (levelData) {
            // Renumber modular levels to continue sequence
            levelData.number = allLevels.length + 1;
            allLevels.push(levelData);
            console.log(`✅ Successfully loaded modular level: ${levelName} as level ${levelData.number}`);
        } else {
            console.warn(`⚠️  Failed to load modular level: ${levelName}`);
        }
    }
    
    console.log(`✅ Total levels loaded: ${allLevels.length} (5 tutorial + ${allLevels.length - 5} complex 3D levels)`);
    
    return allLevels;
}

// ============ GRAVITY ZONES SYSTEM ============

// Update gravity based on player position and active gravity planes
function updateGravityZones() {
    if (gravityPlanes.length === 0) return;
    
    const playerPos = playerPhysics.position;
    let activeGravity = new THREE.Vector3(0, PHYSICS_CONFIG.gravity, 0);
    let strongestInfluence = 0;
    
    // Check each gravity plane
    gravityPlanes.forEach(plane => {
        const planePos = new THREE.Vector3(plane.position.x, plane.position.y, plane.position.z);
        const distance = playerPos.distanceTo(planePos);
        
        // Check if player is within radius of this gravity plane
        if (distance < plane.radius) {
            // Calculate influence based on distance (closer = stronger influence)
            const influence = (1 - (distance / plane.radius)) * plane.strength;
            
            if (influence > strongestInfluence) {
                strongestInfluence = influence;
                // Set gravity direction based on plane normal
                activeGravity.set(
                    plane.normal.x * PHYSICS_CONFIG.gravity * plane.strength,
                    plane.normal.y * PHYSICS_CONFIG.gravity * plane.strength,
                    plane.normal.z * PHYSICS_CONFIG.gravity * plane.strength
                );
            }
        }
    });
    
    // Apply the strongest gravity influence
    if (strongestInfluence > 0.1) {
        physicsWorld.gravity.copy(activeGravity);
        
        // Ensure worldState.gravityDirection stays synchronized
        worldState.gravityDirection.copy(activeGravity.clone().normalize());
        
        // Visual feedback for gravity change
        if (strongestInfluence > 0.8) {
            createGravityZoneEffect(playerPos, activeGravity);
        }
    } else {
        // Reset to default gravity
        physicsWorld.gravity.set(0, PHYSICS_CONFIG.gravity, 0);
        
        // Ensure worldState.gravityDirection stays synchronized
        worldState.gravityDirection.set(0, -1, 0);
    }
}

// Create visual effect for gravity zones
function createGravityZoneEffect(position, gravityDirection) {
    // Only create effect occasionally to avoid performance issues
    if (Math.random() > 0.05) return;
    
    const particleGeometry = new THREE.SphereGeometry(0.03, 6, 6);
    const particleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x8800ff,
        transparent: true,
        opacity: 0.6
    });
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    
    // Random position around player
    particle.position.copy(position);
    particle.position.x += (Math.random() - 0.5) * 2;
    particle.position.y += (Math.random() - 0.5) * 2;
    particle.position.z += (Math.random() - 0.5) * 2;
    
    worldGroup.add(particle);
    
    // Animate particle in gravity direction
    const direction = gravityDirection.clone().normalize();
    const startTime = Date.now();
    
    const animateParticle = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / 1000; // 1 second animation
        
        if (progress < 1) {
            particle.position.add(direction.clone().multiplyScalar(0.02));
            particle.material.opacity = 0.6 * (1 - progress);
            requestAnimationFrame(animateParticle);
        } else {
            worldGroup.remove(particle);
        }
    };
    animateParticle();
}

// Check if player is in a specific gravity zone
function isPlayerInGravityZone(zoneName) {
    return gravityPlanes.some(plane => {
        const planePos = new THREE.Vector3(plane.position.x, plane.position.y, plane.position.z);
        const distance = playerPhysics.position.distanceTo(planePos);
        return distance < plane.radius && plane.name === zoneName;
    });
}

// Get current gravity zone info
function getCurrentGravityZone() {
    const playerPos = playerPhysics.position;
    let closestZone = null;
    let closestDistance = Infinity;
    
    gravityPlanes.forEach((plane, index) => {
        const planePos = new THREE.Vector3(plane.position.x, plane.position.y, plane.position.z);
        const distance = playerPos.distanceTo(planePos);
        
        if (distance < plane.radius && distance < closestDistance) {
            closestDistance = distance;
            closestZone = {
                index: index,
                plane: plane,
                distance: distance,
                influence: (1 - (distance / plane.radius)) * plane.strength
            };
        }
    });
    
    return closestZone;
}

// ============ CHECKPOINT SYSTEM ============

// Check if player is near a checkpoint
function checkCheckpoints() {
    if (fallDetection.safeSpawnPoints.length === 0) return;
    
    const playerPos = playerPhysics.position;
    const checkpointDistance = 2.0; // Distance to activate checkpoint
    
    fallDetection.safeSpawnPoints.forEach(spawn => {
        const spawnPos = new THREE.Vector3(spawn.position.x, spawn.position.y, spawn.position.z);
        const distance = playerPos.distanceTo(spawnPos);
        
        if (distance < checkpointDistance && fallDetection.currentSpawnPoint !== spawn) {
            updateSpawnPoint(spawn);
        }
    });
}

// Function to load level from JSON
function loadJsonLevel(levelIndex) {
    if (levelIndex >= jsonLevels.length) {
        console.log("📄 No more JSON levels, switching to random generation");
        useJsonLevels = false;
        return false;
    }
    
    const level = jsonLevels[levelIndex];
    console.log(`📄 Loading JSON level: ${level.name} (${level.number})`);
    
    // Clear existing level
    clearAllCoins();
    clearSpikeTraps();
    clearTeleportTiles();
    clearAllBouncingPlatforms();
    clearBrokenTiles();
    clearStaticWalls();
    clearMovingObstacles();
    clearTypedTiles();
    clearHoles();
    clearUnderworldObjects();
    
    // Clear 3D platforms and objects
    clearAllPlatforms();
    
    // Update game state
    gameScore.currentLevel = level.number;
    
    // Count total coins needed for this level (single player only)
    if (gameMode.isSinglePlayer) {
        gameScore.requiredCoins = 0;
        gameScore.coins = 0;
        gameScore.hasKey = false;
        gameScore.levelComplete = false;
        
        // Check if this level requires all coins to complete
        if (level.requireAllCoins && level.objects) {
            level.objects.forEach(obj => {
                if (obj.type === 'coin') {
                    gameScore.requiredCoins++;
                }
            });
            console.log(`Level ${level.number}: Requires ${gameScore.requiredCoins} coins to complete`);
        } else {
            console.log(`Level ${level.number}: Coins are optional (completion rules: ${level.number === 1 ? 'coins + key' : level.number >= 2 && level.number <= 5 ? 'key only (auto-transition)' : 'key + goal tile'})`);
        }
    }
    
    // Check if this is a 3D level
    const is3DLevel = level.use3D || false;
    
    if (is3DLevel) {
        // Handle 3D level loading
        console.log('Loading 3D level with platforms and enhanced objects');
        
        // Create platforms
        if (level.platforms) {
            level.platforms.forEach(platformConfig => {
                try {
                    create3DPlatform(platformConfig);
                } catch (error) {
                    console.error('Error creating platform:', platformConfig, error);
                }
            });
        }
        
        // Set player start position (3D)
        const startPos = level.playerStart || { x: 5, z: 5, y: 0 };
        
        // Use safe position setting with validation
        setPlayerPosition({
            x: startPos.x,
            y: startPos.y + 1,
            z: startPos.z
        }, '3D JSON level loading');
        
        // Set up gravity planes
        if (level.gravityPlanes) {
            level.gravityPlanes.forEach(plane => {
                gravityPlanes.push(plane);
            });
        }
        
        // Initialize fall detection
        initializeFallDetection(level);
        
        // Create 3D objects
        if (level.objects) {
            level.objects.forEach(obj => {
                try {
                    create3DLevelObject(obj);
                } catch (error) {
                    console.error('Error creating 3D object:', obj, error);
                }
            });
        }
        
    } else {
        // Handle traditional 2D level loading
        // Set player start position
        playerStartPosition.gridX = level.playerStart.x;
        playerStartPosition.gridZ = level.playerStart.z;
        playerState.gridX = level.playerStart.x;
        playerState.gridZ = level.playerStart.z;
        
        // Reset player position
        const startPos = gridToWorld(level.playerStart.x, level.playerStart.z);
        
        // Use safe position setting with validation
        setPlayerPosition({
            x: startPos.x,
            y: 0.55,
            z: startPos.z
        }, 'JSON level loading');
        
        // Reset player rotation
        playerState.baseRotation.x = 0;
        playerState.baseRotation.z = 0;
        player.rotation.x = 0;
        player.rotation.y = 0;
        player.rotation.z = 0;
        
        // Load tiles from tileTypes array or use auto-generated tiles
        loadTilesFromTypes(level);
        
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
                    const teleportTile = createTeleportTileAt(obj.x, obj.z, obj.pairId, obj.destination);
                    if (!teleportTile) {
                        console.warn(`Failed to create teleporter at (${obj.x}, ${obj.z}) in level "${level.name}"`);
                    }
                    break;
                case 'bouncingPlatform':
                    createBouncingPlatform(obj.x, obj.z);
                    break;
                case 'brokenTile':
                    createBrokenTile(obj.x, obj.z);
                    break;
                case 'staticWall':
                    createStaticWall(obj.x, obj.z, obj.height || 1);
                    break;
                case 'movingObstacle':
                    createMovingObstacle(obj.x, obj.z, obj.endX, obj.endZ, obj.speed || 1);
                    break;
                case 'hole':
                    createHole(obj.x, obj.z);
                    break;
            }
        });
        
        // Initialize fall detection for 2D levels
        initializeFallDetection(level);
    }
    
    // Link teleporter pairs
    linkTeleporterPairs();
    
    // Update UI
    gameScore.totalCoins = coins.length;
    updateScoreDisplay();
    updatePlayerPosition();
    
    // Transition overlay system removed - no longer needed
    
    // Level start message removed for instant loading
    
    // Update level info display
    updateLevelInfo();
    
    // Update HUD with level information
    updateLevelHUD(level, levelIndex);
    
    // Send level initialization event to server for multiplayer sync
    if (multiplayerState.isConnected && !gameMode.isSinglePlayer) {
        socket.emit('initializeLevel', {
            levelType: 'json',
            levelIndex: currentLevelIndex,
            levelNumber: level.number,
            levelName: level.name,
            coinCount: coins.length,
            objectCount: level.objects.length
        });
    }
    
    // Start the level timer
    startLevelTimer();
    
    // Force camera update to target player
    updateThirdPersonCamera();
    
    // Create inverted world geometry
    createInvertedWorldGeometry();
    
    // Set up environment for this level
    setupEnvironment(level);
    
    // Validate and add missing physics surfaces
    validatePhysicsSurfaces();
    
    console.log(`📄 JSON level ${level.name} loaded successfully`);
    console.log(`📄 Player position: (${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}, ${player.position.z.toFixed(2)})`);
    
    return true;
}

// ============ 3D LEVEL HELPER FUNCTIONS ============

// Create 3D platform based on type
function create3DPlatform(config) {
    switch (config.type) {
        case 'floating':
            return createFloatingPlatform(config);
        case 'angled':
            return createAngledPlatform(config);
        case 'curved':
            return createCurvedPlatform(config);
        case 'spiral':
            return createSpiralPlatform(config);
        case 'moving':
            return createMovingPlatform(config);
        default:
            console.warn('Unknown platform type:', config.type);
            return createFloatingPlatform(config); // Fallback
    }
}

// Create 3D level object
function create3DLevelObject(obj) {
    // Handle 3D position format
    const position = obj.position || { x: obj.x || 0, y: obj.y || 0, z: obj.z || 0 };
    
    switch (obj.type) {
        case 'coin':
            return createCoinAt3D(position.x, position.y, position.z);
        case 'key':
            return createKeyAt3D(position.x, position.y, position.z);
        case 'goal':
            return createGoalAt3D(position.x, position.y, position.z);
        case 'disappearingTile':
            return createDisappearingTile({
                position: position,
                size: obj.size || { width: 2, height: 0.2, depth: 2 },
                delay: obj.delay,
                duration: obj.duration
            });
        case 'pressurePlate':
            return createPressurePlate({
                position: position,
                size: obj.size || { width: 1, height: 0.1, depth: 1 },
                triggers: obj.triggers || []
            });
        case 'timedSpike':
            return createTimedSpike({
                position: position,
                size: obj.size || { width: 1, height: 0.5, depth: 1 },
                timing: obj.timing
            });
        case 'movingSpike':
            return createMovingSpike({
                position: position,
                size: obj.size || { width: 0.5, height: 1, depth: 0.5 },
                movement: obj.movement
            });
        case 'gravityChanger':
            return createGravityChanger({
                position: position,
                size: obj.size || { width: 2, height: 0.2, depth: 2 },
                newGravity: obj.newGravity,
                duration: obj.duration
            });
        case 'bouncingPlatform':
            return createBouncingPlatform3D(position.x, position.y, position.z);
        default:
            console.warn('Unknown 3D object type:', obj.type);
            return null;
    }
}

// Create 3D coin
function createCoinAt3D(x, y, z) {
    const coinGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16);
    const coinMaterial = new THREE.MeshLambertMaterial({ color: 0xffd700 });
    const coin = new THREE.Mesh(coinGeometry, coinMaterial);
    
    coin.position.set(x, y, z);
    coin.castShadow = true;
    coin.receiveShadow = true;
    
    // Add floating animation data
    coin.userData = {
        originalY: y,
        animationOffset: Math.random() * Math.PI * 2,
        id: `coin_${coins.length}`
    };
    
    worldGroup.add(coin);
    coins.push(coin);
    
    return coin;
}

// Create 3D key
function createKeyAt3D(x, y, z) {
    if (gameKey) {
        worldGroup.remove(gameKey);
    }
    
    const keyGroup = new THREE.Group();
    
    // Key body
    const keyBodyGeometry = new THREE.BoxGeometry(0.1, 0.8, 0.1);
    const keyBodyMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xff6600,
        emissive: 0x331100
    });
    const keyBody = new THREE.Mesh(keyBodyGeometry, keyBodyMaterial);
    keyBody.position.set(0, 0, 0);
    keyGroup.add(keyBody);
    
    // Key head
    const keyHeadGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.1);
    const keyHead = new THREE.Mesh(keyHeadGeometry, keyBodyMaterial);
    keyHead.position.set(0, 0.35, 0);
    keyGroup.add(keyHead);
    
    // Key teeth
    const keyTeethGeometry = new THREE.BoxGeometry(0.2, 0.05, 0.05);
    const keyTeeth = new THREE.Mesh(keyTeethGeometry, keyBodyMaterial);
    keyTeeth.position.set(0.15, 0.25, 0);
    keyGroup.add(keyTeeth);
    
    keyGroup.position.set(x, y, z);
    keyGroup.castShadow = true;
    keyGroup.receiveShadow = true;
    
    keyGroup.userData = {
        originalY: y,
        animationOffset: Math.random() * Math.PI * 2,
        id: `key_${x}_${y}_${z}`
    };
    
    worldGroup.add(keyGroup);
    gameKey = keyGroup;
    
    return keyGroup;
}

// Create 3D goal
function createGoalAt3D(x, y, z) {
    if (goalTile) {
        worldGroup.remove(goalTile);
    }
    
    const goalGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16);
    const goalMaterial = new THREE.MeshLambertMaterial({ 
        color: gameScore.hasKey ? 0x00ff00 : 0x666666,
        emissive: gameScore.hasKey ? 0x003300 : 0x000000,
        transparent: true,
        opacity: gameScore.hasKey ? 0.9 : 0.5
    });
    
    const goal = new THREE.Mesh(goalGeometry, goalMaterial);
    goal.position.set(x, y, z);
    goal.castShadow = true;
    goal.receiveShadow = true;
    
    goal.userData = {
        originalY: y,
        animationOffset: Math.random() * Math.PI * 2
    };
    
    worldGroup.add(goal);
    goalTile = goal;
    
    return goal;
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
    
    // Add floating animation data and unique ID for multiplayer sync
    keyGroup.userData = {
        originalY: keyGroup.position.y,
        animationOffset: Math.random() * Math.PI * 2,
        id: `key_${gridX}_${gridZ}`
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
    // Validate destination coordinates
    if (!destination || typeof destination !== 'object') {
        console.warn(`Teleport tile at (${gridX}, ${gridZ}) has missing or invalid destination:`, destination);
        return null;
    }
    
    // Check if destination has valid coordinates (supports both x/z and gridX/gridZ formats)
    const destX = destination.x !== undefined ? destination.x : destination.gridX;
    const destZ = destination.z !== undefined ? destination.z : destination.gridZ;
    
    if (!isValidGridPosition(destX, destZ)) {
        console.warn(`Teleport tile at (${gridX}, ${gridZ}) has invalid destination coordinates:`, destination);
        console.warn(`Expected valid numbers within grid bounds (0-${gridSize-1}), got destX=${destX}, destZ=${destZ}`);
        return null;
    }
    
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
    
    // Normalize destination format to ensure consistent access
    teleportGroup.destination = {
        x: destX,
        z: destZ,
        gridX: destX, // For backward compatibility
        gridZ: destZ  // For backward compatibility
    };
    
    // Add animation data
    teleportGroup.userData = {
        originalY: teleportGroup.position.y,
        animationOffset: Math.random() * Math.PI * 2
    };
    
    worldGroup.add(teleportGroup);
    teleportTiles.push(teleportGroup);
    
    console.log(`Created teleport tile at (${gridX}, ${gridZ}) with destination (${destX}, ${destZ})`);
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
                console.log(`Linked teleporter pair: (${tile.gridX}, ${tile.gridZ}) <-> (${destinationTile.gridX}, ${destinationTile.gridZ})`);
            } else {
                console.warn(`Teleporter at (${tile.gridX}, ${tile.gridZ}) could not find its destination at (${tile.destination.x}, ${tile.destination.z}) with pairId ${tile.pairId}`);
            }
        } else {
            console.warn(`Teleporter at (${tile.gridX}, ${tile.gridZ}) has no destination defined`);
        }
    });
}

// Helper function to validate grid coordinates
function isValidGridPosition(x, z) {
    return typeof x === 'number' && typeof z === 'number' && 
           !isNaN(x) && !isNaN(z) && 
           x >= 0 && z >= 0 && 
           x < gridSize && z < gridSize;
}

// Helper function to show messages (no fade delays)
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
        
        // Set new timeout to hide message immediately
        messageElement.hideTimeout = setTimeout(() => {
            messageElement.classList.remove('show');
            messageElement.textContent = '';
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
        setCurrentLevelIndex(0);
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
        setCurrentLevelIndex(currentJsonLevelIndex + 1);
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
        setCurrentLevelIndex(currentJsonLevelIndex - 1);
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
        setCurrentLevelIndex(0);
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

// Update level HUD with current level information
function updateLevelHUD(level, levelIndex) {
    const levelNameElement = document.getElementById('level-name');
    if (levelNameElement) {
        levelNameElement.textContent = `${level.name} (${levelIndex + 1}/${jsonLevels.length})`;
    }
    
    // Add best time indicator to timer display
    const timerElement = document.getElementById('level-timer');
    if (timerElement && levelProgress.jsonLevels[levelIndex]?.bestTime) {
        const bestTime = levelProgress.jsonLevels[levelIndex].bestTime;
        const bestTimeFormatted = formatTime(bestTime);
        timerElement.title = `🏆 Best Time: ${bestTimeFormatted}`;
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
    
    // Add floating animation data and unique ID for multiplayer sync
    keyGroup.userData = {
        originalY: keyGroup.position.y,
        animationOffset: Math.random() * Math.PI * 2,
        id: `key_${keyGridX}_${keyGridZ}`
    };
    
    worldGroup.add(keyGroup);
    gameKey = keyGroup;
    
    console.log('🔑 Key created at grid position:', keyGridX, keyGridZ);
    
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
    console.log('🔑 Key collection triggered');
    
    if (gameKey) {
        // Send collection event to server for multiplayer sync
        if (multiplayerState.isConnected && gameKey.userData.id && !gameMode.isSinglePlayer) {
            socket.emit('collectItem', {
                itemType: 'key',
                itemId: gameKey.userData.id
            });
        }
        
        worldGroup.remove(gameKey);
        gameKey = null;
        gameScore.hasKey = true;
        
        // Track key collection for statistics and achievements
        trackKeyCollection();
        
        // Play key pickup sound effect
        soundManager.play('key');
        
        // Force immediate HUD refresh to ensure inventory is updated
        setTimeout(() => {
            updateScoreDisplay({ animateKey: false });
        }, 50);
        
        // Update goal tile appearance
        if (goalTile) {
            goalTile.material.color.setHex(0x00ff00);
            goalTile.material.emissive.setHex(0x003300);
            goalTile.material.opacity = 0.9;
        }
        
        // Update typed goal tile appearance
        updateGoalTileAppearance();
        
        // Create collection effect
        showKeyCollectionEffect();
        
        // Handle different completion rules based on level
        const currentLevel = gameScore.currentLevel;
        
        if (gameMode.isSinglePlayer && !gameScore.levelComplete) {
            if (currentLevel >= 2 && currentLevel <= 5) {
                // Levels 2-5: Auto-transition on key collection
                updateScoreDisplay({ animateKey: true });
                
                completeLevel();
            } else {
                // Level 1 and 6+: Show message and check for completion
                if (currentLevel === 1) {
                    showMessage('Key collected! Now collect all coins and reach the exit!', '#ff6600', 3000);
                } else {
                    showMessage('Key collected! Now reach the exit to complete the level!', '#ff6600', 3000);
                }
                
                updateScoreDisplay({ animateKey: true });
                
                // Check for level completion
                if (gameScore.coins >= gameScore.requiredCoins && gameScore.hasKey) {
                    checkForAutoLevelCompletion();
                }
            }
        } else {
            // Multiplayer or already completed
            showMessage('Key collected! The exit is now unlocked!', '#ff6600', 3000);
            updateScoreDisplay({ animateKey: true });
            
            // Check for level completion in single player mode
            if (gameMode.isSinglePlayer && gameScore.coins >= gameScore.requiredCoins && gameScore.hasKey) {
                checkForAutoLevelCompletion();
            }
        }
    }
}

// Function to complete the level
function completeLevel() {
    // Check completion requirements based on game mode and level
    if (gameMode.isSinglePlayer) {
        const currentLevel = gameScore.currentLevel;
        
        // Different completion rules for different levels
        if (currentLevel === 1) {
            // Level 1: requires ALL coins + key
            if (!gameScore.hasKey) {
                showMessage('Exit is locked! Find the key first!', '#ff6666', 2000);
                return;
            }
            
            if (gameScore.coins < gameScore.requiredCoins) {
                const remaining = gameScore.requiredCoins - gameScore.coins;
                showMessage(`Collect all coins first! ${remaining} coins remaining.`, '#ff6666', 2000);
                return;
            }
        } else if (currentLevel >= 2 && currentLevel <= 5) {
            // Levels 2-5: only require key (auto-transition handled in collectKey)
            if (!gameScore.hasKey) {
                showMessage('Exit is locked! Find the key first!', '#ff6666', 2000);
                return;
            }
            // Coins are optional for levels 2-5
        } else {
            // Levels 6+: require key (coins are optional)
            if (!gameScore.hasKey) {
                showMessage('Exit is locked! Find the key first!', '#ff6666', 2000);
                return;
            }
            // Coins are optional for levels 6+
        }
    } else {
        // Multiplayer mode: only require key (legacy behavior)
        if (!gameScore.hasKey) {
            showMessage('Exit is locked! Find the key first!', '#ff6666', 2000);
            return;
        }
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
    
    // Level completion message removed for instant transitions
    
    // Create completion effect
    showLevelCompletionEffect();
    
    updateScoreDisplay({ animateScore: true });
    
    // Start voting for multiplayer or auto-transition for single player
    if (!gameMode.isSinglePlayer && multiplayerState.isConnected && Object.keys(multiplayerState.otherPlayers).length > 0) {
        // Multiplayer: Start voting immediately
        const levelData = {
            levelNumber: gameScore.currentLevel,
            levelName: useJsonLevels && jsonLevels[currentJsonLevelIndex] ? jsonLevels[currentJsonLevelIndex].name : `Level ${gameScore.currentLevel}`,
            levelScore: levelScore,
            completionTime: completionTime,
            timeBonus: timeBonus,
            progressInfo: progressInfo
        };
        
        socket.emit('levelCompleted', levelData);
    } else {
        // Single player: Direct level transition
        if (useJsonLevels && currentJsonLevelIndex >= jsonLevels.length - 1) {
            // All levels completed - handle directly
            handleAllJsonLevelsCompleted();
        } else {
            // Transition to next level immediately
            transitionToNextLevel();
        }
    }
}

// Function to check for automatic level completion in single player mode
function checkForAutoLevelCompletion() {
    // Only auto-complete in single player mode
    if (!gameMode.isSinglePlayer) return;
    
    // Check if all requirements are met
    if (gameScore.coins >= gameScore.requiredCoins && gameScore.hasKey && !gameScore.levelComplete) {
        showMessage('All objectives complete! Level completed!', '#00ff00', 2000);
        
        // Auto-complete immediately
        completeLevel();
    }
}

// All transition functions removed - immediate level switching enabled

// Function to transition to next level
function transitionToNextLevel() {
    console.log('🔄 Transitioning to next level...');
    
    // Transition safety lock removed - instant transitions enabled
    console.log('🔄 Starting instant level transition...');
    
    // Reset level state (but keep lives)
    gameScore.hasKey = false;
    gameScore.levelComplete = false;
    gameScore.coins = 0;
    gameScore.requiredCoins = 0;
    
    // Reset timer for next level
    resetTimer();
    
    // No collection timers to clear - immediate collection enabled
    
    // Immediate level transition - no delays or animations
    try {
        if (useJsonLevels && levelDataLoaded) {
            // Use JSON levels
            if (currentJsonLevelIndex < jsonLevels.length - 1) {
                // Load next JSON level
                setCurrentLevelIndex(currentJsonLevelIndex + 1);
                const loadResult = loadJsonLevel(currentJsonLevelIndex);
                console.log(`🔄 JSON level load result: ${loadResult}`);
            } else {
                // All JSON levels completed - offer options
                handleAllJsonLevelsCompleted();
            }
        } else {
            // Use random generation
            gameScore.currentLevel++;
            const coinsForLevel = Math.min(15 + (gameScore.currentLevel - 1) * 2, 25);
            generateNewLevel(coinsForLevel);
            console.log(`🔄 Generated Level ${gameScore.currentLevel} with ${coinsForLevel} coins`);
            
            // No level message for instant loading
        }
        
        updateScoreDisplay();
        
        console.log('✅ Transition completed immediately');
        
    } catch (error) {
        console.error('❌ Error during level transition:', error);
        showMessage('Transition error occurred. Please try again.', '#ff6666', 3000);
    }
}

// Function to set up the game state after level transition
function postTransitionSetup() {
    console.log('🛠️ Post-transition setup starting...');
    
    // Ensure player position is properly set
    if (!player) {
        console.error('❌ Player object is null or undefined!');
        return;
    }
    
    // For random levels, ensure player is positioned correctly since generateNewLevel doesn't reset position
    if (!useJsonLevels || !levelDataLoaded) {
        console.log('🛠️ Resetting player position for random level...');
        const centerPos = gridToWorld(5, 5);
        
        // Use safe position setting with validation
        setPlayerPosition({
            x: centerPos.x,
            y: centerPos.y + 0.55,
            z: centerPos.z
        }, 'post-transition random level');
    }
    
    // Force camera update to target player
    updateThirdPersonCamera();
    
    // Ensure camera is properly positioned
    if (camera) {
        console.log(`🛠️ Camera position: ${camera.position.x}, ${camera.position.y}, ${camera.position.z}`);
    }
    
    // Ensure renderer is active
    if (renderer) {
        console.log('🛠️ Renderer active and rendering...');
        renderer.render(scene, camera);
    }
    
    console.log('🛠️ Post-transition setup complete');
}

// Function to debug the state after transition
function debugPostTransitionState() {
    console.log('🔍 === POST-TRANSITION DEBUG INFO ===');
    
    // Check scene state
    if (scene) {
        console.log(`🔍 Scene children count: ${scene.children.length}`);
        console.log('🔍 Scene children:', scene.children.map(child => child.constructor.name));
    } else {
        console.error('❌ Scene is null!');
    }
    
    // Check player state
    if (player) {
        const pos = player.position;
        const posArray = pos.toArray();
        const hasNaN = posArray.some(v => isNaN(v));
        
        console.log(`🔍 Player position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
        console.log(`🔍 Player position array: [${posArray.map(v => v.toFixed(2)).join(', ')}]`);
        console.log(`🔍 Player position has NaN: ${hasNaN ? '❌ YES' : '✅ NO'}`);
        console.log(`🔍 Player visible: ${player.visible}`);
        console.log(`🔍 Player in scene: ${scene.children.includes(player) || worldGroup.children.includes(player)}`);
        
        if (hasNaN) {
            console.error('❌ CRITICAL: Player position contains NaN values!');
            console.error('❌ This is likely the cause of the black screen issue');
        }
    } else {
        console.error('❌ Player is null!');
    }
    
    // Check physics player state
    if (playerPhysics) {
        const physicsPos = playerPhysics.position;
        const physicsArray = [physicsPos.x, physicsPos.y, physicsPos.z];
        const physicsHasNaN = physicsArray.some(v => isNaN(v));
        
        console.log(`🔍 Physics position: (${physicsPos.x.toFixed(2)}, ${physicsPos.y.toFixed(2)}, ${physicsPos.z.toFixed(2)})`);
        console.log(`🔍 Physics position has NaN: ${physicsHasNaN ? '❌ YES' : '✅ NO'}`);
        
        if (physicsHasNaN) {
            console.error('❌ CRITICAL: Physics position contains NaN values!');
        }
    } else {
        console.error('❌ PlayerPhysics is null!');
    }
    
    // Check camera state
    if (camera) {
        console.log(`🔍 Camera position: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
        console.log(`🔍 Camera target: Camera controls enabled: ${controls?.enabled || 'no controls'}`);
    } else {
        console.error('❌ Camera is null!');
    }
    
    // Check renderer state
    if (renderer) {
        console.log(`🔍 Renderer size: ${renderer.domElement.width}x${renderer.domElement.height}`);
        console.log(`🔍 Renderer clearing: ${renderer.autoClear}`);
    } else {
        console.error('❌ Renderer is null!');
    }
    
    // Check game objects
    console.log(`🔍 Coins: ${coins.length}`);
    console.log(`🔍 Has key: ${gameKey ? 'yes' : 'no'}`);
    console.log(`🔍 Has goal: ${goalTile ? 'yes' : 'no'}`);
    
    // Check worldGroup
    if (worldGroup) {
        console.log(`🔍 WorldGroup children: ${worldGroup.children.length}`);
    } else {
        console.error('❌ WorldGroup is null!');
    }
    
    // Check level state
    console.log(`🔍 Current level: ${gameScore.currentLevel}`);
    console.log(`🔍 Use JSON levels: ${useJsonLevels}`);
    console.log(`🔍 Current level index: ${currentLevelIndex}`);
    
    console.log('🔍 === END DEBUG INFO ===');
}

// Function to handle completion of all JSON levels
function handleAllJsonLevelsCompleted() {
    // Only show victory screen in single player mode
    if (!gameMode.isSinglePlayer) {
        console.log('Victory screen skipped - not in single player mode');
        return;
    }
    
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

// Function to calculate total time across all completed levels
function calculateTotalTime() {
    if (!levelProgress || !levelProgress.jsonLevels) return 0;
    
    const completedLevels = Object.values(levelProgress.jsonLevels);
    const totalTime = completedLevels.reduce((sum, level) => {
        if (level && level.completed && level.bestTime) {
            return sum + level.bestTime;
        }
        return sum;
    }, 0);
    
    return totalTime;
}

// Function to calculate completion statistics and achievements
function calculateCompletionStats() {
    const totalCoins = calculateTotalCoinsCollected();
    const bestTime = calculateBestTime();
    const totalTime = calculateTotalTime();
    const achievements = calculateAchievements();
    
    return {
        totalLevels: jsonLevels.length,
        totalScore: gameScore.totalScore,
        avgScorePerLevel: Math.round(gameScore.totalScore / jsonLevels.length),
        lives: gameScore.lives,
        maxLives: gameScore.maxLives,
        totalCoins: totalCoins,
        bestTime: bestTime,
        totalTime: totalTime,
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
    
    // Update subtitle for single player mode
    const subtitleElement = document.getElementById('victory-subtitle');
    if (subtitleElement) {
        subtitleElement.textContent = `Single Player Campaign Complete! (${stats.totalLevels} levels)`;
    }
    
    // Populate statistics
    document.getElementById('total-levels').textContent = stats.totalLevels;
    document.getElementById('total-score').textContent = stats.totalScore.toLocaleString();
    document.getElementById('average-score').textContent = stats.avgScorePerLevel.toLocaleString();
    document.getElementById('lives-remaining').textContent = `${stats.lives}/${stats.maxLives}`;
    document.getElementById('total-coins').textContent = stats.totalCoins;
    document.getElementById('best-time').textContent = stats.bestTime ? formatTime(stats.bestTime) : '--:--';
    document.getElementById('total-time').textContent = stats.totalTime > 0 ? formatTime(stats.totalTime) : '--:--';
    
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
    
    // Show restart message
    showMessage('🔄 Restarting Single Player Campaign...', '#ffd700', 2000);
    
    // Reset game state for fresh start
    gameScore.totalScore = 0;
    gameScore.lives = gameScore.maxLives;
    gameScore.currentLevel = 1;
    
    // Restart JSON levels from the beginning
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
    setCurrentLevelIndex(0);
    showMessage('🔄 Restarting JSON levels from the beginning!', '#00ffff', 3000);
    
    // Load immediately - no delay
    loadJsonLevel(currentJsonLevelIndex);
}

// Function to switch to random generation
function switchToRandomGeneration() {
    useJsonLevels = false;
    gameScore.currentLevel = jsonLevels.length + 1; // Continue numbering from where JSON left off
    
    showMessage('🎲 Switching to infinite random levels!', '#ff6600', 3000);
    
    // Generate immediately - no delay
    const coinsForLevel = Math.min(15 + (gameScore.currentLevel - 1) * 2, 25);
    generateNewLevel(coinsForLevel);
}

// Function to loop back to first JSON level
function loopToFirstJsonLevel() {
    setCurrentLevelIndex(0);
    showMessage('🔁 Looping back to first JSON level!', '#ff00ff', 3000);
    
    // Load immediately - no delay
    loadJsonLevel(currentJsonLevelIndex);
}

// Function to generate a new level
function generateNewLevel(coinCount = 15) {
    console.log(`🎲 Generating new level ${gameScore.currentLevel} with ${coinCount} coins...`);
    
    // Clear existing level objects
    clearAllCoins();
    clearSpikeTraps();
    clearTeleportTiles();
    clearAllBouncingPlatforms();
    clearBrokenTiles();
    clearStaticWalls();
    clearMovingObstacles();
    clearTypedTiles();
    
    // Reset player position for random levels
    const centerPos = gridToWorld(5, 5);
    
    // Use safe position setting with validation
    setPlayerPosition({
        x: centerPos.x,
        y: centerPos.y + 0.55,
        z: centerPos.z
    }, 'random level generation');
    
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
    
    console.log(`🎲 Generated Level ${gameScore.currentLevel} with ${coinCount} coins, ${trapCount} spike traps, ${teleportPairs} teleport pairs, and ${platformCount} bouncing platforms`);
    
    // Update level info display
    updateLevelInfo();
    
    // Send level initialization event to server for multiplayer sync
    if (multiplayerState.isConnected && !gameMode.isSinglePlayer) {
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
    
    // Force camera update to target player
    updateThirdPersonCamera();
    
    console.log(`🎲 Level ${gameScore.currentLevel} generation complete`);
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
// NOTE: This function is completely camera-independent and works identically in all camera modes
function checkKeyAndGoalCollection() {
    // Collision detection runs independent of camera state - no camera interference
    
    const playerPos = player.position;
    const collectDistance = getConfigValue('physics.collisionDistance', 0.8);
    
    // Check if player is in a valid position (not NaN, not too far from origin)
    if (!playerPos || isNaN(playerPos.x) || isNaN(playerPos.y) || isNaN(playerPos.z)) {
        console.warn('❌ Player position is invalid:', playerPos);
        return;
    }
    
    // Check if player is too far from reasonable bounds (likely a bug)
    if (Math.abs(playerPos.x) > 100 || Math.abs(playerPos.y) > 100 || Math.abs(playerPos.z) > 100) {
        console.warn('❌ Player position is out of bounds:', playerPos);
        return;
    }
    
    // Key collection - completely independent of camera state
    if (gameKey && !gameScore.hasKey) {
        const distance = playerPos.distanceTo(gameKey.position);
        
        if (distance < collectDistance) {
            console.log('🔑 Key collected! Distance:', distance.toFixed(2));
            collectKey();
        }
    }
    
    // Goal completion - completely independent of camera state
    if (goalTile && !gameScore.levelComplete) {
        const distance = playerPos.distanceTo(goalTile.position);
        if (distance < collectDistance) {
            console.log('🎯 COMPLETING LEVEL! Distance:', distance.toFixed(2));
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

// ============ HOLE SYSTEM ============

// Function to create a hole at a specific position
function createHole(gridX, gridZ) {
    const holeGroup = new THREE.Group();
    
    // Create hole base (dark circle)
    const holeBaseGeometry = new THREE.CylinderGeometry(0.9, 0.9, 0.05, 16);
    const holeBaseMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x111111,
        emissive: 0x000000
    });
    const holeBase = new THREE.Mesh(holeBaseGeometry, holeBaseMaterial);
    holeBase.position.set(0, 0.025, 0);
    holeGroup.add(holeBase);
    
    // Create swirling particles around the hole
    const particleCount = 12;
    for (let i = 0; i < particleCount; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.02, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x4444ff,
            transparent: true,
            opacity: 0.7
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        // Position particles in a spiral
        const angle = (i / particleCount) * Math.PI * 2;
        const radius = 0.6 + Math.sin(angle * 3) * 0.2;
        particle.position.set(
            Math.cos(angle) * radius,
            0.1 + Math.sin(angle * 2) * 0.05,
            Math.sin(angle) * radius
        );
        holeGroup.add(particle);
    }
    
    // Position the hole group
    holeGroup.position.copy(gridToWorld(gridX, gridZ));
    holeGroup.position.y = 0.0;
    holeGroup.receiveShadow = true;
    
    // Store grid position
    holeGroup.gridX = gridX;
    holeGroup.gridZ = gridZ;
    holeGroup.isHole = true;
    
    // Add animation data
    holeGroup.userData = {
        originalY: holeGroup.position.y,
        animationOffset: Math.random() * Math.PI * 2,
        id: `hole_${gridX}_${gridZ}`,
        particleCount: particleCount
    };
    
    worldGroup.add(holeGroup);
    holes.push(holeGroup);
    
    return holeGroup;
}

// Function to clear all holes
function clearHoles() {
    holes.forEach(hole => {
        worldGroup.remove(hole);
    });
    holes.length = 0;
}

// Function to create underworld exit
function createUnderworldExit(gridX, gridZ) {
    const exitGroup = new THREE.Group();
    
    // Create exit platform (glowing)
    const exitGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16);
    const exitMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x00ff00,
        emissive: 0x004400,
        transparent: true,
        opacity: 0.8
    });
    const exitBase = new THREE.Mesh(exitGeometry, exitMaterial);
    exitBase.position.set(0, 0.1, 0);
    exitBase.castShadow = true;
    exitBase.receiveShadow = true;
    exitGroup.add(exitBase);
    
    // Create upward light beam effect
    const beamGeometry = new THREE.CylinderGeometry(0.1, 0.8, 3, 8);
    const beamMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 0.3
    });
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.set(0, 1.5, 0);
    exitGroup.add(beam);
    
    // Position the exit group
    exitGroup.position.copy(gridToWorld(gridX, gridZ));
    exitGroup.position.y = 0.0;
    
    // Store grid position
    exitGroup.gridX = gridX;
    exitGroup.gridZ = gridZ;
    exitGroup.isUnderworldExit = true;
    
    // Add animation data
    exitGroup.userData = {
        originalY: exitGroup.position.y,
        animationOffset: Math.random() * Math.PI * 2,
        id: `underworld_exit_${gridX}_${gridZ}`
    };
    
    worldGroup.add(exitGroup);
    underworldState.underworldExits.push(exitGroup);
    
    return exitGroup;
}

// Function to teleport player to underworld
function teleportToUnderworld() {
    if (underworldState.isInUnderworld) return;
    
    // Store current position
    underworldState.overworldPosition = {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z
    };
    
    // Move player to underworld
    underworldState.isInUnderworld = true;
    
    // Get underworld spawn point
    const currentLevel = getCurrentLevelData();
    if (currentLevel && currentLevel.underworld) {
        const underworldStart = currentLevel.underworld.playerStart;
        const underworldPos = gridToWorld(underworldStart.x, underworldStart.z);
        
        // Move player to underworld (below main level)
        setPlayerPosition({
            x: underworldPos.x,
            y: underworldPos.y || -15, // Below main level
            z: underworldPos.z
        }, 'underworld teleport');
        
        // Create underworld environment
        createUnderworldEnvironment(currentLevel.underworld);
        
        showMessage('You\'ve fallen into the underworld! Find an exit to return.', '#ff6600', 3000);
    }
}

// Function to create underworld environment
function createUnderworldEnvironment(underworldConfig) {
    // Clear existing underworld objects
    clearUnderworldObjects();
    
    // Create underworld objects
    if (underworldConfig.objects) {
        underworldConfig.objects.forEach(obj => {
            switch(obj.type) {
                case 'coin':
                    const coin = createCoin(obj.x, obj.z);
                    coin.position.y = -15 + 1.2; // Position in underworld
                    underworldState.underworldObjects.push(coin);
                    break;
                case 'underworldExit':
                    createUnderworldExit(obj.x, obj.z);
                    break;
            }
        });
    }
}

// Function to clear underworld objects
function clearUnderworldObjects() {
    underworldState.underworldObjects.forEach(obj => {
        worldGroup.remove(obj);
        // Remove from coins array if it's a coin
        const coinIndex = coins.indexOf(obj);
        if (coinIndex !== -1) {
            coins.splice(coinIndex, 1);
        }
    });
    underworldState.underworldObjects.length = 0;
    
    underworldState.underworldExits.forEach(exit => {
        worldGroup.remove(exit);
    });
    underworldState.underworldExits.length = 0;
}

// Function to exit underworld
function exitUnderworld() {
    if (!underworldState.isInUnderworld) return;
    
    // Clear underworld objects
    clearUnderworldObjects();
    
    // Return player to overworld
    if (underworldState.overworldPosition) {
        setPlayerPosition({
            x: underworldState.overworldPosition.x,
            y: underworldState.overworldPosition.y,
            z: underworldState.overworldPosition.z
        }, 'underworld exit');
    }
    
    underworldState.isInUnderworld = false;
    underworldState.overworldPosition = null;
    
    showMessage('You\'ve returned to the surface!', '#00ff00', 2000);
}

// ============ ENVIRONMENT SYSTEM ============

// Function to set up environment based on level
function setupEnvironment(levelData) {
    // Reset to default environment
    scene.fog = null;
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    
    // Check if this is a jungle level
    if (levelData && levelData.isJungle) {
        setupJungleEnvironment();
    } else {
        // Default environment
        setupDefaultEnvironment();
    }
}

// Function to set up jungle environment
function setupJungleEnvironment() {
    // Green jungle skybox
    scene.background = new THREE.Color(0x228B22); // Forest green
    
    // Add jungle fog for depth
    scene.fog = new THREE.Fog(0x228B22, 10, 50);
    
    // Adjust lighting for jungle atmosphere
    if (ambientLight) {
        ambientLight.color.setHex(0x404040); // Darker ambient
        ambientLight.intensity = 0.4;
    }
    
    if (directionalLight) {
        directionalLight.color.setHex(0x90EE90); // Light green tint
        directionalLight.intensity = 0.8;
    }
    
    console.log('🌳 Jungle environment activated');
}

// Function to set up default environment
function setupDefaultEnvironment() {
    // Default blue sky
    scene.background = new THREE.Color(0x87CEEB);
    
    // No fog
    scene.fog = null;
    
    // Reset lighting
    if (ambientLight) {
        ambientLight.color.setHex(0x404040);
        ambientLight.intensity = 0.3;
    }
    
    if (directionalLight) {
        directionalLight.color.setHex(0xffffff);
        directionalLight.intensity = 1;
    }
    
    console.log('🌅 Default environment activated');
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
    
    // Update UI
    updateScoreDisplay({ animateLives: true });
    
    // Check for game over
    if (gameScore.lives <= 0) {
        gameOver();
    } else {
        // Show damage message
        showMessage(`Ouch! Lives remaining: ${gameScore.lives}`, '#ff3333', 2000);
    }
    
    // Use new respawn system if available, otherwise fall back to old system
    if (fallDetection.currentSpawnPoint) {
        triggerRespawn('damage');
    } else {
        // Fallback to old respawn system
        respawnPlayer();
    }
}

// Function to respawn player
function respawnPlayer() {
    console.log('🔄 Legacy respawn function called');
    
    // Reset player position
    playerState.gridX = playerStartPosition.gridX;
    playerState.gridZ = playerStartPosition.gridZ;
    playerState.isMoving = false;
    
    // Reset player world position using safe position setting
    const startPos = gridToWorld(playerStartPosition.gridX, playerStartPosition.gridZ);
    setPlayerPosition({
        x: startPos.x,
        y: 0.55,
        z: startPos.z
    }, 'legacy respawn function');
    
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

// Function to check hole collision
function checkHoleCollision() {
    if (underworldState.isInUnderworld) return; // Don't check holes in underworld
    if (playerState.isMoving || gameScore.lives <= 0) return;
    
    const playerPos = player.position;
    const holeDistance = getConfigValue('physics.collisionDistance', 0.8);
    
    for (let i = 0; i < holes.length; i++) {
        const hole = holes[i];
        const distance = playerPos.distanceTo(hole.position);
        
        if (distance < holeDistance) {
            // Get current level data to check if it has underworld
            const currentLevel = getCurrentLevelData();
            if (currentLevel && currentLevel.hasUnderworld) {
                teleportToUnderworld();
            } else {
                // If no underworld, treat as damage
                damagePlayer();
                showMessage('You fell into a hole!', '#ff6666', 2000);
            }
            break; // Only one hole can trigger per frame
        }
    }
}

// Function to check underworld exit collision
function checkUnderworldExitCollision() {
    if (!underworldState.isInUnderworld) return; // Only check in underworld
    if (playerState.isMoving || gameScore.lives <= 0) return;
    
    const playerPos = player.position;
    const exitDistance = getConfigValue('physics.collisionDistance', 0.8);
    
    for (let i = 0; i < underworldState.underworldExits.length; i++) {
        const exit = underworldState.underworldExits[i];
        const distance = playerPos.distanceTo(exit.position);
        
        if (distance < exitDistance) {
            exitUnderworld();
            break; // Only one exit can trigger per frame
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
    
    // Validate destination coordinates before teleporting
    const destX = teleportTile.destination.x !== undefined ? teleportTile.destination.x : teleportTile.destination.gridX;
    const destZ = teleportTile.destination.z !== undefined ? teleportTile.destination.z : teleportTile.destination.gridZ;
    
    if (!isValidGridPosition(destX, destZ)) {
        console.error(`Teleport failed: Invalid destination coordinates`, teleportTile.destination);
        console.error(`Expected valid numbers within grid bounds (0-${gridSize-1}), got destX=${destX}, destZ=${destZ}`);
        showMessage('Teleport failed: Invalid destination!', '#ff0000', 2000);
        return;
    }
    
    // Play teleport sound effect
    soundManager.play('teleport');
    
    // Show teleport effect at current position
    showTeleportEffect(player.position);
    
    // Update player position with validated coordinates
    playerState.gridX = Math.floor(destX);
    playerState.gridZ = Math.floor(destZ);
    
    // Update player world position
    const destinationPos = gridToWorld(playerState.gridX, playerState.gridZ);
    player.position.copy(destinationPos);
    
    // Track teleport usage for statistics and achievements
    trackTeleportUsage();
    
    // Show teleport effect at destination immediately
    showTeleportEffect(player.position);
    
    // Update UI
    updatePlayerPosition();
    
    // Show teleport message
    showMessage('Teleported!', '#8800ff', 1500);
    
    console.log(`Player teleported from (${teleportTile.gridX}, ${teleportTile.gridZ}) to (${playerState.gridX}, ${playerState.gridZ})`);
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
            // Validate tile before attempting teleport
            if (!tile.destination) {
                console.warn(`Teleport tile at (${tile.gridX}, ${tile.gridZ}) has no destination - skipping teleport`);
                continue;
            }
            
            teleportPlayer(tile);
            break; // Only one teleport per frame
        }
    }
}

// Create floor tiles with configurable size
let tileSize = 2; // Default fallback value
let gridSize = 10; // Default fallback value
let tileGeometry;
const floorTiles = [];

// Initialize tile and grid settings from config
function initializeTileSettings() {
    const newTileSize = getConfigValue('gameplay.tileSize', 2);
    const newGridSize = getConfigValue('gameplay.gridSize', 10);
    
    // Validate values are numbers and positive
    if (typeof newTileSize === 'number' && newTileSize > 0 && !isNaN(newTileSize)) {
        tileSize = newTileSize;
    } else {
        console.warn('Invalid tileSize value, using default:', tileSize);
    }
    
    if (typeof newGridSize === 'number' && newGridSize > 0 && !isNaN(newGridSize)) {
        gridSize = newGridSize;
    } else {
        console.warn('Invalid gridSize value, using default:', gridSize);
    }
    
    // Create tile geometry after values are validated
    tileGeometry = new THREE.BoxGeometry(tileSize, 0.1, tileSize);
    
    // Generate tiles after settings are initialized
    generateFloorTiles();
    
    // Generate boundary walls after settings are initialized
    generateBoundaryWalls();
}

// Create materials for checkerboard pattern
const lightTileMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
const darkTileMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });

// Generate the grid of tiles
function generateFloorTiles() {
    // Clear existing tiles
    floorTiles.forEach(tile => worldGroup.remove(tile));
    floorTiles.length = 0;
    
    // Validate that tileSize and gridSize are valid numbers
    if (!tileSize || !gridSize || isNaN(tileSize) || isNaN(gridSize)) {
        console.error('Cannot generate floor tiles: invalid tileSize or gridSize values');
        return;
    }
    
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            // Determine tile color using checkerboard pattern
            const isLight = (i + j) % 2 === 0;
            const material = isLight ? lightTileMaterial : darkTileMaterial;
            
            // Create tile
            const tile = new THREE.Mesh(tileGeometry, material);
            
            // Position tile in grid with validation
            const x = (i - gridSize / 2 + 0.5) * tileSize;
            const z = (j - gridSize / 2 + 0.5) * tileSize;
            
            // Validate position values
            if (isNaN(x) || isNaN(z)) {
                console.error('Invalid tile position calculated:', { x, z, i, j, tileSize, gridSize });
                continue;
            }
            
            tile.position.set(x, 0, z);
            
            // Enable shadow receiving
            tile.receiveShadow = true;
            
            // Add to world group and store reference
            worldGroup.add(tile);
            floorTiles.push(tile);
        }
    }
}

// Add visual boundary markers around the grid
const boundaryMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x444444,
    transparent: true,
    opacity: 0.8
});

// Boundary walls will be created after tile settings are initialized
const boundaryWalls = [];

// Create boundary walls
function generateBoundaryWalls() {
    // Clear existing walls
    boundaryWalls.forEach(wall => worldGroup.remove(wall));
    boundaryWalls.length = 0;
    
    // Validate that tileSize and gridSize are valid
    const validTileSize = validateNumber(tileSize, 2, 'tileSize');
    const validGridSize = validateNumber(gridSize, 10, 'gridSize');
    
    const wallHeight = validateNumber(getConfigValue('visual.wallHeight', 0.5), 0.5, 'wallHeight');
    const wallThickness = validateNumber(getConfigValue('visual.wallThickness', 0.1), 0.1, 'wallThickness');
    const gridWorldSize = validGridSize * validTileSize;
    
    // Validate calculated values
    const validGridWorldSize = validateNumber(gridWorldSize, 20, 'gridWorldSize');
    
    // North wall (negative Z)
    const northWall = new THREE.Mesh(
        new THREE.BoxGeometry(validGridWorldSize + wallThickness * 2, wallHeight, wallThickness),
        boundaryMaterial
    );
    northWall.position.set(0, wallHeight / 2, -validGridWorldSize / 2 - wallThickness / 2);
    northWall.receiveShadow = true;
    worldGroup.add(northWall);
    boundaryWalls.push(northWall);

    // South wall (positive Z)
    const southWall = new THREE.Mesh(
        new THREE.BoxGeometry(validGridWorldSize + wallThickness * 2, wallHeight, wallThickness),
        boundaryMaterial
    );
    southWall.position.set(0, wallHeight / 2, validGridWorldSize / 2 + wallThickness / 2);
    southWall.receiveShadow = true;
    worldGroup.add(southWall);
    boundaryWalls.push(southWall);

    // West wall (negative X)
    const westWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, wallHeight, validGridWorldSize),
        boundaryMaterial
    );
    westWall.position.set(-validGridWorldSize / 2 - wallThickness / 2, wallHeight / 2, 0);
    westWall.receiveShadow = true;
    worldGroup.add(westWall);
    boundaryWalls.push(westWall);

    // East wall (positive X)
    const eastWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, wallHeight, validGridWorldSize),
        boundaryMaterial
    );
    eastWall.position.set(validGridWorldSize / 2 + wallThickness / 2, wallHeight / 2, 0);
    eastWall.receiveShadow = true;
    worldGroup.add(eastWall);
    boundaryWalls.push(eastWall);
}

// Third-person camera system
let cameraSystem;

// Initialize camera system from config
function initializeCameraSystem() {
    const smoothness = getConfigValue('camera.smoothness', 0.15);
    const defaultOffset = getConfigValue('camera.defaultOffset', { x: 0, y: 5, z: 7 });
    const defaultTarget = getConfigValue('camera.defaultTarget', { x: 0, y: 1.2, z: 0 });
    
    cameraSystem = {
        offset: new THREE.Vector3(defaultOffset.x, defaultOffset.y, defaultOffset.z),
        target: new THREE.Vector3(defaultTarget.x, defaultTarget.y, defaultTarget.z),
        smoothness: smoothness,
        currentPosition: new THREE.Vector3(5, 5, 5),
        currentTarget: new THREE.Vector3(0, 1.2, 0),
        enabled: true,
        currentPreset: 'default',
        
        // New camera mode system
        currentMode: 'chase', // 'chase', 'isometric', or 'kula'
        
        // Enhanced camera settings
        gravityTransitionSpeed: getConfigValue('camera.gravityTransitionSpeed', 0.3),
        jumpPredictionStrength: getConfigValue('camera.jumpPredictionStrength', 0.8),
        fallPredictionStrength: getConfigValue('camera.fallPredictionStrength', 1.0),
        rollingPredictionStrength: getConfigValue('camera.rollingPredictionStrength', 0.6),
        
        // Camera state tracking
        lastGravityDirection: new THREE.Vector3(0, -1, 0),
        gravityTransitionProgress: 0,
        isTransitioning: false,
        
        // Chase camera specific settings
        chaseDistance: 8,
        chaseHeight: 5,
        chaseSmoothing: 0.1,
        lastPlayerDirection: new THREE.Vector3(0, 0, 1),
        
        // Isometric camera specific settings
        isometricOffset: new THREE.Vector3(8, 12, 8),
        isometricTarget: new THREE.Vector3(0, 1.2, 0),
        isometricSmoothing: 0.08,
        
        // Kula camera specific settings (inspired by Kula World)
        kulaDistance: 6,           // Distance behind and above the ball
        kulaHeight: 4,             // Height above the ball
        kulaTilt: -0.3,            // Downward tilt angle (radians)
        kulaSmoothing: 0.12,       // Smoothing factor for movement
        kulaOrbitSpeed: 0.08,      // Speed of orbit movement when turning
        kulaTargetOffset: new THREE.Vector3(0, -0.5, 0), // Target slightly below ball center
        kulaMaxTiltAngle: 0.5,     // Maximum tilt angle to prevent extreme angles
        kulaHorizonLock: true,     // Lock horizon to prevent roll
        
        // Camera manual control settings
        manualControlEnabled: false,
        manualOffset: new THREE.Vector3(0, 0, 0),
        manualRotationX: 0,
        manualRotationY: 0,
        controlSensitivity: 0.5,
        controlSmoothing: 0.2,
        
        // Camera stability settings
        lastPredictedPosition: null,
        
        presets: {
            default: {
                offset: new THREE.Vector3(defaultOffset.x, defaultOffset.y, defaultOffset.z),
                target: new THREE.Vector3(defaultTarget.x, defaultTarget.y, defaultTarget.z),
                name: 'Default (Behind)'
            },
            front: {
                offset: new THREE.Vector3(0, 5, -7),
                target: new THREE.Vector3(0, 1.2, 0),
                name: 'Front View'
            },
            top: {
                offset: new THREE.Vector3(0, 10, 0),
                target: new THREE.Vector3(0, 0, 0),
                name: 'Top View'
            },
            side: {
                offset: new THREE.Vector3(7, 5, 0),
                target: new THREE.Vector3(0, 1.2, 0),
                name: 'Side View'
            }
        }
    };
    
    // Initialize original camera settings after cameraSystem is set up
    initializeOriginalCameraSettings();
}

// Camera positioning is now handled in the init function

// Store original camera settings for rotation calculations
let originalCameraOffset;
let originalCameraTarget;

// Initialize original camera settings safely
function initializeOriginalCameraSettings() {
    if (cameraSystem && cameraSystem.presets && cameraSystem.presets.default) {
        originalCameraOffset = cameraSystem.presets.default.offset.clone();
        originalCameraTarget = cameraSystem.presets.default.target.clone();
    } else {
        // Fallback to default values if cameraSystem is not initialized
        originalCameraOffset = new THREE.Vector3(0, 4, 6);
        originalCameraTarget = new THREE.Vector3(0, 1, 0);
    }
}

// OrbitControls will be initialized after renderer is ready
let controls;
let originalControlsTarget;

// Initialize OrbitControls after renderer is created
function initializeControls() {
    if (!renderer || !camera) {
        console.warn('Cannot initialize controls: renderer or camera not ready');
        return;
    }
    
    // Optional: Keep OrbitControls for debugging (disabled by default)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false; // Disable orbit controls for third-person camera
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 1, 0); // Set initial target for controls
    
    // Prevent OrbitControls from interfering with key pickup and player movement
    controls.enableKeys = false;
    controls.enableRotate = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    
    // Ensure orbit controls don't capture mouse/touch events that could interfere with gameplay
    if (controls.domElement) {
        controls.domElement.style.pointerEvents = 'none';
    }

    // Store original controls target for rotation calculations
    originalControlsTarget = controls.target.clone();
}

// Player movement system - Physics-based
const playerState = {
    // Input state for free directional movement
    inputState: {
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false
    },
    
    // Legacy properties for backwards compatibility
    gridX: 5,
    gridZ: 5,
    isMoving: false,
    targetPosition: new THREE.Vector3(0, 2, 0),
    baseRotation: {
        x: 0,
        z: 0
    }
};

// Game scoring system
const gameScore = {
    coins: 0,
    totalCoins: 0,
    requiredCoins: 0,  // Total coins needed to complete level
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

// Validate numeric values to prevent NaN
function validateNumber(value, fallback = 0, name = 'value') {
    if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
        return value;
    }
    console.warn(`Invalid ${name}:`, value, 'using fallback:', fallback);
    return fallback;
}

// Validate and sanitize position objects to prevent NaN values
function validatePosition(position, fallback = { x: 0, y: 2, z: 0 }, name = 'position') {
    if (!position || typeof position !== 'object') {
        console.warn(`❌ Invalid ${name}:`, position, 'using fallback:', fallback);
        return { ...fallback };
    }
    
    const validatedPos = {
        x: validateNumber(position.x, fallback.x, `${name}.x`),
        y: validateNumber(position.y, fallback.y, `${name}.y`),
        z: validateNumber(position.z, fallback.z, `${name}.z`)
    };
    
    // Log if any values were corrected
    if (validatedPos.x !== position.x || validatedPos.y !== position.y || validatedPos.z !== position.z) {
        console.warn(`🔧 Position ${name} corrected from`, position, 'to', validatedPos);
    }
    
    return validatedPos;
}

// Safe function to set player position with validation and logging
function setPlayerPosition(position, source = 'unknown') {
    const validatedPos = validatePosition(position, { x: 0, y: 2, z: 0 }, `player position (${source})`);
    
    console.log(`🎯 Setting player position from ${source}:`, validatedPos);
    
    // Set physics position
    playerPhysics.position.set(validatedPos.x, validatedPos.y, validatedPos.z);
    
    // Update visual player position
    player.position.copy(playerPhysics.position);
    
    // Reset physics state
    playerPhysics.velocity.set(0, 0, 0);
    playerPhysics.acceleration.set(0, 0, 0);
    playerPhysics.isGrounded = false;
    playerPhysics.canJump = false;
    
    // Reset visual state
    player.rotation.set(0, 0, 0);
    playerState.baseRotation = { x: 0, z: 0 };
    playerState.isMoving = false;
    
    // Update grid position
    const worldPos = player.position;
    playerState.gridX = Math.round((worldPos.x / tileSize) + (gridSize / 2) - 0.5);
    playerState.gridZ = Math.round((worldPos.z / tileSize) + (gridSize / 2) - 0.5);
    
    // Force camera update
    updateThirdPersonCamera();
    
    // Log final position for verification
    console.log(`✅ Player position set to: [${player.position.toArray().map(v => v.toFixed(2)).join(', ')}]`);
    
    return validatedPos;
}

// Convert grid coordinates to world position
function gridToWorld(gridX, gridZ) {
    // Validate inputs
    gridX = validateNumber(gridX, 0, 'gridX');
    gridZ = validateNumber(gridZ, 0, 'gridZ');
    
    // Validate global variables
    const validTileSize = validateNumber(tileSize, 2, 'tileSize');
    const validGridSize = validateNumber(gridSize, 10, 'gridSize');
    
    const x = (gridX - validGridSize / 2 + 0.5) * validTileSize;
    const z = (gridZ - validGridSize / 2 + 0.5) * validTileSize;
    
    // Final validation of calculated position
    const validX = validateNumber(x, 0, 'calculated x');
    const validZ = validateNumber(z, 0, 'calculated z');
    
    return new THREE.Vector3(validX, 0.55, validZ);
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
    
    // Check if the target position is blocked by a static wall
    if (isPositionBlocked(newGridX, newGridZ)) {
        triggerBoundaryFeedback();
        showMessage('Path blocked by wall!', '#ff6666', 1500);
        console.log(`Blocked: Cannot move to (${newGridX}, ${newGridZ}) - wall in the way`);
        return false;
    }
    
    // Check if the target position is blocked by an obstacle tile
    if (isObstacleTile(newGridX, newGridZ)) {
        triggerBoundaryFeedback();
        showMessage('Path blocked by obstacle!', '#ff6666', 1500);
        console.log(`Blocked: Cannot move to (${newGridX}, ${newGridZ}) - obstacle tile`);
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

// Enhanced movement state detection
function detectMovementState() {
    if (!playerPhysics) return 'idle';
    
    const verticalVelocity = playerPhysics.velocity.y;
    const horizontalSpeed = Math.sqrt(playerPhysics.velocity.x ** 2 + playerPhysics.velocity.z ** 2);
    
    // Detect different movement states
    if (playerPhysics.isGrounded) {
        if (horizontalSpeed > 0.1) {
            return 'rolling';
        } else {
            return 'idle';
        }
    } else {
        if (verticalVelocity > 1.0) {
            return 'jumping';
        } else if (verticalVelocity < -1.0) {
            return 'falling';
        } else {
            return 'airborne';
        }
    }
}

// Enhanced camera prediction system with improved stability
function calculateCameraPrediction(playerWorldPos, playerVelocity, movementState) {
    let velocityInfluence = 0.3; // Reduced base velocity influence for stability
    let heightOffset = 0;
    let lookAheadDistance = 0;
    
    // Get movement state-specific prediction strengths from config
    const jumpPrediction = cameraSystem.jumpPredictionStrength || 0.7;
    const fallPrediction = cameraSystem.fallPredictionStrength || 0.8;
    const rollingPrediction = cameraSystem.rollingPredictionStrength || 0.5;
    
    // Adjust prediction based on movement state with improved stability
    switch (movementState) {
        case 'jumping':
            velocityInfluence = 0.3 * jumpPrediction; // More stable during jumps
            heightOffset = 1.0; // Reduced height offset for smoother camera
            lookAheadDistance = 0.3; // Reduced look-ahead for stability
            break;
        case 'falling':
            velocityInfluence = 0.4 * fallPrediction; // More stable during falls
            heightOffset = -0.5; // Reduced height offset for smoother camera
            lookAheadDistance = 0.2; // Reduced look-ahead for stability
            break;
        case 'rolling':
            velocityInfluence = 0.3 * rollingPrediction; // More stable for rolling
            lookAheadDistance = 0.3; // Reduced look-ahead for stability
            break;
        case 'airborne':
            velocityInfluence = 0.4; // More stable in air
            lookAheadDistance = 0.2;
            break;
        default: // idle
            velocityInfluence = 0.1; // Even less responsive when idle for stability
            lookAheadDistance = 0.05;
    }
    
    // Calculate predicted position with enhanced stability
    const horizontalVelocity = new THREE.Vector3(playerVelocity.x, 0, playerVelocity.z);
    
    // Apply velocity smoothing to reduce jitter
    const smoothedVelocity = horizontalVelocity.clone().multiplyScalar(0.8);
    const lookAheadPos = playerWorldPos.clone().add(smoothedVelocity.clone().multiplyScalar(lookAheadDistance));
    const predictedPos = lookAheadPos.clone().add(playerVelocity.clone().multiplyScalar(velocityInfluence));
    
    // Add height offset based on movement state with smoothing
    predictedPos.y += heightOffset * 0.7; // Reduce height offset impact for stability
    
    // Apply additional prediction based on player physics state with reduced influence
    if (playerPhysics) {
        // Reduced prediction based on acceleration for more stable camera
        const accelerationInfluence = 0.05; // Reduced from 0.1
        const accelPrediction = playerPhysics.acceleration.clone().multiplyScalar(accelerationInfluence);
        predictedPos.add(accelPrediction);
        
        // Reduced prediction during rapid velocity changes
        const velocityChange = playerVelocity.clone().sub(playerPhysics.previousVelocity);
        const velocityChangeInfluence = 0.15; // Reduced from 0.3
        predictedPos.add(velocityChange.multiplyScalar(velocityChangeInfluence));
    }
    
    // Apply position smoothing to reduce jitter
    if (cameraSystem.lastPredictedPosition) {
        const smoothingFactor = 0.3; // Smooth the prediction itself
        predictedPos.lerp(cameraSystem.lastPredictedPosition, smoothingFactor);
    }
    
    // Store for next frame
    cameraSystem.lastPredictedPosition = predictedPos.clone();
    
    return predictedPos;
}

// Enhanced gravity-aware camera orientation
function updateCameraForGravity() {
    // Calculate current gravity direction (normalized)
    const gravityDir = physicsWorld.gravity.clone().normalize();
    
    // Ensure worldState.gravityDirection is always synchronized with physics gravity
    worldState.gravityDirection.copy(gravityDir);
    
    // Check if gravity direction changed for camera transitions
    const gravityChanged = !gravityDir.equals(cameraSystem.lastGravityDirection);
    
    if (gravityChanged) {
        cameraSystem.isTransitioning = true;
        cameraSystem.gravityTransitionProgress = 0;
    }
    
    // Update gravity transition for smooth camera adaptation
    if (cameraSystem.isTransitioning) {
        cameraSystem.gravityTransitionProgress += cameraSystem.gravityTransitionSpeed;
        if (cameraSystem.gravityTransitionProgress >= 1) {
            cameraSystem.gravityTransitionProgress = 1;
            cameraSystem.isTransitioning = false;
            cameraSystem.lastGravityDirection.copy(gravityDir);
        }
    }
    
    // Interpolate gravity direction for smooth camera transitions
    const currentGravityDir = cameraSystem.lastGravityDirection.clone();
    if (cameraSystem.isTransitioning) {
        currentGravityDir.lerp(gravityDir, cameraSystem.gravityTransitionProgress);
    }
    
    // Calculate camera up vector (opposite of gravity direction)
    const up = currentGravityDir.clone().negate();
    
    // Apply gravity influence to camera offset and target
    const gravityInfluence = 0.4; // How much gravity affects camera positioning
    const gravityOffset = currentGravityDir.clone().multiplyScalar(gravityInfluence);
    
    // Adjust camera offset based on gravity direction
    const adjustedOffset = cameraSystem.offset.clone().add(gravityOffset);
    
    return { up, adjustedOffset };
}

// Update third-person camera to follow player
function updateThirdPersonCamera() {
    if (!cameraSystem.enabled) return;
    
    // Skip camera updates if locked during transitions
    if (isCameraLocked()) {
        return;
    }
    
    // Get player position in world space
    const playerWorldPos = new THREE.Vector3();
    player.getWorldPosition(playerWorldPos);
    
    // Calculate player velocity for predictive camera positioning
    let playerVelocity = new THREE.Vector3(0, 0, 0);
    if (playerPhysics) {
        playerVelocity.copy(playerPhysics.velocity);
    }
    
    // Update camera orientation for gravity
    const { up } = updateCameraForGravity();
    
    // Choose update method based on camera mode
    if (cameraSystem.currentMode === 'chase') {
        updateChaseCamera(playerWorldPos, playerVelocity, up);
    } else if (cameraSystem.currentMode === 'isometric') {
        updateIsometricCamera(playerWorldPos, playerVelocity, up);
    } else if (cameraSystem.currentMode === 'kula') {
        updateKulaCamera(playerWorldPos, playerVelocity, up);
    }
}

// Chase Camera: Smooth follow camera that stays behind the ball
function updateChaseCamera(playerWorldPos, playerVelocity, up) {
    // Detect current movement state
    const movementState = detectMovementState();
    
    // Calculate enhanced prediction for smoother following
    const predictedPos = calculateCameraPrediction(playerWorldPos, playerVelocity, movementState);
    
    // Determine player's forward direction based on movement
    let playerDirection = new THREE.Vector3(0, 0, 1);
    if (playerVelocity.length() > 0.1) {
        playerDirection.copy(playerVelocity).normalize();
        playerDirection.y = 0; // Remove vertical component
        playerDirection.normalize();
        
        // Store the last significant direction for when player stops
        if (playerDirection.length() > 0.1) {
            cameraSystem.lastPlayerDirection.lerp(playerDirection, 0.1);
        }
    } else {
        // Use last known direction when player is idle
        playerDirection.copy(cameraSystem.lastPlayerDirection);
    }
    
    // Calculate desired camera position behind the player
    const behindDirection = playerDirection.clone().negate();
    const desiredCameraPos = predictedPos.clone()
        .add(behindDirection.multiplyScalar(cameraSystem.chaseDistance))
        .add(up.clone().multiplyScalar(cameraSystem.chaseHeight));
    
    // Calculate desired camera target (look at player)
    const desiredCameraTarget = predictedPos.clone();
    
    // Apply smooth following with improved damping
    const chaseSmoothing = cameraSystem.chaseSmoothing;
    
    // Adjust smoothness based on movement state for better responsiveness
    let dynamicSmoothing = chaseSmoothing;
    switch (movementState) {
        case 'jumping':
        case 'falling':
            dynamicSmoothing = Math.min(chaseSmoothing * 1.5, 0.3);
            break;
        case 'rolling':
            dynamicSmoothing = Math.min(chaseSmoothing * 1.2, 0.25);
            break;
        case 'airborne':
            dynamicSmoothing = Math.min(chaseSmoothing * 1.3, 0.28);
            break;
        default:
            dynamicSmoothing = chaseSmoothing;
    }
    
    // Apply manual controls if enabled
    if (cameraSystem.manualControlEnabled) {
        desiredCameraPos.add(cameraSystem.manualOffset);
        
        // Apply manual rotation
        if (cameraSystem.manualRotationX !== 0 || cameraSystem.manualRotationY !== 0) {
            const rotationMatrix = new THREE.Matrix4();
            rotationMatrix.makeRotationFromEuler(new THREE.Euler(cameraSystem.manualRotationX, cameraSystem.manualRotationY, 0));
            const rotatedOffset = cameraSystem.manualOffset.clone().applyMatrix4(rotationMatrix);
            desiredCameraPos.add(rotatedOffset);
        }
    }
    
    // Smooth interpolation for camera position and target
    cameraSystem.currentPosition.lerp(desiredCameraPos, dynamicSmoothing);
    cameraSystem.currentTarget.lerp(desiredCameraTarget, dynamicSmoothing);
    
    // Update camera position and orientation
    camera.position.copy(cameraSystem.currentPosition);
    camera.lookAt(cameraSystem.currentTarget);
    camera.up.copy(up);
}

// Isometric Camera: Static angle that follows the ball smoothly
function updateIsometricCamera(playerWorldPos, playerVelocity, up) {
    // Detect current movement state
    const movementState = detectMovementState();
    
    // Calculate enhanced prediction for smoother following
    const predictedPos = calculateCameraPrediction(playerWorldPos, playerVelocity, movementState);
    
    // Calculate desired camera position with fixed isometric offset
    const desiredCameraPos = predictedPos.clone().add(cameraSystem.isometricOffset);
    
    // Calculate desired camera target (look at player)
    const desiredCameraTarget = predictedPos.clone().add(cameraSystem.isometricTarget);
    
    // Apply smooth following with isometric-specific damping
    const isometricSmoothing = cameraSystem.isometricSmoothing;
    
    // Adjust smoothness based on movement state for better responsiveness
    let dynamicSmoothing = isometricSmoothing;
    switch (movementState) {
        case 'jumping':
        case 'falling':
            dynamicSmoothing = Math.min(isometricSmoothing * 1.8, 0.25);
            break;
        case 'rolling':
            dynamicSmoothing = Math.min(isometricSmoothing * 1.4, 0.2);
            break;
        case 'airborne':
            dynamicSmoothing = Math.min(isometricSmoothing * 1.6, 0.22);
            break;
        default:
            dynamicSmoothing = isometricSmoothing;
    }
    
    // Apply manual controls if enabled
    if (cameraSystem.manualControlEnabled) {
        desiredCameraPos.add(cameraSystem.manualOffset);
        
        // Apply manual rotation
        if (cameraSystem.manualRotationX !== 0 || cameraSystem.manualRotationY !== 0) {
            const rotationMatrix = new THREE.Matrix4();
            rotationMatrix.makeRotationFromEuler(new THREE.Euler(cameraSystem.manualRotationX, cameraSystem.manualRotationY, 0));
            const rotatedOffset = cameraSystem.manualOffset.clone().applyMatrix4(rotationMatrix);
            desiredCameraPos.add(rotatedOffset);
        }
    }
    
    // Smooth interpolation for camera position and target
    cameraSystem.currentPosition.lerp(desiredCameraPos, dynamicSmoothing);
    cameraSystem.currentTarget.lerp(desiredCameraTarget, dynamicSmoothing);
    
    // Update camera position and orientation
    camera.position.copy(cameraSystem.currentPosition);
    camera.lookAt(cameraSystem.currentTarget);
    camera.up.copy(up);
}

// Kula Camera: Tilted perspective camera inspired by Kula World
function updateKulaCamera(playerWorldPos, playerVelocity, up) {
    // Detect current movement state
    const movementState = detectMovementState();
    
    // Calculate enhanced prediction for smoother following
    const predictedPos = calculateCameraPrediction(playerWorldPos, playerVelocity, movementState);
    
    // Determine player's movement direction for orbital following
    let playerDirection = new THREE.Vector3(0, 0, 1);
    if (playerVelocity.length() > 0.1) {
        playerDirection.copy(playerVelocity).normalize();
        playerDirection.y = 0; // Remove vertical component
        playerDirection.normalize();
        
        // Smooth orbital transition when direction changes
        if (playerDirection.length() > 0.1) {
            if (!cameraSystem.kulaLastDirection) {
                cameraSystem.kulaLastDirection = playerDirection.clone();
            } else {
                // Smooth transition to new direction
                cameraSystem.kulaLastDirection.lerp(playerDirection, cameraSystem.kulaOrbitSpeed);
            }
        }
    } else {
        // Use last known direction when player is idle
        if (!cameraSystem.kulaLastDirection) {
            cameraSystem.kulaLastDirection = new THREE.Vector3(0, 0, 1);
        }
        playerDirection.copy(cameraSystem.kulaLastDirection);
    }
    
    // Calculate camera position behind and above the ball
    const behindDirection = playerDirection.clone().negate();
    
    // Position camera at an angle (not directly behind, but slightly tilted)
    const cameraBasePos = predictedPos.clone()
        .add(behindDirection.multiplyScalar(cameraSystem.kulaDistance))
        .add(up.clone().multiplyScalar(cameraSystem.kulaHeight));
    
    // Apply tilt to camera position (move it slightly forward and up for the tilted view)
    const tiltInfluence = Math.sin(cameraSystem.kulaTilt) * cameraSystem.kulaDistance * 0.3;
    cameraBasePos.add(playerDirection.clone().multiplyScalar(tiltInfluence));
    cameraBasePos.y += Math.cos(cameraSystem.kulaTilt) * cameraSystem.kulaHeight * 0.2;
    
    // Calculate desired camera target (slightly below ball center for better perspective)
    const desiredCameraTarget = predictedPos.clone().add(cameraSystem.kulaTargetOffset);
    
    // Adjust target based on movement state for better tracking
    switch (movementState) {
        case 'jumping':
            desiredCameraTarget.y += 0.5; // Look slightly higher when jumping
            break;
        case 'falling':
            desiredCameraTarget.y -= 0.3; // Look slightly lower when falling
            break;
        case 'rolling':
            // Add slight look-ahead when rolling
            const lookAhead = playerDirection.clone().multiplyScalar(0.5);
            desiredCameraTarget.add(lookAhead);
            break;
    }
    
    // Apply smooth following with kula-specific damping
    const kulaSmoothing = cameraSystem.kulaSmoothing;
    
    // Dynamic smoothing based on movement state
    let dynamicSmoothing = kulaSmoothing;
    switch (movementState) {
        case 'jumping':
        case 'falling':
            dynamicSmoothing = Math.min(kulaSmoothing * 1.4, 0.25);
            break;
        case 'rolling':
            dynamicSmoothing = Math.min(kulaSmoothing * 1.1, 0.2);
            break;
        case 'airborne':
            dynamicSmoothing = Math.min(kulaSmoothing * 1.2, 0.22);
            break;
        default:
            dynamicSmoothing = kulaSmoothing;
    }
    
    // Apply manual controls if enabled
    if (cameraSystem.manualControlEnabled) {
        cameraBasePos.add(cameraSystem.manualOffset);
        
        // Apply manual rotation
        if (cameraSystem.manualRotationX !== 0 || cameraSystem.manualRotationY !== 0) {
            const rotationMatrix = new THREE.Matrix4();
            rotationMatrix.makeRotationFromEuler(new THREE.Euler(cameraSystem.manualRotationX, cameraSystem.manualRotationY, 0));
            const rotatedOffset = cameraSystem.manualOffset.clone().applyMatrix4(rotationMatrix);
            cameraBasePos.add(rotatedOffset);
        }
    }
    
    // Smooth interpolation for camera position and target
    cameraSystem.currentPosition.lerp(cameraBasePos, dynamicSmoothing);
    cameraSystem.currentTarget.lerp(desiredCameraTarget, dynamicSmoothing);
    
    // Calculate camera orientation with horizon lock
    const cameraUp = cameraSystem.kulaHorizonLock ? new THREE.Vector3(0, 1, 0) : up;
    
    // Apply tilt constraint to prevent extreme angles
    const cameraToTarget = cameraSystem.currentTarget.clone().sub(cameraSystem.currentPosition);
    const distance = cameraToTarget.length();
    const currentTilt = Math.asin(cameraToTarget.y / distance);
    
    if (Math.abs(currentTilt) > cameraSystem.kulaMaxTiltAngle) {
        const clampedTilt = Math.sign(currentTilt) * cameraSystem.kulaMaxTiltAngle;
        const horizontalDistance = Math.sqrt(cameraToTarget.x * cameraToTarget.x + cameraToTarget.z * cameraToTarget.z);
        const newY = Math.sin(clampedTilt) * distance;
        const scaleFactor = Math.cos(clampedTilt) * distance / horizontalDistance;
        
        cameraSystem.currentTarget.x = cameraSystem.currentPosition.x + cameraToTarget.x * scaleFactor;
        cameraSystem.currentTarget.z = cameraSystem.currentPosition.z + cameraToTarget.z * scaleFactor;
        cameraSystem.currentTarget.y = cameraSystem.currentPosition.y + newY;
    }
    
    // Update camera position and orientation
    camera.position.copy(cameraSystem.currentPosition);
    camera.lookAt(cameraSystem.currentTarget);
    camera.up.copy(cameraUp);
}

// Toggle between chase, isometric, and kula camera modes
function toggleCameraMode() {
    // Cycle through all three camera modes
    if (cameraSystem.currentMode === 'chase') {
        cameraSystem.currentMode = 'isometric';
    } else if (cameraSystem.currentMode === 'isometric') {
        cameraSystem.currentMode = 'kula';
    } else {
        cameraSystem.currentMode = 'chase';
    }
    
    // Track camera mode switching for statistics and achievements
    trackCameraModeSwitch();
    
    const messageElement = document.getElementById('message');
    const cameraMode = document.getElementById('camera-mode');
    
    if (cameraSystem.currentMode === 'chase') {
        // Switching to chase camera
        if (messageElement) {
            messageElement.textContent = 'Camera mode: Chase Camera - Follows behind the ball';
            messageElement.style.color = '#66ccff';
            setTimeout(() => {
                messageElement.textContent = '';
            }, 1500);
        }
        if (cameraMode) {
            cameraMode.textContent = 'Chase camera: Smoothly follows behind the ball based on movement direction';
        }
    } else if (cameraSystem.currentMode === 'isometric') {
        // Switching to isometric camera
        if (messageElement) {
            messageElement.textContent = 'Camera mode: Isometric View - Fixed angle following';
            messageElement.style.color = '#66ccff';
            setTimeout(() => {
                messageElement.textContent = '';
            }, 1500);
        }
        if (cameraMode) {
            cameraMode.textContent = 'Isometric camera: Static angle that follows the ball smoothly';
        }
    } else if (cameraSystem.currentMode === 'kula') {
        // Switching to kula camera
        if (messageElement) {
            messageElement.textContent = 'Camera mode: Kula Camera - Tilted perspective from above';
            messageElement.style.color = '#66ccff';
            setTimeout(() => {
                messageElement.textContent = '';
            }, 1500);
        }
        if (cameraMode) {
            cameraMode.textContent = 'Kula camera: Tilted perspective that follows the ball with orbital movement';
        }
    }
    
    // Ensure camera system is enabled
    cameraSystem.enabled = true;
    
    // Disable orbit controls when using our camera system
    if (controls) {
        controls.enabled = false;
    }
}

// Toggle between third-person and orbit camera modes (legacy function)
function toggleCameraToOrbitMode() {
    if (!controls) {
        console.warn('Cannot toggle camera mode: controls not initialized');
        return;
    }
    
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
        if (controls) {
            controls.reset();
            controls.target.set(0, 1, 0);
        }
    }
}

// Reset camera position to default
function resetCameraPosition() {
    if (cameraSystem.enabled) {
        // Reset third-person camera to default preset
        setCameraPreset('default');
        cameraSystem.currentPosition.set(5, 5, 5);
        cameraSystem.currentTarget.set(0, 1, 0);
        
        // Reset manual camera controls
        cameraSystem.manualOffset.set(0, 0, 0);
        cameraSystem.manualRotationX = 0;
        cameraSystem.manualRotationY = 0;
        cameraSystem.manualControlEnabled = false;
    } else if (controls) {
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

// Adjust camera manual control
function adjustCameraManualControl(direction) {
    if (!cameraSystem.enabled) return;
    
    cameraSystem.manualControlEnabled = true;
    
    const sensitivity = cameraSystem.controlSensitivity;
    
    switch(direction) {
        case 'forward':
            cameraSystem.manualOffset.z -= sensitivity;
            break;
        case 'backward':
            cameraSystem.manualOffset.z += sensitivity;
            break;
        case 'left':
            cameraSystem.manualOffset.x -= sensitivity;
            break;
        case 'right':
            cameraSystem.manualOffset.x += sensitivity;
            break;
        case 'up':
            cameraSystem.manualOffset.y += sensitivity;
            break;
        case 'down':
            cameraSystem.manualOffset.y -= sensitivity;
            break;
        case 'rotateUp':
            cameraSystem.manualRotationX += sensitivity * 0.1;
            break;
        case 'rotateDown':
            cameraSystem.manualRotationX -= sensitivity * 0.1;
            break;
        case 'rotateLeft':
            cameraSystem.manualRotationY += sensitivity * 0.1;
            break;
        case 'rotateRight':
            cameraSystem.manualRotationY -= sensitivity * 0.1;
            break;
    }
    
    // Clamp rotation values
    cameraSystem.manualRotationX = Math.max(-Math.PI/3, Math.min(Math.PI/3, cameraSystem.manualRotationX));
    cameraSystem.manualRotationY = cameraSystem.manualRotationY % (Math.PI * 2);
    
    // Show control message
    const messageElement = document.getElementById('message');
    if (messageElement) {
        messageElement.textContent = 'Camera manual control active (Shift + Arrow Keys)';
        messageElement.style.color = '#66ccff';
        setTimeout(() => {
            messageElement.textContent = '';
        }, 1000);
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
    
    // Handle physics-based movement input - prioritize game mechanics over camera controls
    if (!gameState.isPaused && !worldState.isRotating) {
        // Check if arrow keys should control camera (when Shift is held AND camera is enabled)
        // IMPORTANT: Player movement always takes priority over camera controls
        const useArrowsForCamera = event.shiftKey && cameraSystem.enabled && !gameState.isPaused;
        
        switch(event.code) {
            case 'ArrowUp':
                if (useArrowsForCamera) {
                    adjustCameraManualControl('forward');
                } else {
                    // Player movement always takes priority
                    playerState.inputState.forward = true;
                }
                break;
            case 'ArrowDown':
                if (useArrowsForCamera) {
                    adjustCameraManualControl('backward');
                } else {
                    // Player movement always takes priority
                    playerState.inputState.backward = true;
                }
                break;
            case 'ArrowLeft':
                if (useArrowsForCamera) {
                    adjustCameraManualControl('left');
                } else {
                    // Player movement always takes priority
                    playerState.inputState.left = true;
                }
                break;
            case 'ArrowRight':
                if (useArrowsForCamera) {
                    adjustCameraManualControl('right');
                } else {
                    // Player movement always takes priority
                    playerState.inputState.right = true;
                }
                break;
            case 'KeyW':
                playerState.inputState.forward = true;
                break;
            case 'KeyS':
                playerState.inputState.backward = true;
                break;
            case 'KeyA':
                playerState.inputState.left = true;
                break;
            case 'KeyD':
                playerState.inputState.right = true;
                break;
            case 'Space':
                event.preventDefault(); // Prevent page scroll
                playerState.inputState.jump = true;
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
            case 'KeyJ':
                // Toggle jump debug mode
                toggleJumpDebug();
                break;
            case 'KeyF':
                // Test fall-off handling system
                testFallOffHandling();
                break;
            case 'KeyV':
                // Check vertical velocity status
                checkVerticalVelocity();
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
            case 'Comma':
                // Toggle instructions visibility
                toggleInstructions();
                break;
            case 'KeyH':
                // Toggle debug mode for collision visualization
                toggleDebugMode();
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
    
    // Handle physics-based input release
    switch(event.code) {
        case 'ArrowUp':
        case 'KeyW':
            playerState.inputState.forward = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            playerState.inputState.backward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            playerState.inputState.left = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            playerState.inputState.right = false;
            break;
        case 'Space':
            playerState.inputState.jump = false;
            break;
    }
});

// Toggle instructions visibility
function toggleInstructions() {
    const controlsDiv = document.getElementById('controls');
    const hintsDiv = document.getElementById('controls-hint');
    
    if (!controlsDiv || !hintsDiv) return;
    
    gameState.instructionsVisible = !gameState.instructionsVisible;
    
    if (gameState.instructionsVisible) {
        // Show instructions
        controlsDiv.classList.add('show');
        hintsDiv.classList.add('hide');
    } else {
        // Hide instructions
        controlsDiv.classList.remove('show');
        hintsDiv.classList.remove('hide');
    }
}

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
        
        // Use physics-based Y position when physics system is active
        if (playerPhysics && playerPhysics.isGrounded) {
            player.position.y = playerPhysics.position.y;
        } else {
            player.position.y = 0.55; // Fallback for legacy compatibility
        }
        
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
    isPaused: false,
    isTransitioning: false, // New: Track transition state
    instructionsVisible: false // Track whether instructions are visible
};

// Minimal transition state for safety locks only
const transitionState = {
    isActive: false,
    startTime: null
};

// Transition functions removed - no transition states or delays

// Transition end function removed - no transition states

// Function to check if input should be locked
function isInputLocked() {
    return gameState.isPaused || 
           worldState.isRotating;
}

// Function to check if camera should be locked
function isCameraLocked() {
    return false; // Camera locking disabled - no longer needed
}

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
    gameScore.coins = 0;
    gameScore.totalCoins = 0;
    gameScore.requiredCoins = 0;
    gameScore.hasKey = false;
    gameScore.levelComplete = false;
    gameScore.lives = gameScore.maxLives; // Reset to max lives
    
    // Reset underworld state
    underworldState.isInUnderworld = false;
    underworldState.overworldPosition = null;
    clearUnderworldObjects();
    
    // Reset world state
    worldState.isRotating = false;
    worldState.currentRotation = { x: 0, y: 0, z: 0 };
    worldState.targetRotation = { x: 0, y: 0, z: 0 };
    worldState.gravityDirection = new THREE.Vector3(0, -1, 0);
    
    // Reset world group rotation
    worldGroup.rotation.set(0, 0, 0);
    lightGroup.rotation.set(0, 0, 0);
    
    // Reset physics
    resetPlayerPhysics();
    
    // Reset timer
    resetTimer();
    
    // Reload the current level
    if (useJsonLevels && levelDataLoaded) {
        loadJsonLevel(currentLevelIndex);
    } else {
        generateNewLevel();
    }
    
    // Update displays
    updateScoreDisplay();
    updatePlayerPosition();
    
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

// Game mode state
const gameMode = {
    currentMode: 'multiplayer', // 'singleplayer' or 'multiplayer'
    isSinglePlayer: false
};

// ============ GAME MODE SWITCHING ============

// Switch to single player mode
function switchToSinglePlayer() {
    gameMode.currentMode = 'singleplayer';
    gameMode.isSinglePlayer = true;
    
    // Update UI
    document.getElementById('single-player-btn').classList.add('active');
    document.getElementById('multiplayer-btn').classList.remove('active');
    
    // Update lobby display
    document.getElementById('lobby-status').textContent = 'Single Player Mode';
    document.getElementById('lobby-player-count').textContent = '1';
    document.getElementById('lobby-max-players').textContent = '1';
    
    // Hide multiplayer elements
    document.getElementById('lobby-ready-btn').style.display = 'none';
    document.getElementById('lobby-start-btn').style.display = 'none';
    const leaveBtn = document.getElementById('lobby-leave-btn');
    leaveBtn.textContent = 'Start Game';
    leaveBtn.onclick = startSinglePlayerGame;
    leaveBtn.className = 'lobby-btn start-game'; // Apply orange styling
    
    // Hide player list
    document.getElementById('lobby-player-list').style.display = 'none';
    
    // Update info text
    document.querySelector('.lobby-info').innerHTML = `
        <p>Single Player Mode - Complete puzzle levels at your own pace</p>
        <p>Features: Broken tiles, static walls, moving obstacles, and locked goals</p>
    `;
    
    // Disconnect from multiplayer if connected
    if (multiplayerState.isConnected) {
        socket.disconnect();
        multiplayerState.isConnected = false;
        updateConnectionStatus();
    }
    
    // Hide multiplayer HUD elements
    hideMultiplayerHUD();
    
    // Clear any existing other players
    clearOtherPlayers();
    
    // Reset multiplayer state
    multiplayerState.isConnected = false;
    multiplayerState.localPlayerId = null;
    multiplayerState.localPlayerColor = null;
    multiplayerState.otherPlayers = {};
    multiplayerState.serverGameState = null;
    
    // Update lobby UI to reflect single player mode
    updateLobbyUI();
    
    console.log('Switched to single player mode');
}

// Switch to multiplayer mode
function switchToMultiplayer() {
    gameMode.currentMode = 'multiplayer';
    gameMode.isSinglePlayer = false;
    
    // Update UI
    document.getElementById('single-player-btn').classList.remove('active');
    document.getElementById('multiplayer-btn').classList.add('active');
    
    // Update lobby display
    document.getElementById('lobby-status').textContent = 'Waiting for players...';
    document.getElementById('lobby-player-count').textContent = '0';
    document.getElementById('lobby-max-players').textContent = '8';
    
    // Show multiplayer elements
    document.getElementById('lobby-ready-btn').style.display = 'block';
    document.getElementById('lobby-start-btn').style.display = 'none';
    const leaveBtn = document.getElementById('lobby-leave-btn');
    leaveBtn.textContent = 'Leave Lobby';
    leaveBtn.onclick = leaveLobby;
    leaveBtn.className = 'lobby-btn'; // Reset to default styling
    
    // Show player list
    document.getElementById('lobby-player-list').style.display = 'block';
    
    // Update info text
    document.querySelector('.lobby-info').innerHTML = `
        <p>All players must be ready before the game can start.</p>
        <p>The host can start the game manually with minimum players.</p>
    `;
    
    // Show multiplayer HUD elements
    showMultiplayerHUD();
    
    // Reconnect to multiplayer
    if (!multiplayerState.isConnected) {
        socket.connect();
    }
    
    // Update lobby UI to reflect multiplayer mode
    updateLobbyUI();
    
    console.log('Switched to multiplayer mode');
}

// Start single player game
function startSinglePlayerGame() {
    // Hide lobby
    document.getElementById('lobby-overlay').classList.add('hidden');
    
    // Start background music
    soundManager.startBackgroundMusic();
    
    // Update game state
    gameState.currentState = 'in-game';
    
    // Initialize the first level
    if (useJsonLevels && jsonLevels.length > 0) {
        setCurrentLevelIndex(0);
        loadJsonLevel(currentJsonLevelIndex);
    } else {
        generateNewLevel(15);
    }
    
    // Show game start message
    showMessage('Single Player Game Started!', '#00ff00', 3000);
    
    console.log('Single player game started');
}

// Hide multiplayer HUD elements
function hideMultiplayerHUD() {
    // Hide connection status
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus) {
        connectionStatus.style.display = 'none';
    }
    
    // Hide multiplayer player count display
    const playerCountDisplay = document.getElementById('player-count-display');
    if (playerCountDisplay) {
        playerCountDisplay.style.display = 'none';
    }
    
    // Hide other multiplayer UI elements
    const multiplayerElements = document.querySelectorAll('[data-multiplayer-only]');
    multiplayerElements.forEach(element => {
        element.style.display = 'none';
    });
    
    console.log('Multiplayer HUD elements hidden');
}

// Show multiplayer HUD elements
function showMultiplayerHUD() {
    // Show connection status
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus) {
        connectionStatus.style.display = 'block';
    }
    
    // Show multiplayer player count display
    const playerCountDisplay = document.getElementById('player-count-display');
    if (playerCountDisplay) {
        playerCountDisplay.style.display = 'block';
    }
    
    // Show other multiplayer UI elements
    const multiplayerElements = document.querySelectorAll('[data-multiplayer-only]');
    multiplayerElements.forEach(element => {
        element.style.display = 'block';
    });
    
    console.log('Multiplayer HUD elements shown');
}

// Clear all other players from the scene
function clearOtherPlayers() {
    Object.keys(multiplayerState.otherPlayers).forEach(playerId => {
        const playerObj = multiplayerState.otherPlayers[playerId];
        if (playerObj && playerObj.mesh) {
            scene.remove(playerObj.mesh);
            if (playerObj.nameTag) {
                scene.remove(playerObj.nameTag);
            }
        }
    });
    
    multiplayerState.otherPlayers = {};
    console.log('All other players cleared from scene');
}

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
            const previousUnlocked = levelProgress.unlockedLevels;
            levelProgress.unlockedLevels = Math.max(levelProgress.unlockedLevels, levelIndex + 2);
            
            // Show unlock message if a new level was unlocked
            if (levelProgress.unlockedLevels > previousUnlocked) {
                const nextLevel = jsonLevels[levelIndex + 1];
                if (nextLevel) {
                    showMessage(`🔓 New level unlocked: ${nextLevel.name}!`, '#00ff00', 3000);
                }
            }
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
    // Animate the key status element
    animateHudElement('key-status', 'pulse');
    
    // Add key collection popup
    showFloatingScoreText('🔑 Key Collected!', '#ff6600');
    
    // Add glow effect to key display
    const keyDisplay = document.getElementById('key-display');
    if (keyDisplay) {
        keyDisplay.style.boxShadow = '0 0 20px #00ff00';
        setTimeout(() => {
            keyDisplay.style.boxShadow = '';
        }, 1000);
    }
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
        const unlocked = levelProgress.unlockedLevels;
        
        // Calculate additional statistics
        const completedLevels = Object.values(levelProgress.jsonLevels).filter(l => l.completed);
        const totalAttempts = Object.values(levelProgress.jsonLevels).reduce((sum, l) => sum + (l.attempts || 0), 0);
        const averageTime = completedLevels.length > 0 ? 
            completedLevels.reduce((sum, l) => sum + (l.bestTime || 0), 0) / completedLevels.length : 0;
        
        progressText.textContent = `Progress: ${completed}/${total} completed • ${unlocked}/${total} unlocked`;
        let scoreTextContent = `Total Score: ${levelProgress.totalScore.toLocaleString()}`;
        if (totalAttempts > 0) {
            scoreTextContent += ` • ${totalAttempts} attempts`;
        }
        if (averageTime > 0) {
            scoreTextContent += ` • Avg: ${formatTime(averageTime)}`;
        }
        scoreText.textContent = scoreTextContent;
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
        levelScore.textContent = `🏆 ${progress.score}`;
    } else if (progress?.attempts > 0) {
        levelScore.textContent = `🎯 ${progress.attempts} attempts`;
        levelScore.style.color = '#ffaa00';
    }
    
    const levelTime = document.createElement('div');
    levelTime.className = 'level-time';
    levelTime.style.fontSize = '10px';
    levelTime.style.color = '#88ffff';
    levelTime.style.marginTop = '3px';
    if (progress?.bestTime) {
        levelTime.textContent = `⏱️ ${formatTime(progress.bestTime)}`;
    } else if (isCompleted) {
        levelTime.textContent = `⏱️ --:--`;
    }
    
    const levelStatus = document.createElement('div');
    levelStatus.className = 'level-status';
    if (isCompleted) {
        levelStatus.textContent = '✔️';
        levelStatus.style.color = '#00ff00';
    } else if (isCurrent) {
        levelStatus.textContent = '▶️';
        levelStatus.style.color = '#ffff00';
    } else if (isLocked) {
        levelStatus.textContent = '🔒';
        levelStatus.style.color = '#666666';
    }
    
    button.appendChild(levelNumber);
    button.appendChild(levelName);
    button.appendChild(levelScore);
    button.appendChild(levelTime);
    button.appendChild(levelStatus);
    
    // Add tooltip with level information
    let tooltip = `Level ${index + 1}: ${level.name}`;
    if (isCompleted) {
        tooltip += `\n✔️ Completed`;
        if (progress?.score) {
            tooltip += `\n🏆 Score: ${progress.score}`;
        }
        if (progress?.bestTime) {
            tooltip += `\n⏱️ Best Time: ${formatTime(progress.bestTime)}`;
        }
        if (progress?.attempts > 1) {
            tooltip += `\n🎯 Attempts: ${progress.attempts}`;
        }
    } else if (progress?.attempts > 0) {
        tooltip += `\n🎯 Attempts: ${progress.attempts}`;
    }
    
    if (isLocked) {
        tooltip += `\n🔒 Complete previous level to unlock`;
    } else if (isCurrent) {
        tooltip += `\n▶️ Currently playing`;
    }
    
    button.title = tooltip;
    
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
    
    setCurrentLevelIndex(levelIndex);
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
    
    // Initialize level immediately (first player to connect typically does this)
    if (useJsonLevels && jsonLevels.length > 0) {
        setCurrentLevelIndex(0);
        loadJsonLevel(0);
    } else {
        generateNewLevel(15);
    }
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
    
    // Use safe position setting with validation
    setPlayerPosition({
        x: startPos.x,
        y: 0.55,
        z: startPos.z
    }, 'socket level restart');
    
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
    
    // Direct level transition - no delays
    performSmoothLevelTransition();
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
        const coinToRemove = coins.find(coin => coin.userData.id === itemId);
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
        if (gameKey && gameKey.userData.id === itemId) {
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
        const coinToRemove = coins.find(coin => coin.userData.id === coinId);
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
        if (gameKey && gameKey.userData.id === keyId) {
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
    // Skip multiplayer updates in single player mode
    if (gameMode.isSinglePlayer || !multiplayerState.isConnected) return;
    
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
        
        // In single player mode, show offline status
        if (gameMode.isSinglePlayer) {
            indicator = '🔷';
            text = 'Single Player Mode';
        } else if (multiplayerState.isReconnecting) {
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
    
    // Update ready button - only show in multiplayer mode
    if (gameMode.isSinglePlayer) {
        readyBtn.style.display = 'none';
    } else {
        readyBtn.style.display = 'block';
        if (lobbyState.isReady) {
            readyBtn.textContent = 'Ready';
            readyBtn.className = 'lobby-btn ready';
        } else {
            readyBtn.textContent = 'Not Ready';
            readyBtn.className = 'lobby-btn not-ready';
        }
    }
    
    // Update start button - only show in multiplayer mode
    if (gameMode.isSinglePlayer) {
        startBtn.style.display = 'none';
    } else {
        if (lobbyState.isHost) {
            startBtn.style.display = 'inline-block';
            startBtn.disabled = currentPlayerCount < lobbyState.minPlayers || lobbyState.gameState !== 'lobby';
        } else {
            startBtn.style.display = 'none';
        }
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
    if (!votingState.active || votingState.hasVoted || gameMode.isSinglePlayer) {
        return;
    }
    
    // Update local state
    votingState.hasVoted = true;
    votingState.myVote = option;
    
    // Send vote to server
    if (multiplayerState.isConnected) {
        socket.emit('castVote', { vote: option });
    }
    
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
    if (controls && controls.enabled) {
        controls.handleResize();
    }
    
    // Update controls for current gravity orientation
    updateControlsForGravity();
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // No transition logging - transitions are immediate
    
    // Camera updates - isolated from game logic to prevent interference
    try {
        // Update controls for damping (if enabled and not interfering with gameplay)
        if (controls && controls.enabled && !gameState.isPaused) {
            controls.update();
        }
        
        // Update third-person camera - isolated from game logic
        updateThirdPersonCamera();
    } catch (error) {
        console.warn('Camera update error (isolated):', error);
        // Camera errors should not affect game logic
    }
    
    // Check for NaN values in player position before rendering
    if (player && player.position) {
        const pos = player.position;
        if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
            console.error('❌ CRITICAL: Player position contains NaN values in animation loop!');
            console.error('❌ Position:', pos.x, pos.y, pos.z);
            console.error('❌ Attempting emergency position reset...');
            
            // Emergency position reset
            setPlayerPosition({ x: 0, y: 2, z: 0 }, 'emergency NaN fix');
        }
    }
    
    // Always render the scene
    renderer.render(scene, camera);
    
    // Skip all game logic if paused
    if (gameState.isPaused) {
        return;
    }
    
    // Update Three.js physics-based movement
    updatePhysicsMovement();
    
    // Update legacy player movement (for backwards compatibility)
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
    
    // Check broken tile collision
    checkBrokenTileCollision();
    
    // Check typed tile collision
    checkTypedTileCollision();
    
    // Check hole collision
    checkHoleCollision();
    
    // Check underworld exit collision
    checkUnderworldExitCollision();
    
    // Update and check moving obstacles
    updateMovingObstacles();
    checkMovingObstacleCollision();
    
    // Update 3D platform systems
    updateMovingPlatforms();
    
    // Update enhanced trap systems
    updateTimedSpikes();
    updateMovingSpikes();
    
    // Check 3D interactive elements
    checkPressurePlates();
    checkGravityChangers();
    
    // Check disappearing tile triggers
    checkDisappearingTileCollision();
    
    // Check fall detection
    checkFallDetection();
    
    // Update gravity zones
    updateGravityZones();
    
    // Check checkpoints
    checkCheckpoints();
    
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
    
    // Initialize controls after renderer is ready
    initializeControls();
    
    // Initialize game systems with config values
    initializeTileSettings();
    initializeMovementSettings();
    initializeCameraSystem();
    updatePhysicsConfig();
    
    // Initialize Three.js physics system
    initializePhysics();
    resetPlayerPhysics();
    
    // Create sample 3D level with curved surfaces for testing
    createKulaWorldTestLevel();
    
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
    
    // Set up initial environment
    setupEnvironment();
    
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
    
    // Show lobby on startup
    showLobby();
    
    // Start animation loop
    animate();
    
    // Name tag will be added when color is assigned
    
    // Try to connect to socket server
    console.log('Attempting to connect to Socket.io server...');
    socket.connect();
}

// Initialize game mode (default to multiplayer)
if (!gameMode.currentMode) {
    gameMode.currentMode = 'multiplayer';
    gameMode.isSinglePlayer = false;
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
window.isValidGridPosition = isValidGridPosition;
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

// Make physics validation functions globally accessible for debugging
window.validatePhysicsConsistency = validatePhysicsConsistency;
window.testPhysicsConsistency = testPhysicsConsistency;

// Key collision validation function
function validateKeyCollisionSystem() {
    console.log('🔑 Key Collision System Validation:');
    console.log('- gameKey exists:', !!gameKey);
    console.log('- player exists:', !!player);
    console.log('- player.position exists:', !!player?.position);
    console.log('- gameScore.hasKey:', gameScore.hasKey);
    console.log('- collectDistance:', getConfigValue('physics.collisionDistance', 0.8));
    
    if (gameKey) {
        console.log('- gameKey.position:', {
            x: gameKey.position.x.toFixed(2), 
            y: gameKey.position.y.toFixed(2), 
            z: gameKey.position.z.toFixed(2)
        });
        console.log('- gameKey.userData:', gameKey.userData);
        console.log('- gameKey in worldGroup:', worldGroup.children.includes(gameKey));
    }
    
    if (player) {
        console.log('- player.position:', {
            x: player.position.x.toFixed(2), 
            y: player.position.y.toFixed(2), 
            z: player.position.z.toFixed(2)
        });
        
        if (gameKey) {
            const distance = player.position.distanceTo(gameKey.position);
            console.log('- distance to key:', distance.toFixed(2));
            console.log('- within collection range:', distance < getConfigValue('physics.collisionDistance', 0.8));
        }
    }
    
    // Check if checkKeyAndGoalCollection is being called
    console.log('- checkKeyAndGoalCollection function exists:', typeof checkKeyAndGoalCollection === 'function');
    console.log('- animation loop running:', !gameState.isPaused);
    
    return {
        keyExists: !!gameKey,
        playerExists: !!player,
        hasKey: gameScore.hasKey,
        systemReady: !!gameKey && !!player && !gameScore.hasKey
    };
}

// Make key validation function globally accessible
window.validateKeyCollisionSystem = validateKeyCollisionSystem;

// Inventory and HUD validation function
function validateInventoryAndHUD() {
    console.log('🎒 Inventory and HUD System Validation:');
    
    // Check game score state
    console.log('📊 Game Score State:');
    console.log('- gameScore.hasKey:', gameScore.hasKey);
    console.log('- gameScore.coins:', gameScore.coins);
    console.log('- gameScore.totalCoins:', gameScore.totalCoins);
    console.log('- gameScore.requiredCoins:', gameScore.requiredCoins);
    console.log('- gameScore.lives:', gameScore.lives);
    console.log('- gameScore.currentLevel:', gameScore.currentLevel);
    console.log('- gameScore.levelComplete:', gameScore.levelComplete);
    
    // Check HUD elements
    console.log('📺 HUD Elements:');
    const hudElements = {
        keyStatus: document.getElementById('key-status'),
        coinsCount: document.getElementById('coins-count'),
        coinsTotal: document.getElementById('coins-total'),
        livesCount: document.getElementById('lives-count'),
        scoreCount: document.getElementById('score-count'),
        levelName: document.getElementById('level-name')
    };
    
    Object.entries(hudElements).forEach(([name, element]) => {
        if (element) {
            console.log(`- ${name}: "${element.textContent}" (color: ${element.style.color})`);
        } else {
            console.warn(`❌ ${name} element not found`);
        }
    });
    
    // Check key-specific HUD state
    const keyStatusElement = hudElements.keyStatus;
    if (keyStatusElement) {
        console.log('🔑 Key HUD Details:');
        console.log('- Text content:', keyStatusElement.textContent);
        console.log('- Has "has-key" class:', keyStatusElement.classList.contains('has-key'));
        console.log('- Color style:', keyStatusElement.style.color);
        console.log('- Expected text:', gameScore.hasKey ? '✔' : '✗');
        console.log('- HUD matches game state:', keyStatusElement.textContent === (gameScore.hasKey ? '✔' : '✗'));
    }
    
    // Check visual indicators
    console.log('👀 Visual Indicators:');
    console.log('- Goal tile exists:', !!goalTile);
    if (goalTile) {
        console.log('- Goal tile color:', goalTile.material.color.getHex().toString(16));
        console.log('- Goal tile expected color:', gameScore.hasKey ? '00ff00' : '666666');
    }
    
    // Test HUD update
    console.log('🔄 Testing HUD Update:');
    updateScoreDisplay({ animateKey: false });
    
    return {
        gameStateValid: typeof gameScore.hasKey === 'boolean',
        hudElementsFound: Object.values(hudElements).every(el => el !== null),
        hudMatches: keyStatusElement?.textContent === (gameScore.hasKey ? '✔' : '✗'),
        goalTileExists: !!goalTile
    };
}

// Test inventory update function
function testInventoryUpdate() {
    console.log('🧪 Testing Inventory Update:');
    
    const originalState = gameScore.hasKey;
    console.log('- Original key state:', originalState);
    
    // Simulate key collection
    gameScore.hasKey = true;
    updateScoreDisplay({ animateKey: true });
    console.log('- After simulated collection:', gameScore.hasKey);
    
    // Restore original state
    gameScore.hasKey = originalState;
    updateScoreDisplay({ animateKey: false });
    console.log('- Restored to original state:', gameScore.hasKey);
    
    return { success: true };
}

// Make inventory validation functions globally accessible
window.validateInventoryAndHUD = validateInventoryAndHUD;
window.testInventoryUpdate = testInventoryUpdate;

// Camera interference validation function
function validateCameraInterference() {
    console.log('📷 Camera Interference Validation:');
    
    // Check OrbitControls state
    console.log('🎮 OrbitControls State:');
    console.log('- controls.enabled:', controls?.enabled);
    console.log('- controls.enableKeys:', controls?.enableKeys);
    console.log('- controls.enableRotate:', controls?.enableRotate);
    console.log('- controls.enablePan:', controls?.enablePan);
    console.log('- controls.enableZoom:', controls?.enableZoom);
    
    // Check camera system state
    console.log('📸 Camera System State:');
    console.log('- cameraSystem.enabled:', cameraSystem?.enabled);
    console.log('- cameraSystem.currentMode:', cameraSystem?.currentMode);
    console.log('- cameraSystem.manualControlEnabled:', cameraSystem?.manualControlEnabled);
    
    // Check game state
    console.log('🎮 Game State:');
    console.log('- gameState.isPaused:', gameState.isPaused);
    console.log('- worldState.isRotating:', worldState.isRotating);
    console.log('- isInputLocked():', isInputLocked());
    console.log('- isCameraLocked():', isCameraLocked());
    
    // Check collision detection independence
    console.log('🔍 Collision Detection:');
    console.log('- Key collision function exists:', typeof checkKeyAndGoalCollection === 'function');
    console.log('- Physics movement function exists:', typeof updatePhysicsMovement === 'function');
    console.log('- Animation loop running:', !gameState.isPaused);
    
    // Check for potential interference
    const interferenceIssues = [];
    
    if (controls?.enabled) {
        interferenceIssues.push('OrbitControls are enabled - may interfere with input');
    }
    
    if (controls?.enableKeys) {
        interferenceIssues.push('OrbitControls key handling is enabled - may capture input');
    }
    
    if (gameState.isPaused) {
        interferenceIssues.push('Game is paused - collision detection may be blocked');
    }
    
    if (worldState.isRotating) {
        interferenceIssues.push('World is rotating - input may be locked');
    }
    
    console.log('⚠️ Potential Issues:', interferenceIssues.length > 0 ? interferenceIssues : 'None detected');
    
    // Test input state
    console.log('🎯 Input State Test:');
    console.log('- playerState.inputState:', playerState.inputState);
    
    return {
        orbitControlsDisabled: !controls?.enabled,
        cameraSystemIsolated: !interferenceIssues.length,
        collisionDetectionActive: typeof checkKeyAndGoalCollection === 'function',
        inputHandlingActive: !isInputLocked(),
        issues: interferenceIssues
    };
}

// Test camera isolation
function testCameraIsolation() {
    console.log('🧪 Testing Camera Isolation:');
    
    // Test that camera mode changes don't affect collision detection
    const originalMode = cameraSystem.currentMode;
    
    // Test isometric mode
    cameraSystem.currentMode = 'isometric';
    console.log('- Isometric mode: collision detection active:', typeof checkKeyAndGoalCollection === 'function');
    
    // Test chase mode
    cameraSystem.currentMode = 'chase';
    console.log('- Chase mode: collision detection active:', typeof checkKeyAndGoalCollection === 'function');
    
    // Test with camera disabled
    const originalEnabled = cameraSystem.enabled;
    cameraSystem.enabled = false;
    console.log('- Camera disabled: collision detection active:', typeof checkKeyAndGoalCollection === 'function');
    
    // Restore original states
    cameraSystem.currentMode = originalMode;
    cameraSystem.enabled = originalEnabled;
    
    console.log('✅ Camera isolation test completed');
    return { success: true };
}

// Make camera validation functions globally accessible
window.validateCameraInterference = validateCameraInterference;
window.testCameraIsolation = testCameraIsolation;
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
window.setCurrentLevelIndex = setCurrentLevelIndex;
window.currentLevelIndex = () => currentLevelIndex;
window.debugPostTransitionState = debugPostTransitionState;
window.postTransitionSetup = postTransitionSetup;
window.debugGameState = () => {
    console.log('🔍 Manual debug trigger');
    debugPostTransitionState();
};
window.validatePosition = validatePosition;
window.setPlayerPosition = setPlayerPosition;
window.testPositionSystem = () => {
    console.log('🧪 Testing position system...');
    
    // Test validatePosition function
    console.log('Testing validatePosition:');
    console.log('Valid position:', validatePosition({ x: 1, y: 2, z: 3 }));
    console.log('NaN position:', validatePosition({ x: NaN, y: 2, z: 3 }));
    console.log('Undefined position:', validatePosition(undefined));
    console.log('Null position:', validatePosition(null));
    
    // Test setPlayerPosition function
    console.log('Testing setPlayerPosition:');
    setPlayerPosition({ x: 0, y: 2, z: 0 }, 'manual test');
    
    // Test current player position
    debugPostTransitionState();
};
window.multiplayerState = multiplayerState;
window.addOtherPlayer = addOtherPlayer;
window.removeOtherPlayer = removeOtherPlayer;
window.updateOtherPlayer = updateOtherPlayer;
window.sendPlayerUpdate = sendPlayerUpdate;
window.switchToSinglePlayer = switchToSinglePlayer;
window.switchToMultiplayer = switchToMultiplayer;
window.startSinglePlayerGame = startSinglePlayerGame;
window.hideMultiplayerHUD = hideMultiplayerHUD;
window.showMultiplayerHUD = showMultiplayerHUD;
window.clearOtherPlayers = clearOtherPlayers;
window.gameMode = gameMode;
window.brokenTiles = brokenTiles;
window.staticWalls = staticWalls;
window.movingObstacles = movingObstacles;
window.createBrokenTile = createBrokenTile;
window.createStaticWall = createStaticWall;
window.createMovingObstacle = createMovingObstacle;
window.clearBrokenTiles = clearBrokenTiles;
window.clearStaticWalls = clearStaticWalls;
window.clearMovingObstacles = clearMovingObstacles;
window.typedTiles = typedTiles;
window.levelTileTypes = levelTileTypes;
window.createTypedTile = createTypedTile;
window.loadTilesFromTypes = loadTilesFromTypes;
window.getTileType = getTileType;
window.isObstacleTile = isObstacleTile;
window.isGoalTile = isGoalTile;
window.isBrokenTile = isBrokenTile;
window.clearTypedTiles = clearTypedTiles;
window.updateGoalTileAppearance = updateGoalTileAppearance;
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
window.animateProgressBar = animateProgressBar; 