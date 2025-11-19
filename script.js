document.addEventListener('DOMContentLoaded', () => {

    // --- SOUND MODULE ---
    const Sound = (() => {
        let audioCtx;
        let isMuted = false;
        const loopingSounds = new Map(); // For continuous sounds like thrust/hum

        // --- Noise Buffer ---
        let noiseBuffer = null;
        function createNoiseBuffer(ctx) {
            const bufferSize = ctx.sampleRate * 2; // 2 seconds of noise
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const output = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
            return buffer;
        }
        
        function init() {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                noiseBuffer = createNoiseBuffer(audioCtx);
            } catch (e) {
                console.error("Web Audio API is not supported in this browser");
                audioCtx = null;
            }

            const muteButton = document.getElementById('mute-button');
            if (muteButton) {
                muteButton.addEventListener('click', () => { 
                    unlockAudio(); 
                    isMuted = !isMuted; 
                    muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
                    if (isMuted) {
                        loopingSounds.forEach((sound) => {
                           if (sound.source.stop) sound.source.stop();
                        });
                        loopingSounds.clear();
                    }
                });
            }
        }

        function unlockAudio() {
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(e => console.error("AudioContext resume failed: ", e));
            }
        }

        function playSound(type, volume = 0.3) {
            if (isMuted || !audioCtx) return;
            
            const gainNode = audioCtx.createGain();
            gainNode.connect(audioCtx.destination);
            gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);

            let source; 
            if (type === 'crash') {
                source = audioCtx.createOscillator();
                source.type = 'sawtooth';
                source.frequency.setValueAtTime(140, audioCtx.currentTime);
                source.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            } else if (type === 'land') {
                source = audioCtx.createOscillator();
                source.type = 'sine';
                source.frequency.setValueAtTime(300, audioCtx.currentTime);
                source.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
            } else if (type === 'clamp_on') {
                source = audioCtx.createOscillator();
                source.type = 'square';
                source.frequency.setValueAtTime(140, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
            } else if (type === 'clamp_off') {
                source = audioCtx.createOscillator();
                source.type = 'square';
                source.frequency.setValueAtTime(600, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
            } else if (type === 'explosion') {
                source = audioCtx.createBufferSource();
                source.buffer = noiseBuffer;
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(2000, audioCtx.currentTime);
                filter.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.5);
                source.connect(filter);
                filter.connect(gainNode);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
            } else if (type === 'win') {
                source = audioCtx.createOscillator();
                source.type = 'sine';
                source.frequency.setValueAtTime(440, audioCtx.currentTime);
                source.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.2);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
            } else if (type === 'lose') {
                source = audioCtx.createOscillator();
                source.type = 'sawtooth';
                source.frequency.setValueAtTime(200, audioCtx.currentTime);
                source.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.8);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.0);
            } else if (type === 'ui_click') {
                source = audioCtx.createOscillator();
                source.type = 'triangle';
                source.frequency.setValueAtTime(700, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            } else {
                 return;
            }

            if (source) {
                if (!(source instanceof AudioBufferSourceNode)) {
                     source.connect(gainNode);
                }
                source.start(audioCtx.currentTime);
                source.stop(audioCtx.currentTime + 1);
            }
        }

        function startLoopingSound(owner, type) {
            if (isMuted || !audioCtx || loopingSounds.has(owner.id + type)) return;

            const gainNode = audioCtx.createGain();
            gainNode.connect(audioCtx.destination);
            let source, filter;

            if (type === 'thrust') {
                source = audioCtx.createBufferSource();
                source.buffer = noiseBuffer;
                source.loop = true;
                filter = audioCtx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 800;
                filter.Q.value = 15;
                source.connect(filter);
                filter.connect(gainNode);
                gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.1);
            } else if (type === 'bomb_hum') {
                source = audioCtx.createOscillator();
                source.type = 'sawtooth';
                source.frequency.setValueAtTime(50, audioCtx.currentTime);
                const lfo = audioCtx.createOscillator();
                lfo.type = 'sine';
                lfo.frequency.value = 5;
                const lfoGain = audioCtx.createGain();
                lfoGain.gain.value = 5;
                lfo.connect(lfoGain);
                lfoGain.connect(source.frequency);
                source.connect(gainNode);
                gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                lfo.start();
            } else {
                return;
            }
            
            source.start(audioCtx.currentTime);
            loopingSounds.set(owner.id + type, { source, gainNode });
        }

        function stopLoopingSound(owner, type) {
            const sound = loopingSounds.get(owner.id + type);
            if (sound && audioCtx) {
                sound.gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
                sound.gainNode.gain.setValueAtTime(sound.gainNode.gain.value, audioCtx.currentTime);
                sound.gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
                sound.source.stop(audioCtx.currentTime + 0.21);
                loopingSounds.delete(owner.id + type);
            }
        }
        
        function stopAllLoopingSounds() {
            if (!audioCtx) return;
            loopingSounds.forEach((sound) => {
                sound.gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
                sound.gainNode.gain.setValueAtTime(sound.gainNode.gain.value, audioCtx.currentTime);
                sound.gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
                sound.source.stop(audioCtx.currentTime + 0.11);
            });
            loopingSounds.clear();
        }

        return { init, unlockAudio, playSound, startLoopingSound, stopLoopingSound, stopAllLoopingSounds };
    })();


    // --- GAME MODULE (Main Controller) ---
    const Game = (() => {
        let state = {};
        let lastTime = 0;
        let gameLoopId = null;
        let lastPathfindTime = 0;

        const initialGameState = {
            level: 0,
            players: [],
            bomb: null,
            particles: [],
            levelObjects: [],
            camera: { x: 0, y: 0, zoom: 0.4, shake: { duration: 0, magnitude: 0 } },
            status: 'menu',
            isTwoPlayer: false,
            devModeState: 0,
            isSplitScreen: true,
            scalingMode: 'new',
            mapGrid: [],
            discoveredGrid: [],
            gridScale: 1,
            bombDiscovered: false,
            extractionZoneDiscovered: false,
            p1_path: [],
            p2_path: [],
            isMapOpen: false,
            mapView: { x: 0, y: 0 },
            playerControls: [
                { up: 'KeyW', left: 'KeyA', right: 'KeyD', clamp: 'KeyS' },
                { up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', clamp: 'ArrowDown' }
            ],
            gamepadAssignments: [-1, -1] // Player 1 and 2 gamepad indices. -1 = keyboard/unassigned.
        };

        function init() {
            UI.init();
            const canvas = Renderer.init();
            Input.init(canvas);
            resetGame();
            UI.populateLevelSelect(Levels);
            gameLoop(performance.now());
        }

        function resetGame() {
            const persistSplitScreen = state?.isSplitScreen ?? true;
            const persistScalingMode = state?.scalingMode || 'new';
            const persistDevMode = state?.devModeState || 0;
            const persistControls = state?.playerControls || initialGameState.playerControls;

            state = JSON.parse(JSON.stringify(initialGameState));
            
            state.gamepadAssignments = [-1, -1];
            UI.updatePlayerName(0, -1);
            UI.updatePlayerName(1, -1);
            UI.hide('p2-hud');
            
            UI.hide('bomb-hud');

            state.isSplitScreen = persistSplitScreen;
            state.scalingMode = persistScalingMode;
            state.devModeState = persistDevMode;
            state.playerControls = persistControls;

            const hud = UI.get('dev-mode-hud');
            switch (state.devModeState) {
                case 0: UI.hide('dev-mode-hud'); break;
                case 1: hud.textContent = "DEV MODE"; UI.show('dev-mode-hud'); break;
                case 2: hud.textContent = "DEV MODE (INVULNERABLE)"; UI.show('dev-mode-hud'); break;
            }
        }

        function startGame(levelIndex) {
            UI.hide('message-screen');
            loadLevel(levelIndex);
        }

        function loadLevel(levelIndex) {
            const oldAssignments = state.gamepadAssignments;
            resetGame();
            state.gamepadAssignments = oldAssignments;
            UI.updatePlayerName(0, state.gamepadAssignments[0]);

            state.level = levelIndex;
            const levelTemplate = Levels[levelIndex];

            let levelData;
            let cameraZoom;

            if (levelTemplate.procedural) {
                const config = { ...levelTemplate.config };
                if (state.scalingMode === 'new') {
                    config.scale = config.newScale;
                    config.zoom = config.newZoom;
                }
                levelData = LevelGenerator.generate(levelTemplate.name, config);
                cameraZoom = config.zoom;
            } else {
                levelData = JSON.parse(JSON.stringify(levelTemplate));
                if (levelData.name === "Test Level") {
                    const mainWall = levelData.objects.find(o => o.type === 'cave_wall' && o.points.length > 2);
                    if (mainWall) {
                        const p = mainWall.points;
                        if (Math.random() < 0.5) {
                            console.log("Test Level Mod: Removing left bottom horizontal wall.");
                            mainWall.points.pop(); 
                        } else {
                            console.log("Test Level Mod: Removing right bottom horizontal wall.");
                            mainWall.points = [p[4], p[5], p[6], p[7], p[8], p[0], p[1], p[2], p[3]];
                        }
                    }
                }
                levelData = LevelGenerator.gridifyStaticLevel(levelData, 100);
                cameraZoom = 0.4;
            }

            state.mapGrid = levelData.mapGrid;
            state.gridScale = levelData.scale;
            state.gridWidth = levelData.gridWidth;
            state.gridHeight = levelData.gridHeight;
            state.discoveredGrid = Array.from({ length: state.gridHeight }, () => Array(state.gridWidth).fill(false));
            state.particles = [];
            state.levelObjects = levelData.objects.map(o => ({ ...o }));
            const p1Start = levelData.playerStart;
            state.players[0] = createShip(0, p1Start.x, p1Start.y, '#f0e68c', '#ffff00', state.playerControls[0]);
            if (state.isSplitScreen || state.gamepadAssignments[1] !== -1) { 
                 addPlayer2(true); 
            }
            const bombStart = levelData.bombStart;
            state.bomb = createBomb(bombStart.x, bombStart.y);
            state.camera.x = p1Start.x;
            state.camera.y = p1Start.y;
            state.camera.zoom = cameraZoom;
            state.mapView = { x: p1Start.x, y: p1Start.y };

            UI.showLevelMessage(levelData.name, 2000, () => {
                state.status = 'playing';
                lastTime = performance.now();
            });
        }

        function addPlayer2(silent = false) {
            if (state.isTwoPlayer && !silent) return;
            state.isTwoPlayer = true;
            const p1 = state.players[0];
            const p1Start = Levels[state.level].playerStart || { x: 500, y: 1900 };
            const shipRadius = 20;
            const shipDiameter = shipRadius * 2;
            const totalSeparation = shipDiameter;
            const p2Start = {x: p1 ? p1.x + totalSeparation : p1Start.x + totalSeparation, y: p1 ? p1.y : p1Start.y};
            state.players[1] = createShip(1, p2Start.x, p2Start.y, '#dda0dd', '#ff00ff', state.playerControls[1]);
            UI.show('p2-hud');
            UI.updatePlayerName(1, state.gamepadAssignments[1]);
            if (!silent) console.log("Player 2 has joined!");
        }
        
        function assignGamepad(playerIndex, gamepadIndex) {
            if (playerIndex < 0 || playerIndex > 1) return;
            const otherPlayer = 1 - playerIndex;
            if (state.gamepadAssignments[otherPlayer] === gamepadIndex) {
                state.gamepadAssignments[otherPlayer] = -1;
                UI.updatePlayerName(otherPlayer, -1);
            }
            state.gamepadAssignments[playerIndex] = gamepadIndex;
            if (playerIndex === 1 && !state.isTwoPlayer && state.status === 'playing') {
                addPlayer2();
            }
            UI.updatePlayerName(playerIndex, gamepadIndex);
            console.log(`Gamepad ${gamepadIndex} assigned to Player ${playerIndex + 1}`);
        }

        function createShip(id, x, y, color, glowColor, controls) {
            return { id, x, y, vx: 0, vy: 0, angle: -Math.PI / 2, radius: 20, health: 100, fuel: 100, mass: 1, isThrusting: false, wantsToClamp: false, isLanded: false, color, glowColor, controls, thrustSoundPlaying: false };
        }

        function createBomb(x, y) { return { id: 'bomb', x, y, vx: 0, vy: 0, radius: 30, mass: 5, stability: 100, harmony: 0, attachedShips: [], isArmed: false, onPedestal: true, humSoundPlaying: false }; }

        function gameLoop(timestamp) {
            gameLoopId = requestAnimationFrame(gameLoop);
            const deltaTime = Math.min(0.05, (timestamp - lastTime) / 1000);
            lastTime = timestamp;
            Input.pollForNewControllers(state);
            if (state.status === 'menu') {
                Input.handleMenuInput(state);
                Renderer.draw(state);
                return;
            }
            if (state.isMapOpen) {
                Renderer.drawFullMap(state);
                return;
            }
            if (state.status === 'paused') { 
                lastTime = timestamp; 
                Renderer.drawPauseOverlay(); 
                return; 
            }
            if (state.status === 'playing') {
                const actions = Input.getPlayerActions(state);
                Physics.update(state, actions, deltaTime);
                updateDiscoveryAndPathfinding(state, timestamp);
                Renderer.draw(state);
                UI.update(state);
                checkWinFailConditions();
            }
        }

        function updateDiscoveryAndPathfinding(state, timestamp) {
            const worldToGrid = (wx, wy) => ({
                gx: Math.floor(wx / state.gridScale),
                gy: Math.floor(wy / state.gridScale)
            });
            const revealRadius = 8;
            state.players.forEach(player => {
                const { gx, gy } = worldToGrid(player.x, player.y);
                for (let y = gy - revealRadius; y <= gy + revealRadius; y++) {
                    for (let x = gx - revealRadius; x <= gx + revealRadius; x++) {
                        if (x >= 0 && x < state.gridWidth && y >= 0 && y < state.gridHeight) {
                            if (Math.hypot(x - gx, y - gy) <= revealRadius) {
                                state.discoveredGrid[y][x] = true;
                            }
                        }
                    }
                }
            });
            const discoveryRadius = 12;
            if (!state.bombDiscovered) {
                const bombPos = worldToGrid(state.bomb.x, state.bomb.y);
                if (state.players.some(p => Math.hypot(worldToGrid(p.x, p.y).gx - bombPos.gx, worldToGrid(p.x, p.y).gy - bombPos.gy) < discoveryRadius)) {
                    state.bombDiscovered = true;
                    console.log("Bomb discovered!");
                }
            }
            if (!state.extractionZoneDiscovered) {
                const zone = state.levelObjects.find(o => o.type === 'extraction_zone');
                if (zone) {
                    const zonePos = worldToGrid(zone.x + zone.width / 2, zone.y + zone.height / 2);
                    if (state.players.some(p => Math.hypot(worldToGrid(p.x, p.y).gx - zonePos.gx, worldToGrid(p.x, p.y).gy - zonePos.gy) < discoveryRadius)) {
                        state.extractionZoneDiscovered = true;
                        console.log("Extraction Zone discovered!");
                    }
                }
            }
            if (timestamp - lastPathfindTime > 500) {
                lastPathfindTime = timestamp;
                let targetPos = null;
                const zone = state.levelObjects.find(o => o.type === 'extraction_zone');
                if (state.bomb.attachedShips.length === 2 && state.extractionZoneDiscovered && zone) {
                    targetPos = worldToGrid(zone.x + zone.width / 2, zone.y + zone.height / 2);
                } else if (state.bombDiscovered) {
                    targetPos = worldToGrid(state.bomb.x, state.bomb.y);
                }
                state.players.forEach((player, index) => {
                    if (targetPos) {
                        const startPos = worldToGrid(player.x, player.y);
                        const path = Pathfinder.findPath(state.mapGrid, startPos, targetPos);
                        if (index === 0) state.p1_path = path;
                        else state.p2_path = path;
                    } else {
                         if (index === 0) state.p1_path = [];
                         else state.p2_path = [];
                    }
                });
            }
        }

        function checkWinFailConditions() {
            if (state.status !== 'playing') return;
            if (state.bomb.stability <= 0 && state.status !== 'game_over') {
                Physics.spawnExplosion(state, state.bomb.x, state.bomb.y, 200);
                state.camera.shake = { duration: 0.8, magnitude: 20 };
                endGame("Bomb Destabilized!");
            }
            const extractionZone = state.levelObjects.find(o => o.type === 'extraction_zone');
            if (extractionZone && Physics.isColliding(state.bomb, extractionZone) && state.bomb.attachedShips.length > 0) {
                Sound.playSound('win', 0.6);
                Sound.stopAllLoopingSounds();
                state.status = 'level_complete';
                UI.showLevelMessage("Success!", 3000, () => {
                    if (state.level + 1 < Levels.length) {
                        loadLevel(state.level + 1);
                    } else {
                        endGame("All Levels Complete!");
                    }
                });
            }
            if (state.players.length > 0 && state.players.every(p => p.health <= 0) && state.status !== 'game_over') {
                endGame("All Ships Destroyed!");
            }
        }

        function endGame(message) { if (state.status === 'game_over') return; Sound.playSound('lose', 0.5); Sound.stopAllLoopingSounds(); state.status = 'game_over'; UI.show('message-screen'); UI.get('message-screen').querySelector('h1').textContent = "Game Over"; UI.get('message-screen').querySelector('.instructions').textContent = message; UI.populateLevelSelect(Levels); }
        function togglePause(forcePause = false) { if (state.status === 'playing' || forcePause) { state.status = 'paused'; UI.show('pause-screen'); } else if (state.status === 'paused') { state.status = 'playing'; UI.hide('pause-screen'); UI.hide('help-screen'); } }
        function cycleDevMode() { state.devModeState = (state.devModeState + 1) % 3; const hud = UI.get('dev-mode-hud'); switch (state.devModeState) { case 0: UI.hide('dev-mode-hud'); console.log("Dev Mode: OFF"); break; case 1: hud.textContent = "DEV MODE"; UI.show('dev-mode-hud'); console.log("Dev Mode: ON (Reduced Damage)"); break; case 2: hud.textContent = "DEV MODE (INVULNERABLE)"; UI.show('dev-mode-hud'); console.log("Dev Mode: ON (Invulnerable)"); break; } }
        function toggleSplitScreen() { state.isSplitScreen = !state.isSplitScreen; UI.updateSplitScreenButton(state.isSplitScreen); if (state.status !== 'playing' && state.isSplitScreen && !state.isTwoPlayer) { addPlayer2(); } }
        function toggleScalingMode() { state.scalingMode = state.scalingMode === 'new' ? 'original' : 'new'; console.log(`Random Map Scaling Mode: ${state.scalingMode}`); UI.updateScalingButton(state.scalingMode); }
        function toggleMap() { if (state.status !== 'playing' && state.status !== 'paused') return; state.isMapOpen = !state.isMapOpen; if (state.isMapOpen) { UI.show('map-screen'); } else { UI.hide('map-screen'); } }
        function panMap(dx, dy) { const MAP_CELL_SIZE = 8; const scaleFactor = state.gridScale / MAP_CELL_SIZE; state.mapView.x -= dx * scaleFactor; state.mapView.y -= dy * scaleFactor; }
        function rebindKey(playerIndex, action, newKeyCode) { if (playerIndex < state.playerControls.length && state.playerControls[playerIndex][action] !== undefined) { console.log(`Rebinding P${playerIndex+1} ${action} to ${newKeyCode}`); state.playerControls[playerIndex][action] = newKeyCode; } }
        return { init, togglePause, cycleDevMode, toggleSplitScreen, toggleScalingMode, endGame, startGame, toggleMap, panMap, rebindKey, addPlayer2, assignGamepad, getGameState: () => state };
    })();

    // --- RENDERER MODULE ---
    const Renderer = (() => {
        let canvas, ctx, width, height;
        function init() { canvas = document.getElementById('game-canvas'); ctx = canvas.getContext('2d'); resize(); window.addEventListener('resize', resize); return canvas; }
        function resize() { const rect = canvas.getBoundingClientRect(); canvas.width = rect.width; canvas.height = rect.height; width = canvas.width; height = canvas.height; }
        function drawWorld(state) {
            drawLevel(state); drawParticles(state.particles);
            if(state.bomb) drawBomb(state.bomb, state.camera.zoom);
            state.players.forEach(p => drawShip(p, state.camera.zoom));
        }
        function draw(state) {
            ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, width, height);
            if (state.status === 'menu') return;
            const p1 = state.players[0]; const p2 = state.players[1];
            if (state.isSplitScreen && state.isTwoPlayer && p1 && p2) {
                ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width / 2, height); ctx.clip();
                ctx.translate(width / 4, height / 2); ctx.scale(state.camera.zoom, state.camera.zoom); ctx.translate(-p1.x, -p1.y);
                drawWorld(state);
                ctx.restore();
                drawMinimap(ctx, state, p1, { x: width / 2 - 210, y: 10, w: 200, h: 150 });
                ctx.save(); ctx.beginPath(); ctx.rect(width / 2, 0, width / 2, height); ctx.clip();
                ctx.translate(width * 0.75, height / 2); ctx.scale(state.camera.zoom, state.camera.zoom); ctx.translate(-p2.x, -p2.y);
                drawWorld(state);
                ctx.restore();
                drawMinimap(ctx, state, p2, { x: width / 2 + 10, y: 10, w: 200, h: 150 });
                ctx.strokeStyle = 'white'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); ctx.stroke();
            } else if (p1) {
                ctx.save(); ctx.translate(width / 2, height / 2);
                if (state.camera.shake.duration > 0) { const { magnitude } = state.camera.shake; ctx.translate(Math.random() * magnitude - magnitude/2, Math.random() * magnitude - magnitude/2); }
                ctx.scale(state.camera.zoom, state.camera.zoom); ctx.translate(-state.camera.x, -state.camera.y);
                drawWorld(state);
                ctx.restore();
                drawMinimap(ctx, state, p1, { x: width - 210, y: 10, w: 200, h: 150 });
            }
        }
        
        function drawMinimap(ctx, state, player, rect) {
            if (!state.mapGrid || state.mapGrid.length === 0 || !player) return;
            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
            ctx.beginPath();
            ctx.rect(rect.x, rect.y, rect.w, rect.h);
            ctx.clip();
            const baseViewSizeY = 30;
            const cellSize = rect.h / baseViewSizeY;
            const viewSizeX = rect.w / cellSize;
            const viewSizeY = baseViewSizeY;
            const pGridX = player.x / state.gridScale;
            const pGridY = player.y / state.gridScale;
            ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
            for (let y = Math.floor(pGridY - viewSizeY / 2); y < pGridY + viewSizeY / 2; y++) {
                for (let x = Math.floor(pGridX - viewSizeX / 2); x < pGridX + viewSizeX / 2; x++) {
                    if (x >= 0 && x < state.gridWidth && y >= 0 && y < state.gridHeight && state.discoveredGrid[y][x]) {
                        const cellType = state.mapGrid[y][x];
                        if (cellType === '#') ctx.fillStyle = '#444';
                        else if (cellType === ' ') ctx.fillStyle = '#111';
                        else ctx.fillStyle = '#222';
                        ctx.fillRect( (x - pGridX) * cellSize - cellSize / 2, (y - pGridY) * cellSize - cellSize / 2, cellSize, cellSize );
                    }
                }
            }
            const path = player.id === 0 ? state.p1_path : state.p2_path;
            if (path.length > 0) {
                ctx.strokeStyle = 'cyan';
                ctx.lineWidth = Math.max(1, cellSize * 0.4);
                ctx.beginPath();
                path.forEach((node, index) => {
                    const sx = (node.x - pGridX) * cellSize;
                    const sy = (node.y - pGridY) * cellSize;
                    if (index === 0) ctx.moveTo(sx, sy);
                    else ctx.lineTo(sx, sy);
                });
                ctx.stroke();
            }
            if (state.bombDiscovered) {
                const bGridX = state.bomb.x / state.gridScale;
                const bGridY = state.bomb.y / state.gridScale;
                ctx.fillStyle = '#ff4757';
                ctx.fillRect((bGridX - pGridX) * cellSize - cellSize, (bGridY - pGridY) * cellSize - cellSize, cellSize * 2, cellSize * 2);
            }
            if (state.extractionZoneDiscovered) {
                const zone = state.levelObjects.find(o => o.type === 'extraction_zone');
                if (zone) {
                    const zGridX = (zone.x + zone.width / 2) / state.gridScale;
                    const zGridY = (zone.y + zone.height / 2) / state.gridScale;
                    ctx.fillStyle = '#7cfc00';
                    ctx.fillRect((zGridX - pGridX) * cellSize - cellSize, (zGridY - pGridY) * cellSize - cellSize, cellSize * 2, cellSize * 2);
                }
            }
            state.players.forEach(p => {
                const relX = (p.x / state.gridScale - pGridX) * cellSize;
                const relY = (p.y / state.gridScale - pGridY) * cellSize;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(relX, relY, cellSize * 0.7, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }

        function drawFullMap(state) {
            ctx.fillStyle = '#050508';
            ctx.fillRect(0, 0, width, height);
            const cellSize = 8;
            const scaleFactor = cellSize / state.gridScale;
            const viewX = state.mapView.x;
            const viewY = state.mapView.y;
            ctx.save();
            ctx.translate(width / 2, height / 2);
            const worldWidthOnScreen = width / scaleFactor;
            const worldHeightOnScreen = height / scaleFactor;
            const startGridX = Math.floor((viewX - worldWidthOnScreen / 2) / state.gridScale);
            const endGridX = Math.ceil((viewX + worldWidthOnScreen / 2) / state.gridScale);
            const startGridY = Math.floor((viewY - worldHeightOnScreen / 2) / state.gridScale);
            const endGridY = Math.ceil((viewY + worldHeightOnScreen / 2) / state.gridScale);
            for (let y = startGridY; y < endGridY; y++) {
                for (let x = startGridX; x < endGridX; x++) {
                    if (x >= 0 && x < state.gridWidth && y >= 0 && y < state.gridHeight && state.discoveredGrid[y][x]) {
                        const cellType = state.mapGrid[y][x];
                        if (cellType === '#') ctx.fillStyle = '#556677';
                        else if (cellType === ' ') ctx.fillStyle = '#1a1a2a';
                        else ctx.fillStyle = '#222';
                        const screenX = (x * state.gridScale - viewX) * scaleFactor;
                        const screenY = (y * state.gridScale - viewY) * scaleFactor;
                        ctx.fillRect(screenX, screenY, cellSize, cellSize);
                    }
                }
            }
            if (state.bombDiscovered) {
                const screenX = (state.bomb.x - viewX) * scaleFactor;
                const screenY = (state.bomb.y - viewY) * scaleFactor;
                ctx.fillStyle = '#ff4757';
                ctx.shadowColor = '#ff4757';
                ctx.shadowBlur = 15;
                ctx.fillRect(screenX - cellSize, screenY - cellSize, cellSize * 2, cellSize * 2);
            }
            if (state.extractionZoneDiscovered) {
                const zone = state.levelObjects.find(o => o.type === 'extraction_zone');
                if (zone) {
                    const zx = zone.x + zone.width / 2;
                    const zy = zone.y + zone.height / 2;
                    const screenX = (zx - viewX) * scaleFactor;
                    const screenY = (zy - viewY) * scaleFactor;
                    ctx.fillStyle = '#7cfc00';
                    ctx.shadowColor = '#7cfc00';
                    ctx.shadowBlur = 15;
                    ctx.fillRect(screenX - cellSize, screenY - cellSize, cellSize * 2, cellSize * 2);
                }
            }
            ctx.shadowBlur = 0;
            state.players.forEach(p => {
                if(p.health <= 0) return;
                const screenX = (p.x - viewX) * scaleFactor;
                const screenY = (p.y - viewY) * scaleFactor;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(screenX, screenY, cellSize, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }

        function drawPauseOverlay(){ ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0,0,width,height); }
        function drawLevel(state) { const zoom = state.camera.zoom; state.levelObjects.forEach(obj => { if (obj.type === 'cave_wall') { ctx.beginPath(); ctx.moveTo(obj.points[0].x, obj.points[0].y); for (let i = 1; i < obj.points.length; i++) { ctx.lineTo(obj.points[i].x, obj.points[i].y); } ctx.strokeStyle = '#556677'; ctx.lineWidth = 15 / zoom; ctx.stroke(); } else if (obj.type === 'landing_pad') { ctx.fillStyle = '#448844'; ctx.fillRect(obj.x, obj.y, obj.width, obj.height); } else if (obj.type === 'extraction_zone') { ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'; ctx.fillRect(obj.x, obj.y, obj.width, obj.height); ctx.strokeStyle = '#0f0'; ctx.lineWidth = 5 / zoom; ctx.strokeRect(obj.x, obj.y, obj.width, obj.height); } }); }
        function drawShip(ship, zoom) { if (ship.health <= 0) return; ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle + Math.PI / 2); ctx.shadowColor = ship.glowColor; ctx.shadowBlur = 20 / zoom; ctx.fillStyle = ship.color; ctx.beginPath(); ctx.moveTo(0, -ship.radius * 0.8); ctx.lineTo(-ship.radius * 0.6, ship.radius * 0.6); ctx.lineTo(ship.radius * 0.6, ship.radius * 0.6); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.restore(); }
        function drawBomb(bomb, zoom) { ctx.save(); ctx.translate(bomb.x, bomb.y); if(bomb.attachedShips.length > 0) { bomb.attachedShips.forEach(ship => { ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(ship.x - bomb.x, ship.y - bomb.y); ctx.strokeStyle = 'cyan'; ctx.lineWidth = 4 / zoom; ctx.stroke(); }); } ctx.shadowColor = bomb.isArmed ? 'cyan' : '#ff4757'; ctx.shadowBlur = (100 - bomb.stability) / 5 / zoom; ctx.beginPath(); ctx.arc(0, 0, bomb.radius, 0, Math.PI * 2); ctx.fillStyle = '#666'; ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, bomb.radius * 0.8, 0, Math.PI * 2); ctx.fillStyle = '#444'; ctx.fill(); const blinkRate = bomb.isArmed ? 0.5 : 1.5; if (Math.floor(performance.now() / (500 / blinkRate)) % 2 === 0) { ctx.fillStyle = bomb.isArmed ? 'cyan' : '#ff4757'; ctx.beginPath(); ctx.arc(0, 0, bomb.radius * 0.3, 0, Math.PI * 2); ctx.fill(); } ctx.shadowBlur = 0; ctx.restore(); }
        function drawParticles(particles) { ctx.globalCompositeOperation = 'lighter'; particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; }
        return { init, draw, drawPauseOverlay, drawFullMap };
    })();

    // --- PHYSICS MODULE (EULER INTEGRATION) ---
    const Physics = (() => {
        const C = { GRAVITY: 80, THRUST_FORCE: 400, ROTATION_SPEED: 4.5, FUEL_CONSUMPTION: 15, FUEL_REGEN: 20, DAMAGE_ON_COLLISION: 25, BOMB_STABILITY_DRAIN: 5, BOMB_STABILITY_REGEN: 3, HARMONY_ANGLE_THRESHOLD: 0.4, ROPE_LENGTH: 100, ROPE_STIFFNESS: 120, ROPE_DAMPING: 8, WALL_HALF_THICKNESS: 7.5 };
        function update(state, actions, dt) { updateShips(state, actions, dt); updateBomb(state, dt); updateParticles(state, dt); updateCamera(state, dt); }
        function updateShips(state, actions, dt) { state.players.forEach((ship, index) => { if (ship.health <= 0) { if (ship.thrustSoundPlaying) { Sound.stopLoopingSound(ship, 'thrust'); ship.thrustSoundPlaying = false; } return; } const action = index === 0 ? actions.p1 : actions.p2; if (ship.isLanded && action.up) { ship.isLanded = false; ship.vy -= 80; } if (ship.isLanded) { const targetAngle = -Math.PI / 2; ship.angle = lerpAngle(ship.angle, targetAngle, 6 * dt); ship.vx *= 0.9; ship.vy = 0; ship.fuel = Math.min(100, ship.fuel + C.FUEL_REGEN * dt); ship.health = Math.min(100, ship.health + C.FUEL_REGEN * dt); } ship.isThrusting = !ship.isLanded && action.up && ship.fuel > 0; if (ship.isThrusting && !ship.thrustSoundPlaying) { Sound.startLoopingSound(ship, 'thrust'); ship.thrustSoundPlaying = true; } else if (!ship.isThrusting && ship.thrustSoundPlaying) { Sound.stopLoopingSound(ship, 'thrust'); ship.thrustSoundPlaying = false; } if (action.left && !ship.isLanded) ship.angle -= C.ROTATION_SPEED * dt; if (action.right && !ship.isLanded) ship.angle += C.ROTATION_SPEED * dt; if (ship.isThrusting) { ship.vx += Math.cos(ship.angle) * C.THRUST_FORCE * dt; ship.vy += Math.sin(ship.angle) * C.THRUST_FORCE * dt; if (state.devModeState === 0) { ship.fuel -= C.FUEL_CONSUMPTION * dt; } if(state.particles.length < 300) spawnThrustParticles(state, ship); } ship.vy += C.GRAVITY * dt; if (state.bomb.attachedShips.includes(ship)) { const bomb = state.bomb; const dx = bomb.x - ship.x; const dy = bomb.y - ship.y; const dist = Math.hypot(dx, dy) || 1; if (dist > C.ROPE_LENGTH) { const stretch = dist - C.ROPE_LENGTH; const nx = dx / dist; const ny = dy / dist; const vRelX = bomb.vx - ship.vx; const vRelY = bomb.vy - ship.vy; const vAlongNormal = vRelX * nx + vRelY * ny; const dampingForce = C.ROPE_DAMPING * vAlongNormal; const totalForce = (C.ROPE_STIFFNESS * stretch) + dampingForce; ship.vx += (nx * totalForce / ship.mass) * dt; ship.vy += (ny * totalForce / ship.mass) * dt;} } ship.x += ship.vx * dt; ship.y += ship.vy * dt; handleWallCollisions(ship, state); handleObjectCollisions(ship, state); }); }
        function updateBomb(state, dt) { const bomb = state.bomb; if (bomb.onPedestal) return; let forceX = 0, forceY = 0; if (bomb.attachedShips.length > 0) { bomb.attachedShips.forEach(ship => { const dx = ship.x - bomb.x, dy = ship.y - bomb.y; const dist = Math.hypot(dx, dy) || 1; if (dist > C.ROPE_LENGTH) { const stretch = dist - C.ROPE_LENGTH; const nx = dx / dist, ny = dy / dist; const vRelX = ship.vx - bomb.vx, vRelY = ship.vy - bomb.vy; const vAlongNormal = vRelX * nx + vRelY * ny; const dampingForce = C.ROPE_DAMPING * vAlongNormal; const totalRopeForce = (C.ROPE_STIFFNESS * stretch) + dampingForce; forceX += nx * totalRopeForce; forceY += ny * totalRopeForce; } }); } forceY += C.GRAVITY * bomb.mass; bomb.vx += (forceX / bomb.mass) * dt; bomb.vy += (forceY / bomb.mass) * dt; bomb.vx *= 0.99; bomb.vy *= 0.99; bomb.x += bomb.vx * dt; bomb.y += bomb.vy * dt; handleWallCollisions(bomb, state); if (bomb.isArmed) { const p1 = bomb.attachedShips[0], p2 = bomb.attachedShips[1]; if (!p1 || !p2) return; const angleDiff = Math.abs((((p1.angle - p2.angle) % (2*Math.PI)) + (3*Math.PI)) % (2*Math.PI) - Math.PI); bomb.harmony = (angleDiff < C.HARMONY_ANGLE_THRESHOLD) ? 1 : 0; bomb.stability += (bomb.harmony === 1 ? C.BOMB_STABILITY_REGEN : -C.BOMB_STABILITY_DRAIN) * dt; bomb.stability = Math.max(0, Math.min(100, bomb.stability)); } }
        function handleObjectCollisions(ship, state) { let onAPad = false; state.levelObjects.forEach(obj => { if (obj.type === 'landing_pad' && isColliding(ship, obj) && ship.vy > 0) { if (!ship.isLanded) { Sound.playSound('land', 0.5); } ship.isLanded = true; ship.y = obj.y - ship.radius; onAPad = true; } }); if (!onAPad) { ship.isLanded = false; } const bomb = state.bomb; const distToBomb = Math.hypot(ship.x - bomb.x, ship.y - bomb.y); const isAttached = bomb.attachedShips.includes(ship); const inRange = distToBomb < C.ROPE_LENGTH + 40; if (ship.wantsToClamp && inRange && !isAttached) { bomb.attachedShips.push(ship); Sound.playSound('clamp_on', 0.1); bomb.onPedestal = false; } else if ((!ship.wantsToClamp || !inRange) && isAttached) { const index = bomb.attachedShips.indexOf(ship); if (index > -1) { bomb.attachedShips.splice(index, 1); Sound.playSound('clamp_off', 0.4); } if (!inRange) ship.wantsToClamp = false; } if (bomb.attachedShips.length > 0 && !bomb.humSoundPlaying) { Sound.startLoopingSound(bomb, 'bomb_hum'); bomb.humSoundPlaying = true; } else if (bomb.attachedShips.length === 0 && bomb.humSoundPlaying) { Sound.stopLoopingSound(bomb, 'bomb_hum'); bomb.humSoundPlaying = false; } if (state.isTwoPlayer && bomb.attachedShips.length === 2 && !bomb.isArmed) { bomb.isArmed = true; UI.show('bomb-hud'); } else if (bomb.attachedShips.length < 2 && bomb.isArmed) { bomb.isArmed = false; UI.hide('bomb-hud'); } }
        function handleWallCollisions(entity, state) { const effectiveRadius = entity.radius + C.WALL_HALF_THICKNESS / state.camera.zoom; state.levelObjects.filter(o => o.type === 'cave_wall').forEach(wall => { for (let i = 0; i < wall.points.length - 1; i++) { const p1 = wall.points[i]; const p2 = wall.points[i + 1]; const lineVec = { x: p2.x - p1.x, y: p2.y - p1.y }; const pointVec = { x: entity.x - p1.x, y: entity.y - p1.y }; const lineLenSq = lineVec.x * lineVec.x + lineVec.y * lineVec.y; if (lineLenSq === 0) continue; const t = Math.max(0, Math.min(1, (pointVec.x * lineVec.x + pointVec.y * lineVec.y) / lineLenSq)); const closestPoint = { x: p1.x + t * lineVec.x, y: p1.y + t * lineVec.y }; const distSq = (entity.x - closestPoint.x) ** 2 + (entity.y - closestPoint.y) ** 2; if (distSq < effectiveRadius * effectiveRadius) { const impactSpeed = Math.hypot(entity.vx, entity.vy); const dist = Math.sqrt(distSq) || 1; const penetration = effectiveRadius - dist; const normal = { x: (entity.x - closestPoint.x) / dist, y: (entity.y - closestPoint.y) / dist }; entity.x += normal.x * penetration; entity.y += normal.y * penetration; const dot = entity.vx * normal.x + entity.vy * normal.y; entity.vx -= 1.8 * dot * normal.x; entity.vy -= 1.8 * dot * normal.y; if (impactSpeed > 50) { const volume = Math.min(1.0, impactSpeed / 400); Sound.playSound('crash', volume); let damageMultiplier = 1; if (state.devModeState === 1) damageMultiplier = 0.25; if (state.devModeState === 2) damageMultiplier = 0; const damage = C.DAMAGE_ON_COLLISION * damageMultiplier; if (entity.health !== undefined) entity.health -= damage; if (entity.stability !== undefined) entity.stability -= damage; Physics.spawnExplosion(state, entity.x, entity.y, 5); state.camera.shake = { duration: 0.2, magnitude: 5 }; } return; } } }); }
        function lerpAngle(start, end, amount) { let d = end - start; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return start + d * amount; }
        function updateParticles(state, dt) { for (let i = state.particles.length - 1; i >= 0; i--) { const p = state.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.decay * dt; if (p.life <= 0) state.particles.splice(i, 1); } }
        function spawnThrustParticles(state, ship) { const speed = 100; const angle = ship.angle + Math.PI + (Math.random() - 0.5) * 0.5; state.particles.push({ x: ship.x - Math.cos(ship.angle) * ship.radius, y: ship.y - Math.sin(ship.angle) * ship.radius, vx: ship.vx + Math.cos(angle) * speed, vy: ship.vy + Math.sin(angle) * speed, size: Math.random() * 2 + 1, color: ship.glowColor, life: Math.random() * 0.5 + 0.3, decay: 1.5 }); }
        function spawnExplosion(state, x, y, count) { if (count > 10) Sound.playSound('explosion', 0.8); for(let i=0; i<count; i++) { const speed = Math.random() * 800 + 50; const angle = Math.random() * Math.PI * 2; state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 3 + 2, color: ['#ff0', '#f80', '#f00'][Math.floor(Math.random()*3)], life: Math.random() * 1 + 0.5, decay: 1 }); } }
        function updateCamera(state, dt) { if (state.isSplitScreen) return; let targetX=0, targetY=0, count = 0; state.players.forEach(p => { if(p.health > 0) { targetX += p.x; targetY += p.y; count++; } }); if (count > 0) { targetX /= count; targetY /= count; } else if (state.bomb) { targetX = state.bomb.x; targetY = state.bomb.y; } state.camera.x += (targetX - state.camera.x) * 0.08; state.camera.y += (targetY - state.camera.y) * 0.08; if (state.camera.shake.duration > 0) state.camera.shake.duration -= dt; }
        function isColliding(circle, rect) { const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width)); const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height)); const dX = circle.x - closestX; const dY = circle.y - closestY; return (dX * dX + dY * dY) < (circle.radius * circle.radius); }
        return { update, isColliding, spawnExplosion };
    })();

    // --- INPUT MODULE ---
    const Input = (() => {
        const keys = {};
        let isDraggingMap = false;
        let lastMousePos = { x: 0, y: 0 };
        const gamepads = {};
        const prevButtonStates = [{}, {}, {}, {}];
        let rebindingCallback = null;
        const FACE_BUTTON_INDICES = [0, 1, 2, 3];

        function init(canvas) { 
            window.addEventListener('keydown', e => { 
                Sound.unlockAudio();
                if (rebindingCallback) {
                    e.preventDefault();
                    if (e.code === 'Escape') {
                        rebindingCallback(null);
                    } else {
                        rebindingCallback(e.code);
                    }
                    rebindingCallback = null;
                    return;
                }
                if (!e.repeat) { 
                    const state = Game.getGameState(); 
                    if (state.status === 'playing' || state.status === 'paused') { 
                        if (state.players[0] && e.code === state.players[0].controls.clamp) { state.players[0].wantsToClamp = !state.players[0].wantsToClamp; } 
                        if (state.players[1] && e.code === state.players[1].controls.clamp) { state.players[1].wantsToClamp = !state.players[1].wantsToClamp; } 
                    } 
                    if (e.code === 'KeyP' && !Game.getGameState().isMapOpen) Game.togglePause(); 
                    if (e.code === 'KeyH') UI.toggleHelp(); 
                    if (e.code === 'KeyV') Game.cycleDevMode(); 
                    if (e.code === 'KeyM') Game.toggleMap();
                } 
                keys[e.code] = true; 
            }); 
            window.addEventListener('keyup', e => { keys[e.code] = false; }); 
            canvas.addEventListener('mousedown', e => { Sound.unlockAudio(); if (Game.getGameState().isMapOpen) { isDraggingMap = true; lastMousePos = { x: e.clientX, y: e.clientY }; } });
            window.addEventListener('mousemove', e => { if (Game.getGameState().isMapOpen && isDraggingMap) { const dx = e.clientX - lastMousePos.x; const dy = e.clientY - lastMousePos.y; Game.panMap(dx, dy); lastMousePos = { x: e.clientX, y: e.clientY }; } });
            window.addEventListener('mouseup', () => { isDraggingMap = false; });
            window.addEventListener("gamepadconnected", e => { Sound.unlockAudio(); console.log(`Gamepad connected at index ${e.gamepad.index}: ${e.gamepad.id}.`); gamepads[e.gamepad.index] = e.gamepad; });
            window.addEventListener("gamepaddisconnected", e => {
                console.log(`Gamepad disconnected from index ${e.gamepad.index}: ${e.gamepad.id}.`);
                const state = Game.getGameState();
                const playerIndex = state.gamepadAssignments.indexOf(e.gamepad.index);
                if (playerIndex !== -1) {
                    state.gamepadAssignments[playerIndex] = -1;
                    UI.updatePlayerName(playerIndex, -1);
                    console.log(`Player ${playerIndex + 1} unassigned from controller.`);
                }
                delete gamepads[e.gamepad.index];
            });
        }
        
        function pollForNewControllers(state) {
            const polledPads = navigator.getGamepads();
            for (let i = 0; i < polledPads.length; i++) {
                const pad = polledPads[i];
                if (!pad) continue;
                if (state.gamepadAssignments.includes(pad.index)) {
                    pad.buttons.forEach((button, index) => {
                         prevButtonStates[pad.index] = prevButtonStates[pad.index] || {};
                         prevButtonStates[pad.index][index] = button.pressed;
                    });
                    continue;
                }
                let justPressedJoin = false;
                for (const buttonIndex of FACE_BUTTON_INDICES) {
                    const button = pad.buttons[buttonIndex];
                    if (button) {
                        prevButtonStates[pad.index] = prevButtonStates[pad.index] || {};
                        const wasPressed = prevButtonStates[pad.index][buttonIndex] || false;
                        if (button.pressed && !wasPressed) {
                            justPressedJoin = true;
                        }
                        prevButtonStates[pad.index][buttonIndex] = button.pressed;
                    }
                }
                if (justPressedJoin) {
                    Sound.unlockAudio();
                    if (state.gamepadAssignments[0] === -1) {
                        Game.assignGamepad(0, pad.index);
                    } else if (state.gamepadAssignments[1] === -1) {
                        Game.assignGamepad(1, pad.index);
                    }
                }
            }
        }
        
        function handleMenuInput(state) {
             if (!state.isTwoPlayer && keys[state.playerControls[1].up]) {
                if (state.gamepadAssignments[1] === -1) {
                    Game.addPlayer2();
                    UI.updatePlayerName(1, -1);
                }
            }
        }

        function getPlayerActions(state) {
            const actions = { p1: {}, p2: {} };
            const DEADZONE = 0.2;
            const THRUST_BUTTON_INDEX = 0;
            const CLAMP_BUTTON_INDEX = 13;
            const DPAD_LEFT_INDEX = 14;
            const DPAD_RIGHT_INDEX = 15;
            const ALT_THRUST_BUTTON_INDEX = 7;
            const polledPads = navigator.getGamepads();
            if (state.players[0]) {
                const c1 = state.playerControls[0];
                actions.p1 = { up: keys[c1.up], left: keys[c1.left], right: keys[c1.right] };
                const pad1_index = state.gamepadAssignments[0];
                if (pad1_index !== -1 && polledPads[pad1_index]) {
                    const pad1 = polledPads[pad1_index];
                    const stickX = pad1.axes[0];
                    if (stickX < -DEADZONE || pad1.buttons[DPAD_LEFT_INDEX].pressed) actions.p1.left = true;
                    if (stickX > DEADZONE || pad1.buttons[DPAD_RIGHT_INDEX].pressed) actions.p1.right = true;
                    if (pad1.buttons[THRUST_BUTTON_INDEX].pressed || pad1.buttons[ALT_THRUST_BUTTON_INDEX].value > 0.1) actions.p1.up = true;
                    const clampPressed = pad1.buttons[CLAMP_BUTTON_INDEX].pressed;
                    if (clampPressed && !prevButtonStates[pad1_index][CLAMP_BUTTON_INDEX]) {
                        state.players[0].wantsToClamp = !state.players[0].wantsToClamp;
                    }
                }
            }
            if (state.players[1]) {
                 const c2 = state.playerControls[1];
                 actions.p2 = { up: keys[c2.up], left: keys[c2.left], right: keys[c2.right] };
                 const pad2_index = state.gamepadAssignments[1];
                 if (pad2_index !== -1 && polledPads[pad2_index]) {
                     const pad2 = polledPads[pad2_index];
                     const stickX = pad2.axes[0];
                     if (stickX < -DEADZONE || pad2.buttons[DPAD_LEFT_INDEX].pressed) actions.p2.left = true;
                     if (stickX > DEADZONE || pad2.buttons[DPAD_RIGHT_INDEX].pressed) actions.p2.right = true;
                     if (pad2.buttons[THRUST_BUTTON_INDEX].pressed || pad2.buttons[ALT_THRUST_BUTTON_INDEX].value > 0.1) actions.p2.up = true;
                     const clampPressed = pad2.buttons[CLAMP_BUTTON_INDEX].pressed;
                     if (clampPressed && !prevButtonStates[pad2_index][CLAMP_BUTTON_INDEX]) {
                         state.players[1].wantsToClamp = !state.players[1].wantsToClamp;
                     }
                 }
            }
            return actions;
        }

        function listenForNextKey(callback) { rebindingCallback = callback; }
        return { init, getPlayerActions, listenForNextKey, handleMenuInput, pollForNewControllers };
    })();

    // --- UI MODULE ---
    const UI = (() => {
        const elements = {};
        const safeColor = '#7cfc00', dangerColor = '#ff4757';
        function init() {
            // MODIFIED: Added 'screen' to the list of element IDs
            const ids = ['screen', 'p1-hud', 'p2-hud', 'bomb-hud', 'p1-fuel', 'p1-health', 'p2-fuel', 'p2-health', 'harmony-meter', 'bomb-stability', 'message-screen', 'level-message-screen', 'pause-screen', 'level-select-container', 'help-screen', 'toggle-help-button', 'close-help-button', 'dev-mode-hud', 'settings-container', 'map-screen', 'rebinding-ui', 'p1-name', 'p2-name'];
            ids.forEach(id => elements[id] = document.getElementById(id));
            elements['toggle-help-button'].addEventListener('click', () => { Sound.playSound('ui_click', 0.2); toggleHelp(); });
            elements['close-help-button'].addEventListener('click', () => { Sound.playSound('ui_click', 0.2); hide('help-screen'); });
            elements['rebinding-ui'].addEventListener('click', handleRebindClick);
            populateRebindingUI();
        }
        function get(id) { return elements[id]; }
        function update(state) { if (state.players[0]) updatePlayerHUD(state.players[0], 'p1'); if (state.players[1]) updatePlayerHUD(state.players[1], 'p2'); if (state.bomb && state.bomb.isArmed) { const stability = Math.round(state.bomb.stability); elements['bomb-stability'].textContent = `BOMB: ${stability}%`; elements['bomb-stability'].style.color = stability > 50 ? safeColor : (stability > 25 ? '#f0e68c' : dangerColor); const harmonyText = state.bomb.harmony === 1 ? 'GOOD' : 'POOR'; elements['harmony-meter'].textContent = `HARMONY: ${harmonyText}`; elements['harmony-meter'].style.color = state.bomb.harmony === 1 ? safeColor : dangerColor; } }
        function updatePlayerHUD(player, prefix) { const fuel = Math.max(0, Math.round(player.fuel)); const health = Math.max(0, Math.round(player.health)); elements[`${prefix}-fuel`].textContent = `FUEL: ${fuel}%`; elements[`${prefix}-health`].textContent = `HP: ${health}%`; elements[`${prefix}-fuel`].style.color = fuel > 25 ? '' : dangerColor; elements[`${prefix}-health`].style.color = health > 25 ? '' : dangerColor; }
        
        // MODIFIED: Functions now toggle a class on the #screen element for the help menu
        function show(id) {
            elements[id].classList.remove('hidden');
            if (id === 'help-screen') {
                elements['screen'].classList.add('help-menu-active');
            }
        }
        function hide(id) {
            elements[id].classList.add('hidden');
            if (id === 'help-screen') {
                elements['screen'].classList.remove('help-menu-active');
            }
        }

        function showLevelMessage(text, duration, callback) { elements['level-message-screen'].textContent = text; show('level-message-screen'); setTimeout(() => { hide('level-message-screen'); if (callback) callback(); }, duration); }
        function populateLevelSelect(levels) { const levelContainer = elements['level-select-container']; const settingsContainer = elements['settings-container']; levelContainer.innerHTML = ''; settingsContainer.innerHTML = ''; levels.forEach((level, index) => { const button = document.createElement('button'); button.textContent = level.name; button.addEventListener('click', () => { Sound.playSound('ui_click', 0.4); Game.startGame(index); }); levelContainer.appendChild(button); }); const splitScreenButton = document.createElement('button'); splitScreenButton.id = 'toggle-split-screen-button'; splitScreenButton.addEventListener('click', () => { Sound.playSound('ui_click', 0.2); Game.toggleSplitScreen(); }); settingsContainer.appendChild(splitScreenButton); updateSplitScreenButton(Game.getGameState().isSplitScreen); const scalingButton = document.createElement('button'); scalingButton.id = 'toggle-scaling-button'; scalingButton.addEventListener('click', () => { Sound.playSound('ui_click', 0.2); Game.toggleScalingMode(); }); settingsContainer.appendChild(scalingButton); updateScalingButton(Game.getGameState().scalingMode); populateRebindingUI(); }
        function updateSplitScreenButton(isSplitScreen) { const button = document.getElementById('toggle-split-screen-button'); if (button) { button.textContent = `Mode: ${isSplitScreen ? 'Split-Screen' : 'Shared Screen'}`; } }
        function updateScalingButton(scalingMode) { const button = document.getElementById('toggle-scaling-button'); if (button) { const modeText = scalingMode.charAt(0).toUpperCase() + scalingMode.slice(1); button.textContent = `Map Scale: ${modeText}`; } }
        function toggleHelp() { const helpScreen = elements['help-screen']; const isHidden = helpScreen.classList.contains('hidden'); if (isHidden) { populateRebindingUI(); const gameState = Game.getGameState(); if (gameState.status === 'playing') { Game.togglePause(true); } show('help-screen'); } else { hide('help-screen'); } }
        function updatePlayerName(playerIndex, gamepadIndex) {
            const id = `p${playerIndex + 1}-name`;
            const element = elements[id];
            if (!element) return;
            let nameText = `P${playerIndex + 1}`;
            if (gamepadIndex !== -1) { nameText += ` (GP${gamepadIndex})`; }
            nameText += ' 🚀';
            element.textContent = nameText;
        }
        function populateRebindingUI() { const controls = Game.getGameState().playerControls; if (!controls) return; const buttons = elements['rebinding-ui'].querySelectorAll('.rebind-button'); buttons.forEach(button => { const player = parseInt(button.dataset.player, 10); const action = button.dataset.action; if (controls[player] && controls[player][action]) { button.textContent = controls[player][action]; } }); }
        function handleRebindClick(e) { if (!e.target.classList.contains('rebind-button')) return; const button = e.target; Sound.playSound('ui_click', 0.2); const player = parseInt(button.dataset.player, 10); const action = button.dataset.action; document.querySelectorAll('.rebind-button.is-listening').forEach(b => { b.classList.remove('is-listening'); populateRebindingUI(); }); button.classList.add('is-listening'); button.textContent = 'Press key...'; Input.listenForNextKey((newKeyCode) => { if (newKeyCode) { Game.rebindKey(player, action, newKeyCode); } button.classList.remove('is-listening'); populateRebindingUI(); }); }
        return { init, get, update, show, hide, showLevelMessage, populateLevelSelect, toggleHelp, updateSplitScreenButton, updateScalingButton, updatePlayerName };
    })();

    // --- LEVEL DATA ---
    const Levels = [
        { name: "Test Level", playerStart: { x: 500, y: 1900 }, bombStart: { x: 500, y: 1500 }, objects: [ { type: 'cave_wall', points: [ {x: 0, y: 2000}, {x: 0, y: 0}, {x: 1000, y: 0}, {x: 1000, y: 2000}, {x: 800, y: 2000}, {x: 800, y: 200}, {x: 200, y: 200}, {x: 200, y: 2000}, {x: 0, y: 2000} ]}, { type: 'cave_wall', points: [ {x: 350, y: 1200}, {x: 650, y: 1200} ]}, { type: 'landing_pad', x: 450, y: 1950, width: 100, height: 10 }, { type: 'landing_pad', x: 450, y: 1150, width: 100, height: 10 }, { type: 'extraction_zone', x: 400, y: 50, width: 200, height: 100 } ] },
        { name: "The Descent", playerStart: { x: 250, y: 300 }, bombStart: { x: 1250, y: 2400 }, objects: [ { type: 'cave_wall', points: [ {x: 0, y: 2500}, {x: 0, y: 250}, {x: 500, y: 250}, {x: 600, y: 350}, {x: 1500, y: 350}, {x: 1600, y: 250}, {x: 2000, y: 250}, {x: 2000, y: 2500}, {x: 0, y: 2500} ]}, { type: 'cave_wall', points: [ {x: 200, y: 500}, {x: 400, y: 650}, {x: 600, y: 600}, {x: 800, y: 900}, {x: 700, y: 1200}, {x: 900, y: 1500}, {x: 1300, y: 1600}, {x: 1600, y: 1400}, {x: 1800, y: 1700}, {x: 1700, y: 2000}, {x: 1400, y: 2200}, {x: 1100, y: 2100}, {x: 800, y: 2300}, {x: 1000, y: 2500}, {x: 1500, y: 2500}, {x: 1700, y: 2300} ]}, { type: 'landing_pad', x: 200, y: 450, width: 100, height: 10 }, { type: 'landing_pad', x: 850, y: 1490, width: 100, height: 10 }, { type: 'landing_pad', x: 1200, y: 2450, width: 100, height: 10 }, { type: 'extraction_zone', x: 1700, y: 300, width: 200, height: 50 } ] },
        { name: "Random Cavern (S)", procedural: true, config: { generatorType: 'cavern', width: 80, height: 80, maxRooms: 40, roomMinSize: 8, roomMaxSize: 16, scale: 150, zoom: 0.25, newScale: 60, newZoom: 0.4, numLandingPads: 3 } },
        { name: "Random Cavern (M)", procedural: true, config: { generatorType: 'cavern', width: 120, height: 120, maxRooms: 50, roomMinSize: 9, roomMaxSize: 18, scale: 150, zoom: 0.25, newScale: 60, newZoom: 0.4, numLandingPads: 8 } },
        { name: "Random Cavern (L)", procedural: true, config: { generatorType: 'cavern', width: 180, height: 180, maxRooms: 60, roomMinSize: 10, roomMaxSize: 20, scale: 150, zoom: 0.25, newScale: 60, newZoom: 0.4, numLandingPads: 12 } },
        { name: "Random Maze (S)", procedural: true, config: { generatorType: 'maze', width: 60, height: 60, maxRooms: 30, roomMinSize: 7, roomMaxSize: 14, scale: 150, zoom: 0.25, newScale: 60, newZoom: 0.4, numLandingPads: 3 } },
        { name: "Random Maze (M)", procedural: true, config: { generatorType: 'maze', width: 90, height: 90, maxRooms: 40, roomMinSize: 8, roomMaxSize: 16, scale: 150, zoom: 0.25, newScale: 60, newZoom: 0.4, numLandingPads: 8 } },
    ];

    // --- LEVEL GENERATOR MODULE ---
    const LevelGenerator = (() => {
        class Rect { constructor(x, y, w, h) { this.x1 = x; this.y1 = y; this.x2 = x + w; this.y2 = y + h; this.center = [Math.floor((this.x1 + this.x2) / 2), Math.floor((this.y1 + this.y2) / 2)]; } intersect(other) { return (this.x1 < other.x2 + 1 && this.x2 > other.x1 - 1 && this.y1 < other.y2 + 1 && this.y2 > other.y1 - 1); } }
        function createCavernGrid({width, height, maxRooms, roomMinSize, roomMaxSize}) { let mapGrid = Array.from({ length: height }, () => Array(width).fill('#')); let rooms = []; for (let r = 0; r < maxRooms; r++) { let w = Math.floor(Math.random() * (roomMaxSize - roomMinSize + 1)) + roomMinSize; let h = Math.floor(Math.random() * (roomMaxSize - roomMinSize + 1)) + roomMinSize; let x = Math.floor(Math.random() * (width - w - 2)) + 1; let y = Math.floor(Math.random() * (height - h - 2)) + 1; let newRoom = new Rect(x, y, w, h); if (rooms.some(otherRoom => newRoom.intersect(otherRoom))) continue; for (let i = newRoom.y1; i < newRoom.y2; i++) { for (let j = newRoom.x1; j < newRoom.x2; j++) mapGrid[i][j] = ' '; } if (rooms.length > 0) { let [prevX, prevY] = rooms[rooms.length - 1].center; let [newX, newY] = newRoom.center; const carve = (x, y) => { if (x > 0 && x < width - 1 && y > 0 && y < height - 1) mapGrid[y][x] = ' '; }; if (Math.random() < 0.5) { for (let i = Math.min(prevX, newX); i <= Math.max(prevX, newX); i++) { carve(i, prevY - 2); carve(i, prevY - 1); carve(i, prevY); carve(i, prevY + 1); carve(i, prevY + 2); } for (let i = Math.min(prevY, newY); i <= Math.max(prevY, newY); i++) { carve(newX - 1, i); carve(newX, i); carve(newX + 1, i); } } else { for (let i = Math.min(prevY, newY); i <= Math.max(prevY, newY); i++) { carve(prevX - 1, i); carve(prevX, i); carve(prevX + 1, i); } for (let i = Math.min(prevX, newX); i <= Math.max(prevX, newX); i++) { carve(i, newY - 2); carve(i, newY - 1); carve(i, newY); carve(i, newY + 1); carve(i, newY + 2); } } } rooms.push(newRoom); } return { mapGrid, rooms }; }
        function createMazeGrid({width, height, maxRooms, roomMinSize, roomMaxSize}) { let mapGrid = Array.from({ length: height }, () => Array(width).fill('#')); let rooms = []; for (let r = 0; r < maxRooms; r++) { let w = Math.floor(Math.random() * (roomMaxSize - roomMinSize + 1)) + roomMinSize; let h = Math.floor(Math.random() * (roomMaxSize - roomMinSize + 1)) + roomMinSize; let x = Math.floor(Math.random() * (width - w - 2)) + 1; let y = Math.floor(Math.random() * (height - h - 2)) + 1; let newRoom = new Rect(x, y, w, h); if (rooms.some(room => newRoom.intersect(room))) continue; for (let i = newRoom.y1; i < newRoom.y2; i++) { for (let j = newRoom.x1; j < newRoom.x2; j++) { mapGrid[i][j] = ' '; } } if (rooms.length > 0) { let [prevX, prevY] = rooms[rooms.length - 1].center; let [newX, newY] = newRoom.center; const carve = (x, y) => { if (x > 0 && x < width - 1 && y > 0 && y < height - 1) mapGrid[y][x] = ' '; }; if (Math.random() < 0.5) { for (let i = Math.min(prevX, newX); i <= Math.max(prevX, newX); i++) { carve(i, prevY - 2); carve(i, prevY - 1); carve(i, prevY); carve(i, prevY + 1); carve(i, prevY + 2); } for (let i = Math.min(prevY, newY); i <= Math.max(prevY, newY); i++) { carve(newX - 1, i); carve(newX, i); carve(newX + 1, i); } } else { for (let i = Math.min(prevY, newY); i <= Math.max(prevY, newY); i++) { carve(prevX - 1, i); carve(prevX, i); carve(prevX + 1, i); } for (let i = Math.min(prevX, newX); i <= Math.max(prevX, newX); i++) { carve(i, newY - 2); carve(i, newY - 1); carve(i, newY); carve(i, newY + 1); carve(i, newY + 2); } } } rooms.push(newRoom); } return { mapGrid, rooms }; }
        function convertGridToLevelObjects(mapGrid, scale) { const objects = []; const height = mapGrid.length; const width = mapGrid[0].length; const isFloor = (x, y) => (x < 0 || y < 0 || x >= width || y >= height) || mapGrid[y][x] !== '#'; for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) { if (!isFloor(x, y)) { if (isFloor(x, y - 1)) objects.push({ type: 'cave_wall', points: [{ x: x * scale, y: y * scale }, { x: (x + 1) * scale, y: y * scale }] }); if (isFloor(x, y + 1)) objects.push({ type: 'cave_wall', points: [{ x: x * scale, y: (y + 1) * scale }, { x: (x + 1) * scale, y: (y + 1) * scale }] }); if (isFloor(x - 1, y)) objects.push({ type: 'cave_wall', points: [{ x: x * scale, y: y * scale }, { x: x * scale, y: (y + 1) * scale }] }); if (isFloor(x + 1, y)) objects.push({ type: 'cave_wall', points: [{ x: (x + 1) * scale, y: y * scale }, { x: (x + 1) * scale, y: (y + 1) * scale }] }); } } } return objects; }
        function generate(name, config) {
            let gridData;
            if (config.generatorType === 'maze') {
                gridData = createMazeGrid(config);
            } else {
                gridData = createCavernGrid(config);
            }
            const { mapGrid, rooms } = gridData;
            if (rooms.length < 10) {
                console.log("Regenerating level, not enough rooms for strategic placement.");
                return generate(name, config);
            }
            const scale = config.scale;
            let objects = convertGridToLevelObjects(mapGrid, scale);
            const usedPadRooms = new Set();
            const WALL_HALF_THICKNESS = 7.5; 
            const findLandingPadSpot = (room) => {
                const candidates = [];
                const floorY = room.y2;
                const spaceY = room.y2 - 1;
                if (floorY >= config.height || spaceY < 0) return null;
                for (let x = room.x1; x <= room.x2 - 2; x++) {
                    if (mapGrid[floorY][x] === '#' && mapGrid[floorY][x + 1] === '#' &&
                        mapGrid[spaceY][x] === ' ' && mapGrid[spaceY][x + 1] === ' ') {
                        candidates.push(x);
                    }
                }
                if (candidates.length > 0) {
                    const chosenX = candidates[Math.floor(Math.random() * candidates.length)];
                    const padHeight = 10;
                    const calculatedY = (floorY * scale) - (WALL_HALF_THICKNESS * 2) - (padHeight * 2) - 5; 
                    return { type: 'landing_pad', x: chosenX * scale, y: calculatedY, width: 2 * scale, height: padHeight };
                }
                return null;
            };
            const gridCenterX = config.width / 2;
            const gridCenterY = config.height / 2;
            const startRoom = rooms.reduce((closest, room) => {
                const distA = Math.hypot(closest.center[0] - gridCenterX, closest.center[1] - gridCenterY);
                const distB = Math.hypot(room.center[0] - gridCenterX, room.center[1] - gridCenterY);
                return distB < distA ? room : closest;
            });
            let availableRooms = rooms.filter(r => r !== startRoom);
            if (availableRooms.length < 2) { return generate(name, config); }
            const findClosestTo = (point, roomList) => {
                return roomList.reduce((closest, room) => {
                    const distA = Math.hypot(closest.center[0] - point.x, closest.center[1] - point.y);
                    const distB = Math.hypot(room.center[0] - point.x, room.center[1] - point.y);
                    return distB < distA ? room : closest;
                });
            };
            const placementStrategies = [ { roomA: availableRooms.reduce((p, c) => p.y1 < c.y1 ? p : c), roomB: availableRooms.reduce((p, c) => p.y2 > c.y2 ? p : c) }, { roomA: availableRooms.reduce((p, c) => p.x1 < c.x1 ? p : c), roomB: availableRooms.reduce((p, c) => p.x2 > c.x2 ? p : c) }, { roomA: findClosestTo({x: 0, y: 0}, availableRooms), roomB: findClosestTo({x: config.width, y: config.height}, availableRooms) }, { roomA: findClosestTo({x: config.width, y: 0}, availableRooms), roomB: findClosestTo({x: 0, y: config.height}, availableRooms) } ];
            const chosenStrategy = placementStrategies[Math.floor(Math.random() * placementStrategies.length)];
            let bombRoom, exitRoom;
            if (Math.random() < 0.5) { [bombRoom, exitRoom] = [chosenStrategy.roomA, chosenStrategy.roomB]; } 
            else { [bombRoom, exitRoom] = [chosenStrategy.roomB, chosenStrategy.roomA]; }
            if (bombRoom === exitRoom || !bombRoom || !exitRoom) { return generate(name, config); }
            let playerStart;
            let playerPad = findLandingPadSpot(startRoom);
            if (!playerPad) {
                const fallbackPadX = (startRoom.center[0] - 1) * scale;
                const padHeight = 10;
                const fallbackPadY = (startRoom.y2 * scale) - (padHeight * 2) - (WALL_HALF_THICKNESS * 2) - 5;
                playerPad = { type: 'landing_pad', x: fallbackPadX, y: fallbackPadY, width: 2 * scale, height: padHeight };
            }
            const spawnCenterX = playerPad.x + playerPad.width / 2;
            const spawnY = playerPad.y - 40;
            const shipRadius = 20;
            playerStart = { x: spawnCenterX - shipRadius, y: spawnY };
            objects.push(playerPad);
            usedPadRooms.add(startRoom);
            let bombStart;
            let bombPad = findLandingPadSpot(bombRoom);
            if (bombPad) {
                objects.push(bombPad);
                bombStart = { x: bombPad.x + (bombPad.width / 2), y: (bombRoom.y1 + 2) * scale };
            } else {
                const fallbackPadX = (bombRoom.center[0] - 1) * scale;
                const padHeight = 10;
                const fallbackPadY = (bombRoom.y2 * scale) - (padHeight * 2) - (WALL_HALF_THICKNESS * 2) - 5;
                objects.push({ type: 'landing_pad', x: fallbackPadX, y: fallbackPadY, width: 2 * scale, height: padHeight });
                bombStart = { x: fallbackPadX + scale, y: (bombRoom.y1 + 2) * scale };
            }
            usedPadRooms.add(bombRoom);
            const exitPos = { x: exitRoom.center[0], y: exitRoom.center[1] };
            objects.push({ type: 'extraction_zone', x: (exitPos.x - 1) * scale, y: (exitPos.y - 1) * scale, width: 2 * scale, height: 2 * scale });
            usedPadRooms.add(exitRoom);
            const tl = findClosestTo({x:0, y:0}, rooms);
            const tr = findClosestTo({x:config.width, y:0}, rooms);
            const bl = findClosestTo({x:0, y:config.height}, rooms);
            const br = findClosestTo({x:config.width, y:config.height}, rooms);
            const cornerRooms = new Set([tl, tr, bl, br]);
            for (const corner of cornerRooms) {
                if (!usedPadRooms.has(corner)) {
                    let cornerPad = findLandingPadSpot(corner);
                    if (cornerPad) { objects.push(cornerPad); usedPadRooms.add(corner); }
                }
            }
            const numPads = config.numLandingPads || 0;
            const potentialPadRooms = rooms.filter(room => !usedPadRooms.has(room));
            for (let i = potentialPadRooms.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [potentialPadRooms[i], potentialPadRooms[j]] = [potentialPadRooms[j], potentialPadRooms[i]]; }
            let placedRandomPads = 0;
            for (const padRoom of potentialPadRooms) {
                if (placedRandomPads >= numPads) break;
                let randomPad = findLandingPadSpot(padRoom);
                if (randomPad) { objects.push(randomPad); placedRandomPads++; }
            }
            return { name, playerStart, bombStart, objects, mapGrid, scale, gridWidth: config.width, gridHeight: config.height };
        }

        function gridifyStaticLevel(levelData, gridSize) { let maxX = 0, maxY = 0; levelData.objects.forEach(o => { if (o.points) o.points.forEach(p => { maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });}); const scale = Math.max(maxX, maxY) / (gridSize - 1); const mapGrid = Array.from({ length: gridSize }, () => Array(gridSize).fill(' ')); levelData.objects.forEach(obj => { if (obj.type === 'cave_wall') { for (let i = 0; i < obj.points.length - 1; i++) { const p1 = obj.points[i]; const p2 = obj.points[i+1]; const gx1 = Math.round(p1.x / scale); const gy1 = Math.round(p1.y / scale); const gx2 = Math.round(p2.x / scale); const gy2 = Math.round(p2.y / scale); let x0=gx1,y0=gy1,x1=gx2,y1=gy2; const dx=Math.abs(x1-x0),sx=x0<x1?1:-1; const dy=-Math.abs(y1-y0),sy=y0<y1?1:-1; let err=dx+dy,e2; while(true){ if(x0>=0&&x0<gridSize&&y0>=0&&y0<gridSize) mapGrid[y0][x0]='#'; if(x0===x1&&y0===y1)break; e2=2*err; if(e2>=dy){err+=dy;x0+=sx;} if(e2<=dx){err+=dx;y0+=sy;}}}}}); for(let y=1; y<gridSize-1; y++){for(let x=1; x<gridSize-1; x++){if(mapGrid[y][x]===' '&&(mapGrid[y-1][x]==='#'||mapGrid[y+1][x]==='#'||mapGrid[y][x-1]==='#'||mapGrid[y][x+1]==='#')){}else{ if(mapGrid[y-1]&&mapGrid[y-1][x-1]===' '&&mapGrid[y-1][x]===' '&&mapGrid[y-1][x+1]===' '&&mapGrid[y][x-1]===' '&&mapGrid[y][x+1]===' '&&mapGrid[y+1]&&mapGrid[y+1][x-1]===' '&&mapGrid[y+1][x]===' '&&mapGrid[y+1][x+1]===' '){}else{mapGrid[y][x]='#';}}}} return { ...levelData, mapGrid, scale, gridWidth: gridSize, gridHeight: gridSize };}
        return { generate, gridifyStaticLevel };
    })();

    // --- PATHFINDER MODULE ---
    const Pathfinder = (() => {
        function heuristic(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
        function findPath(grid, start, goal) {
            if (!grid || grid.length === 0 || start.gy < 0 || start.gy >= grid.length || start.gx < 0 || start.gx >= grid[0].length || goal.gy < 0 || goal.gy >= grid.length || goal.gx < 0 || goal.gx >= grid[0].length || grid[start.gy][start.gx] === '#' || grid[goal.gy][goal.gx] === '#') { return []; }
            let frontier = [{ cell: { x: start.gx, y: start.gy }, priority: 0 }]; let cameFrom = {}; let costSoFar = {}; const startKey = `${start.gx},${start.gy}`; cameFrom[startKey] = null; costSoFar[startKey] = 0;
            while (frontier.length > 0) {
                frontier.sort((a, b) => a.priority - b.priority);
                let currentItem = frontier.shift(); let current = currentItem.cell; const currentKey = `${current.x},${current.y}`;
                if (current.x === goal.gx && current.y === goal.gy) { let path = []; let temp = current; while (temp !== null) { path.push(temp); const key = `${temp.x},${temp.y}`; temp = cameFrom[key]; } return path.reverse(); }
                const neighbors = [{x:0,y:-1}, {x:0,y:1}, {x:-1,y:0}, {x:1,y:0}];
                for (let nDir of neighbors) {
                    const next = { x: current.x + nDir.x, y: current.y + nDir.y };
                    if (next.y < 0 || next.y >= grid.length || next.x < 0 || next.x >= grid[0].length || grid[next.y][next.x] === '#') { continue; }
                    const newCost = costSoFar[currentKey] + 1; const nextKey = `${next.x},${next.y}`;
                    if (!(nextKey in costSoFar) || newCost < costSoFar[nextKey]) { costSoFar[nextKey] = newCost; let priority = newCost + heuristic(next, {x: goal.gx, y: goal.gy}); frontier.push({ cell: next, priority: priority }); cameFrom[nextKey] = current; }
                }
            }
            return [];
        }
        return { findPath };
    })();

    Sound.init();
    Game.init();
});
