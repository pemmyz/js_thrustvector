document.addEventListener('DOMContentLoaded', () => {

    // --- GAME MODULE (Main Controller) ---
    const Game = (() => {
        let state = {};
        let lastTime = 0;
        let gameLoopId = null;

        const initialGameState = {
            level: 0,
            players: [],
            bomb: null,
            particles: [],
            levelObjects: [],
            camera: { x: 0, y: 0, zoom: 0.4, shake: { duration: 0, magnitude: 0 } },
            status: 'menu',
            isTwoPlayer: false,
            isDevMode: false,
            isSplitScreen: false, // NEW: Split-screen state
        };

        function init() {
            UI.init();
            Input.init();
            Renderer.init();
            UI.populateLevelSelect(Levels);
            resetGame();
        }

        function resetGame() {
            state = JSON.parse(JSON.stringify(initialGameState));
            UI.hide('dev-mode-hud');
            // Keep the split screen setting between games
            const splitScreenSetting = Game.getGameState()?.isSplitScreen || false;
            state.isSplitScreen = splitScreenSetting;
        }

        function startGame(levelIndex) {
            // Preserve settings before reset
            const currentSettings = {
                isSplitScreen: state.isSplitScreen,
                isDevMode: state.isDevMode
            };
            resetGame();
            state.isSplitScreen = currentSettings.isSplitScreen;
            state.isDevMode = currentSettings.isDevMode;

            UI.hide('message-screen');
            loadLevel(levelIndex);
        }

        function loadLevel(levelIndex) {
            state.level = levelIndex;
            const levelData = Levels[levelIndex];
            state.particles = [];
            state.levelObjects = levelData.objects.map(o => ({ ...o }));
            const p1Start = levelData.playerStart;
            state.players[0] = createShip(0, p1Start.x, p1Start.y, '#f0e68c', '#ffff00', {
                up: 'KeyW', left: 'KeyA', right: 'KeyD', clamp: 'KeyS'
            });

            // NEW: Force two players if split-screen is enabled
            if (state.isSplitScreen) {
                addPlayer2(true);
            } else if (state.isTwoPlayer) {
                addPlayer2(true);
            }

            const bombStart = levelData.bombStart;
            state.bomb = createBomb(bombStart.x, bombStart.y);
            state.camera.x = p1Start.x;
            state.camera.y = p1Start.y;
            UI.showLevelMessage(levelData.name, 2000, () => {
                state.status = 'playing';
                lastTime = performance.now();
                if (gameLoopId) cancelAnimationFrame(gameLoopId);
                gameLoop(lastTime);
            });
        }
        
        function addPlayer2(silent = false) {
            if (state.isTwoPlayer && !silent) return;
            state.isTwoPlayer = true;
            const p2Start = Levels[state.level]?.playerStart || { x: 580, y: 1900 }; // Fallback
            state.players[1] = createShip(1, p2Start.x + 80, p2Start.y, '#dda0dd', '#ff00ff', {
                 up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', clamp: 'ArrowDown'
            });
            UI.show('p2-hud');
            if (!silent) console.log("Player 2 has joined!");
        }
        
        function createShip(id, x, y, color, glowColor, controls) {
            return {
                id, x, y, vx: 0, vy: 0, angle: -Math.PI / 2,
                radius: 20, health: 100, fuel: 100, mass: 1,
                isThrusting: false, wantsToClamp: false, isLanded: false,
                color, glowColor, controls
            };
        }
        
        function createBomb(x, y) {
            return { x, y, vx: 0, vy: 0, radius: 30, mass: 5, stability: 100, harmony: 0, attachedShips: [], isArmed: false, onPedestal: true };
        }

        function gameLoop(timestamp) {
            gameLoopId = requestAnimationFrame(gameLoop);
            if (state.status === 'paused') { lastTime = timestamp; Renderer.drawPauseOverlay(); return; }
            const deltaTime = Math.min(0.05, (timestamp - lastTime) / 1000);
            lastTime = timestamp;
            if (state.status === 'playing') {
                const actions = Input.getPlayerActions(state);
                // Allow P2 to join only in shared-screen mode
                if (!state.isSplitScreen && !state.isTwoPlayer && actions.p2.up) addPlayer2();
                Physics.update(state, actions, deltaTime);
                Renderer.draw(state);
                UI.update(state);
                checkWinFailConditions();
            }
        }
        
        function checkWinFailConditions() { /* ... no changes ... */ }
        function endGame(message) { /* ... no changes ... */ }
        function togglePause(forcePause = false) { /* ... no changes ... */ }

        function toggleDevMode() {
            state.isDevMode = !state.isDevMode;
            if (state.isDevMode) { UI.show('dev-mode-hud'); console.log("Dev Mode: ON"); } 
            else { UI.hide('dev-mode-hud'); console.log("Dev Mode: OFF"); }
        }

        // NEW: Function to toggle split-screen mode
        function toggleSplitScreen() {
            state.isSplitScreen = !state.isSplitScreen;
            console.log(`Split-Screen Mode: ${state.isSplitScreen ? 'ON' : 'OFF'}`);
            UI.updateSplitScreenButton(state.isSplitScreen);
        }
        
        return { init, togglePause, toggleDevMode, toggleSplitScreen, endGame, startGame, getGameState: () => state };
    })();

    // --- RENDERER MODULE ---
    const Renderer = (() => {
        let canvas, ctx, width, height;
        function init() { canvas = document.getElementById('game-canvas'); ctx = canvas.getContext('2d'); resize(); window.addEventListener('resize', resize); }
        function resize() { const rect = canvas.getBoundingClientRect(); canvas.width = rect.width; canvas.height = rect.height; width = canvas.width; height = canvas.height; }
        
        // NEW: Extracted drawing logic to be called for each view
        function drawWorld(state) {
            drawLevel(state); drawParticles(state.particles);
            if(state.bomb) drawBomb(state.bomb, state.camera.zoom);
            state.players.forEach(p => drawShip(p, state.camera.zoom));
        }
        
        // MODIFIED: Main draw function now handles both rendering modes
        function draw(state) {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#050508';
            ctx.fillRect(0, 0, width, height);

            const p1 = state.players[0];
            const p2 = state.players[1];

            if (state.isSplitScreen && state.isTwoPlayer && p1 && p2) {
                // --- SPLIT-SCREEN RENDER ---

                // P1 View (Left)
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, width / 2, height);
                ctx.clip();
                ctx.translate(width / 4, height / 2); // Center camera in left pane
                ctx.scale(state.camera.zoom, state.camera.zoom);
                ctx.translate(-p1.x, -p1.y);
                drawWorld(state);
                ctx.restore();

                // P2 View (Right)
                ctx.save();
                ctx.beginPath();
                ctx.rect(width / 2, 0, width / 2, height);
                ctx.clip();
                ctx.translate(width * 0.75, height / 2); // Center camera in right pane
                ctx.scale(state.camera.zoom, state.camera.zoom);
                ctx.translate(-p2.x, -p2.y);
                drawWorld(state);
                ctx.restore();

                // Divider Line
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(width / 2, 0);
                ctx.lineTo(width / 2, height);
                ctx.stroke();

            } else {
                // --- SHARED SCREEN RENDER (Original logic) ---
                ctx.save();
                ctx.translate(width / 2, height / 2);
                if (state.camera.shake.duration > 0) {
                    const { magnitude } = state.camera.shake;
                    ctx.translate(Math.random() * magnitude - magnitude/2, Math.random() * magnitude - magnitude/2);
                }
                ctx.scale(state.camera.zoom, state.camera.zoom);
                ctx.translate(-state.camera.x, -state.camera.y);
                drawWorld(state);
                ctx.restore();
            }
        }

        function drawPauseOverlay(){ ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0,0,width,height); }
        function drawLevel(state) { const zoom = state.camera.zoom; state.levelObjects.forEach(obj => { if (obj.type === 'cave_wall') { ctx.beginPath(); ctx.moveTo(obj.points[0].x, obj.points[0].y); for (let i = 1; i < obj.points.length; i++) { ctx.lineTo(obj.points[i].x, obj.points[i].y); } ctx.strokeStyle = '#556677'; ctx.lineWidth = 15 / zoom; ctx.stroke(); } else if (obj.type === 'landing_pad') { ctx.fillStyle = '#448844'; ctx.fillRect(obj.x, obj.y, obj.width, obj.height); } else if (obj.type === 'extraction_zone') { ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'; ctx.fillRect(obj.x, obj.y, obj.width, obj.height); ctx.strokeStyle = '#0f0'; ctx.lineWidth = 5 / zoom; ctx.strokeRect(obj.x, obj.y, obj.width, obj.height); } }); }
        function drawShip(ship, zoom) { if (ship.health <= 0) return; ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle + Math.PI / 2); ctx.shadowColor = ship.glowColor; ctx.shadowBlur = 20 / zoom; ctx.fillStyle = ship.color; ctx.beginPath(); ctx.moveTo(0, -ship.radius * 0.8); ctx.lineTo(-ship.radius * 0.6, ship.radius * 0.6); ctx.lineTo(ship.radius * 0.6, ship.radius * 0.6); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.restore(); }
        function drawBomb(bomb, zoom) { ctx.save(); ctx.translate(bomb.x, bomb.y); if(bomb.attachedShips.length > 0) { bomb.attachedShips.forEach(ship => { ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(ship.x - bomb.x, ship.y - bomb.y); ctx.strokeStyle = 'cyan'; ctx.lineWidth = 4 / zoom; ctx.stroke(); }); } ctx.shadowColor = bomb.isArmed ? 'cyan' : '#ff4757'; ctx.shadowBlur = (100 - bomb.stability) / 5 / zoom; ctx.beginPath(); ctx.arc(0, 0, bomb.radius, 0, Math.PI * 2); ctx.fillStyle = '#666'; ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, bomb.radius * 0.8, 0, Math.PI * 2); ctx.fillStyle = '#444'; ctx.fill(); const blinkRate = bomb.isArmed ? 0.5 : 1.5; if (Math.floor(performance.now() / (500 / blinkRate)) % 2 === 0) { ctx.fillStyle = bomb.isArmed ? 'cyan' : '#ff4757'; ctx.beginPath(); ctx.arc(0, 0, bomb.radius * 0.3, 0, Math.PI * 2); ctx.fill(); } ctx.shadowBlur = 0; ctx.restore(); }
        function drawParticles(particles) { ctx.globalCompositeOperation = 'lighter'; particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; }
        
        // NEW: Expose dimensions for physics calculations
        return { init, draw, drawPauseOverlay, getDimensions: () => ({ width, height }) };
    })();

    // --- PHYSICS MODULE (EULER INTEGRATION) ---
    const Physics = (() => {
        const C = { GRAVITY: 80, THRUST_FORCE: 400, ROTATION_SPEED: 4.5, FUEL_CONSUMPTION: 15, FUEL_REGEN: 20, DAMAGE_ON_COLLISION: 25, BOMB_STABILITY_DRAIN: 5, BOMB_STABILITY_REGEN: 3, HARMONY_ANGLE_THRESHOLD: 0.4, HARMONY_DISTANCE_THRESHOLD: 200, ROPE_LENGTH: 100, ROPE_STIFFNESS: 120, ROPE_DAMPING: 8 };
        
        function update(state, actions, dt) {
            updateShips(state, actions, dt);
            updateBomb(state, dt);
            updateParticles(state, dt);
            updateCamera(state, dt);
        }
        
        function updateShips(state, actions, dt) {
            state.players.forEach((ship, index) => {
                if (ship.health <= 0) return;
                // ... (ship movement logic is unchanged) ...
                const action = index === 0 ? actions.p1 : actions.p2;
                if (ship.isLanded && action.up) { ship.isLanded = false; ship.vy -= 80; }
                if (ship.isLanded) { const targetAngle = -Math.PI / 2; ship.angle = lerpAngle(ship.angle, targetAngle, 6 * dt); ship.vx *= 0.9; ship.vy = 0; ship.fuel = Math.min(100, ship.fuel + C.FUEL_REGEN * dt); ship.health = Math.min(100, ship.health + C.FUEL_REGEN * dt); return; }
                if (action.left) ship.angle -= C.ROTATION_SPEED * dt;
                if (action.right) ship.angle += C.ROTATION_SPEED * dt;
                ship.isThrusting = action.up && ship.fuel > 0;
                if (ship.isThrusting) { ship.vx += Math.cos(ship.angle) * C.THRUST_FORCE * dt; ship.vy += Math.sin(ship.angle) * C.THRUST_FORCE * dt; if (!state.isDevMode) { ship.fuel -= C.FUEL_CONSUMPTION * dt; } if(state.particles.length < 300) spawnThrustParticles(state, ship); }
                ship.vy += C.GRAVITY * dt;
                if (state.bomb.attachedShips.includes(ship)) { /* ... (rope physics unchanged) ... */ }
                ship.x += ship.vx * dt;
                ship.y += ship.vy * dt;
                
                // NEW: Enforce screen boundaries in shared-screen mode
                if (!state.isSplitScreen) {
                    const { width, height } = Renderer.getDimensions();
                    if (width > 0 && height > 0) { // Ensure canvas has been sized
                        const viewWidth = width / state.camera.zoom;
                        const viewHeight = height / state.camera.zoom;
                        const minX = state.camera.x - viewWidth / 2 + ship.radius;
                        const maxX = state.camera.x + viewWidth / 2 - ship.radius;
                        const minY = state.camera.y - viewHeight / 2 + ship.radius;
                        const maxY = state.camera.y + viewHeight / 2 - ship.radius;

                        if (ship.x < minX) { ship.x = minX; ship.vx *= -0.5; }
                        if (ship.x > maxX) { ship.x = maxX; ship.vx *= -0.5; }
                        if (ship.y < minY) { ship.y = minY; ship.vy *= -0.5; }
                        if (ship.y > maxY) { ship.y = maxY; ship.vy *= -0.5; }
                    }
                }
                
                handleWallCollisions(ship, state);
                handleObjectCollisions(ship, state);
            });
        }
        
        function updateBomb(state, dt) { /* ... no changes ... */ }
        function handleObjectCollisions(ship, state) { /* ... no changes ... */ }
        function handleWallCollisions(entity, state) { /* ... no changes ... */ }
        function lerpAngle(start, end, amount) { /* ... no changes ... */ }
        function updateParticles(state, dt) { /* ... no changes ... */ }
        function spawnThrustParticles(state, ship) { /* ... no changes ... */ }
        function spawnExplosion(state, x, y, count) { /* ... no changes ... */ }

        // MODIFIED: Camera update only happens in shared-screen mode
        function updateCamera(state, dt) {
            if (state.isSplitScreen) return; // In split-screen, camera is tied to players directly
            let targetX=0, targetY=0, count = 0;
            state.players.forEach(p => { if(p.health > 0) { targetX += p.x; targetY += p.y; count++; } });
            if (count > 0) { targetX /= count; targetY /= count; } else if (state.bomb) { targetX = state.bomb.x; targetY = state.bomb.y; }
            state.camera.x += (targetX - state.camera.x) * 0.08;
            state.camera.y += (targetY - state.camera.y) * 0.08;
            if (state.camera.shake.duration > 0) state.camera.shake.duration -= dt;
        }
        function isColliding(circle, rect) { /* ... no changes ... */ }
        return { update, isColliding, spawnExplosion };
    })();

    // --- INPUT MODULE ---
    const Input = (() => {
        const keys = {};
        function init() {
            window.addEventListener('keydown', e => {
                if (!e.repeat) {
                    const state = Game.getGameState();
                    if (state.status === 'playing' || state.status === 'paused') {
                        if (state.players[0] && e.code === state.players[0].controls.clamp) { state.players[0].wantsToClamp = !state.players[0].wantsToClamp; }
                        if (state.players[1] && e.code === state.players[1].controls.clamp) { state.players[1].wantsToClamp = !state.players[1].wantsToClamp; }
                    }
                    if (e.code === 'KeyP') Game.togglePause();
                    if (e.code === 'KeyH') UI.toggleHelp();
                    if (e.code === 'KeyV') Game.toggleDevMode();
                }
                keys[e.code] = true;
            });
            window.addEventListener('keyup', e => { keys[e.code] = false; });
        }
        function getPlayerActions(state) { /* ... no changes ... */ }
        return { init, getPlayerActions };
    })();

    // --- UI MODULE ---
    const UI = (() => {
        const elements = {};
        const safeColor = '#7cfc00', dangerColor = '#ff4757';
        function init() { const ids = ['p1-hud', 'p2-hud', 'bomb-hud', 'p1-fuel', 'p1-health', 'p2-fuel', 'p2-health', 'harmony-meter', 'bomb-stability', 'message-screen', 'level-message-screen', 'pause-screen', 'level-select-container', 'help-screen', 'toggle-help-button', 'close-help-button', 'dev-mode-hud', 'settings-container']; ids.forEach(id => elements[id] = document.getElementById(id)); elements['toggle-help-button'].addEventListener('click', toggleHelp); elements['close-help-button'].addEventListener('click', () => hide('help-screen')); }
        function get(id) { return elements[id]; }
        function update(state) { /* ... no changes ... */ }
        function updatePlayerHUD(player, prefix) { /* ... no changes ... */ }
        function show(id) { elements[id].classList.remove('hidden'); }
        function hide(id) { elements[id].classList.add('hidden'); }
        function showLevelMessage(text, duration, callback) { /* ... no changes ... */ }
        
        // MODIFIED: Now creates the settings button too
        function populateLevelSelect(levels) {
            const levelContainer = elements['level-select-container'];
            const settingsContainer = elements['settings-container'];
            levelContainer.innerHTML = '';
            settingsContainer.innerHTML = '';
            
            levels.forEach((level, index) => {
                const button = document.createElement('button');
                button.textContent = level.name;
                button.addEventListener('click', () => Game.startGame(index));
                levelContainer.appendChild(button);
            });
            
            const splitScreenButton = document.createElement('button');
            splitScreenButton.id = 'toggle-split-screen-button';
            splitScreenButton.addEventListener('click', () => Game.toggleSplitScreen());
            settingsContainer.appendChild(splitScreenButton);
            updateSplitScreenButton(Game.getGameState().isSplitScreen);
        }

        // NEW: Function to update the text of the split-screen toggle button
        function updateSplitScreenButton(isSplitScreen) {
            const button = document.getElementById('toggle-split-screen-button');
            if (button) {
                button.textContent = `Mode: ${isSplitScreen ? 'Split-Screen' : 'Shared Screen'}`;
            }
        }
        
        function toggleHelp() { const helpScreen = elements['help-screen']; const isHidden = helpScreen.classList.contains('hidden'); if (isHidden) { const gameState = Game.getGameState(); if (gameState.status === 'playing') { Game.togglePause(true); } show('help-screen'); } else { hide('help-screen'); } }
        
        return { init, get, update, show, hide, showLevelMessage, populateLevelSelect, toggleHelp, updateSplitScreenButton };
    })();

    // --- LEVEL DATA ---
    const Levels = [ /* ... no changes ... */ ];

    Game.init();
});
