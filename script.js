document.addEventListener('DOMContentLoaded', () => {

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
            // --- NEW: State for pathfinding and fog of war ---
            mapGrid: [],
            discoveredGrid: [],
            gridScale: 1,
            bombDiscovered: false,
            extractionZoneDiscovered: false,
            p1_path: [],
            p2_path: [],
        };

        function init() {
            UI.init();
            Input.init();
            Renderer.init();
            resetGame();
            UI.populateLevelSelect(Levels);
        }

        function resetGame() {
            const persistSplitScreen = state?.isSplitScreen ?? true;
            const persistScalingMode = state?.scalingMode || 'new';
            const persistDevMode = state?.devModeState || 0;

            state = JSON.parse(JSON.stringify(initialGameState));

            state.isSplitScreen = persistSplitScreen;
            state.scalingMode = persistScalingMode;
            state.devModeState = persistDevMode;

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
            resetGame();

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
                levelData = levelTemplate;
                // For non-procedural levels, create a grid representation.
                levelData = LevelGenerator.gridifyStaticLevel(levelData, 100);
                cameraZoom = 0.4;
            }

            // --- Initialize map and discovery state ---
            state.mapGrid = levelData.mapGrid;
            state.gridScale = levelData.scale;
            state.gridWidth = levelData.gridWidth;
            state.gridHeight = levelData.gridHeight;
            state.discoveredGrid = Array.from({ length: state.gridHeight }, () => Array(state.gridWidth).fill(false));

            state.particles = [];
            state.levelObjects = levelData.objects.map(o => ({ ...o }));

            const p1Start = levelData.playerStart;
            state.players[0] = createShip(0, p1Start.x, p1Start.y, '#f0e68c', '#ffff00', {
                up: 'KeyW', left: 'KeyA', right: 'KeyD', clamp: 'KeyS'
            });

            if (state.isSplitScreen) { addPlayer2(true); }

            const bombStart = levelData.bombStart;
            state.bomb = createBomb(bombStart.x, bombStart.y);
            state.camera.x = p1Start.x;
            state.camera.y = p1Start.y;
            state.camera.zoom = cameraZoom;

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
            const p1 = state.players[0];
            const p2Start = {x: p1.x + 80, y: p1.y};
            state.players[1] = createShip(1, p2Start.x, p2Start.y, '#dda0dd', '#ff00ff', {
                 up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', clamp: 'ArrowDown'
            });
            UI.show('p2-hud');
            if (!silent) console.log("Player 2 has joined!");
        }

        function createShip(id, x, y, color, glowColor, controls) {
            return { id, x, y, vx: 0, vy: 0, angle: -Math.PI / 2, radius: 20, health: 100, fuel: 100, mass: 1, isThrusting: false, wantsToClamp: false, isLanded: false, color, glowColor, controls };
        }

        function createBomb(x, y) { return { x, y, vx: 0, vy: 0, radius: 30, mass: 5, stability: 100, harmony: 0, attachedShips: [], isArmed: false, onPedestal: true }; }

        function gameLoop(timestamp) {
            gameLoopId = requestAnimationFrame(gameLoop);
            if (state.status === 'paused') { lastTime = timestamp; Renderer.drawPauseOverlay(); return; }
            const deltaTime = Math.min(0.05, (timestamp - lastTime) / 1000);
            lastTime = timestamp;
            if (state.status === 'playing') {
                const actions = Input.getPlayerActions(state);
                if (!state.isSplitScreen && !state.isTwoPlayer && actions.p2.up) addPlayer2();
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

            // Update Fog of War
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

            // Check for discovery of objectives
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

            // Pathfinding (throttled to 2 times per second)
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

        function endGame(message) { if (state.status === 'game_over') return; state.status = 'game_over'; UI.show('message-screen'); UI.get('message-screen').querySelector('h1').textContent = "Game Over"; UI.get('message-screen').querySelector('.instructions').textContent = message; UI.populateLevelSelect(Levels); }
        function togglePause(forcePause = false) { if (state.status === 'playing' || forcePause) { state.status = 'paused'; UI.show('pause-screen'); } else if (state.status === 'paused') { state.status = 'playing'; UI.hide('pause-screen'); UI.hide('help-screen'); } }
        function cycleDevMode() { state.devModeState = (state.devModeState + 1) % 3; const hud = UI.get('dev-mode-hud'); switch (state.devModeState) { case 0: UI.hide('dev-mode-hud'); console.log("Dev Mode: OFF"); break; case 1: hud.textContent = "DEV MODE"; UI.show('dev-mode-hud'); console.log("Dev Mode: ON (Reduced Damage)"); break; case 2: hud.textContent = "DEV MODE (INVULNERABLE)"; UI.show('dev-mode-hud'); console.log("Dev Mode: ON (Invulnerable)"); break; } }
        function toggleSplitScreen() { state.isSplitScreen = !state.isSplitScreen; UI.updateSplitScreenButton(state.isSplitScreen); if (state.status === 'playing' && state.isSplitScreen && !state.isTwoPlayer) { addPlayer2(); } }
        function toggleScalingMode() { state.scalingMode = state.scalingMode === 'new' ? 'original' : 'new'; console.log(`Random Map Scaling Mode: ${state.scalingMode}`); UI.updateScalingButton(state.scalingMode); }
        return { init, togglePause, cycleDevMode, toggleSplitScreen, toggleScalingMode, endGame, startGame, getGameState: () => state };
    })();

    // --- RENDERER MODULE ---
    const Renderer = (() => {
        let canvas, ctx, width, height;
        function init() { canvas = document.getElementById('game-canvas'); ctx = canvas.getContext('2d'); resize(); window.addEventListener('resize', resize); }
        function resize() { const rect = canvas.getBoundingClientRect(); canvas.width = rect.width; canvas.height = rect.height; width = canvas.width; height = canvas.height; }
        function drawWorld(state) {
            drawLevel(state); drawParticles(state.particles);
            if(state.bomb) drawBomb(state.bomb, state.camera.zoom);
            state.players.forEach(p => drawShip(p, state.camera.zoom));
        }
        function draw(state) {
            ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, width, height);
            const p1 = state.players[0]; const p2 = state.players[1];
            if (state.isSplitScreen && state.isTwoPlayer && p1 && p2) {
                // P1 View
                ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width / 2, height); ctx.clip();
                ctx.translate(width / 4, height / 2); ctx.scale(state.camera.zoom, state.camera.zoom); ctx.translate(-p1.x, -p1.y);
                drawWorld(state);
                ctx.restore();
                drawMinimap(ctx, state, p1, { x: width / 2 - 210, y: 10, w: 200, h: 150 });

                // P2 View
                ctx.save(); ctx.beginPath(); ctx.rect(width / 2, 0, width / 2, height); ctx.clip();
                ctx.translate(width * 0.75, height / 2); ctx.scale(state.camera.zoom, state.camera.zoom); ctx.translate(-p2.x, -p2.y);
                drawWorld(state);
                ctx.restore();
                drawMinimap(ctx, state, p2, { x: width - 210, y: 10, w: 200, h: 150 });

                // Split line
                ctx.strokeStyle = 'white'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); ctx.stroke();
            } else {
                ctx.save(); ctx.translate(width / 2, height / 2);
                if (state.camera.shake.duration > 0) { const { magnitude } = state.camera.shake; ctx.translate(Math.random() * magnitude - magnitude/2, Math.random() * magnitude - magnitude/2); }
                ctx.scale(state.camera.zoom, state.camera.zoom); ctx.translate(-state.camera.x, -state.camera.y);
                drawWorld(state);
                ctx.restore();
                drawMinimap(ctx, state, p1, { x: width - 210, y: 10, w: 200, h: 150 });
            }
        }
        
        function drawMinimap(ctx, state, player, rect) {
            if (!state.mapGrid || state.mapGrid.length === 0) return;
            
            ctx.save(); // Save the full canvas state

            // Draw background and border
            ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

            // --- MODIFICATION: Apply clipping region ---
            // After this point, nothing will be drawn outside the minimap's rectangle.
            ctx.beginPath();
            ctx.rect(rect.x, rect.y, rect.w, rect.h);
            ctx.clip();
            
            const viewSize = 30;
            const cellSize = Math.min(rect.w / viewSize, rect.h / viewSize);
            const pGridX = player.x / state.gridScale;
            const pGridY = player.y / state.gridScale;

            // Translate coordinate system to be centered on the player for drawing map content
            ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);

            // Draw map cells
            for (let y = Math.floor(pGridY - viewSize / 2); y < pGridY + viewSize / 2; y++) {
                for (let x = Math.floor(pGridX - viewSize / 2); x < pGridX + viewSize / 2; x++) {
                    if (x >= 0 && x < state.gridWidth && y >= 0 && y < state.gridHeight && state.discoveredGrid[y][x]) {
                        const cellType = state.mapGrid[y][x];
                        if (cellType === '#') ctx.fillStyle = '#444';
                        else if (cellType === ' ') ctx.fillStyle = '#111';
                        else ctx.fillStyle = '#222';

                        ctx.fillRect( (x - pGridX) * cellSize - cellSize / 2, (y - pGridY) * cellSize - cellSize / 2, cellSize, cellSize );
                    }
                }
            }

            // Draw path
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

            // Draw discovered objectives
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
            
            // Draw players
            state.players.forEach(p => {
                const relX = (p.x / state.gridScale - pGridX) * cellSize;
                const relY = (p.y / state.gridScale - pGridY) * cellSize;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(relX, relY, cellSize * 0.7, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.restore(); // Restore the canvas state, removing the clip and translation
        }

        function drawPauseOverlay(){ ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0,0,width,height); }
        function drawLevel(state) { const zoom = state.camera.zoom; state.levelObjects.forEach(obj => { if (obj.type === 'cave_wall') { ctx.beginPath(); ctx.moveTo(obj.points[0].x, obj.points[0].y); for (let i = 1; i < obj.points.length; i++) { ctx.lineTo(obj.points[i].x, obj.points[i].y); } ctx.strokeStyle = '#556677'; ctx.lineWidth = 15 / zoom; ctx.stroke(); } else if (obj.type === 'landing_pad') { ctx.fillStyle = '#448844'; ctx.fillRect(obj.x, obj.y, obj.width, obj.height); } else if (obj.type === 'extraction_zone') { ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'; ctx.fillRect(obj.x, obj.y, obj.width, obj.height); ctx.strokeStyle = '#0f0'; ctx.lineWidth = 5 / zoom; ctx.strokeRect(obj.x, obj.y, obj.width, obj.height); } }); }
        function drawShip(ship, zoom) { if (ship.health <= 0) return; ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle + Math.PI / 2); ctx.shadowColor = ship.glowColor; ctx.shadowBlur = 20 / zoom; ctx.fillStyle = ship.color; ctx.beginPath(); ctx.moveTo(0, -ship.radius * 0.8); ctx.lineTo(-ship.radius * 0.6, ship.radius * 0.6); ctx.lineTo(ship.radius * 0.6, ship.radius * 0.6); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.restore(); }
        function drawBomb(bomb, zoom) { ctx.save(); ctx.translate(bomb.x, bomb.y); if(bomb.attachedShips.length > 0) { bomb.attachedShips.forEach(ship => { ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(ship.x - bomb.x, ship.y - bomb.y); ctx.strokeStyle = 'cyan'; ctx.lineWidth = 4 / zoom; ctx.stroke(); }); } ctx.shadowColor = bomb.isArmed ? 'cyan' : '#ff4757'; ctx.shadowBlur = (100 - bomb.stability) / 5 / zoom; ctx.beginPath(); ctx.arc(0, 0, bomb.radius, 0, Math.PI * 2); ctx.fillStyle = '#666'; ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, bomb.radius * 0.8, 0, Math.PI * 2); ctx.fillStyle = '#444'; ctx.fill(); const blinkRate = bomb.isArmed ? 0.5 : 1.5; if (Math.floor(performance.now() / (500 / blinkRate)) % 2 === 0) { ctx.fillStyle = bomb.isArmed ? 'cyan' : '#ff4757'; ctx.beginPath(); ctx.arc(0, 0, bomb.radius * 0.3, 0, Math.PI * 2); ctx.fill(); } ctx.shadowBlur = 0; ctx.restore(); }
        function drawParticles(particles) { ctx.globalCompositeOperation = 'lighter'; particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; }
        return { init, draw, drawPauseOverlay };
    })();

    // --- PHYSICS MODULE (EULER INTEGRATION) ---
    const Physics = (() => {
        const C = { GRAVITY: 80, THRUST_FORCE: 400, ROTATION_SPEED: 4.5, FUEL_CONSUMPTION: 15, FUEL_REGEN: 20, DAMAGE_ON_COLLISION: 25, BOMB_STABILITY_DRAIN: 5, BOMB_STABILITY_REGEN: 3, HARMONY_ANGLE_THRESHOLD: 0.4, ROPE_LENGTH: 100, ROPE_STIFFNESS: 120, ROPE_DAMPING: 8, WALL_HALF_THICKNESS: 7.5 };
        function update(state, actions, dt) { updateShips(state, actions, dt); updateBomb(state, dt); updateParticles(state, dt); updateCamera(state, dt); }
        function updateShips(state, actions, dt) { state.players.forEach((ship, index) => { if (ship.health <= 0) return; const action = index === 0 ? actions.p1 : actions.p2; if (ship.isLanded && action.up) { ship.isLanded = false; ship.vy -= 80; } if (ship.isLanded) { const targetAngle = -Math.PI / 2; ship.angle = lerpAngle(ship.angle, targetAngle, 6 * dt); ship.vx *= 0.9; ship.vy = 0; ship.fuel = Math.min(100, ship.fuel + C.FUEL_REGEN * dt); ship.health = Math.min(100, ship.health + C.FUEL_REGEN * dt); return; } if (action.left) ship.angle -= C.ROTATION_SPEED * dt; if (action.right) ship.angle += C.ROTATION_SPEED * dt; ship.isThrusting = action.up && ship.fuel > 0; if (ship.isThrusting) { ship.vx += Math.cos(ship.angle) * C.THRUST_FORCE * dt; ship.vy += Math.sin(ship.angle) * C.THRUST_FORCE * dt; if (state.devModeState === 0) { ship.fuel -= C.FUEL_CONSUMPTION * dt; } if(state.particles.length < 300) spawnThrustParticles(state, ship); } ship.vy += C.GRAVITY * dt; if (state.bomb.attachedShips.includes(ship)) { const bomb = state.bomb; const dx = bomb.x - ship.x; const dy = bomb.y - ship.y; const dist = Math.hypot(dx, dy) || 1; if (dist > C.ROPE_LENGTH) { const stretch = dist - C.ROPE_LENGTH; const nx = dx / dist; const ny = dy / dist; const vRelX = bomb.vx - ship.vx; const vRelY = bomb.vy - ship.vy; const vAlongNormal = vRelX * nx + vRelY * ny; const dampingForce = C.ROPE_DAMPING * vAlongNormal; const totalForce = (C.ROPE_STIFFNESS * stretch) + dampingForce; ship.vx += (nx * totalForce / ship.mass) * dt; ship.vy += (ny * totalForce / ship.mass) * dt;} } ship.x += ship.vx * dt; ship.y += ship.vy * dt; handleWallCollisions(ship, state); handleObjectCollisions(ship, state); }); }
        function updateBomb(state, dt) { const bomb = state.bomb; if (bomb.onPedestal) return; let forceX = 0, forceY = 0; if (bomb.attachedShips.length > 0) { bomb.attachedShips.forEach(ship => { const dx = ship.x - bomb.x, dy = ship.y - bomb.y; const dist = Math.hypot(dx, dy) || 1; if (dist > C.ROPE_LENGTH) { const stretch = dist - C.ROPE_LENGTH; const nx = dx / dist, ny = dy / dist; const vRelX = ship.vx - bomb.vx, vRelY = ship.vy - bomb.vy; const vAlongNormal = vRelX * nx + vRelY * ny; const dampingForce = C.ROPE_DAMPING * vAlongNormal; const totalRopeForce = (C.ROPE_STIFFNESS * stretch) + dampingForce; forceX += nx * totalRopeForce; forceY += ny * totalRopeForce; } }); } forceY += C.GRAVITY * bomb.mass; bomb.vx += (forceX / bomb.mass) * dt; bomb.vy += (forceY / bomb.mass) * dt; bomb.vx *= 0.99; bomb.vy *= 0.99; bomb.x += bomb.vx * dt; bomb.y += bomb.vy * dt; handleWallCollisions(bomb, state); if (bomb.isArmed) { const p1 = bomb.attachedShips[0], p2 = bomb.attachedShips[1]; if (!p1 || !p2) return; const angleDiff = Math.abs((((p1.angle - p2.angle) % (2*Math.PI)) + (3*Math.PI)) % (2*Math.PI) - Math.PI); bomb.harmony = (angleDiff < C.HARMONY_ANGLE_THRESHOLD) ? 1 : 0; bomb.stability += (bomb.harmony === 1 ? C.BOMB_STABILITY_REGEN : -C.BOMB_STABILITY_DRAIN) * dt; bomb.stability = Math.max(0, Math.min(100, bomb.stability)); } }
        function handleObjectCollisions(ship, state) { let onAPad = false; state.levelObjects.forEach(obj => { if (obj.type === 'landing_pad' && isColliding(ship, obj) && ship.vy > 0) { ship.isLanded = true; ship.y = obj.y - ship.radius; onAPad = true; } }); if (!onAPad) { ship.isLanded = false; } const bomb = state.bomb; const distToBomb = Math.hypot(ship.x - bomb.x, ship.y - bomb.y); const isAttached = bomb.attachedShips.includes(ship); const inRange = distToBomb < C.ROPE_LENGTH + 40; if (ship.wantsToClamp && inRange && !isAttached) { bomb.attachedShips.push(ship); bomb.onPedestal = false; } else if ((!ship.wantsToClamp || !inRange) && isAttached) { const index = bomb.attachedShips.indexOf(ship); if (index > -1) bomb.attachedShips.splice(index, 1); if (!inRange) ship.wantsToClamp = false; } if (state.isTwoPlayer && bomb.attachedShips.length === 2 && !bomb.isArmed) { bomb.isArmed = true; UI.show('bomb-hud'); } else if (bomb.attachedShips.length < 2 && bomb.isArmed) { bomb.isArmed = false; UI.hide('bomb-hud'); } }
        function handleWallCollisions(entity, state) { const effectiveRadius = entity.radius + C.WALL_HALF_THICKNESS / state.camera.zoom; state.levelObjects.filter(o => o.type === 'cave_wall').forEach(wall => { for (let i = 0; i < wall.points.length - 1; i++) { const p1 = wall.points[i]; const p2 = wall.points[i + 1]; const lineVec = { x: p2.x - p1.x, y: p2.y - p1.y }; const pointVec = { x: entity.x - p1.x, y: entity.y - p1.y }; const lineLenSq = lineVec.x * lineVec.x + lineVec.y * lineVec.y; if (lineLenSq === 0) continue; const t = Math.max(0, Math.min(1, (pointVec.x * lineVec.x + pointVec.y * lineVec.y) / lineLenSq)); const closestPoint = { x: p1.x + t * lineVec.x, y: p1.y + t * lineVec.y }; const distSq = (entity.x - closestPoint.x) ** 2 + (entity.y - closestPoint.y) ** 2; if (distSq < effectiveRadius * effectiveRadius) { const impactSpeed = Math.hypot(entity.vx, entity.vy); const dist = Math.sqrt(distSq) || 1; const penetration = effectiveRadius - dist; const normal = { x: (entity.x - closestPoint.x) / dist, y: (entity.y - closestPoint.y) / dist }; entity.x += normal.x * penetration; entity.y += normal.y * penetration; const dot = entity.vx * normal.x + entity.vy * normal.y; entity.vx -= 1.8 * dot * normal.x; entity.vy -= 1.8 * dot * normal.y; if (impactSpeed > 50) { let damageMultiplier = 1; if (state.devModeState === 1) damageMultiplier = 0.25; if (state.devModeState === 2) damageMultiplier = 0; const damage = C.DAMAGE_ON_COLLISION * damageMultiplier; if (entity.health !== undefined) entity.health -= damage; if (entity.stability !== undefined) entity.stability -= damage; Physics.spawnExplosion(state, entity.x, entity.y, 5); state.camera.shake = { duration: 0.2, magnitude: 5 }; } return; } } }); }
        function lerpAngle(start, end, amount) { let d = end - start; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return start + d * amount; }
        function updateParticles(state, dt) { for (let i = state.particles.length - 1; i >= 0; i--) { const p = state.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.decay * dt; if (p.life <= 0) state.particles.splice(i, 1); } }
        function spawnThrustParticles(state, ship) { const speed = 100; const angle = ship.angle + Math.PI + (Math.random() - 0.5) * 0.5; state.particles.push({ x: ship.x - Math.cos(ship.angle) * ship.radius, y: ship.y - Math.sin(ship.angle) * ship.radius, vx: ship.vx + Math.cos(angle) * speed, vy: ship.vy + Math.sin(angle) * speed, size: Math.random() * 2 + 1, color: ship.glowColor, life: Math.random() * 0.5 + 0.3, decay: 1.5 }); }
        function spawnExplosion(state, x, y, count) { for(let i=0; i<count; i++) { const speed = Math.random() * 800 + 50; const angle = Math.random() * Math.PI * 2; state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 3 + 2, color: ['#ff0', '#f80', '#f00'][Math.floor(Math.random()*3)], life: Math.random() * 1 + 0.5, decay: 1 }); } }
        function updateCamera(state, dt) { if (state.isSplitScreen) return; let targetX=0, targetY=0, count = 0; state.players.forEach(p => { if(p.health > 0) { targetX += p.x; targetY += p.y; count++; } }); if (count > 0) { targetX /= count; targetY /= count; } else if (state.bomb) { targetX = state.bomb.x; targetY = state.bomb.y; } state.camera.x += (targetX - state.camera.x) * 0.08; state.camera.y += (targetY - state.camera.y) * 0.08; if (state.camera.shake.duration > 0) state.camera.shake.duration -= dt; }
        function isColliding(circle, rect) { const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width)); const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height)); const dX = circle.x - closestX; const dY = circle.y - closestY; return (dX * dX + dY * dY) < (circle.radius * circle.radius); }
        return { update, isColliding, spawnExplosion };
    })();

    // --- INPUT MODULE ---
    const Input = (() => {
        const keys = {};
        function init() { window.addEventListener('keydown', e => { if (!e.repeat) { const state = Game.getGameState(); if (state.status === 'playing' || state.status === 'paused') { if (state.players[0] && e.code === state.players[0].controls.clamp) { state.players[0].wantsToClamp = !state.players[0].wantsToClamp; } if (state.players[1] && e.code === state.players[1].controls.clamp) { state.players[1].wantsToClamp = !state.players[1].wantsToClamp; } } if (e.code === 'KeyP') Game.togglePause(); if (e.code === 'KeyH') UI.toggleHelp(); if (e.code === 'KeyV') Game.cycleDevMode(); } keys[e.code] = true; }); window.addEventListener('keyup', e => { keys[e.code] = false; }); }
        function getPlayerActions(state) { const actions = { p1: {}, p2: {} }; if (state.players[0]) { const c1 = state.players[0].controls; actions.p1 = { up: keys[c1.up], left: keys[c1.left], right: keys[c1.right] }; } if (state.players[1]) { const c2 = state.players[1].controls; actions.p2 = { up: keys[c2.up], left: keys[c2.left], right: keys[c2.right] }; } else { actions.p2 = { up: keys['ArrowUp'] }; } return actions; }
        return { init, getPlayerActions };
    })();

    // --- UI MODULE ---
    const UI = (() => {
        const elements = {};
        const safeColor = '#7cfc00', dangerColor = '#ff4757';
        function init() { const ids = ['p1-hud', 'p2-hud', 'bomb-hud', 'p1-fuel', 'p1-health', 'p2-fuel', 'p2-health', 'harmony-meter', 'bomb-stability', 'message-screen', 'level-message-screen', 'pause-screen', 'level-select-container', 'help-screen', 'toggle-help-button', 'close-help-button', 'dev-mode-hud', 'settings-container']; ids.forEach(id => elements[id] = document.getElementById(id)); elements['toggle-help-button'].addEventListener('click', toggleHelp); elements['close-help-button'].addEventListener('click', () => hide('help-screen')); }
        function get(id) { return elements[id]; }
        function update(state) { if (state.players[0]) updatePlayerHUD(state.players[0], 'p1'); if (state.players[1]) updatePlayerHUD(state.players[1], 'p2'); if (state.bomb && state.bomb.isArmed) { const stability = Math.round(state.bomb.stability); elements['bomb-stability'].textContent = `BOMB: ${stability}%`; elements['bomb-stability'].style.color = stability > 50 ? safeColor : (stability > 25 ? '#f0e68c' : dangerColor); const harmonyText = state.bomb.harmony === 1 ? 'GOOD' : 'POOR'; elements['harmony-meter'].textContent = `HARMONY: ${harmonyText}`; elements['harmony-meter'].style.color = state.bomb.harmony === 1 ? safeColor : dangerColor; } }
        function updatePlayerHUD(player, prefix) { const fuel = Math.max(0, Math.round(player.fuel)); const health = Math.max(0, Math.round(player.health)); elements[`${prefix}-fuel`].textContent = `FUEL: ${fuel}%`; elements[`${prefix}-health`].textContent = `HP: ${health}%`; elements[`${prefix}-fuel`].style.color = fuel > 25 ? '' : dangerColor; elements[`${prefix}-health`].style.color = health > 25 ? '' : dangerColor; }
        function show(id) { elements[id].classList.remove('hidden'); }
        function hide(id) { elements[id].classList.add('hidden'); }
        function showLevelMessage(text, duration, callback) { elements['level-message-screen'].textContent = text; show('level-message-screen'); setTimeout(() => { hide('level-message-screen'); if (callback) callback(); }, duration); }
        function populateLevelSelect(levels) { const levelContainer = elements['level-select-container']; const settingsContainer = elements['settings-container']; levelContainer.innerHTML = ''; settingsContainer.innerHTML = ''; levels.forEach((level, index) => { const button = document.createElement('button'); button.textContent = level.name; button.addEventListener('click', () => Game.startGame(index)); levelContainer.appendChild(button); }); const splitScreenButton = document.createElement('button'); splitScreenButton.id = 'toggle-split-screen-button'; splitScreenButton.addEventListener('click', () => Game.toggleSplitScreen()); settingsContainer.appendChild(splitScreenButton); updateSplitScreenButton(Game.getGameState().isSplitScreen); const scalingButton = document.createElement('button'); scalingButton.id = 'toggle-scaling-button'; scalingButton.addEventListener('click', () => Game.toggleScalingMode()); settingsContainer.appendChild(scalingButton); updateScalingButton(Game.getGameState().scalingMode); }
        function updateSplitScreenButton(isSplitScreen) { const button = document.getElementById('toggle-split-screen-button'); if (button) { button.textContent = `Mode: ${isSplitScreen ? 'Split-Screen' : 'Shared Screen'}`; } }
        function updateScalingButton(scalingMode) { const button = document.getElementById('toggle-scaling-button'); if (button) { const modeText = scalingMode.charAt(0).toUpperCase() + scalingMode.slice(1); button.textContent = `Map Scale: ${modeText}`; } }
        function toggleHelp() { const helpScreen = elements['help-screen']; const isHidden = helpScreen.classList.contains('hidden'); if (isHidden) { const gameState = Game.getGameState(); if (gameState.status === 'playing') { Game.togglePause(true); } show('help-screen'); } else { hide('help-screen'); } }
        return { init, get, update, show, hide, showLevelMessage, populateLevelSelect, toggleHelp, updateSplitScreenButton, updateScalingButton };
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
        function createCavernGrid({width, height, maxRooms, roomMinSize, roomMaxSize}) { let mapGrid = Array.from({ length: height }, () => Array(width).fill('#')); let rooms = []; for (let r = 0; r < maxRooms; r++) { let w = Math.floor(Math.random() * (roomMaxSize - roomMinSize + 1)) + roomMinSize; let h = Math.floor(Math.random() * (roomMaxSize - roomMinSize + 1)) + roomMinSize; let x = Math.floor(Math.random() * (width - w - 2)) + 1; let y = Math.floor(Math.random() * (height - h - 2)) + 1; let newRoom = new Rect(x, y, w, h); if (rooms.some(otherRoom => newRoom.intersect(otherRoom))) continue; for (let i = newRoom.y1; i < newRoom.y2; i++) { for (let j = newRoom.x1; j < newRoom.x2; j++) mapGrid[i][j] = ' '; } if (rooms.length > 0) { let [prevX, prevY] = rooms[rooms.length - 1].center; let [newX, newY] = newRoom.center; const carve = (x, y) => { if (x > 0 && x < width - 1 && y > 0 && y < height - 1) mapGrid[y][x] = ' '; }; if (Math.random() < 0.5) { for (let i = Math.min(prevX, newX); i <= Math.max(prevX, newX); i++) { carve(i, prevY - 2); carve(i, prevY - 1); carve(i, prevY); carve(i, prevY + 1); carve(i, prevY + 2); } for (let i = Math.min(prevY, newY); i <= Math.max(prevY, newY); i++) { carve(newX - 1, i); carve(newX, i); carve(newX + 1, i); } } else { for (let i = Math.min(prevY, newY); i <= Math.max(prevY, newY); i++) { carve(prevX - 1, i); carve(prevX, i); carve(prevX + 1, i); } for (let i = Math.min(prevX, newX); i <= Math.max(prevX, newX); i++) { carve(i, newY - 2); carve(i, newY - 1); carve(i, newY); carve(i, newY + 1); carve(i, newY + 2); } } } rooms.push(newRoom); } if (rooms.length > 0) { const exitRoom = rooms[rooms.length - 1]; mapGrid[exitRoom.center[1]][exitRoom.center[0]] = 'E'; } return { mapGrid, rooms }; }
        function createMazeGrid({width, height, maxRooms, roomMinSize, roomMaxSize}) { let mapGrid = Array.from({ length: height }, () => Array(width).fill('#')); let rooms = []; for (let r = 0; r < maxRooms; r++) { let w = Math.floor(Math.random() * (roomMaxSize - roomMinSize + 1)) + roomMinSize; let h = Math.floor(Math.random() * (roomMaxSize - roomMinSize + 1)) + roomMinSize; let x = Math.floor(Math.random() * (width - w - 2)) + 1; let y = Math.floor(Math.random() * (height - h - 2)) + 1; let newRoom = new Rect(x, y, w, h); if (rooms.some(room => newRoom.intersect(room))) continue; for (let i = newRoom.y1; i < newRoom.y2; i++) { for (let j = newRoom.x1; j < newRoom.x2; j++) { mapGrid[i][j] = ' '; } } if (rooms.length > 0) { let [prevX, prevY] = rooms[rooms.length - 1].center; let [newX, newY] = newRoom.center; const carve = (x, y) => { if (x > 0 && x < width - 1 && y > 0 && y < height - 1) mapGrid[y][x] = ' '; }; if (Math.random() < 0.5) { for (let i = Math.min(prevX, newX); i <= Math.max(prevX, newX); i++) { carve(i, prevY - 2); carve(i, prevY - 1); carve(i, prevY); carve(i, prevY + 1); carve(i, prevY + 2); } for (let i = Math.min(prevY, newY); i <= Math.max(prevY, newY); i++) { carve(newX - 1, i); carve(newX, i); carve(newX + 1, i); } } else { for (let i = Math.min(prevY, newY); i <= Math.max(prevY, newY); i++) { carve(prevX - 1, i); carve(prevX, i); carve(prevX + 1, i); } for (let i = Math.min(prevX, newX); i <= Math.max(prevX, newX); i++) { carve(i, newY - 2); carve(i, newY - 1); carve(i, newY); carve(i, newY + 1); carve(i, newY + 2); } } } rooms.push(newRoom); } if (rooms.length > 0) { const exitRoom = rooms[rooms.length - 1]; mapGrid[exitRoom.center[1]][exitRoom.center[0]] = 'E'; } return { mapGrid, rooms }; }
        function convertGridToLevelObjects(mapGrid, scale) { const objects = []; const height = mapGrid.length; const width = mapGrid[0].length; const isFloor = (x, y) => (x < 0 || y < 0 || x >= width || y >= height) || mapGrid[y][x] !== '#'; for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) { if (!isFloor(x, y)) { if (isFloor(x, y - 1)) objects.push({ type: 'cave_wall', points: [{ x: x * scale, y: y * scale }, { x: (x + 1) * scale, y: y * scale }] }); if (isFloor(x, y + 1)) objects.push({ type: 'cave_wall', points: [{ x: x * scale, y: (y + 1) * scale }, { x: (x + 1) * scale, y: (y + 1) * scale }] }); if (isFloor(x - 1, y)) objects.push({ type: 'cave_wall', points: [{ x: x * scale, y: y * scale }, { x: x * scale, y: (y + 1) * scale }] }); if (isFloor(x + 1, y)) objects.push({ type: 'cave_wall', points: [{ x: (x + 1) * scale, y: y * scale }, { x: (x + 1) * scale, y: (y + 1) * scale }] }); } } } return objects; }
        
        function generate(name, config) {
            let gridData;
            if (config.generatorType === 'maze') {
                gridData = createMazeGrid(config);
            } else {
                gridData = createCavernGrid(config);
            }
            const { mapGrid, rooms } = gridData;
            if (rooms.length < 5) {
                return generate(name, config);
            }
            const scale = config.scale;
            let objects = convertGridToLevelObjects(mapGrid, scale);
            const usedPadRooms = new Set();
            const WALL_HALF_THICKNESS = 7.5; // From physics module, for visual consistency

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
                    // *** FINAL CORRECTION: Add another half-thickness offset to clear the wall completely ***
                    const calculatedY = (floorY * scale) - (WALL_HALF_THICKNESS * 2) - padHeight;
                    return { type: 'landing_pad', x: chosenX * scale, y: calculatedY, width: 2 * scale, height: padHeight };
                }
                return null;
            };

            // 1. Player Start and guaranteed pad
            const startRoom = rooms[0];
            const playerStart = { x: startRoom.center[0] * scale, y: (startRoom.y2 - 2) * scale };
            let playerPad = findLandingPadSpot(startRoom);
            if (playerPad) {
                objects.push(playerPad);
            }
            usedPadRooms.add(startRoom);

            // 2. Bomb and its guaranteed pad
            const bombRoomIndex = Math.floor(rooms.length / 2);
            const bombRoom = rooms[bombRoomIndex];
            let bombStart;

            let bombPad = findLandingPadSpot(bombRoom);
            if (bombPad) {
                objects.push(bombPad);
                // Position bomb directly above the center of the pad
                const padCenterX = bombPad.x + (bombPad.width / 2);
                bombStart = { x: padCenterX, y: (bombRoom.y1 + 2) * scale };
            } else {
                // Fallback: if no pad spot was found, create a default one and position bomb above it
                const fallbackPadX = (bombRoom.center[0] - 1) * scale;
                const fallbackPadY = (bombRoom.y2 * scale) - 10 - (WALL_HALF_THICKNESS * 2);
                objects.push({ type: 'landing_pad', x: fallbackPadX, y: fallbackPadY, width: 2 * scale, height: 10 });
                const padCenterX = fallbackPadX + scale;
                bombStart = { x: padCenterX, y: (bombRoom.y1 + 2) * scale };
            }
            usedPadRooms.add(bombRoom);

            // 3. Guaranteed Corner Pads
            const tl = rooms.reduce((best, room) => (room.x1 + room.y1 < best.x1 + best.y1) ? room : best);
            const tr = rooms.reduce((best, room) => (room.x2 - room.y1 > best.x2 - best.y1) ? room : best);
            const bl = rooms.reduce((best, room) => (room.y2 - room.x1 > best.y2 - best.x1) ? room : best);
            const br = rooms.reduce((best, room) => (room.x2 + room.y2 > best.x2 + best.y2) ? room : best);
            
            const cornerRooms = new Set([tl, tr, bl, br]);
            for (const corner of cornerRooms) {
                if (!usedPadRooms.has(corner)) {
                    let cornerPad = findLandingPadSpot(corner);
                    if (cornerPad) {
                        objects.push(cornerPad);
                        usedPadRooms.add(corner);
                    }
                }
            }

            // 4. Other random pads to meet the defined number
            const numPads = config.numLandingPads || 0;
            const potentialPadRooms = rooms.filter(room => !usedPadRooms.has(room));
            for (let i = potentialPadRooms.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [potentialPadRooms[i], potentialPadRooms[j]] = [potentialPadRooms[j], potentialPadRooms[i]];
            }
            
            let placedRandomPads = 0;
            for (const padRoom of potentialPadRooms) {
                if (placedRandomPads >= numPads) break;
                let randomPad = findLandingPadSpot(padRoom);
                if (randomPad) {
                    objects.push(randomPad);
                    placedRandomPads++;
                }
            }

            // 5. Extraction zone
            let exitPos = null;
            for(let y=0; y<mapGrid.length; y++) {
                const x = mapGrid[y].indexOf('E');
                if (x !== -1) { exitPos = {x, y}; break; }
            }
            if (exitPos) {
                objects.push({ type: 'extraction_zone', x: exitPos.x * scale, y: exitPos.y * scale, width: scale, height: scale });
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

    Game.init();
});
