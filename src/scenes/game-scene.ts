import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { ASSET_KEYS, CHEST_REWARD_TO_TEXTURE_FRAME, CHARACTER_ANIMATIONS } from '../common/assets';
import { Player } from '../game-objects/player/player';
import { KeyboardComponent } from '../components/input/keyboard-component';
import { Spider } from '../game-objects/enemies/spider';
import { Wisp } from '../game-objects/enemies/wisp';
import { CharacterGameObject } from '../game-objects/common/character-game-object';
import { CHEST_REWARD_TO_DIALOG_MAP, DIRECTION, ELEMENT, SPELL_ID } from '../common/common';
import * as CONFIG from '../common/config';
import { Pot } from '../game-objects/objects/pot';
import { Chest } from '../game-objects/objects/chest';
import { GameObject, LevelData, SpellId } from '../common/types';
import { CUSTOM_EVENTS, EVENT_BUS } from '../common/event-bus';
import {
  exhaustiveGuard,
  getDirectionOfObjectFromAnotherObject,
  isArcadePhysicsBody,
  isLevelName,
} from '../common/utils';
import { TiledRoomObject } from '../common/tiled/types';
import {
  CHEST_REWARD,
  DOOR_TYPE,
  SWITCH_ACTION,
  TILED_LAYER_NAMES,
  TILED_TILESET_NAMES,
  TRAP_TYPE,
} from '../common/tiled/common';
import {
  getAllLayerNamesWithPrefix,
  getTiledChestObjectsFromMap,
  getTiledDoorObjectsFromMap,
  getTiledEnemyObjectsFromMap,
  getTiledPotObjectsFromMap,
  getTiledRoomObjectsFromMap,
  getTiledSwitchObjectsFromMap,
} from '../common/tiled/tiled-utils';
import { Door } from '../game-objects/objects/door';
import { Button } from '../game-objects/objects/button';
import { InventoryManager } from '../components/inventory/inventory-manager';
import { CHARACTER_STATES } from '../components/state-machine/states/character/character-states';
import { WeaponComponent } from '../components/game-object/weapon-component';
import { DataManager } from '../common/data-manager';
import { Drow } from '../game-objects/enemies/boss/drow';
import { FireBolt } from '../game-objects/spells/fire-bolt';
import { FireArea } from '../game-objects/spells/fire-area';
import { FireBreath } from '../game-objects/spells/fire-breath';
import { EarthBolt } from '../game-objects/spells/earth-bolt';
import { EarthFireExplosion } from '../game-objects/spells/earth-fire-explosion';
import { LavaPool } from '../game-objects/spells/lava-pool';
import { EarthWallPillar } from '../game-objects/spells/earth-wall-pillar';
import { getSpriteFramePalette } from '../game-objects/spells/sprite-palette';
import { WaterSpike } from '../game-objects/spells/water-spike';
import { WaterTornado } from '../game-objects/spells/water-tornado';
import { WaterBall } from '../game-objects/spells/water-ball';
import { EarthBump } from '../game-objects/spells/earth-bump';
import { IceShard } from '../game-objects/spells/ice-shard';
import { WindBolt } from '../game-objects/spells/wind-bolt';
import { ThunderStrike } from '../game-objects/spells/thunder-strike';
import { ThunderSplash } from '../game-objects/spells/thunder-splash';
import { LightningBeam } from '../game-objects/spells/lightning-beam';
import { VoidOrbPickup } from '../game-objects/pickups/void-orb-pickup';
import { DarkBoltPickup } from '../game-objects/pickups/dark-bolt-pickup';
import { NetworkedSpecialPickup } from '../game-objects/pickups/networked-special-pickup';
import { SpecialSpellInventory } from '../common/special-spell-inventory';
import { AirBurst } from '../game-objects/spells/air-burst';
// Side-effect import: registers SPELL_ID.DASH factory so remote dash casts replay the roll VFX.
import '../game-objects/spells/dash-vfx';
// Star Shield — side-effect import registers SPELL_ID.STAR_SHIELD factory.
import { STAR_SHIELD_REFLECT_SPEED_MULT } from '../game-objects/spells/star-shield';
import { VoidOrb } from '../game-objects/spells/void-orb';
import { DarkBolt, DARK_BOLT_ENV_LIGHT_TEXTURE_KEY, ensureDarkBoltEnvLightTexture } from '../game-objects/spells/dark-bolt';
import { LightningBurstCombo, LightningStrikeCombo } from '../game-objects/spells/lightning-combo';
import { SteamBurst } from '../game-objects/spells/steam-burst';
import { Puddle } from '../game-objects/spells/puddle';
import { SPELL_FACTORY_REGISTRY } from '../game-objects/spells/spell-registry';
import { maybeSpawnGhost } from '../game-objects/spells/spell-ghost';
import { ElementManager } from '../common/element-manager';
import {
  EARTH_WALL_MANA_COST,
  EARTH_WALL_COOLDOWN,
  EARTH_WALL_PILLAR_COUNT,
  EARTH_WALL_PILLAR_SPACING,
  EARTH_WALL_FIREBOLT_SPLASH_RADIUS,
  WIND_FIRE_SPLIT_ANGLE_RAD,
  WIND_FIRE_SPLIT_CHILD_SCALE,
  WIND_FIRE_SPLIT_CHILD_DAMAGE_MULT,
  WIND_FIRE_SPLIT_FORWARD_OFFSET_PX,
  WIND_TORNADO_CONE_RANGE_PX,
  WIND_TORNADO_CONE_HALF_ANGLE_RAD,
  WIND_TORNADO_CONE_PUDDLE_COUNT,
  WIND_TORNADO_CONE_PUDDLE_AMOUNT,
  WIND_PUDDLE_PUSH_PX_WATER,
  WIND_PUDDLE_PUSH_PX_MUD,
  WIND_PUDDLE_PUSH_PX_LAVA,
  WIND_PUDDLE_PUSH_DURATION_MS_WATER,
  WIND_PUDDLE_PUSH_DURATION_MS_MUD,
  WIND_PUDDLE_PUSH_DURATION_MS_LAVA,
} from '../common/config';
import { NetworkManager } from '../networking/network-manager';
import { RemoteInputComponent } from '../components/input/remote-input-component';
import { MusicManager } from '../common/music-manager';
import type { PlayerUpdateBroadcast, RoomTransitionPayload, PlayerDisconnectedPayload, PlayerUpdatePayload, SpellCastBroadcast, PlayerInfo, BreathStartBroadcast, BreathUpdateBroadcast, BreathEndBroadcast, EarthWallPillarBroadcast, EarthWallPillarDestroyBroadcast, MatchStateChangedPayload, MatchCountdownTickPayload, DamageConfirmedPayload, SpellDestroyedPayload, EliminationPayload, RespawnPayload, MatchConfig, MatchEndedPayload, TdmPlayerStat, MatchSpawnsPayload, PickupSpawnedPayload, PickupCollectedPayload } from '../networking/types';
import { RUNTIME_CONFIG } from '../common/runtime-config';
import { pickStartSpawn } from '../common/spawn-assignment';
import type { Direction, CharacterAnimation } from '../common/types';

/** Quick blue-water + brown-debris splash spawned when a water spell breaks
 *  against an EarthWall pillar. Pure visuals — no physics body, no damage.
 *  Self-destroys on fade. Kept as a free function (not a class) because there's
 *  zero state to manage and it's only used by the spike/tornado-vs-wall combos. */
function spawnEarthBlockSplash(scene: Phaser.Scene, x: number, y: number): void {
  // ~14 small particles split between cyan (water) and brown (earth debris).
  // Each is a 2×2 Graphics rectangle that flies out radially and fades.
  const particleCount = 14;
  const lifetimeMs = 350;
  const speedRange = { min: 35, max: 70 }; // px/s

  for (let i = 0; i < particleCount; i++) {
    const isWater = i % 2 === 0;
    const color = isWater
      ? (Math.random() < 0.5 ? 0x88c4ff : 0xaaddff) // cyan / light blue
      : (Math.random() < 0.5 ? 0x6b4c2a : 0x4a3520); // light/dark mud brown
    const size = isWater ? 2 : 2; // same size, color tells them apart

    const g = scene.add.graphics({ x, y });
    g.fillStyle(color, 1);
    g.fillRect(-size / 2, -size / 2, size, size);
    // Above the spike depth but below characters' depths so it reads as
    // mid-foreground splash, not over the player sprite.
    g.setDepth(y + 8);

    // Radial fan with a slight upward bias (debris/water arcs upward off the wall).
    const angle = Math.random() * Math.PI * 2;
    const speed = speedRange.min + Math.random() * (speedRange.max - speedRange.min);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 30; // upward bias

    scene.tweens.add({
      targets: g,
      x: x + vx * (lifetimeMs / 1000),
      y: y + vy * (lifetimeMs / 1000),
      alpha: 0,
      duration: lifetimeMs,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }
}

export class GameScene extends Phaser.Scene {
  #levelData!: LevelData;
  #controls!: KeyboardComponent;
  #player!: Player;
  #isHitboxDebugEnabled = false;
  #blockingGroup!: Phaser.GameObjects.Group;
  #objectsByRoomId!: {
    [key: number]: {
      chestMap: { [key: number]: Chest };
      doorMap: { [key: number]: Door };
      doors: Door[];
      switches: Button[];
      pots: Pot[];
      chests: Chest[];
      enemyGroup?: Phaser.GameObjects.Group;
      room: TiledRoomObject;
    };
  };
  #collisionLayer!: Phaser.Tilemaps.TilemapLayer;
  #enemyCollisionLayer!: Phaser.Tilemaps.TilemapLayer;
  // STAGES uses per-polygon static colliders (parsed from the `colliders` object
  // layer in map.json) instead of cell-granular tile collision. Empty for non-
  // STAGES levels — those still rely on #collisionLayer / #enemyCollisionLayer.
  #staticCollidersGroup!: Phaser.Physics.Arcade.StaticGroup;
  #doorTransitionGroup!: Phaser.GameObjects.Group;
  #currentRoomId!: number;
  #lockedDoorGroup!: Phaser.GameObjects.Group;
  #switchGroup!: Phaser.GameObjects.Group;
  #rewardItem!: Phaser.GameObjects.Image;
  #activeFireAreaOverlapsByBolt: Map<FireBolt, Set<FireArea>> = new Map();
  #activeFireBreath: FireBreath | undefined;
  #fireBreathDamageTimer: Phaser.Time.TimerEvent | undefined;
  #activeFireBreathAreaCombos: Set<FireArea> = new Set();
  #earthWallGroup!: Phaser.GameObjects.Group;
  #debugFlyingObeliskGroup!: Phaser.GameObjects.Group;
  // Draw-mode state for the EarthWall spell
  // Phase 1: key 3 pressed → #earthWallPendingClick = true (waiting for mouse click)
  // Phase 2: mouse clicked  → #earthWallDrawingMode = true (pillars follow cursor)
  #earthWallPendingClick: boolean = false;
  #earthWallDrawingMode: boolean = false;
  #earthWallDrawingPillarCount: number = 0;
  #earthWallLastPlacedX: number = -Infinity;
  #earthWallLastPlacedY: number = -Infinity;
  // Tracks previous-frame left-mouse state so we can detect a fresh click
  #earthWallMouseWasDown: boolean = false;
  // Timestamp (ms) of the last completed EarthWall activation — used to enforce the cooldown.
  #earthWallLastCastTime: number = -Infinity;
  // Multiplayer crumble dedupe: pillars currently being destroyed by an
  // inbound NETWORK_EARTH_WALL_PILLAR_DESTROY. The DESTROY broadcast hook
  // skips these so we don't echo a destroy event back to the network when we
  // were the responder, only when we were the originator of the crumble.
  #pillarsBeingRemotelyDestroyed: WeakSet<EarthWallPillar> = new WeakSet();
  // Multiplayer: remote players keyed by playerId
  #remotePlayers = new Map<string, Player>();
  #remoteSpellGroup!: Phaser.GameObjects.Group;
  // Phase 9.3 (Plan 03): cross-player overlap target. Holds Player instances for every
  // lazily-spawned remote player; tagged via setData('playerId', …).
  #remotePlayerGroup!: Phaser.GameObjects.Group;
  #remoteFireBreaths = new Map<string, FireBreath>();
  // Phase 9.3 (Plan 03): dedupe set for NETWORK_DAMAGE_CONFIRMED. Cleared on shutdown.
  #appliedDamageSpellIds: Set<string> = new Set();
  // Event-readiness fix: playerIds currently DEAD (between elimination and respawn). The per-frame
  // remote interpolation loop (#interpolateRemotePlayers) drives a remote's animation from the state
  // it broadcasts over WebRTC — a dead player keeps sending IDLE/MOVE, which would replay walk/idle and
  // OVERRIDE the death animation (the intermittent "death anim sometimes doesn't play" bug). While an id
  // is in this set, the interpolation loop skips its state/animation updates so DIE_DOWN stays on screen.
  // Set on #onElimination, cleared on #onRespawn.
  #deadPlayerIds: Set<string> = new Set();
  // Players that left the match. Guards #onRemotePlayerUpdate's lazy-spawn fallback —
  // position packets travel over WebRTC (star: relayed via host) while the disconnect
  // notice comes over the server socket, so a stale pos packet can arrive AFTER
  // game:player-disconnected and would otherwise resurrect a frozen ghost avatar.
  #disconnectedPlayerIds: Set<string> = new Set();
  // Special-spell pickups: pickupId → sprite. Spawned from server pickup:spawned broadcasts, removed
  // on pickup:collected (so all clients agree). Cleared on shutdown.
  #pickups: Map<string, NetworkedSpecialPickup> = new Map();
  // Phase 9.3 (Plan 03): death overlay/countdown state for local-player elimination.
  #deathOverlay: Phaser.GameObjects.Rectangle | undefined;
  #deathCountdownText: Phaser.GameObjects.BitmapText | undefined;
  #deathCountdownTimer: Phaser.Time.TimerEvent | undefined;
  #deathCountdownRemaining: number = 0;
  // Countdown cinematic (LFC-06..09): set on COUNTDOWN, cleared on ACTIVE.
  // #combatLocked is an additive guard that gates spell handlers (#updateFireBreathChanneling,
  // #updateEarthWallSpell) that bypass #controls.isMovementLocked. Default false — set true
  // only when match:state-changed COUNTDOWN arrives.
  #combatLocked: boolean = false;
  // Phase 9.3 — Pre-declared for Plan 03 to consume (see 09.3-04-SUMMARY.md). When true, all
  // gameplay input (cast/dash) is suppressed for the dead local player until respawn.
  #deathLockActive: boolean = false;
  // DarkBolt cast windup — flag + visual handles. While active, the player is
  // locked in place via isMovementLocked and a pulsing red/black glow + crimson
  // aura render on/around the player sprite. See #beginDarkBoltWindup.
  #darkBoltWindupActive: boolean = false;
  #darkBoltCasterGlowFX: { color: number } | undefined;
  #darkBoltCasterGlowTween: Phaser.Tweens.Tween | undefined;
  #darkBoltCasterBurst: Phaser.GameObjects.Image | undefined;
  #countdownText: Phaser.GameObjects.BitmapText | null = null;
  // Phase 14 bugfix (#1/#2): GameScene-local match-start intro. The LoadingScene cinematic (~8s)
  // outlasts the server countdown (5.5s), so GameScene is born AFTER the server's
  // COUNTDOWN→ACTIVE broadcasts and the server-driven #onMatchStateChanged intro never fires.
  // Instead GameScene runs its OWN intro on boot (banner + camera + a LOCAL 5→1 countdown) and
  // owns the movement/combat lock lifecycle. #localIntroRan makes #onMatchStateChanged a no-op so
  // a late/stray server transition can't fight the local intro.
  #localIntroRan: boolean = false;
  #localCountdownTimer: Phaser.Time.TimerEvent | null = null;
  // Phase 14 (Plan 03) — TDM intro cinematic: map-name banner shown during the
  // COUNTDOWN cinematic (D-18 step 1 / D-19 reveal-duration fix). Torn down when its
  // own reveal tween completes, and force-killed on #exitCountdownMode / SHUTDOWN.
  #mapBanner: Phaser.GameObjects.BitmapText | null = null;
  #mapBannerRevealTween: Phaser.Tweens.Tween | null = null;
  #mapBannerFadeTween: Phaser.Tweens.Tween | null = null;
  // Phase 14 (Plan 04, D-12/D-13, UI-SPEC surface 3): respawn-invulnerability cue.
  // A sustained looping alpha pulse on the LOCAL player while invuln is active, started
  // in #onRespawn and stopped on the first of move / cast / the max-duration cap
  // (RESPAWN_INVULN_MAX_MS). #invulnUntil is a CLIENT-SIDE mirror for the cancel logic
  // only — the SERVER (#invulnUntil in game-room.ts) is the sole damage authority (D-14);
  // this never reports invuln state back to the server.
  #invulnPulseTween: Phaser.Tweens.Tween | null = null;
  #invulnUntil: number = 0;
  // Faded ring around the local player at PLAYER_ATTACK_RANGE_PX so the player can see their reach.
  #rangeRing: Phaser.GameObjects.Graphics | undefined;
  // EarthBump-vs-EarthWall combo overlap result: maps the bump → set of shattered pillar positions
  // so we only fire shards once per pillar.
  #bumpsThatShattered = new WeakSet<EarthBump>();
  // Multiplayer: dedupes "the local player got launched by this remote bump".
  // A bump's hitbox stays active for ~250ms so without this we'd re-apply the
  // knockback every frame the player stayed inside it.
  #earthBumpsThatPushedMe = new WeakSet<EarthBump>();
  // Symmetric for "a remote player got launched by THIS bump my local cast" —
  // dedupes the cross-player overlap callback so a single overlap doesn't fire
  // multiple knockback broadcasts on the remote target.
  #earthBumpsThatPushedRemote = new WeakMap<EarthBump, Set<string>>();
  // WaterTornado-vs-EarthWall grind state: per-tornado map of per-pillar
  // last-event timestamps so erosion ticks / mud drops / splash particles
  // fire on their own cadences without lockstep. WeakMap on the outer key
  // lets a destroyed tornado's state be GC'd automatically; the inner Map
  // entries for destroyed pillars are stale-but-harmless (we re-check
  // pillar.active each frame before damaging).
  #tornadoGrindState: WeakMap<WaterTornado, Map<EarthWallPillar, { lastErosion: number; lastSplash: number; lastMud: number }>> = new WeakMap();
  // Lava-puddle damage cadence per (puddle, character). Both keys are
  // WeakMap so GC reclaims state for destroyed puddles / characters
  // automatically — no explicit cleanup needed.
  #lavaDamageState: WeakMap<Puddle, WeakMap<CharacterGameObject, number>> = new WeakMap();

  constructor() {
    super({
      key: SCENE_KEYS.GAME_SCENE,
    });
  }

  get player(): Player {
    return this.#player;
  }

  public init(data: LevelData): void {
    this.#levelData = data;
    this.#currentRoomId = data.roomId;
  }

  public create(): void {
    if (!this.input.keyboard) {
      console.warn('Phaser keyboard plugin is not setup properly.');
      return;
    }
    this.#controls = new KeyboardComponent(this, this.input.keyboard);
    this.#configureArcadeDebug();

    this.#createLevel();
    if (this.#collisionLayer === undefined || this.#enemyCollisionLayer === undefined) {
      console.warn('Missing required collision layers for game.');
      return;
    }

    this.#showObjectsInRoomById(this.#levelData.roomId);
    this.#setupPlayer();
    this.#setupCamera();
    this.#rewardItem = this.add.image(0, 0, ASSET_KEYS.UI_ICONS, 0).setVisible(false).setOrigin(0, 1);
    this.#earthWallGroup = this.add.group();
    this.#debugFlyingObeliskGroup = this.add.group();
    this.#remoteSpellGroup = this.add.group({ runChildUpdate: false });
    // Phase 9.3 (Plan 03): remote-player overlap group (PVP-02 cross-player damage).
    this.#remotePlayerGroup = this.add.group({ runChildUpdate: false });

    this.#registerColliders();
    this.#registerCustomEvents();
    this.#setupNetworking();

    this.scene.launch(SCENE_KEYS.UI_SCENE);

    // DEV: on-screen "WIN" button that fakes the victory screen (CONFIG.DEV_VICTORY_BUTTON).
    if (CONFIG.DEV_VICTORY_BUTTON) this.#createDevVictoryButton();

    // Phase 14 bugfix (#1/#2): run the match-start intro locally on boot (the server's
    // COUNTDOWN→ACTIVE window already elapsed during the LoadingScene cinematic, so the
    // server-driven intro never reaches us) and ask the server to replay our team spawn.
    this.#maybeStartLocalIntro();

    // Switch to gameplay music. MusicManager handles the cross-fade and is a
    // no-op if gameplay music is already playing (e.g. room restarts).
    MusicManager.instance.playGameplay(this);
  }

  public update(_time: number, delta: number): void {
    this.#handleHitboxDebugToggle();
    this.#handlePrintCoordsKey();
    this.#updateFireSpellCombos();
    this.#updateFireBreathChanneling();
    this.#updateFireBreathAreaCombo();
    this.#updateEarthFireCombo();
    this.#updateEarthBoltFireAreaCombo();
    this.#updateEarthWallSpell();
    this.#updateFireBoltThunderCombo();
    this.#updateThunderFireAreaCombo();
    this.#updateThunderStrikePuddleCombo();
    this.#updateFireWaterSteamCombo();
    this.#updateVoidOrbCombos(delta);
    this.#updateDarkBoltConsumePuddles();
    this.#updateEarthBumpWallCombo();
    this.#updateFireBreathVsEarthWall();
    this.#handleRadialMenuInput();
    this.#handleCarouselInput();
    this.#handleDashInput();
    this.#handleSpecialCastInput();
    this.#updateLightningBeamCombos();
    this.#updateWaterSpikeEarthWallCombo();
    this.#updateWaterTornadoEarthWallCombo();
    this.#updateWindBoltEarthWallCombo();
    this.#updateWindBoltFireAreaCombo();
    this.#updateWindBoltFireBoltSplitCombo();
    this.#updateWindBoltWaterTornadoCombo();
    this.#updateWindBoltPuddlePushCombo();
    this.#interpolateRemotePlayers(delta);
    this.#updateLavaWaterExtinguishCombo(delta);
    this.#updateFireAreaPuddleEvaporateCombo(delta);
    this.#updateMudPuddleSlow();
    this.#updateRangeRing();
    this.#updateInvulnBlinkCancel();
  }

  /**
   * Phase 14 (D-12): per-frame cancel checks for the respawn-invuln pulse — the MOVE and
   * TIMEOUT halves (the CAST half is hooked in #onLocalSpellCast). Guarded on
   * #invulnUntil > 0 first so the common (not-invuln) case is a single comparison.
   *   - Move: any non-zero WASD movement input from the local player cancels.
   *   - Timeout: hitting the RESPAWN_INVULN_MAX_MS cap cancels.
   */
  #updateInvulnBlinkCancel(): void {
    if (this.#invulnUntil <= 0) return;
    // Timeout cap.
    if (this.time.now >= this.#invulnUntil) {
      this.#stopInvulnBlink();
      return;
    }
    // Movement cancel — real directional input this frame.
    if (
      this.#controls?.isLeftDown ||
      this.#controls?.isRightDown ||
      this.#controls?.isUpDown ||
      this.#controls?.isDownDown
    ) {
      this.#stopInvulnBlink();
    }
  }

  /**
   * WaterSpike + EarthWall: the wall stops the spike. On the first overlap
   * between a spike and any pillar, we:
   *   - spawn an impact splash (blue water pixels + brown debris) at the
   *     contact point;
   *   - drop a small mud puddle there (water+earth = mud);
   *   - damage the pillar (1 HP — minor, the spike isn't a wallbreaker);
   *   - force the spike into its FADE phase early so it visually dies.
   *
   * Tracked per-spike via setData('earthBlocked', true) so the splash only
   * fires once even though overlap can persist across multiple frames during
   * the fade animation. Works in all three timing cases (spike-onto-wall,
   * wall-onto-spike, spike-travels-into-wall) because it's a pure per-frame
   * overlap check — whichever object spawned, the next frame detects it.
   */
  /**
   * WindBolt + EarthWall pillar: the wall blocks the slash. On the first
   * overlap, spawn a small dust/debris splash at the contact point, deal
   * minor (1 HP) structural damage to the pillar, and force the bolt into
   * its impact animation (which auto-destroys). Pure analog of the
   * WaterSpike+EarthWall combo — multiplayer-deterministic by virtue of
   * iterating the merged [local, remote] spell list and the explode/takeDamage
   * methods already syncing through their existing pipelines.
   */
  #updateWindBoltEarthWallCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const pillars = this.#earthWallGroup.getChildren() as EarthWallPillar[];
    if (pillars.length === 0) return;
    const spellChildren = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const bolts = spellChildren.filter(
      (s): s is WindBolt =>
        s instanceof WindBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (bolts.length === 0) return;

    for (const bolt of bolts) {
      for (const pillar of pillars) {
        if (!pillar.active || pillar.isBeingDestroyed) continue;
        if (!this.physics.overlap(bolt, pillar)) continue;

        const pBody = pillar.body as Phaser.Physics.Arcade.Body | null;
        const ix = pBody ? pBody.center.x : pillar.x;
        const iy = pBody ? pBody.center.y : pillar.y;

        spawnEarthBlockSplash(this, ix, iy);
        pillar.takeDamage(1);
        bolt.explode();
        break;
      }
    }
  }

  /**
   * WindBolt + FireArea (Flame Slash): when a WindBolt passes through any
   * FireArea, ignite it once — it keeps flying at normal speed but tints
   * orange and deals bonus damage on hit (FLAME_SLASH_DAMAGE_MULT). Mirrors
   * #updateEarthBoltFireAreaCombo (mark-once boost). Deterministic across
   * clients: same overlap detected on every peer because the bolt and
   * fire area both appear in the merged [local, remote] spell list, so
   * every client tints and computes bonus damage identically.
   */
  #updateWindBoltFireAreaCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const spellChildren = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const bolts = spellChildren.filter(
      (s): s is WindBolt =>
        s instanceof WindBolt &&
        s.active &&
        !s.isFlameSlash &&
        !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (bolts.length === 0) return;
    const fireAreas = spellChildren.filter(
      (s): s is FireArea =>
        s instanceof FireArea && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (fireAreas.length === 0) return;

    for (const bolt of bolts) {
      for (const fireArea of fireAreas) {
        if (this.physics.overlap(bolt, fireArea)) {
          bolt.igniteToFlame();
          break;
        }
      }
    }
  }

  /**
   * WindBolt + FireBolt (split): the slash cuts the fireball in half. Both
   * projectiles are consumed; two smaller FireBolts spawn at the midpoint,
   * angled ± WIND_FIRE_SPLIT_ANGLE_RAD off the original fireball's heading.
   * The children inherit the fireball's velocity direction (rotated by the
   * split angle), get scaled down visually, and a setData('damageMult') flag
   * is honored by the damage dispatch via the existing baseDamage reads in
   * the cross-player overlap path (defensive: also dim via scale alone is
   * acceptable since FIRE_BOLT_DAMAGE is small; we keep damage handling
   * simple by scaling the child's #damage through setScale + a post-set).
   *
   * Multiplayer: each client iterates the merged [local, remote] spell list
   * → same overlap → identical children spawned at identical positions and
   * angles. The new children participate in the normal damage pipeline.
   */
  #updateWindBoltFireBoltSplitCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const localGroup = this.#player.spellCastingComponent.spellGroup;
    const spellChildren = [
      ...localGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const winds = spellChildren.filter(
      (s): s is WindBolt =>
        s instanceof WindBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (winds.length === 0) return;
    const fires = spellChildren.filter(
      (s): s is FireBolt =>
        s instanceof FireBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (fires.length === 0) return;

    for (const wind of winds) {
      for (const fire of fires) {
        if (!fire.active || !wind.active) continue;
        if (!this.physics.overlap(wind, fire)) continue;

        const midX = (wind.x + fire.x) / 2;
        const midY = (wind.y + fire.y) / 2;

        // Children inherit the FireBolt's heading (not the WindBolt's) — the
        // fireball is what's being cut, so its forward axis defines the split.
        const fireBody = fire.body as Phaser.Physics.Arcade.Body;
        const heading = Math.atan2(fireBody.velocity.y, fireBody.velocity.x);

        const spawnChild = (angleOffset: number): void => {
          const a = heading + angleOffset;
          const sx = midX + Math.cos(a) * WIND_FIRE_SPLIT_FORWARD_OFFSET_PX;
          const sy = midY + Math.sin(a) * WIND_FIRE_SPLIT_FORWARD_OFFSET_PX;
          // Aim target one tile out along the angle so the child's constructor
          // velocity points the right way (FireBolt computes velocity from
          // angle-to-target).
          const tx = sx + Math.cos(a) * 32;
          const ty = sy + Math.sin(a) * 32;
          const child = new FireBolt(this, sx, sy, tx, ty);
          child.setScale(WIND_FIRE_SPLIT_CHILD_SCALE);
          // Carry reduced damage via a setData flag the damage path can read,
          // but the simplest reliable hook is the existing baseDamage getter
          // — we just monkey-patch the readonly via Object.defineProperty so
          // every existing hit handler that reads child.baseDamage sees the
          // reduced value. Kept local to this combo to avoid bloating FireBolt.
          const reduced = Math.max(1, Math.round(child.baseDamage * WIND_FIRE_SPLIT_CHILD_DAMAGE_MULT));
          Object.defineProperty(child, 'baseDamage', {
            get: () => reduced,
            configurable: true,
          });
          localGroup.add(child);
        };

        spawnChild(+WIND_FIRE_SPLIT_ANGLE_RAD);
        spawnChild(-WIND_FIRE_SPLIT_ANGLE_RAD);

        // Consume both originals.
        fire.explode();
        wind.explode();
        break; // wind is gone — move to next wind bolt
      }
    }
  }

  /**
   * WindBolt + WaterTornado: the bolt is absorbed; the tornado releases a
   * forward cone of water in the bolt's travel direction (spawns a cluster of
   * small water puddles inside a cone ±WIND_TORNADO_CONE_HALF_ANGLE_RAD).
   * The tornado ends immediately (forceEnd) and the bolt explodes.
   *
   * Multiplayer: deterministic puddle positions via a seed derived from the
   * bolt's spawn position so all clients lay the same cone.
   */
  #updateWindBoltWaterTornadoCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const spellChildren = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const winds = spellChildren.filter(
      (s): s is WindBolt =>
        s instanceof WindBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (winds.length === 0) return;
    const tornadoes = spellChildren.filter(
      (s): s is WaterTornado =>
        s instanceof WaterTornado && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (tornadoes.length === 0) return;

    for (const wind of winds) {
      for (const tornado of tornadoes) {
        if (!this.physics.overlap(wind, tornado)) continue;

        const heading = wind.rotation; // WindBolt's rotation tracks its velocity (set in ctor)
        // Lay puddles inside a cone ahead of the bolt's impact point.
        const seed = (((wind.x | 0) * 73856093) ^ ((wind.y | 0) * 19349663)) >>> 0;
        // LCG so each client computes the same offsets per puddle.
        let s = seed || 1;
        const rand = (): number => {
          s = (s * 1664525 + 1013904223) >>> 0;
          return s / 0xffffffff;
        };
        // Anchor the cone at the bolt's actual hit position — the tornado
        // sprite is offset 48px UP from its ground point (see WaterTornado
        // ctor), which would otherwise make every cone read as "up + forward"
        // regardless of the bolt's heading.
        const originX = wind.x;
        const originY = wind.y;
        for (let i = 0; i < WIND_TORNADO_CONE_PUDDLE_COUNT; i++) {
          const distFrac = 0.3 + rand() * 0.7; // skewed away from the origin
          const dist = WIND_TORNADO_CONE_RANGE_PX * distFrac;
          const angle = heading + (rand() * 2 - 1) * WIND_TORNADO_CONE_HALF_ANGLE_RAD;
          const px = originX + Math.cos(angle) * dist;
          const py = originY + Math.sin(angle) * dist;
          new Puddle(this, px, py, WIND_TORNADO_CONE_PUDDLE_AMOUNT, undefined, 'water');
        }

        // The tornado is NOT consumed — the bolt only "feeds" it, releasing
        // a forward cone of water/puddles in the bolt's heading. The funnel
        // keeps grinding normally.
        wind.explode();
        break;
      }
    }
  }

  /**
   * WindBolt + Puddle: the slash pushes puddles in its travel direction.
   * Water moves the most, mud less, lava barely at all. One-shot per
   * (bolt, puddle) — tracked via setData on the bolt. The bolt passes
   * through (no explode); air over water is a glance, not an impact.
   *
   * Multiplayer: deterministic — every client sees the same bolt-puddle
   * overlap at the same position and applies the same displacement.
   */
  #updateWindBoltPuddlePushCombo(): void {
    if (Puddle.all.size === 0) return;
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const spellChildren = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const winds = spellChildren.filter(
      (s): s is WindBolt =>
        s instanceof WindBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (winds.length === 0) return;

    for (const wind of winds) {
      let pushedSet = wind.getData('puddlePushed') as Set<Puddle> | undefined;
      if (!pushedSet) {
        pushedSet = new Set<Puddle>();
        wind.setData('puddlePushed', pushedSet);
      }
      const angle = wind.rotation;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);

      for (const puddle of Puddle.all) {
        if (!puddle.active) continue;
        if (pushedSet.has(puddle)) continue;
        if (!this.physics.overlap(wind, puddle)) continue;

        const pushPx =
          puddle.kind === 'water' ? WIND_PUDDLE_PUSH_PX_WATER :
          puddle.kind === 'mud' ? WIND_PUDDLE_PUSH_PX_MUD :
          WIND_PUDDLE_PUSH_PX_LAVA;
        const pushMs =
          puddle.kind === 'water' ? WIND_PUDDLE_PUSH_DURATION_MS_WATER :
          puddle.kind === 'mud' ? WIND_PUDDLE_PUSH_DURATION_MS_MUD :
          WIND_PUDDLE_PUSH_DURATION_MS_LAVA;
        puddle.nudgeBy(dirX * pushPx, dirY * pushPx, pushMs);
        pushedSet.add(puddle);
      }
    }
  }

  #updateWaterSpikeEarthWallCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const pillars = this.#earthWallGroup.getChildren() as EarthWallPillar[];
    if (pillars.length === 0) return;
    const spellChildren = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const spikes = spellChildren.filter(
      (s): s is WaterSpike => s instanceof WaterSpike && s.active && !s.getData('earthBlocked'),
    );
    if (spikes.length === 0) return;

    for (const spike of spikes) {
      for (const pillar of pillars) {
        if (!pillar.active || pillar.isBeingDestroyed) continue;
        if (!this.physics.overlap(spike, pillar)) continue;

        spike.setData('earthBlocked', true);
        const pBody = pillar.body as Phaser.Physics.Arcade.Body | null;
        const ix = pBody ? pBody.center.x : pillar.x;
        const iy = pBody ? pBody.center.y : pillar.y;

        // Splash: blue water pixels + brown debris that fly out radially and
        // fade. Quick (350 ms) so it doesn't linger after the spike is gone.
        spawnEarthBlockSplash(this, ix, iy);

        // Mud puddle at the impact point — water-on-stone mixes. Tunables in
        // water.ts (SPIKE_WALL_BLOCK_MUD_*). Deterministic seed (multiplayer).
        const spikeMudSeed = (((ix | 0) * 73856093) ^ ((iy | 0) * 19349663)) >>> 0;
        Puddle.spawnCluster(
          this,
          ix,
          iy + 2,
          CONFIG.SPIKE_WALL_BLOCK_MUD_COUNT,
          CONFIG.SPIKE_WALL_BLOCK_MUD_SPREAD,
          CONFIG.SPIKE_WALL_BLOCK_MUD_AMOUNT_EACH,
          undefined,
          0,
          'mud',
          spikeMudSeed,
        );

        // Minor pillar damage — spike is fast and small, shouldn't break walls.
        pillar.takeDamage(1);

        // Force the spike to fade out (the wall stopped it).
        spike.triggerEarthBlock();
        break; // one pillar's block is enough; spike is fading anyway
      }
    }
  }

  /**
   * WaterTornado + EarthWall: the tornado GRINDS against the wall instead of
   * being instantly stopped. The pillar takes gradual erosion damage; if the
   * tornado lasts long enough, the wall breaks. While grinding:
   *   - Erosion damage: 1 HP per pillar every 500 ms (so the 5-HP pillar breaks
   *     after ~2.5 s of sustained contact — user-specified default).
   *   - Splash/debris particles: cyan + brown specks at the contact zone,
   *     spawned every 180 ms while overlapping. Visual feedback that the
   *     grinding is happening.
   *   - Mud puddle drip: every 600 ms, a tiny mud cluster spawned at the
   *     contact. Adjacent water puddles within MERGE_RADIUS get "muddified"
   *     automatically by Puddle.spawnOrMerge's mud-wins rule (step 1), so the
   *     ground around the contact slowly converts from clean water to mud.
   *
   * No mask is applied to the tornado — natural depth ordering (pillar's
   * Y-based depth covers the contact zone) already hides the overlapping
   * funnel section. The splash particles + visible pillar do the rest of the
   * "grinding" feedback.
   */
  #updateWaterTornadoEarthWallCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const pillars = this.#earthWallGroup.getChildren() as EarthWallPillar[];
    if (pillars.length === 0) return;
    const spellChildren = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const tornadoes = spellChildren.filter(
      (s): s is WaterTornado =>
        s instanceof WaterTornado && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (tornadoes.length === 0) return;

    const now = this.time.now;
    const EROSION_INTERVAL_MS = 500; // 1 HP per pillar per 500ms (≈2.5s to break a 5-HP pillar)
    const SPLASH_INTERVAL_MS = 180;  // visual particle cadence at the contact
    const MUD_INTERVAL_MS = 600;     // periodic mud-drip cadence at the contact

    for (const tornado of tornadoes) {
      let perPillarState = this.#tornadoGrindState.get(tornado);
      if (!perPillarState) {
        perPillarState = new Map();
        this.#tornadoGrindState.set(tornado, perPillarState);
      }

      for (const pillar of pillars) {
        if (!pillar.active || pillar.isBeingDestroyed) continue;
        if (!this.physics.overlap(tornado, pillar)) continue;

        let state = perPillarState.get(pillar);
        if (!state) {
          state = { lastErosion: 0, lastSplash: 0, lastMud: 0 };
          perPillarState.set(pillar, state);
        }

        const pBody = pillar.body as Phaser.Physics.Arcade.Body | null;
        const ix = pBody ? pBody.center.x : pillar.x;
        const iy = pBody ? pBody.center.y : pillar.y;

        if (now - state.lastErosion >= EROSION_INTERVAL_MS) {
          pillar.takeDamage(1);
          state.lastErosion = now;
        }

        if (now - state.lastSplash >= SPLASH_INTERVAL_MS) {
          spawnEarthBlockSplash(this, ix, iy);
          state.lastSplash = now;
        }

        if (now - state.lastMud >= MUD_INTERVAL_MS) {
          // Tiny cluster so we don't flood the ground — repeated ticks add
          // up over the ~2.5s grind to a believable mud patch. Adjacent water
          // puddles within MERGE_RADIUS get auto-muddied via the mud-wins
          // merge rule. Tunables live in water.ts (TORNADO_GRIND_MUD_*).
          //
          // Multiplayer determinism: seed by the per-tick mud-index so every
          // client computes the same cluster positions for the same grind
          // event. Without this each client called Math.random()
          // independently → mud patches diverged visibly between browsers.
          const mudTickIndex = Math.floor(now / MUD_INTERVAL_MS);
          const mudSeed = (((ix | 0) * 73856093) ^ ((iy | 0) * 19349663) ^ (mudTickIndex * 83492791)) >>> 0;
          Puddle.spawnCluster(
            this,
            ix,
            iy + 4,
            CONFIG.TORNADO_GRIND_MUD_COUNT,
            CONFIG.TORNADO_GRIND_MUD_SPREAD,
            CONFIG.TORNADO_GRIND_MUD_AMOUNT_EACH,
            undefined,
            0,
            'mud',
            mudSeed,
          );
          state.lastMud = now;
        }
      }
    }
  }

  /**
   * Per-frame WaterTornado / water-puddle vs lava-puddle interaction:
   *   - A tornado overlapping a lava puddle slowly fills the lava's
   *     extinguish meter (LAVA_TORNADO_EXTINGUISH_MS to fully extinguish).
   *     Multiple overlapping tornadoes stack (proportional speed-up).
   *   - A water puddle overlapping a lava puddle is "boiled away" — destroyed
   *     this frame, contributing LAVA_WATER_PUDDLE_EXTINGUISH_AMOUNT to the
   *     lava's meter and spawning a small steam burst.
   *   - While any tornado is extinguishing a lava puddle, periodic steam
   *     puffs (LAVA_STEAM_BURSTS_PER_TICK every LAVA_STEAM_BURST_INTERVAL_MS)
   *     spawn at random offsets within the lava puddle.
   *
   * Iteration is over local snapshots so addLavaExtinguish destroying the
   * puddle mid-loop doesn't invalidate Puddle.all.
   */
  #updateLavaWaterExtinguishCombo(delta: number): void {
    if (Puddle.all.size === 0) return;
    const lavas: Puddle[] = [];
    const waters: Puddle[] = [];
    for (const p of Puddle.all) {
      if (!p.active) continue;
      if (p.kind === 'lava') lavas.push(p);
      else if (p.kind === 'water') waters.push(p);
    }
    if (lavas.length === 0) return;

    const localGroup = this.#player?.spellCastingComponent?.spellGroup;
    const all = [
      ...(localGroup?.getChildren() ?? []),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const tornadoes = all.filter(
      (s): s is WaterTornado =>
        s instanceof WaterTornado && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );

    const now = this.time.now;
    const spawnSteam = (x: number, y: number): void => {
      const steam = new SteamBurst(this, x, y);
      // Add to the local player's spellGroup so it participates in normal
      // overlap dispatch (same pattern as the FireBolt+Water steam combo).
      // Falls back to plain scene-owned if no local player (shouldn't happen
      // in practice, but guard against the early-init window).
      if (localGroup) localGroup.add(steam);
    };
    const spawnSteamAroundLava = (lava: Puddle, count: number): void => {
      for (let i = 0; i < count; i++) {
        // sqrt(random) for area-uniform offset within the lava's visual disc.
        const dist =
          Math.sqrt(Math.random()) * lava.radius * CONFIG.LAVA_STEAM_SPAWN_RADIUS_FRAC;
        const angle = Math.random() * Math.PI * 2;
        spawnSteam(lava.x + Math.cos(angle) * dist, lava.y + Math.sin(angle) * dist);
      }
    };

    // 1. Tornado-vs-lava: accumulate extinguish progress + emit steam on tick.
    for (const lava of lavas) {
      if (!lava.active) continue;
      let extinguishedThisFrame = false;
      let isBeingHit = false;
      for (const tornado of tornadoes) {
        if (!this.physics.overlap(lava, tornado)) continue;
        isBeingHit = true;
        const progress = delta / Math.max(1, CONFIG.LAVA_TORNADO_EXTINGUISH_MS);
        if (lava.addLavaExtinguish(progress)) {
          extinguishedThisFrame = true;
          break;
        }
      }
      if (isBeingHit && !extinguishedThisFrame) {
        if (lava.consumeLavaSteamTick(now, CONFIG.LAVA_STEAM_BURST_INTERVAL_MS)) {
          spawnSteamAroundLava(lava, CONFIG.LAVA_STEAM_BURSTS_PER_TICK);
        }
      } else if (extinguishedThisFrame) {
        // One final puff so the death reads as "boiled off" instead of pop-out.
        spawnSteamAroundLava(lava, CONFIG.LAVA_STEAM_BURSTS_PER_TICK);
      }
    }

    // 2. Water puddle-vs-lava: water puddle is consumed (destroyed) and
    //    contributes a chunk of extinguish progress + one steam burst.
    //    Iterate the local water snapshot — destroying a water puddle is
    //    safe because we hold the array, not the Set.
    for (const water of waters) {
      if (!water.active) continue;
      for (const lava of lavas) {
        if (!lava.active) continue;
        if (!this.physics.overlap(water, lava)) continue;
        // Steam at the water puddle's position — that's where the boil-off
        // is actually happening, and reads better than centering on the
        // lava when the water is at the lava's edge.
        for (let i = 0; i < CONFIG.LAVA_WATER_PUDDLE_STEAM_COUNT; i++) {
          const dist = Math.sqrt(Math.random()) * water.radius;
          const angle = Math.random() * Math.PI * 2;
          spawnSteam(water.x + Math.cos(angle) * dist, water.y + Math.sin(angle) * dist);
        }
        lava.addLavaExtinguish(CONFIG.LAVA_WATER_PUDDLE_EXTINGUISH_AMOUNT);
        water.destroy();
        break; // water puddle is gone — stop checking it against other lavas
      }
    }
  }

  /**
   * FireArea sitting on a water/mud puddle slowly evaporates it. Water dries
   * fast; mud is denser/dirtier so it takes ~3× as long. Lava puddles are
   * skipped (fire isn't hot enough to dry lava). Multiple FireAreas overlapping
   * a single puddle stack additively. Steam puffs reuse the SteamBurst sprite.
   *
   * Iteration is over local snapshots so addFireEvaporate destroying the
   * puddle mid-loop doesn't invalidate Puddle.all.
   */
  #updateFireAreaPuddleEvaporateCombo(delta: number): void {
    if (Puddle.all.size === 0) return;
    const evapPuddles: Puddle[] = [];
    for (const p of Puddle.all) {
      if (p.active && (p.kind === 'water' || p.kind === 'mud')) evapPuddles.push(p);
    }
    if (evapPuddles.length === 0) return;

    const localGroup = this.#player?.spellCastingComponent?.spellGroup;
    const all = [
      ...(localGroup?.getChildren() ?? []),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const areas = all.filter(
      (s): s is FireArea =>
        s instanceof FireArea && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (areas.length === 0) return;

    const now = this.time.now;
    const spawnSteamAt = (x: number, y: number): void => {
      const steam = new SteamBurst(this, x, y);
      if (localGroup) localGroup.add(steam);
    };
    const spawnSteamAround = (puddle: Puddle, count: number): void => {
      for (let i = 0; i < count; i++) {
        const dist =
          Math.sqrt(Math.random()) * puddle.radius * CONFIG.FIRE_AREA_STEAM_SPAWN_RADIUS_FRAC;
        const angle = Math.random() * Math.PI * 2;
        spawnSteamAt(
          puddle.x + Math.cos(angle) * dist,
          puddle.y + Math.sin(angle) * dist,
        );
      }
    };

    for (const puddle of evapPuddles) {
      if (!puddle.active) continue;
      const fullMs = puddle.kind === 'water'
        ? CONFIG.FIRE_AREA_WATER_EVAPORATE_MS
        : CONFIG.FIRE_AREA_MUD_EVAPORATE_MS;
      let isBeingEvaporated = false;
      let evaporatedThisFrame = false;
      for (const area of areas) {
        if (!this.physics.overlap(puddle, area)) continue;
        isBeingEvaporated = true;
        const progress = delta / Math.max(1, fullMs);
        if (puddle.addFireEvaporate(progress)) {
          evaporatedThisFrame = true;
          break;
        }
      }
      if (isBeingEvaporated && !evaporatedThisFrame) {
        if (puddle.consumeFireSteamTick(now, CONFIG.FIRE_AREA_STEAM_BURST_INTERVAL_MS)) {
          spawnSteamAround(puddle, CONFIG.FIRE_AREA_STEAM_BURSTS_PER_TICK);
        }
      } else if (evaporatedThisFrame) {
        // One last puff so the puddle's death reads as "boiled off".
        spawnSteamAround(puddle, CONFIG.FIRE_AREA_STEAM_BURSTS_PER_TICK);
      }
    }
  }

  /**
   * Per-frame slow + damage detection for hazard puddles (mud + lava).
   * - Mud: only slows (no damage).
   * - Lava: slows AND ticks damage on a timer per (puddle, character) pair.
   *
   * Recomputed from scratch each frame — walking out of a puddle naturally
   * restores full speed without explicit exit callbacks. Affects local
   * player, remote players, and current-room enemies.
   *
   * Cost is bounded (puddle/character counts are small).
   */
  #updateMudPuddleSlow(): void {
    const muds: Puddle[] = [];
    const lavas: Puddle[] = [];
    for (const p of Puddle.all) {
      if (!p.active) continue;
      if (p.kind === 'mud') muds.push(p);
      else if (p.kind === 'lava') lavas.push(p);
    }

    const characters: CharacterGameObject[] = [];
    if (this.#player?.active) characters.push(this.#player);
    for (const rp of this.#remotePlayers.values()) {
      if (rp.active) characters.push(rp);
    }
    const enemies = this.#objectsByRoomId[this.#currentRoomId]?.enemyGroup?.getChildren() ?? [];
    for (const e of enemies) {
      const c = e as CharacterGameObject;
      if (c.active) characters.push(c);
    }

    const now = this.time.now;
    for (const c of characters) {
      // Airborne characters (Player.dashSuper) OR Star-Shielded players skip
      // ground hazards entirely — no slow from mud or lava, no lava tick
      // damage. The flag-check is duck-typed so non-Player characters fall
      // through (enemies don't get a shield).
      if (c.isFlying || (c as unknown as { isStarShieldActive?: boolean }).isStarShieldActive) {
        c.setMovementMultiplier(1);
        continue;
      }
      let mult = 1;
      // Mud slow.
      for (const m of muds) {
        if (this.physics.overlap(c, m)) {
          const slow = CONFIG.MUD_PUDDLE_SLOW_MULTIPLIER;
          if (slow < mult) mult = slow;
        }
      }
      // Lava slow + damage. Same multiplier as mud per design; damage on tick.
      for (const lava of lavas) {
        if (!this.physics.overlap(c, lava)) continue;
        const slow = CONFIG.LAVA_PUDDLE_SLOW_MULTIPLIER;
        if (slow < mult) mult = slow;
        if (c.isDefeated) continue;
        let lavaTimestamps = this.#lavaDamageState.get(lava);
        if (!lavaTimestamps) {
          lavaTimestamps = new WeakMap();
          this.#lavaDamageState.set(lava, lavaTimestamps);
        }
        const last = lavaTimestamps.get(c) ?? 0;
        if (now - last >= CONFIG.LAVA_PUDDLE_TICK_INTERVAL_MS) {
          c.hit('DOWN', CONFIG.LAVA_PUDDLE_DAMAGE_PER_TICK);
          lavaTimestamps.set(c, now);
        }
      }
      c.setMovementMultiplier(mult);
    }
  }

  /** Draws / refreshes the faded reach circle around the player each frame. */
  #updateRangeRing(): void {
    if (!RUNTIME_CONFIG.SHOW_PLAYER_ATTACK_RANGE) {
      this.#rangeRing?.setVisible(false);
      return;
    }
    if (!this.#player?.active) return;
    if (!this.#rangeRing || !this.#rangeRing.scene) {
      // Re-create if the previous Graphics was destroyed by a scene shutdown — the
      // class field is reset on a fresh scene instance, but be defensive in case the
      // reference somehow survives but its scene has gone away.
      this.#rangeRing = this.add.graphics();
      // Foreground tiles render at depth 2 (see #createLevel). Depth=1 (the original)
      // put the ring under the dungeon foreground so it disappeared the moment you
      // entered any room whose foreground covered the floor. 1000 sits above all
      // world content but well below UI overlays (9999+).
      this.#rangeRing.setDepth(1000);
      this.#rangeRing.setScrollFactor(1);
    }
    this.#rangeRing.clear();
    this.#rangeRing.lineStyle(
      1,
      RUNTIME_CONFIG.PLAYER_ATTACK_RANGE_RING_COLOR,
      RUNTIME_CONFIG.PLAYER_ATTACK_RANGE_RING_ALPHA,
    );
    this.#rangeRing.strokeCircle(this.#player.x, this.#player.y, RUNTIME_CONFIG.PLAYER_ATTACK_RANGE_PX);
    this.#rangeRing.setVisible(true);
  }

  /** FireBolt + ThunderStrike combo — when the bolt touches an active strike, both
   *  are consumed and a LightningBurstCombo VFX is spawned (large-violet variant). */
  #updateFireBoltThunderCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const all = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const fireBolts = all.filter(
      (s): s is FireBolt => s instanceof FireBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    const strikes = all.filter(
      (s): s is ThunderStrike => s instanceof ThunderStrike && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (fireBolts.length === 0 || strikes.length === 0) return;
    for (const bolt of fireBolts) {
      for (const strike of strikes) {
        if (!this.physics.overlap(bolt, strike)) continue;
        const x = (bolt.x + strike.x) / 2;
        const y = (bolt.y + strike.y) / 2;
        bolt.explode();
        strike.destroy();
        const burst = new LightningBurstCombo(this, x, y);
        this.#player.spellCastingComponent.spellGroup.add(burst);
        break;
      }
    }
  }

  /** VoidOrb orb combos — everything that interacts with an active darkness orb.
   *  Runs every frame so pull forces are continuous; one-shot consumption combos use
   *  setData flags to fire exactly once per orb-victim pair. */
  #updateVoidOrbCombos(delta: number): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const all = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const orbs = all.filter(
      (s): s is VoidOrb => s instanceof VoidOrb && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (orbs.length === 0) return;

    const dt = delta / 1000;
    const PLAYER_PULL_R = CONFIG.VOID_ORB_PLAYER_PULL_RADIUS;
    const PLAYER_PULL_SPD = CONFIG.VOID_ORB_PLAYER_PULL_SPEED;
    const PLAYER_PULL_EXP = CONFIG.VOID_ORB_PLAYER_PULL_FALLOFF_EXP;
    // The tornado pull (section 2) was historically tuned against the same
    // PULL_RADIUS / PULL_SPEED as the player pull — kept here as local
    // tornado-only consts so the player knobs can move to config without
    // changing tornado feel. Tornado section also applies its own 1.5×
    // multiplier on top of TORNADO_PULL_SPD.
    const TORNADO_PULL_R = 110;
    const TORNADO_PULL_SPD = 70;

    // -----------------------------------------------------------------------------------
    // 1. Pull on players (local + remote). Position-additive so collisions still apply
    //    via the regular physics step (Arcade syncs body to sprite on preUpdate).
    // -----------------------------------------------------------------------------------
    const playerTargets: Phaser.GameObjects.Sprite[] = [];
    if (this.#player?.active) playerTargets.push(this.#player);
    for (const p of this.#remotePlayers.values()) if (p.active) playerTargets.push(p);

    for (const orb of orbs) {
      for (const target of playerTargets) {
        // Star Shield: immune to void-orb pull (works for both local and
        // remote shielded players — the flag exists on every Player).
        if ((target as Player).isStarShieldActive) continue;
        const dx = orb.x - target.x;
        const dy = orb.y - target.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 1 || distSq > PLAYER_PULL_R * PLAYER_PULL_R) continue;
        const dist = Math.sqrt(distSq);
        const closeness = Math.pow(1 - dist / PLAYER_PULL_R, PLAYER_PULL_EXP);
        const move = PLAYER_PULL_SPD * closeness * dt;
        target.x += (dx / dist) * move;
        target.y += (dy / dist) * move;
      }
    }

    // -----------------------------------------------------------------------------------
    // 2. WaterTornado pull + grow + purple tint + PORTAL HOLE (combo lasts orb lifetime).
    //
    // Visual goal: the funnel renders mostly in front of the orb (its outer ring is
    // covered), but the orb's bright core punches a HOLE through the funnel so the
    // tornado looks like it's being sucked into the vortex. Implemented by attaching
    // a BitmapMask (with invertAlpha) on the tornado, sourced from a hidden Graphics
    // disc that follows the orb's center.
    // -----------------------------------------------------------------------------------
    // Small lift so the funnel's lower core overlaps the orb's center where the
    // mask hole will appear. Raise to float the funnel higher above the orb;
    // lower toward 0 to bury more of the funnel into the portal.
    const DARK_COMBO_TORNADO_LIFT = 12;
    const tornadoes = all.filter(
      (s): s is WaterTornado => s instanceof WaterTornado && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    for (const orb of orbs) {
      const orbBody = orb.body as Phaser.Physics.Arcade.Body;
      // Track which tornado (if any) this orb is feeding the portal mask on this
      // frame so we can clear it when overlap stops.
      let maskAppliedToTornado: WaterTornado | undefined;
      for (const tornado of tornadoes) {
        const tBody = tornado.body as Phaser.Physics.Arcade.Body;
        // Pull on BODY centers, not sprite positions — the tornado's body sits ~35px
        // below its sprite origin (128x128 frame with the body near the bottom), so
        // pulling sprite-to-sprite left the hitboxes badly misaligned. Translate the
        // orb's body-center target back into the equivalent tornado sprite position,
        // then lift it slightly so the funnel's core lines up with the orb's core.
        const spriteToBodyX = tBody.center.x - tornado.x;
        const spriteToBodyY = tBody.center.y - tornado.y;
        const targetSpriteX = orbBody.center.x - spriteToBodyX;
        const targetSpriteY = orbBody.center.y - spriteToBodyY - DARK_COMBO_TORNADO_LIFT;
        const dx = targetSpriteX - tornado.x;
        const dy = targetSpriteY - tornado.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > TORNADO_PULL_R * TORNADO_PULL_R) continue;
        const dist = Math.sqrt(distSq) || 1;
        const closeness = 1 - dist / TORNADO_PULL_R;

        // Pull a bit harder than a player so the tornado visibly migrates onto the orb.
        // Clamp the per-frame move to the remaining distance so we settle exactly on
        // the target instead of jittering past it once the bodies overlap.
        const move = Math.min(dist, TORNADO_PULL_SPD * 1.5 * closeness * dt);
        tornado.x += (dx / dist) * move;
        tornado.y += (dy / dist) * move;

        // Grow & tint progression — ramp scale/tint over ~1.5s of sustained overlap so
        // a tornado that just grazes the edge doesn't snap to purple. Tracked per-tornado.
        const t = ((tornado.getData('darkComboT') as number | undefined) ?? 0) + dt;
        tornado.setData('darkComboT', t);
        const k = Math.min(1, t / 1.5);
        tornado.setScale(1 + 0.35 * k);
        // Lerp tint white(0xffffff) → soft violet(0xc8a8ff). Phaser's setTint multiplies,
        // so a brightish purple keeps the tornado's whites readable.
        const lerp = (a: number, b: number): number => Math.round(a + (b - a) * k);
        const r = lerp(0xff, 0xc8);
        const g = lerp(0xff, 0xa8);
        const b = lerp(0xff, 0xff);
        tornado.setTint((r << 16) | (g << 8) | b);

        // Punch a SOFT portal hole through the funnel where the orb's core sits.
        // The mask source is a hidden radial-gradient Image on the orb; we
        // reposition it every frame so it tracks any orb wobble. The Image's
        // alpha ramps from solid center → fully transparent rim, so the tornado
        // FADES into the portal instead of being cookie-cut by a hard circle.
        // applyVoidPortalMask is idempotent on the same tornado so calling it
        // each overlap frame is cheap.
        // Hole radius (px) — smaller than the orb so the orb's outer ring still
        // renders BEHIND the tornado. Bump if you want the hole to swallow more
        // of the funnel.
        const HOLE_RADIUS = 22;
        const maskSource = orb.getPortalMaskSource(HOLE_RADIUS);
        orb.updatePortalMaskPosition();
        tornado.applyVoidPortalMask(orb, maskSource);
        // Spiraling cyan "shredded water" fragments around the portal rim,
        // rendering ABOVE the funnel so they read as water being torn off and
        // dragged into the core. Idempotent across frames; just keeps the
        // fragment depth in sync with the funnel as it migrates.
        orb.startVoidAbsorptionFX(HOLE_RADIUS, tornado.depth);
        maskAppliedToTornado = tornado;
      }
      // If this orb's mask is on a tornado that we no longer overlap (e.g. the
      // tornado drifted out of range, or this frame found no overlap at all),
      // strip the mask so we don't leave the funnel with a phantom hole.
      const previouslyMasked = orb.getData('darkComboMaskedTornado') as WaterTornado | undefined;
      if (previouslyMasked && previouslyMasked !== maskAppliedToTornado && previouslyMasked.active) {
        previouslyMasked.clearVoidPortalMask();
      }
      orb.setData('darkComboMaskedTornado', maskAppliedToTornado);

      // -----------------------------------------------------------------
      // 2b. WaterSpike absorption — same portal-mask pattern as tornado,
      // but without the pull/grow/tint (the spike is a quick attack; we
      // only want the part overlapping the portal to fade in). Reuse the
      // orb's existing soft mask source + absorption FX so the combo
      // visually matches the tornado one.
      //
      // Note: we DON'T filter by `body.enable` here — the spike disables
      // its body the moment it enters the FADE phase, so a body filter
      // would drop the spike mid-absorption and strip the mask, making
      // the unmasked fade frames suddenly pop in. Instead we accept any
      // active spike and check overlap via display bounds (works whether
      // the body is enabled or not).
      // -----------------------------------------------------------------
      const waterSpikes = all.filter(
        (s): s is WaterSpike => s instanceof WaterSpike && s.active,
      );
      let maskAppliedToSpike: WaterSpike | undefined;
      for (const spike of waterSpikes) {
        // Body-tolerant overlap: use the spike's display bounds (which
        // stay valid even after body.enable=false during fade) against
        // the orb's body center. The orb's body remains enabled for its
        // entire lifetime, so this is a reliable anchor point.
        const orbBody = orb.body as Phaser.Physics.Arcade.Body | null;
        if (!orbBody) continue;
        const bounds = spike.getBounds();
        if (!bounds.contains(orbBody.center.x, orbBody.center.y)) continue;

        const HOLE_RADIUS = 22;
        const maskSource = orb.getPortalMaskSource(HOLE_RADIUS);
        orb.updatePortalMaskPosition();
        spike.applyVoidPortalMask(orb, maskSource);
        // Above-spike fragments: the spike's depth is its base Y, so the
        // fragments will sit above the spike's footprint at the rim.
        orb.startVoidAbsorptionFX(HOLE_RADIUS, spike.depth);
        maskAppliedToSpike = spike;
        break; // one spike absorption at a time is enough
      }
      // Mask clear-on-overlap-end: only strip the mask if the previously
      // masked spike has actually left the orb's vicinity. If the spike
      // was masked and is now in its fade phase (still nearby — bounds
      // test above just returned false because the spike moved or the
      // orb did), the mask STAYS so the fade frames don't pop. The mask
      // will be cleared by the spike's own destroy() when its fade
      // animation finishes, or by the orb's destroy if it dies first.
      const previousSpike = orb.getData('darkComboMaskedSpike') as WaterSpike | undefined;
      if (previousSpike && previousSpike !== maskAppliedToSpike && previousSpike.active) {
        // Only force-clear if the spike has genuinely moved out of range
        // (sanity: orb still alive, spike still alive, but no overlap
        // anywhere near). We use a generous radius so jitter doesn't
        // toggle the mask off mid-effect.
        const orbBody2 = orb.body as Phaser.Physics.Arcade.Body | null;
        const bounds = previousSpike.getBounds();
        const stillNearby = orbBody2
          ? bounds.contains(orbBody2.center.x, orbBody2.center.y)
          : false;
        if (!stillNearby) {
          previousSpike.clearVoidPortalMask();
        } else {
          // Still nearby — keep this spike as the "currently masked" target
          // so next frame's bookkeeping doesn't churn.
          maskAppliedToSpike = previousSpike;
        }
      }
      orb.setData('darkComboMaskedSpike', maskAppliedToSpike);

      // Only despawn the spiral fragments + infection overlay if NEITHER a
      // tornado NOR a spike is being absorbed this frame; otherwise the FX
      // owned by the orb stays running for whichever combo is still active.
      if (!maskAppliedToTornado && !maskAppliedToSpike) {
        orb.stopVoidAbsorptionFX();
      }
    }

    // -----------------------------------------------------------------------------------
    // 3. FireBolt vs orb: orb consumes the bolt. Plays the same single-play impact
    //    sprite that FireBolt uses when it enters a FireArea — pure feedback, no
    //    physics body, no damage. The bolt is destroyed via explode(); orb persists.
    // -----------------------------------------------------------------------------------
    const fireBolts = all.filter(
      (s): s is FireBolt => s instanceof FireBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    for (const bolt of fireBolts) {
      for (const orb of orbs) {
        if (!this.physics.overlap(bolt, orb)) continue;
        const impact = this.add.sprite(bolt.x, bolt.y, ASSET_KEYS.FIRE_BOLT_AREA_IMPACT);
        impact.setDepth(bolt.depth + 1);
        impact.setRotation(bolt.rotation);
        impact.play(ASSET_KEYS.FIRE_BOLT_AREA_IMPACT);
        impact.once(`animationcomplete-${ASSET_KEYS.FIRE_BOLT_AREA_IMPACT}`, () => impact.destroy());
        bolt.explode();
        break;
      }
    }

    // -----------------------------------------------------------------------------------
    // 4. FireArea vs orb: extinguish the fire. Orb persists. One-shot per area.
    // -----------------------------------------------------------------------------------
    const fireAreas = all.filter(
      (s): s is FireArea => s instanceof FireArea && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    for (const area of fireAreas) {
      if (area.getData('darkConsumed')) continue;
      for (const orb of orbs) {
        if (!this.physics.overlap(area, orb)) continue;
        area.setData('darkConsumed', true);
        // Play the full START → END sequence (no LOOP) so the player sees the fire
        // appear and immediately die — clear "you cast it, it got countered" feedback.
        area.extinguish();
        break;
      }
    }

    // -----------------------------------------------------------------------------------
    // 5. EarthBolt vs orb: consumed (the rock is swallowed). Orb persists.
    // -----------------------------------------------------------------------------------
    const earthBolts = all.filter(
      (s): s is EarthBolt => s instanceof EarthBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    for (const eb of earthBolts) {
      for (const orb of orbs) {
        if (!this.physics.overlap(eb, orb)) continue;
        eb.explode();
        break;
      }
    }

    // -----------------------------------------------------------------------------------
    // 6. EarthWall pillars + orb. The orb pulls every pillar inside
    //    VOID_ORB_EARTHWALL_PULL_RADIUS toward its body center; a pillar that
    //    reaches VOID_ORB_EARTHWALL_CRUMBLE_RADIUS is shattered instantly
    //    (the orb has "eaten" it). Otherwise the pillar takes throttled tick
    //    damage while it slides inward. Pull is position-additive so the
    //    pillar's immovable body still resolves collisions with players /
    //    enemies normally on the next physics step.
    // -----------------------------------------------------------------------------------
    const pillars = this.#earthWallGroup.getChildren() as EarthWallPillar[];
    if (pillars.length > 0) {
      const now = this.time.now;
      const PULL_R = CONFIG.VOID_ORB_EARTHWALL_PULL_RADIUS;
      const CRUMBLE_R = CONFIG.VOID_ORB_EARTHWALL_CRUMBLE_RADIUS;
      const PULL_SPD = CONFIG.VOID_ORB_EARTHWALL_PULL_SPEED;
      const PULL_EXP = CONFIG.VOID_ORB_EARTHWALL_PULL_FALLOFF_EXP;
      const TICK_MS = CONFIG.VOID_ORB_EARTHWALL_TICK_INTERVAL_MS;
      const TICK_DMG = CONFIG.VOID_ORB_EARTHWALL_TICK_DAMAGE;
      const DUST_MS = CONFIG.EARTH_WALL_DARK_PULL_DUST_INTERVAL_MS;
      for (const pillar of pillars) {
        if (!pillar.active || pillar.isBeingDestroyed) continue;
        const pBody = pillar.body as Phaser.Physics.Arcade.Body | null;
        const px = pBody?.center.x ?? pillar.x;
        const py = pBody?.center.y ?? pillar.y;
        let shattered = false;
        for (const orb of orbs) {
          const oBody = orb.body as Phaser.Physics.Arcade.Body;
          const ocx = oBody.center.x;
          const ocy = oBody.center.y;
          const dx = ocx - px;
          const dy = ocy - py;
          const distSq = dx * dx + dy * dy;
          if (distSq > PULL_R * PULL_R) continue;
          const dist = Math.sqrt(distSq);

          // Instant pulverize when the pillar reaches the inner ring — orb is
          // "swallowing" it. pulverize() spawns brown pixel chunks that fly
          // INTO the orb (the visual "brown pixels appearing on the orb")
          // and destroys the pillar immediately, skipping the
          // crumble-sink-into-floor animation that the EarthBump combo path
          // uses.
          if (dist <= CRUMBLE_R) {
            pillar.pulverize(ocx, ocy);
            shattered = true;
            break;
          }

          // Exponential falloff so the pull barely tugs at the rim and
          // accelerates violently as the pillar approaches the orb — much
          // more black-hole-like than the linear ramp. EXP=1 reproduces the
          // old linear behaviour; default EXP=3 is a hard accelerator.
          // Per-frame move clamped to remaining distance so we never
          // overshoot past the orb's body center.
          const closeness = Math.pow(1 - dist / PULL_R, PULL_EXP);
          const move = Math.min(dist, PULL_SPD * closeness * dt);
          if (move > 0 && dist > 0) {
            pillar.x += (dx / dist) * move;
            pillar.y += (dy / dist) * move;
          }

          // Tick damage while pulled — independent of pulverize, throttled
          // per-pillar so two orbs in range don't double-tick on the same
          // frame.
          const lastTick = (pillar.getData('lastDarkTickAt') as number | undefined) ?? 0;
          if (now - lastTick >= TICK_MS) {
            pillar.setData('lastDarkTickAt', now);
            pillar.takeDamage(TICK_DMG);
            if (!pillar.active || pillar.isBeingDestroyed) break;
          }

          // Dust trail: small brown chunks drifting from the pillar into the
          // orb while it's being ground down. Cheap, per-pillar throttled.
          if (DUST_MS > 0) {
            const lastDust = (pillar.getData('lastDarkDustAt') as number | undefined) ?? 0;
            if (now - lastDust >= DUST_MS) {
              pillar.setData('lastDarkDustAt', now);
              pillar.emitDarkDust(ocx, ocy);
            }
          }
        }
        if (shattered) continue;
      }
    }

    // -----------------------------------------------------------------------------------
    // 7. Puddles (water / mud / lava) get pulled toward the orb's body center
    //    using the same exponential model as the EarthWall pillars. A puddle
    //    that reaches the consume ring is destroyed — the void drinks it.
    //    Runs in parallel with the LAVA+WATER extinguish combo for lava
    //    puddles, so a lava puddle being pulled into an orb while a tornado
    //    overlaps it still steams and extinguishes normally.
    // -----------------------------------------------------------------------------------
    if (Puddle.all.size > 0) {
      const PP_R = CONFIG.VOID_ORB_PUDDLE_PULL_RADIUS;
      const PP_SPD = CONFIG.VOID_ORB_PUDDLE_PULL_SPEED;
      const PP_EXP = CONFIG.VOID_ORB_PUDDLE_PULL_FALLOFF_EXP;
      const PP_CONSUME = CONFIG.VOID_ORB_PUDDLE_CONSUME_RADIUS;
      // Iterate a local snapshot — calling puddle.destroy() inside the loop
      // removes it from Puddle.all and would invalidate the Set iterator.
      const puddleSnapshot: Puddle[] = [];
      for (const p of Puddle.all) {
        if (p.active) puddleSnapshot.push(p);
      }
      for (const puddle of puddleSnapshot) {
        if (!puddle.active) continue;
        let consumed = false;
        for (const orb of orbs) {
          const oBody = orb.body as Phaser.Physics.Arcade.Body;
          const ocx = oBody.center.x;
          const ocy = oBody.center.y;
          const dx = ocx - puddle.x;
          const dy = ocy - puddle.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > PP_R * PP_R) continue;
          const dist = Math.sqrt(distSq);
          if (dist <= PP_CONSUME) {
            // Void eats the puddle. Spawn a burst of kind-tinted pixel
            // chunks flying INTO the orb (same visual language as the
            // tornado-absorption fragments + earth-wall pulverize chunks)
            // BEFORE destroy(), so the chunks read as fragments of the
            // puddle being torn apart on consumption. destroy() handles
            // removal from Puddle.all and from the LavaLayer's next
            // rebuild.
            puddle.spawnDarkConsumeBurst(ocx, ocy);
            puddle.destroy();
            consumed = true;
            break;
          }
          // Exponential pull (same shape as the pillar pull). Per-frame move
          // clamped to remaining distance so we never overshoot past the
          // orb's body center. Moving puddle.x/y slides the body on the
          // next physics step; for lava puddles, the LavaLayer reads the
          // new position on its next POST_UPDATE rebuild so the silhouette
          // tracks the puddle.
          const closeness = Math.pow(1 - dist / PP_R, PP_EXP);
          const move = Math.min(dist, PP_SPD * closeness * dt);
          if (move > 0 && dist > 0) {
            puddle.x += (dx / dist) * move;
            puddle.y += (dy / dist) * move;
          }
        }
        if (consumed) continue;
      }
    }

    // -----------------------------------------------------------------------------------
    // 8. Pixel pull FX — pure visual, no gameplay. Each orb periodically emits
    //    small pixel particles flying into its body center. Particles are
    //    sourced from two pools:
    //      - SPRITE: a random in-range sprite (player, enemy, spell) picks a
    //        random pixel from its current animation frame, particle launches
    //        from the sprite's position tinted with that real pixel colour.
    //      - ENV: a random point inside the FX radius tinted with a colour
    //        from VOID_ORB_PIXEL_PULL_ENV_PALETTE — the "ground" filler.
    //    Per-orb throttled by SPAWN_INTERVAL_MS via setData.
    // -----------------------------------------------------------------------------------
    if (CONFIG.VOID_ORB_PIXEL_PULL_ENABLED) {
      const FX_R = CONFIG.VOID_ORB_PIXEL_PULL_RADIUS;
      const EMIT_MS = CONFIG.VOID_ORB_PIXEL_PULL_SPAWN_INTERVAL_MS;
      const PER_EMIT = CONFIG.VOID_ORB_PIXEL_PULL_PARTICLES_PER_EMIT;
      const TRAVEL_MS = CONFIG.VOID_ORB_PIXEL_PULL_TRAVEL_MS;
      const SIZE_MIN = CONFIG.VOID_ORB_PIXEL_PULL_SIZE_MIN_PX;
      const SIZE_MAX = CONFIG.VOID_ORB_PIXEL_PULL_SIZE_MAX_PX;
      const SPRITE_CHANCE = CONFIG.VOID_ORB_PIXEL_PULL_SPRITE_SOURCE_CHANCE;
      const ENV = CONFIG.VOID_ORB_PIXEL_PULL_ENV_PALETTE;

      // Pool of candidate sprites — built once per frame, reused per-orb.
      // Excludes orbs themselves (self-feedback would look weird).
      const candidates: Phaser.GameObjects.Sprite[] = [];
      if (this.#player?.active) candidates.push(this.#player);
      for (const rp of this.#remotePlayers.values()) {
        if (rp.active) candidates.push(rp);
      }
      const enemiesInRoom = this.#objectsByRoomId[this.#currentRoomId]?.enemyGroup?.getChildren() ?? [];
      for (const e of enemiesInRoom) {
        const s = e as Phaser.GameObjects.Sprite;
        if (s.active) candidates.push(s);
      }
      const localSpellChildren = this.#player?.spellCastingComponent?.spellGroup?.getChildren() ?? [];
      const remoteSpellChildren = this.#remoteSpellGroup?.getChildren() ?? [];
      for (const s of [...localSpellChildren, ...remoteSpellChildren]) {
        if (!s.active || s instanceof VoidOrb) continue;
        if (s instanceof Phaser.GameObjects.Sprite) candidates.push(s);
      }

      const nowMs = this.time.now;
      for (const orb of orbs) {
        const lastEmit = (orb.getData('lastPixelPullEmitAt') as number | undefined) ?? 0;
        if (nowMs - lastEmit < EMIT_MS) continue;
        orb.setData('lastPixelPullEmitAt', nowMs);

        const orbBody = orb.body as Phaser.Physics.Arcade.Body;
        const ocx = orbBody.center.x;
        const ocy = orbBody.center.y;

        // Filter candidates to in-range + extract a palette per sprite.
        // Sprites whose texture can't be sampled (empty palette) drop out
        // and the env pool covers for them.
        const inRange: { sprite: Phaser.GameObjects.Sprite; palette: readonly number[] }[] = [];
        for (const s of candidates) {
          const ddx = s.x - ocx;
          const ddy = s.y - ocy;
          if (ddx * ddx + ddy * ddy > FX_R * FX_R) continue;
          const palette = getSpriteFramePalette(s);
          if (palette.length === 0) continue;
          inRange.push({ sprite: s, palette });
        }

        const haveSprites = inRange.length > 0;
        const haveEnv = ENV.length > 0;
        if (!haveSprites && !haveEnv) continue;

        for (let i = 0; i < PER_EMIT; i++) {
          let sx: number;
          let sy: number;
          let tint: number;
          const useSprite = haveSprites && (!haveEnv || Math.random() < SPRITE_CHANCE);
          if (useSprite) {
            const src = inRange[Math.floor(Math.random() * inRange.length)];
            // Jitter the source position inside the sprite's display
            // bounding box so the particle reads as coming from a random
            // point on the sprite, not always its anchor.
            const dw = src.sprite.displayWidth || 16;
            const dh = src.sprite.displayHeight || 16;
            sx = src.sprite.x + (Math.random() - 0.5) * dw * 0.6;
            sy = src.sprite.y + (Math.random() - 0.5) * dh * 0.6;
            tint = src.palette[Math.floor(Math.random() * src.palette.length)];
          } else {
            // Area-uniform random point within FX_R (sqrt for uniform area).
            const r = Math.sqrt(Math.random()) * FX_R;
            const a = Math.random() * Math.PI * 2;
            sx = ocx + Math.cos(a) * r;
            sy = ocy + Math.sin(a) * r;
            tint = ENV[Math.floor(Math.random() * ENV.length)];
          }

          const size = SIZE_MIN + Math.floor(Math.random() * (SIZE_MAX - SIZE_MIN + 1));
          const particle = this.add.graphics({ x: sx, y: sy });
          particle.fillStyle(tint, 1);
          particle.fillRect(-size / 2, -size / 2, size, size);
          // Above the floor and most game objects so the stream is always
          // visible. They're 1-2px and fade fast, so this won't visually
          // obscure anything important.
          particle.setDepth(1000);

          this.tweens.add({
            targets: particle,
            x: ocx,
            y: ocy,
            alpha: 0,
            duration: TRAVEL_MS,
            ease: 'Quad.easeIn',
            onComplete: () => particle.destroy(),
          });
        }
      }
    }
  }

  /** Fire + Water steam combo — FireBolt vs Water(Spike|Tornado) destroys the bolt and
   *  spawns a small steam puff. FireArea vs Water(Spike|Tornado) destroys the FireArea
   *  (extinguished) and spawns the steam — the water spell stays alive (the whole point
   *  of the combo is your water beat their fire). FireBreath is excluded by design. */
  #updateFireWaterSteamCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const all = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const fireBolts = all.filter(
      (s): s is FireBolt => s instanceof FireBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    const fireAreas = all.filter(
      (s): s is FireArea => s instanceof FireArea && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    const waterSpells = all.filter(
      (s): s is WaterSpike | WaterTornado =>
        (s instanceof WaterSpike || s instanceof WaterTornado) &&
        s.active &&
        !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (waterSpells.length === 0) return;

    const spawnSteam = (x: number, y: number): void => {
      const steam = new SteamBurst(this, x, y);
      this.#player.spellCastingComponent.spellGroup.add(steam);
    };

    for (const bolt of fireBolts) {
      for (const water of waterSpells) {
        if (!this.physics.overlap(bolt, water)) continue;
        spawnSteam(bolt.x, bolt.y);
        bolt.explode();
        break;
      }
    }

    for (const area of fireAreas) {
      if (area.getData('steamConsumed')) continue;
      for (const water of waterSpells) {
        if (!this.physics.overlap(area, water)) continue;
        area.setData('steamConsumed', true);
        spawnSteam(area.x, area.y);
        area.destroy();
        break;
      }
    }
  }

  /** ThunderStrike + FireArea combo — passive collision; both stay around, and a
   *  lightning_burst_002 explosion VFX fires once at the contact point when a
   *  strike overlaps a fire area. Damages enemies caught in the burst. */
  #updateThunderFireAreaCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const all = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    // Filter without `body.enable` — the strike's damage body only switches on
    // after the bolt animation + REACTION_BUFFER_MS, but the combo fires on
    // *visual* impact (the moment the strike sprite lands). Same pattern as
    // the ThunderStrike + Puddle combo below.
    const strikes = all.filter(
      (s): s is ThunderStrike => s instanceof ThunderStrike && s.active,
    );
    const areas = all.filter(
      (s): s is FireArea => s instanceof FireArea && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (strikes.length === 0 || areas.length === 0) return;
    const now = this.time.now;
    for (const strike of strikes) {
      if (strike.getData('thunderFireAreaCombo')) continue;
      for (const area of areas) {
        // Geometric containment on the area's display bounds — fires on the
        // frame the strike spawns, independent of whether the strike's
        // physics body has activated yet.
        if (!area.getBounds().contains(strike.x, strike.y)) continue;

        // Stamp the spawn time on first contact, then defer the burst by
        // RUNTIME_CONFIG.THUNDER_FIREAREA_BURST_DELAY_MS so the explosion
        // lands on whichever animation frame reads as "the bolt actually
        // touched down". Same pattern as the Thunder + Puddle splash below.
        let sightedAt = strike.getData('fireAreaSightedAt') as number | undefined;
        if (sightedAt === undefined) {
          sightedAt = now;
          strike.setData('fireAreaSightedAt', sightedAt);
        }
        if (now - sightedAt < RUNTIME_CONFIG.THUNDER_FIREAREA_BURST_DELAY_MS) {
          // Keep looking next frame — don't fire yet, but also don't mark
          // the combo as triggered so we re-evaluate (the area might also
          // move / fade in the meantime).
          break;
        }

        strike.setData('thunderFireAreaCombo', true);
        const x = (strike.x + area.x) / 2;
        const y = (strike.y + area.y) / 2;
        const burst = new LightningBurstCombo(this, x, y, { variant: '002' });
        this.#player.spellCastingComponent.spellGroup.add(burst);
        break;
      }
    }
  }

  /** ThunderStrike + Puddle combo — a strike whose damage body overlaps any active
   *  puddle plays a Pixelart Splash at the strike's centre (the cursor / cast point)
   *  and electrifies every overlapping puddle. Re-striking an already-electrified
   *  puddle refreshes its charge to 100. Each strike triggers at most once. */
  #updateThunderStrikePuddleCombo(): void {
    if (Puddle.all.size === 0) return;
    const localGroup = this.#player?.spellCastingComponent?.spellGroup;
    const all = [
      ...(localGroup?.getChildren() ?? []),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    // Splash + electrify trigger as soon as the strike spawns, independent of when its
    // damage body activates (REACTION_BUFFER_MS). Decoupled so splash VFX timing can be
    // tuned separately from damage timing — overlap is now a geometric check, not a
    // physics-enabled check.
    const strikes = all.filter(
      (s): s is ThunderStrike => s instanceof ThunderStrike && s.active,
    );
    if (strikes.length === 0) return;

    for (const strike of strikes) {
      if (strike.getData('puddleComboTriggered')) continue;

      // Splash fires when the visible bolt reaches the ground, not when the strike spawns.
      // Stamp the spawn time on first sight, then wait RUNTIME_CONFIG.THUNDER_PUDDLE_SPLASH_DELAY_MS
      // before triggering. Tune the delay to land on whichever animation frame reads as "impact".
      let spawnAt = strike.getData('spawnAt') as number | undefined;
      if (spawnAt === undefined) {
        spawnAt = this.time.now;
        strike.setData('spawnAt', spawnAt);
      }
      if (this.time.now - spawnAt < RUNTIME_CONFIG.THUNDER_PUDDLE_SPLASH_DELAY_MS) continue;

      const hit: Puddle[] = [];
      // Manual circle-vs-circle distance check — physics.overlap silently returns false
      // when either body is disabled, and the strike's body intentionally stays disabled
      // until the reaction buffer elapses. We anchor on the strike's cast point and use
      // its configured body radius (set in ThunderStrike's setCircle call).
      const strikeBody = strike.body as Phaser.Physics.Arcade.Body | null;
      const strikeR = strikeBody?.radius ?? 20;
      for (const p of Puddle.all) {
        if (!p.active) continue;
        const dx = p.x - strike.x;
        const dy = p.y - strike.y;
        const combinedR = strikeR + p.radius;
        if (dx * dx + dy * dy <= combinedR * combinedR) hit.push(p);
      }
      if (hit.length === 0) continue;
      strike.setData('puddleComboTriggered', true);

      // One splash anchored at the strike's centre (= cursor / cast point), even if
      // multiple puddles got electrified — the splash is the "lightning hit water"
      // feedback, not a per-puddle effect. X/Y offset tunables let you nudge the
      // sprite when the artwork's pivot isn't at the centre of its frame.
      // Splash VFX skipped — the PIXELART_SPLASH texture (Splash.png) was removed
      // during the asset reorg. The combo's gameplay (electrify nearby puddles) still
      // fires below; restore the splash sprite/anim if you re-add the source PNG.
      const splashX = strike.x + RUNTIME_CONFIG.THUNDER_PUDDLE_SPLASH_X_OFFSET_PX;
      const splashY = strike.y + RUNTIME_CONFIG.THUNDER_PUDDLE_SPLASH_Y_OFFSET_PX;
      void splashX; void splashY;
      if (this.textures.exists(ASSET_KEYS.PIXELART_SPLASH)) {
        const splash = this.add.sprite(splashX, splashY, ASSET_KEYS.PIXELART_SPLASH, 0);
        splash.setDepth(2.5);
        splash.play(ASSET_KEYS.PIXELART_SPLASH);
        splash.once(`animationcomplete-${ASSET_KEYS.PIXELART_SPLASH}`, () => splash.destroy());
      }

      // Cross-player attribution: each strike (local or remote-replicated) carries a
      // casterId tag set at spawn time. Route the electrified puddle to the matching
      // spell group so cross-player damage overlaps come from the correct caster's
      // group and dedup by their casterId. Remote-cast strikes electrify too.
      const localId = this.#safeNetworkManager()?.localPlayerId;
      const strikeCasterId = strike.getData('casterId') as string | undefined;
      const isLocalCast = strikeCasterId === undefined || strikeCasterId === localId;
      const targetGroup = isLocalCast ? localGroup : this.#remoteSpellGroup;
      for (const p of hit) {
        p.electrify(
          RUNTIME_CONFIG.ELEC_PUDDLE_CHARGE_MAX,
          targetGroup,
          strikeCasterId ?? localId,
        );
        // MUD puddle ⇒ snare every character currently standing in it. Water
        // puddles still get the full damage treatment but no snare; mud trades
        // raw damage for control. Movement-only — snared characters can still
        // cast/use magic (see CharacterGameObject.applyMovementSnare).
        if (p.kind === 'mud') {
          this.#snareCharactersInPuddle(p, CONFIG.ELEC_PUDDLE_MUD_SNARE_DURATION_MS);
        }
      }
    }
  }

  /** Snare every active character (local player + remote players + enemies in
   *  the current room) currently overlapping `puddle`. Used by the Lightning +
   *  mud puddle combo. Pure dispatcher — actual snare bookkeeping lives on
   *  CharacterGameObject and auto-expires by timestamp. */
  #snareCharactersInPuddle(puddle: Puddle, durationMs: number): void {
    const characters: CharacterGameObject[] = [];
    if (this.#player?.active) characters.push(this.#player);
    for (const rp of this.#remotePlayers.values()) {
      if (rp.active) characters.push(rp);
    }
    const enemies = this.#objectsByRoomId[this.#currentRoomId]?.enemyGroup?.getChildren() ?? [];
    for (const e of enemies) {
      const c = e as CharacterGameObject;
      if (c.active) characters.push(c);
    }
    for (const c of characters) {
      if (this.physics.overlap(c, puddle)) {
        c.applyMovementSnare(durationMs);
      }
    }
  }

  /** EarthBump + EarthWall combo — pillars shatter on bump overlap and shoot
   *  an EarthBolt "shard" away from the caster (down/horizontal vector matches
   *  the bump's launch direction). */
  #updateEarthBumpWallCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const bumps = this.#player.spellCastingComponent.spellGroup
      .getChildren()
      .filter((s): s is EarthBump => s instanceof EarthBump && s.active);
    if (bumps.length === 0) return;
    const pillars = this.#earthWallGroup.getChildren() as EarthWallPillar[];
    if (pillars.length === 0) return;
    for (const bump of bumps) {
      if (this.#bumpsThatShattered.has(bump)) continue;
      let hitAny = false;
      // Vector from caster (local player) to bump centre — shards fly that way.
      const dx = bump.x - this.#player.x;
      const dy = bump.y - this.#player.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      for (const pillar of pillars) {
        if (!pillar.active || pillar.isBeingDestroyed) continue;
        if (!this.physics.overlap(bump, pillar)) continue;
        hitAny = true;
        const px = pillar.x;
        const py = pillar.y;
        pillar.shatter();
        // Spawn the shard slightly ahead of the pillar so it doesn't immediately collide.
        const shardX = px + nx * 12;
        const shardY = py + ny * 12;
        const shard = new EarthBolt(this, shardX, shardY, shardX + nx * 200, shardY + ny * 200);
        this.#player.spellCastingComponent.spellGroup.add(shard);
      }
      if (hitAny) this.#bumpsThatShattered.add(bump);
    }
  }

  /** FireBreath damages EarthWall pillars while the beam is active. Damage is light per
   *  tick so a single pillar takes several seconds to crumble under sustained fire. */
  #updateFireBreathVsEarthWall(): void {
    const breath = this.#activeFireBreath;
    if (!breath?.active || breath.isEnding) return;
    const pillars = this.#earthWallGroup.getChildren() as EarthWallPillar[];
    for (const pillar of pillars) {
      if (!pillar.active || pillar.isBeingDestroyed) continue;
      if (breath.isEnemyInBreath(pillar.x, pillar.y)) {
        // Apply 1 HP per frame is too much; only every ~250ms tick we apply 1.
        // Use a simple timestamp-keyed throttle stored on the pillar.
        const now = this.time.now;
        const last = (pillar.getData('lastBreathTickAt') as number | undefined) ?? 0;
        if (now - last >= 200) {
          pillar.setData('lastBreathTickAt', now);
          pillar.takeDamage(1);
        }
      }
    }
  }

  #handleRadialMenuInput(): void {
    // Phase 9.3 (Plan 03): suppress radial menu while dead (D-11 input gating).
    if (this.#deathLockActive) return;
    if (!this.#controls.isRadialMenuKeyJustDown) return;
    if (this.scene.isActive(SCENE_KEYS.RADIAL_MENU_SCENE)) return;
    this.scene.launch(SCENE_KEYS.RADIAL_MENU_SCENE);
  }

  /** Q / E rotate the on-screen element carousel. UiScene owns the visual + the actual
   *  ElementManager.setElement call; here we only forward the just-down edge. */
  #handleCarouselInput(): void {
    if (this.#deathLockActive) return;
    // While the radial menu is open it owns element selection — don't double-fire.
    if (this.scene.isActive(SCENE_KEYS.RADIAL_MENU_SCENE)) return;
    if (this.#controls.isCarouselLeftJustDown) {
      EVENT_BUS.emit(CUSTOM_EVENTS.ELEMENT_CAROUSEL_STEP, { direction: -1 });
    } else if (this.#controls.isCarouselRightJustDown) {
      EVENT_BUS.emit(CUSTOM_EVENTS.ELEMENT_CAROUSEL_STEP, { direction: 1 });
    }
  }

  #handleDashInput(): void {
    // Respect COUNTDOWN lock and (Plan 03) death lock.
    if (this.#combatLocked) return;
    if (this.#deathLockActive) return;
    if (!this.#controls.isDashKeyJustDown) return;
    if (!this.#player?.active) return;
    // On Wind, SHIFT becomes the wind super-dash (AirBurst) when mana +
    // cooldown allow. Falls back to a regular dash if not ready so the
    // button always does *something*.
    if (ElementManager.instance.activeElement === ELEMENT.WIND) {
      if (this.#player.dashSuper()) {
        // Mirror the special-cast pattern (VoidOrb R-key) so the
        // network broadcasts the cast and remote clients spawn the
        // air-burst VFX behind the remote mage. slotIndex = -1 is the
        // "not-from-a-slot" sentinel that #onLocalSpellCast accepts.
        // targetX/Y carry the WASD direction vector at one tile out so the
        // remote-side air-burst tilt + roll point the right way.
        const { tx: airTx, ty: airTy } = this.#dashTargetFromInput();
        EVENT_BUS.emit(CUSTOM_EVENTS.SPELL_CAST, {
          spellInstanceId: Phaser.Math.RND.uuid(),
          spellId: SPELL_ID.AIR_BURST,
          slotIndex: -1,
          casterX: this.#player.x,
          casterY: this.#player.y,
          targetX: airTx,
          targetY: airTy,
        });
        return;
      }
    }
    this.#player.dash();
    // Broadcast a vanilla dash so remote clients can replay the roll VFX behind
    // this mage. The factory keyed on SPELL_ID.DASH (see dash-vfx.ts) runs
    // VFX-only on remote, and no-ops locally (the local Player.dash already
    // ran its own VFX). targetX/Y carry the WASD direction so remote sees the
    // correct roll orientation.
    const { tx, ty } = this.#dashTargetFromInput();
    EVENT_BUS.emit(CUSTOM_EVENTS.SPELL_CAST, {
      spellInstanceId: Phaser.Math.RND.uuid(),
      spellId: SPELL_ID.DASH,
      slotIndex: -1,
      casterX: this.#player.x,
      casterY: this.#player.y,
      targetX: tx,
      targetY: ty,
    });
  }

  /**
   * Returns a world point one tile ahead of the player in the current WASD
   * direction (fallback: player facing). Used by the dash broadcast so the
   * remote-side factory can derive a direction vector from (caster -> target).
   */
  #dashTargetFromInput(): { tx: number; ty: number } {
    let dx = 0;
    let dy = 0;
    if (this.#controls.isLeftDown) dx -= 1;
    if (this.#controls.isRightDown) dx += 1;
    if (this.#controls.isUpDown) dy -= 1;
    if (this.#controls.isDownDown) dy += 1;
    if (dx === 0 && dy === 0) {
      switch (this.#player.direction) {
        case DIRECTION.LEFT:  dx = -1; break;
        case DIRECTION.RIGHT: dx = 1;  break;
        case DIRECTION.UP:    dy = -1; break;
        case DIRECTION.DOWN:
        default:              dy = 1;
      }
    }
    const len = Math.hypot(dx, dy) || 1;
    const TILE = 32;
    return {
      tx: this.#player.x + (dx / len) * TILE,
      ty: this.#player.y + (dy / len) * TILE,
    };
  }

  /**
   * R-key handler — casts whichever pickup-granted special spell is currently
   * equipped in SpecialSpellInventory (one-slot model: VoidOrb OR DarkBolt OR
   * none). The slot is set by the last pickup the player walked over.
   *
   * Bypasses the element / slot pipeline entirely so it doesn't disturb the
   * carousel or interfere with channeled spells like FireBreath / LightningBeam.
   * The single-slot inventory persists across scene restarts (singleton).
   */
  #handleSpecialCastInput(): void {
    if (this.#combatLocked) return;
    if (this.#deathLockActive) return;
    if (!this.#controls.isSpecialCastJustDown) return;
    if (!this.#player?.active) return;
    // Block re-cast while a DarkBolt windup is in progress — input would
    // otherwise stack a second windup on top of the first and consume two
    // charges for one visible cast.
    if (this.#darkBoltWindupActive) return;

    const inv = SpecialSpellInventory.instance;
    const activeSpellId = inv.activeSpellId;
    if (!activeSpellId) return;
    if (!inv.tryConsume()) return;

    // Cast at the cursor's world position, clamped to attack range (matches the
    // standard slot-cast clamp in SpellCastingComponent).
    let targetX = this.#controls.mouseWorldX;
    let targetY = this.#controls.mouseWorldY;
    const range = RUNTIME_CONFIG.PLAYER_ATTACK_RANGE_PX;
    const dx = targetX - this.#player.x;
    const dy = targetY - this.#player.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > range * range) {
      const d = Math.sqrt(distSq);
      targetX = this.#player.x + (dx * range) / d;
      targetY = this.#player.y + (dy * range) / d;
    }
    const direction = Math.abs(dx) >= Math.abs(dy)
      ? (dx >= 0 ? DIRECTION.RIGHT : DIRECTION.LEFT)
      : (dy >= 0 ? DIRECTION.DOWN : DIRECTION.UP);

    // DarkBolt gets a windup — the player locks in place and glows red/black
    // for ~380ms before the bolt actually fires. Telegraphs the spell so it
    // can be dodged. VoidOrb (and any other special) still fires immediately.
    if (activeSpellId === SPELL_ID.DARK_BOLT) {
      this.#beginDarkBoltWindup(targetX, targetY, direction);
      return;
    }

    this.#spawnSpecialSpell(activeSpellId, targetX, targetY, direction);

    // Star Shield is always-available — re-grant a fresh charge so the slot
    // doesn't go empty. Other specials clear naturally (pickup model).
    if (activeSpellId === SPELL_ID.STAR_SHIELD) {
      SpecialSpellInventory.instance.setActive(SPELL_ID.STAR_SHIELD, 1);
    }
  }

  /** Begin the DarkBolt cast windup. Locks the player in place via the same
   *  isMovementLocked flag FireBreath uses, applies a pulsing red/black glow
   *  to the player sprite, and spawns a growing crimson aura around them. At
   *  the end of the windup, the bolt spawns and broadcasts. If the player
   *  dies or the scene tears down mid-windup, #endDarkBoltWindup cleans up
   *  the visual layers without spawning the bolt. */
  #beginDarkBoltWindup(targetX: number, targetY: number, direction: Direction): void {
    if (!this.#player?.active) return;
    this.#darkBoltWindupActive = true;
    this.#controls.isMovementLocked = true;
    (this.#player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    // Pulsing red/black glow on the player sprite via pre-FX. Track the FX
    // handle + tween so #endDarkBoltWindup can tear them down cleanly.
    type PreFXCapable = Phaser.GameObjects.Sprite & {
      preFX?: {
        addGlow: (color?: number, outerStrength?: number, innerStrength?: number, knockout?: boolean) => { color: number };
        remove: (fx: unknown) => void;
      };
    };
    const playerSprite = this.#player as unknown as PreFXCapable;
    let glow: { color: number } | undefined;
    if (playerSprite.preFX) {
      glow = playerSprite.preFX.addGlow(
        CONFIG.DARK_BOLT_CASTER_GLOW_COLOR_A,
        CONFIG.DARK_BOLT_CASTER_GLOW_OUTER_STRENGTH,
        CONFIG.DARK_BOLT_CASTER_GLOW_INNER_STRENGTH,
        false,
      );
      this.#darkBoltCasterGlowFX = glow;
    }
    // Manual color-cycle on the glow handle. Phaser tweens don't drive integer
    // colour interp cleanly via "color" property; we mutate it from a numeric
    // 0→1 tween instead and lerp between the two band colors ourselves.
    if (glow) {
      this.#darkBoltCasterGlowTween = this.tweens.add({
        targets: { t: 0 },
        t: 1,
        duration: 180,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        onUpdate: (_tw, target) => {
          if (!glow) return;
          const t = (target as { t: number }).t;
          const a = CONFIG.DARK_BOLT_CASTER_GLOW_COLOR_A;
          const b = CONFIG.DARK_BOLT_CASTER_GLOW_COLOR_B;
          const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
          const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
          const r = Math.round(ar + (br - ar) * t);
          const g = Math.round(ag + (bg - ag) * t);
          const bl = Math.round(ab + (bb - ab) * t);
          glow.color = (r << 16) | (g << 8) | bl;
        },
      });
    }

    // Crimson aura growing around the caster — same ADD-blended radial
    // gradient texture as the bolt's env-light. Ensure the texture exists
    // (the bolt is what normally generates it, but the windup spawns BEFORE
    // the bolt) so the first cast doesn't show an invisible aura.
    ensureDarkBoltEnvLightTexture(this);
    const burst = this.add.image(this.#player.x, this.#player.y, DARK_BOLT_ENV_LIGHT_TEXTURE_KEY);
    burst.setOrigin(0.5, 0.5);
    burst.setDisplaySize(
      CONFIG.DARK_BOLT_CASTER_BURST_START_DIAMETER_PX,
      CONFIG.DARK_BOLT_CASTER_BURST_START_DIAMETER_PX,
    );
    burst.setTint(CONFIG.DARK_BOLT_CASTER_BURST_TINT);
    burst.setBlendMode(Phaser.BlendModes.ADD);
    burst.setAlpha(CONFIG.DARK_BOLT_CASTER_BURST_START_ALPHA);
    burst.setDepth(2.88); // beneath the bolt's effect stack
    this.#darkBoltCasterBurst = burst;
    this.tweens.add({
      targets: burst,
      displayWidth: CONFIG.DARK_BOLT_CASTER_BURST_END_DIAMETER_PX,
      displayHeight: CONFIG.DARK_BOLT_CASTER_BURST_END_DIAMETER_PX,
      alpha: CONFIG.DARK_BOLT_CASTER_BURST_END_ALPHA,
      duration: CONFIG.DARK_BOLT_CAST_WINDUP_MS,
      ease: 'Sine.easeIn',
    });

    // End-of-windup → unlock, tear down glow + burst, spawn the bolt.
    this.time.delayedCall(CONFIG.DARK_BOLT_CAST_WINDUP_MS, () => {
      this.#endDarkBoltWindup();
      if (!this.#player?.active) return;
      this.#spawnSpecialSpell(SPELL_ID.DARK_BOLT, targetX, targetY, direction);
    });
  }

  /** Tear down windup visuals + release movement lock. Safe to call multiple
   *  times (each handle is null-guarded). Called by the delayed-call at the
   *  end of the windup, and also if the player dies mid-windup so the lock
   *  doesn't strand them. */
  #endDarkBoltWindup(): void {
    this.#darkBoltWindupActive = false;
    this.#controls.isMovementLocked = false;
    type PreFXCapable = Phaser.GameObjects.Sprite & {
      preFX?: { remove: (fx: unknown) => void };
    };
    if (this.#darkBoltCasterGlowFX && this.#player) {
      const ps = this.#player as unknown as PreFXCapable;
      ps.preFX?.remove(this.#darkBoltCasterGlowFX);
    }
    this.#darkBoltCasterGlowFX = undefined;
    this.#darkBoltCasterGlowTween?.stop();
    this.#darkBoltCasterGlowTween = undefined;
    this.#darkBoltCasterBurst?.destroy();
    this.#darkBoltCasterBurst = undefined;
  }

  /** Factory for spawning a special spell (VoidOrb / DarkBolt) at the resolved
   *  target. Extracted from #handleSpecialCastInput so the DarkBolt windup path
   *  can call it after the lock + telegraph completes. */
  #spawnSpecialSpell(activeSpellId: string, targetX: number, targetY: number, direction: Direction): void {
    if (!this.#player?.active) return;
    const factory = SPELL_FACTORY_REGISTRY[activeSpellId as SpellId];
    if (!factory) return;
    const spell = factory(this, this.#player.x, this.#player.y, targetX, targetY, direction, this.#player);
    this.#player.spellCastingComponent.spellGroup.add(spell.gameObject);

    // Tag for the cross-player damage + dedupe pipeline (same shape as standard casts).
    const spellInstanceId = Phaser.Math.RND.uuid();
    spell.gameObject.setData('spellId', spellInstanceId);
    spell.gameObject.setData('spellType', activeSpellId);
    try {
      const localId = NetworkManager.getInstance().localPlayerId;
      if (localId) spell.gameObject.setData('casterId', localId);
    } catch { /* offline */ }
    EVENT_BUS.emit(CUSTOM_EVENTS.SPELL_CAST, {
      spellInstanceId,
      spellId: activeSpellId,
      slotIndex: -1, // -1 sentinel = special-cast (not from a slot)
      casterX: this.#player.x,
      casterY: this.#player.y,
      targetX,
      targetY,
    });
  }

  #configureArcadeDebug(): void {
    this.physics.world.defaults.debugShowBody = true;
    this.physics.world.defaults.debugShowStaticBody = true;
    this.physics.world.defaults.debugShowVelocity = false;
  }

  #handleHitboxDebugToggle(): void {
    if (!this.#controls.isDebugToggleKeyJustDown) {
      return;
    }

    this.#isHitboxDebugEnabled = !this.#isHitboxDebugEnabled;

    if (this.#isHitboxDebugEnabled) {
      if (!this.physics.world.debugGraphic) {
        this.physics.world.createDebugGraphic();
      } else {
        this.physics.world.debugGraphic.setVisible(true);
      }

      this.physics.world.drawDebug = true;
      return;
    }

    this.physics.world.drawDebug = false;
    this.physics.world.debugGraphic?.clear();
    this.physics.world.debugGraphic?.setVisible(false);
  }

  #handlePrintCoordsKey(): void {
    if (!this.#controls.isPrintCoordsKeyJustDown) return;
    const x = Math.round(this.#player.x);
    const y = Math.round(this.#player.y);
    console.log(`[SPAWN] { x: ${x}, y: ${y} }`);
  }

  #updateFireBreathChanneling(): void {
    // LFC-06: hard-gate spell input during COUNTDOWN. This handler ignores
    // isMovementLocked because the channel itself owns that flag (line ~280),
    // so #combatLocked is the correct lock here.
    if (this.#combatLocked) return;
    // Phase 9.3 (Plan 03): D-11 dead-player input suppression.
    if (this.#deathLockActive) return;
    if (!this.#player?.active) return;
    // FireBreath is the FIRE-element key-3 spell. For every other element, key 3 either
    // does nothing (default) or is handled by an element-specific handler (e.g. EarthWall).
    if (ElementManager.instance.activeElement !== ELEMENT.FIRE) return;

    const controls = this.#controls;
    const isHolding = controls.isSpell3KeyDown;

    // Key released or mana empty → end breath
    if (!isHolding) {
      if (this.#activeFireBreath?.active && !this.#activeFireBreath.isEnding) {
        this.#activeFireBreath.beginEnding();
        this.#fireBreathDamageTimer?.destroy();
        this.#controls.isMovementLocked = false;
        try { NetworkManager.getInstance().sendBreathEnd(); } catch { /* offline */ }
      }
      return;
    }

    // Key held but no active breath → start one
    if (!this.#activeFireBreath || !this.#activeFireBreath.active) {
      if (this.#player.manaComponent.mana < CONFIG.FIRE_BREATH_MANA_PER_TICK) {
        return;
      }

      this.#activeFireBreath = new FireBreath(
        this,
        this.#player.x,
        this.#player.y,
        controls.mouseWorldX,
        controls.mouseWorldY,
        this.#collisionLayer,
        this.#blockingGroup,
        this.#player.manaComponent,
      );

      // Damage tick while breath is active
      this.#fireBreathDamageTimer = this.time.addEvent({
        delay: CONFIG.FIRE_BREATH_DAMAGE_TICK_INTERVAL,
        callback: this.#applyFireBreathDamage,
        callbackScope: this,
        loop: true,
      });

      // Clean up when breath object is destroyed
      this.#activeFireBreath.once(Phaser.GameObjects.Events.DESTROY, () => {
        this.#fireBreathDamageTimer?.destroy();
        this.#activeFireBreath = undefined;
        this.#controls.isMovementLocked = false;
        // Clear any active breath+area combos
        this.#activeFireBreathAreaCombos.forEach((area) => {
          if (area.active) area.onFireBreathExit();
        });
        this.#activeFireBreathAreaCombos.clear();
      });

      try {
        NetworkManager.getInstance().sendBreathStart({
          x: this.#player.x,
          y: this.#player.y,
          targetX: controls.mouseWorldX,
          targetY: controls.mouseWorldY,
        });
      } catch { /* offline */ }

      return;
    }

    if (this.#activeFireBreath.isEnding) return;

    // Breath is active: lock player movement and update aim
    this.#controls.isMovementLocked = true;
    (this.#player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.#activeFireBreath.update(this.#player.x, this.#player.y, controls.mouseWorldX, controls.mouseWorldY);

    this.#player.direction = this.#activeFireBreath.facingDirection;
    this.#player.setFlipX(this.#activeFireBreath.facingDirection === DIRECTION.LEFT);
    this.#player.animationComponent.playAnimation(`IDLE_${this.#player.direction}`);

    try {
      NetworkManager.getInstance().sendBreathUpdate({
        x: this.#player.x,
        y: this.#player.y,
        targetX: controls.mouseWorldX,
        targetY: controls.mouseWorldY,
      });
    } catch { /* offline */ }
  }

  #updateFireBreathAreaCombo(): void {
    const breath = this.#activeFireBreath;

    if (!breath?.active || breath.isEnding) {
      if (this.#activeFireBreathAreaCombos.size > 0) {
        this.#activeFireBreathAreaCombos.forEach((area) => {
          if (area.active) area.onFireBreathExit();
        });
        this.#activeFireBreathAreaCombos.clear();
      }
      return;
    }

    const spellChildren = this.#player?.spellCastingComponent?.spellGroup?.getChildren() ?? [];
    const fireAreas = spellChildren.filter((s): s is FireArea => s instanceof FireArea && s.active);

    const currentCombos = new Set<FireArea>();
    for (const area of fireAreas) {
      if (breath.isAreaInBreath(area.x, area.y)) {
        currentCombos.add(area);
      }
    }

    // Start new combos
    currentCombos.forEach((area) => {
      if (!this.#activeFireBreathAreaCombos.has(area)) {
        area.onFireBreathEnter();
      }
    });

    // End removed combos
    this.#activeFireBreathAreaCombos.forEach((area) => {
      if (!currentCombos.has(area)) {
        if (area.active) area.onFireBreathExit();
      }
    });

    this.#activeFireBreathAreaCombos = currentCombos;
    breath.setComboActive(currentCombos.size > 0);
  }

  #applyFireBreathDamage(): void {
    if (!this.#activeFireBreath?.active || this.#activeFireBreath.isEnding) {
      return;
    }

    const enemyGroup = this.#objectsByRoomId[this.#currentRoomId]?.enemyGroup;
    if (!enemyGroup) return;

    enemyGroup.getChildren().forEach((child) => {
      if (!child.active) return;
      const enemy = child as CharacterGameObject;
      if (enemy.isDefeated) return;
      if (this.#activeFireBreath!.isEnemyInBreath(enemy.x, enemy.y)) {
        enemy.hit(DIRECTION.DOWN, this.#activeFireBreath!.baseDamage);
      }
    });
  }

  /**
   * LightningBeam — drives the per-frame damage + combo dispatch for any active
   * LightningBeam game objects in the scene (local OR remote). The spell itself
   * handles its own lifecycle (release → destroy) and mana drain; this handler is
   * only responsible for "what's inside the beam right now":
   *   - Damage enemies in the current room (deduped to once per drain-tick).
   *   - Electrify any puddles overlapping the beam (one-shot per puddle per cast).
   *
   * Pattern mirrors `#applyFireBreathDamage` + the ThunderStrike/Puddle combo handler.
   */
  #updateLightningBeamCombos(): void {
    // Collect every active beam from local + remote spell groups.
    const beams: LightningBeam[] = [];
    const localGroup = this.#player?.spellCastingComponent?.spellGroup;
    if (localGroup) {
      for (const c of localGroup.getChildren()) {
        if (c instanceof LightningBeam && c.active) beams.push(c);
      }
    }
    if (this.#remoteSpellGroup) {
      for (const c of this.#remoteSpellGroup.getChildren()) {
        if (c instanceof LightningBeam && c.active) beams.push(c);
      }
    }
    if (beams.length === 0) return;

    // Enemies — current room only (matches FireBreath scoping).
    const enemyGroup = this.#objectsByRoomId[this.#currentRoomId]?.enemyGroup;

    const nm = this.#safeNetworkManager();
    for (const beam of beams) {
      // ── Enemy damage (deduped per drain tick via beam.hitThisTickSet) ──
      if (enemyGroup) {
        enemyGroup.getChildren().forEach((child) => {
          if (!child.active) return;
          const enemy = child as CharacterGameObject;
          if (enemy.isDefeated) return;
          if (beam.hitThisTickSet.has(enemy)) return;
          if (!beam.isPointInBeam(enemy.x, enemy.y)) return;
          beam.hitThisTickSet.add(enemy);
          enemy.hit(beam.aimDirection, beam.baseDamage);
        });
      }

      // ── Cross-player damage — LightningBeam has no Arcade body so the
      // standard cross-player overlaps (A/B in #registerColliders) never
      // fire. Replicate the same protocol manually using isPointInBeam.
      // Local beam: send spell:hit for every overlapping remote player
      // (once per drain-tick via beam.hitThisTickSet — same dedupe set used
      // for enemies). Remote beam: send spell:hit if local player is inside,
      // so the caster's beam still credits damage on the local target.
      if (nm) {
        const beamSpellId = beam.getData('spellId') as string | undefined;
        const beamCasterId = beam.getData('casterId') as string | undefined;
        const beamSpellType = (beam.getData('spellType') as string | undefined) ?? 'LightningBeam';
        const isLocalBeam = beamCasterId === undefined || beamCasterId === nm.localPlayerId;

        if (isLocalBeam) {
          // Local-cast beam → poke each remote player inside the beam.
          for (const remote of this.#remotePlayers.values()) {
            if (!remote.active || remote.isDefeated) continue;
            if (remote.isStarShieldActive) continue; // shielded targets eat the beam silently
            if (beam.hitThisTickSet.has(remote)) continue;
            if (!beam.isPointInBeam(remote.x, remote.y)) continue;
            beam.hitThisTickSet.add(remote);
            const targetId = remote.getData('playerId') as string | undefined;
            if (!targetId || !beamSpellId) continue;
            if (this.#areSameTeam(nm.localPlayerId, targetId)) continue;
            nm.sendSpellHit({
              spellId: beamSpellId,
              spellType: beamSpellType,
              casterId: nm.localPlayerId,
              targetId,
              hitX: remote.x,
              hitY: remote.y,
              damage: beam.baseDamage,
            });
          }
        } else if (
          beamCasterId &&
          this.#player?.active &&
          !this.#player.isDefeated &&
          !this.#player.isStarShieldActive && // Star Shield: full beam immunity. TODO(star-shield): reflect beam back along its axis.
          !beam.hitThisTickSet.has(this.#player) &&
          beam.isPointInBeam(this.#player.x, this.#player.y) &&
          !this.#areSameTeam(beamCasterId, nm.localPlayerId) &&
          beamSpellId
        ) {
          // Remote-cast beam intersecting the local player. Per-tick dedupe.
          beam.hitThisTickSet.add(this.#player);
          nm.sendSpellHit({
            spellId: beamSpellId,
            spellType: beamSpellType,
            casterId: beamCasterId,
            targetId: nm.localPlayerId,
            hitX: this.#player.x,
            hitY: this.#player.y,
            damage: beam.baseDamage,
          });
        }
      }

      // ── Puddle combo — every overlapping puddle is (re-)electrified every frame.
      // Puddle.electrify() ratchets charge to MAX on every call and early-returns if
      // already running, so this is cheap. While the beam is sweeping a puddle the
      // charge stays pinned at full; the moment the beam moves off, the puddle's own
      // decay (ELEC_PUDDLE_DECAY_PER_SEC) takes over and it eventually fades.
      if (Puddle.all.size > 0) {
        const casterId = beam.getData('casterId') as string | undefined;
        const localId = this.#safeNetworkManager()?.localPlayerId;
        const targetGroup = casterId === undefined || casterId === localId
          ? localGroup
          : this.#remoteSpellGroup;
        for (const p of Puddle.all) {
          if (!p.active) continue;
          if (!beam.isPointInBeam(p.x, p.y)) continue;
          p.electrify(RUNTIME_CONFIG.ELEC_PUDDLE_CHARGE_MAX, targetGroup, casterId ?? localId);
        }
      }
    }
  }

  #updateFireSpellCombos(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) {
      return;
    }

    const spellChildren = this.#player.spellCastingComponent.spellGroup.getChildren();
    const remoteChildren = this.#remoteSpellGroup?.getChildren() ?? [];
    const allSpells = [...spellChildren, ...remoteChildren];
    const fireBolts = allSpells.filter(
      (spell): spell is FireBolt => spell instanceof FireBolt && spell.active && !!(spell.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    const fireAreas = allSpells.filter(
      (spell): spell is FireArea => spell instanceof FireArea && spell.active && !!(spell.body as Phaser.Physics.Arcade.Body)?.enable,
    );

    const activeBolts = new Set(fireBolts);

    this.#activeFireAreaOverlapsByBolt.forEach((previousAreas, trackedBolt) => {
      if (activeBolts.has(trackedBolt)) {
        return;
      }
      previousAreas.forEach((area) => area.onFireBoltExit());
      this.#activeFireAreaOverlapsByBolt.delete(trackedBolt);
    });

    fireBolts.forEach((bolt) => {
      const previousAreas = this.#activeFireAreaOverlapsByBolt.get(bolt) ?? new Set<FireArea>();
      const currentAreas = new Set<FireArea>();

      fireAreas.forEach((area) => {
        if (!area.active) {
          return;
        }
        if (this.physics.overlap(bolt, area)) {
          currentAreas.add(area);
        }
      });

      currentAreas.forEach((area) => {
        if (previousAreas.has(area)) {
          return;
        }
        bolt.onEnterFireArea(area);
        area.onFireBoltEnter();
      });

      previousAreas.forEach((area) => {
        if (currentAreas.has(area)) {
          return;
        }
        bolt.onExitFireArea(area);
        area.onFireBoltExit();
      });

      this.#activeFireAreaOverlapsByBolt.set(bolt, currentAreas);
    });
  }

  /**
   * Detects overlaps between EarthBolt and FireBolt projectiles.
   * When the two meet, both are consumed and a large combo explosion is triggered.
   */
  #updateEarthFireCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) {
      return;
    }

    const spellChildren = this.#player.spellCastingComponent.spellGroup.getChildren();
    const remoteChildren = this.#remoteSpellGroup?.getChildren() ?? [];
    const allSpells = [...spellChildren, ...remoteChildren];
    const earthBolts = allSpells.filter(
      (s): s is EarthBolt => s instanceof EarthBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    const fireBolts = allSpells.filter(
      (s): s is FireBolt => s instanceof FireBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );

    if (earthBolts.length === 0 || fireBolts.length === 0) {
      return;
    }

    for (const earthBolt of earthBolts) {
      for (const fireBolt of fireBolts) {
        if (this.physics.overlap(earthBolt, fireBolt)) {
          const midX = (earthBolt.x + fireBolt.x) / 2;
          const midY = (earthBolt.y + fireBolt.y) / 2;

          // Consume both projectiles
          earthBolt.triggerFireCombo();
          fireBolt.explode();

          // Spawn the combo explosion and add it to the spell group so existing
          // overlap colliders detect it against enemies
          const explosion = new EarthFireExplosion(this, midX, midY);
          this.#player.spellCastingComponent.spellGroup.add(explosion);
        }
      }
    }
  }

  /**
   * EarthBolt + FireArea: the bolt is HEATED into a molten projectile —
   * it keeps travelling (no longer consumed by the fire), deals more damage,
   * and drops a lava puddle at its eventual impact point. Idempotent per
   * bolt; a molten bolt passing through more fire areas is a no-op.
   */
  #updateEarthBoltFireAreaCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) {
      return;
    }

    const spellChildren = this.#player.spellCastingComponent.spellGroup.getChildren();
    const remoteChildren = this.#remoteSpellGroup?.getChildren() ?? [];
    const allSpells = [...spellChildren, ...remoteChildren];
    const earthBolts = allSpells.filter(
      (s): s is EarthBolt => s instanceof EarthBolt && s.active && !s.isMolten && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    const fireAreas = allSpells.filter(
      (s): s is FireArea => s instanceof FireArea && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );

    if (earthBolts.length === 0 || fireAreas.length === 0) {
      return;
    }

    for (const earthBolt of earthBolts) {
      for (const fireArea of fireAreas) {
        if (this.physics.overlap(earthBolt, fireArea)) {
          // Heat the bolt — it continues toward its target now as a molten
          // projectile. Lava puddle drops in EarthBolt.destroy() when it
          // eventually lands.
          earthBolt.makeMolten();
          break;
        }
      }
    }
  }

  /**
   * EarthWall draw flow (left-click owned):
   *  1. Left click while EARTH active and idle → check mana, consume, enter drawing mode.
   *  2. Cursor moved ≥ EARTH_WALL_PILLAR_SPACING px from last pillar → new pillar placed.
   * Drawing ends automatically once EARTH_WALL_PILLAR_COUNT pillars have been placed,
   * when the active element changes, or when the player left-clicks again (cancel).
   *
   * EARTH's slot-0 spell is null (see SPELL_SLOT_REGISTRY) so the state machine's
   * slot-cast path is dormant for this element — left-click is exclusively ours.
   * Right-click drives slot 1 (EarthBump) via the standard slot-cast path.
   */
  #updateEarthWallSpell(): void {
    // LFC-06: hard-gate spell input during COUNTDOWN.
    if (this.#combatLocked) return;
    // Phase 9.3 (Plan 03): D-11 dead-player input suppression.
    if (this.#deathLockActive) return;
    if (!this.#player?.active) return;

    // Element change cancels any in-progress draw.
    if (ElementManager.instance.activeElement !== ELEMENT.EARTH) {
      this.#earthWallPendingClick = false;
      this.#earthWallDrawingMode = false;
      return;
    }

    // Rising-edge detect on left mouse — using activePointer directly (not the
    // KeyboardComponent's isSpell1KeyJustDown getter) keeps the bookkeeping local
    // and independent of any per-frame consumption of that flag elsewhere.
    const mouseLeftDown = this.input.activePointer.leftButtonDown();
    const mouseLeftJustDown = mouseLeftDown && !this.#earthWallMouseWasDown;
    this.#earthWallMouseWasDown = mouseLeftDown;

    // Left-click toggles: start a new draw, or cancel one already in progress.
    if (mouseLeftJustDown) {
      if (this.#earthWallDrawingMode) {
        this.#earthWallDrawingMode = false;
        return;
      }
      if (this.time.now - this.#earthWallLastCastTime < EARTH_WALL_COOLDOWN) return;
      if (this.#player.manaComponent.mana < EARTH_WALL_MANA_COST) return;
      if (EARTH_WALL_MANA_COST > 0) this.#player.manaComponent.consume(EARTH_WALL_MANA_COST);
      this.#earthWallLastCastTime = this.time.now;
      EVENT_BUS.emit(CUSTOM_EVENTS.SPELL_CAST, { spellId: SPELL_ID.EARTH_WALL });
      this.#earthWallDrawingMode = true;
      this.#earthWallDrawingPillarCount = 0;
      this.#earthWallLastPlacedX = -Infinity;
      this.#earthWallLastPlacedY = -Infinity;
    }

    if (!this.#earthWallDrawingMode) return;

    // Phase 2: place a pillar whenever the cursor moves far enough from the last one.
    // Clamp the placement to the player's attack range so pillars cannot be drawn anywhere
    // on the map (parity with SpellCastingComponent.castSpell — bug-6 attack-range fix).
    let tx = this.#controls.mouseWorldX;
    let ty = this.#controls.mouseWorldY;
    const range = RUNTIME_CONFIG.PLAYER_ATTACK_RANGE_PX;
    const ax = tx - this.#player.x;
    const ay = ty - this.#player.y;
    const adistSq = ax * ax + ay * ay;
    if (adistSq > range * range) {
      const adist = Math.sqrt(adistSq);
      tx = this.#player.x + (ax * range) / adist;
      ty = this.#player.y + (ay * range) / adist;
    }

    const dx = tx - this.#earthWallLastPlacedX;
    const dy = ty - this.#earthWallLastPlacedY;
    const distSq = dx * dx + dy * dy;
    const minSpacing = EARTH_WALL_PILLAR_SPACING;
    if (distSq < minSpacing * minSpacing) return;

    const pillar = new EarthWallPillar(this, tx, ty);
    this.#earthWallGroup.add(pillar);
    this.#earthWallLastPlacedX = tx;
    this.#earthWallLastPlacedY = ty;
    this.#earthWallDrawingPillarCount++;

    this.#registerPillarDestroyBroadcast(pillar, tx, ty);

    try {
      NetworkManager.getInstance().sendEarthWallPillar({ x: tx, y: ty });
    } catch { /* offline */ }

    if (this.#earthWallDrawingPillarCount >= EARTH_WALL_PILLAR_COUNT) {
      this.#earthWallDrawingMode = false;
    }
  }

  // Helper for any physics-enabled object/group that should treat Earth Wall as solid.
  // The processCallback gates collision: shielded players phase through pillars
  // instead of being blocked by them. Non-Player colliders (enemies) fall
  // through (don't have the flag) so they remain solid.
  #registerEarthWallSolidCollider(collidable: Phaser.Types.Physics.Arcade.ArcadeColliderType): void {
    this.physics.add.collider(
      collidable,
      this.#earthWallGroup,
      undefined,
      (a, b) => {
        const maybePlayer = (a as unknown as { isStarShieldActive?: boolean });
        const maybePlayer2 = (b as unknown as { isStarShieldActive?: boolean });
        if (maybePlayer.isStarShieldActive || maybePlayer2.isStarShieldActive) {
          return false;
        }
        return true;
      },
    );
  }

  #registerColliders(): void {
    // collision between player and map walls
    this.#collisionLayer.setCollision([this.#collisionLayer.tileset[0].firstgid]);
    this.#enemyCollisionLayer.setCollision([this.#collisionLayer.tileset[0].firstgid]);
    this.physics.add.collider(this.#player, this.#collisionLayer);
    // STAGES: also collide player with per-polygon static colliders + border walls.
    // For non-STAGES levels the group is empty, so this is a no-op.
    this.physics.add.collider(this.#player, this.#staticCollidersGroup);
    this.#registerEarthWallSolidCollider(this.#player);

    // collision between player and game objects in the dungeon/room/world
    this.physics.add.overlap(this.#player, this.#doorTransitionGroup, (playerObj, doorObj) => {
      this.#handleRoomTransition(doorObj as Phaser.Types.Physics.Arcade.GameObjectWithBody);
    });

    // register collisions between player and blocking game objects (doors, pots, chests, etc.)
    this.physics.add.collider(this.#player, this.#blockingGroup, (player, gameObject) => {
      // add game object to players collision list
      this.#player.collidedWithGameObject(gameObject as GameObject);
    });

    // collision between player and switches that can be stepped on
    this.physics.add.overlap(this.#player, this.#switchGroup, (playerObj, switchObj) => {
      this.#handleButtonPress(switchObj as Button);
    });

    // collision between player and doors that can be unlocked
    this.physics.add.collider(this.#player, this.#lockedDoorGroup, (player, gameObject) => {
      const doorObject = gameObject as Phaser.Types.Physics.Arcade.GameObjectWithBody;
      const door = this.#objectsByRoomId[this.#currentRoomId].doorMap[doorObject.name] as Door;

      if (door.doorType !== DOOR_TYPE.LOCK && door.doorType !== DOOR_TYPE.BOSS) {
        return;
      }

      const areaInventory = InventoryManager.instance.getAreaInventory(this.#levelData.level);
      if (door.doorType === DOOR_TYPE.LOCK) {
        if (areaInventory.keys > 0) {
          InventoryManager.instance.useAreaSmallKey(this.#levelData.level);
          door.open();
          // update data manager so we can persist door state
          DataManager.instance.updateDoorData(this.#currentRoomId, door.id, true);
        }
        return;
      }

      // handle boss door
      if (!areaInventory.bossKey) {
        return;
      }
      // update data manager so we can persist door state
      DataManager.instance.updateDoorData(this.#currentRoomId, door.id, true);
      door.open();
    });

    // collisions between enemy groups, collision layers, player, player weapon, and blocking items (pots, chests, etc)
    Object.keys(this.#objectsByRoomId).forEach((key) => {
      const roomId = parseInt(key, 10);
      if (this.#objectsByRoomId[roomId] === undefined) {
        return;
      }

      if (this.#objectsByRoomId[roomId].enemyGroup !== undefined) {
        // collide with walls, doors, etc
        this.physics.add.collider(this.#objectsByRoomId[roomId].enemyGroup, this.#enemyCollisionLayer);
        // STAGES: also collide enemies with per-polygon static colliders.
        this.physics.add.collider(this.#objectsByRoomId[roomId].enemyGroup, this.#staticCollidersGroup);

        // register collisions between player and enemies
        this.physics.add.overlap(this.#player, this.#objectsByRoomId[roomId].enemyGroup, () => {
          this.#player.hit(DIRECTION.DOWN, 1);
        });

        // register collisions between enemies and blocking game objects (doors, pots, chests, etc.)
        this.physics.add.collider(
          this.#objectsByRoomId[roomId].enemyGroup,
          this.#blockingGroup,
          (enemy, gameObject) => {
            // handle when pot objects are thrown at enemies
            if (
              gameObject instanceof Pot &&
              isArcadePhysicsBody(gameObject.body) &&
              (gameObject.body.velocity.x !== 0 || gameObject.body.velocity.y !== 0)
            ) {
              const enemyGameObject = enemy as CharacterGameObject;
              if (enemyGameObject instanceof CharacterGameObject) {
                enemyGameObject.hit(this.#player.direction, 1);
                gameObject.break();
              }
            }
          },
          // handle when objects are thrown on wisps, ignore collisions and let object move through
          (enemy, gameObject) => {
            const body = (gameObject as unknown as GameObject).body;
            if (
              enemy instanceof Wisp &&
              isArcadePhysicsBody(body) &&
              (body.velocity.x !== 0 || body.velocity.y !== 0)
            ) {
              return false;
            }
            return true;
          },
        );

        // register collisions between player spells (projectiles) and enemies
        this.physics.add.overlap(
          this.#player.spellCastingComponent.spellGroup,
          this.#objectsByRoomId[roomId].enemyGroup,
          (spellObj, enemy) => {
            const enemyGameObject = enemy as CharacterGameObject;
            if (enemyGameObject.isDefeated) {
              return;
            }

            // check if it's a FireBolt projectile - explode on hit
            if (spellObj instanceof FireBolt) {
              enemyGameObject.hit(DIRECTION.DOWN, spellObj.baseDamage);
              spellObj.explode();
              return;
            }

            // check if it's an EarthBolt projectile - explode on hit
            if (spellObj instanceof EarthBolt) {
              enemyGameObject.hit(DIRECTION.DOWN, spellObj.baseDamage);
              spellObj.explode();
              return;
            }

            // EarthFireExplosion AoE damage (only when damage phase is active)
            if (spellObj instanceof EarthFireExplosion) {
              if (spellObj.isDamageActive && !enemyGameObject.isDefeated) {
                enemyGameObject.hit(DIRECTION.DOWN, spellObj.baseDamage);
              }
              return;
            }

            // FireArea overlap is handled via tick damage, just track enemies in area
            if (spellObj instanceof FireArea) {
              spellObj.addEnemyInArea(enemyGameObject);
            }

            // LavaPool overlap — tick damage handled internally, just track enemies
            if (spellObj instanceof LavaPool) {
              spellObj.addEnemyInArea(enemyGameObject);
            }

            // WaterTornado overlap — tick damage handled internally, just track enemies
            if (spellObj instanceof WaterTornado) {
              spellObj.addEnemyInArea(enemyGameObject);
            }

            // WaterBall projectile — single hit + explode (FireBolt pattern).
            if (spellObj instanceof WaterBall) {
              enemyGameObject.hit(DIRECTION.DOWN, spellObj.baseDamage);
              spellObj.explode();
              return;
            }

            // WaterSpike — damages each enemy once during the active phase
            if (spellObj instanceof WaterSpike) {
              spellObj.hitEnemy(enemyGameObject);
            }

            // EarthBump - heavily knocks back enemies it touches
            if (spellObj instanceof EarthBump) {
              spellObj.hitEnemy(enemyGameObject);
            }

            // IceShard projectile — damages and explodes on hit
            if (spellObj instanceof IceShard) {
              enemyGameObject.hit(DIRECTION.DOWN, spellObj.baseDamage);
              spellObj.explode();
              return;
            }

            // WindBolt projectile — damages and explodes on hit
            if (spellObj instanceof WindBolt) {
              enemyGameObject.hit(DIRECTION.DOWN, spellObj.baseDamage);
              spellObj.explode();
              return;
            }

            // ThunderStrike area — hitEnemy handles once-per-enemy deduplication
            if (spellObj instanceof ThunderStrike) {
              spellObj.hitEnemy(enemyGameObject);
              return;
            }

            // ThunderSplash — slow lightning projectile. Damage is gated by its internal
            // isDamageActive flag (only the LAND phase damages); hitEnemy handles dedup.
            if (spellObj instanceof ThunderSplash) {
              spellObj.hitEnemy(enemyGameObject);
              return;
            }

            // VoidOrb — persistent darkness orb. Damage is applied as ticks from inside
            // the orb itself (see VoidOrb.#applyTickDamage); here we just track which
            // enemies are currently overlapping so the tick loop knows who to hit.
            if (spellObj instanceof VoidOrb) {
              spellObj.addEnemyInArea(enemyGameObject);
              return;
            }

            // DarkBolt — Hollow-Purple-style pierce projectile. Each enemy is one-shot
            // on first overlap; the bolt itself deduplicates so a target inside the
            // body for multiple frames only takes the hit once.
            if (spellObj instanceof DarkBolt) {
              spellObj.tryHitEnemy(enemyGameObject);
              return;
            }

            // Lightning combo VFX — both variants expose hitEnemy with internal de-dup.
            if (spellObj instanceof LightningBurstCombo || spellObj instanceof LightningStrikeCombo) {
              spellObj.hitEnemy(enemyGameObject);
              return;
            }

            // Steam puff from a fire+water combo — small chip damage, once per enemy.
            if (spellObj instanceof SteamBurst) {
              spellObj.hitEnemy(enemyGameObject);
              return;
            }

            // Electrified puddle — track enemies in area, internal #damageTimer ticks them.
            // Puddles are only in spellGroup while electrified (added/removed in electrify/
            // #endElectrification), so this branch is only reached during the active window.
            if (spellObj instanceof Puddle) {
              spellObj.addEnemyInArea(enemyGameObject);
              return;
            }
          },
        );

        // register collisions between enemy weapon and player
        const enemyWeapons = this.#objectsByRoomId[roomId].enemyGroup.getChildren().flatMap((enemy) => {
          const weaponComponent = WeaponComponent.getComponent<WeaponComponent>(enemy as GameObject);
          if (weaponComponent !== undefined) {
            return [weaponComponent.body];
          }
          return [];
        });
        if (enemyWeapons.length > 0) {
          this.physics.add.overlap(enemyWeapons, this.#player, (enemyWeaponBody) => {
            // get associated weapon component so we can do things like hide projectiles and disable collisions
            const weaponComponent = WeaponComponent.getComponent<WeaponComponent>(enemyWeaponBody as GameObject);
            if (weaponComponent === undefined || weaponComponent.weapon === undefined) {
              return;
            }
            weaponComponent.weapon.onCollisionCallback();
            this.#player.hit(DIRECTION.DOWN, weaponComponent.weaponDamage);
          });

          // Enemy projectiles / weapons also damage earth wall pillars
          this.physics.add.overlap(enemyWeapons, this.#earthWallGroup, (enemyWeaponBody, wallObj) => {
            const pillar = wallObj as EarthWallPillar;
            if (!pillar.active || pillar.isBeingDestroyed) return;
            const weaponComponent = WeaponComponent.getComponent<WeaponComponent>(enemyWeaponBody as GameObject);
            if (weaponComponent === undefined || weaponComponent.weapon === undefined) return;
            weaponComponent.weapon.onCollisionCallback();
            pillar.takeDamage(weaponComponent.weaponDamage);
          });
        }

        // Enemies collide with (cannot walk through) earth wall pillars
        this.#registerEarthWallSolidCollider(this.#objectsByRoomId[roomId].enemyGroup);
      }

      // handle collisions between thrown pots and other objects in the current room
      if (this.#objectsByRoomId[roomId].pots.length > 0) {
        this.physics.add.collider(this.#objectsByRoomId[roomId].pots, this.#blockingGroup, (pot) => {
          if (!(pot instanceof Pot)) {
            return;
          }
          pot.break();
        });
        // collisions between pots and collision layer
        this.physics.add.collider(this.#objectsByRoomId[roomId].pots, this.#collisionLayer, (pot) => {
          if (!(pot instanceof Pot)) {
            return;
          }
          pot.break();
        });
        // STAGES: pots also break against per-polygon static colliders + border walls.
        this.physics.add.collider(this.#objectsByRoomId[roomId].pots, this.#staticCollidersGroup, (pot) => {
          if (!(pot instanceof Pot)) {
            return;
          }
          pot.break();
        });
      }
    });

    // Register spell projectile vs walls collider (FireBolt and EarthBolt explode on walls)
    const explodeOnWall: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (spellObj) => {
      if (spellObj instanceof FireBolt) {
        spellObj.explode();
      }
      if (spellObj instanceof EarthBolt) {
        spellObj.explode();
      }
      if (spellObj instanceof IceShard) {
        spellObj.explode();
      }
      if (spellObj instanceof WindBolt) {
        spellObj.explode();
      }
      if (spellObj instanceof VoidOrb) {
        spellObj.explode();
      }
      if (spellObj instanceof DarkBolt) {
        spellObj.explode();
      }
      if (spellObj instanceof WaterBall) {
        spellObj.explode();
      }
    };
    this.physics.add.collider(this.#player.spellCastingComponent.spellGroup, this.#collisionLayer, explodeOnWall);
    // STAGES: spells also explode against per-polygon static colliders + border walls.
    this.physics.add.collider(this.#player.spellCastingComponent.spellGroup, this.#staticCollidersGroup, explodeOnWall);

    // Remote spells also explode on walls
    const explodeRemoteOnWall: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (spellObj) => {
      if (spellObj instanceof FireBolt) {
        spellObj.explode();
      }
      if (spellObj instanceof EarthBolt) {
        spellObj.explode();
      }
      if (spellObj instanceof IceShard) {
        spellObj.explode();
      }
      if (spellObj instanceof WindBolt) {
        spellObj.explode();
      }
      if (spellObj instanceof WaterBall) {
        spellObj.explode();
      }
    };
    this.physics.add.collider(this.#remoteSpellGroup, this.#collisionLayer, explodeRemoteOnWall);
    this.physics.add.collider(this.#remoteSpellGroup, this.#staticCollidersGroup, explodeRemoteOnWall);

    // ── DarkBolt consumption ────────────────────────────────────────────────
    // DarkBolt erases ANY other spell or pillar it overlaps. Three pairings
    // cover the universe of spell hosts: local spellGroup × itself (DarkBolt
    // vs other local spells), local × remote (DarkBolt vs opponents' spells),
    // and either side × earthWallGroup (pillars live in their own group).
    // The dispatch function dedupes via .setData('darkBoltConsumed') so
    // continuous overlap doesn't keep retriggering the destroy.
    const localSG = this.#player.spellCastingComponent.spellGroup;
    this.physics.add.overlap(localSG, localSG, (a, b) => this.#tryConsumeWithDarkBolt(a as Phaser.GameObjects.GameObject, b as Phaser.GameObjects.GameObject));
    this.physics.add.overlap(localSG, this.#remoteSpellGroup, (a, b) => this.#tryConsumeWithDarkBolt(a as Phaser.GameObjects.GameObject, b as Phaser.GameObjects.GameObject));
    this.physics.add.overlap(localSG, this.#earthWallGroup, (a, b) => this.#tryConsumeWithDarkBolt(a as Phaser.GameObjects.GameObject, b as Phaser.GameObjects.GameObject));
    this.physics.add.overlap(this.#remoteSpellGroup, this.#remoteSpellGroup, (a, b) => this.#tryConsumeWithDarkBolt(a as Phaser.GameObjects.GameObject, b as Phaser.GameObjects.GameObject));
    this.physics.add.overlap(this.#remoteSpellGroup, this.#earthWallGroup, (a, b) => this.#tryConsumeWithDarkBolt(a as Phaser.GameObjects.GameObject, b as Phaser.GameObjects.GameObject));

    // Remote spells vs enemies (per room, same behavior as local spells)
    Object.keys(this.#objectsByRoomId).forEach((key) => {
      const roomId = parseInt(key, 10);
      if (!this.#objectsByRoomId[roomId]?.enemyGroup) return;
      this.physics.add.overlap(
        this.#remoteSpellGroup,
        this.#objectsByRoomId[roomId].enemyGroup,
        (spellObj, enemy) => {
          const enemyGameObject = enemy as CharacterGameObject;
          if (enemyGameObject.isDefeated) return;
          if (spellObj instanceof IceShard) { enemyGameObject.hit(DIRECTION.DOWN, spellObj.baseDamage); spellObj.explode(); return; }
          if (spellObj instanceof WindBolt) { enemyGameObject.hit(DIRECTION.DOWN, spellObj.baseDamage); spellObj.explode(); return; }
          if (spellObj instanceof FireBolt) { enemyGameObject.hit(DIRECTION.DOWN, spellObj.baseDamage); spellObj.explode(); return; }
          if (spellObj instanceof EarthBolt) { enemyGameObject.hit(DIRECTION.DOWN, spellObj.baseDamage); spellObj.explode(); return; }
          if (spellObj instanceof WaterBall) { enemyGameObject.hit(DIRECTION.DOWN, spellObj.baseDamage); spellObj.explode(); return; }
          if (spellObj instanceof ThunderStrike) { spellObj.hitEnemy(enemyGameObject); return; }
          if (spellObj instanceof ThunderSplash) { spellObj.hitEnemy(enemyGameObject); return; }
          if (spellObj instanceof WaterSpike) { spellObj.hitEnemy(enemyGameObject); return; }
        },
      );
    });

    // Player spell projectiles can crack Earth Wall pillars
    this.physics.add.overlap(
      this.#player.spellCastingComponent.spellGroup,
      this.#earthWallGroup,
      (spellObj, wallObj) => {
        const pillar = wallObj as EarthWallPillar;
        if (!pillar.active || pillar.isBeingDestroyed) return;
        if (spellObj instanceof FireBolt) {
          pillar.takeDamage(spellObj.baseDamage);
          spellObj.explode();
          // Phase 9.3 (Plan 03) D-04 hardening: broadcast environment-hit so observers
          // remove the same spell from #remoteSpellGroup via NETWORK_SPELL_DESTROYED.
          const sid = spellObj.getData('spellId') as string | undefined;
          if (sid) this.#safeNetworkManager()?.sendSpellHitEnvironment({ spellId: sid, hitX: spellObj.x, hitY: spellObj.y });
          // Splash: also damage adjacent pillars within EARTH_WALL_FIREBOLT_SPLASH_RADIUS
          const splashRadiusSq = EARTH_WALL_FIREBOLT_SPLASH_RADIUS * EARTH_WALL_FIREBOLT_SPLASH_RADIUS;
          this.#earthWallGroup.getChildren().forEach((child) => {
            if (child === wallObj || !child.active) return;
            const adjacent = child as EarthWallPillar;
            if (adjacent.isBeingDestroyed) return;
            const adx = adjacent.x - pillar.x;
            const ady = adjacent.y - pillar.y;
            if (adx * adx + ady * ady <= splashRadiusSq) {
              adjacent.takeDamage(spellObj.baseDamage);
            }
          });
        } else if (spellObj instanceof EarthBolt) {
          pillar.takeDamage(spellObj.baseDamage);
          spellObj.explode();
          const sid = spellObj.getData('spellId') as string | undefined;
          if (sid) this.#safeNetworkManager()?.sendSpellHitEnvironment({ spellId: sid, hitX: spellObj.x, hitY: spellObj.y });
        }
      },
    );

    // Remote-cast spell projectiles also crack Earth Wall pillars (mirrors local-spell handler
    // above; closes D-21 — earth-wall blocked fireball for caster only because remote-spell
    // group had no overlap registered with #earthWallGroup).
    // NOTE: pillar damage is client-local for v1; if pillar desync becomes observable, route through host validator like player damage (Plan 02).
    this.physics.add.overlap(
      this.#remoteSpellGroup,
      this.#earthWallGroup,
      (spellObj, wallObj) => {
        const pillar = wallObj as EarthWallPillar;
        if (!pillar.active || pillar.isBeingDestroyed) return;
        if (spellObj instanceof FireBolt) {
          pillar.takeDamage(spellObj.baseDamage);
          spellObj.explode();
          const splashRadiusSq = EARTH_WALL_FIREBOLT_SPLASH_RADIUS * EARTH_WALL_FIREBOLT_SPLASH_RADIUS;
          this.#earthWallGroup.getChildren().forEach((child) => {
            if (child === wallObj || !child.active) return;
            const adjacent = child as EarthWallPillar;
            if (adjacent.isBeingDestroyed) return;
            const adx = adjacent.x - pillar.x;
            const ady = adjacent.y - pillar.y;
            if (adx * adx + ady * ady <= splashRadiusSq) {
              adjacent.takeDamage(spellObj.baseDamage);
            }
          });
        } else if (spellObj instanceof EarthBolt) {
          pillar.takeDamage(spellObj.baseDamage);
          spellObj.explode();
        }
      },
    );

    // ────────────────────────────────────────────────────────────────
    // Phase 9.3 (Plan 03): cross-player damage overlaps (PVP-02, D-01..D-05).
    // Damage is NEVER applied here — these callbacks only EMIT spell:hit. The host
    // server validates (FF/plausibility/dedupe) and broadcasts damage:confirmed,
    // which #onDamageConfirmed actually applies to LifeComponent (PVP-05).
    // ────────────────────────────────────────────────────────────────

    // Overlap A: local player vs remote spells.
    this.physics.add.overlap(this.#player, this.#remoteSpellGroup, (_playerObj, spellObj) => {
      const spell = spellObj as Phaser.GameObjects.GameObject & {
        active: boolean;
        x?: number;
        y?: number;
        baseDamage?: number;
        explode?: () => void;
      };
      if (!spell.active) return;
      const nm = this.#safeNetworkManager();
      if (!nm) return;
      const spellId = spell.getData('spellId') as string | undefined;
      const casterId = spell.getData('casterId') as string | undefined;
      const spellType = (spell.getData('spellType') as string | undefined) ?? (spell.constructor as { name: string }).name;
      if (!spellId || !casterId) return;
      // FF pre-check (D-05) — server re-checks, this just saves a round-trip + visual.
      if (this.#areSameTeam(casterId, nm.localPlayerId)) return;

      // Star Shield: total damage immunity. Reflect projectiles back at the
      // sender; absorb everything else (no spell:hit emission). Dedupe via
      // setData so a multi-frame overlap doesn't reflect the same spell twice.
      if (this.#player.isStarShieldActive) {
        if (!spell.getData('starShieldHandled')) {
          spell.setData('starShieldHandled', true);
          this.#handleStarShieldImpact(spell, spellType);
        }
        return;
      }

      nm.sendSpellHit({
        spellId,
        spellType,
        casterId,
        targetId: nm.localPlayerId,
        hitX: this.#player.x,
        hitY: this.#player.y,
        damage: spell.baseDamage ?? 0,
      });
      // EarthBump — apply knockback locally so the player sees themselves
      // launched immediately. Damage itself is still server-validated above.
      // Dedupe per spell instance (the bump's hitbox stays active for ~250ms;
      // we only want to launch the player once per bump).
      if (spell instanceof EarthBump) {
        if (!this.#earthBumpsThatPushedMe.has(spell)) {
          this.#earthBumpsThatPushedMe.add(spell);
          this.#player.applyKnockback(spell.direction, spell.knockbackForce, spell.knockbackDuration);
        }
      } else {
        // Local visual feedback only — actual damage still gates on damage:confirmed (PVP-05, D-01).
        spell.explode?.();
      }
    });

    // Overlap B: local spellGroup vs remote players.
    this.physics.add.overlap(
      this.#player.spellCastingComponent.spellGroup,
      this.#remotePlayerGroup,
      (spellObj, remoteObj) => {
        const spell = spellObj as Phaser.GameObjects.GameObject & {
          active: boolean;
          x?: number;
          y?: number;
          baseDamage?: number;
          explode?: () => void;
        };
        const remote = remoteObj as Player;
        if (!spell.active || !remote.active) return;
        const nm = this.#safeNetworkManager();
        if (!nm) return;
        const spellId = spell.getData('spellId') as string | undefined;
        const targetId = remote.getData('playerId') as string | undefined;
        const spellType = (spell.getData('spellType') as string | undefined) ?? (spell.constructor as { name: string }).name;
        if (!spellId || !targetId) return;
        if (this.#areSameTeam(nm.localPlayerId, targetId)) return;
        // Remote player has Star Shield up — absorb the hit. No spell:hit sent
        // (so server doesn't broadcast damage:confirmed), spell explodes locally.
        // The remote client runs its own copy of the shield's reflection logic
        // against the mirrored spell in its #remoteSpellGroup, so the reflected
        // projectile arrives via that client's local broadcast.
        if (remote.isStarShieldActive) {
          if (!spell.getData('starShieldHandled')) {
            spell.setData('starShieldHandled', true);
            spell.explode?.();
          }
          return;
        }
        nm.sendSpellHit({
          spellId,
          spellType,
          casterId: nm.localPlayerId,
          targetId,
          hitX: remote.x,
          hitY: remote.y,
          damage: spell.baseDamage ?? 0,
        });
        spell.explode?.();
      },
    );
  }

  // ============================================================
  // Phase 9.3 (Plan 03): cross-player damage helpers + listeners.
  // ============================================================

  #safeNetworkManager(): NetworkManager | null {
    try { return NetworkManager.getInstance(); } catch { return null; }
  }

  /** Phase 14 bugfix: true when the active match is team-deathmatch. In TDM, death + respawn
   *  are server-authoritative (#onElimination / #onRespawn) and the legacy single-player
   *  DEATH_STATE → PLAYER_DEFEATED → GAME_OVER path must be suppressed. */
  #isTeamDeathmatchMatch(): boolean {
    return this.#safeNetworkManager()?.isTeamDeathmatch ?? false;
  }

  /**
   * Star Shield impact dispatcher. Called for every remote spell that overlaps a
   * shielded local player. For reflectable PROJECTILES (FireBolt/EarthBolt/
   * WindBolt/IceShard/WaterBall/DarkBolt) we spawn a fresh LOCAL projectile of
   * the same type going the opposite direction — that local cast broadcasts
   * naturally via #onLocalSpellCast, so every peer sees the reflection. For
   * non-projectile spells (areas / channeled / pulls) the shield just absorbs:
   * call explode() on the incoming spell and emit nothing.
   *
   * The reflected projectile's velocity is the inverse of the incoming velocity
   * scaled by STAR_SHIELD_REFLECT_SPEED_MULT. Spawn position is the shielded
   * player's location, target is one tile further along the reflected vector
   * (factories compute their own velocity from caster→target).
   */
  #handleStarShieldImpact(
    spell: Phaser.GameObjects.GameObject & {
      active: boolean;
      x?: number;
      y?: number;
      explode?: () => void;
    },
    spellType: string,
  ): void {
    // Reflectable projectile types — must match SPELL_ID constants on the wire.
    const REFLECTABLE: ReadonlySet<string> = new Set([
      SPELL_ID.FIRE_BOLT,
      SPELL_ID.EARTH_BOLT,
      SPELL_ID.WIND_BOLT,
      SPELL_ID.ICE_SHARD,
      SPELL_ID.WATER_BALL,
      SPELL_ID.DARK_BOLT,
    ]);
    const constructorName = (spell.constructor as { name: string }).name;
    const wireType =
      spellType === constructorName
        ? this.#constructorNameToSpellId(constructorName) ?? spellType
        : spellType;

    if (!REFLECTABLE.has(wireType)) {
      // Absorb-only path — no reflection, no damage.
      spell.explode?.();
      return;
    }

    // Compute reflection vector from the incoming projectile's velocity.
    // Body access via duck-cast — spell's declared shape doesn't expose body,
    // but in practice every reflectable type is an Arcade.Sprite.
    const body = (spell as unknown as { body?: Phaser.Physics.Arcade.Body | null }).body ?? null;
    let vx = body?.velocity.x ?? 0;
    let vy = body?.velocity.y ?? 0;
    if (vx === 0 && vy === 0) {
      // Fallback: project the line caster→player (player just got hit, so the
      // incoming axis is roughly (player - spell.x, player.y - spell.y)).
      vx = this.#player.x - (spell.x ?? this.#player.x);
      vy = this.#player.y - (spell.y ?? this.#player.y);
    }
    const len = Math.hypot(vx, vy) || 1;
    const nx = vx / len;
    const ny = vy / len;

    // Reflect by inverting direction. Slight speed boost is honored downstream
    // by the factory's velocity computation — we steer through (cx,cy)→(tx,ty)
    // and trust the projectile's spawn-time speed. Speed-mult is a TODO if we
    // want each reflected projectile to actually fly faster than the original;
    // for v1 the direction reversal alone reads correctly. Reference the
    // constant so the import isn't dead and the value remains tunable.
    void STAR_SHIELD_REFLECT_SPEED_MULT;
    const TILE = 32;
    const cx = this.#player.x;
    const cy = this.#player.y;
    const tx = cx + -nx * TILE;
    const ty = cy + -ny * TILE;

    // Destroy the incoming projectile so it doesn't keep ticking against us
    // for the next few frames (its body.enable is normally cleared by explode,
    // which also broadcasts NETWORK_SPELL_DESTROYED for the original caster).
    spell.explode?.();

    // Determine the facing direction for the new cast — pick the dominant axis
    // of the reflection vector.
    const direction =
      Math.abs(nx) >= Math.abs(ny)
        ? -nx >= 0
          ? DIRECTION.RIGHT
          : DIRECTION.LEFT
        : -ny >= 0
        ? DIRECTION.DOWN
        : DIRECTION.UP;

    // Spawn a fresh LOCAL projectile via the registry — it lands in our local
    // spell group, gets tagged as ours, and the SPELL_CAST broadcast below
    // mirrors it to every other peer (where it's added to THEIR remote spell
    // group, ready to participate in normal damage overlaps).
    const factory = SPELL_FACTORY_REGISTRY[wireType as SpellId];
    if (!factory) return;
    const reflected = factory(this, cx, cy, tx, ty, direction as Direction, this.#player);
    this.#player.spellCastingComponent.spellGroup.add(reflected.gameObject);

    const spellInstanceId = Phaser.Math.RND.uuid();
    reflected.gameObject.setData('spellId', spellInstanceId);
    reflected.gameObject.setData('spellType', wireType);
    try {
      const localId = NetworkManager.getInstance().localPlayerId;
      if (localId) reflected.gameObject.setData('casterId', localId);
    } catch { /* offline */ }

    EVENT_BUS.emit(CUSTOM_EVENTS.SPELL_CAST, {
      spellInstanceId,
      spellId: wireType,
      slotIndex: -1, // -1 = not from a slot (matches special-cast convention)
      casterX: cx,
      casterY: cy,
      targetX: tx,
      targetY: ty,
    });
  }

  /** Reverse-lookup: convert a constructor class name back to its SPELL_ID
   *  constant. Used as a fallback in #handleStarShieldImpact when the spell's
   *  setData('spellType') is missing (older casts or local-spawned overlap). */
  #constructorNameToSpellId(name: string): string | undefined {
    switch (name) {
      case 'FireBolt':   return SPELL_ID.FIRE_BOLT;
      case 'EarthBolt':  return SPELL_ID.EARTH_BOLT;
      case 'WindBolt':   return SPELL_ID.WIND_BOLT;
      case 'IceShard':   return SPELL_ID.ICE_SHARD;
      case 'WaterBall':  return SPELL_ID.WATER_BALL;
      case 'DarkBolt':   return SPELL_ID.DARK_BOLT;
      default:           return undefined;
    }
  }

  #areSameTeam(playerIdA: string, playerIdB: string): boolean {
    const nm = this.#safeNetworkManager();
    if (!nm) return false;
    const a = nm.matchPlayers.find((p) => p.id === playerIdA);
    const b = nm.matchPlayers.find((p) => p.id === playerIdB);
    if (!a || !b) return false;
    if (a.team === undefined || b.team === undefined) return false;
    return a.team === b.team;
  }

  // Damage application — i-frame guarded (Plan 04 contract) + spellId-deduped.
  #onDamageConfirmed = (payload: DamageConfirmedPayload): void => {
    if (this.#appliedDamageSpellIds.has(payload.spellId)) return;
    this.#appliedDamageSpellIds.add(payload.spellId);

    const nm = this.#safeNetworkManager();
    const isLocalTarget = nm != null && payload.targetId === nm.localPlayerId;

    if (isLocalTarget) {
      // Plan 04 i-frame contract: drop confirmed damage during dash invulnerability window.
      // Player.iFrameUntil is initialized to 0 by Plan 04, so this is a no-op when DASH_IFRAMES_ENABLED=false.
      if (this.time.now < this.#player.iFrameUntil) {
        return;
      }
      // Phase 14 bugfix (TDM playtest #1/#3, server-authoritative HP): in a team-deathmatch the
      // SERVER is the sole HP authority. SET local HP to the authoritative post-hit value
      // (payload.targetHp) — never subtract locally. Independent client/server subtraction is what
      // caused the "stuck at half a heart" desync; the old workaround floored local HP at 1, which
      // only hid the drift. We refresh the HUD from targetHp, play the hurt flash while still
      // alive, and NEVER drive DEATH_STATE here: death + respawn are server-authoritative
      // (NETWORK_ELIMINATION → #applyLocalDeath, NETWORK_RESPAWN → reposition+refill).
      if (this.#isTeamDeathmatchMatch()) {
        this.#player.lifeComponent.setLife(payload.targetHp);
        DataManager.instance.updatePlayerCurrentHealth(payload.targetHp);
        if (payload.targetHp > 0) {
          // Hurt feedback (flash + brief knockback) WITHOUT hit()'s HP-zero → DEATH_STATE path.
          this.#player.stateMachine.setState(CHARACTER_STATES.HURT_STATE, DIRECTION.DOWN);
        }
        return;
      }
      // Non-TDM (PvE / single-player): route through hit() instead of lifeComponent.takeDamage()
      // directly — hit() ALSO calls DataManager.updatePlayerCurrentHealth (→ emits
      // PLAYER_HEALTH_UPDATED → HUD refresh), plays the hurt animation, and runs the post-hit
      // invulnerability gate. Without this, PvP damage silently mutated HP but the HUD never
      // changed and the hurt animation never played, making it look like nothing happened.
      this.#player.hit(DIRECTION.DOWN, payload.amount);
      return;
    }

    const remote = this.#remotePlayers.get(payload.targetId);
    if (remote) {
      // Inline-replicate hit() WITHOUT the DataManager.updatePlayerCurrentHealth call.
      // remote.hit() updates DataManager because Player instances are constructed with
      // isPlayer:true, but DataManager is a per-client singleton — calling it for a
      // remote would overwrite the LOCAL player's HUD with the remote's HP, making it
      // look like the caster was taking damage too. The visual hurt animation + life
      // decrement still need to fire so the caster gets "yes, that hit landed" feedback.
      if (remote.isDefeated) return;
      if (remote.invulnerableComponent.invulnerable) return;
      remote.lifeComponent.takeDamage(payload.amount);
      if (remote.lifeComponent.life === 0) {
        // Death is server-authoritative: the `elimination` broadcast (#onElimination) is the SINGLE
        // source of truth for the death visual (death anim + body disable + team tint). We deliberately
        // DO NOT enter DEATH_STATE here. Two reasons it raced before: (1) DEATH_STATE.onEnter plays
        // DIE_DOWN with ignoreIfPlaying:true, so the later #onElimination DIE_DOWN call was IGNORED and
        // the corpse froze on the hurt/normal frame ("normal sprite locked in place"); (2) DEATH_STATE
        // sets _isDefeated + disableObject (active=false), competing with #onElimination's tint. Letting
        // #onElimination own it makes the corpse identical on every screen.
      } else {
        remote.stateMachine.setState(CHARACTER_STATES.HURT_STATE, DIRECTION.DOWN);
      }
    }
  };

  // ─── Elimination + respawn (D-08..D-11) ───
  // Local-player elimination: dark overlay + BitmapText countdown + input suppression.
  // Remote-player elimination: gray tint only (no overlay).
  #onElimination = (payload: EliminationPayload): void => {
    const nm = this.#safeNetworkManager();
    const isLocal = nm != null && payload.playerId === nm.localPlayerId;

    // Mark this player dead so the per-frame remote interpolation loop stops applying their (still
    // incoming) IDLE/MOVE animation over the death animation. Cleared on respawn.
    this.#deadPlayerIds.add(payload.playerId);

    if (isLocal) {
      this.#applyLocalDeath();
      return;
    }
    const remote = this.#remotePlayers.get(payload.playerId);
    if (remote) {
      // Single authoritative death visual for a remote: disable body (spells pass through), play the
      // death animation, keep the team color. This is the ONLY place a remote death visual is set
      // (#onDamageConfirmed no longer enters DEATH_STATE), so there's no race.
      if (remote.body) {
        (remote.body as Phaser.Physics.Arcade.Body).enable = false;
      }
      // Force the DIE animation facing the remote's last direction. The config is ignoreIfPlaying:true,
      // which after a stop() off a looping anim can silently no-op (intermittent "death anim doesn't
      // play"). force:true passes ignoreIfPlaying:false so the death animation ALWAYS restarts.
      remote.anims?.stop();
      remote.animationComponent?.playAnimation(`DIE_${remote.direction}` as CharacterAnimation, { force: true });
      // Tint AFTER the frame swap, via the cached team tint (works even though a dead remote is
      // active=false, which the old #applyTeamTint early-returned on).
      this.#reapplyStoredTint(remote, payload.playerId);
    }
  };

  #applyLocalDeath(): void {
    this.#deathLockActive = true;
    this.#player.controls.isMovementLocked = true;
    // Bug fix (non-targetable corpse): disable the physics body so enemy spells pass through a dead
    // player instead of exploding on the body. Re-enabled in #onRespawn. We disable only the body
    // (not the whole game object) to keep the death overlay + respawn flow intact.
    if (this.#player.body) {
      (this.#player.body as Phaser.Physics.Arcade.Body).enable = false;
    }
    // Bug fix (death animation): force-play the death animation facing the player's last direction.
    // force:true overrides the config's ignoreIfPlaying:true so the DIE animation can't silently no-op
    // off a looping idle/hurt (the intermittent "death anim doesn't play"). Tint AFTER the frame-swap.
    this.#player.anims?.stop();
    this.#player.animationComponent?.playAnimation(`DIE_${this.#player.direction}` as CharacterAnimation, { force: true });
    const nmDeath = this.#safeNetworkManager();
    if (nmDeath?.localPlayerId) this.#reapplyStoredTint(this.#player, nmDeath.localPlayerId);
    // Defensive velocity zero (mirrors #enterCountdownMode).
    if (this.#player.body) {
      (this.#player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }

    // Full-screen dark overlay, viewport-anchored.
    this.#deathOverlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x222233, 0.55)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(9999);

    // BitmapText countdown using the project-wide press_start_2p atlas (Phase 9.1-04 standard;
    // same key used by lobby/main-menu/splash scenes).
    this.#deathCountdownRemaining = Math.ceil(RUNTIME_CONFIG.RESPAWN_DELAY_MS / 1000);
    this.#deathCountdownText = this.add
      .bitmapText(
        this.scale.width / 2,
        this.scale.height / 2,
        'press_start_2p',
        this.#countdownLabel(),
        32,
      )
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(10000);

    this.#deathCountdownTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.#deathCountdownRemaining = Math.max(0, this.#deathCountdownRemaining - 1);
        this.#deathCountdownText?.setText(this.#countdownLabel());
      },
    });
  }

  #countdownLabel(): string {
    return `RESPAWNING IN ${this.#deathCountdownRemaining}...`;
  }

  #onRespawn = (payload: RespawnPayload): void => {
    const nm = this.#safeNetworkManager();
    const isLocal = nm != null && payload.playerId === nm.localPlayerId;

    if (isLocal) {
      this.#clearLocalDeath();
      this.#player.setPosition(payload.x, payload.y);
      // Bug fix (non-targetable corpse): re-enable the physics body disabled in #applyLocalDeath so
      // the respawned player can collide / be hit again, and clear any latched defeated/invuln flags.
      this.#player.revive();
      // Bug fix (stuck dead sprite): the death animation holds on its last frame. setState(IDLE) can be
      // a no-op if the machine thinks it's already idle (its onEnter never re-runs), so the DIE frame
      // stays frozen. Force the idle animation directly, then set the state for input handling.
      this.#player.animationComponent?.playAnimation(`IDLE_${this.#player.direction}` as CharacterAnimation);
      this.#player.stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
      this.#player.lifeComponent.resetToFull();
      // Phase 14 bugfix (server-authoritative HP): resetToFull only mutates the LifeComponent —
      // the HUD reads DataManager. Refresh it so the heart bar refills on respawn (without this,
      // after the death/respawn cycle the HUD stayed at the last damaged value → "half a heart").
      DataManager.instance.updatePlayerCurrentHealth(this.#player.lifeComponent.life);
      // Phase 14 bugfix (#4): re-apply the team tint (the elimination overlay set it gray); a plain
      // clearTint() here dropped the team color until the next time it was set.
      if (nm?.localPlayerId) this.#applyTeamTint(this.#player, nm.localPlayerId);
      else this.#player.clearTint();
      // Phase 14 (D-12/D-13): start the respawn-invuln alpha pulse AFTER #clearLocalDeath
      // tears down the death overlay + position/HP/tint are restored (do not blink while
      // the death overlay is up).
      this.#startInvulnBlink();
      // No longer dead (cleared AFTER the idle animation is forced, so a stray interpolation update
      // in between can't resurrect the dead-frame gate). Local isn't interp-driven, but keep symmetric.
      this.#deadPlayerIds.delete(payload.playerId);
      return;
    }
    const remote = this.#remotePlayers.get(payload.playerId);
    if (remote) {
      remote.setPosition(payload.x, payload.y);
      remote.lifeComponent.resetToFull();
      // Bug fix (non-targetable corpse): clear the latched _isDefeated flag + re-enable the body so the
      // respawned remote can be hit again. Without this, after one death the caster's copy of the player
      // stays `isDefeated` forever and every future hit short-circuits (line ~3548) — the player becomes
      // permanently invincible on other screens.
      remote.revive();
      // Force idle animation directly so the DIE frame doesn't stay frozen (setState alone can no-op).
      remote.animationComponent?.playAnimation(`IDLE_${remote.direction}` as CharacterAnimation);
      remote.stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
      // Phase 14 bugfix (#4): restore the remote's team tint (was set gray by #onElimination).
      this.#applyTeamTint(remote, payload.playerId);
      // Clear the dead-gate AFTER the idle animation + state are set, so the interpolation loop can't
      // apply a stale dead-frame in the gap (closes the ~ms race the review flagged).
      this.#deadPlayerIds.delete(payload.playerId);
    }
  };

  /**
   * Phase 14 bugfix (TDM playtest #4): apply the server-authoritative match-start team spawns.
   * Previously every player was placed at the tilemap door (#setupPlayer → "spawn in the middle");
   * the authored team A/B spawnpoints only reached clients on respawn. The server now broadcasts
   * match:spawns at COUNTDOWN→ACTIVE and we snap the LOCAL player + any already-spawned REMOTE
   * players to their team spawn. Remote players not yet instantiated will be created at the right
   * spot once their pos packet arrives (and #onRespawn handles subsequent deaths).
   *
   * The local snap also recenters the camera so the intro pan/follow targets the real spawn, not
   * the stale door position.
   */
  #onMatchSpawns = (payload: MatchSpawnsPayload): void => {
    const nm = this.#safeNetworkManager();
    const localId = nm?.localPlayerId ?? null;
    for (const a of payload.spawns) {
      if (localId !== null && a.playerId === localId) {
        // With the deterministic match-start spawn (#setupPlayer + pickStartSpawn), the player is
        // ALREADY here — this authoritative snap is a no-op (same x,y) on the normal intro path. Kept
        // as the server's authority + the non-intro path (late joiner / replay after the cinematic).
        this.#player.setPosition(a.x, a.y);
        if (this.#player.body) {
          (this.#player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        }
        // The camera may still be following from #setupCamera; re-center on the true spawn so the
        // player isn't off-screen at match start. Only matters for the non-intro path — the intro's
        // wide shot owns the camera and re-centers on map-center itself.
        if (!this.#localIntroRan) this.cameras.main.centerOn(a.x, a.y);
        // Phase 14 bugfix (TDM playtest #5): a brief spawn-in cue so the placement reads as a
        // deliberate "you spawned here" beat rather than a silent teleport.
        this.#playSpawnInCue(this.#player, a.x, a.y);
        continue;
      }
      const remote = this.#remotePlayers.get(a.playerId);
      if (remote) {
        remote.setPosition(a.x, a.y);
        this.#playSpawnInCue(remote, a.x, a.y);
      }
    }
  };

  // ─── Special-spell pickups (server-authoritative spawn + first-claim-wins) ───
  // Server broadcasts pickup:spawned → every client renders the SAME pickup at the SAME spot. On the
  // local player overlapping it, we optimistically grant the special + tell the server (pickup:claimed).
  // The server resolves first-touch-wins and broadcasts pickup:collected → everyone destroys the sprite.
  #onPickupSpawned = (payload: PickupSpawnedPayload): void => {
    if (this.#pickups.has(payload.pickupId)) return;   // dedupe (e.g. late-boot replay)
    if (!this.#player) return;
    const pickup = new NetworkedSpecialPickup(this, payload.pickupId, payload.spellType, payload.x, payload.y);
    this.#pickups.set(payload.pickupId, pickup);
    let claimSent = false;   // one-shot guard so the overlap can't fire a second claim across frames
    this.physics.add.overlap(this.#player, pickup, () => {
      if (claimSent || !pickup.active) return;
      claimSent = true;
      // Stop the overlap from re-firing every frame before the server broadcast lands (would spam claims).
      (pickup.body as Phaser.Physics.Arcade.Body | null)?.setEnable(false);
      pickup.collect();   // optimistic local inventory grant
      this.#safeNetworkManager()?.sendPickupClaim({ pickupId: payload.pickupId });
    });
  };

  #onPickupCollected = (payload: PickupCollectedPayload): void => {
    const pickup = this.#pickups.get(payload.pickupId);
    if (!pickup) return;
    pickup.destroy();
    this.#pickups.delete(payload.pickupId);
    // If WE won, collect() already granted the special on overlap. If someone else won and we never
    // touched it, the sprite just disappears — no inventory change for us. (A non-winning optimistic
    // collect() — both touched within one RTT — is a rare, harmless free spell; no rollback needed.)
  };

  /**
   * Phase 14 bugfix (TDM playtest #5): a short, self-cleaning spawn-in cue at a player's match-start
   * spawn — a scale pop on the sprite plus an expanding fading ring at the spawn point. World-space
   * (scrolls with the camera). Purely cosmetic; safe to call for local and remote players.
   */
  #playSpawnInCue(target: Player, x: number, y: number): void {
    if (!target?.active) return;
    // Sprite pop-in: from slightly enlarged back to normal.
    target.setScale(1.6);
    this.tweens.add({
      targets: target,
      scale: { from: 1.6, to: 1.0 },
      duration: 320,
      ease: 'Back.easeOut',
    });
    // Expanding ring at the spawn point (world space, beneath the HUD/cinematic overlays).
    // Grow via SCALE (not the Arc radius setter, which doesn't reliably re-render on tween) so the
    // ring visibly expands; fade alpha to 0 and self-destroy.
    const ring = this.add.circle(x, y, 10, 0xffffff, 0).setStrokeStyle(2, 0xffdd55, 0.9).setDepth(50).setScale(0.6);
    this.tweens.add({
      targets: ring,
      scale: { from: 0.6, to: 2.8 },
      alpha: { from: 0.9, to: 0 },
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Phase 14 (D-12/D-13, UI-SPEC surface 3): start the respawn-invulnerability cue on the
   * LOCAL player. A sustained, slow, looping alpha pulse (1.0 ↔ 0.35, yoyo, repeat -1,
   * 150ms/half) — distinct from the brief one-shot hurt blink by its longer, steadier
   * rhythm, so it reads as "protected". Sized by RUNTIME_CONFIG.RESPAWN_INVULN_MAX_MS
   * (~2500ms).
   *
   * Phase 14 bugfix (TDM playtest #2): this pulse is COSMETIC ONLY. It used to also set
   * Player.iFrameUntil, which made #onDamageConfirmed silently drop ALL confirmed damage to
   * the local player for ~2.5s. Because the SERVER is the sole invuln authority (it rejects
   * spell:hit during its own #invulnUntil window) and only emits damage:confirmed for hits it
   * already accepted, mirroring the window onto the local gate caused a client/server window
   * mismatch (the client starts its timer on the late-arriving `respawn` broadcast) — the
   * respawned player appeared permanently unhittable from one side while still able to hit back.
   * We no longer touch iFrameUntil here; confirmed damage from the server always applies.
   */
  #startInvulnBlink(): void {
    if (!this.#player?.active) return;
    // Clear any prior pulse (defensive — back-to-back respawns).
    this.#stopInvulnBlink();

    this.#invulnUntil = this.time.now + RUNTIME_CONFIG.RESPAWN_INVULN_MAX_MS;
    this.#player.setAlpha(1);
    this.#invulnPulseTween = this.tweens.add({
      targets: this.#player,
      alpha: { from: 1.0, to: 0.35 },
      duration: 150,
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * Phase 14 (D-12): stop the respawn-invuln pulse and hard-reset the sprite. Idempotent —
   * safe to call from the move/cast/timeout cancel hooks and from SHUTDOWN. Zeroes
   * #invulnUntil so the cheap `> 0` guards at the call sites skip the common (not-invuln)
   * case after the first cancel.
   */
  #stopInvulnBlink(): void {
    if (this.#invulnPulseTween !== null) {
      this.#invulnPulseTween.stop();
      this.#invulnPulseTween = null;
    }
    this.#invulnUntil = 0;
    if (this.#player?.active) {
      this.#player.setAlpha(1);
    }
  }

  /**
   * Phase 14 (Plan 04, D-06/D-08): on the single match:ended broadcast, launch the minimal
   * TDM results overlay with the per-player stats payload and FREEZE the world. We launch
   * (not start) the results scene so it renders ON TOP of the frozen GameScene + UiScene,
   * then pause both so gameplay halts under the results scrim. The payload is passed via
   * scene data (no event subscription needed in the results scene). RETURN TO LOBBY in the
   * results scene does the full network/mesh reset (hard reload).
   *
   * Guarded against a duplicate match:ended (the server emits exactly one, but a coalesced
   * re-delivery must not stack a second overlay).
   */
  #onMatchEnded = (payload: MatchEndedPayload): void => {
    if (this.scene.isActive(SCENE_KEYS.TDM_RESULTS_SCENE)) return;
    // Stop the respawn-invuln pulse if it was mid-loop when the match ended.
    this.#stopInvulnBlink();
    this.scene.launch(SCENE_KEYS.TDM_RESULTS_SCENE, payload);
    this.scene.bringToTop(SCENE_KEYS.TDM_RESULTS_SCENE);
    // Freeze gameplay + HUD under the results overlay.
    this.scene.pause();
    this.scene.pause(SCENE_KEYS.UI_SCENE);
  };

  /**
   * DEV (CONFIG.DEV_VICTORY_BUTTON): a small viewport-anchored "WIN" button in the
   * bottom-right corner that synthesizes a winning MatchEndedPayload and routes it
   * through #onMatchEnded — the exact same path the server's match:ended takes — so the
   * TdmResultsScene renders without needing a second browser or real kills.
   */
  #createDevVictoryButton(): void {
    const btn = this.add
      .bitmapText(this.scale.width - 6, this.scale.height - 6, 'press_start_2p', 'WIN', 10)
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(10000)
      .setTint(0xffdd55)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setTint(0xffffff));
    btn.on('pointerout', () => btn.setTint(0xffdd55));
    btn.on('pointerup', () => this.#onMatchEnded(this.#buildFakeMatchEndedPayload()));
  }

  /**
   * DEV helper: build a winning MatchEndedPayload for the victory-screen test button.
   * Reuses the real roster (NetworkManager.matchPlayers) when present so the results
   * table looks realistic — the local player is forced to MVP on the winning team with
   * TDM_WIN_TARGET kills. Falls back to a minimal solo payload offline (DEV_SKIP_TO_GAMEPLAY).
   */
  #buildFakeMatchEndedPayload(): MatchEndedPayload {
    const nm = this.#safeNetworkManager();
    const localId = nm?.localPlayerId ?? 'dev-local';
    const roster = nm?.matchPlayers ?? [];

    // Local player's team wins; default to team 0 when team is unknown/offline.
    const localTeam = roster.find((p) => p.id === localId)?.team ?? 0;
    const winningTeam = localTeam === 1 ? 1 : 0;

    const stats: TdmPlayerStat[] =
      roster.length > 0
        ? roster.map((p) => {
            const team = p.team === 1 ? 1 : 0;
            const isLocal = p.id === localId;
            const onWinningTeam = team === winningTeam;
            return {
              playerId: p.id,
              name: p.name,
              team,
              // Local player gets the full target (MVP); others get plausible filler.
              kills: isLocal ? CONFIG.TDM_WIN_TARGET : onWinningTeam ? Math.floor(CONFIG.TDM_WIN_TARGET / 3) : 2,
              deaths: isLocal ? 1 : 3,
            };
          })
        : [{ playerId: localId, name: 'YOU', team: winningTeam, kills: CONFIG.TDM_WIN_TARGET, deaths: 1 }];

    const teamScores: [number, number] = [0, 0];
    for (const s of stats) teamScores[s.team] += s.kills;

    return { winningTeam, teamScores, mvpPlayerId: localId, stats };
  }

  #clearLocalDeath(): void {
    this.#deathLockActive = false;
    if (this.#player?.controls) {
      this.#player.controls.isMovementLocked = false;
    }
    this.#deathOverlay?.destroy();
    this.#deathOverlay = undefined;
    this.#deathCountdownText?.destroy();
    this.#deathCountdownText = undefined;
    this.#deathCountdownTimer?.remove(false);
    this.#deathCountdownTimer = undefined;
  }

  // D-04 wall-desync close: remove matching spell from BOTH groups on server broadcast.
  #onSpellDestroyed = (payload: SpellDestroyedPayload): void => {
    const scan = (group: Phaser.GameObjects.Group | undefined): void => {
      if (!group) return;
      group.getChildren().forEach((child) => {
        const sid = (child as Phaser.GameObjects.GameObject).getData('spellId') as string | undefined;
        if (sid !== payload.spellId) return;
        const spell = child as Phaser.GameObjects.GameObject & { explode?: () => void };
        if (typeof spell.explode === 'function') {
          spell.explode();
        } else {
          (child as Phaser.GameObjects.GameObject).destroy();
        }
      });
    };
    scan(this.#remoteSpellGroup);
    scan(this.#player?.spellCastingComponent?.spellGroup);
  };

  // ============================================================
  // Countdown cinematic (LFC-06..09) — server-driven match-start.
  // Triggered by NETWORK_MATCH_STATE_CHANGED + NETWORK_MATCH_COUNTDOWN_TICK.
  // ============================================================

  /**
   * LFC-06..09: branch on the match-state transition. We only react to COUNTDOWN
   * (enter the locked cinematic) and ACTIVE (release locks + hide overlay).
   * LOADING / LOBBY / ENDED here are no-ops — GameScene only ever runs AFTER
   * LoadingScene has already bridged through COUNTDOWN; a stray LOADING here
   * would only be a Phase 12 reconnect scenario, explicitly out of scope.
   */
  #onMatchStateChanged = (payload: MatchStateChangedPayload): void => {
    // Phase 14 bugfix (#1/#2): when the GameScene-local intro is in charge it owns the entire
    // lock/unlock lifecycle. Ignore server COUNTDOWN/ACTIVE here so a late or duplicate transition
    // can't re-enter the cinematic or release the lock before the local 5→1 finishes. (In normal
    // TDM flow these transitions already fired before GameScene subscribed, so this rarely matters.)
    if (this.#localIntroRan) return;
    if (payload.state === 'COUNTDOWN') {
      this.#enterCountdownMode();
    } else if (payload.state === 'ACTIVE') {
      this.#exitCountdownMode();
    }
  };

  /**
   * Phase 14 bugfix (#1/#2): start the GameScene-local match-start intro on boot.
   *
   * ROOT CAUSE: LoadingScene's ~8s cinematic outlasts the server's 5.5s countdown
   * (COUNTDOWN_DURATION_MS + FIGHT_HOLD_MS). The server fires COUNTDOWN → 5 ticks → ACTIVE →
   * match:spawns all WHILE the LoadingScene is still up, so GameScene — born only after that
   * cinematic — never receives any of them. The old server-driven intro (#onMatchStateChanged →
   * #enterCountdownMode) therefore never ran, leaving no banner / no countdown / no spawn snap.
   *
   * FIX: in a connected team-deathmatch, GameScene plays its OWN intro independent of the
   * already-passed server COUNTDOWN — reusing #enterCountdownMode (locks + camera pan + banner +
   * the countdown text object) but driving the digits from a LOCAL 5→1 timer (#runLocalCountdown).
   * It also asks the server to replay the match-start spawns we missed (NetworkManager.sendSceneReady
   * → server `match:scene-ready` → `match:spawns` → #onMatchSpawns snaps us to our team spawnpoint).
   *
   * Scoped to TDM (Arena) per the locked decision; non-TDM online co-op keeps the server-driven path.
   * In TDM there are no in-match room transitions, so create() runs exactly once per match — but
   * #localIntroRan still guards against a re-entrant call.
   */
  #maybeStartLocalIntro(): void {
    if (this.#localIntroRan) return;
    const nm = this.#safeNetworkManager();
    if (!nm || !nm.isConnected || !nm.isTeamDeathmatch) return;
    this.#localIntroRan = true;

    // Lock movement + combat and build the camera pan + map-name banner + countdown text object.
    this.#enterCountdownMode();
    // Drive the 5→1 digits locally, then release the locks + hide the overlay.
    this.#runLocalCountdown();
    // Request a replay of the match-start spawns (the COUNTDOWN→ACTIVE broadcast already elapsed).
    nm.sendSceneReady();
    // Also replay any special-spell pickups that spawned before this GameScene booted (late-boot /
    // mid-match reconnect) — without this, an early pickup is invisible/uncollectable on this client
    // while it lives on everyone else's screen. Idempotent (client dedupes by pickupId).
    nm.sendPickupRequest();
  }

  /**
   * Phase 14 bugfix (#1/#2): the LOCAL countdown driver — a self-contained 5 → 4 → 3 → 2 → 1
   * digit sequence (1s per digit) that replaces the server's countdown-tick broadcasts for the
   * GameScene-local intro. Reuses the same pop-in tween shape as #onCountdownTick. On reaching 0 it
   * calls #exitCountdownMode (release locks + hide overlay + tear down the banner). The timer is
   * stored so SHUTDOWN can cancel an in-flight countdown (rematch / early scene stop).
   */
  #runLocalCountdown(): void {
    let remaining = 5;
    const showDigit = (label: string): void => {
      if (this.#countdownText === null) return;
      this.#countdownText.setText(label);
      this.tweens.add({
        targets: this.#countdownText,
        scale: { from: 1.3, to: 1.0 },
        duration: 250,
        ease: 'Back.easeOut',
      });
    };

    showDigit(String(remaining)); // "5" immediately
    this.#localCountdownTimer?.remove(false);
    this.#localCountdownTimer = this.time.addEvent({
      delay: 1000,
      // Fires 5×: at +1s..+4s shows 4,3,2,1; at +5s (remaining hits 0) ends the intro.
      repeat: 5,
      callback: () => {
        remaining -= 1;
        if (remaining >= 1) {
          showDigit(String(remaining));
        } else {
          this.#localCountdownTimer?.remove(false);
          this.#localCountdownTimer = null;
          this.#exitCountdownMode();
        }
      },
    });
  }

  /**
   * LFC-06 + LFC-07 + LFC-08: lock movement + combat (combat lock gates the two
   * scene-driven spell handlers that bypass isMovementLocked — FireBreath and
   * EarthWall), snap the camera to 0.6x and animate back to the play zoom (1.0x)
   * over 3 s, lazily create the centered overlay text and clear it until the
   * first tick arrives.
   *
   * IMPORTANT: the zoomed-out value is set ONLY here, never in #setupCamera —
   * a late-joiner that misses the COUNTDOWN broadcast (Phase 12 scope) must see
   * the play zoom by default, not a permanent zoom-out.
   */
  #enterCountdownMode(): void {
    this.#controls.isMovementLocked = true;
    this.#combatLocked = true;

    // Defensive velocity zero — without this, the player would visually keep
    // gliding for one frame after the lock if they were holding WASD.
    if (this.#player?.body) {
      (this.#player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }

    // Phase 14 (D-18 steps 2-5 / D-20): EXTEND the old snap-out→zoom-in into the full
    // intro cinematic — wide establishing shot at map center → hold → pan to the local
    // player → zoom in to play distance → emit HUD_REVEAL. The zoomed-OUT value lives
    // ONLY here (never in #setupCamera) so a late-joiner that misses COUNTDOWN defaults
    // to play zoom (existing late-joiner safety rule).
    this.#playIntroCameraSequence();

    // Phase 14 (D-18 step 1 / D-19): reveal the map-name banner. Its reveal duration
    // scales to the name length so long names always finish before teardown.
    this.#showMapBanner();

    // LFC-08: lazily create the overlay. Single Text with setScrollFactor(0)
    // anchors it to the viewport (immune to camera pan/zoom) and setDepth(1000)
    // keeps it above the world. Text starts empty — the first inbound tick fills it.
    if (this.#countdownText === null) {
      const cam = this.cameras.main;
      const centerX = cam.width / 2;
      const centerY = cam.height / 2;
      this.#countdownText = this.add
        .bitmapText(centerX, centerY, 'press_start_2p', '', 32)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1000)
        .setTint(0xffdd55);
    }
    this.#countdownText.setVisible(true).setText('');
  }

  /**
   * LFC-09: release both locks and hide the overlay at the moment of the
   * ACTIVE broadcast. The text object is kept (not destroyed) so a future
   * rematch cycle re-uses it — GameScene's SHUTDOWN flow tears it down with
   * the rest of the scene anyway.
   */
  #exitCountdownMode(): void {
    this.#controls.isMovementLocked = false;
    this.#combatLocked = false;
    this.#countdownText?.setVisible(false);
    // Phase 14: if the match transitions to ACTIVE before the cinematic finished,
    // cancel any in-flight banner reveal/fade so it doesn't linger over gameplay.
    this.#destroyMapBanner();
  }

  /**
   * LFC-08: the overlay text is driven 100% by inbound server ticks. NO
   * client-side setInterval / time.delayedCall — server is authoritative for
   * the digit progression. Defensive early-return if the text wasn't created
   * yet (state-changed COUNTDOWN should have created it first, but a coalesced
   * frame could theoretically deliver the tick before our handler runs).
   */
  #onCountdownTick = (payload: MatchCountdownTickPayload): void => {
    // Phase 14 bugfix (#1/#2): the GameScene-local countdown owns the digits when the local intro
    // is running; ignore any (stray/late) server tick so it can't fight the local 5→1.
    if (this.#localIntroRan) return;
    if (this.#countdownText === null) return;
    this.#countdownText.setText(payload.label);
    // Juice: one-shot pop-in scale tween — mirrors the room-transition tween shape.
    this.tweens.add({
      targets: this.#countdownText,
      scale: { from: 1.3, to: 1.0 },
      duration: 250,
      ease: 'Back.easeOut',
    });
  };

  /**
   * Phase 14 (D-18 steps 2-5 / D-20): the TDM intro camera cinematic.
   *
   * Sequence (exact values are discretion within the UI-SPEC ranges):
   *   1. Wide establishing: setZoom(outZoom) + centerOn(map center). The map/room
   *      center is derived from the current room bounds (mirrors #setupCamera).
   *   2. Hold ~400ms, then pan map-center → local player (Sine.easeInOut).
   *   3. On pan completion, zoom in to play zoom (Cubic.easeOut).
   *   4. On zoom completion, re-attach startFollow(player) and emit HUD_REVEAL so the
   *      UiScene fades its HUD in (UiScene side wired in Plan 04).
   *
   * The camera is following the player from #setupCamera, so stopFollow() first —
   * pan() cannot scroll while a follow target is active.
   */
  #playIntroCameraSequence(): void {
    const OUT_ZOOM = 0.6; // wide establishing (reuse the existing snap-out value)
    const PLAY_ZOOM = 1.0;
    const CENTER_HOLD_MS = 400;   // wide-shot hold before the move
    const MOVE_MS = 1100;         // pan + zoom run TOGETHER over this duration

    const cam = this.cameras.main;
    cam.stopFollow();
    cam.setZoom(OUT_ZOOM);

    // Map/room center: #setupCamera sets bounds to
    // (roomSize.x, roomSize.y - roomSize.height, roomSize.width, roomSize.height),
    // so the center of those bounds is the wide establishing target.
    const roomSize = this.#objectsByRoomId[this.#levelData.roomId].room;
    const mapCenterX = roomSize.x + roomSize.width / 2;
    const mapCenterY = roomSize.y - roomSize.height / 2;
    cam.centerOn(mapCenterX, mapCenterY);

    // Hold the wide shot, then move in. The player is ALREADY at its deterministic team spawn
    // (#setupPlayer + pickStartSpawn), so the move targets the real spot — no network wait.
    //
    // CAMERA-JUMP FIX: pan and zoom run as ONE concurrent move ending at PLAY_ZOOM centered on the
    // player. Previously the pan ran at OUT_ZOOM then zoom ran after — but bounds-clamping at a
    // wide zoom lands the camera at a DIFFERENT scroll than the follow camera uses at play zoom, so
    // startFollow snapped (the "abrupt teleport to the player"). By zooming to PLAY_ZOOM during the
    // pan, the move ends exactly where startFollow rests (same zoom → same bounds clamp) → seamless.
    // Edge spawns near a bound (e.g. x=104 with a 480-wide viewport) simply settle off-centre, which
    // is correct: a bounded camera cannot put an edge target dead-centre, and now there's no jump.
    this.time.delayedCall(CENTER_HOLD_MS, () => {
      // Defensive: the scene may have shut down (match end / rematch) during the 400ms hold. Bail if
      // the player or camera is gone so we never pan/follow a destroyed object.
      if (!this.#player || !this.#player.active || !this.cameras?.main) return;
      const targetX = this.#player.x;
      const targetY = this.#player.y;
      // Zoom and pan concurrently, same duration, so the move ends at PLAY_ZOOM centered on the player.
      this.cameras.main.zoomTo(PLAY_ZOOM, MOVE_MS, 'Sine.easeInOut');
      this.cameras.main.pan(targetX, targetY, MOVE_MS, 'Sine.easeInOut', false, (_cam, progress) => {
        if (progress < 1) return; // pan callback fires every frame; act only on completion
        if (!this.#player || !this.#player.active || !this.cameras?.main) return; // scene torn down mid-pan
        // DETERMINISTIC END STATE: Phaser updates panEffect BEFORE zoomEffect in the same frame
        // (Camera.update order), so the pan's final centerOn can run a frame before zoom reaches
        // PLAY_ZOOM exactly. Rather than depend on that ordering, pin the end state explicitly here:
        // force the final zoom + recenter on the player, THEN startFollow. Now the camera is provably
        // at the follow resting position (same zoom → same bounds clamp), so follow attaches with no
        // snap — independent of effect-update ordering or sub-pixel eased-zoom residue.
        this.cameras.main.setZoom(PLAY_ZOOM);
        this.cameras.main.centerOn(this.#player.x, this.#player.y);
        this.cameras.main.startFollow(this.#player);
        // Reveal the HUD (UiScene fades #hudContainer in — Plan 04).
        EVENT_BUS.emit(CUSTOM_EVENTS.HUD_REVEAL);
      });
    });
  }

  /**
   * Phase 14 (D-18 step 1 / D-19): the TDM intro map-name banner.
   *
   * D-19 ROOT CAUSE: the banner historically "cut its last letters" because the
   * typewriter reveal animation was too SHORT to finish before teardown — NOT a
   * container-width / origin / mask clip. The fix is purely a TIMING one: the reveal
   * DURATION is scaled to the name's character count (BANNER_MS_PER_CHAR * name.length,
   * clamped) and the fade-out (teardown) only begins from the reveal tween's onComplete,
   * so long names always render every glyph before disappearing.
   *
   * The display name is derived from #levelData.level (WORLD / DUNGEON_1 / STAGES) —
   * the only map identity GameScene knows — uppercased with underscores → spaces, matching
   * the UI-SPEC copy contract (WORLD / DUNGEON 1 / STAGES).
   */
  #showMapBanner(): void {
    // Tunables (D-19) — per-char reveal pacing with a clamp so the reveal never runs
    // too short (cuts letters) nor too long (overstays the cinematic window).
    // Phase 14 bugfix (TDM playtest #5): the reveal read as "too short". Slowed the typewriter
    // (120 ms/char vs 70), raised the floor (1100 ms vs 600), and lengthened the hold (900 ms vs
    // 500) so the map name lands as a deliberate match-start beat. Still well within the server's
    // 5500 ms COUNTDOWN window (worst case "DUNGEON 1" = 9 chars → 1100 ms reveal + 900 hold +
    // 350 fade ≈ 2.35 s, leaving the 5..1 digits room to play under it).
    // Slowed further (user: "finishing too fast"). For "ARENA" (5 chars): 5×260=1300 → floored to
    // 1800 ms reveal + 1400 ms hold + 400 fade ≈ 3.6 s — still inside the 5500 ms COUNTDOWN window.
    const BANNER_MS_PER_CHAR = 260;
    const BANNER_MIN_MS = 1800;
    const BANNER_MAX_MS = 3200;
    const BANNER_HOLD_MS = 1400; // hold after the reveal before the fade-out
    const BANNER_FADE_MS = 400;

    const name = this.#levelData.level.replace(/_/g, ' ').toUpperCase();

    // Tear down any stale banner from a previous COUNTDOWN cycle before re-creating.
    this.#destroyMapBanner();

    const cam = this.cameras.main;
    const centerX = cam.width / 2;
    // Upper third (y ≈ 90), must not overlap the centered countdown digit at y = height/2.
    const bannerY = 90;

    // 32px press_start_2p Display, gold to match the countdown digit. setScrollFactor(0)
    // anchors it to the viewport (immune to the cinematic camera pan/zoom); depth 1000
    // keeps it above the world. Start empty — the typewriter fills it.
    this.#mapBanner = this.add
      .bitmapText(centerX, bannerY, 'press_start_2p', '', 32)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setTint(0xffdd55);

    // D-19 FIX: reveal duration scales to name.length, clamped to [600, 2000] ms.
    const revealMs = Phaser.Math.Clamp(BANNER_MS_PER_CHAR * name.length, BANNER_MIN_MS, BANNER_MAX_MS);

    this.#mapBannerRevealTween = this.tweens.addCounter({
      from: 0,
      to: name.length,
      duration: revealMs,
      ease: 'Linear',
      onUpdate: (tw) => {
        if (this.#mapBanner === null) return;
        this.#mapBanner.setText(name.slice(0, Math.round(tw.getValue())));
      },
      onComplete: () => {
        this.#mapBannerRevealTween = null;
        if (this.#mapBanner === null) return;
        // Ensure the full name is shown before fading (guards against rounding).
        this.#mapBanner.setText(name);
        // Teardown begins ONLY now (after the reveal completes) so long names never
        // get cut: hold briefly, then fade alpha 1 → 0 and destroy.
        this.#mapBannerFadeTween = this.tweens.add({
          targets: this.#mapBanner,
          alpha: { from: 1, to: 0 },
          duration: BANNER_FADE_MS,
          delay: BANNER_HOLD_MS,
          onComplete: () => {
            this.#mapBannerFadeTween = null;
            this.#destroyMapBanner();
          },
        });
      },
    });
  }

  /**
   * Phase 14: force-teardown of the intro banner + its tweens. Idempotent — safe to call
   * from the fade onComplete, from #exitCountdownMode (early ACTIVE transition), and from
   * SHUTDOWN so a scene restart never leaks the banner or a live reveal/fade tween.
   */
  #destroyMapBanner(): void {
    this.#mapBannerRevealTween?.stop();
    this.#mapBannerRevealTween = null;
    this.#mapBannerFadeTween?.stop();
    this.#mapBannerFadeTween = null;
    this.#mapBanner?.destroy();
    this.#mapBanner = null;
  }

  #registerCustomEvents(): void {
    EVENT_BUS.on(CUSTOM_EVENTS.OPENED_CHEST, this.#handleOpenChest, this);
    EVENT_BUS.on(CUSTOM_EVENTS.ENEMY_DESTROYED, this.#checkForAllEnemiesAreDefeated, this);
    EVENT_BUS.on(CUSTOM_EVENTS.PLAYER_DEFEATED, this.#handlePlayerDefeatedEvent, this);
    EVENT_BUS.on(CUSTOM_EVENTS.DIALOG_CLOSED, this.#handleDialogClosed, this);
    EVENT_BUS.on(CUSTOM_EVENTS.BOSS_DEFEATED, this.#handleBossDefeated, this);
    EVENT_BUS.on(CUSTOM_EVENTS.DEBUG_SPAWN_FLYING_OBELISK, this.#spawnDebugFlyingObelisk, this);
    EVENT_BUS.on(CUSTOM_EVENTS.DEBUG_SPAWN_LAVA_PUDDLE, this.#spawnDebugLavaPuddle, this);
    // Match FSM + server-driven countdown ticks (LFC-06..09)
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_COUNTDOWN_TICK, this.#onCountdownTick, this);
    // Phase 9.3 (Plan 03) — host-authoritative damage + elimination + respawn + spell-destroy.
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_DAMAGE_CONFIRMED, this.#onDamageConfirmed, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_SPELL_DESTROYED, this.#onSpellDestroyed, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_ELIMINATION, this.#onElimination, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_RESPAWN, this.#onRespawn, this);
    // Phase 14 bugfix (TDM playtest #4): match-start team spawn assignments.
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_SPAWNS, this.#onMatchSpawns, this);
    // Special-spell pickups — server-driven spawn + collect.
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_PICKUP_SPAWNED, this.#onPickupSpawned, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_PICKUP_COLLECTED, this.#onPickupCollected, this);
    // Phase 14 (Plan 04, D-06/D-08): launch the minimal results overlay on match ENDED.
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_ENDED, this.#onMatchEnded, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.OPENED_CHEST, this.#handleOpenChest, this);
      EVENT_BUS.off(CUSTOM_EVENTS.ENEMY_DESTROYED, this.#checkForAllEnemiesAreDefeated, this);
      EVENT_BUS.off(CUSTOM_EVENTS.PLAYER_DEFEATED, this.#handlePlayerDefeatedEvent, this);
      EVENT_BUS.off(CUSTOM_EVENTS.DIALOG_CLOSED, this.#handleDialogClosed, this);
      EVENT_BUS.off(CUSTOM_EVENTS.BOSS_DEFEATED, this.#handleBossDefeated, this);
      EVENT_BUS.off(CUSTOM_EVENTS.DEBUG_SPAWN_FLYING_OBELISK, this.#spawnDebugFlyingObelisk, this);
      EVENT_BUS.off(CUSTOM_EVENTS.DEBUG_SPAWN_LAVA_PUDDLE, this.#spawnDebugLavaPuddle, this);
      // Match FSM + countdown listener cleanup (LFC-06..09)
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_COUNTDOWN_TICK, this.#onCountdownTick, this);
      // Phase 9.3 (Plan 03) — damage / elimination / respawn / spell-destroy cleanup.
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DAMAGE_CONFIRMED, this.#onDamageConfirmed, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_SPELL_DESTROYED, this.#onSpellDestroyed, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_ELIMINATION, this.#onElimination, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_RESPAWN, this.#onRespawn, this);
      // Phase 14 bugfix (TDM playtest #4): match-start spawn listener cleanup.
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_SPAWNS, this.#onMatchSpawns, this);
      // Special-spell pickups listener cleanup.
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_PICKUP_SPAWNED, this.#onPickupSpawned, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_PICKUP_COLLECTED, this.#onPickupCollected, this);
      // Phase 14 (Plan 04): results-overlay launcher cleanup.
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_ENDED, this.#onMatchEnded, this);
      this.#appliedDamageSpellIds.clear();
      this.#deadPlayerIds.clear();
      this.#disconnectedPlayerIds.clear();
      this.#pickups.forEach((p) => p.destroy());
      this.#pickups.clear();
      this.#clearLocalDeath();
      // Phase 14 bugfix (#1/#2): cancel an in-flight local countdown so its timer never fires
      // against a torn-down scene (rematch / early stop).
      this.#localCountdownTimer?.remove(false);
      this.#localCountdownTimer = null;
      // Phase 14: tear down the intro banner + its reveal/fade tweens on scene restart.
      this.#destroyMapBanner();
      // Phase 14: stop the respawn-invuln pulse so the looping tween never leaks across
      // scene restarts (cross-level room transitions restart GameScene).
      this.#stopInvulnBlink();
      this.#fireBreathDamageTimer?.destroy();
      this.#activeFireBreath?.destroy();
      // Cleanup network listeners and remote players
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_ROOM_TRANSITION, this.#onNetworkRoomTransition, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_PLAYER_UPDATE, this.#onRemotePlayerUpdate, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_SPELL_CAST, this.#onRemoteSpellCast, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_BREATH_START, this.#onRemoteBreathStart, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_BREATH_UPDATE, this.#onRemoteBreathUpdate, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_BREATH_END, this.#onRemoteBreathEnd, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_EARTH_WALL_PILLAR, this.#onRemoteEarthWallPillar, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_EARTH_WALL_PILLAR_DESTROY, this.#onRemoteEarthWallPillarDestroy, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_BEAM_UPDATE, this.#onRemoteBeamUpdate, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_BEAM_END, this.#onRemoteBeamEnd, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_PLAYER_DISCONNECTED, this.#onRemotePlayerDisconnected, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MESH_PARTIAL, this.#onMeshPartial, this);
      EVENT_BUS.off(CUSTOM_EVENTS.SPELL_CAST, this.#onLocalSpellCast, this);
      // IMPORTANT: do NOT call nm.teardownMesh() here. SHUTDOWN fires every time the
      // scene restarts for a cross-level room transition (via #onNetworkRoomTransition
      // → this.scene.start(GAME_SCENE)). Tearing down the mesh on every transition
      // closes every peer connection — all four clients see channel-close as soon as
      // one player walks through a door, breaking multiplayer entirely.
      // The mesh should only be torn down on actual match end / return-to-lobby, which
      // is owned by GameOverScene / LobbyScene, not this scene's lifecycle.
      try { NetworkManager.getInstance().stopGameTick(); } catch { /* offline */ }
      this.#remotePlayers.forEach((p) => p.destroy());
      this.#remotePlayers.clear();
      this.#remoteFireBreaths.forEach((b) => { if (b.active) b.destroy(); });
      this.#remoteFireBreaths.clear();
      // Note: #earthWallGroup is a Phaser.GameObjects.Group that registers its own
      // SHUTDOWN listener (before ours) and calls destroy() on itself, setting
      // this.children to undefined. Calling clear() here would crash. Phaser already
      // cleans up the group and its EarthWallPillar children via scene lifecycle.

      // Do NOT switch to menu music here. The scene shuts down on every cross-level
      // room transition (which restarts GameScene), and switching to menu here meant
      // the next GameScene.create() re-called playGameplay() → music restarted from
      // the beginning every time you left a dungeon. Destinations that actually want
      // menu music (GameOverScene, MainMenuScene) call playMenu() themselves.
    });
  }

  /** Debug-panel hook: drop a lava puddle at the current cursor world
   *  position. Uses the same Puddle.spawnOrMerge path as the molten EarthBolt
   *  combo so the puddle picks up all PUDDLE_LAVA_* tunables (size, tints,
   *  bubble cadence, embers, body fraction, etc.). Merges into a nearby
   *  existing lava puddle if there is one. */
  #spawnDebugLavaPuddle(): void {
    if (!this.#controls) return;
    const x = this.#controls.mouseWorldX;
    const y = this.#controls.mouseWorldY;
    Puddle.spawnOrMerge(this, x, y, CONFIG.MOLTEN_BOLT_LAVA_PUDDLE_AMOUNT, undefined, 'lava');
  }

  #spawnDebugFlyingObelisk(): void {
    if (!this.#player?.active) {
      return;
    }

    const spawnX = this.#controls.mouseWorldX;
    const spawnY = this.#controls.mouseWorldY;
    const obelisk = this.add
      .image(spawnX, spawnY, ASSET_KEYS.FLYING_OBELISK)
      .setDepth(3)
      .setScale(0.45)
      .setName('debug-flying-obelisk');

    this.#debugFlyingObeliskGroup.add(obelisk);

    this.tweens.add({
      targets: obelisk,
      y: obelisk.y - 6,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  #handleOpenChest(chest: Chest): void {
    // update data manager so we can persist chest state
    DataManager.instance.updateChestData(this.#currentRoomId, chest.id, true, true);

    if (chest.contents !== CHEST_REWARD.NOTHING) {
      // updated game inventory
      InventoryManager.instance.addDungeonItem(this.#levelData.level, chest.contents);
    }

    // show reward from chest
    this.#rewardItem
      .setFrame(CHEST_REWARD_TO_TEXTURE_FRAME[chest.contents])
      .setVisible(true)
      .setPosition(chest.x, chest.y);

    this.tweens.add({
      targets: this.#rewardItem,
      y: this.#rewardItem.y - 16,
      duration: 500,
      onComplete: () => {
        EVENT_BUS.emit(CUSTOM_EVENTS.SHOW_DIALOG, CHEST_REWARD_TO_DIALOG_MAP[chest.contents]);
        this.scene.pause();
      },
    });
  }

  #createLevel(): void {
    const level = this.#levelData.level;
    // STAGES renders its own multi-tileset visuals; WORLD/DUNGEON_1 use pre-baked BG/FG PNGs.
    const hasPrebakedBgFg = level !== 'STAGES';
    if (hasPrebakedBgFg) {
      // create main background
      this.add.image(0, 0, ASSET_KEYS[`${level}_BACKGROUND`], 0).setOrigin(0);
      // create main foreground
      this.add.image(0, 0, ASSET_KEYS[`${level}_FOREGROUND`], 0).setOrigin(0).setDepth(2);
    }

    // create tilemap from Tiled json data
    const map = this.make.tilemap({
      key: ASSET_KEYS[`${level}_LEVEL`],
    });

    // The first parameter is the name of the tileset in Tiled and the second parameter is the key
    // of the tileset image used when loading the file in preload.
    // STAGES embeds its collision marker in its own 32-px tileset (STAGES_COLLISION) so the
    // collision data lines up with the 32-px tile grid the visible layers use.
    const collisionAssetKey = level === 'STAGES' ? ASSET_KEYS.STAGES_COLLISION : ASSET_KEYS.COLLISION;
    const collisionTiles = map.addTilesetImage(TILED_TILESET_NAMES.COLLISION, collisionAssetKey);
    if (collisionTiles === null) {
      console.log(`encountered error while creating collision tiles from tiled`);
      return;
    }

    // STAGES: register the 6 decoration tilesets and render the 6 visible tile layers
    // (Base / Shadows / Props / Foreground / Structure / Trees) at increasing depth so
    // tree canopies / structures stay above gameplay objects.
    if (level === 'STAGES') {
      const stagesTilesets: Phaser.Tilemaps.Tileset[] = [];
      const addStagesTileset = (tiledName: string, assetKey: string): void => {
        const ts = map.addTilesetImage(tiledName, assetKey);
        if (ts !== null) stagesTilesets.push(ts);
        else console.warn(`STAGES: failed to add tileset ${tiledName}`);
      };
      addStagesTileset('TX Plant',         ASSET_KEYS.STAGES_TX_PLANT);
      addStagesTileset('TX Tileset Grass', ASSET_KEYS.STAGES_TX_TILESET_GRASS);
      addStagesTileset('TX Shadow Plant',  ASSET_KEYS.STAGES_TX_SHADOW_PLANT);
      addStagesTileset('TX Tileset Wall',  ASSET_KEYS.STAGES_TX_TILESET_WALL);
      addStagesTileset('TX Struct',        ASSET_KEYS.STAGES_TX_STRUCT);
      addStagesTileset('TX Props',         ASSET_KEYS.STAGES_TX_PROPS);

      // Render the visible tile layers in TMX paint order. Tree canopies and the
      // foreground layer use a very high depth so they always render above the
      // y-sorted character sprites (CharacterGameObject sets depth = this.y on
      // every update, capping at ~MAP_HEIGHT*TILE_SIZE = 1088). Without this,
      // the player and spells "walk over" tree leaves like rugs.
      const CANOPY_DEPTH = 10000;
      const STAGES_VISIBLE_LAYERS: { name: string; depth: number }[] = [
        { name: 'Base',       depth: 0 },
        { name: 'Shadows',    depth: 0 },
        { name: 'Props',      depth: 0 },
        { name: 'Structure',  depth: 0 },
        { name: 'Trees',      depth: CANOPY_DEPTH },
        { name: 'Foreground', depth: CANOPY_DEPTH + 1 },
      ];
      for (const { name, depth } of STAGES_VISIBLE_LAYERS) {
        const layer = map.createLayer(name, stagesTilesets, 0, 0);
        if (layer === null) {
          console.warn(`STAGES: failed to create layer ${name}`);
          continue;
        }
        layer.setDepth(depth);
      }
    }

    const collisionLayer = map.createLayer(TILED_LAYER_NAMES.COLLISION, collisionTiles, 0, 0);
    if (collisionLayer === null) {
      console.log(`encountered error while creating collision layer using data from tiled`);
      return;
    }
    this.#collisionLayer = collisionLayer;
    this.#collisionLayer.setDepth(2).setAlpha(CONFIG.DEBUG_COLLISION_ALPHA);

    const enemyCollisionLayer = map.createLayer(TILED_LAYER_NAMES.ENEMY_COLLISION, collisionTiles, 0, 0);
    if (enemyCollisionLayer === null) {
      console.log(`encountered error while creating enemy collision layer using data from tiled`);
      return;
    }
    this.#enemyCollisionLayer = enemyCollisionLayer;
    this.#enemyCollisionLayer.setDepth(2).setVisible(false);

    // STAGES: build static colliders from the `colliders` object layer (one
    // rect per polygon shape painted by the .tsx tilesets, plus 4 border walls
    // around the playable area so the player can't walk into the void).
    // Replaces the cell-granular tile collision that made every tree look like
    // it had a 32×32 hitbox even when the trunk polygon was 16×24.
    this.#staticCollidersGroup = this.physics.add.staticGroup();
    if (level === 'STAGES') {
      const collidersLayer = map.getObjectLayer('colliders');
      if (collidersLayer !== null) {
        for (const obj of collidersLayer.objects) {
          const w = obj.width ?? 0;
          const h = obj.height ?? 0;
          if (w <= 0 || h <= 0) continue;
          const ox = obj.x ?? 0;
          const oy = obj.y ?? 0;
          // Rectangle origin is centre by default — offset so (ox, oy) ends up
          // at the top-left, matching the Tiled JSON convention for rect objects.
          const rect = this.add.rectangle(ox + w / 2, oy + h / 2, w, h, 0xff0000, CONFIG.DEBUG_COLLISION_ALPHA);
          rect.setDepth(2);
          this.physics.add.existing(rect, true);
          this.#staticCollidersGroup.add(rect);
        }
      } else {
        console.warn('STAGES: `colliders` object layer missing from map.json');
      }
    }

    // initialize objects
    this.#objectsByRoomId = {};
    this.#doorTransitionGroup = this.add.group([]);
    this.#blockingGroup = this.add.group([]);
    this.#lockedDoorGroup = this.add.group([]);
    this.#switchGroup = this.add.group([]);

    // create game objects
    this.#createRooms(map, TILED_LAYER_NAMES.ROOMS);

    const rooms = getAllLayerNamesWithPrefix(map, TILED_LAYER_NAMES.ROOMS).map((layerName: string) => {
      return {
        name: layerName,
        roomId: parseInt(layerName.split('/')[1], 10),
      };
    });
    const switchLayerNames = rooms.filter((layer) => layer.name.endsWith(`/${TILED_LAYER_NAMES.SWITCHES}`));
    const potLayerNames = rooms.filter((layer) => layer.name.endsWith(`/${TILED_LAYER_NAMES.POTS}`));
    const doorLayerNames = rooms.filter((layer) => layer.name.endsWith(`/${TILED_LAYER_NAMES.DOORS}`));
    const chestLayerNames = rooms.filter((layer) => layer.name.endsWith(`/${TILED_LAYER_NAMES.CHESTS}`));
    const enemyLayerNames = rooms.filter((layer) => layer.name.endsWith(`/${TILED_LAYER_NAMES.ENEMIES}`));

    doorLayerNames.forEach((layer) => this.#createDoors(map, layer.name, layer.roomId));
    switchLayerNames.forEach((layer) => this.#createButtons(map, layer.name, layer.roomId));
    potLayerNames.forEach((layer) => this.#createPots(map, layer.name, layer.roomId));
    chestLayerNames.forEach((layer) => this.#createChests(map, layer.name, layer.roomId));
    enemyLayerNames.forEach((layer) => this.#createEnemies(map, layer.name, layer.roomId));
  }

  #setupCamera(): void {
    // updates for camera to stay with level
    const roomSize = this.#objectsByRoomId[this.#levelData.roomId].room;
    this.cameras.main.setBounds(roomSize.x, roomSize.y - roomSize.height, roomSize.width, roomSize.height);
    this.cameras.main.startFollow(this.#player);
  }

  #setupPlayer(): void {
    const startingDoor = this.#objectsByRoomId[this.#levelData.roomId].doorMap[this.#levelData.doorId];
    const playerStartPosition = {
      x: startingDoor.x + startingDoor.doorTransitionZone.width / 2,
      y: startingDoor.y - startingDoor.doorTransitionZone.height / 2,
    };
    switch (startingDoor.direction) {
      case DIRECTION.UP:
        playerStartPosition.y += 40;
        break;
      case DIRECTION.DOWN:
        playerStartPosition.y -= 40;
        break;
      case DIRECTION.LEFT:
        playerStartPosition.x += 40;
        break;
      case DIRECTION.RIGHT:
        playerStartPosition.x -= 40;
        break;
      default:
        exhaustiveGuard(startingDoor.direction);
    }

    // Spawn-teleport fix: derive the local player's TEAM spawnpoint client-side so they APPEAR at it,
    // instead of being created at the door/center and then snapped by the later match:spawns broadcast
    // (the ~8s intro outlasts the 5.5s countdown, so that snap always landed after create() → visible
    // teleport). matchPlayers (with team) + localPlayerId are populated at lobby:started, before create().
    // The #onMatchSpawns server snap still runs as authority — now a no-op (same position). Offline play
    // keeps the door fallback.
    try {
      const nmSpawn = NetworkManager.getInstance();
      const me = nmSpawn.matchPlayers?.find((p) => p.id === nmSpawn.localPlayerId);
      if (me) {
        // DETERMINISTIC match-start spawn, computed with the SAME rule the server uses
        // (GameRoom.pickStartSpawn). Because client + server agree, the player APPEARS at the
        // correct team spawn immediately and the later #onMatchSpawns snap is a no-op (same spot) —
        // no match-start teleport, regardless of round-trip latency. Respawns stay random (server).
        const spawn = pickStartSpawn(me.id, me.team, nmSpawn.matchPlayers, this.#levelData.level);
        if (spawn) {
          playerStartPosition.x = spawn.x;
          playerStartPosition.y = spawn.y;
        }
      }
    } catch { /* offline / no NetworkManager — keep the door position */ }

    this.#player = new Player({
      scene: this,
      position: { x: playerStartPosition.x, y: playerStartPosition.y },
      controls: this.#controls,
      maxLife: CONFIG.PLAYER_START_MAX_HEALTH,
      currentLife: CONFIG.PLAYER_START_MAX_HEALTH,
    });

    // Phase 9.3 (Plan 03): tag the local player with its network playerId so cross-player
    // overlap callbacks can reverse-lookup. Defensive try/catch — offline play has no NM.
    try {
      const nm = NetworkManager.getInstance();
      const localId = nm.localPlayerId;
      if (localId) {
        this.#player.setData('playerId', localId);
        // Phase 14 bugfix (#4): tint the LOCAL player with its team color too (previously only
        // remotes were tinted, so you could never see your own team color in the world). TDM-only
        // so offline/PvE play keeps the default sprite.
        if (nm.isTeamDeathmatch) this.#applyTeamTint(this.#player, localId);
      }
    } catch {
      /* offline */
    }

    // NOTE: the default VoidOrb/DarkBolt arena pickups were removed — special spells now spawn at
    // random map locations during the match (server-authoritative NetworkedSpecialPickup). The local
    // #spawnVoidOrbPickup / #spawnDarkBoltPickup helpers remain for any future per-room Tiled use.

    // Star Shield: always-available special. If the player has nothing else
    // equipped, seed the slot with 1 charge so R can cast immediately. After
    // each cast the slot self-clears (charges → 0); the post-cast hook in
    // #handleSpecialCastInput re-grants 1 more so the shield stays infinite.
    if (SpecialSpellInventory.instance.activeSpellId === null) {
      SpecialSpellInventory.instance.setActive(SPELL_ID.STAR_SHIELD, 1);
    }
  }

  /** Dispatch table for "what happens when a DarkBolt touches X". Called by
   *  several physics.add.overlap pairings registered in #registerColliders;
   *  one of the two objects passed in is the DarkBolt, the other is the
   *  target. Per-target behaviour:
   *
   *   - DarkBolt + DarkBolt: skip (don't consume self).
   *   - AOE-centre spells (FireArea, WaterTornado, WaterSpike): wait until
   *     the bolt centre is within DARK_BOLT_CONSUME_CENTER_RADIUS_PX of the
   *     spell centre before destroying — edge-grazing shouldn't pop a whole
   *     tornado out of existence.
   *   - Lightning effects (ThunderStrike, LightningBeam, lightning combos):
   *     delay the destroy by DARK_BOLT_LIGHTNING_LINGER_MS so the bolt
   *     visually "consumes" the lightning. The bolt's depth (DARK_BOLT_DEPTH)
   *     is already above these so it renders on top during the linger.
   *   - Everything else: immediate destroy on first touch.
   *
   *  The setData('darkBoltConsumed') tag dedupes per-target so a single bolt
   *  doesn't retrigger the destroy each overlap frame while continuing to
   *  touch the (still-active) spell during its linger / centre approach.
   */
  #tryConsumeWithDarkBolt(
    a: Phaser.GameObjects.GameObject,
    b: Phaser.GameObjects.GameObject,
  ): void {
    let bolt: DarkBolt;
    let target: Phaser.GameObjects.GameObject;
    if (a instanceof DarkBolt && !(b instanceof DarkBolt)) {
      bolt = a; target = b;
    } else if (b instanceof DarkBolt && !(a instanceof DarkBolt)) {
      bolt = b; target = a;
    } else {
      return; // both DarkBolts, or neither — nothing to consume
    }
    if (!bolt.active || !target.active) return;
    if (target.getData('darkBoltConsumed')) return;

    // Centre-touch gate for area spells — wait until the bolt is sitting in
    // the middle of the target before erasing it. Without this, the bolt
    // pops a tornado the moment it grazes the perimeter, which reads as the
    // tornado randomly vanishing.
    if (
      target instanceof FireArea ||
      target instanceof WaterTornado ||
      target instanceof WaterSpike
    ) {
      const ts = target as Phaser.GameObjects.Sprite;
      const dist = Math.hypot(bolt.x - ts.x, bolt.y - ts.y);
      if (dist > CONFIG.DARK_BOLT_CONSUME_CENTER_RADIUS_PX) return;
      target.setData('darkBoltConsumed', true);
      (target as { destroy?: () => void }).destroy?.();
      return;
    }

    // Lightning effects — delay destroy so the bolt visibly parks on top.
    if (
      target instanceof ThunderStrike ||
      target instanceof LightningBeam ||
      target instanceof LightningBurstCombo ||
      target instanceof LightningStrikeCombo
    ) {
      target.setData('darkBoltConsumed', true);
      this.time.delayedCall(CONFIG.DARK_BOLT_LIGHTNING_LINGER_MS, () => {
        if (target.active) (target as { destroy?: () => void }).destroy?.();
      });
      return;
    }

    // Everything else (FireBolt, EarthBolt, EarthBump, EarthWallPillar,
    // IceShard, WindBolt, AirBurst, WaterBall, Puddle, ThunderSplash,
    // SteamBurst, …) — immediate erasure.
    target.setData('darkBoltConsumed', true);
    (target as { destroy?: () => void }).destroy?.();
  }

  /** DarkBolt + puddles: per-frame sweep that erases any puddle a DarkBolt
   *  overlaps. Puddles aren't in spellGroup unless electrified (see
   *  puddle.ts), so the physics.add.overlap registrations in
   *  #registerColliders don't catch them — this update method covers the
   *  gap. Snapshots Puddle.all before iterating because puddle.destroy()
   *  mutates the static set and would invalidate the iterator. */
  #updateDarkBoltConsumePuddles(): void {
    if (Puddle.all.size === 0) return;
    const localChildren = this.#player?.spellCastingComponent?.spellGroup?.getChildren() ?? [];
    const remoteChildren = this.#remoteSpellGroup.getChildren();
    const bolts: DarkBolt[] = [];
    for (const c of localChildren) if (c instanceof DarkBolt && c.active) bolts.push(c);
    for (const c of remoteChildren) if (c instanceof DarkBolt && c.active) bolts.push(c);
    if (bolts.length === 0) return;

    const puddleSnapshot: Puddle[] = [];
    for (const p of Puddle.all) if (p.active && !p.getData('darkBoltConsumed')) puddleSnapshot.push(p);

    for (const puddle of puddleSnapshot) {
      if (!puddle.active) continue;
      for (const bolt of bolts) {
        if (!bolt.active) continue;
        if (!this.physics.overlap(bolt, puddle)) continue;
        // Same dispatch as the spellGroup overlaps — puddles fall into the
        // "everything else" bucket so they erase on first touch.
        puddle.setData('darkBoltConsumed', true);
        puddle.destroy();
        break; // this puddle is gone, move to the next one
      }
    }
  }

  #spawnVoidOrbPickup(playerX: number, playerY: number): void {
    const pickup = new VoidOrbPickup(
      this,
      playerX + CONFIG.VOID_ORB_PICKUP_OFFSET_X,
      playerY + CONFIG.VOID_ORB_PICKUP_OFFSET_Y,
    );
    if (!this.#player) return;
    // One-shot overlap — collect() destroys the pickup, which removes it from the
    // arcade physics list, so the callback can't double-fire.
    this.physics.add.overlap(this.#player, pickup, () => {
      if (pickup.active) pickup.collect();
    });
  }

  #spawnDarkBoltPickup(playerX: number, playerY: number): void {
    const pickup = new DarkBoltPickup(
      this,
      playerX + CONFIG.DARK_BOLT_PICKUP_OFFSET_X,
      playerY + CONFIG.DARK_BOLT_PICKUP_OFFSET_Y,
    );
    if (!this.#player) return;
    this.physics.add.overlap(this.#player, pickup, () => {
      if (pickup.active) pickup.collect();
    });
  }

  /**
   * Parses the Tiled Map data and creates the 'Room' game objects
   * from the rooms layer in Tiled. The `Room` object is how we group
   * the various game objects in our game.
   */
  #createRooms(map: Phaser.Tilemaps.Tilemap, layerName: string): void {
    const validTiledObjects = getTiledRoomObjectsFromMap(map, layerName);
    validTiledObjects.forEach((tiledObject) => {
      this.#objectsByRoomId[tiledObject.id] = {
        switches: [],
        pots: [],
        doors: [],
        chests: [],
        room: tiledObject,
        chestMap: {},
        doorMap: {},
      };
    });
  }

  /**
   * Parses the Tiled Map data and creates the 'Door' game objects
   * for transitions between the various rooms/caves/buildings/etc.
   */
  #createDoors(map: Phaser.Tilemaps.Tilemap, layerName: string, roomId: number): void {
    const validTiledObjects = getTiledDoorObjectsFromMap(map, layerName);
    validTiledObjects.forEach((tileObject) => {
      const door = new Door(this, tileObject, roomId);
      this.#objectsByRoomId[roomId].doors.push(door);
      this.#objectsByRoomId[roomId].doorMap[tileObject.id] = door;
      this.#doorTransitionGroup.add(door.doorTransitionZone);

      if (door.doorObject === undefined) {
        return;
      }

      // update door details based on data in data manager
      const existingDoorData =
        DataManager.instance.data.areaDetails[DataManager.instance.data.currentArea.name][roomId]?.doors[tileObject.id];
      if (existingDoorData !== undefined && existingDoorData.unlocked) {
        door.open();
        return;
      }

      // if door is a locked door, use different group so we during collision we can unlock door if able
      if (door.doorType === DOOR_TYPE.LOCK || door.doorType === DOOR_TYPE.BOSS) {
        this.#lockedDoorGroup.add(door.doorObject);
        return;
      }

      this.#blockingGroup.add(door.doorObject);
    });
  }

  /**
   * Parses the Tiled Map data and creates the 'Button' game objects
   * that players can interact with to open doors, reveal chests, etc.
   */
  #createButtons(map: Phaser.Tilemaps.Tilemap, layerName: string, roomId: number): void {
    const validTiledObjects = getTiledSwitchObjectsFromMap(map, layerName);
    validTiledObjects.forEach((tileObject) => {
      const button = new Button(this, tileObject);
      this.#objectsByRoomId[roomId].switches.push(button);
      this.#switchGroup.add(button);
    });
  }

  /**
   * Parses the Tiled Map data and creates the 'Pot' game objects.
   */
  #createPots(map: Phaser.Tilemaps.Tilemap, layerName: string, roomId: number): void {
    const validTiledObjects = getTiledPotObjectsFromMap(map, layerName);
    validTiledObjects.forEach((tiledObject) => {
      const pot = new Pot(this, tiledObject);
      this.#objectsByRoomId[roomId].pots.push(pot);
      this.#blockingGroup.add(pot);
    });
  }

  /**
   * Parses the Tiled Map data and creates the 'Chest' game objects.
   */
  #createChests(map: Phaser.Tilemaps.Tilemap, layerName: string, roomId: number): void {
    const validTiledObjects = getTiledChestObjectsFromMap(map, layerName);
    validTiledObjects.forEach((tiledObject) => {
      const chest = new Chest(this, tiledObject);
      this.#objectsByRoomId[roomId].chests.push(chest);
      this.#objectsByRoomId[roomId].chestMap[chest.id] = chest;
      this.#blockingGroup.add(chest);

      // update chest details based on data in data manager
      const existingChestData =
        DataManager.instance.data.areaDetails[DataManager.instance.data.currentArea.name][roomId]?.chests[
          tiledObject.id
        ];
      if (existingChestData !== undefined) {
        if (existingChestData.revealed) {
          chest.reveal();
        }
        if (existingChestData.opened) {
          chest.open();
        }
      }
    });
  }

  /**
   * Parses the Tiled Map data and creates the various enemy game objects like 'Wisp' and 'Spider'.
   */
  #createEnemies(map: Phaser.Tilemaps.Tilemap, layerName: string, roomId: number): void {
    if (this.#objectsByRoomId[roomId].enemyGroup === undefined) {
      this.#objectsByRoomId[roomId].enemyGroup = this.add.group([], {
        runChildUpdate: true,
      });
    }
    const validTiledObjects = getTiledEnemyObjectsFromMap(map, layerName);
    for (const tiledObject of validTiledObjects) {
      if (tiledObject.type !== 1 && tiledObject.type !== 2 && tiledObject.type !== 3) {
        continue;
      }
      if (tiledObject.type === 1) {
        const spider = new Spider({ scene: this, position: { x: tiledObject.x, y: tiledObject.y } });
        this.#objectsByRoomId[roomId].enemyGroup.add(spider);
        continue;
      }
      if (tiledObject.type === 2) {
        const wisp = new Wisp({ scene: this, position: { x: tiledObject.x, y: tiledObject.y } });
        this.#objectsByRoomId[roomId].enemyGroup.add(wisp);
        continue;
      }
      if (
        tiledObject.type === 3 &&
        !DataManager.instance.data.areaDetails[DataManager.instance.data.currentArea.name].bossDefeated
      ) {
        const drow = new Drow({ scene: this, position: { x: tiledObject.x, y: tiledObject.y } });
        this.#objectsByRoomId[roomId].enemyGroup.add(drow);
        continue;
      }
    }
  }

  #handleRoomTransition(doorTrigger: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    // lock player input until transition is finished
    this.#controls.isMovementLocked = true;

    const door = this.#objectsByRoomId[this.#currentRoomId].doorMap[doorTrigger.name] as Door;
    const modifiedLevelName = door.targetLevel.toUpperCase();
    if (isLevelName(modifiedLevelName)) {
      // Disable the trigger immediately so overlap does not re-fire while
      // the scene transition is being requested.
      door.disableObject();
      const sceneData: LevelData = {
        level: modifiedLevelName,
        roomId: door.targetRoomId,
        doorId: door.targetDoorId,
      };

      // Online mode: request server to broadcast transition to all clients
      let nm: NetworkManager | null = null;
      try { nm = NetworkManager.getInstance(); } catch { /* offline */ }
      if (nm && nm.isConnected) {
        nm.sendRoomTransitionRequest({ levelName: modifiedLevelName, roomId: door.targetRoomId, doorId: door.targetDoorId });
        // Do NOT start scene locally — wait for NETWORK_ROOM_TRANSITION echo from server
      } else {
        this.scene.start(SCENE_KEYS.GAME_SCENE, sceneData);
      }
      return;
    }
    const targetDoor = this.#objectsByRoomId[door.targetRoomId].doorMap[door.targetDoorId];

    // disable body on game object so we stop triggering the collision
    door.disableObject();
    // update 2nd room to have items visible
    this.#showObjectsInRoomById(targetDoor.roomId);
    // disable body on target door so we don't trigger transition back to original room
    targetDoor.disableObject();

    // go to idle state
    this.#player.stateMachine.setState(CHARACTER_STATES.IDLE_STATE);

    // calculate the target door and direction so we can animate the player and camera properly
    const targetDirection = getDirectionOfObjectFromAnotherObject(door, targetDoor);
    const doorDistance = {
      x: Math.abs((door.doorTransitionZone.x - targetDoor.doorTransitionZone.x) / 2),
      y: Math.abs((door.doorTransitionZone.y - targetDoor.doorTransitionZone.y) / 2),
    };
    if (targetDirection === DIRECTION.UP) {
      doorDistance.y *= -1;
    }
    if (targetDirection === DIRECTION.LEFT) {
      doorDistance.x *= -1;
    }

    // animate player into hallway
    const playerTargetPosition = {
      x: door.x + door.doorTransitionZone.width / 2 + doorDistance.x,
      y: door.y - door.doorTransitionZone.height / 2 + doorDistance.y,
    };
    this.tweens.add({
      targets: this.#player,
      y: playerTargetPosition.y,
      x: playerTargetPosition.x,
      duration: CONFIG.ROOM_TRANSITION_PLAYER_INTO_HALL_DURATION,
      delay: CONFIG.ROOM_TRANSITION_PLAYER_INTO_HALL_DELAY,
    });

    // animate camera to the next room based on the door positions
    const roomSize = this.#objectsByRoomId[targetDoor.roomId].room;
    // reset camera bounds so we have a smooth transition
    this.cameras.main.setBounds(
      this.cameras.main.worldView.x,
      this.cameras.main.worldView.y,
      this.cameras.main.worldView.width,
      this.cameras.main.worldView.height,
    );
    this.cameras.main.stopFollow();
    const bounds = this.cameras.main.getBounds();
    this.tweens.add({
      targets: bounds,
      x: roomSize.x,
      y: roomSize.y - roomSize.height,
      duration: CONFIG.ROOM_TRANSITION_CAMERA_ANIMATION_DURATION,
      delay: CONFIG.ROOM_TRANSITION_CAMERA_ANIMATION_DELAY,
      onUpdate: () => {
        this.cameras.main.setBounds(bounds.x, bounds.y, roomSize.width, roomSize.height);
      },
    });

    // animate player into room
    const playerDistanceToMoveIntoRoom = {
      x: doorDistance.x * 2,
      y: doorDistance.y * 2,
    };
    if (targetDirection === DIRECTION.UP || targetDirection === DIRECTION.DOWN) {
      playerDistanceToMoveIntoRoom.y = Math.max(Math.abs(playerDistanceToMoveIntoRoom.y), 32);
      if (targetDirection === DIRECTION.UP) {
        playerDistanceToMoveIntoRoom.y *= -1;
      }
    } else {
      playerDistanceToMoveIntoRoom.x = Math.max(Math.abs(playerDistanceToMoveIntoRoom.x), 32);
      if (targetDirection === DIRECTION.LEFT) {
        playerDistanceToMoveIntoRoom.x *= -1;
      }
    }

    this.tweens.add({
      targets: this.#player,
      y: playerTargetPosition.y + playerDistanceToMoveIntoRoom.y,
      x: playerTargetPosition.x + playerDistanceToMoveIntoRoom.x,
      duration: CONFIG.ROOM_TRANSITION_PLAYER_INTO_NEXT_ROOM_DURATION,
      delay: CONFIG.ROOM_TRANSITION_PLAYER_INTO_NEXT_ROOM_DELAY,
      onComplete: () => {
        // re-enable the door object player just entered through
        targetDoor.enableObject();
        // disable objects in previous room and repopulate this room if needed
        this.#hideObjectsInRoomById(door.roomId);
        this.#currentRoomId = targetDoor.roomId;
        this.#checkForAllEnemiesAreDefeated();
        // update camera to follow player again
        this.cameras.main.startFollow(this.#player);
        // re-enable player input
        this.#controls.isMovementLocked = false;
      },
    });
  }

  #handleButtonPress(button: Button): void {
    const buttonPressedData = button.press();
    if (buttonPressedData.targetIds.length === 0 || buttonPressedData.action === SWITCH_ACTION.NOTHING) {
      return;
    }
    switch (buttonPressedData.action) {
      case SWITCH_ACTION.OPEN_DOOR:
        // for each door id in the target list, we need to trigger opening the door
        buttonPressedData.targetIds.forEach((id) => this.#objectsByRoomId[this.#currentRoomId].doorMap[id].open());
        break;
      case SWITCH_ACTION.REVEAL_CHEST:
        // for each chest id in the target list, we need to trigger revealing the chest
        buttonPressedData.targetIds.forEach((id) => {
          this.#objectsByRoomId[this.#currentRoomId].chestMap[id].reveal();
          // update data manager so we can persist chest state
          const existingChestData =
            DataManager.instance.data.areaDetails[DataManager.instance.data.currentArea.name][this.#currentRoomId]
              ?.chests[id];
          if (!existingChestData || !existingChestData.revealed) {
            DataManager.instance.updateChestData(this.#currentRoomId, id, true, false);
          }
        });
        break;
      case SWITCH_ACTION.REVEAL_KEY:
        break;
      default:
        exhaustiveGuard(buttonPressedData.action);
    }
  }

  #checkForAllEnemiesAreDefeated(): void {
    const enemyGroup = this.#objectsByRoomId[this.#currentRoomId].enemyGroup;
    if (enemyGroup === undefined) {
      return;
    }

    const allRequiredEnemiesDefeated = enemyGroup.getChildren().every((child) => {
      if (!child.active) {
        return true;
      }
      if (child instanceof Wisp) {
        return true;
      }
      return false;
    });
    if (allRequiredEnemiesDefeated) {
      this.#handleAllEnemiesDefeated();
    }
  }

  #handleAllEnemiesDefeated(): void {
    // check to see if any chests, keys, or doors should be revealed/open
    this.#objectsByRoomId[this.#currentRoomId].chests.forEach((chest) => {
      if (chest.revealTrigger === TRAP_TYPE.ENEMIES_DEFEATED) {
        chest.reveal();
        // update data manager so we can persist chest state
        const existingChestData =
          DataManager.instance.data.areaDetails[DataManager.instance.data.currentArea.name][this.#currentRoomId]
            ?.chests[chest.id];
        if (!existingChestData || !existingChestData.revealed) {
          DataManager.instance.updateChestData(this.#currentRoomId, chest.id, true, false);
        }
      }
    });
    this.#objectsByRoomId[this.#currentRoomId].doors.forEach((door) => {
      if (door.trapDoorTrigger === TRAP_TYPE.ENEMIES_DEFEATED) {
        door.open();
      }
      if (
        door.trapDoorTrigger === TRAP_TYPE.BOSS_DEFEATED &&
        DataManager.instance.data.areaDetails[DataManager.instance.data.currentArea.name].bossDefeated
      ) {
        door.open();
      }
    });
  }

  #showObjectsInRoomById(roomId: number): void {
    this.#objectsByRoomId[roomId].doors.forEach((door) => door.enableObject());
    this.#objectsByRoomId[roomId].switches.forEach((button) => button.enableObject());
    this.#objectsByRoomId[roomId].pots.forEach((pot) => pot.resetPosition());
    this.#objectsByRoomId[roomId].chests.forEach((chest) => chest.enableObject());
    if (this.#objectsByRoomId[roomId].enemyGroup === undefined) {
      return;
    }
    for (const child of this.#objectsByRoomId[roomId].enemyGroup.getChildren()) {
      (child as CharacterGameObject).enableObject();
    }
  }

  #hideObjectsInRoomById(roomId: number): void {
    this.#objectsByRoomId[roomId].doors.forEach((door) => door.disableObject());
    this.#objectsByRoomId[roomId].switches.forEach((button) => button.disableObject());
    this.#objectsByRoomId[roomId].pots.forEach((pot) => pot.disableObject());
    this.#objectsByRoomId[roomId].chests.forEach((chest) => chest.disableObject());
    if (this.#objectsByRoomId[roomId].enemyGroup === undefined) {
      return;
    }
    for (const child of this.#objectsByRoomId[roomId].enemyGroup.getChildren()) {
      (child as CharacterGameObject).disableObject();
    }
  }

  #handlePlayerDefeatedEvent(): void {
    // Phase 14 bugfix (TDM playtest #1): never fall through to the single-player GAME_OVER
    // screen during a team-deathmatch. Death + respawn are server-authoritative there; the
    // server's `elimination` → `respawn` broadcasts drive #applyLocalDeath / #onRespawn. This
    // guard is defence-in-depth — #onDamageConfirmed no longer drives DEATH_STATE in TDM (it SETs
    // HP from the server and never calls hit()), but any other 0-HP source (hazard, legacy state
    // transition, desync) is caught here so it can never reach the single-player GAME_OVER screen.
    if (this.#isTeamDeathmatchMatch()) {
      return;
    }
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENE_KEYS.GAME_OVER_SCENE);
    });
    this.cameras.main.fadeOut(1000, 0, 0, 0);
  }

  #handleDialogClosed(): void {
    this.#rewardItem.setVisible(false);
    this.scene.resume();
  }

  #handleBossDefeated(): void {
    DataManager.instance.defeatedCurrentAreaBoss();
    this.#handleAllEnemiesDefeated();
  }

  // ---- Multiplayer networking ----

  static readonly #PLAYER_TINT_PALETTE = [0xffffff, 0x00aaff, 0xff4444, 0x44ff44, 0xff44ff];

  #setupNetworking(): void {
    let nm: NetworkManager | null = null;
    try { nm = NetworkManager.getInstance(); } catch { /* offline — skip */ }
    if (!nm || !nm.isConnected) return;

    nm.startGameTick(() => this.#buildLocalPlayerSnapshot());
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_ROOM_TRANSITION, this.#onNetworkRoomTransition, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_PLAYER_UPDATE, this.#onRemotePlayerUpdate, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_SPELL_CAST, this.#onRemoteSpellCast, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_BREATH_START, this.#onRemoteBreathStart, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_BREATH_UPDATE, this.#onRemoteBreathUpdate, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_BREATH_END, this.#onRemoteBreathEnd, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_EARTH_WALL_PILLAR, this.#onRemoteEarthWallPillar, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_EARTH_WALL_PILLAR_DESTROY, this.#onRemoteEarthWallPillarDestroy, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_BEAM_UPDATE, this.#onRemoteBeamUpdate, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_BEAM_END, this.#onRemoteBeamEnd, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_PLAYER_DISCONNECTED, this.#onRemotePlayerDisconnected, this);
    EVENT_BUS.on(CUSTOM_EVENTS.SPELL_CAST, this.#onLocalSpellCast, this);
    // 3p desync fix (Cause #3): pre-spawn all known remote players from the
    // already-received MatchConfig instead of waiting for their first pos packet.
    // If a peer's WebRTC pos channel never opens (handshake race), the avatar still
    // exists on screen — a stationary ghost is diagnosable; a missing player is not.
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MESH_PARTIAL, this.#onMeshPartial, this);
    this.#preSpawnRemotePlayersFromMatchConfig();
  }

  /**
   * 3p desync fix: pre-spawn a Player avatar for every peer in MatchConfig that we
   * haven't already seen, positioned at the local player's spawn point as a sentinel.
   * Their first inbound 'pos' packet from #onRemotePlayerUpdate snaps them to the
   * real location via the interpolation pipeline. Safe to call multiple times —
   * existing avatars are skipped.
   */
  #preSpawnRemotePlayersFromMatchConfig(): void {
    let nm: NetworkManager | null = null;
    try { nm = NetworkManager.getInstance(); } catch { return; }
    if (!nm) return;
    const fallbackX = this.#player?.x ?? 0;
    const fallbackY = this.#player?.y ?? 0;
    for (const info of nm.matchPlayers) {
      if (info.id === nm.localPlayerId) continue;
      if (this.#remotePlayers.has(info.id)) continue;
      this.#spawnRemotePlayer(info.id, fallbackX, fallbackY);
    }
  }

  #spawnRemotePlayer(playerId: string, x: number, y: number): Player {
    const tint = this.#resolvePlayerTint(playerId);
    const ric = new RemoteInputComponent();
    const remote = new Player({
      scene: this,
      position: { x, y },
      controls: ric,
      maxLife: CONFIG.PLAYER_START_MAX_HEALTH,
      currentLife: CONFIG.PLAYER_START_MAX_HEALTH,
      tintColor: tint,
    });
    this.#remotePlayers.set(playerId, remote);
    remote.setData('playerId', playerId);
    this.#remotePlayerGroup.add(remote);
    // Populate the team-tint cache (setData('teamTint')) so death/respawn can re-apply the exact team
    // color via #reapplyStoredTint without re-resolving through matchPlayers (which can be racy). The
    // constructor already applied `tint`; this just records it for later restore. (Was the corpse-color
    // bug: the cache was never set for remotes, so dead bodies fell back to a white/default resolve.)
    this.#applyTeamTint(remote, playerId);
    return remote;
  }

  #onMeshPartial = (data: { reasons: string[] }): void => {
    // Surface partial-mesh state on screen so the user knows the match has a desync
    // risk instead of silently presenting a phantom-peer game.
    const reasonsText = data.reasons.join(' | ');
    const msg = this.add
      .bitmapText(this.cameras.main.centerX, 24, 'press_start_2p', `NETWORK WARNING: ${reasonsText}`, 8)
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(9999)
      .setTint(0xffaa00);
    this.time.delayedCall(6000, () => { if (msg.active) msg.destroy(); });
    if (CONFIG.NETWORK_DEBUG) {
      console.warn('[GameScene] NETWORK_MESH_PARTIAL', data);
    }
  };

  #buildLocalPlayerSnapshot(): PlayerUpdatePayload | null {
    // Don't broadcast position/animation while DEAD: a dead local player otherwise keeps emitting
    // IDLE/MOVE snapshots, which on peers' screens would replay walk/idle over the death animation
    // (the intermittent "death anim doesn't play" bug). #deadPlayerIds gates this on the RECEIVER side
    // too; stopping it at the SOURCE here removes the race entirely. #deathLockActive is set in
    // #applyLocalDeath and cleared in #clearLocalDeath (on respawn), so broadcasting resumes on respawn.
    if (!this.#player?.active || this.#deathLockActive) return null;
    return {
      x: this.#player.x,
      y: this.#player.y,
      direction: this.#player.direction,
      state: this.#player.stateMachine.currentStateName ?? 'IDLE_STATE',
      element: ElementManager.instance.activeElement,
      flipX: this.#player.flipX,
    };
  }

  #onNetworkRoomTransition = (payload: RoomTransitionPayload): void => {
    if (!isLevelName(payload.levelName.toUpperCase())) return;
    this.scene.start(SCENE_KEYS.GAME_SCENE, {
      level: payload.levelName.toUpperCase() as LevelData['level'],
      roomId: payload.roomId,
      doorId: payload.doorId,
    });
  };

  #onRemotePlayerUpdate = (payload: PlayerUpdateBroadcast): void => {
    let nm: NetworkManager | null = null;
    try { nm = NetworkManager.getInstance(); } catch { /* offline */ }
    if (nm && payload.playerId === nm.localPlayerId) return;
    // Stale packet from a player that already disconnected — don't let the
    // lazy-spawn fallback below resurrect a ghost avatar for them.
    if (this.#disconnectedPlayerIds.has(payload.playerId)) return;

    let remote = this.#remotePlayers.get(payload.playerId);
    if (!remote) {
      // First sighting via pos packet — pre-spawn from MatchConfig should usually
      // have created the avatar already (3p desync fix), but this path remains as
      // a fallback for late-joining peers / first packet on a peer we don't have in
      // matchPlayers yet (shouldn't happen in current protocol).
      remote = this.#spawnRemotePlayer(payload.playerId, payload.x, payload.y);
    }

    // Store network target — per-frame interpolation in #interpolateRemotePlayers handles rendering
    const ric = remote.controls as RemoteInputComponent;
    if (typeof ric.applySnapshot === 'function') {
      ric.applySnapshot({ x: payload.x, y: payload.y, direction: payload.direction, state: payload.state, element: payload.element, flipX: payload.flipX ?? false });
    }
  };

  #interpolateRemotePlayers(delta: number): void {
    const lerpSpeed = 20;
    const t = Math.min(1, lerpSpeed * (delta / 1000));

    for (const remote of this.#remotePlayers.values()) {
      const ric = remote.controls as RemoteInputComponent;
      if (typeof ric.getTarget !== 'function') continue;

      const target = ric.getTarget();
      if (!target.hasTarget) continue;

      remote.x = Phaser.Math.Linear(remote.x, target.x, t);
      remote.y = Phaser.Math.Linear(remote.y, target.y, t);

      const dirChanged = target.direction && target.direction !== remote.direction;
      if (dirChanged) {
        remote.direction = target.direction as Direction;
      }
      // Mirror the broadcast flipX directly — derived from the caster's local
      // flipX so diagonal movement (UP+LEFT etc.) keeps the side-mirroring
      // consistent across clients. Without this, the caster's `direction` is
      // UP/DOWN for vertical-priority diagonals while their sprite is still
      // visibly flipped → remote ignored the flip and showed the wrong side.
      if (remote.flipX !== target.flipX) {
        remote.setFlipX(target.flipX);
      }

      // Skip ALL state/animation updates for a DEAD remote: it keeps broadcasting IDLE/MOVE over WebRTC,
      // and applying that here would override the death animation (intermittent "death anim doesn't play"
      // bug). Position still interpolates above (harmless — a dead body holds position anyway). Cleared
      // from #deadPlayerIds on respawn, after which normal animation resumes.
      const remoteId = remote.getData('playerId') as string | undefined;
      if (remoteId !== undefined && this.#deadPlayerIds.has(remoteId)) {
        continue;
      }

      if (target.state && remote.stateMachine) {
        const currentState = remote.stateMachine.currentStateName;
        const stateChanged = target.state !== currentState;
        if (stateChanged) {
          // Pass the remote's current direction as the state arg — HURT_STATE and
          // DEATH_STATE both call exhaustiveGuard on their direction arg in onEnter(),
          // so a setState call without args crashes the caster's client the moment
          // their target's HURT state propagates over the wire. Most other states
          // ignore the arg, so this is harmless for them.
          remote.stateMachine.setState(target.state, remote.direction);
        }

        // MoveState has no onEnter and its onUpdate is blocked by isMovementLocked,
        // so we must drive the walk/idle animation explicitly for remote players.
        if (stateChanged || dirChanged) {
          if (target.state === CHARACTER_STATES.MOVE_STATE) {
            remote.animationComponent.playAnimation(`WALK_${remote.direction}`);
          } else if (target.state === CHARACTER_STATES.IDLE_STATE) {
            remote.animationComponent.playAnimation(`IDLE_${remote.direction}`);
          }
        }
      }
    }
  }

  /**
   * Returns a deterministic tint for a remote player.
   * Uses team-based colors when team data is available from matchConfig.
   * Falls back to stable-index palette when team is unassigned or matchConfig is unavailable.
   */
  /** Phase 14 bugfix (#4): (re)apply a player's team-color tint. Team 0 = blue, team 1 = red
   *  (resolved by #resolvePlayerTint). Used for the LOCAL player at spawn and for ANY player after
   *  a respawn — the old #onRespawn clearTint() dropped the team color. Clears the tint when the
   *  resolved color is white (no team / offline) so we never leave a stale tint behind. */
  #applyTeamTint(player: Player, playerId: string): void {
    if (!player) return;
    const tint = this.#resolvePlayerTint(playerId);
    // Cache the resolved team tint on the object so death/respawn can re-apply the SAME color without
    // re-resolving through matchPlayers (which can be racy or unavailable mid-death). #reapplyStoredTint
    // uses this. We intentionally DO NOT early-return on !player.active: a dead remote has active=false
    // (disableObject) but must still show its team color while down.
    player.setData('teamTint', tint);
    if (tint === 0xffffff) {
      player.clearTint();
    } else {
      player.setTint(tint);
    }
  }

  /** Re-apply the team tint cached by #applyTeamTint, without re-resolving (used on death/respawn so the
   *  corpse keeps its exact team color even if matchPlayers is momentarily unavailable). Falls back to a
   *  fresh resolve if nothing was cached yet. */
  #reapplyStoredTint(player: Player, playerId: string): void {
    if (!player) return;
    let tint = player.getData('teamTint') as number | undefined;
    // A cached white (0xffffff) means the tint was resolved BEFORE team data arrived (race at spawn).
    // Re-resolve in that case — by death time the team is known — and refresh the cache so the corpse
    // shows the real team color instead of a stale white. (Root cause of "corpse color still wrong".)
    if (tint === undefined || tint === 0xffffff) {
      tint = this.#resolvePlayerTint(playerId);
      player.setData('teamTint', tint);
    }
    if (tint === 0xffffff) {
      player.clearTint();
    } else {
      player.setTint(tint);
    }
  }

  // Resolves a player's world tint by team (blue/red) with a stable palette fallback for
  // unassigned/offline players. Serves both the LOCAL player (#4) and remotes.
  #resolvePlayerTint(playerId: string): number {
    const len = GameScene.#PLAYER_TINT_PALETTE.length;
    let nm: NetworkManager | null = null;
    try { nm = NetworkManager.getInstance(); } catch { /* offline */ }

    if (nm) {
      const matchPlayers = nm.matchPlayers;
      const playerIndex = matchPlayers.findIndex((p: PlayerInfo) => p.id === playerId);
      if (playerIndex !== -1) {
        const info = matchPlayers[playerIndex];
        if (info.team === 0) return 0x0055ff;
        if (info.team === 1) return 0xdd2200;
        // Unassigned team — use stable index (+1 to skip white at index 0)
        return GameScene.#PLAYER_TINT_PALETTE[(playerIndex + 1) % len];
      }
    }

    // Not found (offline / no matchConfig) — fall back to slot-count-based
    return GameScene.#PLAYER_TINT_PALETTE[(this.#remotePlayers.size + 1) % len];
  }

  // Phase 9.3 (Plan 03): payload now carries BOTH spellInstanceId (per-cast UUID, NEW) and
  // spellId (SPELL_ID type constant). The UUID is what rides the wire as SpellCastPayload.spellId.
  // The legacy `element` field carries the active element; receivers re-derive the spell type
  // from element + slot (or from a future broadcasted SPELL_ID — out of scope for this plan).
  #onLocalSpellCast = (payload: { spellInstanceId?: string; spellId: string; slotIndex: number; casterX: number; casterY: number; targetX: number; targetY: number }): void => {
    // Phase 14 (D-12): a local cast cancels respawn invuln immediately (also covers dash,
    // which routes through SPELL_CAST). Guard on #invulnUntil > 0 so the common case is a
    // single comparison. This runs before the connectivity early-return so an offline/solo
    // cast still cancels the pulse.
    if (this.#invulnUntil > 0) this.#stopInvulnBlink();

    let nm: NetworkManager | null = null;
    try { nm = NetworkManager.getInstance(); } catch { return; }
    if (!nm?.isConnected || !this.#player?.active) return;
    // Prefer the new UUID; fall back to the legacy type constant if for some reason
    // the emitter is from an older code path (defensive — should never trigger after Plan 03).
    const wireSpellId = payload.spellInstanceId ?? payload.spellId;
    nm.sendSpellCast({
      spellId: wireSpellId,
      spellType: payload.spellId,                   // SPELL_ID constant — factory key on receiver side.
      element: ElementManager.instance.activeElement,
      x: payload.casterX,
      y: payload.casterY,
      direction: this.#player.direction,
      targetX: payload.targetX,
      targetY: payload.targetY,
    });
  };

  #onRemoteSpellCast = (payload: SpellCastBroadcast): void => {
    // Instantiate the spell directly via the registry — do NOT re-emit SPELL_CAST (that would
    // trigger #onLocalSpellCast and re-broadcast, creating an infinite loop).
    // Phase 9.3 (Plan 03): factory lookup now uses spellType (SPELL_ID constant);
    // spellId is the per-cast UUID used for cross-client correlation, NOT a factory key.
    const factoryKey = payload.spellType ?? payload.spellId; // fallback if a peer is on older protocol
    const factory = SPELL_FACTORY_REGISTRY[factoryKey as keyof typeof SPELL_FACTORY_REGISTRY];
    if (!factory) {
      console.warn(`[GameScene] No factory for remote spellType: ${factoryKey}`);
      return;
    }

    // Defense-in-depth self-filter (mirrors #onRemotePlayerUpdate). The WebRTC mesh currently
    // prevents self-echo, but if mesh wiring changes a loopback would otherwise spawn a ghost
    // remote-spell on the caster's own client.
    let nm: NetworkManager | null = null;
    try { nm = NetworkManager.getInstance(); } catch { /* offline */ }
    if (nm && payload.playerId === nm.localPlayerId) return;

    // Strict-drop guard: the wire contract requires targetX/targetY. A nullish receipt is a
    // real producer/transport bug — warn loudly and drop rather than papering over it with a
    // straight-right fallback (root cause of the phantom-fireball bug; see
    // .planning/debug/phantom-fireball.md D-20).
    if (payload.targetX == null || payload.targetY == null) {
      console.warn('[GameScene] #onRemoteSpellCast: dropping spell with nullish target', { playerId: payload.playerId, spellId: payload.spellId, x: payload.x, y: payload.y });
      return;
    }

    // Spawn the ghost telegraph immediately (so the local player sees their opponent's
    // wind-up) and delay the real spell spawn by SPELL_GHOST_LEAD_MS — mirrors the
    // local cast path in SpellCastingComponent.castSpell so PvP timing is symmetric.
    const direction = payload.direction as import('../common/types').Direction;
    const factoryKeyId = payload.spellType as import('../common/types').SpellId;
    const ghosted = maybeSpawnGhost(
      this,
      factoryKeyId,
      payload.x,
      payload.y,
      payload.targetX,
      payload.targetY,
      direction,
    );
    const delay = ghosted ? RUNTIME_CONFIG.SPELL_GHOST_LEAD_MS : 0;

    const spawn = (): void => {
      if (!this.scene.isActive()) return;
      // Pass the remote Player as the caster so spells that affect the caster (AirBurst)
      // can distinguish "remote dashed → only show VFX" from "local dashed → also move me".
      const remoteCaster = this.#remotePlayers.get(payload.playerId);

      // Direct dispatch for movement-only spells (AIR_BURST / DASH). These
      // existed only as factory-registered VFX stubs; that path was unreliable
      // because the factory's local-vs-remote branching depended on a duck-
      // typed scene.player comparison and silently no-op'd if the remote
      // caster wasn't pre-spawned yet. Spawn the VFX here directly so the
      // dispatch path is the same as for FireBreath / EarthWall remote events.
      if (remoteCaster && (factoryKey === SPELL_ID.AIR_BURST || factoryKey === SPELL_ID.DASH)) {
        this.#spawnRemoteDashVfx(remoteCaster, payload.x, payload.y, payload.targetX!, payload.targetY!, direction, factoryKey === SPELL_ID.AIR_BURST);
      }

      const spell = factory(
        this,
        payload.x,
        payload.y,
        payload.targetX as number,
        payload.targetY as number,
        direction,
        remoteCaster,
      );

      this.#remoteSpellGroup.add(spell.gameObject);

      // Phase 9.3 (Plan 03): tag the remote spell so NETWORK_SPELL_DESTROYED + cross-player
      // overlap callbacks can match by spellId (the per-cast UUID).
      spell.gameObject.setData('spellId', payload.spellId);
      spell.gameObject.setData('casterId', payload.playerId);
      spell.gameObject.setData('spellType', payload.spellType);

      spell.gameObject.once(Phaser.GameObjects.Events.DESTROY, () => {
        this.#remoteSpellGroup.remove(spell.gameObject, false, false);
      });
    };

    if (delay > 0) this.time.delayedCall(delay, spawn);
    else spawn();
  };

  #onRemoteBreathStart = (payload: BreathStartBroadcast): void => {
    // Create a visual-only fire breath (no mana component) for the remote player
    const breath = new FireBreath(
      this,
      payload.x,
      payload.y,
      payload.targetX,
      payload.targetY,
      this.#collisionLayer,
      this.#blockingGroup,
    );
    this.#remoteFireBreaths.set(payload.playerId, breath);
  };

  #onRemoteBreathUpdate = (payload: BreathUpdateBroadcast): void => {
    const breath = this.#remoteFireBreaths.get(payload.playerId);
    if (breath?.active && !breath.isEnding) {
      breath.update(payload.x, payload.y, payload.targetX, payload.targetY);
    }
  };

  #onRemoteBreathEnd = (payload: BreathEndBroadcast): void => {
    const breath = this.#remoteFireBreaths.get(payload.playerId);
    if (breath?.active && !breath.isEnding) {
      breath.beginEnding();
    }
    this.#remoteFireBreaths.delete(payload.playerId);
  };

  /** Find the currently-active remote LightningBeam owned by `playerId`. The
   *  beam's own spellId rotates per-tick (for damage dedupe), so we can't key
   *  the lookup by spellId — at most one beam per remote caster is permitted,
   *  so casterId is unique enough. */
  #findRemoteBeamForPlayer(playerId: string): LightningBeam | undefined {
    if (!this.#remoteSpellGroup) return undefined;
    for (const c of this.#remoteSpellGroup.getChildren()) {
      if (!(c instanceof LightningBeam) || !c.active) continue;
      if ((c.getData('casterId') as string | undefined) === playerId) return c;
    }
    return undefined;
  }

  /** Render dash VFX behind a remote caster — used for both AIR_BURST (wind
   *  super-dash, with the wind sheet behind) and DASH (vanilla dash). Called
   *  directly from #onRemoteSpellCast so the dispatch path is reliable and
   *  doesn't depend on the factory's duck-typed local-vs-remote branching. */
  #spawnRemoteDashVfx(
    caster: Player,
    _cx: number,
    _cy: number,
    tx: number,
    ty: number,
    dir: Direction,
    isAirBurst: boolean,
  ): void {
    // Direction vector from the caster's current position toward the cast target.
    let nx = tx - caster.x;
    let ny = ty - caster.y;
    const len = Math.hypot(nx, ny);
    if (len > 0.001) {
      nx /= len;
      ny /= len;
    } else {
      switch (caster.direction ?? dir) {
        case DIRECTION.LEFT:  nx = -1; ny = 0; break;
        case DIRECTION.RIGHT: nx = 1;  ny = 0; break;
        case DIRECTION.UP:    nx = 0;  ny = -1; break;
        case DIRECTION.DOWN:
        default:              nx = 0;  ny = 1;
      }
    }

    if (isAirBurst) {
      AirBurst.spawnRemoteVfx(this, caster);
      Player.spawnDashVfxFor(
        caster,
        nx,
        ny,
        CONFIG.AIR_BURST_DURATION_MS,
        CONFIG.AIR_BURST_ARC_LIFT_PX,
        CONFIG.AIR_BURST_SCALE_BOOST,
      );
    } else {
      Player.spawnDashVfxFor(caster, nx, ny);
    }
  }

  #onRemoteBeamUpdate = (payload: { playerId: string; targetX: number; targetY: number }): void => {
    const beam = this.#findRemoteBeamForPlayer(payload.playerId);
    if (beam) beam.setRemoteAim(payload.targetX, payload.targetY);
  };

  #onRemoteBeamEnd = (payload: { playerId: string }): void => {
    const beam = this.#findRemoteBeamForPlayer(payload.playerId);
    if (beam?.active) beam.destroy();
  };

  #onRemoteEarthWallPillar = (payload: EarthWallPillarBroadcast): void => {
    const pillar = new EarthWallPillar(this, payload.x, payload.y);
    this.#earthWallGroup.add(pillar);
    // Mirror the local-cast path: any client that destroys this pillar must
    // tell the rest of the mesh. Without this hook, if a non-caster destroys
    // their replica first the caster (and other observers) keep their pillar
    // standing — and subsequent firebolts at "nothing" travel through where
    // the wall used to be.
    this.#registerPillarDestroyBroadcast(pillar, payload.x, payload.y);
  };

  #onRemoteEarthWallPillarDestroy = (payload: EarthWallPillarDestroyBroadcast): void => {
    const children = this.#earthWallGroup.getChildren() as EarthWallPillar[];
    const match = children.find(
      (p) => p.active && !p.isBeingDestroyed && Math.abs(p.x - payload.x) < 2 && Math.abs(p.y - payload.y) < 2,
    );
    if (match) {
      // Tag so the DESTROY hook below knows NOT to re-broadcast (this was a
      // response to a network event, not a fresh local crumble).
      this.#pillarsBeingRemotelyDestroyed.add(match);
      match.takeDamage(99999);
    }
  };

  /** Wires the DESTROY → sendEarthWallPillarDestroy broadcast hook for a
   *  pillar. Idempotent (once-event). Skips the broadcast when the pillar is
   *  being destroyed in response to an inbound network event — that prevents
   *  the destroy event from echoing infinitely around the mesh. */
  #registerPillarDestroyBroadcast(pillar: EarthWallPillar, x: number, y: number): void {
    pillar.once(Phaser.GameObjects.Events.DESTROY, () => {
      if (this.#pillarsBeingRemotelyDestroyed.has(pillar)) return;
      try {
        NetworkManager.getInstance().sendEarthWallPillarDestroy({ x, y });
      } catch { /* offline */ }
    });
  }

  #onRemotePlayerDisconnected = (payload: PlayerDisconnectedPayload): void => {
    this.#disconnectedPlayerIds.add(payload.playerId);
    const remote = this.#remotePlayers.get(payload.playerId);
    if (remote) {
      remote.destroy();
      this.#remotePlayers.delete(payload.playerId);
    }
    // The leaver's breath:end / respawn events will never arrive — close out
    // any per-player state they left behind.
    const breath = this.#remoteFireBreaths.get(payload.playerId);
    if (breath?.active && !breath.isEnding) {
      breath.beginEnding();
    }
    this.#remoteFireBreaths.delete(payload.playerId);
    this.#deadPlayerIds.delete(payload.playerId);
    const msg = this.add
      .bitmapText(this.cameras.main.centerX, this.cameras.main.centerY - 40, 'press_start_2p', 'A PLAYER DISCONNECTED', 8)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(999)
      .setTint(0xff4444);
    this.time.delayedCall(3000, () => msg.destroy());
  };
}
