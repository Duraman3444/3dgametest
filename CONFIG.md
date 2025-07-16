# Game Configuration System

The game uses a comprehensive configuration system that allows you to customize various aspects of gameplay, visuals, audio, and performance through the `config.json` file.

## Configuration File Structure

### Gameplay Settings
- **tileSize**: Size of each floor tile (default: 2)
- **gridSize**: Number of tiles per side (default: 10)
- **moveDuration**: Time in seconds for player movement (default: 0.3)
- **rotationDuration**: Time in milliseconds for world rotation (default: 1500)
- **gravityShiftSpeed**: Speed multiplier for gravity shifts (default: 1.5)
- **maxLives**: Maximum number of lives (default: 3)
- **bounceDuration**: Duration of bounce platform animation (default: 1.5)
- **bounceHeight**: Height of bounce platform jump (default: 4)

### Camera Settings
- **smoothness**: Camera smoothing factor 0-1 (default: 0.1)
- **fov**: Field of view in degrees (default: 75)
- **near**: Near clipping plane (default: 0.1)
- **far**: Far clipping plane (default: 1000)
- **defaultOffset**: Default camera offset from player {x, y, z}
- **defaultTarget**: Default camera target relative to player {x, y, z}

### Physics Settings
- **collisionDistance**: Distance for item collection (default: 0.8)
- **teleportDistance**: Distance for teleport activation (default: 0.7)
- **trapDistance**: Distance for trap activation (default: 0.6)
- **platformDistance**: Distance for platform activation (default: 0.5)

### Visual Settings
- **animationSpeed**: Speed multiplier for animations (default: 2)
- **particleCount**: Number of particles in effects (default: 30)
- **particleSize**: Size of particle effects (default: 0.1)
- **shadowMapSize**: Shadow map resolution (default: 2048)
- **wallHeight**: Height of boundary walls (default: 0.5)
- **wallThickness**: Thickness of boundary walls (default: 0.1)
- **coinFloatHeight**: Height of coin floating animation (default: 0.1)
- **coinFloatSpeed**: Speed of coin floating animation (default: 2)
- **keyFloatHeight**: Height of key floating animation (default: 0.15)
- **keyFloatSpeed**: Speed of key floating animation (default: 3)
- **goalPulseSpeed**: Speed of goal pulse animation (default: 6)
- **goalPulseAmount**: Amount of goal pulse scaling (default: 0.1)

### Audio Settings
- **masterVolume**: Master volume level 0-1 (default: 0.7)
- **sfxVolume**: Sound effects volume 0-1 (default: 0.8)
- **musicVolume**: Background music volume 0-1 (default: 0.5)
- **soundEnabled**: Enable/disable sound effects (default: true)
- **musicEnabled**: Enable/disable background music (default: true)

### Multiplayer Settings
- **updateThrottle**: Milliseconds between position updates (default: 50)
- **maxReconnectAttempts**: Maximum reconnection attempts (default: 5)
- **reconnectDelay**: Delay between reconnection attempts (default: 2000)
- **maxPlayers**: Maximum players in lobby (default: 8)
- **minPlayers**: Minimum players to start game (default: 1)
- **votingTimeout**: Voting timeout in milliseconds (default: 30000)
- **countdownDuration**: Countdown duration in milliseconds (default: 5000)

### UI Settings
- **messageDisplayDuration**: Message display time in milliseconds (default: 2000)
- **hudUpdateInterval**: HUD update interval in milliseconds (default: 100)
- **animationDuration**: UI animation duration in milliseconds (default: 300)
- **transitionDuration**: Transition duration in milliseconds (default: 500)
- **achievementAnimationDelay**: Delay between achievement animations (default: 0.1)
- **victoryScreenDelay**: Victory screen animation delay (default: 800)

### Performance Settings
- **maxParticles**: Maximum number of particles (default: 100)
- **particleLifetime**: Particle lifetime in milliseconds (default: 2000)
- **shadowQuality**: Shadow quality "low", "medium", "high" (default: "medium")
- **antialiasing**: Enable/disable antialiasing (default: true)
- **enableShadows**: Enable/disable shadows (default: true)
- **renderDistance**: Render distance (default: 50)

### Debug Settings
- **showFPS**: Show FPS counter (default: false)
- **showDebugInfo**: Show debug information (default: false)
- **logLevel**: Logging level "info", "debug", "error" (default: "info")
- **enableConsoleCommands**: Enable console commands (default: false)

## How to Use

1. **Edit config.json**: Modify the values in the config.json file
2. **Reload Configuration**: Press `Ctrl+R` in-game to reload the configuration
3. **Test Settings**: Changes take effect immediately after reload

## Example Configurations

### High Performance Config
```json
{
  "gameplay": {
    "tileSize": 1.5,
    "moveDuration": 0.2,
    "rotationDuration": 1000
  },
  "visual": {
    "particleCount": 15,
    "shadowMapSize": 1024
  },
  "performance": {
    "maxParticles": 50,
    "enableShadows": false,
    "antialiasing": false
  }
}
```

### Cinematic Config
```json
{
  "camera": {
    "smoothness": 0.05,
    "fov": 85,
    "defaultOffset": {"x": 0, "y": 8, "z": 10}
  },
  "visual": {
    "particleCount": 100,
    "shadowMapSize": 4096,
    "goalPulseAmount": 0.2
  },
  "gameplay": {
    "moveDuration": 0.5,
    "rotationDuration": 2500
  }
}
```

### Speedrun Config
```json
{
  "gameplay": {
    "moveDuration": 0.1,
    "rotationDuration": 500
  },
  "camera": {
    "smoothness": 0.3
  },
  "physics": {
    "collisionDistance": 1.0,
    "teleportDistance": 0.8
  }
}
```

## Notes

- All changes require a config reload (Ctrl+R) to take effect
- Invalid values will fallback to defaults
- The game will continue to work even if config.json is missing
- Configuration changes are not saved automatically - edit the file directly
- Some changes may require a full game restart for best results

## Troubleshooting

- **Config not loading**: Check that config.json is valid JSON
- **Values not changing**: Make sure to press Ctrl+R after editing
- **Game not starting**: Check console for configuration errors
- **Performance issues**: Try reducing particle counts and shadow quality

## keyboard Controls

- **Ctrl+R**: Reload configuration from config.json
- **Shift+R**: Reload level data
- **R**: Reset camera position 