// One-shot generator: converts public/assets/stages/map.tmx into a Phaser-ready
// Tiled JSON tilemap with embedded tilesets, a per-polygon `colliders` object
// layer (driven by every visible layer whose painted gid has at least one
// <objectgroup> shape in its .tsx), 4 border walls around the map perimeter,
// and the minimum room/door object layout the GameScene expects.
//
// Run: node scripts/build-stages-map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STAGES_DIR = resolve(__dirname, '..', 'public', 'assets', 'stages');
const TMX_PATH = resolve(STAGES_DIR, 'map.tmx');
const OUT_PATH = resolve(STAGES_DIR, 'map.json');

const tmx = readFileSync(TMX_PATH, 'utf8');

const MAP_WIDTH = 42;
const MAP_HEIGHT = 34;
const TILE_SIZE = 32;
const MAP_PX_WIDTH = MAP_WIDTH * TILE_SIZE;
const MAP_PX_HEIGHT = MAP_HEIGHT * TILE_SIZE;

// Parse <layer name="..." ...><data encoding="csv">...</data></layer>
function parseCsvLayer(name) {
  const re = new RegExp(
    `<layer[^>]*name="${name}"[^>]*>\\s*<data encoding="csv">([\\s\\S]*?)</data>\\s*</layer>`,
  );
  const m = tmx.match(re);
  if (!m) throw new Error(`Layer ${name} not found in TMX`);
  const nums = m[1]
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parseInt(s, 10));
  if (nums.length !== MAP_WIDTH * MAP_HEIGHT) {
    throw new Error(
      `Layer ${name}: parsed ${nums.length} tiles, expected ${MAP_WIDTH * MAP_HEIGHT}`,
    );
  }
  return nums;
}

const layers = {
  Base: parseCsvLayer('Base'),
  Shadows: parseCsvLayer('Shadows'),
  Props: parseCsvLayer('Props'),
  Foreground: parseCsvLayer('Foreground'),
  Structure: parseCsvLayer('Structure'),
  Trees: parseCsvLayer('Trees'),
};

// firstgids from the TMX header (verified by reading map.tmx)
const TILESETS = [
  { firstgid: 1,    name: 'TX Plant',         image: 'TX Plant.png',         imagewidth: 512, imageheight: 512, columns: 16, tilecount: 256 },
  { firstgid: 257,  name: 'TX Tileset Grass', image: 'TX Tileset Grass.png', imagewidth: 256, imageheight: 256, columns: 8,  tilecount: 64  },
  { firstgid: 321,  name: 'TX Shadow Plant',  image: 'TX Shadow Plant.png',  imagewidth: 512, imageheight: 512, columns: 16, tilecount: 256 },
  { firstgid: 577,  name: 'TX Tileset Wall',  image: 'TX Tileset Wall.png',  imagewidth: 512, imageheight: 512, columns: 16, tilecount: 256 },
  { firstgid: 833,  name: 'TX Struct',        image: 'TX Struct.png',        imagewidth: 512, imageheight: 512, columns: 16, tilecount: 256 },
  { firstgid: 1089, name: 'TX Props',         image: 'TX Props.png',         imagewidth: 512, imageheight: 512, columns: 16, tilecount: 256 },
];

const COLLISION_FIRSTGID = 2000;

// Parse a .tsx and return Map<gid, Array<{x, y, w, h}>> — for each tile id with
// at least one <object> shape, accumulate axis-aligned bounding boxes (AABBs)
// of every shape in TILE-LOCAL coords. Polygons collapse to their bbox (most
// art-team-drawn polygons in this project are already axis-aligned rectangles
// expressed as 4-point polygons, so the bbox matches the intended hitbox).
function collisionShapesFromTsx(tsxFile, firstgid) {
  const xml = readFileSync(resolve(STAGES_DIR, tsxFile), 'utf8');
  const shapesByGid = new Map();

  const tileRe = /<tile\s+id="(\d+)"[^>]*>([\s\S]*?)<\/tile>/g;
  let tileMatch;
  while ((tileMatch = tileRe.exec(xml)) !== null) {
    const localId = parseInt(tileMatch[1], 10);
    const tileBody = tileMatch[2];

    // Each tile may have at most one <objectgroup>, with N <object> entries.
    const ogMatch = tileBody.match(/<objectgroup[^>]*>([\s\S]*?)<\/objectgroup>/);
    if (!ogMatch) continue;
    const ogBody = ogMatch[1];

    const shapes = [];

    // Match <object ... /> (self-closing rectangle) AND <object ...>...</object>
    // (polygon-containing). Single regex with optional body capture.
    const objRe = /<object\b([^>]*?)(?:\/>|>([\s\S]*?)<\/object>)/g;
    let objMatch;
    while ((objMatch = objRe.exec(ogBody)) !== null) {
      const attrs = objMatch[1];
      const body = objMatch[2] ?? '';

      const ox = parseFloat((attrs.match(/\bx="([^"]*)"/) || [, '0'])[1]);
      const oy = parseFloat((attrs.match(/\by="([^"]*)"/) || [, '0'])[1]);
      const wAttr = attrs.match(/\bwidth="([^"]*)"/);
      const hAttr = attrs.match(/\bheight="([^"]*)"/);

      const polyMatch = body.match(/<polygon[^>]*points="([^"]*)"/);
      if (polyMatch) {
        // Polygon points are relative to (ox, oy). Compute bbox in tile-local space.
        const pts = polyMatch[1]
          .split(/\s+/)
          .filter((s) => s.length > 0)
          .map((p) => {
            const [px, py] = p.split(',').map(parseFloat);
            return { x: ox + px, y: oy + py };
          });
        if (pts.length === 0) continue;
        const minX = Math.min(...pts.map((p) => p.x));
        const maxX = Math.max(...pts.map((p) => p.x));
        const minY = Math.min(...pts.map((p) => p.y));
        const maxY = Math.max(...pts.map((p) => p.y));
        const w = maxX - minX;
        const h = maxY - minY;
        if (w > 0 && h > 0) shapes.push({ x: minX, y: minY, w, h });
      } else if (wAttr && hAttr) {
        const w = parseFloat(wAttr[1]);
        const h = parseFloat(hAttr[1]);
        if (w > 0 && h > 0) shapes.push({ x: ox, y: oy, w, h });
      }
    }

    if (shapes.length > 0) {
      shapesByGid.set(firstgid + localId, shapes);
    }
  }

  return shapesByGid;
}

// Tiles flagged as colliding in their .tsx that we explicitly want to be
// walkable anyway (low bushes, decorative debris, etc.). Empty for now —
// add gids here if a specific prop turns out to be annoying.
const NEVER_COLLIDE = new Set();

const collisionShapes = new Map();
for (const m of [
  collisionShapesFromTsx('TX Plant.tsx',        1),
  collisionShapesFromTsx('TX Tileset Wall.tsx', 577),
  collisionShapesFromTsx('TX Struct.tsx',       833),
  collisionShapesFromTsx('TX Props.tsx',        1089),
]) {
  for (const [gid, shapes] of m.entries()) {
    if (NEVER_COLLIDE.has(gid)) continue;
    collisionShapes.set(gid, shapes);
  }
}

// Build world-space collider rects: for each painted gid in collision-source
// layers (Structure → Trees → Props precedence), emit one rect per shape in
// world coords clamped to the tile bounds. Layer precedence prevents double-
// emit when two layers paint colliding gids on the same cell.
const colliderRects = [];
const sourceLayers = [
  { name: 'Structure', data: layers.Structure },
  { name: 'Trees',     data: layers.Trees },
  { name: 'Props',     data: layers.Props },
];
for (let i = 0; i < MAP_WIDTH * MAP_HEIGHT; i++) {
  const cellX = (i % MAP_WIDTH) * TILE_SIZE;
  const cellY = Math.floor(i / MAP_WIDTH) * TILE_SIZE;
  for (const layer of sourceLayers) {
    const shapes = collisionShapes.get(layer.data[i]);
    if (!shapes) continue;
    for (const s of shapes) {
      // Clamp shape to tile bounds (defensive: a few polygons in the .tsx
      // pre-extend past the cell edge by a fraction of a px because of how
      // Tiled rounds polygon vertices).
      const sx = Math.max(0, Math.min(TILE_SIZE, s.x));
      const sy = Math.max(0, Math.min(TILE_SIZE, s.y));
      const sw = Math.max(0, Math.min(TILE_SIZE - sx, s.w));
      const sh = Math.max(0, Math.min(TILE_SIZE - sy, s.h));
      if (sw > 0 && sh > 0) {
        colliderRects.push({ x: cellX + sx, y: cellY + sy, w: sw, h: sh });
      }
    }
    break;
  }
}

// Border walls: 4 thick rectangles just OUTSIDE the playable area so the
// player and any physics body bounces off the map edge instead of walking
// into the void. Camera bounds cover the same playable rect.
const BORDER_THICKNESS = TILE_SIZE * 4; // generous so fast-moving things don't tunnel
colliderRects.push({ x: -BORDER_THICKNESS, y: -BORDER_THICKNESS, w: MAP_PX_WIDTH + 2 * BORDER_THICKNESS, h: BORDER_THICKNESS }); // top
colliderRects.push({ x: -BORDER_THICKNESS, y: MAP_PX_HEIGHT,     w: MAP_PX_WIDTH + 2 * BORDER_THICKNESS, h: BORDER_THICKNESS }); // bottom
colliderRects.push({ x: -BORDER_THICKNESS, y: 0,                 w: BORDER_THICKNESS, h: MAP_PX_HEIGHT });                       // left
colliderRects.push({ x: MAP_PX_WIDTH,      y: 0,                 w: BORDER_THICKNESS, h: MAP_PX_HEIGHT });                       // right

let nextId = 100;
const newId = () => ++nextId;

const tileLayer = (name, data, opts = {}) => ({
  data,
  height: MAP_HEIGHT,
  id: newId(),
  name,
  opacity: 1,
  type: 'tilelayer',
  visible: true,
  width: MAP_WIDTH,
  x: 0,
  y: 0,
  ...opts,
});

// OPEN_ENTRANCE door at the TMX Spawn point (480, 704). Tiled tile-object coordinates
// are bottom-left, so this places a 32x32 zone whose top-left sits at (464, 672).
// Pulled out to a constant so the player spawn (#setupPlayer in game-scene.ts) lands
// in the playable open field, not inside a wall.
const SPAWN_DOOR = {
  id: 1,
  x: 464,
  y: 704 + 32, // bottom of a 32-tall tile sitting on row y=704
  width: 32,
  height: 32,
  direction: 'DOWN',
  doorType: 'OPEN_ENTRANCE',
};

// gid forces Tiled to treat the object as a tile-object: Phaser's tilemap
// parser then reports (x, y) as the bottom-left of the rectangle, which is
// exactly what Door's `add.zone(x, y, w, h).setOrigin(0, 1)` assumes. Without
// a gid, rectangle objects come in with top-left coords and the zone ends up
// floating 32 px above where the player expects to spawn.
const doorObject = (door) => ({
  gid: COLLISION_FIRSTGID,
  height: door.height,
  id: newId(),
  name: '',
  properties: [
    { name: 'direction',         propertytype: 'direction',  type: 'string', value: door.direction },
    { name: 'doorType',          propertytype: 'doorType',   type: 'string', value: door.doorType  },
    { name: 'id',                                            type: 'int',    value: door.id         },
    { name: 'isLevelTransition',                             type: 'bool',   value: false           },
    { name: 'targetDoorId',                                  type: 'int',    value: door.id         },
    { name: 'targetLevel',                                   type: 'string', value: ''              },
    { name: 'targetRoomId',                                  type: 'int',    value: 1               },
    { name: 'trapDoorTrigger',   propertytype: 'trapTrigger', type: 'string', value: 'NONE'         },
  ],
  rotation: 0,
  type: 'door',
  visible: true,
  width: door.width,
  x: door.x,
  y: door.y,
});

const roomGroup = {
  id: newId(),
  layers: [
    { draworder: 'topdown', id: newId(), name: 'doors',    objects: [doorObject(SPAWN_DOOR)], opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
    { draworder: 'topdown', id: newId(), name: 'chests',   objects: [], opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
    { draworder: 'topdown', id: newId(), name: 'pots',     objects: [], opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
    { draworder: 'topdown', id: newId(), name: 'switches', objects: [], opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
    { draworder: 'topdown', id: newId(), name: 'enemies',  objects: [], opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
  ],
  name: '1',
  opacity: 1,
  type: 'group',
  visible: true,
  x: 0,
  y: 0,
};

// Room rectangles are tile-objects (gid set) so Phaser parses their (x, y) as
// bottom-left in world space — matching what #setupCamera / #handleRoomTransition
// expect when they compute `roomSize.y - roomSize.height` for the camera bounds.
const roomsListLayer = {
  draworder: 'topdown',
  id: newId(),
  locked: true,
  name: 'rooms',
  objects: [
    {
      gid: COLLISION_FIRSTGID,
      height: MAP_PX_HEIGHT,
      id: newId(),
      name: '',
      properties: [{ name: 'id', type: 'int', value: 1 }],
      rotation: 0,
      type: 'room',
      visible: true,
      width: MAP_PX_WIDTH,
      x: 0,
      y: MAP_PX_HEIGHT,
    },
  ],
  opacity: 1,
  type: 'objectgroup',
  visible: true,
  x: 0,
  y: 0,
};

// New: per-polygon collider object layer consumed by GameScene to populate a
// static physics group. Phaser parses rectangle objects (no gid) with (x, y)
// at TOP-LEFT, so the rects below are emitted in that convention.
const collidersLayer = {
  draworder: 'topdown',
  id: newId(),
  name: 'colliders',
  objects: colliderRects.map((r) => ({
    height: r.h,
    id: newId(),
    name: '',
    rotation: 0,
    type: 'collider',
    visible: true,
    width: r.w,
    x: r.x,
    y: r.y,
  })),
  opacity: 1,
  type: 'objectgroup',
  visible: false,
  x: 0,
  y: 0,
};

const map = {
  compressionlevel: -1,
  height: MAP_HEIGHT,
  infinite: false,
  layers: [
    tileLayer('Base',       layers.Base),
    tileLayer('Shadows',    layers.Shadows),
    tileLayer('Props',      layers.Props),
    tileLayer('Foreground', layers.Foreground),
    tileLayer('Structure',  layers.Structure),
    tileLayer('Trees',      layers.Trees),
    // Empty collision tile layers — kept so the existing GameScene paths that
    // reference TILED_LAYER_NAMES.COLLISION / ENEMY_COLLISION don't have to
    // branch on level. The real collision lives in `colliders` below.
    tileLayer('collision',       new Array(MAP_WIDTH * MAP_HEIGHT).fill(0), { opacity: 0, visible: false }),
    tileLayer('enemy_collision', new Array(MAP_WIDTH * MAP_HEIGHT).fill(0), { opacity: 0, visible: false }),
    // Per-polygon static colliders + border walls.
    collidersLayer,
    // Object layers (rooms list + per-room groups).
    { id: newId(), name: 'rooms', type: 'group', opacity: 1, visible: true, x: 0, y: 0, layers: [roomGroup] },
    roomsListLayer,
  ],
  nextlayerid: 999,
  nextobjectid: 999,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tiledversion: '1.10.0',
  tileheight: TILE_SIZE,
  tilesets: [
    ...TILESETS.map((t) => ({
      columns: t.columns,
      firstgid: t.firstgid,
      image: t.image,
      imageheight: t.imageheight,
      imagewidth: t.imagewidth,
      margin: 0,
      name: t.name,
      spacing: 0,
      tilecount: t.tilecount,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    })),
    {
      columns: 1,
      firstgid: COLLISION_FIRSTGID,
      image: 'collision32.png',
      imageheight: 32,
      imagewidth: 32,
      margin: 0,
      name: 'collision',
      spacing: 0,
      tilecount: 1,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    },
  ],
  tilewidth: TILE_SIZE,
  type: 'map',
  version: '1.10',
  width: MAP_WIDTH,
};

writeFileSync(OUT_PATH, JSON.stringify(map, null, 1));
console.log(`Wrote ${OUT_PATH}`);
console.log(`  Layers: ${map.layers.length}`);
console.log(`  Tilesets: ${map.tilesets.length}`);
console.log(`  Collider rects: ${colliderRects.length} (${colliderRects.length - 4} from polygons + 4 borders)`);
