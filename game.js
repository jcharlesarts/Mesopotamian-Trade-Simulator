// Movement cooldown variables
let lastMoveTime = 0;
const MOVE_COOLDOWN = 150; // milliseconds
const canvas = document.getElementById('gameCanvas');
// Use CSS layout for positioning; avoid absolute positioning here
canvas.style.position = '';
canvas.style.display = '';
canvas.style.zIndex = '';
const ctx = canvas.getContext('2d');

let terrainCanvas = null;


let uiMessage = "";
let uiMessageTimer = 0;
let uiMessageIcon = null; // optional icon type for HUD message
let lastObeliskRect = null; // screen-space rect for Deeds hover
// Track mouse position in screen-space (relative to canvas) for hover effects (e.g., Deeds obelisk)
let mouseX = 0;
let mouseY = 0;
if (canvas) {
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  });
  canvas.addEventListener('mouseleave', () => {
    // Move cursor far away to avoid accidental hover when off-canvas
    mouseX = -1e9;
    mouseY = -1e9;
  });
}

// --- Virtual Joystick state (for touch devices) ---
let joystickActive = false;
let joystickDX = 0;
let joystickDY = 0;
let joystickCenter = { x: 0, y: 0 };
let joystickRadius = 0; // pixels
let joystickTouchId = null;

const MAP_WIDTH = 30;
const MAP_HEIGHT = 20;
const TILE_SIZE = 24; // fixed tile size for better alignment
// Vertical world offset to keep cities aligned with terrain features
// Note: entities and terrain both account for this offset; avoid additional runtime translates
const TILE_Y_OFFSET = -TILE_SIZE * 2;

const mapImg = new Image();
// mapImg.src = '';

// New icon sprite
const iconImg = new Image();
iconImg.src = './assets/city-icons/zigs.png';

const ICONS = {
  eridu:     { sx:   0, sy:   0 },
  kish:      { sx: 128, sy:   0 },
  uruk:      { sx: 256, sy:   0 },
  lagash:    { sx: 384, sy:   0 },
  girsu:     { sx: 512, sy:   0 },
  ur:        { sx: 640, sy:   0 },
  nippur:    { sx:   0, sy: 128 },
  susa:      { sx: 128, sy: 128 },
  akkad:     { sx: 256, sy: 128 },
  eshnunna:  { sx: 384, sy: 128 },
  sippar:    { sx: 512, sy: 128 },
  mari:      { sx: 640, sy: 128 },
  caravan:   { sx: 0,   sy: 256 }
};

// UI Theme: fonts and colors (keep text consistent)
const UI = {
  fontSmall: '10px Herculanum, Papyrus, serif',
  fontBody: '13px Herculanum, Papyrus, serif',
  fontTitle: '18px Papyrus, Herculanum, serif',
  text: '#f3f4f6',
  muted: '#e5e7eb',
  accent: '#ffd166',
  warn: '#ffd166',
  danger: '#ff6b6b',
  panel: 'rgba(50,38,24,0.78)'
};

// Achievements / Tablet of Deeds
const ACHIEVEMENTS = {
  honey_north: { name: 'Jar of Honey', desc: 'First trade to a northern city', icon: 'drop' },
  cuneiform_tablet: { name: 'Cuneiform Tablet', desc: 'Signed by a famed Sumerian', icon: 'check' },
  cylinder_seal: { name: 'Cylinder Seal', desc: 'Established 3 trade routes', icon: 'swords' },
  clay_bullae: { name: 'Clay Bullae', desc: '5 safe deliveries in a row', icon: 'check' },
  ziggurat_brick: { name: 'Ziggurat Brick', desc: 'Escaped a swarm with cargo intact', icon: 'alert' }
};
let unlockedAchievements = new Set();
let safeDeliveryStreak = 0;
let wasCaughtSinceLastDelivery = false;
let wasChasedThisSwarm = false;
let deedsLog = [];

const SUMERIAN_FIGURES = ['Enheduanna', 'Sargon', 'Gilgamesh', 'Ur-Nammu', 'Hammurabi', 'Naram-Sin'];

function unlockAchievement(id, extraText) {
  if (unlockedAchievements.has(id)) return;
  unlockedAchievements.add(id);
  const a = ACHIEVEMENTS[id];
  if (!a) return;
  const title = a.name;
  const detail = extraText || a.desc;
  addDeed(`${title} — ${detail}`, a.icon);
  showTempMessage(`${title}: ${detail}`, a.icon || 'check');
}

function addDeed(text, iconType) {
  // Keep an internal log for on-canvas obelisk rendering
  deedsLog.unshift({ text, icon: iconType || 'check', at: Date.now() });
  if (deedsLog.length > 30) deedsLog.pop();
  // Also add to compact HUD log (reuses that renderer)
  hudLog.unshift({ text, hudIcon: iconType || 'check', addedAt: Date.now() });
  if (hudLog.length > 30) hudLog.pop();
}

// More triangular, pyramid-like pixel structure for a single tile
const zigguratPattern = [
  ["",    "",      "#6e4b3a",    "",    ""],
  ["",   "#a9746e", "#d9b08c", "#a9746e", ""],
  ["#6e4b3a", "#a9746e", "#fff0d6", "#a9746e", "#6e4b3a"],
  ["",   "#6e4b3a", "#b97a56", "#6e4b3a", ""],
  ["",    "",     "#3d2b1f",    "",    ""]
];

// Single authoritative definition of cityStates, containing up-to-date coordinates and names
const cityStates = [
  { name: "Eridu",      x: 5,  y: 17, resource: "Wheat",    need: "Wood",      profession: "Farmers" },
  { name: "Kish",       x: 18, y: 13, resource: "Wood",     need: "Cloth",     profession: "Carpenters" },
  { name: "Uruk",       x: 10, y: 16, resource: "Cloth",    need: "Metal",     profession: "Weavers" },
  { name: "Lagash",     x: 15, y: 18, resource: "Fish",     need: "Jewelry",   profession: "Fishermen" },
  { name: "Girsu",      x: 17, y: 19, resource: "Baskets",  need: "Fish",      profession: "Basket Weavers" },
  { name: "Ur",         x: 11, y: 19, resource: "Oil",      need: "Baskets",   profession: "Oil Pressers" },
  { name: "Nippur",     x: 14, y: 12, resource: "Metal",    need: "Fish",      profession: "Smiths" },
  { name: "Susa",       x: 24, y: 8,  resource: "Gold",     need: "Wheat",     profession: "Jewelers" },
  { name: "Akkad",      x: 21, y: 11, resource: "Tools",    need: "Oil",       profession: "Toolmakers" },
  { name: "Eshnunna",   x: 23, y: 10, resource: "Stone",    need: "Gold",      profession: "Masons" },
  { name: "Sippar",     x: 20, y: 7,  resource: "Dyes",     need: "Tools",     profession: "Dyers" },
  { name: "Mari",       x: 27, y: 13, resource: "Horses",   need: "Stone",     profession: "Traders" }
];

const akkadArmy = {
  active: false,
  raiders: [], // units that march to cities and ravage tiles
  skirmishers: [], // units that can break off and chase the player
  cooldown: 0, // downtime between swarms
  departDelay: 0, // frames to wait after announcement before marching
  ravaged: new Map(), // Map key "x,y" -> step index when ravaged
  ravageStep: 0, // global step counter for fading tracks
  targetsList: [], // names of targeted cities for banner
  preparing: false, // rumor phase active
  deliveriesUntilSwarm: 0, // countdown in number of completed deliveries
  deliveriesSinceLastSwarm: 0, // progression tracker
  pendingSwarm: false // waiting for cooldown to end, then auto-trigger
};

// --- Bandits mechanic (random desert ambush) ---
const bandits = {
  active: false,
  packs: [], // each: { x,y, cooldown, moveInterval, chaseTimer, done }
  cooldown: 0
};
const BANDIT_SPAWN_CHANCE = 0.0008; // per-frame chance when idle
const BANDIT_EVENT_COOLDOWN = 900;  // frames between events
const BANDIT_EVENT_DURATION = 480;  // ~8s at 60fps per pack
const BANDIT_MOVE_INTERVAL = 8;     // slower than skirmishers
const BANDIT_MAX_STACKS = 3;        // allow stacking up to 3 waves
let banditIdleFrames = 0;           // frames since last eligible spawn window

// For compatibility with old code
const cities = cityStates;

const citiesByCoord = {};
cityStates.forEach(c => {
  citiesByCoord[`${c.x},${c.y}`] = c.name;
});
const CHASE_RADIUS = 4; // tiles
const SKIRMISHER_DECISION_RADIUS = 6; // tiles: nearby drop persuades give-up
const CHASE_FALLBACK_RADIUS = 10; // tiles: too far → return to target
const RAVAGE_FADE_STEPS = 20; // tiles of movement until track fully fades
const NPC_CHASE_RADIUS = 5; // tiles: soldiers may chase nearby NPCs

function triggerAkkadianSwarm() {
  if (akkadArmy.active || akkadArmy.cooldown > 0) return;

  akkadArmy.active = true;
  akkadArmy.cooldown = 500;
  akkadArmy.raiders = [];
  akkadArmy.skirmishers = [];
  akkadArmy.ravaged = new Map();
  akkadArmy.ravageStep = 0;
  akkadArmy.targetsList = [];
  akkadArmy.preparing = false; // consume rumor phase
  akkadArmy.deliveriesUntilSwarm = 0;
  akkadArmy.pendingSwarm = false;
  akkadArmy.deliveriesSinceLastSwarm = 0;
  // Add a brief dramatic pause before movement begins (~1.5s at 60fps)
  akkadArmy.departDelay = 90;

  const akkad = cityStates.find(c => c.name === "Akkad");
  const possibleTargets = cityStates.filter(c => c.name !== "Akkad");

  const raiderCount = Math.floor(Math.random() * 3) + 3; // 3-5 raiders
  const skirmishCount = Math.floor(Math.random() * 2) + 2; // 2-3 skirmishers
  const targetedNames = new Set();

  for (let i = 0; i < raiderCount; i++) {
    const target = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
    akkadArmy.raiders.push({
      type: 'raider',
      mode: 'toTarget',
      x: akkad.x,
      y: akkad.y,
      targetX: target.x,
      targetY: target.y,
      reached: false,
      moveInterval: 25, // slowed ~60% for heavy march feel
      cooldown: Math.floor(Math.random() * 25)
    });
    targetedNames.add(target.name);
  }

  for (let i = 0; i < skirmishCount; i++) {
    const target = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
    akkadArmy.skirmishers.push({
      type: 'skirmisher',
      mode: 'toTarget', // will switch to 'chasing' when player nearby
      x: akkad.x,
      y: akkad.y,
      targetX: target.x,
      targetY: target.y,
      reached: false,
      moveInterval: 20, // slowed ~60%
      cooldown: Math.floor(Math.random() * 20),
      chaseTimer: 0
    });
    targetedNames.add(target.name);
  }

  const list = Array.from(targetedNames);
  const listText = list.length > 0 ? `: ${list.join(', ')}` : '';
  const msg = list.length > 0
    ? `The armies of Akkad are marching to: ${list.join(', ')}`
    : `The armies of Akkad are marching`;
  showTempMessage(msg, 'swords');
  // Also add to delivery log for reference
  addLog(msg);
  akkadArmy.targetsList = list;
}

function updateAkkadianSwarm() {
  if (akkadArmy.cooldown > 0) akkadArmy.cooldown--;

  // If not active, but a swarm is pending and cooldown has elapsed, auto-trigger
  if (!akkadArmy.active) {
    if (akkadArmy.pendingSwarm && akkadArmy.cooldown <= 0) {
      triggerAkkadianSwarm();
    }
    return;
  }

  // Brief pause after announcement before units start marching
  if (akkadArmy.departDelay && akkadArmy.departDelay > 0) {
    akkadArmy.departDelay--;
    return;
  }

  // Refuge logic: player can evade scouts inside non-target cities only
  const inCity = isCityTile(player.x, player.y);
  const currentCityName = inCity ? getCityNameAt(player.x, player.y) : null;
  const isAttackedCity = inCity && Array.isArray(akkadArmy.targetsList) && akkadArmy.targetsList.includes(currentCityName);
  if (currentCityName !== lastPlayerCityName || isAttackedCity !== lastPlayerCityAttacked) {
    if (inCity && !isAttackedCity) {
      akkadRefuge.active = true;
      akkadRefuge.cityName = currentCityName;
      const msg = `Refuge in ${currentCityName}. Akkadian scouts won’t enter.`;
      showTempMessage(msg, 'city');
      addLog(msg);
      // Achievement: escaped a swarm with cargo intact (if was being chased)
      if (wasChasedThisSwarm && player.cargo) {
        unlockAchievement('ziggurat_brick');
        wasChasedThisSwarm = false;
      }
    } else if (inCity && isAttackedCity) {
      akkadRefuge.active = false;
      akkadRefuge.cityName = null;
      const msg = `No refuge in ${currentCityName} — under Akkadian attack!`;
      showTempMessage(msg, 'fire');
      addLog(msg);
    } else {
      akkadRefuge.active = false;
      akkadRefuge.cityName = null;
    }
    lastPlayerCityName = currentCityName;
    lastPlayerCityAttacked = isAttackedCity;
  }

  const moveUnitToward = (unit, tx, ty) => {
    const dx = tx - unit.x;
    const dy = ty - unit.y;
    if (dx !== 0) unit.x += Math.sign(dx);
    else if (dy !== 0) unit.y += Math.sign(dy);
  };

  const manhattan = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

  // Update raiders: slow march, ravage trail
  for (const r of akkadArmy.raiders) {
    if (r.reached) continue;
    if (r.cooldown > 0) { r.cooldown--; continue; }
    moveUnitToward(r, r.targetX, r.targetY);
    // Ravage this tile
    akkadArmy.ravageStep++;
    akkadArmy.ravaged.set(`${r.x},${r.y}`, akkadArmy.ravageStep);
    r.cooldown = r.moveInterval;
    if (r.x === r.targetX && r.y === r.targetY) {
      r.reached = true;
      showTempMessage(`${getCityNameAt(r.x, r.y)} is under Akkadian siege!`, 'alert');
    }
  }

  // Update skirmishers: may chase player if nearby (only if player is carrying)
  for (const s of akkadArmy.skirmishers) {
    if (s.reached) continue;
    // Check proximity to player to trigger chase
    if (s.mode !== 'chasing' && player.cargo && !isPlayerInSafeCity() && manhattan(s.x, s.y, player.x, player.y) <= CHASE_RADIUS) {
      s.mode = 'chasing';
      s.moveInterval = 15; // slower, heavy pursuit
      s.chaseTimer = 600; // chase up to ~10s at 60fps
      showTempMessage("Akkadian scouts spotted you! They're giving chase!", 'runner');
      wasChasedThisSwarm = true;
    }
    // If not chasing player, optionally chase nearby NPC caravans
    if (s.mode !== 'chasing' && !s.npcTargetId && npcCaravans && npcCaravans.length > 0) {
      let nearest = null; let best = Infinity;
      for (const n of npcCaravans) {
        if (n._despawn || n.burning) continue;
        const d = manhattan(s.x, s.y, n.x, n.y);
        if (d < best) { best = d; nearest = n; }
      }
      const limit = debugNpcHazardFocus ? 8 : NPC_CHASE_RADIUS;
      if (nearest && best <= limit) {
        s.mode = 'chasingNPC';
        s.npcTargetId = nearest.id || (nearest.id = (nearest.id || Math.floor(Math.random()*1e9)));
        s.moveInterval = 18;
        s.chaseTimer = 600;
      }
    }

    if (s.cooldown > 0) { s.cooldown--; continue; }

    if (s.mode === 'chasing') {
      // If player made it to a safe city (not a target), skirmishers stop chasing
      if (isPlayerInSafeCity()) {
        s.mode = 'toTarget';
        s.moveInterval = 20;
        s.cooldown = s.moveInterval;
        continue;
      }
      // If player dropped cargo or is too far, give up and return to target
      const dist = manhattan(s.x, s.y, player.x, player.y);
      if (!player.cargo && dist > 2) {
        s.mode = 'toTarget';
        s.moveInterval = 20;
      } else if (dist > CHASE_FALLBACK_RADIUS) {
        s.mode = 'toTarget';
        s.moveInterval = 20;
      }
      if (s.mode !== 'chasing') { s.cooldown = s.moveInterval; continue; }
      moveUnitToward(s, player.x, player.y);
      akkadArmy.ravageStep++;
      s.chaseTimer--;
      if (s.x === player.x && s.y === player.y) {
        s.reached = true; // remove unit after catch
        // Cargo loss on capture
        if (player.cargo) {
          const lost = player.cargo;
          player.cargo = null;
          addLog(`Lost ${lost} to Akkadian raiders`);
          showTempMessage("Raiders seized your cargo! Return to the source city.", 'alert');
          wasCaughtSinceLastDelivery = true;
        } else {
          showTempMessage("Akkadian raiders harassed your caravan, but you carried no cargo.", 'alert');
        }
        // Gold theft by Akkadian raiders (30% of wallet, at least 1 if any)
        if (gold > 0) {
          const taken = loseGoldPercent(0.30, 'Akkadian raiders');
          if (taken > 0) showTempMessage(`Akkadians stole ${taken} gold!`, 'alert');
        }
        // Wagon loss: last added wagon catches fire
        maybeLosePlayerWagon('Akkadian raiders');
      } else if (s.chaseTimer <= 0) {
        s.reached = true; // give up after timer
      }
    } else {
      // Chasing an NPC caravan
      if (s.mode === 'chasingNPC') {
        // Resolve current target reference by id
        let tgt = null;
        for (const n of npcCaravans) { if (n.id === s.npcTargetId) { tgt = n; break; } }
        if (!tgt || tgt._despawn) {
          s.mode = 'toTarget'; s.npcTargetId = null; s.moveInterval = 20; s.cooldown = s.moveInterval; continue;
        }
        moveUnitToward(s, tgt.x, tgt.y);
        s.chaseTimer--;
        if (s.x === tgt.x && s.y === tgt.y) {
          // Capture NPC
          tgt.burning = true; tgt.burnTimer = 90;
          addLog('A trader caravan was lost amidst the Akkadian war.');
          s.mode = 'toTarget'; s.npcTargetId = null; s.moveInterval = 20;
        } else if (s.chaseTimer <= 0) {
          s.mode = 'toTarget'; s.npcTargetId = null; s.moveInterval = 20;
        }
        s.cooldown = s.moveInterval; continue;
      }
      // marching to target city
      moveUnitToward(s, s.targetX, s.targetY);
      akkadArmy.ravageStep++;
      if (s.x === s.targetX && s.y === s.targetY) {
        s.reached = true;
      }
    }
    s.cooldown = s.moveInterval;
  }

  // Determine if swarm is finished
  const allRaidersDone = akkadArmy.raiders.every(r => r.reached);
  const allSkirmishersDone = akkadArmy.skirmishers.every(s => s.reached);
  if (allRaidersDone && allSkirmishersDone) {
    akkadArmy.active = false;
    akkadArmy.cooldown = 1000;
    akkadArmy.raiders = [];
    akkadArmy.skirmishers = [];
    showTempMessage("Akkadian assault has ended.", 'check');
  }
}

function isCityTile(x, y) {
  return !!cities.find(c => c.x === x && c.y === y);
}

function isPlayerInSafeCity() {
  if (!isCityTile(player.x, player.y)) return false;
  const name = getCityNameAt(player.x, player.y);
  return !(Array.isArray(akkadArmy.targetsList) && akkadArmy.targetsList.includes(name));
}

function triggerBandits() {
  if (bandits.cooldown > 0) return;
  // Initialize or stack additional bandit packs up to BANDIT_MAX_STACKS
  if (!bandits.active) {
    bandits.active = true;
    bandits.packs = [];
    bandits.stacks = 0;
  }
  if ((bandits.stacks || 0) >= BANDIT_MAX_STACKS) return;
  bandits.cooldown = BANDIT_EVENT_COOLDOWN;

  // Spawn 1-2 packs from the map edges away from cities
  const packCount = Math.floor(Math.random() * 2) + 1;
  for (let i = 0; i < packCount; i++) {
    let x, y;
    const side = Math.floor(Math.random() * 4); // 0=left,1=right,2=top,3=bottom
    if (side === 0) { x = 0; y = Math.floor(Math.random() * MAP_HEIGHT); }
    else if (side === 1) { x = MAP_WIDTH - 1; y = Math.floor(Math.random() * MAP_HEIGHT); }
    else if (side === 2) { x = Math.floor(Math.random() * MAP_WIDTH); y = 0; }
    else { x = Math.floor(Math.random() * MAP_WIDTH); y = MAP_HEIGHT - 1; }
    // Avoid spawning directly on a city
    if (isCityTile(x, y)) { i--; continue; }
    bandits.packs.push({ x, y, cooldown: 0, moveInterval: BANDIT_MOVE_INTERVAL, chaseTimer: BANDIT_EVENT_DURATION, done: false });
  }
  bandits.stacks = (bandits.stacks || 0) + 1;
  const msg = bandits.stacks > 1 ? "More bandits join the fray!" : "Bandits emerge from the dunes! Seek refuge in a city.";
  showTempMessage(msg, 'bandit');
  addLog(msg);
}

function updateBandits() {
  if (bandits.cooldown > 0) bandits.cooldown--;

  // Random spawn chance when idle or stack new wave if under stack cap
  if (bandits.cooldown <= 0) {
    if (!bandits.active) {
      // Pity timer: increase chance the longer we idle; hard cap to avoid spam
      banditIdleFrames++;
      const mult = 1 + Math.min(2.5, banditIdleFrames / 1800); // up to 3.5x after ~30s idle
      const eff = Math.min(0.02, BANDIT_SPAWN_CHANCE * mult);
      if (Math.random() < eff) {
        triggerBandits();
        banditIdleFrames = 0;
      }
      return;
    } else if ((bandits.stacks || 0) < BANDIT_MAX_STACKS) {
      if (Math.random() < BANDIT_SPAWN_CHANCE * 0.5) triggerBandits();
    }
  } else {
    // Under cooldown; do not count idle time
    banditIdleFrames = 0;
  }
  if (!bandits.active) return;

  // If player is on a city tile, bandits disperse
  if (isCityTile(player.x, player.y)) {
    bandits.active = false;
    bandits.packs = [];
    bandits.stacks = 0;
    const msg = "You found refuge within the city walls. Bandits disperse.";
    showTempMessage(msg, 'city');
    addLog(msg);
    return;
  }

  // Helper movement toward player, avoiding cities (skip zero-length moves)
  const stepToward = (unit, tx, ty) => {
    const dx = Math.sign(tx - unit.x);
    const dy = Math.sign(ty - unit.y);
    const candidates = [];
    // Prefer the axis with larger distance first
    const adx = Math.abs(tx - unit.x);
    const ady = Math.abs(ty - unit.y);
    if (adx >= ady) {
      if (dx !== 0) candidates.push({ nx: unit.x + dx, ny: unit.y });
      if (dy !== 0) candidates.push({ nx: unit.x, ny: unit.y + dy });
    } else {
      if (dy !== 0) candidates.push({ nx: unit.x, ny: unit.y + dy });
      if (dx !== 0) candidates.push({ nx: unit.x + dx, ny: unit.y });
    }
    for (const s of candidates) {
      if (s.nx < 0 || s.nx >= MAP_WIDTH || s.ny < 0 || s.ny >= MAP_HEIGHT) continue;
      if (isCityTile(s.nx, s.ny)) continue; // won't enter cities
      unit.x = s.nx; unit.y = s.ny; return;
    }
    // If blocked or at target, remain in place
  };

  let allDone = true;
  for (const b of bandits.packs) {
    if (b.done) continue;
    allDone = false;
    if (b.cooldown > 0) { b.cooldown--; continue; }
    // Choose nearest target: favor NPCs if player is in a city
    let targetX = player.x, targetY = player.y;
    let bestDist = Math.abs(player.x - b.x) + Math.abs(player.y - b.y);
    if (npcCaravans && npcCaravans.length > 0) {
      for (const n of npcCaravans) {
        if (n._despawn || n.burning) continue;
        const d = Math.abs(n.x - b.x) + Math.abs(n.y - b.y);
        if (d < bestDist || isCityTile(player.x, player.y) || debugNpcHazardFocus) {
          bestDist = d; targetX = n.x; targetY = n.y;
        }
      }
    }
    stepToward(b, targetX, targetY);
    b.cooldown = b.moveInterval;
    b.chaseTimer--;
    // Catch player if same tile outside city
    if (b.x === player.x && b.y === player.y && !isCityTile(b.x, b.y)) {
      // Bandits force you to drop cargo if carrying
      if (player.cargo) {
        droppedCargo.push({ x: player.x, y: player.y, resource: player.cargo });
        const lost = player.cargo;
        player.cargo = null;
        addLog(`Bandits ambushed you — dropped ${lost}`);
        showTempMessage("Bandits forced you to drop your cargo!", 'bandit');
        wasCaughtSinceLastDelivery = true;
      } else {
        showTempMessage("Bandits harass you on the road.", 'bandit');
      }
      // Bandits steal some gold (20% of wallet, at least 1 if any)
      if (gold > 0) {
        const taken = loseGoldPercent(0.20, 'bandits');
        if (taken > 0) showTempMessage(`Bandits stole ${taken} gold!`, 'bandit');
      }
      // Wagon loss: last added wagon catches fire
      maybeLosePlayerWagon('bandits');
      b.done = true;
    }
    if (b.chaseTimer <= 0) {
      b.done = true;
    }
  }

  if (allDone) {
    bandits.active = false;
    bandits.packs = [];
    bandits.stacks = 0;
    const msg = "The bandits lose interest and fade back into the dunes.";
    showTempMessage(msg, 'check');
    addLog(msg);
  }
}

function getCityNameAt(x, y) {
  const match = cityStates.find(c => c.x === x && c.y === y);
  return match ? match.name : "a mysterious site";
}

let completedRoutes = [];
let dashOffset = 0;

function getCityCenterCoords(city) {
  return {
    x: city.x * TILE_SIZE + TILE_SIZE,
    y: city.y * TILE_SIZE + TILE_SIZE
  };
}

function generateOrder() {
  let fromCity, toCity;
  do {
    fromCity = cities[Math.floor(Math.random() * cities.length)];
    toCity = cities[Math.floor(Math.random() * cities.length)];
  } while (fromCity.name === toCity.name || fromCity.resource === toCity.resource);
  
  return {
    from: fromCity.name,
    to: toCity.name,
    resource: fromCity.resource
  };
}

const player = {
  x: 4,
  y: 12,
  cargo: null,
  // Speed multiplier property for future extensibility (not used directly here)
  get speedMultiplier() {
    // Lower multiplier = slower, higher = faster (for future, not used now)
    if (!this.cargo) return 1.0;
    switch ((this.cargo || "").toLowerCase()) {
      case "fish":
      case "cloth":
        return 0.9;
      case "tools":
      case "baskets":
      case "oil":
        return 0.7;
      case "stone":
        return 0.5;
      default:
        return 0.8;
    }
  }
};

function getMoveCooldown() {
  // Faster baseline when empty; heavier penalties when loaded
  if (!player.cargo) return 80; // fastest
  switch ((player.cargo || "").toLowerCase()) {
    case "fish":
    case "cloth":
    case "dyes":
      return 140;
    case "wheat":
    case "wood":
    case "baskets":
    case "oil":
    case "tools":
      return 200;
    case "stone":
    case "metal":
      return 320; // heaviest
    default:
      return 180;
  }
}

let order = generateOrder();
let deliveryLog = [];
let droppedCargo = []; // { x, y, resource }
let showTradeNetwork = false; // highlight overlay toggle
let networkFade = 0; // 0..1 fade amount for network overlay
const NETWORK_FADE_SPEED = 0.12; // smoothing factor per frame
let akkadRefuge = { active: false, cityName: null };
let lastPlayerCityName = null;
let lastPlayerCityAttacked = null;
let lastOrderPanel = { x: 0, y: 0, w: 0, h: 0 };
// Ephemeral on-canvas HUD log (fades out automatically)
let hudLog = []; // { text, hudIcon, addedAt }
const HUD_LOG_TTL = 5000; // ms

// Other trader caravans (NPCs) that travel along player-built routes
let npcCaravans = []; // { x, y, tx, ty, dir, cooldown, interval, color }
const NPC_MAX = 3;
const NPC_SPAWN_CHANCE = 0.003; // per frame when below max
const NPC_MOVE_INTERVAL = 16; // slower NPC wagons
let npcSpawnCooldown = 0; // frames until next eligible spawn
let totalDeliveries = 0; // progression counter for NPC unlocks
let debugNpcHazardFocus = false; // dev toggle: enemies prefer NPCs
let showAtmosphere = true; // overlay toggle
let atmosphereMode = 'clear'; // 'clear' | 'overcast' | 'rain' | 'dust'
let atmoNextSwitchMs = 0;
let moebiusClouds = []; // large cartoon clouds floating across
let atmoNextCartoonMs = 0;

// NPC contract snipe tuning (rarer, environment-influenced)
let npcSnipeCooldown = 0; // frames before another NPC can accept/undercut
const NPC_ACCEPT_BASE_CHANCE = 0.08;   // 8% base chance to accept at source
const NPC_UNDERCUT_BASE_CHANCE = 0.05; // 5% base chance to undercut at destination
function npcSnipeEnvMultiplier() {
  // Make it feel like an environmental effect
  switch (atmosphereMode) {
    case 'rain': return 1.3;   // busier ports in rain
    case 'dust': return 1.15;  // unrest, a bit more competition
    case 'overcast': return 1.0;
    case 'clear':
    default: return 0.8;       // calmer days
  }
}

// Player caravan growth (extra wagons) and loss effects
let playerWagons = 1; // total wagons including the head
let playerBurningWagons = []; // [{x,y,life}]

function checkAndExpandCaravan() {
  const routes = completedRoutes.length;
  // First expansion at 9 routes
  if (routes >= 9 && playerWagons < 2) {
    playerWagons = 2;
    addLog('Caravan expanded: a second wagon joins.');
    showTempMessage('Your caravan grows to two wagons!', 'check');
  }
  // Second expansion at 25 routes
  if (routes >= 25 && playerWagons < 3) {
    playerWagons = 3;
    addLog('Caravan expanded: a third wagon joins.');
    showTempMessage('Your caravan grows to three wagons!', 'check');
  }
}

function maybeLosePlayerWagon(cause) {
  if (playerWagons <= 1) return;
  // Determine last trailing wagon trail index prior to removal
  const trailIdx = (playerWagons - 1) * 3; // matches render spacing
  if (playerTrail[trailIdx]) {
    const [txs, tys] = playerTrail[trailIdx].split(',').map(n => parseInt(n, 10));
    playerBurningWagons.push({ x: txs, y: tys, life: 90 });
  }
  playerWagons -= 1;
  addLog(`A wagon was lost to ${cause}.`);
  showTempMessage('A wagon was destroyed!', 'alert');
}

// Economy: gold wallet and stats
let gold = 0;
let goldEarned = 0;
let goldLost = 0;

// For new gold counter box
let totalGold = 0;
let collectedGold = 0;
let lostGold = 0;

function updateGoldUI() {
  // Update new gold counter box
  const t = document.getElementById('gold-total');
  const c = document.getElementById('gold-collected');
  const l = document.getElementById('gold-lost');
  if (t) t.textContent = String(totalGold);
  if (c) c.textContent = String(collectedGold);
  if (l) l.textContent = String(lostGold);
}

function gainGold(amount, reason) {
  const n = Math.max(0, Math.floor(amount || 0));
  if (n <= 0) return;
  gold += n;
  goldEarned += n;
  totalGold = gold;
  collectedGold += n;
  addLog(`Earned ${n} gold${reason ? ' — ' + reason : ''}`);
  updateGoldUI();
}

function loseGold(amount, reason) {
  const n = Math.max(0, Math.floor(amount || 0));
  if (n <= 0) return 0;
  const taken = Math.min(gold, n);
  if (taken > 0) {
    gold -= taken;
    goldLost += taken;
    totalGold = gold;
    lostGold += taken;
    addLog(`Lost ${taken} gold${reason ? ' — ' + reason : ''}`);
    updateGoldUI();
  }
  return taken;
}

function loseGoldPercent(pct, reason) {
  const frac = Math.max(0, Math.min(1, pct || 0));
  const n = Math.max(1, Math.floor(gold * frac));
  return loseGold(n, reason);
}

function pickNextAtmosphereMode() {
  // Weighted random; bias toward clear/overcast, occasional rain or dust
  const roll = Math.random();
  const prev = atmosphereMode;
  let next = 'clear';
  if (roll < 0.55) next = 'clear';
  else if (roll < 0.85) next = 'overcast';
  else if (roll < 0.95) next = 'rain';
  else next = 'dust';
  // Avoid immediate repeat to keep it interesting
  if (next === prev) {
    next = (prev === 'clear') ? (Math.random() < 0.5 ? 'overcast' : 'dust') : 'clear';
  }
  atmosphereMode = next;
  // Schedule next switch 30–60s from now
  atmoNextSwitchMs = performance.now() + (30000 + Math.random() * 30000);
}

function spawnCartoonCloud(fromSide) {
  const w = canvas.width;
  const h = canvas.height;
  const side = fromSide || (Math.random() < 0.5 ? 'left' : 'right');
  const blockSize = 12; // pixelated blocks
  const cx = side === 'left' ? -160 : w + 160;
  const cy = h * (0.25 + Math.random() * 0.4);
  const dir = side === 'left' ? 'right' : 'left';
  const vx = (side === 'left' ? 0.4 : -0.4) * (0.6 + Math.random() * 0.6); // base drift
  const vy = (Math.random() - 0.5) * 0.06;
  const alpha = 0.35 + Math.random() * 0.15;
  const color = Math.random() < 0.5 ? 'rgba(215,230,255,0.95)' : 'rgba(235,245,255,0.95)';
  // Build a pixelated ellipse-ish shape with holes and an edge set
  const a = 8 + Math.floor(Math.random() * 6); // half-width in blocks
  const b = 5 + Math.floor(Math.random() * 4); // half-height in blocks
  const blocks = [];
  const edge = [];
  for (let gy = -b; gy <= b; gy++) {
    for (let gx = -a; gx <= a; gx++) {
      const nx = gx / a;
      const ny = gy / b;
      if (nx * nx + ny * ny <= 1.0) {
        // occasional holes for a moebius-like airy feel
        if (Math.random() < 0.12) continue;
        const dx = gx * blockSize;
        const dy = gy * blockSize;
        blocks.push({ dx, dy });
      }
    }
  }
  // Determine edge blocks (simple neighbor check)
  const hasBlock = new Set(blocks.map(b => `${b.dx},${b.dy}`));
  const dir4 = [[blockSize,0],[-blockSize,0],[0,blockSize],[0,-blockSize]];
  for (const b of blocks) {
    let border = false;
    for (const d of dir4) {
      if (!hasBlock.has(`${b.dx + d[0]},${b.dy + d[1]}`)) { border = true; break; }
    }
    if (border && Math.random() < 0.7) edge.push({ dx: b.dx, dy: b.dy });
  }
  moebiusClouds.push({ x: cx, y: cy, vx, vy, alpha, color, blockSize, blocks, edge, dir });
}

function updateAtmosphereCartoon() {
  const now = performance.now();
  // Spawn occasionally; limit simultaneous clouds
  if (moebiusClouds.length < 3 && (atmoNextCartoonMs === 0 || now >= atmoNextCartoonMs)) {
    spawnCartoonCloud();
    atmoNextCartoonMs = now + (8000 + Math.random() * 12000);
  }
  // Update and cull
  for (let i = moebiusClouds.length - 1; i >= 0; i--) {
    const c = moebiusClouds[i];
    // Wind vector by season/mode
    const wv = getWindVector(now / 1000);
    // Slightly higher base speed for clearer motion
    const base = (c.dir === 'right' ? 0.32 : -0.32);
    // ensure net movement toward exit side; wind adds character
    c.vx = base + wv.x * 0.6;
    // minimal net speed
    if (c.dir === 'right' && c.vx < 0.22) c.vx = 0.22;
    if (c.dir === 'left' && c.vx > -0.22) c.vx = -0.22;
    c.vy = (wv.y * 0.25) + Math.sin(now / 900 + i) * 0.06;
    c.x += c.vx;
    c.y += c.vy;
    // keep within vertical band
    const minY = canvas.height * 0.18;
    const maxY = canvas.height * 0.78;
    if (c.y < minY) { c.y = minY; c.vy = Math.abs(c.vy); }
    if (c.y > maxY) { c.y = maxY; c.vy = -Math.abs(c.vy); }
    // cull when well offscreen horizontally
    if (c.x < -240 || c.x > canvas.width + 240) moebiusClouds.splice(i, 1);
  }
}

function getWindVector(tSec) {
  // Simple procedural wind; vary by atmosphereMode
  let sx = 0.0, sy = 0.0;
  if (atmosphereMode === 'clear') {
    sx = 0.20 + 0.10 * Math.sin(tSec * 0.15);
    sy = 0.02 * Math.sin(tSec * 0.22);
  } else if (atmosphereMode === 'overcast') {
    sx = 0.28 + 0.14 * Math.sin(tSec * 0.18 + 1.1);
    sy = 0.03 * Math.sin(tSec * 0.20);
  } else if (atmosphereMode === 'rain') {
    sx = 0.40 + 0.18 * Math.sin(tSec * 0.27 + 0.7);
    sy = 0.08 + 0.04 * Math.sin(tSec * 0.33);
  } else if (atmosphereMode === 'dust') {
    sx = 0.32 + 0.20 * Math.sin(tSec * 0.24 + 2.0);
    sy = -0.04 + 0.06 * Math.sin(tSec * 0.17);
  }
  // Randomized push to avoid uniformity
  sx += 0.02 * Math.sin(tSec * 0.6) + 0.01 * Math.cos(tSec * 1.1);
  return { x: sx, y: sy };
}

// Shared movement attempt for keyboard/joystick
function attemptMove(dx, dy) {
  const now = Date.now();
  const moveCooldown = getMoveCooldown();
  if (now - lastMoveTime < moveCooldown) return false;

  const newX = player.x + dx;
  const newY = player.y + dy;
  if (newX < 0 || newX >= MAP_WIDTH || newY < 0 || newY >= MAP_HEIGHT) return false;
  // If unladen, avoid stepping onto an occupied swarm tile
  if (!player.cargo && isArmyAt(newX, newY)) {
    showTempMessage("Raiders ahead — find another route.", 'warning');
    return false;
  }
  player.x = newX;
  player.y = newY;
  akkadArmy.ravageStep++;
  playerDidMove();
  lastMoveTime = now;
  checkLocation();
  return true;
}

document.addEventListener('keydown', (e) => {
  const keys = {
    ArrowUp:    { dx: 0, dy: -1 },
    ArrowDown:  { dx: 0, dy: 1 },
    ArrowLeft:  { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    w:          { dx: 0, dy: -1 },
    s:          { dx: 0, dy: 1 },
    a:          { dx: -1, dy: 0 },
    d:          { dx: 1, dy: 0 }
  };

  // Akkadian Swarm manual trigger for testing
  if (e.key === "k" || e.key === "K") {
    if (!akkadArmy.active) {
      akkadArmy.cooldown = 0;
      akkadArmy.preparing = false;
      akkadArmy.pendingSwarm = false;
      triggerAkkadianSwarm();
      console.log("Akkadian Swarm Triggered (manual)");
    }
    render();
    return;
  }

  // Toggle trade network highlight
  if (e.key === 'n' || e.key === 'N') {
    showTradeNetwork = !showTradeNetwork;
    const cb = document.getElementById('toggle-network');
    if (cb) cb.checked = showTradeNetwork;
    render();
    return;
  }

  // Debug: trigger bandits on demand
  if (e.key === 'b' || e.key === 'B') {
    bandits.cooldown = 0; // override cooldown for debug
    triggerBandits();
    render();
    return;
  }

  // Debug: spawn additional NPC caravans (+2, max 8)
  if (e.key === 'c' || e.key === 'C') {
    const cap = 8;
    const possible = Math.max(0, cap - (npcCaravans?.length || 0));
    const toSpawn = Math.min(2, possible);
    if (completedRoutes.length > 0 && toSpawn > 0) {
      for (let i = 0; i < toSpawn; i++) spawnNPCOnRandomRoute();
      npcSpawnCooldown = Math.max(npcSpawnCooldown, 60);
      addLog(`Developer: spawned ${toSpawn} trader caravans`);
      showTempMessage(`Spawned ${toSpawn} caravans (dev)`, 'check');
      render();
      return;
    } else {
      showTempMessage('No routes or at max caravans', 'warning');
      render();
      return;
    }
  }

  // Debug: clear all NPC caravans
  if (e.key === 'x' || e.key === 'X') {
    const count = npcCaravans.length;
    npcCaravans = [];
    addLog(`Developer: cleared ${count} caravans`);
    showTempMessage('Cleared caravans (dev)', 'warning');
    render();
    return;
  }

  // Debug: toggle hazard focus (enemies prefer NPCs)
  if (e.key === 'h' || e.key === 'H') {
    debugNpcHazardFocus = !debugNpcHazardFocus;
    addLog(`Developer: hazard focus ${debugNpcHazardFocus ? 'ON' : 'OFF'}`);
    showTempMessage(`Hazard focus ${debugNpcHazardFocus ? 'ON' : 'OFF'}`, debugNpcHazardFocus ? 'alert' : 'check');
    render();
    return;
  }

  // Toggle event log expanded view
  if (e.key === 'l' || e.key === 'L') {
    const list = document.getElementById('event-log-list');
    if (list) {
      list.classList.toggle('expanded');
      const on = list.classList.contains('expanded');
      addLog(`Event log ${on ? 'expanded' : 'collapsed'}`);
      showTempMessage(`Log ${on ? 'expanded' : 'collapsed'}`, on ? 'check' : 'warning');
    }
    render();
    return;
  }

  // Toggle atmosphere overlay
  if (e.key === 'a' || e.key === 'A') {
    showAtmosphere = !showAtmosphere;
    const cb = document.getElementById('toggle-atmo');
    if (cb) cb.checked = showAtmosphere;
    render();
    return;
  }

  // Drop cargo to gain instant speed (escape option)
  if ((e.key === 'q' || e.key === 'Q') && player.cargo) {
    droppedCargo.push({ x: player.x, y: player.y, resource: player.cargo });
    const lost = player.cargo;
    player.cargo = null;
    addLog(`Dropped ${lost} at (${player.x},${player.y})`);
    showTempMessage("You dropped your cargo to move faster!");
    // Notify nearby skirmishers to give up chase and rejoin march
    notifyCargoDropped(player.x, player.y);
    // Do not return; allow movement right after if key pressed again
    return;
  }

  if (keys[e.key]) {
    e.preventDefault();
    const move = keys[e.key];
    if (attemptMove(move.dx, move.dy)) render();
  }
});

// Growing caravan: draw extra wagons trailing behind the player after milestones
let playerTrail = [];

function checkLocation() {
  const city = cities.find(c => c.x === player.x && c.y === player.y);
  // First, attempt to pick up dropped cargo that matches current order
  if (!player.cargo && droppedCargo.length > 0) {
    const idx = droppedCargo.findIndex(dc => dc.x === player.x && dc.y === player.y && dc.resource === order.resource);
    if (idx !== -1) {
      const dc = droppedCargo[idx];
      player.cargo = dc.resource;
      droppedCargo.splice(idx, 1);
      uiMessage = `Picked up dropped ${player.cargo}`;
      uiMessageTimer = 180;
      return;
    }
  }

  if (!city) return;

  if (!player.cargo && city.name === order.from) {
    player.cargo = order.resource;
    uiMessage = `Picked up ${order.resource} from ${order.from}`;
    uiMessageTimer = 180;
  } else if (player.cargo && city.name === order.to) {
    const logEntry = `Delivered ${player.cargo} from ${order.from} to ${order.to}`;
    addLog(logEntry); // Only log delivery; avoid duplicate HUD toast
    // Payment based on route length (Manhattan distance)
    const fromCityPay = cities.find(c => c.name === order.from);
    const toCityPay = cities.find(c => c.name === order.to);
    if (fromCityPay && toCityPay) {
      const dist = Math.abs(fromCityPay.x - toCityPay.x) + Math.abs(fromCityPay.y - toCityPay.y);
      let payout = 5 + dist * 2; // base + per-tile
      // Larger caravans earn proportionally more
      payout = Math.floor(payout * Math.max(1, playerWagons));
      gainGold(payout, `delivery to ${order.to}`);
    }
    // Achievements: safe streak and northern city
    const toCityObj2 = cities.find(c => c.name === order.to);
    if (!wasCaughtSinceLastDelivery) {
      safeDeliveryStreak++;
      if (safeDeliveryStreak >= 5) unlockAchievement('clay_bullae');
    } else {
      safeDeliveryStreak = 0;
      wasCaughtSinceLastDelivery = false;
    }
    if (toCityObj2 && toCityObj2.y < MAP_HEIGHT / 2) {
      unlockAchievement('honey_north');
    }
    // First delivery tablet
    if (!unlockedAchievements.has('cuneiform_tablet')) {
      const signer = SUMERIAN_FIGURES[Math.floor(Math.random() * SUMERIAN_FIGURES.length)];
      unlockAchievement('cuneiform_tablet', `Signed by ${signer}`);
    }

    // Handle Akkadian rumor → swarm scheduling on successful delivery
    handleAkkadRumorsOnDelivery();

    const fromCityObj = cities.find(c => c.name === order.from);
    const toCityObj = cities.find(c => c.name === order.to);
    if (fromCityObj && toCityObj) {
      const from = getCityCenterCoords(fromCityObj);
      const to = getCityCenterCoords(toCityObj);
      completedRoutes.push({
        fromX: from.x, fromY: from.y, toX: to.x, toY: to.y,
        fromName: fromCityObj.name, toName: toCityObj.name,
        fromTileX: fromCityObj.x, fromTileY: fromCityObj.y,
        toTileX: toCityObj.x, toTileY: toCityObj.y
      });
      if (completedRoutes.length >= 3) unlockAchievement('cylinder_seal');
      // Check caravan growth milestones at 9 and 25 routes
      checkAndExpandCaravan();
    }

    // Progression: count successful deliveries for NPC spawning
    totalDeliveries++;
    maybeSpawnNPCs();
    player.cargo = null;
    order = generateOrder();
  }
}

function drawIcon(name, x, y, size = TILE_SIZE) {
  switch (name.toLowerCase()) {
    case "caravan":
      drawWagonIcon(x, y, size);
      break;
    case "fish":
      drawFishIcon(x, y, size);
      break;
    case "stone":
      drawStoneIcon(x, y, size);
      break;
    case "oil":
      drawOilIcon(x, y, size);
      break;
    case "cloth":
      drawClothIcon(x, y, size);
      break;
    case "wheat":
      drawWheatIcon(x, y, size);
      break;
    case "baskets":
      drawBasketIcon(x, y, size);
      break;
    case "metal":
      drawMetalIcon(x, y, size);
      break;
    case "gold":
      drawGoldIcon(x, y, size);
      break;
    case "tools":
      drawToolIcon(x, y, size);
      break;
    case "dyes":
      drawDyeIcon(x, y, size);
      break;
    case "horses":
      drawHorseIcon(x, y, size);
      break;
    case "jewelry":
      drawJewelryIcon(x, y, size);
      break;
    case "honey":
      drawHoneyIcon(x, y, size);
      break;
    case "dates":
      drawDatesIcon(x, y, size);
      break;
    case "beer":
      drawBeerIcon(x, y, size);
      break;
    case "copper":
      drawCopperIcon(x, y, size);
      break;
    case "tin":
      drawTinIcon(x, y, size);
      break;
    case "textiles":
      drawTextilesIcon(x, y, size);
      break;
    case "incense":
      drawIncenseIcon(x, y, size);
      break;
    case "lapis":
      drawLapisIcon(x, y, size);
      break;
    case "ivory":
      drawIvoryIcon(x, y, size);
      break;
    default:
      drawGenericIcon(x, y, size, name);
  }
}

function drawFishIcon(x, y, size) {
  ctx.save();
  ctx.fillStyle = "#77ccff";
  ctx.beginPath();
  ctx.ellipse(x + size / 2, y + size / 2, size / 3, size / 5, 0, 0, 2 * Math.PI);
  ctx.fill();
  // Tail
  ctx.fillStyle = "#55aadd";
  ctx.beginPath();
  ctx.moveTo(x + size * 0.2, y + size / 2);
  ctx.lineTo(x + size * 0.08, y + size * 0.38);
  ctx.lineTo(x + size * 0.08, y + size * 0.62);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = "#005577";
  ctx.fillRect(x + size * 0.75, y + size / 2 - 2, 2, 2);
  ctx.restore();
}

function drawStoneIcon(x, y, size) {
  ctx.save();
  ctx.fillStyle = "#888888";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#bbb";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + size / 2 + 2, y + size / 2 - 2, size / 5, 0, Math.PI * 1.5);
  ctx.stroke();
  ctx.restore();
}

function drawOilIcon(x, y, size) {
  ctx.save();
  // Oil drop
  ctx.fillStyle = "#222222";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 4, 0, Math.PI * 2);
  ctx.fill();
  // Canister
  ctx.fillStyle = "#555";
  ctx.fillRect(x + size * 0.4, y + size * 0.6, size * 0.2, size * 0.3);
  ctx.restore();
}

function drawClothIcon(x, y, size) {
  ctx.save();
  ctx.fillStyle = "#e0e0ff";
  ctx.fillRect(x + size * 0.2, y + size * 0.5, size * 0.6, size * 0.3);
  ctx.strokeStyle = "#8888cc";
  ctx.beginPath();
  ctx.moveTo(x + size * 0.2, y + size * 0.5);
  ctx.lineTo(x + size * 0.8, y + size * 0.5);
  ctx.moveTo(x + size * 0.2, y + size * 0.8);
  ctx.lineTo(x + size * 0.8, y + size * 0.8);
  ctx.stroke();
  ctx.restore();
}

function drawWheatIcon(x, y, size) {
  ctx.save();
  ctx.strokeStyle = "#dcbf5e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + size / 2, y + size * 0.7);
  ctx.lineTo(x + size / 2, y + size * 0.25);
  ctx.stroke();
  ctx.fillStyle = "#f7e49b";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(
      x + size / 2 - size * 0.07,
      y + size * (0.27 + i * 0.09),
      size * 0.07, size * 0.04, -0.5, 0, 2 * Math.PI
    );
    ctx.ellipse(
      x + size / 2 + size * 0.07,
      y + size * (0.27 + i * 0.09),
      size * 0.07, size * 0.04, 0.5, 0, 2 * Math.PI
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawBasketIcon(x, y, size) {
  ctx.save();
  ctx.fillStyle = "#d2a46c";
  ctx.beginPath();
  ctx.ellipse(x + size / 2, y + size * 0.65, size * 0.2, size * 0.13, 0, 0, Math.PI, true);
  ctx.lineTo(x + size * 0.3, y + size * 0.8);
  ctx.lineTo(x + size * 0.7, y + size * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#a67c52";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size * 0.8, size * 0.2, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
}

function drawMetalIcon(x, y, size) {
  ctx.save();
  ctx.fillStyle = "#aaa";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.18, 0, Math.PI * 2);
  ctx.arc(x + size / 2 + size * 0.18, y + size / 2 + size * 0.05, size * 0.13, 0, Math.PI * 2);
  ctx.arc(x + size / 2 - size * 0.15, y + size / 2 + size * 0.08, size * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGoldIcon(x, y, size) {
  ctx.save();
  ctx.fillStyle = "#ffd700";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fffbe0";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawToolIcon(x, y, size) {
  ctx.save();
  // Hammer handle
  ctx.strokeStyle = "#b97a56";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.70, y + size * 0.7);
  ctx.lineTo(x + size * 0.35, y + size * 0.35);
  ctx.stroke();
  // Hammer head
  ctx.fillStyle = "#888";
  ctx.fillRect(x + size * 0.25, y + size * 0.25, size * 0.18, size * 0.10);
  ctx.restore();
}

function drawDyeIcon(x, y, size) {
  ctx.save();
  // Dye bottle
  ctx.fillStyle = "#a23ecf";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size * 0.6, size * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5e1a7a";
  ctx.fillRect(x + size / 2 - size * 0.07, y + size * 0.48, size * 0.14, size * 0.13);
  ctx.restore();
}

function drawHorseIcon(x, y, size) {
  ctx.save();
  // Simple stylized horse head
  ctx.fillStyle = "#7c5832";
  ctx.beginPath();
  ctx.ellipse(x + size * 0.55, y + size * 0.55, size * 0.16, size * 0.13, -0.2, 0, 2 * Math.PI);
  ctx.fill();
  // Ear
  ctx.beginPath();
  ctx.moveTo(x + size * 0.62, y + size * 0.42);
  ctx.lineTo(x + size * 0.66, y + size * 0.32);
  ctx.lineTo(x + size * 0.60, y + size * 0.38);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = "#fff";
  ctx.fillRect(x + size * 0.61, y + size * 0.56, 2, 2);
  ctx.restore();
}

function drawJewelryIcon(x, y, size) {
  ctx.save();
  // Ring with gem
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#55eaff";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2 - size * 0.10, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHoneyIcon(x, y, size) {
  ctx.save();
  // Jar
  ctx.fillStyle = '#d2b48c';
  ctx.fillRect(x + size*0.35, y + size*0.35, size*0.3, size*0.3);
  ctx.fillStyle = '#f6c453';
  ctx.fillRect(x + size*0.38, y + size*0.38, size*0.24, size*0.22);
  // Lid
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(x + size*0.35, y + size*0.30, size*0.3, size*0.06);
  ctx.restore();
}

function drawDatesIcon(x, y, size) {
  ctx.save();
  ctx.fillStyle = '#8b4513';
  ctx.beginPath();
  ctx.ellipse(x + size*0.45, y + size*0.55, size*0.10, size*0.16, 0.3, 0, Math.PI*2);
  ctx.ellipse(x + size*0.55, y + size*0.55, size*0.10, size*0.16, -0.3, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawBeerIcon(x, y, size) {
  ctx.save();
  // Stein
  ctx.fillStyle = '#d4aa70';
  ctx.fillRect(x + size*0.36, y + size*0.40, size*0.28, size*0.26);
  ctx.fillStyle = '#c09050';
  ctx.fillRect(x + size*0.36, y + size*0.38, size*0.28, size*0.06);
  // Foam
  ctx.fillStyle = '#fff7d1';
  ctx.beginPath();
  ctx.arc(x + size*0.42, y + size*0.38, size*0.05, 0, Math.PI*2);
  ctx.arc(x + size*0.50, y + size*0.36, size*0.06, 0, Math.PI*2);
  ctx.arc(x + size*0.58, y + size*0.38, size*0.05, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawCopperIcon(x, y, size) {
  ctx.save();
  ctx.fillStyle = '#b87333';
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size*0.17, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawTinIcon(x, y, size) {
  ctx.save();
  ctx.fillStyle = '#c0c0c0';
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size*0.17, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawTextilesIcon(x, y, size) {
  ctx.save();
  ctx.fillStyle = '#cfcfe6';
  ctx.fillRect(x + size*0.32, y + size*0.46, size*0.36, size*0.20);
  ctx.strokeStyle = '#9b9bc0';
  ctx.beginPath();
  ctx.moveTo(x + size*0.32, y + size*0.46);
  ctx.lineTo(x + size*0.68, y + size*0.46);
  ctx.moveTo(x + size*0.32, y + size*0.66);
  ctx.lineTo(x + size*0.68, y + size*0.66);
  ctx.stroke();
  ctx.restore();
}

function drawIncenseIcon(x, y, size) {
  ctx.save();
  // Burner base
  ctx.fillStyle = '#a67c52';
  ctx.fillRect(x + size*0.40, y + size*0.58, size*0.20, size*0.08);
  // Smoke
  ctx.strokeStyle = 'rgba(210,210,210,0.8)';
  ctx.beginPath();
  ctx.moveTo(x + size*0.50, y + size*0.58);
  ctx.bezierCurveTo(x + size*0.48, y + size*0.50, x + size*0.60, y + size*0.46, x + size*0.54, y + size*0.38);
  ctx.stroke();
  ctx.restore();
}

function drawLapisIcon(x, y, size) {
  ctx.save();
  ctx.fillStyle = '#1b4ea0';
  ctx.beginPath();
  ctx.moveTo(x + size*0.50, y + size*0.30);
  ctx.lineTo(x + size*0.65, y + size*0.50);
  ctx.lineTo(x + size*0.50, y + size*0.70);
  ctx.lineTo(x + size*0.35, y + size*0.50);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawIvoryIcon(x, y, size) {
  ctx.save();
  ctx.strokeStyle = '#f4eadc';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + size*0.50, y + size*0.56, size*0.18, Math.PI*0.2, Math.PI*0.9);
  ctx.stroke();
  ctx.restore();
}

function drawGenericIcon(x, y, size, name) {
  ctx.save();
  // Try to make a unique fallback for unknown names
  ctx.fillStyle = "#999";
  ctx.fillRect(x + size * 0.25, y + size * 0.25, size * 0.5, size * 0.5);
  ctx.fillStyle = "#222";
  ctx.font = "bold 10px Herculanum, Papyrus, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let letter = (typeof name === "string" && name.length > 0) ? name[0].toUpperCase() : "?";
  ctx.fillText(letter, x + size / 2, y + size / 2);
  ctx.restore();
}

function drawZiggurat(x, y, size = TILE_SIZE) {
  const pattern = zigguratPattern;
  const rows = pattern.length;
  for (let row = 0; row < rows; row++) {
    const cols = pattern[row];
    const cellH = size / rows;
    const cellW = size / cols.length;
    for (let col = 0; col < cols.length; col++) {
      const color = cols[col];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + col * cellW, y + row * cellH, cellW, cellH);
    }
  }
}

function drawWagonIcon(x, y, size) {
  const wheelSize = size * 0.2;
  const bodyWidth = size * 0.6;
  const bodyHeight = size * 0.3;

  // Draw wagon base
  ctx.fillStyle = "#6b4423"; // wood brown
  ctx.fillRect(x + (size - bodyWidth) / 2, y + size * 0.6, bodyWidth, bodyHeight);

  // Draw wagon cover
  ctx.beginPath();
  ctx.fillStyle = "#ddd";
  ctx.arc(x + size / 2, y + size * 0.55, bodyWidth / 2, Math.PI, 0);
  ctx.fill();

  // Draw wheels
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + size * 0.35, y + size * 0.9, wheelSize / 2, 0, Math.PI * 2);
  ctx.arc(x + size * 0.65, y + size * 0.9, wheelSize / 2, 0, Math.PI * 2);
  ctx.fill();
}

function addLog(entry) {
  deliveryLog.unshift(entry);
  if (deliveryLog.length > 50) deliveryLog.pop();

  // Update DOM sidebar list if present
  const list = document.getElementById('event-log-list');
  if (list) {
    const style = classifyLog(entry);
    const li = document.createElement('li');
    const safe = entry.replace(/&/g, '&amp;').replace(/</g,'&lt;');
    const cls = style.iconClass ? ` ${style.iconClass}` : '';
    li.innerHTML = `<span class="log-icon${cls}" style="background:${style.color}"></span>` +
                   `<span class="log-text">${safe}</span>`;
    list.prepend(li);
    // Keep latest ~10 visible in DOM (2 rows shorter)
    while (list.children.length > 10) list.removeChild(list.lastChild);
  }

  // Also append to ephemeral on-canvas HUD log
  const meta = classifyLog(entry);
  hudLog.unshift({ text: entry, hudIcon: meta.hudIcon || null, addedAt: Date.now() });
  if (hudLog.length > 30) hudLog.pop();
}

function classifyLog(entry) {
  const t = entry || "";
  // Determine category and color coding
  if (t.startsWith("Delivered ")) return { cat: 'delivery', color: '#3fb950', iconClass: 'type-check', hudIcon: 'check' };
  if (t.startsWith("Earned ")) return { cat: 'gold', color: '#ffd166', iconClass: 'type-coin', hudIcon: 'coin' };
  if (t.includes("Rumors swirl")) return { cat: 'rumor', color: '#f2c14e', iconClass: 'type-cloud', hudIcon: 'cloud' };
  if (t.includes("marching")) return { cat: 'swarm', color: '#e55353', iconClass: 'type-swords', hudIcon: 'swords' };
  if (t.includes("under Akkadian siege")) return { cat: 'siege', color: '#c53030', iconClass: 'type-alert', hudIcon: 'alert' };
  if (t.startsWith("Dropped")) return { cat: 'drop', color: '#58a6ff', iconClass: 'type-drop', hudIcon: 'drop' };
  if (t.startsWith("Lost")) return { cat: 'loss', color: '#f78c6c', iconClass: 'type-alert', hudIcon: 'alert' };
  if (t.includes('ambushed by bandits') || t.includes('lost amidst the Akkadian war')) return { cat: 'npc-loss', color: '#ff784d', iconClass: 'type-fire', hudIcon: 'fire' };
  if (t.includes('Another caravan accepted') || t.includes('Another caravan delivered')) return { cat: 'npc-snipe', color: '#ffb703', iconClass: 'type-warning', hudIcon: 'alert' };
  if (t.includes("Raiders ahead")) return { cat: 'warning', color: '#ffb703', iconClass: 'type-warning', hudIcon: 'warning' };
  return { cat: 'info', color: '#9da3af', iconClass: 'type-dot', hudIcon: null };
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = (text || '').split(/\s+/);
  let line = '';
  let linesDrawn = 0;
  for (let n = 0; n < words.length; n++) {
    const test = line ? (line + ' ' + words[n]) : words[n];
    const w = ctx.measureText(test).width;
    if (w > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      linesDrawn++;
      if (linesDrawn >= maxLines) return linesDrawn;
      line = words[n];
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    linesDrawn++;
  }
  return linesDrawn;
}

// Measure-only helper: how many wrapped lines would be used (with ellipsis if truncated)
function measureWrappedLines(ctx, text, maxWidth, maxLines = 2) {
  const words = (text || '').split(/\s+/);
  let line = '';
  const lines = [];
  for (let n = 0; n < words.length; n++) {
    const test = line ? (line + ' ' + words[n]) : words[n];
    const w = ctx.measureText(test).width;
    if (w > maxWidth && n > 0) {
      lines.push(line);
      line = words[n];
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  return Math.min(lines.length, maxLines);
}

// Draw wrapped text up to maxLines, ellipsizing the last line if it overflows
function drawWrappedTextEllipsized(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = (text || '').split(/\s+/);
  let line = '';
  const lines = [];
  for (let n = 0; n < words.length; n++) {
    const test = line ? (line + ' ' + words[n]) : words[n];
    const w = ctx.measureText(test).width;
    if (w > maxWidth && n > 0) {
      lines.push(line);
      line = words[n];
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  // If we ran out of space but still had words, ellipsize the last line
  if (lines.length === maxLines && (words.length > 0)) {
    let last = lines[lines.length - 1];
    const ell = '…';
    if (ctx.measureText(last).width > maxWidth) {
      // ensure last fits even before adding ellipsis
      while (last.length > 0 && ctx.measureText(last).width > maxWidth) {
        last = last.slice(0, -1);
      }
    }
    // append ellipsis and trim if needed
    while (last.length > 0 && ctx.measureText(last + ell).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = last + ell;
  }

  for (let i = 0; i < lines.length && i < maxLines; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
  return Math.min(lines.length, maxLines);
}

// Draws chiseled-looking text by layering highlight and shadow offsets under the base fill
function drawChiseledText(ctx, text, x, y) {
  const base = ctx.fillStyle;
  // Dark etched shadow (down-right) — slightly stronger for contrast
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(text, x + 1, y + 1);
  // Light top-left highlight
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText(text, x - 1, y - 1);
  // Base fill
  ctx.fillStyle = base;
  ctx.fillText(text, x, y);
}

// Wrapped chiseled text with ellipsis on final line if needed
function drawWrappedTextChiseled(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = (text || '').split(/\s+/);
  let line = '';
  const lines = [];
  for (let n = 0; n < words.length; n++) {
    const test = line ? (line + ' ' + words[n]) : words[n];
    const w = ctx.measureText(test).width;
    if (w > maxWidth && n > 0) {
      lines.push(line);
      line = words[n];
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  if (lines.length === maxLines && words.length > 0) {
    let last = lines[lines.length - 1];
    const ell = '…';
    if (ctx.measureText(last).width > maxWidth) {
      while (last.length > 0 && ctx.measureText(last).width > maxWidth) last = last.slice(0, -1);
    }
    while (last.length > 0 && ctx.measureText(last + ell).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last + ell;
  }

  for (let i = 0; i < lines.length && i < maxLines; i++) {
    drawChiseledText(ctx, lines[i], x, y + i * lineHeight);
  }
  return Math.min(lines.length, maxLines);
}

function renderCompactLog() {
  // Draws last 3 entries as compact pills under the swarm banner
  if (!hudLog || hudLog.length === 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const startY = (lastOrderPanel?.y || 4) + (lastOrderPanel?.h || 40) + 6 + 22 + 8; // below banner
  const marginX = 16;
  const rowH = 20;
  const maxWidth = canvas.width - marginX * 2;

  ctx.font = UI.fontBody;
  let y = startY;
  const now = Date.now();
  // purge expired and take freshest 3 visible
  hudLog = hudLog.filter(h => now - h.addedAt < HUD_LOG_TTL);
  const items = hudLog.slice(0, 3);
  for (let i = 0; i < items.length; i++) {
    const h = items[i];
    const age = now - h.addedAt;
    const fade = 1 - Math.min(1, age / HUD_LOG_TTL); // 1..0
    const text = h.text;
    const textW = Math.min(ctx.measureText(text).width, maxWidth - 48);
    const w = textW + 48; // padding + icon space
    const x = (canvas.width - w) / 2;
    ctx.globalAlpha = 0.85 * fade;
    drawRoundedPanel(x, y, w, rowH, 8, UI.panel);
    // icon
    if (h.hudIcon) drawHUDIcon(x + 12, y + rowH / 2, h.hudIcon);
    // text
    ctx.fillStyle = UI.text;
    ctx.globalAlpha = fade;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 24, y + rowH / 2);
    y += rowH + 6;
  }
  ctx.restore();
}

function renderDeliveryLog() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Lock to screen coordinates

  const logX = 16;
  const logY = 64;
  const logWidth = 320;
  const rowHeight = 16;
  const maxVisibleRows = 8; // total text rows (wrapped lines)

  // Background panel
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(logX, logY, logWidth, rowHeight * (maxVisibleRows + 2));

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = UI.fontBody;
  ctx.fillText('[EVENT LOG]', logX + 10, logY + 14);

  // Entries
  let y = logY + 30;
  let rowsUsed = 0;
  const textLeft = logX + 10 + 14; // space for icon + stripe
  const textWidth = logWidth - (textLeft - logX) - 8;
  ctx.font = UI.fontSmall;
  for (let i = 0; i < deliveryLog.length; i++) {
    if (rowsUsed >= maxVisibleRows) break;
    const entry = deliveryLog[i];
    const style = classifyLog(entry);

    // Left color stripe
    ctx.fillStyle = style.color;
    ctx.fillRect(logX + 8, y - 10, 4, rowHeight);

    // Icon
    ctx.fillStyle = style.color;
    ctx.fillText(style.icon, logX + 16, y);

    // Text wrap and draw
    ctx.fillStyle = '#e5e7eb';
    const used = drawWrappedText(ctx, entry, textLeft, y, textWidth, rowHeight, 2);
    rowsUsed += used;
    y += used * rowHeight + 2;
  }

  ctx.restore();
}

function renderRavagedTiles() {
  if (!akkadArmy.ravaged || akkadArmy.ravaged.size === 0) return;
  ctx.save();
  // Dark maroon overlay that fades per tile based on age
  ctx.fillStyle = "#2b0f0f";
  const toDelete = [];
  akkadArmy.ravaged.forEach((stepAt, key) => {
    const age = akkadArmy.ravageStep - stepAt;
    const ratio = 1 - Math.max(0, Math.min(age, RAVAGE_FADE_STEPS)) / RAVAGE_FADE_STEPS;
    if (ratio <= 0) { toDelete.push(key); return; }
    const [sx, sy] = key.split(',').map(n => parseInt(n, 10));
    ctx.globalAlpha = 0.5 * ratio; // stronger when fresh, fades out
    ctx.fillRect(sx * TILE_SIZE, sy * TILE_SIZE + TILE_Y_OFFSET, TILE_SIZE, TILE_SIZE);
  });
  // Cleanup fully faded tiles
  toDelete.forEach(k => akkadArmy.ravaged.delete(k));
  ctx.restore();
}

function renderDroppedCargo() {
  if (!droppedCargo || droppedCargo.length === 0) return;
  ctx.save();
  droppedCargo.forEach(dc => {
    const px = dc.x * TILE_SIZE;
    const py = dc.y * TILE_SIZE + TILE_Y_OFFSET;
    // subtle backdrop
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    // cargo icon
    drawIcon(dc.resource, px, py);
    // label
    ctx.fillStyle = "#fff";
  ctx.font = UI.fontSmall;
    ctx.textAlign = "center";
    ctx.fillText("Dropped", px + TILE_SIZE / 2, py + TILE_SIZE + 10);
    ctx.textAlign = "start";
  });
  ctx.restore();
}

function renderOrderStatus() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Prevent scale distortion

  // Concise, in-world wording for objectives
  const orderText = player.cargo
    ? `Deliver ${player.cargo} to ${order.to}`
    : `Collect ${order.resource} in ${order.from}`;

  const showDropHint = !!player.cargo && akkadArmy.skirmishers && akkadArmy.skirmishers.some(s => !s.reached && s.mode === 'chasing');

  const panelWidth = 460;
  const panelHeight = showDropHint ? 56 : 40;
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = 4;

  // Rounded backdrop
  drawRoundedPanel(panelX, panelY, panelWidth, panelHeight, 8, UI.panel);

  // Main line
  ctx.fillStyle = UI.text;
  ctx.font = UI.fontTitle;
  ctx.textAlign = "center";
  ctx.fillText(orderText, canvas.width / 2, panelY + (showDropHint ? 22 : 24));

  if (showDropHint) {
    ctx.fillStyle = UI.warn;
    ctx.font = UI.fontBody;
    ctx.fillText("Press Q to drop cargo", canvas.width / 2, panelY + 40);
  }

  // Save geometry for other overlays
  lastOrderPanel = { x: panelX, y: panelY, w: panelWidth, h: panelHeight };

  ctx.textAlign = "start";
  ctx.restore();
}

function isArmyAt(x, y) {
  if (!akkadArmy.active) return false;
  // Any non-reached raider or skirmisher occupying this tile blocks passage
  for (const r of (akkadArmy.raiders || [])) {
    if (!r.reached && r.x === x && r.y === y) return true;
  }
  for (const s of (akkadArmy.skirmishers || [])) {
    if (!s.reached && s.x === x && s.y === y) return true;
  }
  return false;
}

function renderTerrain() {
  if (!terrainCanvas) {
    terrainCanvas = document.createElement("canvas");
    terrainCanvas.width = MAP_WIDTH * TILE_SIZE;
    terrainCanvas.height = MAP_HEIGHT * TILE_SIZE;    const tctx = terrainCanvas.getContext("2d");

    // Warmer parchment desert base
    tctx.fillStyle = "#d9bf8c"; // desert tan (slightly lighter)
    tctx.fillRect(0, 0, terrainCanvas.width, terrainCanvas.height);

    for (let i = 0; i < 1500; i++) {
      const tx = Math.floor(Math.random() * terrainCanvas.width);
      const ty = Math.floor(Math.random() * terrainCanvas.height);
      const shade = ["#c9a76d", "#dab88f", "#b99466", "#e4cfa6"][Math.floor(Math.random() * 4)];
      tctx.fillStyle = shade;
      tctx.fillRect(tx, ty, 1, 1);
    }

    for (let i = 0; i < 1200; i++) {
      const px = Math.floor(Math.random() * MAP_WIDTH) * TILE_SIZE;
      const py = Math.floor(Math.random() * MAP_HEIGHT) * TILE_SIZE + TILE_Y_OFFSET;

      tctx.fillStyle = ["#cfa77b", "#e1be91", "#b28c5e", "#e8d1a9"][Math.floor(Math.random() * 4)];
      const size = Math.random() * 3 + 1;
      tctx.fillRect(px + Math.random() * TILE_SIZE, py + Math.random() * TILE_SIZE, size, size);
    }

    // Add fields/grassland near city-states
    cities.forEach(city => {
      const cx = city.x * TILE_SIZE;
      const cy = city.y * TILE_SIZE + TILE_Y_OFFSET;
      const radius = 2; // 2-tile radius

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= radius) {
            const fx = (city.x + dx) * TILE_SIZE;
            const fy = (city.y + dy) * TILE_SIZE + TILE_Y_OFFSET;
            const greenShade = ["#b4c973", "#9fbf5f", "#c6d87a"][Math.floor(Math.random() * 3)];
            tctx.fillStyle = greenShade;
            tctx.fillRect(fx, fy, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    });

    // Arabian Sea (bottom-right corner)
    tctx.fillStyle = "#336699";
    tctx.beginPath();
    tctx.moveTo(terrainCanvas.width * 0.6, terrainCanvas.height);
    tctx.lineTo(terrainCanvas.width, terrainCanvas.height * 0.8);
    tctx.lineTo(terrainCanvas.width, terrainCanvas.height);
    tctx.closePath();
    tctx.fill();

    // Retro winding pixel Tigris River (expanded, winding, layered)
    const tigrisSegments = [
      { x: 20, y: 7 }, { x: 21, y: 7.5 }, { x: 21.5, y: 8 },
      { x: 22, y: 9 }, { x: 23, y: 10 }, { x: 22, y: 10.5 },
      { x: 21, y: 11 }, { x: 19, y: 11.5 }, { x: 17.5, y: 12 },
      { x: 16, y: 12.5 }, { x: 15, y: 13 }, { x: 14, y: 13.5 },
      { x: 13, y: 14 }, { x: 12, y: 14.5 }, { x: 11, y: 15 }, { x: 10, y: 15.5 },
      // Extension northeast after { x: 20, y: 7 }
      { x: 21, y: 6 }, { x: 22, y: 5 }, { x: 24, y: 4 }, { x: 26, y: 3 }, { x: 28, y: 2 }, { x: 30, y: 0 }
    ];
    // Retro winding pixel Euphrates River (expanded, winding, layered)
    const euphratesSegments = [
      { x: 5, y: 17 }, { x: 6, y: 17.5 }, { x: 7, y: 18 },
      { x: 8, y: 18 }, { x: 9, y: 17.5 }, { x: 10, y: 16 },
      { x: 11, y: 16.5 }, { x: 12, y: 17 }, { x: 13, y: 17.5 },
      { x: 14, y: 18 }, { x: 15, y: 17.5 }, { x: 16, y: 17 },
      { x: 17, y: 15.5 }, { x: 18, y: 14 },
      { x: 19, y: 13 }, { x: 20, y: 12 }, { x: 21, y: 11 },
      // Extension north and east after { x: 21, y: 11 }
      { x: 22, y: 10 }, { x: 23, y: 9 }, { x: 24, y: 8 }, { x: 25, y: 7 }, { x: 27, y: 6 }, { x: 29, y: 5 }
    ];

    // Under-river desert darkening (riverbed shading)
    tctx.fillStyle = "#c2a177";
    tigrisSegments.concat(euphratesSegments).forEach(p => {
      tctx.fillRect(p.x * TILE_SIZE - 2, p.y * TILE_SIZE + TILE_Y_OFFSET - 2, TILE_SIZE + 4, TILE_SIZE + 4);
    });

    // Draw Tigris river (choppy/pixel-art) with soft banks
    {
      tctx.save();
      tctx.globalAlpha = 0.75;
      tctx.fillStyle = "#3399cc";
      const segments = tigrisSegments;
      const stepCount = 8;
      // Bank halo
      tctx.save();
      tctx.globalAlpha = 0.18;
      tctx.fillStyle = "#2b5d7a";
      for (let i = 1; i < segments.length; i++) {
        const prev = segments[i - 1];
        const curr = segments[i];
        for (let j = 0; j < stepCount; j++) {
          const interX = prev.x + (curr.x - prev.x) * (j / stepCount);
          const interY = prev.y + (curr.y - prev.y) * (j / stepCount);
          tctx.fillRect(interX * TILE_SIZE - 1, interY * TILE_SIZE + TILE_Y_OFFSET - 1, 6, 6);
        }
      }
      tctx.restore();
      for (let i = 1; i < segments.length; i++) {
        const prev = segments[i - 1];
        const curr = segments[i];
        for (let j = 0; j < stepCount; j++) {
          const interX = prev.x + (curr.x - prev.x) * (j / stepCount);
          const interY = prev.y + (curr.y - prev.y) * (j / stepCount);
          tctx.fillRect(interX * TILE_SIZE, interY * TILE_SIZE + TILE_Y_OFFSET, 4, 4);
        }
      }
      tctx.restore();
      // Highlight Tigris river with lighter trace
      tctx.save();
      tctx.globalAlpha = 0.3;
      tctx.fillStyle = "#66ccee"; // lighter blue
      for (let i = 1; i < tigrisSegments.length; i++) {
        const prev = tigrisSegments[i - 1];
        const curr = tigrisSegments[i];
        for (let j = 0; j < stepCount; j++) {
          const interX = prev.x + (curr.x - prev.x) * (j / stepCount);
          const interY = prev.y + (curr.y - prev.y) * (j / stepCount);
          tctx.fillRect(interX * TILE_SIZE, interY * TILE_SIZE + TILE_Y_OFFSET, 5, 5);
        }
      }
      tctx.restore();
      // Foam sparkles
      tctx.save();
      tctx.globalAlpha = 0.25;
      tctx.fillStyle = "#e8f7ff";
      for (let i = 1; i < tigrisSegments.length; i++) {
        const prev = tigrisSegments[i - 1];
        const curr = tigrisSegments[i];
        const ix = prev.x + (curr.x - prev.x) * (Math.random());
        const iy = prev.y + (curr.y - prev.y) * (Math.random());
        tctx.fillRect(ix * TILE_SIZE + (Math.random()*3-1), iy * TILE_SIZE + TILE_Y_OFFSET + (Math.random()*3-1), 2, 2);
      }
      tctx.restore();
    }

    // Draw Euphrates river (choppy/pixel-art) with soft banks
    {
      tctx.save();
      tctx.globalAlpha = 0.75;
      tctx.fillStyle = "#33cccc";
      const segments = euphratesSegments;
      const stepCount = 8;
      // Bank halo
      tctx.save();
      tctx.globalAlpha = 0.18;
      tctx.fillStyle = "#2a6e6e";
      for (let i = 1; i < segments.length; i++) {
        const prev = segments[i - 1];
        const curr = segments[i];
        for (let j = 0; j < stepCount; j++) {
          const interX = prev.x + (curr.x - prev.x) * (j / stepCount);
          const interY = prev.y + (curr.y - prev.y) * (j / stepCount);
          tctx.fillRect(interX * TILE_SIZE - 1, interY * TILE_SIZE + TILE_Y_OFFSET - 1, 6, 6);
        }
      }
      tctx.restore();
      for (let i = 1; i < segments.length; i++) {
        const prev = segments[i - 1];
        const curr = segments[i];
        for (let j = 0; j < stepCount; j++) {
          const interX = prev.x + (curr.x - prev.x) * (j / stepCount);
          const interY = prev.y + (curr.y - prev.y) * (j / stepCount);
          tctx.fillRect(interX * TILE_SIZE, interY * TILE_SIZE + TILE_Y_OFFSET, 4, 4);
        }
      }
      tctx.restore();
      // Highlight Euphrates river with lighter trace
      tctx.save();
      tctx.globalAlpha = 0.3;
      tctx.fillStyle = "#66eeee"; // lighter cyan
      for (let i = 1; i < euphratesSegments.length; i++) {
        const prev = euphratesSegments[i - 1];
        const curr = euphratesSegments[i];
        for (let j = 0; j < stepCount; j++) {
          const interX = prev.x + (curr.x - prev.x) * (j / stepCount);
          const interY = prev.y + (curr.y - prev.y) * (j / stepCount);
          tctx.fillRect(interX * TILE_SIZE, interY * TILE_SIZE + TILE_Y_OFFSET, 5, 5);
        }
      }
      tctx.restore();
      // Foam sparkles
      tctx.save();
      tctx.globalAlpha = 0.25;
      tctx.fillStyle = "#e8f7ff";
      for (let i = 1; i < euphratesSegments.length; i++) {
        const prev = euphratesSegments[i - 1];
        const curr = euphratesSegments[i];
        const ix = prev.x + (curr.x - prev.x) * (Math.random());
        const iy = prev.y + (curr.y - prev.y) * (Math.random());
        tctx.fillRect(ix * TILE_SIZE + (Math.random()*3-1), iy * TILE_SIZE + TILE_Y_OFFSET + (Math.random()*3-1), 2, 2);
      }
      tctx.restore();
    }

    // Small tributaries (decorative winding lines)
    const tributaries = [
      [{ x: 13, y: 13 }, { x: 14, y: 12.5 }, { x: 15, y: 12 }],
      [{ x: 16, y: 14 }, { x: 17, y: 13.5 }, { x: 18, y: 13 }],
      [{ x: 10, y: 15 }, { x: 10.5, y: 14.5 }, { x: 11, y: 14 }],
      [{ x: 7, y: 16 }, { x: 7.5, y: 15.5 }, { x: 8, y: 15 }],
      [{ x: 22, y: 9 }, { x: 23, y: 8.5 }, { x: 24, y: 8 }],
      // New tributary branching from Sippar (x:20, y:7)
      [{ x: 20, y: 7 }, { x: 21, y: 6.5 }, { x: 22, y: 6 }],
      // New tributary branching from Akkad (x:21, y:11)
      [{ x: 21, y: 11 }, { x: 22, y: 10.5 }, { x: 23, y: 10 }]
    ];

    tctx.strokeStyle = "#66cccc";
    tctx.lineWidth = 1.5;
    tctx.globalAlpha = 0.5;
    tributaries.forEach(path => {
      tctx.beginPath();
      tctx.moveTo(path[0].x * TILE_SIZE, path[0].y * TILE_SIZE + TILE_Y_OFFSET);
      for (let i = 1; i < path.length; i++) {
        tctx.lineTo(path[i].x * TILE_SIZE, path[i].y * TILE_SIZE + TILE_Y_OFFSET);
      }
      tctx.stroke();
    });
    tctx.globalAlpha = 1.0;

    // Delta branches near Eridu/Ur
    tctx.strokeStyle = "#33cccc";
    tctx.lineWidth = 6;
    tctx.beginPath();
    tctx.moveTo(5 * TILE_SIZE, 17 * TILE_SIZE + TILE_Y_OFFSET);  // Eridu
    tctx.lineTo(6 * TILE_SIZE, 19 * TILE_SIZE + TILE_Y_OFFSET);  // Branch south
    tctx.stroke();

    tctx.beginPath();
    tctx.moveTo(11 * TILE_SIZE, 19 * TILE_SIZE + TILE_Y_OFFSET);  // Ur
    tctx.lineTo(12 * TILE_SIZE, 20 * TILE_SIZE + TILE_Y_OFFSET);  // Branch southeast
    tctx.stroke();

    // Persian Gulf (southeast corner)
    tctx.fillStyle = "#336699";
    tctx.beginPath();
    tctx.moveTo(terrainCanvas.width * 0.4, terrainCanvas.height);
    tctx.lineTo(terrainCanvas.width * 0.6, terrainCanvas.height * 0.9);
    tctx.lineTo(terrainCanvas.width * 0.8, terrainCanvas.height);
    tctx.closePath();
    tctx.fill();

    // Desert dune strokes for depth
    tctx.save();
    tctx.globalAlpha = 0.12;
    tctx.strokeStyle = "#b8905f";
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * terrainCanvas.width;
      const y = Math.random() * terrainCanvas.height;
      const len = 12 + Math.random() * 28;
      tctx.beginPath();
      tctx.moveTo(x, y);
      tctx.quadraticCurveTo(x + len * 0.4, y + 2, x + len, y + (Math.random() * 3 - 1.5));
      tctx.stroke();
    }
    tctx.restore();

    // Palm clusters near water (simple glyph)
    const drawPalm = (cx, cy) => {
      tctx.save();
      tctx.fillStyle = "#3a5b2a";
      tctx.fillRect(cx - 1, cy - 6, 2, 6);
      tctx.fillStyle = "#4f8a36";
      tctx.fillRect(cx - 4, cy - 8, 3, 2);
      tctx.fillRect(cx + 1, cy - 8, 3, 2);
      tctx.fillRect(cx - 2, cy - 10, 4, 2);
      tctx.restore();
    };
    const sprinklePalms = (segments) => {
      for (let i = 0; i < segments.length; i += 3) {
        const p = segments[i];
        const px = p.x * TILE_SIZE + (Math.random() * 10 - 5);
        const py = p.y * TILE_SIZE + TILE_Y_OFFSET + 10 + (Math.random() * 6 - 3);
        drawPalm(px, py);
      }
    };
    sprinklePalms(tigrisSegments);
    sprinklePalms(euphratesSegments);
  }

  ctx.drawImage(terrainCanvas, 0, 0);
}

function render() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);  // Reset transform to avoid partial clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scaleFactor = canvas.width / (MAP_WIDTH * TILE_SIZE);
  ctx.scale(scaleFactor, scaleFactor);

  // Draw main map and objects (no rotation)
  renderTerrain();
  // All world elements render in the same coordinate space; avoid extra translates that desync layers

  // Draw ravaged tiles overlay from swarm
  renderRavagedTiles();

  // Draw dropped cargo on the ground
  renderDroppedCargo();

  // Draw highlight around player's current position
  ctx.strokeStyle = "gold";
  ctx.lineWidth = 2;
  ctx.strokeRect(player.x * TILE_SIZE, player.y * TILE_SIZE + TILE_Y_OFFSET, TILE_SIZE, TILE_SIZE);

  // ctx.drawImage(mapImg, 0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);

  // Draw completed routes (subtle bronze dashed)
  ctx.strokeStyle = "rgba(202, 163, 90, 0.35)"; // bronze
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  completedRoutes.forEach(route => {
    ctx.beginPath();
    ctx.moveTo(route.fromX, route.fromY + TILE_Y_OFFSET);
    ctx.lineTo(route.toX, route.toY + TILE_Y_OFFSET);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Optional high-contrast network overlay with fade + intensity
  if (completedRoutes.length > 0 && networkFade > 0.01) {
    ctx.save();
    // Glowing, animated dashed highlight for the network (gold/bronze)
    const intensity = Math.min(1, completedRoutes.length / 8); // more routes -> stronger glow
    ctx.strokeStyle = "#caa35a"; // bronze
    ctx.lineWidth = 2 + 2 * intensity; // 2..4
    ctx.globalAlpha = (0.2 + 0.8 * networkFade) * (0.85 + 0.15 * intensity);
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -dashOffset * 2;
    ctx.shadowColor = "#caa35a";
    ctx.shadowBlur = 4 + 10 * intensity * networkFade; // 4..14
    completedRoutes.forEach(route => {
      ctx.beginPath();
      ctx.moveTo(route.fromX, route.fromY + TILE_Y_OFFSET);
      ctx.lineTo(route.toX, route.toY + TILE_Y_OFFSET);
      ctx.stroke();
    });
    // Light inner stroke for extra clarity
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6 + 0.3 * networkFade;
    ctx.strokeStyle = "#fff2b0"; // light gold inner
    completedRoutes.forEach(route => {
      ctx.beginPath();
      ctx.moveTo(route.fromX, route.fromY + TILE_Y_OFFSET);
      ctx.lineTo(route.toX, route.toY + TILE_Y_OFFSET);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  let fromCity = null;
  if (order && typeof order === "object" && order.from) {
    fromCity = cities.find(c => c.name === order.from);
  }
  const toCity = cities.find(c => c.name === order.to);
  const from = fromCity ? getCityCenterCoords(fromCity) : null;
  const to = toCity ? getCityCenterCoords(toCity) : null;

  // Animate current route (active contract) in warm gold
  if (from && to) {
    ctx.strokeStyle = "#d4b15a";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.lineDashOffset = -dashOffset;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y + TILE_Y_OFFSET);
    ctx.lineTo(to.x, to.y + TILE_Y_OFFSET);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw cities
  cities.forEach(city => {
    const px = city.x * TILE_SIZE;
    const py = city.y * TILE_SIZE + TILE_Y_OFFSET;

    // Visual city-state tile background replaced by subtle glow behind icon
    const isPickup = order?.from === city.name && player.cargo === null;
    const isDropoff = order?.to === city.name && player.cargo !== null;

    if (isPickup || isDropoff) {
      const centerX = px + TILE_SIZE / 2;
      const centerY = py + TILE_SIZE / 2;
      const radius = TILE_SIZE * 0.4;

      const gradient = ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, radius);
      gradient.addColorStop(0, isPickup ? "rgba(0,255,0,0.3)" : "rgba(255,0,0,0.3)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Swarm-aware soft glows under city ziggurats
    if (akkadArmy.active) {
      const centerX = px + TILE_SIZE / 2;
      const centerY = py + TILE_SIZE / 2;
      const baseRadius = TILE_SIZE * 0.55;
      const t = performance.now() / 700;
      const pulse = 0.85 + 0.15 * (Math.sin(t) * 0.5 + 0.5); // subtle
      const radius = baseRadius * pulse;

      const isTarget = Array.isArray(akkadArmy.targetsList) && akkadArmy.targetsList.includes(city.name);
      const isPlayerHere = (city.x === player.x && city.y === player.y);
      const isSafeRefuge = isPlayerHere && !isTarget; // refuge only highlighted for current city

      if (isTarget) {
        const g = ctx.createRadialGradient(centerX, centerY, 6, centerX, centerY, radius);
        g.addColorStop(0, "rgba(255, 90, 60, 0.35)");
        g.addColorStop(1, "rgba(255, 90, 60, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (isSafeRefuge) {
        const g = ctx.createRadialGradient(centerX, centerY, 6, centerX, centerY, radius * 0.9);
        g.addColorStop(0, "rgba(80, 200, 255, 0.28)");
        g.addColorStop(1, "rgba(80, 200, 255, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Begin safe currentOrder route line draw ---
    // If you want to show routes for current orders, always do null/undefined checks
    // Example for a currentOrders array:
    // const route = currentOrders.find(o => o && (o.from === city.name || o.to === city.name));
    // (No actual currentOrders array in this code, but keep the pattern for future use.)
    // --- End safe currentOrder route line draw ---

    // Highlight city if it's the current order's from/to, with robust null/type checks
    const highlightOrder = order;
    if (highlightOrder && typeof highlightOrder === 'object') {
      if ('from' in highlightOrder && highlightOrder.from === city.name) {
        ctx.fillStyle = "#88ff88";
      }
      if ('to' in highlightOrder && highlightOrder.to === city.name) {
        ctx.fillStyle = "#ff8888";
      }
    }

    // Draw city-specific ziggurat icon (now fits in a single tile)
    drawZiggurat(px, py, TILE_SIZE);

    // Removed map-side Has/Needs icons to reduce clutter; see city info panel instead

  ctx.font = UI.fontBody;
  ctx.fillStyle = UI.text;
  ctx.strokeStyle = "#000000aa";
  ctx.lineWidth = 3;
  ctx.textAlign = "center";
  const nameX = px + TILE_SIZE / 2;
  const nameY = py + TILE_SIZE * 1.65;
    ctx.strokeText(city.name, nameX, nameY);
    ctx.fillText(city.name, nameX, nameY);
    ctx.textAlign = "start";
  });

  function drawAkkadSoldier(px, py, chasing = false) {
    // Draw a stylized infantry: helmet, shield, spear
    const size = TILE_SIZE;
    const cx = px + size / 2;
    const cy = py + size / 2;

    // Optional chase aura
    if (chasing) {
      ctx.save();
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, size * 0.55);
      g.addColorStop(0, 'rgba(255, 90, 60, 0.25)');
      g.addColorStop(1, 'rgba(255, 90, 60, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Spear (behind)
    ctx.save();
    ctx.strokeStyle = '#8a6a3f'; // shaft
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.18, cy + size * 0.20);
    ctx.lineTo(cx + size * 0.24, cy - size * 0.28);
    ctx.stroke();
    // Spearhead
    ctx.fillStyle = '#c7c7c7';
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.24, cy - size * 0.28);
    ctx.lineTo(cx + size * 0.30, cy - size * 0.34);
    ctx.lineTo(cx + size * 0.18, cy - size * 0.30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Shield (bronze)
    ctx.save();
    ctx.fillStyle = '#caa56a';
    ctx.strokeStyle = '#7c5a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx - size * 0.16, cy + size * 0.02, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Boss
    ctx.fillStyle = '#e0c488';
    ctx.beginPath();
    ctx.arc(cx - size * 0.16, cy + size * 0.02, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body + helmet
    ctx.save();
    ctx.fillStyle = '#7a1c1c'; // tunic
    ctx.fillRect(cx - 4, cy - 6, 8, 12);
    // Helmet
    ctx.fillStyle = '#6e3a1a';
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 5, Math.PI, 0);
    ctx.fill();
    // Crest
    ctx.fillStyle = '#b2452b';
    ctx.fillRect(cx - 1, cy - 12, 2, 4);
    ctx.restore();
  }

  function drawAkkadStandard(px, py) {
    // War standard planted near unit (small banner)
    const size = TILE_SIZE;
    const x = px + size * 0.65;
    const y = py + size * 0.20;
    ctx.save();
    ctx.strokeStyle = '#4b2e19';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + size * 0.50);
    ctx.stroke();
    ctx.fillStyle = '#b02a2a';
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x - size * 0.22, y + size * 0.10);
    ctx.lineTo(x, y + size * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawAkkadianSwarm(ctx) {
    if (!akkadArmy.active) return;
    // Raiders: infantry + standard
    for (const r of akkadArmy.raiders) {
      if (r.reached) continue;
      const px = r.x * TILE_SIZE;
      const py = r.y * TILE_SIZE + TILE_Y_OFFSET;
      drawAkkadSoldier(px, py, false);
      drawAkkadStandard(px, py);
    }
    // Skirmishers: infantry with chase aura when chasing
    for (const s of akkadArmy.skirmishers) {
      if (s.reached) continue;
      const px = s.x * TILE_SIZE;
      const py = s.y * TILE_SIZE + TILE_Y_OFFSET;
      drawAkkadSoldier(px, py, s.mode === 'chasing');
    }
  }

  drawAkkadianSwarm(ctx);

  function drawBandits(ctx) {
    if (!bandits.active) return;
    ctx.save();
    for (const b of bandits.packs) {
      if (b.done) continue;
      // Draw tiny rider icon (horse + rider + pennant)
      const px = b.x * TILE_SIZE;
      const py = b.y * TILE_SIZE + TILE_Y_OFFSET;
      const cx = px + TILE_SIZE / 2;
      const cy = py + TILE_SIZE / 2;
      // Horse body
      ctx.fillStyle = "#6f4b2a";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 3, TILE_SIZE * 0.28, TILE_SIZE * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      // Horse head
      ctx.beginPath();
      ctx.ellipse(cx + TILE_SIZE * 0.18, cy, TILE_SIZE * 0.12, TILE_SIZE * 0.10, -0.2, 0, Math.PI * 2);
      ctx.fill();
      // Rider
      ctx.fillStyle = "#2d1e10";
      ctx.fillRect(cx - 2, cy - 6, 4, 6);
      ctx.fillStyle = "#3b2a18";
      ctx.fillRect(cx - 4, cy - 2, 8, 3);
      // Pennant
      ctx.strokeStyle = "#2d2d2d";
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 8);
      ctx.lineTo(cx - 6, cy - 2);
      ctx.stroke();
      ctx.fillStyle = "#c12b2b";
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 8);
      ctx.lineTo(cx - 12, cy - 6);
      ctx.lineTo(cx - 6, cy - 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawNPCTraders(ctx) {
    if (!npcCaravans || npcCaravans.length === 0) return;
    ctx.save();
    for (const n of npcCaravans) {
      const px = n.x * TILE_SIZE;
      const py = n.y * TILE_SIZE + TILE_Y_OFFSET;
      // Simple wagon variant with color accent
      // body
      ctx.fillStyle = n.color || '#6b4423';
      ctx.fillRect(px + TILE_SIZE * 0.2, py + TILE_SIZE * 0.6, TILE_SIZE * 0.6, TILE_SIZE * 0.28);
      // cover
      ctx.beginPath();
      ctx.fillStyle = '#e0dfd8';
      ctx.arc(px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.56, TILE_SIZE * 0.3, Math.PI, 0);
      ctx.fill();
      // wheels
      ctx.fillStyle = '#2f2f2f';
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE * 0.36, py + TILE_SIZE * 0.9, 3, 0, Math.PI * 2);
      ctx.arc(px + TILE_SIZE * 0.64, py + TILE_SIZE * 0.9, 3, 0, Math.PI * 2);
      ctx.fill();

      // burning effect (even larger, twisted shape with inner core, sparks and smoke)
      if (n.burning) {
        const t = performance.now() / 140;
        const flicker = (Math.sin(t * 2) + 1) * 0.5;
        const cx = px + TILE_SIZE * 0.5;
        const baseY = py + TILE_SIZE * 0.60;
        const height = TILE_SIZE * (0.55 + 0.12 * flicker); // 55–67% height
        const width = TILE_SIZE * (0.38 + 0.08 * flicker);  // wider base
        const twist = TILE_SIZE * 0.10 * Math.sin(t * 1.6); // horizontal twist at the top
        const sway = TILE_SIZE * 0.05 * Math.sin(t * 2.4);  // base sway

        // Layer 1: deep orange outer flame with twist
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(255, 110, 45, 0.9)';
        ctx.beginPath();
        ctx.moveTo(cx - width * 0.55 + sway, baseY);
        ctx.bezierCurveTo(
          cx - width * 0.25, baseY - height * 0.55,
          cx + width * 0.15 + twist, baseY - height * 0.95,
          cx + width * 0.55 + sway, baseY
        );
        ctx.bezierCurveTo(
          cx + width * 0.20, baseY - height * 0.50,
          cx - width * 0.15 + twist * 0.5, baseY - height * 0.85,
          cx - width * 0.55 + sway, baseY
        );
        ctx.closePath();
        ctx.fill();

        // Layer 2: bright orange mid flame, slightly smaller
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(255, 150, 60, 0.95)';
        ctx.beginPath();
        ctx.moveTo(cx - width * 0.40 + sway * 0.8, baseY - TILE_SIZE * 0.01);
        ctx.bezierCurveTo(
          cx - width * 0.15, baseY - height * 0.50,
          cx + width * 0.10 + twist * 0.7, baseY - height * 0.85,
          cx + width * 0.40 + sway * 0.8, baseY - TILE_SIZE * 0.01
        );
        ctx.bezierCurveTo(
          cx + width * 0.15, baseY - height * 0.45,
          cx - width * 0.10 + twist * 0.4, baseY - height * 0.75,
          cx - width * 0.40 + sway * 0.8, baseY - TILE_SIZE * 0.01
        );
        ctx.closePath();
        ctx.fill();

        // Inner core: yellow
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = 'rgba(255, 220, 110, 0.95)';
        ctx.beginPath();
        ctx.moveTo(cx - width * 0.26 + sway * 0.5, baseY - TILE_SIZE * 0.02);
        ctx.bezierCurveTo(
          cx - width * 0.08, baseY - height * 0.45,
          cx + width * 0.06 + twist * 0.5, baseY - height * 0.70,
          cx + width * 0.26 + sway * 0.5, baseY - TILE_SIZE * 0.02
        );
        ctx.bezierCurveTo(
          cx + width * 0.10, baseY - height * 0.42,
          cx - width * 0.06 + twist * 0.3, baseY - height * 0.62,
          cx - width * 0.26 + sway * 0.5, baseY - TILE_SIZE * 0.02
        );
        ctx.closePath();
        ctx.fill();

        // Occasional sparks
        ctx.globalAlpha = 0.6 + 0.4 * Math.random();
        ctx.fillStyle = 'rgba(255, 240, 180, 0.9)';
        for (let i = 0; i < 3; i++) {
          const sx = cx + (Math.random() - 0.5) * width * 0.7;
          const sy = baseY - Math.random() * height * 1.0;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Smoke particle system (lightweight, capped lifetime)
        n.smokeParticles = n.smokeParticles || [];
        // spawn 1-3 new particles if under cap
        const maxParticles = 14;
        const spawnCount = Math.min(3, Math.max(0, maxParticles - n.smokeParticles.length));
        for (let i = 0; i < spawnCount; i++) {
          n.smokeParticles.push({
            x: cx + (Math.random() - 0.5) * width * 0.5,
            y: baseY - TILE_SIZE * 0.05,
            vx: (Math.random() - 0.5) * 0.15,
            vy: -0.25 - Math.random() * 0.15,
            r: 2.5 + Math.random() * 2.5,
            age: 0,
            life: 45 + Math.floor(Math.random() * 30) // 0.75–1.25s
          });
        }
        // update/draw
        for (let i = n.smokeParticles.length - 1; i >= 0; i--) {
          const p = n.smokeParticles[i];
          p.age++;
          p.x += p.vx + 0.02 * Math.sin((t + p.age) * 0.5);
          p.y += p.vy;
          const a = 1 - p.age / p.life;
          if (a <= 0) { n.smokeParticles.splice(i, 1); continue; }
          const rr = p.r * (0.7 + 0.6 * (1 - a));
          const sg = ctx.createRadialGradient(p.x, p.y, 0.5, p.x, p.y, rr);
          sg.addColorStop(0, `rgba(180, 180, 180, ${0.28 * a})`);
          sg.addColorStop(1, 'rgba(180, 180, 180, 0.0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }
    }
    ctx.restore();
  }


  // Draw bandits on top of terrain and routes
  drawBandits(ctx);

  // Draw NPC caravans
  drawNPCTraders(ctx);

  // Draw burning effects for lost player wagons (updates life)
  (function drawPlayerWagonBurns() {
    if (!playerBurningWagons || playerBurningWagons.length === 0) return;
    for (let i = playerBurningWagons.length - 1; i >= 0; i--) {
      const b = playerBurningWagons[i];
      const px = b.x * TILE_SIZE;
      const py = b.y * TILE_SIZE + TILE_Y_OFFSET;
      // Draw the wagon base under flames for clarity
      drawIcon('caravan', px + TILE_SIZE * 0.25, py + TILE_SIZE * 0.25, TILE_SIZE);
      const t = performance.now() / 140 + i;
      const flicker = (Math.sin(t * 2) + 1) * 0.5;
      const cx = px + TILE_SIZE * 0.5;
      const baseY = py + TILE_SIZE * 0.60;
      const height = TILE_SIZE * (0.45 + 0.10 * flicker);
      const width = TILE_SIZE * (0.30 + 0.06 * flicker);
      const twist = TILE_SIZE * 0.08 * Math.sin(t * 1.4);
      const sway = TILE_SIZE * 0.04 * Math.sin(t * 2.0);

      // Outer flame
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(255, 110, 45, 0.85)';
      ctx.beginPath();
      ctx.moveTo(cx - width * 0.55 + sway, baseY);
      ctx.bezierCurveTo(
        cx - width * 0.25, baseY - height * 0.55,
        cx + width * 0.15 + twist, baseY - height * 0.95,
        cx + width * 0.55 + sway, baseY
      );
      ctx.bezierCurveTo(
        cx + width * 0.20, baseY - height * 0.50,
        cx - width * 0.15 + twist * 0.5, baseY - height * 0.85,
        cx - width * 0.55 + sway, baseY
      );
      ctx.closePath();
      ctx.fill();

      // Inner core
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(255, 220, 110, 0.95)';
      ctx.beginPath();
      ctx.moveTo(cx - width * 0.26 + sway * 0.5, baseY - TILE_SIZE * 0.02);
      ctx.bezierCurveTo(
        cx - width * 0.08, baseY - height * 0.45,
        cx + width * 0.06 + twist * 0.5, baseY - height * 0.70,
        cx + width * 0.26 + sway * 0.5, baseY - TILE_SIZE * 0.02
      );
      ctx.bezierCurveTo(
        cx + width * 0.10, baseY - height * 0.42,
        cx - width * 0.06 + twist * 0.3, baseY - height * 0.62,
        cx - width * 0.26 + sway * 0.5, baseY - TILE_SIZE * 0.02
      );
      ctx.closePath();
      ctx.fill();

      // Life decay
      b.life--;
      if (b.life <= 0) playerBurningWagons.splice(i, 1);
      ctx.globalAlpha = 1.0;
    }
  })();

  // Draw player on top
  // Update player trail (record current tile)
  const headKey = `${player.x},${player.y}`;
  if (playerTrail.length === 0 || playerTrail[0] !== headKey) {
    playerTrail.unshift(headKey);
    if (playerTrail.length > 20) playerTrail.pop();
  }
  // Draw trailing wagons based on deliveries milestones
  const wagons = Math.max(1, Math.min(3, playerWagons));
  for (let i = wagons - 1; i >= 1; i--) {
    const idx = i * 3; // steps behind
    if (playerTrail[idx]) {
      const [txs, tys] = playerTrail[idx].split(',').map(n => parseInt(n, 10));
      drawIcon("caravan", txs * TILE_SIZE + TILE_SIZE * 0.25, tys * TILE_SIZE + TILE_Y_OFFSET + TILE_SIZE * 0.25);
    }
  }
  // Head wagon
  drawIcon("caravan", player.x * TILE_SIZE + TILE_SIZE * 0.25, player.y * TILE_SIZE + TILE_Y_OFFSET + TILE_SIZE * 0.25);

  // Atmosphere overlay (cloud shadows, rain)
  if (showAtmosphere) renderAtmosphereOverlay();
  // Vignette to enhance map contrast (screen space)
  renderVignette();

  // Draw cargo info area (cleared, but no redundant text drawn)
  ctx.fillStyle = "black";
  ctx.font = UI.fontBody;
  ctx.clearRect(0, MAP_HEIGHT * TILE_SIZE, canvas.width, canvas.height - MAP_HEIGHT * TILE_SIZE);

  // Delivery log moved to DOM sidebar

  // Draw current objective tracker (top-center)
  renderOrderStatus();

  // Swarm flashing banner under the order panel
  renderSwarmBanner();

  // Tablet of Deeds obelisk (left side) — update rect before positioning city info
  renderDeedsObelisk();

  // Compact on-canvas log beneath banners
  renderCompactLog();

  // Draw city info overlay — placed to the right of obelisk if present
  renderCityInfoOverlay();

  // UI message overlay (warnings, swarm notices)
  renderUIMessage();
  ctx.restore();
}

function renderDeedsObelisk() {
  if (!deedsLog || deedsLog.length === 0) { lastObeliskRect = null; return; }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const marginX = 8;
  const baseTop = (lastOrderPanel?.y || 4) + (lastOrderPanel?.h || 40) + 6 + (akkadArmy.active ? 28 : 0);
  const yTop = Math.max(64, baseTop);
  // Hover detection uses last frame's rect; expand if hovering
  const hovered = lastObeliskRect && mouseX >= lastObeliskRect.x && mouseX <= lastObeliskRect.x + lastObeliskRect.w && mouseY >= lastObeliskRect.y && mouseY <= lastObeliskRect.y + lastObeliskRect.h;
  const w = hovered ? 180 : 128;
  const h = Math.min(canvas.height - yTop - 16, hovered ? 420 : 320);
  const x = marginX;

  // Obelisk shape (trapezoid top + shaft)
  ctx.globalAlpha = hovered ? 0.98 : 0.95;
  ctx.fillStyle = '#c9b189';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.25, yTop); // top notch left
  ctx.lineTo(x + w * 0.75, yTop); // top notch right
  ctx.lineTo(x + w, yTop + 20);
  ctx.lineTo(x + w, yTop + h);
  ctx.lineTo(x, yTop + h);
  ctx.lineTo(x, yTop + 20);
  ctx.closePath();
  ctx.fill();

  // Stone shading
  const g = ctx.createLinearGradient(x, yTop, x, yTop + h);
  g.addColorStop(0, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(x, yTop + 12, w, h - 12);

  // Border lines
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(80,60,40,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, yTop + 22, w - 4, h - 24);
  ctx.globalAlpha = 1.0;

  // Title (chiseled effect) with darker base
  ctx.fillStyle = '#2b2116';
  ctx.font = hovered ? '16px Herculanum, Papyrus, serif' : '14px Herculanum, Papyrus, serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = hovered ? 'rgba(255,220,120,0.6)' : 'transparent';
  ctx.shadowBlur = hovered ? 6 : 0;
  drawChiseledText(ctx, 'Deeds', x + w / 2, yTop + 38);

  // Entries with wrapping and dynamic font downscaling
  ctx.textAlign = 'left';
  const pad = 10;
  const listX = x + pad;
  let listY = yTop + 56;
  const bodyFonts = hovered ? ['13px Herculanum, Papyrus, serif', '12px Herculanum, Papyrus, serif', '11px Herculanum, Papyrus, serif'] : ['11px Herculanum, Papyrus, serif', '10px Herculanum, Papyrus, serif', '9px Herculanum, Papyrus, serif'];
  let chosenFont = bodyFonts[0];
  let lineH = hovered ? 16 : 14;
  const maxHeight = h - (listY - yTop) - 8;
  const maxWidth = w - pad * 2 - 18; // icon space
  let maxItems = Math.min(10, deedsLog.length);
  const maxLinesPerItem = hovered ? 3 : 2;
  // Choose smallest font that fits entries
  for (let f = 0; f < bodyFonts.length; f++) {
    ctx.font = bodyFonts[f];
    lineH = hovered ? (f === 0 ? 16 : f === 1 ? 15 : 14) : (f === 0 ? 14 : f === 1 ? 13 : 12);
    let linesAvail = Math.floor(maxHeight / lineH);
    let linesNeeded = 0;
    for (let i = 0; i < Math.min(maxItems, deedsLog.length); i++) {
      const d = deedsLog[i];
      const used = measureWrappedLines(ctx, d.text, maxWidth, maxLinesPerItem);
      linesNeeded += Math.min(maxLinesPerItem, used);
      if (linesNeeded > linesAvail) break;
    }
    if (linesNeeded <= linesAvail) { chosenFont = bodyFonts[f]; break; }
    if (f === bodyFonts.length - 1) {
      // last resort: reduce number of items
      maxItems = Math.max(3, Math.floor(linesAvail / maxLinesPerItem));
      chosenFont = bodyFonts[f];
    }
  }
  ctx.font = chosenFont;
  // Darker inscription color for better contrast against stone
  ctx.fillStyle = '#3a2a1a';
  ctx.shadowColor = hovered ? 'rgba(255,240,160,0.7)' : 'transparent';
  ctx.shadowBlur = hovered ? 6 : 0;
  let linesAvail = Math.floor(maxHeight / lineH);
  let itemsDrawn = 0;
  for (let i = 0; i < deedsLog.length && itemsDrawn < maxItems; i++) {
    const d = deedsLog[i];
    drawHUDIcon(listX + 6, listY - 2, d.icon || 'check');
    const used = drawWrappedTextChiseled(ctx, d.text, listX + 18, listY, maxWidth, lineH, maxLinesPerItem);
    listY += used * lineH + 2;
    linesAvail -= used;
    itemsDrawn++;
    if (linesAvail <= 0) break;
  }

  lastObeliskRect = { x, y: yTop, w, h };

  ctx.restore();
}

function renderCityInfoOverlay() {
  const city = cities.find(c => c.x === player.x && c.y === player.y);
  if (!city) return;

  // Example: highlight logic for this city
  // const highlight = activeOrders.find(order => order && (order.from === city.name || order.to === city.name));
  // if (highlight && (highlight.to === city.name || highlight.from === city.name)) {
  //   // ...do something for highlight
  // }

  // Lock to screen coords and place in top-left quadrant, avoiding top-center overlays
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const baseTop = (lastOrderPanel?.y || 4) + (lastOrderPanel?.h || 40) + 6 + (akkadArmy.active ? 22 + 6 : 0);
  const margin = 12;
  let infoX = 12;
  // If Deeds obelisk is visible, place info panel to its right
  if (lastObeliskRect) {
    infoX = Math.max(margin, lastObeliskRect.x + lastObeliskRect.w + margin);
  }
  const infoY = Math.max(80, baseTop);

  // Determine ideal width based on content lengths (min 140), clamped to canvas
  const titleText = `${city.name}`;
  const specText = `Specialty: ${city.resource}`;
  const needText = `Needs: ${city.need}`;
  ctx.font = UI.fontBody;
  const titleW = ctx.measureText(titleText).width;
  ctx.font = UI.fontSmall;
  const specW = ctx.measureText(specText).width;
  const needW = ctx.measureText(needText).width;
  // Title has 24px left padding before text, rows have 34px
  const wanted = Math.max(24 + titleW + 12, 34 + specW + 12, 34 + needW + 12);
  const maxW = Math.max(140, canvas.width - infoX - margin);
  const infoW = Math.max(140, Math.min(wanted, maxW));

  // Compute dynamic height with wrapping
  ctx.textBaseline = 'top';
  const lineHBody = 14;
  const lineHSmall = 12;
  const titleAvailW = infoW - 24 - 10;
  const rowAvailW = infoW - 34 - 10;
  const titleLines = measureWrappedLines(ctx, titleText, titleAvailW, 2);
  const specLines = measureWrappedLines(ctx, specText, rowAvailW, 2);
  const needLines = measureWrappedLines(ctx, needText, rowAvailW, 2);
  const specRowH = Math.max(16, specLines * lineHSmall);
  const needRowH = Math.max(16, needLines * lineHSmall);
  const contentH = 6 + (titleLines * lineHBody) + 6 + specRowH + 4 + needRowH + 6;

  // Panel underlay sized to content
  drawRoundedPanel(infoX, infoY - 8, infoW, contentH + 8, 6, UI.panel);

  // Draw content with wrapping
  ctx.fillStyle = UI.text;
  ctx.font = UI.fontBody;
  drawHUDIcon(infoX + 12, infoY + 2 + (lineHBody * 0.25), 'city');
  drawWrappedTextEllipsized(ctx, titleText, infoX + 24, infoY + 0, titleAvailW, lineHBody, 2);

  let y = infoY + (titleLines * lineHBody) + 6;
  // Specialty row
  drawRoundedPanel(infoX + 8, y + 0, 20, 16, 6, 'rgba(230, 197, 120, 0.35)');
  drawIcon((city.resource || '').toLowerCase(), infoX + 10, y + 2, 14);
  ctx.font = UI.fontSmall;
  ctx.fillStyle = UI.muted;
  drawWrappedTextEllipsized(ctx, specText, infoX + 34, y + 2, rowAvailW, lineHSmall, 2);
  y += specRowH + 4;
  // Needs row
  drawRoundedPanel(infoX + 8, y + 0, 20, 16, 6, 'rgba(120, 180, 230, 0.35)');
  drawIcon((city.need || '').toLowerCase(), infoX + 10, y + 2, 14);
  drawWrappedTextEllipsized(ctx, needText, infoX + 34, y + 2, rowAvailW, lineHSmall, 2);
  ctx.restore();
}

// --- Akkadian Army Swarm Mechanic ---

function gameLoop() {
  // Advance simple animation timers
  dashOffset = (dashOffset + 1) % 240;
  // Smooth fade for network overlay
  const targetFade = showTradeNetwork ? 1 : 0;
  networkFade += (targetFade - networkFade) * NETWORK_FADE_SPEED;
  if (Math.abs(targetFade - networkFade) < 0.001) networkFade = targetFade;
  // Atmosphere seasonal/random cycling (keep updating even if overlay hidden)
  if (atmoNextSwitchMs === 0) pickNextAtmosphereMode();
  else if (performance.now() >= atmoNextSwitchMs) pickNextAtmosphereMode();
  updateAtmosphereCartoon();
  updateAkkadianSwarm();
  updateBandits();
  if (npcSpawnCooldown > 0) npcSpawnCooldown--;
  if (npcSnipeCooldown > 0) npcSnipeCooldown--;
  updateNPCTraders();
  // Apply joystick intent (respects movement cooldown)
  if (joystickDX !== 0 || joystickDY !== 0) {
    attemptMove(joystickDX, joystickDY);
  }
  render();
  requestAnimationFrame(gameLoop);
}

iconImg.onload = () => {
  const menu = document.getElementById("menu-screen");
  const startBtn = document.getElementById("start-button");
  const networkToggle = document.getElementById('toggle-network');
  const atmoToggle = document.getElementById('toggle-atmo');
  const joystickEl = document.getElementById('joystick');
  if (joystickEl) initJoystick(joystickEl);
  // Sidebar panel toggles
  const panelToggles = document.querySelectorAll('.panel-toggle');
  panelToggles.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-target');
      const panel = document.getElementById(id);
      if (!panel) return;
      const collapsed = panel.classList.toggle('collapsed');
      btn.textContent = collapsed ? 'Show' : 'Hide';
      btn.setAttribute('aria-expanded', String(!collapsed));
    });
  });

  const startGame = () => {
    if (menu) menu.style.display = "none";
    canvas.style.display = "block";
    // Match drawing buffer to CSS for crisp pixels (no scaling)
    canvas.width = 800;
    canvas.height = 534;
    const targetCssWidth = 800;
    canvas.style.width = targetCssWidth + "px";
    canvas.style.height = ""; // auto from intrinsic (matches buffer)
    // Layout handled by CSS; no manual margins needed
    // ctx.setTransform(
    //   canvas.width / (TILE_SIZE * MAP_WIDTH),
    //   0,
    //   0,
    //   canvas.height / (TILE_SIZE * MAP_HEIGHT),
    //   0,
    //   0
    // );
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for pixel-accurate drawing
    updateGoldUI();
    gameLoop();
  };

  if (menu && startBtn) {
    canvas.style.display = "none";
    startBtn.addEventListener("click", startGame);
  } else {
    // Fallback: no menu, start immediately
    startGame();
  }

  if (networkToggle) {
    networkToggle.addEventListener('change', (e) => {
      showTradeNetwork = !!e.target.checked;
      render();
    });
  }
  if (atmoToggle) {
    atmoToggle.checked = showAtmosphere;
    atmoToggle.addEventListener('change', (e) => {
      showAtmosphere = !!e.target.checked;
      render();
    });
  }
};

// Initialize on-screen joystick for touch devices
function initJoystick(rootEl) {
  const knob = rootEl.querySelector('.joy-stick');
  const base = rootEl.querySelector('.joy-base');
  if (!knob || !base) return;
  const updateCenter = () => {
    const r = rootEl.getBoundingClientRect();
    joystickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    joystickRadius = Math.min(r.width, r.height) * 0.5;
  };
  updateCenter();
  window.addEventListener('resize', updateCenter);

  const setKnob = (dx, dy) => {
    // position relative to center in element space
    const r = rootEl.getBoundingClientRect();
    const cx = r.width / 2;
    const cy = r.height / 2;
    knob.style.left = (cx + dx) + 'px';
    knob.style.top = (cy + dy) + 'px';
  };

  const toCardinal = (vx, vy) => {
    const dead = joystickRadius * 0.15; // deadzone
    const ax = Math.abs(vx);
    const ay = Math.abs(vy);
    if (ax < dead && ay < dead) return { dx: 0, dy: 0 };
    if (ax > ay) return { dx: Math.sign(vx), dy: 0 };
    return { dx: 0, dy: Math.sign(vy) };
  };

  const handlePoint = (clientX, clientY) => {
    const dx = clientX - joystickCenter.x;
    const dy = clientY - joystickCenter.y;
    const dist = Math.hypot(dx, dy);
    const max = joystickRadius - 20; // clamp inside base
    let cdx = dx, cdy = dy;
    if (dist > max && dist > 0) {
      const s = max / dist;
      cdx = dx * s; cdy = dy * s;
    }
    setKnob(cdx, cdy);
    const dir = toCardinal(dx, dy);
    joystickDX = dir.dx;
    joystickDY = dir.dy;
  };

  const onTouchStart = (e) => {
    e.preventDefault();
    if (joystickActive) return;
    const t = e.changedTouches[0];
    joystickTouchId = t.identifier;
    joystickActive = true;
    handlePoint(t.clientX, t.clientY);
  };
  const onTouchMove = (e) => {
    if (!joystickActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joystickTouchId) {
        e.preventDefault();
        handlePoint(t.clientX, t.clientY);
        break;
      }
    }
  };
  const onTouchEnd = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joystickTouchId) {
        e.preventDefault();
        joystickActive = false;
        joystickTouchId = null;
        joystickDX = 0; joystickDY = 0;
        setKnob(0, 0);
        break;
      }
    }
  };
  rootEl.addEventListener('touchstart', onTouchStart, { passive: false });
  rootEl.addEventListener('touchmove', onTouchMove, { passive: false });
  rootEl.addEventListener('touchend', onTouchEnd, { passive: false });
  rootEl.addEventListener('touchcancel', onTouchEnd, { passive: false });

  // Optional pointer events support (for browsers that support it)
  const hasPointer = 'onpointerdown' in window;
  if (hasPointer) {
    rootEl.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      e.preventDefault();
      joystickActive = true;
      handlePoint(e.clientX, e.clientY);
    }, { passive: false });
    window.addEventListener('pointermove', (e) => {
      if (!joystickActive || e.pointerType !== 'touch') return;
      e.preventDefault();
      handlePoint(e.clientX, e.clientY);
    }, { passive: false });
    window.addEventListener('pointerup', (e) => {
      if (!joystickActive || e.pointerType !== 'touch') return;
      e.preventDefault();
      joystickActive = false;
      joystickDX = 0; joystickDY = 0;
      setKnob(0, 0);
    }, { passive: false });
  }
}

// Utility for showing temporary messages (used by Akkadian swarm)
function showTempMessage(msg, iconType = null) {
  uiMessage = msg;
  uiMessageIcon = iconType;
  uiMessageTimer = 180;
}

// Render transient UI message at top-center
function renderUIMessage() {
  if (uiMessageTimer <= 0 || !uiMessage) return;
  uiMessageTimer--;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const paddingX = 12;
  const paddingY = 8;
  ctx.font = UI.fontBody;
  const text = uiMessage;
  const textWidth = ctx.measureText(text).width;
  const iconSpace = uiMessageIcon ? 22 : 0;
  const boxW = textWidth + paddingX * 2 + iconSpace;
  const boxH = 28;
  const x = (canvas.width - boxW) / 2;
  // Position below order panel and swarm banner to avoid overlap
  let y = (lastOrderPanel?.y || 4) + (lastOrderPanel?.h || 40) + 6;
  if (akkadArmy.active) y += 22 + 6; // account for banner when active
  ctx.fillStyle = UI.panel;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = UI.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let tx = x + paddingX;
  if (uiMessageIcon) {
    drawHUDIcon(x + 8, y + boxH / 2, uiMessageIcon);
    tx += iconSpace;
  }
  ctx.fillText(text, tx, y + boxH / 2);
  ctx.restore();
}

// Small HUD icon glyphs for UI panels and messages (screen space)
function drawHUDIcon(cx, cy, type) {
  const r = 6;
  const x = cx - r;
  const y = cy - r;
  ctx.save();
  switch (type) {
    case 'city': {
      ctx.fillStyle = '#caa56a';
      ctx.fillRect(x + 2, y + 6, 8, 4);
      ctx.fillRect(x + 3, y + 4, 6, 2);
      ctx.fillRect(x + 4, y + 3, 4, 1);
      break;
    }
    case 'swords': {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 9);
      ctx.lineTo(x + 9, y + 2);
      ctx.moveTo(x + 2, y + 2);
      ctx.lineTo(x + 9, y + 9);
      ctx.stroke();
      break;
    }
    case 'fire': {
      const g = ctx.createRadialGradient(cx, cy + 2, 1, cx, cy + 2, 6);
      g.addColorStop(0, 'rgba(255,120,60,0.9)');
      g.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'runner': {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 5, y + 2, 2, 4);
      ctx.fillRect(x + 3, y + 6, 4, 2);
      ctx.fillRect(x + 1, y + 8, 3, 2);
      ctx.fillRect(x + 6, y + 8, 3, 2);
      break;
    }
    case 'alert': {
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.moveTo(cx, y + 1);
      ctx.lineTo(x + 1, y + 11);
      ctx.lineTo(x + 11, y + 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(cx - 1, y + 5, 2, 4);
      ctx.fillRect(cx - 1, y + 10, 2, 1);
      break;
    }
    case 'bandit': {
      ctx.fillStyle = '#6f4b2a';
      ctx.fillRect(x + 2, y + 8, 8, 2);
      ctx.fillStyle = '#2d2d2d';
      ctx.fillRect(x + 6, y + 3, 1, 7);
      ctx.fillStyle = '#c12b2b';
      ctx.fillRect(x + 2, y + 3, 5, 3);
      break;
    }
    case 'check': {
      ctx.strokeStyle = '#3fb950';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 6);
      ctx.lineTo(x + 5, y + 9);
      ctx.lineTo(x + 10, y + 3);
      ctx.stroke();
      break;
    }
    case 'coin': {
      // simple coin glyph
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(cx - 1, cy - 3, 2, 6);
      break;
    }
    case 'cloud': {
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(x + 4, y + 8, 3, 0, Math.PI * 2);
      ctx.arc(x + 8, y + 8, 4, 0, Math.PI * 2);
      ctx.arc(x + 6, y + 6, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'warning': {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(cx, y + 1);
      ctx.lineTo(x + 1, y + 11);
      ctx.lineTo(x + 11, y + 11);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'drop': {
      ctx.fillStyle = '#58a6ff';
      ctx.beginPath();
      ctx.moveTo(cx, y + 2);
      ctx.lineTo(x + 3, y + 6);
      ctx.lineTo(x + 9, y + 6);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawRoundedPanel(x, y, w, h, r, fillStyle) {
  ctx.save();
  ctx.fillStyle = fillStyle || 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  const rr = Math.min(r, w/2, h/2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Persistent small banner while Akkadian swarm is active
function renderSwarmBanner() {
  if (!akkadArmy.active) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const text = akkadArmy.targetsList && akkadArmy.targetsList.length
    ? `Akkad attacking: ${akkadArmy.targetsList.join(', ')}`
    : 'Akkad attacking';

  // Position just below the order status panel
  const panelWidth = 360;
  const panelHeight = 22;
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = (lastOrderPanel?.y || 4) + (lastOrderPanel?.h || 40) + 6;

  // Slow flashing red background
  const t = performance.now() / 500; // slower pulse
  const pulse = (Math.sin(t) + 1) / 2; // 0..1
  const alpha = 0.35 + pulse * 0.25; // 0.35..0.60
  ctx.fillStyle = `rgba(180, 20, 20, ${alpha.toFixed(3)})`;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);

  ctx.fillStyle = UI.text;
  ctx.font = UI.fontBody;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, panelY + panelHeight / 2);
  ctx.restore();
}

// Rumor scheduling tied to deliveries
function handleAkkadRumorsOnDelivery() {
  // Track progress regardless of cooldown
  akkadArmy.deliveriesSinceLastSwarm = (akkadArmy.deliveriesSinceLastSwarm || 0) + 1;
  if (akkadArmy.active) return; // don't alter mid-attack

  if (!akkadArmy.preparing) {
    // Start rumor phase either by chance or by progression threshold
    const forceRumor = akkadArmy.deliveriesSinceLastSwarm >= 4; // guarantee after 4 deliveries
    if (forceRumor || Math.random() < 0.35) {
      akkadArmy.preparing = true;
      // 1-3 deliveries, clamped to ensure max 6 since last swarm
      let d = Math.floor(Math.random() * 3) + 1; // 1-3
      const maxTotal = 6;
      if (akkadArmy.deliveriesSinceLastSwarm + d > maxTotal) {
        d = Math.max(1, maxTotal - akkadArmy.deliveriesSinceLastSwarm);
      }
      akkadArmy.deliveriesUntilSwarm = d;
      const msg = "Rumors swirl that the armies of Akkad are preparing for war...";
      showTempMessage(msg, 'cloud');
      addLog(msg);
    }
    return;
  }

  // If already preparing, count down to war
  if (akkadArmy.preparing) {
    akkadArmy.deliveriesUntilSwarm = Math.max(0, akkadArmy.deliveriesUntilSwarm - 1);
    if (akkadArmy.deliveriesUntilSwarm === 0) {
      // If cooldown remains, arm a pending trigger; otherwise go now
      if (akkadArmy.cooldown > 0) {
        akkadArmy.pendingSwarm = true;
      } else {
        triggerAkkadianSwarm();
      }
    }
  }
}

// Subtle vignette to draw the eye to center
function renderVignette() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const grd = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    Math.min(canvas.width, canvas.height) * 0.25,
    canvas.width / 2,
    canvas.height / 2,
    Math.max(canvas.width, canvas.height) * 0.65
  );
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// Animated atmosphere overlay (cloud shadows + optional rain), drawn over map
function renderAtmosphereOverlay() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const w = canvas.width;
  const h = canvas.height;
  const t = performance.now() / 1000;

  // Parameters by mode
  let cloudAlpha = 0.16;
  let cloudCount = 7;
  let rainAlpha = 0.0;
  let rainSpacing = 18;
  let tint = null;
  if (atmosphereMode === 'clear') { cloudAlpha = 0.12; cloudCount = 5; }
  else if (atmosphereMode === 'overcast') { cloudAlpha = 0.28; cloudCount = 9; }
  else if (atmosphereMode === 'rain') { cloudAlpha = 0.22; cloudCount = 8; rainAlpha = 0.14; rainSpacing = 16; }
  else if (atmosphereMode === 'dust') { cloudAlpha = 0.18; cloudCount = 7; tint = 'rgba(180,150,80,0.12)'; }

  // Cloud shadow blobs (multiply)
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = cloudAlpha;
  for (let i = 0; i < cloudCount; i++) {
    // Slightly faster drift to make motion more noticeable
    const phase = t * (0.08 + i * 0.012);
    const cx = (w * ((i + 1) / (cloudCount + 1))) + Math.cos(phase) * (w * 0.08);
    const cy = h * 0.4 + Math.sin(phase * 0.9) * (h * 0.06);
    const r = Math.min(w, h) * (0.16 + 0.08 * Math.sin(phase * 1.3 + i));
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.20)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dust tint overlay
  if (tint) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
  }

  // Rain streaks for rain mode
  if (rainAlpha > 0) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = rainAlpha;
    ctx.strokeStyle = 'rgba(180, 200, 230, 0.9)';
    ctx.lineWidth = 1;
    const spacing = rainSpacing;
    const drift = (t * 120) % spacing;
    ctx.beginPath();
    for (let x = -w; x < w * 2; x += spacing) {
      const x0 = x + drift;
      const y0 = -20;
      const x1 = x0 + 8;
      const y1 = h + 20;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  }

  // Cartoon floating clouds (Moebius-like, pixelated blocks)
  if (moebiusClouds && moebiusClouds.length) {
    ctx.globalCompositeOperation = 'source-over';
    for (const c of moebiusClouds) {
      const bs = c.blockSize;
      // Outline pass (shadow)
      ctx.globalAlpha = 0.25 * c.alpha;
      ctx.fillStyle = 'rgba(30, 30, 50, 0.9)';
      for (const b of c.blocks) {
        ctx.fillRect(Math.round(c.x + b.dx + 2), Math.round(c.y + b.dy + 2), bs, bs);
      }
      // Main fill
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = c.color;
      for (const b of c.blocks) {
        ctx.fillRect(Math.round(c.x + b.dx), Math.round(c.y + b.dy), bs, bs);
      }
      // Highlight edge
      ctx.globalAlpha = 0.25 * c.alpha;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (const b of c.edge) {
        ctx.fillRect(Math.round(c.x + b.dx), Math.round(c.y + b.dy), bs, bs);
      }
      ctx.globalAlpha = 1.0;
    }
  }

  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

// Notify nearby skirmishers that cargo was dropped; they may give up chase
function notifyCargoDropped(px, py) {
  if (!akkadArmy.skirmishers) return;
  const m = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);
  for (const s of akkadArmy.skirmishers) {
    if (s.reached) continue;
    const dist = m(s.x, s.y, px, py);
    if (dist <= SKIRMISHER_DECISION_RADIUS && s.mode === 'chasing') {
      s.mode = 'toTarget';
      s.moveInterval = 8;
    }
  }
}

// Decrement NPC city pause counters based on player movement
function playerDidMove() {
  if (!npcCaravans) return;
  for (const n of npcCaravans) {
    if (n.pauseMovesLeft && n.pauseMovesLeft > 0) n.pauseMovesLeft--;
  }
}

function updateNPCTraders() {
  // Spawn logic tied to progression (1 NPC per 5 deliveries, up to NPC_MAX)
  const allowedByProgress = Math.min(NPC_MAX, Math.floor(totalDeliveries / 5));
  while (npcCaravans.length < allowedByProgress && completedRoutes.length > 0 && npcSpawnCooldown <= 0) {
    spawnNPCOnRandomRoute();
    npcSpawnCooldown = 240; // delay between spawns
  }

  if (npcCaravans.length === 0) return;

  const moveToward = (u, tx, ty) => {
    const dx = Math.sign(tx - u.x);
    const dy = Math.sign(ty - u.y);
    if (dx !== 0) u.x += dx;
    else if (dy !== 0) u.y += dy;
  };

  for (const n of npcCaravans) {
    if (n.burning) {
      // Burn down timer
      n.burnTimer = (n.burnTimer || 0) - 1;
      if (n.burnTimer <= 0) {
        n._despawn = true;
        npcSpawnCooldown = Math.max(npcSpawnCooldown, 180);
      }
      continue;
    }
    // Hazards: bandits and Akkadian armies (checked even during pauses)
    if (bandits.active && !isCityTile(n.x, n.y)) {
      for (const b of bandits.packs) {
        if (!b.done && b.x === n.x && b.y === n.y) {
          n.burning = true; n.burnTimer = 90;
          addLog('A trader caravan was ambushed by bandits.');
          break;
        }
      }
    }
    if (!n.burning && akkadArmy.active) {
      const collideArmy = akkadArmy.raiders.some(r => !r.reached && r.x === n.x && r.y === n.y) ||
                          akkadArmy.skirmishers.some(s => !s.reached && s.x === n.x && s.y === n.y);
      if (collideArmy) {
        n.burning = true; n.burnTimer = 90;
        addLog('A trader caravan was lost amidst the Akkadian war.');
      }
    }
    if (n.burning) continue;

    // Pause in city until EITHER a short time passes OR the player makes a few moves
    // Only hold if both counters are still pending (AND), so either condition can release the pause
    {
      const framesLeft = n.pauseFrames || 0;
      const movesLeft = n.pauseMovesLeft || 0;
      if (framesLeft > 0 && movesLeft > 0) {
        if (n.pauseFrames > 0) n.pauseFrames--;
        continue;
      }
    }

    if (n.cooldown > 0) { n.cooldown--; continue; }
    moveToward(n, n.tx, n.ty);
    n.cooldown = n.interval;

    // City arrival handling
    const city = cities.find(c => c.x === n.x && c.y === n.y);
    if (city) {
      if (n.x === n.tx && n.y === n.ty) {
        // Record provenance for fairness checks
        const arrivedName = city.name;
        const nameA = getCityNameAt(n.ax, n.ay);
        const nameB = getCityNameAt(n.bx, n.by);
        n.lastCameFromName = (arrivedName === nameA ? nameB : nameA);
        // Toggle to other endpoint and pause before departing
        if (n.tx === n.ax && n.ty === n.ay) { n.tx = n.bx; n.ty = n.by; }
        else { n.tx = n.ax; n.ty = n.ay; }
        n.pauseFrames = 90; // ~1.5s
        n.pauseMovesLeft = 6; // or 6 player moves
        n.justArrived = true;
      }

      if (n.justArrived) {
        // Only accept the player's contract if this NPC's route actually goes from the source to the target city next
        const npcNextStopName = getCityNameAt(n.tx, n.ty);
        const mult = npcSnipeEnvMultiplier();
        const canSnipe = npcSnipeCooldown <= 0;
        if (!player.cargo && city.name === order.from && npcNextStopName === order.to) {
          const chance = NPC_ACCEPT_BASE_CHANCE * mult;
          if (canSnipe && Math.random() < chance) {
            addLog(`Another caravan accepted the contract in ${city.name}.`);
            showTempMessage(`Contract taken in ${city.name}.`, 'alert');
            order = generateOrder();
            npcSnipeCooldown = 900; // ~15s
          }
        } else if (player.cargo && city.name === order.to && n.lastCameFromName === order.from) {
          // Only undercut if they actually arrived from the source city for this order
          const chance = NPC_UNDERCUT_BASE_CHANCE * mult;
          if (canSnipe && Math.random() < chance) {
            addLog(`Another caravan delivered these goods to ${order.to} ahead of you.`);
            showTempMessage('Delivery undercut. Contract lost.', 'alert');
            player.cargo = null;
            order = generateOrder();
            npcSnipeCooldown = 900; // ~15s
          }
        }
        n.justArrived = false;
      }
    }
  }

  // Trim NPCs that might end up off-grid (safety)
  npcCaravans = npcCaravans.filter(n => !n._despawn && n.x >= 0 && n.x < MAP_WIDTH && n.y >= 0 && n.y < MAP_HEIGHT);
}

function spawnNPCOnRandomRoute() {
  const route = completedRoutes[Math.floor(Math.random() * completedRoutes.length)];
  if (!route || typeof route.fromTileX !== 'number') return;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const ax = route.fromTileX, ay = route.fromTileY;
  const bx = route.toTileX, by = route.toTileY;
  const startX = dir === 1 ? ax : bx;
  const startY = dir === 1 ? ay : by;
  const targetX = dir === 1 ? bx : ax;
  const targetY = dir === 1 ? by : ay;
  const id = Math.floor(Math.random() * 1e9);
  npcCaravans.push({
    x: startX, y: startY, tx: targetX, ty: targetY,
    ax, ay, bx, by,
    dir, cooldown: 0, interval: NPC_MOVE_INTERVAL,
    color: ['#7b5b2f', '#3b7a57', '#7a1c1c'][Math.floor(Math.random() * 3)],
    id
  });
}

function maybeSpawnNPCs() {
  const allowedByProgress = Math.min(NPC_MAX, Math.floor(totalDeliveries / 5));
  while (npcCaravans.length < allowedByProgress && completedRoutes.length > 0) {
    spawnNPCOnRandomRoute();
  }
}
