import { Howl } from 'howler';

// Sound Manager Class
class SoundManager {
    constructor() {
        this.sounds = {};
        this.isEnabled = true;
        this.masterVolume = 0.7;
        this.sfxVolume = 0.8;
        this.musicVolume = 0.5;
        this.isMusicEnabled = true;
        this.audioContext = null;
        this.backgroundMusic = null;
        this.musicOscillator = null;
        this.musicGainNode = null;
        this.isPlayingMusic = false;
        
        this.init();
    }
    
    // Update sound settings from config
    updateFromConfig(config) {
        if (config && config.audio) {
            this.masterVolume = config.audio.masterVolume || 0.7;
            this.sfxVolume = config.audio.sfxVolume || 0.8;
            this.musicVolume = config.audio.musicVolume || 0.5;
            this.isEnabled = config.audio.soundEnabled !== false;
            this.isMusicEnabled = config.audio.musicEnabled !== false;
            
            // Update UI elements if they exist
            const toggleSound = document.getElementById('toggle-sound');
            if (toggleSound) {
                toggleSound.textContent = `Sound: ${this.isEnabled ? 'ON' : 'OFF'}`;
                toggleSound.style.background = this.isEnabled ? '#333' : '#666';
            }
            
            const toggleMusic = document.getElementById('toggle-music');
            if (toggleMusic) {
                toggleMusic.textContent = `Music: ${this.isMusicEnabled ? 'ON' : 'OFF'}`;
                toggleMusic.style.background = this.isMusicEnabled ? '#333' : '#666';
            }
            
            const masterVolumeSlider = document.getElementById('master-volume');
            if (masterVolumeSlider) {
                masterVolumeSlider.value = this.masterVolume * 100;
            }
            
            const sfxVolumeSlider = document.getElementById('sfx-volume');
            if (sfxVolumeSlider) {
                sfxVolumeSlider.value = this.sfxVolume * 100;
            }
            
            const musicVolumeSlider = document.getElementById('music-volume');
            if (musicVolumeSlider) {
                musicVolumeSlider.value = this.musicVolume * 100;
            }
            
            this.updateMusicVolume();
        }
    }
    
    init() {
        // Initialize Web Audio Context for generated sounds
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
        }
        
        // Create sound effects
        this.createSounds();
        
        // Add volume controls to settings
        this.addVolumeControls();
    }
    
    createSounds() {
        // Rolling sound - generated tone
        this.sounds.roll = {
            type: 'generated',
            play: () => this.playGeneratedSound('roll')
        };
        
        // Jump sound - generated tone
        this.sounds.jump = {
            type: 'generated',
            play: () => this.playGeneratedSound('jump')
        };
        
        // Coin pickup sound - generated tone
        this.sounds.coin = {
            type: 'generated',
            play: () => this.playGeneratedSound('coin')
        };
        
        // Key pickup sound - generated tone
        this.sounds.key = {
            type: 'generated',
            play: () => this.playGeneratedSound('key')
        };
        
        // Trap activation sound - generated tone
        this.sounds.trap = {
            type: 'generated',
            play: () => this.playGeneratedSound('trap')
        };
        
        // Teleport sound - generated tone
        this.sounds.teleport = {
            type: 'generated',
            play: () => this.playGeneratedSound('teleport')
        };
        
        // Level complete sound - generated tone
        this.sounds.levelComplete = {
            type: 'generated',
            play: () => this.playGeneratedSound('levelComplete')
        };
        
        // Level failed sound - generated tone
        this.sounds.levelFailed = {
            type: 'generated',
            play: () => this.playGeneratedSound('levelFailed')
        };
        
        // Victory sound - generated tone
        this.sounds.victory = {
            type: 'generated',
            play: () => this.playGeneratedSound('victory')
        };
        
        // Gravity shift sound - generated tone
        this.sounds.gravityShift = {
            type: 'generated',
            play: () => this.playGeneratedSound('gravityShift')
        };
        
        // Achievement sound - generated tone
        this.sounds.achievement = {
            type: 'generated',
            play: () => this.playGeneratedSound('achievement')
        };
        
        // UI sounds
        this.sounds.menuClick = {
            type: 'generated',
            play: () => this.playGeneratedSound('menuClick')
        };
        
        this.sounds.menuHover = {
            type: 'generated',
            play: () => this.playGeneratedSound('menuHover')
        };
        
        // Initialize background music
        this.initializeBackgroundMusic();
    }
    
    initializeBackgroundMusic() {
        if (!this.audioContext) return;
        
        // Create gain node for music volume control
        this.musicGainNode = this.audioContext.createGain();
        this.musicGainNode.connect(this.audioContext.destination);
        this.updateMusicVolume();
    }
    
    createBackgroundMusic() {
        if (!this.audioContext || !this.isMusicEnabled) return;
        
        // Stop existing music
        this.stopBackgroundMusic();
        
        // Create a simple ambient background track using multiple oscillators
        const oscillators = [];
        const gainNodes = [];
        
        // Base drone (low frequency)
        const baseOsc = this.audioContext.createOscillator();
        const baseGain = this.audioContext.createGain();
        baseOsc.type = 'sine';
        baseOsc.frequency.setValueAtTime(55, this.audioContext.currentTime); // A1
        baseGain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        baseOsc.connect(baseGain);
        baseGain.connect(this.musicGainNode);
        oscillators.push(baseOsc);
        gainNodes.push(baseGain);
        
        // Harmonic layer (fifth above)
        const harmOsc = this.audioContext.createOscillator();
        const harmGain = this.audioContext.createGain();
        harmOsc.type = 'sine';
        harmOsc.frequency.setValueAtTime(82.5, this.audioContext.currentTime); // E2
        harmGain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        harmOsc.connect(harmGain);
        harmGain.connect(this.musicGainNode);
        oscillators.push(harmOsc);
        gainNodes.push(harmGain);
        
        // Melodic layer (gentle pulse)
        const melodyOsc = this.audioContext.createOscillator();
        const melodyGain = this.audioContext.createGain();
        melodyOsc.type = 'triangle';
        melodyOsc.frequency.setValueAtTime(220, this.audioContext.currentTime); // A3
        melodyGain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        melodyOsc.connect(melodyGain);
        melodyGain.connect(this.musicGainNode);
        oscillators.push(melodyOsc);
        gainNodes.push(melodyGain);
        
        // Add subtle vibrato to melody
        const lfo = this.audioContext.createOscillator();
        const lfoGain = this.audioContext.createGain();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.5, this.audioContext.currentTime);
        lfoGain.gain.setValueAtTime(5, this.audioContext.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(melodyOsc.frequency);
        lfo.start();
        
        // Start all oscillators
        oscillators.forEach(osc => osc.start());
        
        // Store references for cleanup
        this.musicOscillator = {
            oscillators: oscillators,
            gainNodes: gainNodes,
            lfo: lfo,
            lfoGain: lfoGain
        };
        
        this.isPlayingMusic = true;
        
        // Create gentle volume pulsing for ambient effect
        this.createMusicPulse();
    }
    
    createMusicPulse() {
        if (!this.isPlayingMusic || !this.musicOscillator) return;
        
        const pulseInterval = setInterval(() => {
            if (!this.isPlayingMusic || !this.musicOscillator) {
                clearInterval(pulseInterval);
                return;
            }
            
            // Gentle volume pulse over 8 seconds
            const currentTime = this.audioContext.currentTime;
            const baseVolume = this.masterVolume * this.musicVolume;
            
            // Subtle fade in and out
            this.musicGainNode.gain.cancelScheduledValues(currentTime);
            this.musicGainNode.gain.setValueAtTime(baseVolume * 0.8, currentTime);
            this.musicGainNode.gain.linearRampToValueAtTime(baseVolume, currentTime + 4);
            this.musicGainNode.gain.linearRampToValueAtTime(baseVolume * 0.8, currentTime + 8);
        }, 8000);
    }
    
    startBackgroundMusic() {
        if (!this.isMusicEnabled || this.isPlayingMusic) return;
        
        this.createBackgroundMusic();
    }
    
    stopBackgroundMusic() {
        if (!this.isPlayingMusic || !this.musicOscillator) return;
        
        try {
            // Stop all oscillators
            this.musicOscillator.oscillators.forEach(osc => {
                osc.stop();
            });
            
            // Stop LFO
            if (this.musicOscillator.lfo) {
                this.musicOscillator.lfo.stop();
            }
        } catch (e) {
            console.warn('Error stopping music:', e);
        }
        
        this.musicOscillator = null;
        this.isPlayingMusic = false;
    }
    
    toggleBackgroundMusic() {
        this.isMusicEnabled = !this.isMusicEnabled;
        
        if (this.isMusicEnabled) {
            this.startBackgroundMusic();
        } else {
            this.stopBackgroundMusic();
        }
        
        return this.isMusicEnabled;
    }
    
    updateMusicVolume() {
        if (this.musicGainNode) {
            this.musicGainNode.gain.setValueAtTime(
                this.masterVolume * this.musicVolume,
                this.audioContext.currentTime
            );
        }
    }
    
    playGeneratedSound(type) {
        if (!this.isEnabled || !this.audioContext) return;
        
        const gainNode = this.audioContext.createGain();
        gainNode.connect(this.audioContext.destination);
        gainNode.gain.value = this.masterVolume * this.sfxVolume;
        
        const oscillator = this.audioContext.createOscillator();
        oscillator.connect(gainNode);
        
        // Configure sound based on type
        switch (type) {
            case 'roll':
                oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(150, this.audioContext.currentTime + 0.1);
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
                break;
                
            case 'jump':
                oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(600, this.audioContext.currentTime + 0.2);
                oscillator.type = 'square';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.2);
                break;
                
            case 'coin':
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(1000, this.audioContext.currentTime + 0.1);
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.15);
                break;
                
            case 'key':
                oscillator.frequency.setValueAtTime(500, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.3);
                oscillator.type = 'triangle';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
                break;
                
            case 'trap':
                oscillator.frequency.setValueAtTime(100, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.5);
                oscillator.type = 'sawtooth';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);
                break;
                
            case 'teleport':
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.3);
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
                break;
                
            case 'levelComplete':
                oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.5);
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);
                break;
                
            case 'levelFailed':
                oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.8);
                oscillator.type = 'sawtooth';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.8);
                break;
                
            case 'victory':
                oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(880, this.audioContext.currentTime + 0.3);
                oscillator.frequency.exponentialRampToValueAtTime(660, this.audioContext.currentTime + 0.6);
                oscillator.frequency.exponentialRampToValueAtTime(880, this.audioContext.currentTime + 0.9);
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 1.2);
                break;
                
            case 'gravityShift':
                oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(150, this.audioContext.currentTime + 0.4);
                oscillator.type = 'triangle';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.4);
                break;
                
            case 'menuClick':
                oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(600, this.audioContext.currentTime + 0.1);
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
                break;
                
            case 'menuHover':
                oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.05);
                break;
                
            case 'achievement':
                // Achievement sound - triumphant ascending tone
                oscillator.frequency.setValueAtTime(523, this.audioContext.currentTime); // C5
                oscillator.frequency.exponentialRampToValueAtTime(659, this.audioContext.currentTime + 0.2); // E5
                oscillator.frequency.exponentialRampToValueAtTime(784, this.audioContext.currentTime + 0.4); // G5
                oscillator.frequency.exponentialRampToValueAtTime(1047, this.audioContext.currentTime + 0.6); // C6
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.8);
                break;
                
            default:
                oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.2);
        }
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 1);
    }
    
    play(soundName) {
        if (!this.isEnabled) return;
        
        const sound = this.sounds[soundName];
        if (sound) {
            sound.play();
        } else {
            console.warn(`Sound "${soundName}" not found`);
        }
    }
    
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }
    
    setSfxVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
    }
    
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        this.updateMusicVolume();
    }
    
    toggleSound() {
        this.isEnabled = !this.isEnabled;
        return this.isEnabled;
    }
    
    addVolumeControls() {
        // Add volume controls to the game settings
        const controlsDiv = document.getElementById('controls');
        if (controlsDiv) {
            const soundControls = document.createElement('div');
            soundControls.innerHTML = `
                <div style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.7); border-radius: 5px;">
                    <p style="margin: 0 0 10px 0; color: #fff; font-weight: bold;">🔊 Sound Controls:</p>
                    <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
                        <button id="toggle-sound" style="padding: 5px 10px; background: #333; color: #fff; border: 1px solid #666; border-radius: 3px; cursor: pointer;">
                            Sound: ON
                        </button>
                        <button id="toggle-music" style="padding: 5px 10px; background: #333; color: #fff; border: 1px solid #666; border-radius: 3px; cursor: pointer;">
                            Music: ON
                        </button>
                        <label style="color: #fff; display: flex; align-items: center; gap: 5px;">
                            Master: <input type="range" id="master-volume" min="0" max="100" value="70" style="width: 80px;">
                        </label>
                        <label style="color: #fff; display: flex; align-items: center; gap: 5px;">
                            SFX: <input type="range" id="sfx-volume" min="0" max="100" value="80" style="width: 80px;">
                        </label>
                        <label style="color: #fff; display: flex; align-items: center; gap: 5px;">
                            Music: <input type="range" id="music-volume" min="0" max="100" value="50" style="width: 80px;">
                        </label>
                    </div>
                </div>
            `;
            controlsDiv.appendChild(soundControls);
            
            // Add event listeners
            document.getElementById('toggle-sound').addEventListener('click', (e) => {
                const isEnabled = this.toggleSound();
                e.target.textContent = `Sound: ${isEnabled ? 'ON' : 'OFF'}`;
                e.target.style.background = isEnabled ? '#333' : '#666';
            });
            
            document.getElementById('toggle-music').addEventListener('click', (e) => {
                const isEnabled = this.toggleBackgroundMusic();
                e.target.textContent = `Music: ${isEnabled ? 'ON' : 'OFF'}`;
                e.target.style.background = isEnabled ? '#333' : '#666';
            });
            
            document.getElementById('master-volume').addEventListener('input', (e) => {
                this.setMasterVolume(e.target.value / 100);
            });
            
            document.getElementById('sfx-volume').addEventListener('input', (e) => {
                this.setSfxVolume(e.target.value / 100);
            });
            
            document.getElementById('music-volume').addEventListener('input', (e) => {
                this.setMusicVolume(e.target.value / 100);
            });
        }
    }
}

// Create global sound manager instance
const soundManager = new SoundManager();

// Export for use in other modules
export default soundManager; 