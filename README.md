# 3D Game Test

A simple browser-based 3D game setup using Vite, Three.js, and Socket.io.

## Features

- ✨ Three.js 3D rendering with a rotating cube
- 🎮 Dual camera system: Dynamic third-person camera with orbit controls fallback
- 🌐 Socket.io client setup for multiplayer functionality
- ⚡ Vite for fast development and building
- 🎯 Enhanced shadows and lighting (directional + point lights)
- 📷 Smart camera system that adapts to gravity shifts and follows player smoothly
- 🏁 10x10 checkerboard floor grid using individual BoxGeometry tiles
- ⚽ Player sphere with realistic rolling animation and physics-based rotation
- 🚧 Visual boundary walls with collision detection and feedback
- 🔄 Gravity shift system - rotate world, camera, and lighting together for consistent gravity shifts
- 🤖 Automatic surface detection - walk into walls to automatically transition to new surfaces
- 🎥 Dynamic third-person camera with smooth following and gravity-aware orientation
- 📐 Multiple camera angle presets (Default, Front, Top, Side) with quick switching
- 💰 Collectible coin system with floating animation, collision detection, and score tracking
- 🔑 Key-and-goal system with locked exit requiring key collection to complete level
- 📈 Progressive level system with automatic transitions and increasing difficulty
- ⚠️ Spike trap hazard system with life system and respawn mechanics
- 🌀 Teleport tile system with instant transportation between linked portals
- 🟢 Bouncing platforms that launch the player to elevated heights with temporary platforms
- 📝 JSON-based level format with predefined layouts, object positions, and gravity anchors

## File Structure

```
3dgametest/
├── main.js           # Main game logic
├── index.html        # Game interface
├── levels.json       # Level data (edit this to create custom levels)
├── package.json      # Dependencies
└── README.md         # This file
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

## Multiplayer Setup

To enable multiplayer functionality:

1. **Start the Socket.io server** (in a separate terminal):
```bash
npm run server
```

2. **Start the game client**:
```bash
npm run dev
```

3. **Open multiple browser tabs/windows** to `http://localhost:5173` to test multiplayer

### Multiplayer Features
- **Real-time Position Sync**: See other players' movements in real-time
- **Unique Player Colors**: Each player gets a randomly assigned color from 12 distinct options
- **Smart Color Management**: Colors are recycled when players disconnect to avoid duplicates
- **Color-coded Name Tags**: Name tags display the player's color name with matching background
- **Connection Status**: Shows connection status and player count in top-left
- **Smooth Movement**: Interpolated movement for better visual experience
- **Automatic Cleanup**: Players are removed when they disconnect

### Available Player Colors
- Red, Blue, Green, Yellow, Purple, Orange, Cyan, Pink, Lime, Teal, Indigo, Coral
- Colors are automatically assigned to prevent duplicates
- When all colors are used, the system resets and starts over

### Server Configuration
- **Default Port**: 3001 (can be changed via PORT environment variable)
- **CORS Enabled**: Allows connections from any origin
- **Player Management**: Tracks all connected players and their positions
- **Event Broadcasting**: Syncs player updates across all clients

## Custom Level Creation

Edit `levels.json` to create custom levels, then use **Shift+R** in-game to reload the data without restarting the server.

## Controls

### Camera System
- **Default**: Third-person camera that follows player smoothly
- **C Key**: Toggle between third-person and orbit camera modes
- **R Key**: Reset camera position to default
- **Number Keys**: Quick camera preset switching (1-4)
- **Tab Key**: Cycle through camera presets

### Timer System
- **Real-time Timer**: Shows current level completion time in MM:SS.MS format
- **Best Time Tracking**: Displays best completion time for each level
- **Time Bonus**: Faster completion earns bonus points (1000 - time*10)
- **New Best Time**: Special message when you achieve a new record
- **Level Menu**: Best times displayed on level selection buttons

### Level System
- **Dynamic JSON Loading**: Level data is loaded from `levels.json` at game start
- **Automatic Progression**: Levels automatically advance when completed
- **Level Selection Menu**: Visual menu with clickable level buttons (ESC key)
- **Progress Tracking**: Persistent progress tracking with localStorage
- **L Key**: Toggle between JSON levels and random generation
- **[ Key**: Previous JSON level (when in JSON mode)
- **] Key**: Next JSON level (when in JSON mode)
- **ESC Key**: Open/close level selection menu
- **Shift+R**: Reload level data from JSON file (hot-reload for development)
- **Built-in JSON levels**: 5 predefined levels with unique layouts and challenges
- **Automatic Mode Selection**: Switches to JSON mode automatically if levels.json loads successfully
- **Completion Choices**: When all JSON levels are completed, choose what to do next:
  - **1 Key**: Restart JSON levels from beginning
  - **2 Key**: Switch to infinite random generation
  - **3 Key**: Loop back to first JSON level
- **Visual Progress Bar**: Shows completion status with animated progress bar
- **Completion Statistics**: Detailed stats when all levels are completed

### Level Menu Features
- **Clickable Level Buttons**: Jump directly to any unlocked level
- **Progress Indicators**: Visual status icons (✓ completed, ▶ current, 🔒 locked)
- **Score Tracking**: Shows best score for each completed level
- **Level Unlocking**: Complete levels to unlock the next ones
- **Mode Switching**: Toggle between JSON levels and random generation
- **Progress Persistence**: All progress is saved to localStorage
- **Reset Progress**: Clear all progress and start over
- **Timer System**: Track completion time for each level
- **Best Time Tracking**: Records and displays best completion times
- **Time Bonus**: Faster completion times earn bonus points

### JSON Level Format
The game dynamically loads level data from `levels.json` at startup. You can modify this file directly and use **Shift+R** to reload the data without restarting the game.

Level structure:
```json
{
    "name": "Level Name",
    "number": 1,
    "gridSize": 10,
    "playerStart": { "x": 5, "z": 5 },
    "tiles": "auto",
    "hasInvertedWorld": true,
    "use3D": true,
    "hasUnderworld": false,
    "objects": [
        { "type": "coin", "x": 3, "z": 3 },
        { "type": "key", "x": 7, "z": 7 },
        { "type": "goal", "x": 9, "z": 9 },
        { "type": "spikeTrap", "x": 4, "z": 6 },
        { "type": "teleporter", "x": 2, "z": 2, "pairId": 1, "destination": { "x": 8, "z": 8 } },
        { "type": "bouncingPlatform", "x": 5, "z": 3 }
    ],
    "gravityAnchors": [
        { "x": 0, "z": 5, "direction": "left" },
        { "x": 9, "z": 5, "direction": "right" }
    ]
}
```
- **Third-person**: Camera follows player with fixed offset, adapts to gravity shifts
- **Orbit Mode**: Left click + drag: Orbit | Right click + drag: Pan | Mouse wheel: Zoom

### Game Controls
- **N Key**: Restart game from level 1
- **M Key**: Cheat code (instantly get key for current level)
- **Space Key**: Manual gravity shift when at grid edge
- **Coin Collection**: Automatic when walking into coins
- **Key Collection**: Automatic when walking into orange key
- **Goal Completion**: Walk into green goal tile (only after collecting key)
- **Spike Hazards**: Avoid red spike traps (causes damage and respawn)
- **Teleport Tiles**: Walk onto purple teleport tiles for instant transportation

### Player Movement
- **Arrow Keys / WASD**: Free-directional physics-based movement with acceleration, friction, and momentum
- **Movement**: Real-time 3D physics using Three.js for realistic ball rolling (Kula World style)
- **Jump Mechanics**: Spacebar applies upward force for jumping between platforms (only when grounded)
- **Physics Simulation**: Custom gravity, collision detection, and momentum-based movement
- **Advanced Levels**: Floating platforms, slopes, curves, and 3D puzzle mechanics
- **Camera**: Predictive following with velocity-based smoothness adjustments
- **Coin Collection**: Walk into golden coins to collect them automatically
- **Key Collection**: Walk into orange key to unlock the exit
- **Level Goal**: Collect key, then reach the goal tile to complete the level
- **Spike Avoidance**: Avoid red spike traps that cause damage and respawn
- **Teleport Usage**: Walk onto purple teleport tiles for instant transportation to linked destination

### Fall-Off Handling
- **Basic Levels (1-5)**: Falling off the map restarts the current level
- **Advanced Levels (6+)**: Falling off the map transitions to the inverted world
- **3D Levels**: Levels with `use3D: true` support inverted world transitions
- **Underworld Levels**: Levels with `hasUnderworld: true` support inverted world transitions
- **Explicit Control**: Levels can set `hasInvertedWorld: true/false` to override default behavior

### Automatic Surface Detection
- **Natural Navigation**: Walk into any wall to automatically transition to that surface
- **Intelligent Detection**: System detects movement direction and valid surface transitions
- **Seamless Experience**: No manual input needed - just walk where you want to go
- **Visual Cues**: UI shows when you're at an edge and can transition to a surface

### Manual Gravity Shift System
- **Space Key**: Manual gravity shift when player is at grid edge (legacy feature)
- **Consistent Rotation**: World, camera, and lighting rotate together maintaining orientation
- **Automatic Transition**: Player moves to corresponding position on new gravity-oriented floor
- **Smooth Animation**: 1.5-second gravity shift with ease-in-out easing
- **Edge Detection**: Only works when player is at north, south, east, or west edge
- **Visual Feedback**: UI shows edge position and gravity shift status
- **Camera Adaptation**: Camera "up" vector updates to match new gravity direction

### Dynamic Third-Person Camera
- **Smooth Following**: Camera follows player with configurable smoothness
- **Fixed Offset**: Maintains consistent distance and angle from player
- **Gravity Awareness**: Camera orientation adapts during gravity shifts
- **Natural Movement**: Camera rotates with world during surface transitions
- **Seamless Transitions**: Smooth interpolation between positions and orientations

### Camera Presets
- **1 Key**: Default preset (behind player) - Standard third-person view
- **2 Key**: Front preset (in front of player) - Face-to-face view
- **3 Key**: Top preset (above player) - Top-down view
- **4 Key**: Side preset (beside player) - Side view
- **Tab Key**: Cycle through all presets sequentially
- **Auto-Adapt**: All presets automatically adjust to current gravity orientation

### Collectible Coin System
- **N Key**: Spawn new set of coins (15 coins randomly placed)
- **Automatic Collection**: Walk into coins to collect them (0.8 unit detection radius)
- **Score Tracking**: Real-time score display shows collected/total coins
- **Visual Effects**: Floating animation and collection particle effects
- **Game Completion**: Special message when all coins are collected
- **Coin Properties**: Golden color with emissive glow, shadow casting, and rotation animation

### Key and Goal System
- **Key Object**: Orange cross-shaped key with floating animation and rotation
- **Goal Tile**: Green cylindrical exit tile in opposite corner from player start
- **Locked State**: Goal appears gray and locked until key is collected
- **Unlocked State**: Goal turns green and pulses when key is collected
- **Level Completion**: Walk into unlocked goal to complete the level
- **Key Required**: Cannot finish level without collecting the key first
- **Visual Feedback**: Particle effects for key collection and level completion
- **Status Display**: UI shows key status (✓ collected, ✗ not collected)

### Level Progression System
- **Automatic Transitions**: Completing a level automatically loads the next level
- **Progressive Difficulty**: Each level has more coins (up to 25 maximum)
- **Level Scoring**: Points awarded for coins collected (100 each) and key collection (500)
- **Total Score Tracking**: Cumulative score across all levels
- **Challenge Levels**: Every 3rd level marked as challenge level with special messaging
- **Level Counter**: Current level displayed in UI
- **Seamless Experience**: 3-second transition between levels with status messages

### Spike Trap Hazard System
- **Life System**: Player starts with 3 lives, loses 1 life per spike trap collision
- **Spike Trap Design**: Dark red spikes with menacing animation and emissive glow
- **Progressive Hazards**: More spike traps appear on higher levels (3+ level/2, max 8)
- **Collision Detection**: 0.6 unit radius detection for spike trap activation
- **Damage Response**: Player flashes red, damage particles, and "Ouch!" message
- **Respawn System**: Player respawns at level start position with reset orientation
- **Game Over**: When lives reach 0, displays "Game Over! Press N to restart"
- **Visual Effects**: Damage particles, game over explosion, and color flashing
- **Smart Placement**: Spike traps avoid player start and goal positions

### Teleport Tile System
- **Teleport Pairs**: Tiles are created in linked pairs that transport player between locations
- **Purple Portal Design**: Distinctive purple base with rotating ring and floating particles
- **Progressive Teleports**: More teleport pairs appear on higher levels (1+ level/3, max 3 pairs)
- **Instant Transportation**: Walk onto a teleport tile to instantly appear at its paired destination
- **Collision Detection**: 0.7 unit radius detection for teleport activation
- **Visual Effects**: Swirling particle spiral animation at both teleport source and destination
- **Strategic Placement**: Teleports avoid player start, goal, and spike trap positions
- **Animation**: Floating tiles with rotating rings and orbiting energy particles
- **Feedback**: "Teleported!" message appears when using a teleport tile

## Project Structure

- `index.html` - Main HTML file
- `main.js` - Three.js scene setup and Socket.io client
- `package.json` - Dependencies and scripts

## Socket.io Integration

The Socket.io client is set up but not connected by default. To enable multiplayer features:

1. Set up a Socket.io server on `http://localhost:3000`
2. Uncomment the `socket.connect()` line in `main.js`

## Building

To build for production:
```bash
npm run build
```

The built files will be in the `dist` directory. 