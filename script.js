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
            camera: { x: 0, y: 0, zoom: 0.4 },
            status: 'menu', // menu, playing, paused, level_complete, game_over
            isTwoPlayer: false,
        };

        function init() {
            UI.init();
            Input.init();
            Renderer.init();
            bindEvents();
            resetGame();
        }

        function bindEvents() {
            UI.get('start-button').addEventListener('click', startGame);
        }

        function resetGame() {
            state = JSON.parse(JSON.stringify(initialGameState));
        }

        function startGame() {
            resetGame();
            UI.hide('message-screen');
            loadLevel(0);
        }

        function loadLevel(levelIndex) {
            state.level = levelIndex;
            const levelData = Levels[levelIndex];

            // Reset level-specific state
            state.particles = [];
            state.levelObjects = levelData.objects.map(o => ({ ...o }));

            // Create Player 1
            const p1Start = levelData.playerStart;
            state.players[0] = createShip(0, p1Start.x, p1Start.y, '#f0e68c', '#ffff00', {
                up: 'w', left: 'a', right: 'd', clamp: 's'
            });
            
            if (state.isTwoPlayer) addPlayer2(true); // Re-add P2 if they were in the last game

            // Create Bomb
            const bombStart = levelData.bombStart;
            state.bomb = createBomb(bombStart.x, bombStart.y);
            
            // FIX: Set initial camera position directly to prevent screen jump
            state.camera.x = p1Start.x;
            state.camera.y = p1Start.y;

            UI.showLevelMessage(`Level ${levelIndex + 1}`, 2000, () => {
                state.status = 'playing';
                lastTime = performance.now();
                if (gameLoopId) cancelAnimationFrame(gameLoopId);
                gameLoop(lastTime);
            });
        }
        
        function addPlayer2(silent = false) {
            if (state.isTwoPlayer && !silent) return;
            state.isTwoPlayer = true;
            const p2Start = Levels[state.level].playerStart;
            state.players[1] = createShip(1, p2Start.x + 80, p2Start.y, '#dda0dd', '#ff00ff', {
                 up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', clamp: 'ArrowDown'
            });
            UI.show('p2-hud');
            if (!silent) console.log("Player 2 has joined!");
        }

        function createShip(id, x, y, color, glowColor, controls) {
            return {
                id, x, y, vx: 0, vy: 0, angle: -Math.PI / 2,
                radius: 20, health: 100, fuel: 100,
                isThrusting: false, isClamping: false,
                color, glowColor, controls
            };
        }

        function createBomb(x, y) {
            return {
                x, y, vx: 0, vy: 0,
                radius: 30, mass: 5,
                stability: 100,
                harmony: 0,
                attachedShips: [],
                isArmed: false,
                onPedestal: true
            };
        }

        function gameLoop(timestamp) {
            gameLoopId = requestAnimationFrame(gameLoop);

            if (state.status === 'paused') {
                lastTime = timestamp; // Prevent large deltaTime spike
                Renderer.drawPauseOverlay();
                return;
            }

            const deltaTime = Math.min(0.05, (timestamp - lastTime) / 1000); // Delta time in seconds, with a cap
            lastTime = timestamp;
            
            if (state.status === 'playing') {
                const actions = Input.getPlayerActions(state);
                if (!state.isTwoPlayer && actions.p2.up) addPlayer2();
                
                Physics.update(state, actions, deltaTime);
                Renderer.draw(state);
                UI.update(state);
                checkWinFailConditions();
            }
        }
        
        function checkWinFailConditions() {
             if (state.status !== 'playing') return;

            // Bomb delivered to extraction zone
            const extractionZone = state.levelObjects.find(o => o.type === 'extraction_zone');
            if (extractionZone && Physics.isColliding({x: state.bomb.x, y: state.bomb.y, radius: state.bomb.radius}, extractionZone) && !state.bomb.onPedestal) {
                state.status = 'level_complete';
                UI.showLevelMessage("Success!", 3000, () => {
                    const nextLevel = state.level + 1;
                    if (Levels[nextLevel]) {
                        loadLevel(nextLevel);
                    } else {
                        endGame("You Win! All Levels Complete!");
                    }
                });
            }

            // All ships destroyed
            if (state.players.length > 0 && state.players.every(p => p.health <= 0)) {
                 endGame("All Ships Destroyed!");
            }
        }
        
        function endGame(message) {
            if(state.status === 'game_over') return; // Prevent multiple calls
            state.status = 'game_over';
            cancelAnimationFrame(gameLoopId);
            UI.get('message-screen').querySelector('h1').textContent = "Game Over";
            UI.get('message-screen').querySelectorAll('.instructions')[0].textContent = message;
            UI.get('message-screen').querySelectorAll('.instructions')[1].textContent = "";
            UI.get('message-screen').querySelectorAll('.instructions')[2].textContent = "Thanks for playing!";
            UI.get('start-button').textContent = "Play Again";
            UI.show('message-screen');
        }

        function togglePause() {
            if (state.status === 'playing') {
                state.status = 'paused';
                UI.show('pause-screen');
            } else if (state.status === 'paused') {
                state.status = 'playing';
                UI.hide('pause-screen');
            }
        }

        return { init, togglePause, endGame };
    })();

    // --- RENDERER MODULE (Canvas Drawing) ---
    const Renderer = (() => {
        let canvas, ctx, width, height;

        function init() {
            canvas = document.getElementById('game-canvas');
            ctx = canvas.getContext('2d');
            resize();
            window.addEventListener('resize', resize);
        }

        function resize() {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            width = canvas.width;
            height = canvas.height;
        }

        function draw(state) {
            ctx.save();
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#050508';
            ctx.fillRect(0,0,width,height);
            
            // --- FIX: Correct camera transformation ---
            ctx.translate(width / 2, height / 2);
            ctx.scale(state.camera.zoom, state.camera.zoom);
            ctx.translate(-state.camera.x, -state.camera.y);

            drawLevel(state);
            drawParticles(state.particles, state.camera.zoom);
            if(state.bomb) drawBomb(state.bomb, state.camera.zoom);
            state.players.forEach(p => drawShip(p, state.camera.zoom));
            
            ctx.restore();
        }
        
        function drawPauseOverlay(){
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(0,0,width,height);
        }

        function drawLevel(state) {
            const zoom = state.camera.zoom;
            state.levelObjects.forEach(obj => {
                if (obj.type === 'cave_wall') {
                    ctx.beginPath();
                    ctx.moveTo(obj.points[0].x, obj.points[0].y);
                    for (let i = 1; i < obj.points.length; i++) {
                        ctx.lineTo(obj.points[i].x, obj.points[i].y);
                    }
                    ctx.strokeStyle = '#556677';
                    ctx.lineWidth = 15 / zoom; // --- FIX: Adjust line width based on zoom
                    ctx.stroke();
                } else if (obj.type === 'landing_pad') {
                    ctx.fillStyle = '#448844';
                    ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
                } else if (obj.type === 'extraction_zone') {
                    ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                    ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
                    ctx.strokeStyle = '#0f0';
                    ctx.lineWidth = 5 / zoom; // --- FIX: Adjust line width based on zoom
                    ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
                }
            });
        }

        function drawShip(ship, zoom) {
            if (ship.health <= 0) return;
            ctx.save();
            ctx.translate(ship.x, ship.y);
            ctx.rotate(ship.angle + Math.PI / 2);

            ctx.shadowColor = ship.glowColor;
            ctx.shadowBlur = 20 / zoom;

            ctx.fillStyle = ship.color;
            ctx.beginPath();
            ctx.moveTo(0, -ship.radius * 0.8);
            ctx.lineTo(-ship.radius * 0.6, ship.radius * 0.6);
            ctx.lineTo(ship.radius * 0.6, ship.radius * 0.6);
            ctx.closePath();
            ctx.fill();
            
            ctx.shadowBlur = 0; // Reset shadow for other objects
            ctx.restore();
        }

        function drawBomb(bomb, zoom) {
            ctx.save();
            ctx.translate(bomb.x, bomb.y);
            
            if(bomb.isArmed) {
                bomb.attachedShips.forEach(ship => {
                    ctx.beginPath();
                    ctx.moveTo(0,0);
                    ctx.lineTo(ship.x - bomb.x, ship.y - bomb.y);
                    ctx.strokeStyle = 'cyan';
                    ctx.lineWidth = 4 / zoom; // --- FIX: Adjust line width based on zoom
                    ctx.stroke();
                });
            }
            
            ctx.shadowColor = bomb.isArmed ? 'cyan' : '#ff4757';
            ctx.shadowBlur = bomb.stability / 5 / zoom;
            
            ctx.beginPath();
            ctx.arc(0, 0, bomb.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#666';
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(0, 0, bomb.radius * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = '#444';
            ctx.fill();

            const blinkRate = bomb.isArmed ? 0.5 : 1.5;
            if (Math.floor(performance.now() / (500 / blinkRate)) % 2 === 0) {
                 ctx.fillStyle = bomb.isArmed ? 'cyan' : '#ff4757';
                 ctx.beginPath();
                 ctx.arc(0, 0, bomb.radius * 0.3, 0, Math.PI * 2);
                 ctx.fill();
            }

            ctx.shadowBlur = 0;
            ctx.restore();
        }
        
        function drawParticles(particles) {
            ctx.globalCompositeOperation = 'lighter';
            particles.forEach(p => {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
        }

        return { init, draw, drawPauseOverlay };
    })();

    // --- PHYSICS MODULE ---
    const Physics = (() => {
        const C = {
            GRAVITY: 80, THRUST_FORCE: 400, ROTATION_SPEED: 4.5,
            FUEL_CONSUMPTION: 15, FUEL_REGEN: 20, DAMAGE_ON_COLLISION: 25,
            BOMB_STABILITY_DRAIN: 5, BOMB_STABILITY_REGEN: 3, 
            HARMONY_ANGLE_THRESHOLD: 0.4, HARMONY_DISTANCE_THRESHOLD: 200,
        };

        function update(state, actions, dt) {
            updateShips(state, actions, dt);
            updateBomb(state, dt);
            updateParticles(state, dt);
            updateCamera(state);
        }
        
        function updateShips(state, actions, dt) {
            state.players.forEach((ship, index) => {
                if (ship.health <= 0) return;
                
                const action = index === 0 ? actions.p1 : actions.p2;
                
                if (action.left) ship.angle -= C.ROTATION_SPEED * dt;
                if (action.right) ship.angle += C.ROTATION_SPEED * dt;

                ship.isThrusting = action.up && ship.fuel > 0;
                if (ship.isThrusting) {
                    ship.vx += Math.cos(ship.angle) * C.THRUST_FORCE * dt;
                    ship.vy += Math.sin(ship.angle) * C.THRUST_FORCE * dt;
                    ship.fuel -= C.FUEL_CONSUMPTION * dt;
                    if(state.particles.length < 300) spawnThrustParticles(state, ship);
                }
                
                if (!state.bomb.isArmed) ship.vy += C.GRAVITY * dt;

                ship.x += ship.vx * dt;
                ship.y += ship.vy * dt;

                handleWallCollisions(ship, state);
                handleObjectCollisions(ship, state);
            });
        }
        
        function updateBomb(state, dt) {
            const bomb = state.bomb;
            if (bomb.onPedestal) return;
            
            if (bomb.isArmed) {
                let totalVx = 0, totalVy = 0, totalX = 0, totalY = 0;
                bomb.attachedShips.forEach(s => {
                    totalVx += s.vx; totalVy += s.vy;
                    totalX += s.x; totalY += s.y;
                });
                bomb.vx = totalVx / bomb.attachedShips.length;
                bomb.vy = totalVy / bomb.attachedShips.length;
                bomb.x = totalX / bomb.attachedShips.length;
                bomb.y = totalY / bomb.attachedShips.length;

                const p1 = bomb.attachedShips[0];
                const p2 = bomb.attachedShips[1];
                const angleDiff = Math.abs((((p1.angle - p2.angle) % (2*Math.PI)) + (3*Math.PI)) % (2*Math.PI) - Math.PI);
                const dist = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
                
                bomb.harmony = 0; // 0 = bad, 1 = good
                if (angleDiff < C.HARMONY_ANGLE_THRESHOLD && dist < C.HARMONY_DISTANCE_THRESHOLD) {
                    bomb.stability += C.BOMB_STABILITY_REGEN * dt;
                    bomb.harmony = 1;
                } else {
                    bomb.stability -= C.BOMB_STABILITY_DRAIN * dt;
                    bomb.harmony = 0;
                }
                bomb.stability = Math.max(0, Math.min(100, bomb.stability));

                if (bomb.stability <= 0) {
                     spawnExplosion(state, bomb.x, bomb.y, 100);
                     bomb.health = 0;
                     Game.endGame("Bomb Destabilized!");
                }
            } else {
                bomb.vy += C.GRAVITY * dt;
                bomb.x += bomb.vx * dt;
                bomb.y += bomb.vy * dt;
                handleWallCollisions(bomb, state);
            }
        }
        
        function handleWallCollisions(entity, state) {
            const wall = state.levelObjects.find(o => o.type === 'cave_wall');
            if (!wall) return;

            for (let i = 0; i < wall.points.length - 1; i++) {
                const p1 = wall.points[i];
                const p2 = wall.points[i+1];
                
                const lineVec = { x: p2.x - p1.x, y: p2.y - p1.y };
                const pointVec = { x: entity.x - p1.x, y: entity.y - p1.y };
                
                const lineLenSq = lineVec.x * lineVec.x + lineVec.y * lineVec.y;
                if (lineLenSq === 0) continue;
                const t = Math.max(0, Math.min(1, (pointVec.x * lineVec.x + pointVec.y * lineVec.y) / lineLenSq));
                
                const closestPoint = { x: p1.x + t * lineVec.x, y: p1.y + t * lineVec.y };
                const distSq = (entity.x - closestPoint.x)**2 + (entity.y - closestPoint.y)**2;

                if (distSq < entity.radius * entity.radius) {
                    const impactSpeed = Math.sqrt(entity.vx**2 + entity.vy**2);
                    const collisionNormal = { x: entity.x - closestPoint.x, y: entity.y - closestPoint.y };
                    const dist = Math.sqrt(distSq) || 1;
                    collisionNormal.x /= dist; collisionNormal.y /= dist;

                    const penetration = entity.radius - dist;
                    entity.x += collisionNormal.x * penetration;
                    entity.y += collisionNormal.y * penetration;

                    const dot = entity.vx * collisionNormal.x + entity.vy * collisionNormal.y;
                    entity.vx -= 1.5 * dot * collisionNormal.x;
                    entity.vy -= 1.5 * dot * collisionNormal.y;
                    
                    if (impactSpeed > 50) {
                        if (entity.health) { // Is a ship
                            entity.health -= C.DAMAGE_ON_COLLISION;
                            if(entity.health <= 0) spawnExplosion(state, entity.x, entity.y, 50);
                        }
                        if (entity.stability) { // Is a bomb
                            entity.stability -= C.DAMAGE_ON_COLLISION;
                        }
                    }
                    return;
                }
            }
        }
        
        function handleObjectCollisions(ship, state) {
            state.levelObjects.forEach(obj => {
                if (obj.type === 'landing_pad') {
                    if (isColliding(ship, obj)) {
                       if (Math.abs(ship.vx) < 15 && Math.abs(ship.vy) < 25 && Math.abs(ship.angle + Math.PI/2) < 0.2) {
                           ship.vy = 0; ship.vx *= 0.8;
                           ship.y = obj.y - ship.radius;
                           ship.fuel = Math.min(100, ship.fuel + C.FUEL_REGEN * (1/60));
                           ship.health = Math.min(100, ship.health + C.FUEL_REGEN * (1/60));
                       } else if(ship.vy > 0) {
                           ship.health -= C.DAMAGE_ON_COLLISION / 2;
                           ship.vy *= -0.5;
                       }
                    }
                }
            });
            
            const bomb = state.bomb;
            const distToBomb = Math.sqrt((ship.x - bomb.x)**2 + (ship.y - bomb.y)**2);
            
            if (ship.isClamping && distToBomb < bomb.radius + ship.radius + 30) {
                if (!bomb.attachedShips.includes(ship)) {
                    bomb.attachedShips.push(ship);
                    bomb.onPedestal = false;
                }
            } else {
                const index = bomb.attachedShips.indexOf(ship);
                if (index > -1) bomb.attachedShips.splice(index, 1);
            }

            if (state.isTwoPlayer && bomb.attachedShips.length === 2 && !bomb.isArmed) {
                bomb.isArmed = true; UI.show('bomb-hud');
            } else if (bomb.attachedShips.length < 2 && bomb.isArmed) {
                bomb.isArmed = false; UI.hide('bomb-hud');
            }
        }

        function updateParticles(state, dt) {
            for (let i = state.particles.length - 1; i >= 0; i--) {
                const p = state.particles[i];
                p.x += p.vx * dt; p.y += p.vy * dt;
                p.life -= p.decay * dt;
                if (p.life <= 0) state.particles.splice(i, 1);
            }
        }
        
        function spawnThrustParticles(state, ship) {
             const speed = 100;
             const angle = ship.angle + Math.PI + (Math.random() - 0.5) * 0.5;
             state.particles.push({
                 x: ship.x - Math.cos(ship.angle) * ship.radius, y: ship.y - Math.sin(ship.angle) * ship.radius,
                 vx: ship.vx + Math.cos(angle) * speed, vy: ship.vy + Math.sin(angle) * speed,
                 size: Math.random() * 2 + 1, color: ship.glowColor, life: Math.random() * 0.5 + 0.3, decay: 1.5
             });
        }
        
        function spawnExplosion(state, x, y, count) {
            for(let i=0; i<count; i++) {
                const speed = Math.random() * 300 + 50;
                const angle = Math.random() * Math.PI * 2;
                state.particles.push({
                    x, y,
                    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                    size: Math.random() * 3 + 2,
                    color: ['#ff0', '#f80', '#f00'][Math.floor(Math.random()*3)],
                    life: Math.random() * 1 + 0.5, decay: 1
                });
            }
        }
        
        function updateCamera(state) {
            let targetX=0, targetY=0, count = 0;
            state.players.forEach(p => {
                if(p.health > 0) { targetX += p.x; targetY += p.y; count++; }
            });
            if (count > 0) { targetX /= count; targetY /= count; } 
            else { targetX = state.bomb.x; targetY = state.bomb.y; }
            
            state.camera.x += (targetX - state.camera.x) * 0.08;
            state.camera.y += (targetY - state.camera.y) * 0.08;
        }
        
        function isColliding(circle, rect) {
            const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
            const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
            const distanceX = circle.x - closestX;
            const distanceY = circle.y - closestY;
            return (distanceX * distanceX + distanceY * distanceY) < (circle.radius * circle.radius);
        }

        return { update, isColliding };
    })();

    // --- INPUT MODULE ---
    const Input = (() => {
        const keys = {};

        function init() {
            window.addEventListener('keydown', e => {
                keys[e.key.toLowerCase()] = true;
                if (e.key.toLowerCase() === 'p') Game.togglePause();
            });
            window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
        }

        function getPlayerActions(state) {
            const actions = { p1: {}, p2: {} };
            if (state.players[0]) {
                const c1 = state.players[0].controls;
                actions.p1 = { up: keys[c1.up], left: keys[c1.left], right: keys[c1.right] };
                state.players[0].isClamping = keys[c1.clamp];
            }
            if (state.players[1]) {
                const c2 = state.players[1].controls;
                actions.p2 = { up: keys[c2.up], left: keys[c2.left], right: keys[c2.right] };
                state.players[1].isClamping = keys[c2.clamp];
            } else {
                 actions.p2 = { up: keys['arrowup'] }; // Check for P2 join
            }
            return actions;
        }

        return { init, getPlayerActions };
    })();

    // --- UI MODULE ---
    const UI = (() => {
        const elements = {};
        const safeColor = '#7cfc00', dangerColor = '#ff4757';

        function init() {
            const ids = ['p1-hud', 'p2-hud', 'bomb-hud', 'p1-fuel', 'p1-health', 'p2-fuel', 'p2-health', 
            'harmony-meter', 'bomb-stability', 'message-screen', 'level-message-screen', 'pause-screen', 'start-button'];
            ids.forEach(id => elements[id] = document.getElementById(id));
        }

        function get(id) { return elements[id]; }

        function update(state) {
            if (state.players[0]) updatePlayerHUD(state.players[0], 'p1');
            if (state.players[1]) updatePlayerHUD(state.players[1], 'p2');
            
            if (state.bomb && state.bomb.isArmed) {
                const harmonyText = state.bomb.harmony === 1 ? 'GOOD' : 'POOR';
                elements['harmony-meter'].textContent = `HARMONY: ${harmonyText}`;
                elements['harmony-meter'].style.color = state.bomb.harmony === 1 ? safeColor : dangerColor;
                
                const stability = Math.round(state.bomb.stability);
                elements['bomb-stability'].textContent = `BOMB: ${stability}%`;
                elements['bomb-stability'].style.color = stability > 50 ? safeColor : (stability > 25 ? '#f0e68c' : dangerColor);
            }
        }
        
        function updatePlayerHUD(player, prefix) {
            const fuel = Math.max(0, Math.round(player.fuel));
            const health = Math.max(0, Math.round(player.health));
            elements[`${prefix}-fuel`].textContent = `FUEL: ${fuel}%`;
            elements[`${prefix}-health`].textContent = `HP: ${health}%`;
            elements[`${prefix}-fuel`].style.color = fuel > 25 ? '' : dangerColor;
            elements[`${prefix}-health`].style.color = health > 25 ? '' : dangerColor;
        }

        function show(id) { elements[id].classList.remove('hidden'); }
        function hide(id) { elements[id].classList.add('hidden'); }
        
        function showLevelMessage(text, duration, callback) {
            elements['level-message-screen'].textContent = text;
            show('level-message-screen');
            setTimeout(() => { hide('level-message-screen'); if (callback) callback(); }, duration);
        }

        return { init, get, update, show, hide, showLevelMessage };
    })();

    // --- LEVEL DATA ---
    const Levels = [
        { // Level 1 - Tutorial
            playerStart: { x: 500, y: 1900 }, bombStart: { x: 500, y: 1500 },
            objects: [
                { type: 'cave_wall', points: [ {x: 0, y: 2000}, {x: 0, y: 0}, {x: 1000, y: 0}, {x: 1000, y: 2000}, {x: 800, y: 2000}, {x: 800, y: 200}, {x: 200, y: 200}, {x: 200, y: 2000}, {x: 0, y: 2000} ]},
                { type: 'cave_wall', points: [ {x: 350, y: 1200}, {x: 650, y: 1200} ]},
                { type: 'landing_pad', x: 450, y: 1950, width: 100, height: 10 },
                { type: 'landing_pad', x: 450, y: 1150, width: 100, height: 10 },
                { type: 'extraction_zone', x: 400, y: 50, width: 200, height: 100 }
            ]
        }
    ];

    // --- START THE GAME ---
    Game.init();
});
