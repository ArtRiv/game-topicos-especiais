import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { ASSET_KEYS, CHEST_REWARD_TO_TEXTURE_FRAME } from '../common/assets';
import { Player } from '../game-objects/player/player';
import { KeyboardComponent } from '../components/input/keyboard-component';
import { Spider } from '../game-objects/enemies/spider';
import { Wisp } from '../game-objects/enemies/wisp';
import { CharacterGameObject } from '../game-objects/common/character-game-object';
import { CHEST_REWARD_TO_DIALOG_MAP, DIRECTION, ELEMENT, SPELL_ID } from '../common/common';
import * as CONFIG from '../common/config';
import { Pot } from '../game-objects/objects/pot';
import { Chest } from '../game-objects/objects/chest';
import { GameObject, LevelData } from '../common/types';
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
import { WaterSpike } from '../game-objects/spells/water-spike';
import { WaterTornado } from '../game-objects/spells/water-tornado';
import { WaterBall } from '../game-objects/spells/water-ball';
import { EarthBump } from '../game-objects/spells/earth-bump';
import { IceShard } from '../game-objects/spells/ice-shard';
import { WindBolt } from '../game-objects/spells/wind-bolt';
import { ThunderStrike } from '../game-objects/spells/thunder-strike';
import { DarkBolt } from '../game-objects/spells/dark-bolt';
import { LightningBurstCombo, LightningStrikeCombo } from '../game-objects/spells/lightning-combo';
import { SteamBurst } from '../game-objects/spells/steam-burst';
import { Puddle } from '../game-objects/spells/puddle';
import { SPELL_FACTORY_REGISTRY } from '../game-objects/spells/spell-registry';
import { maybeSpawnGhost } from '../game-objects/spells/spell-ghost';
import { ElementManager } from '../common/element-manager';
import {
  EARTH_WALL_MANA_COST,
  EARTH_WALL_PILLAR_COUNT,
  EARTH_WALL_PILLAR_SPACING,
  EARTH_WALL_FIREBOLT_SPLASH_RADIUS,
} from '../common/config';
import { NetworkManager } from '../networking/network-manager';
import { RemoteInputComponent } from '../components/input/remote-input-component';
import { MusicManager } from '../common/music-manager';
import type { PlayerUpdateBroadcast, RoomTransitionPayload, PlayerDisconnectedPayload, PlayerUpdatePayload, SpellCastBroadcast, PlayerInfo, BreathStartBroadcast, BreathUpdateBroadcast, BreathEndBroadcast, EarthWallPillarBroadcast, EarthWallPillarDestroyBroadcast, MatchStateChangedPayload, MatchCountdownTickPayload, DamageConfirmedPayload, SpellDestroyedPayload, EliminationPayload, RespawnPayload } from '../networking/types';
import { RUNTIME_CONFIG } from '../common/runtime-config';
import type { Direction } from '../common/types';

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
  // Multiplayer: remote players keyed by playerId
  #remotePlayers = new Map<string, Player>();
  #remoteSpellGroup!: Phaser.GameObjects.Group;
  // Phase 9.3 (Plan 03): cross-player overlap target. Holds Player instances for every
  // lazily-spawned remote player; tagged via setData('playerId', …).
  #remotePlayerGroup!: Phaser.GameObjects.Group;
  #remoteFireBreaths = new Map<string, FireBreath>();
  // Phase 9.3 (Plan 03): dedupe set for NETWORK_DAMAGE_CONFIRMED. Cleared on shutdown.
  #appliedDamageSpellIds: Set<string> = new Set();
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
  #countdownText: Phaser.GameObjects.BitmapText | null = null;
  // Faded ring around the local player at PLAYER_ATTACK_RANGE_PX so the player can see their reach.
  #rangeRing: Phaser.GameObjects.Graphics | undefined;
  // EarthBump-vs-EarthWall combo overlap result: maps the bump → set of shattered pillar positions
  // so we only fire shards once per pillar.
  #bumpsThatShattered = new WeakSet<EarthBump>();

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

    // Switch to gameplay music. MusicManager handles the cross-fade and is a
    // no-op if gameplay music is already playing (e.g. room restarts).
    MusicManager.instance.playGameplay(this);
  }

  public update(_time: number, delta: number): void {
    this.#handleHitboxDebugToggle();
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
    this.#updateDarkBoltCombos(delta);
    this.#updateEarthBumpWallCombo();
    this.#updateFireBreathVsEarthWall();
    this.#handleRadialMenuInput();
    this.#handleDashInput();
    this.#interpolateRemotePlayers(delta);
    this.#updateRangeRing();
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

  /** DarkBolt orb combos — everything that interacts with an active darkness orb.
   *  Runs every frame so pull forces are continuous; one-shot consumption combos use
   *  setData flags to fire exactly once per orb-victim pair. */
  #updateDarkBoltCombos(delta: number): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const all = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const orbs = all.filter(
      (s): s is DarkBolt => s instanceof DarkBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (orbs.length === 0) return;

    // Pull tuning. Radius is how close you have to be for the orb to grab you; speed is
    // how hard it pulls at the edge. Closeness ramps the pull up linearly (1 at the orb,
    // 0 at the edge of the radius), so the closer you stand the more violently you're sucked in.
    const PULL_RADIUS = 110;
    const PULL_SPEED = 70; // px/s at the orb center
    const dt = delta / 1000;

    // -----------------------------------------------------------------------------------
    // 1. Pull on players (local + remote). Position-additive so collisions still apply
    //    via the regular physics step (Arcade syncs body to sprite on preUpdate).
    // -----------------------------------------------------------------------------------
    const playerTargets: Phaser.GameObjects.Sprite[] = [];
    if (this.#player?.active) playerTargets.push(this.#player);
    for (const p of this.#remotePlayers.values()) if (p.active) playerTargets.push(p);

    for (const orb of orbs) {
      for (const target of playerTargets) {
        const dx = orb.x - target.x;
        const dy = orb.y - target.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 1 || distSq > PULL_RADIUS * PULL_RADIUS) continue;
        const dist = Math.sqrt(distSq);
        const closeness = 1 - dist / PULL_RADIUS;
        const move = PULL_SPEED * closeness * dt;
        target.x += (dx / dist) * move;
        target.y += (dy / dist) * move;
      }
    }

    // -----------------------------------------------------------------------------------
    // 2. WaterTornado pull + grow + gradual purple tint (combo lasts the orb's lifetime).
    // -----------------------------------------------------------------------------------
    const tornadoes = all.filter(
      (s): s is WaterTornado => s instanceof WaterTornado && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    for (const orb of orbs) {
      const orbBody = orb.body as Phaser.Physics.Arcade.Body;
      for (const tornado of tornadoes) {
        const tBody = tornado.body as Phaser.Physics.Arcade.Body;
        // Pull on BODY centers, not sprite positions — the tornado's body sits ~35px
        // below its sprite origin (128x128 frame with the body near the bottom), so
        // pulling sprite-to-sprite left the hitboxes badly misaligned. Translate the
        // orb's body-center target back into the equivalent tornado sprite position.
        const spriteToBodyX = tBody.center.x - tornado.x;
        const spriteToBodyY = tBody.center.y - tornado.y;
        const targetSpriteX = orbBody.center.x - spriteToBodyX;
        const targetSpriteY = orbBody.center.y - spriteToBodyY;
        const dx = targetSpriteX - tornado.x;
        const dy = targetSpriteY - tornado.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > PULL_RADIUS * PULL_RADIUS) continue;
        const dist = Math.sqrt(distSq) || 1;
        const closeness = 1 - dist / PULL_RADIUS;

        // Pull a bit harder than a player so the tornado visibly migrates onto the orb.
        // Clamp the per-frame move to the remaining distance so we settle exactly on
        // the target instead of jittering past it once the bodies overlap.
        const move = Math.min(dist, PULL_SPEED * 1.5 * closeness * dt);
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
      }
    }

    // -----------------------------------------------------------------------------------
    // 3. FireBolt vs orb: spawn a one-shot lightning_burst_002 VFX where they touched
    //    (no damage — pure feedback) and consume the bolt. Orb persists.
    // -----------------------------------------------------------------------------------
    const fireBolts = all.filter(
      (s): s is FireBolt => s instanceof FireBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    for (const bolt of fireBolts) {
      for (const orb of orbs) {
        if (!this.physics.overlap(bolt, orb)) continue;
        // Spawn LightningBurstCombo (force the 002 variant for this combo) so the burst
        // gets a real physics body, hitEnemy de-dup, and damage via the existing spell-
        // vs-enemy overlap registered in #registerColliders.
        const burst = new LightningBurstCombo(this, bolt.x, bolt.y, { variant: '002' });
        this.#player.spellCastingComponent.spellGroup.add(burst);
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
    // 6. EarthWall pillars touching the orb take periodic damage (throttled per pillar).
    //    Same shape as FireBreath-vs-pillar above.
    // -----------------------------------------------------------------------------------
    const pillars = this.#earthWallGroup.getChildren() as EarthWallPillar[];
    if (pillars.length > 0) {
      const now = this.time.now;
      const DARK_TICK_MS = 300;
      for (const pillar of pillars) {
        if (!pillar.active || pillar.isBeingDestroyed) continue;
        for (const orb of orbs) {
          if (!this.physics.overlap(pillar, orb)) continue;
          const last = (pillar.getData('lastDarkTickAt') as number | undefined) ?? 0;
          if (now - last < DARK_TICK_MS) break;
          pillar.setData('lastDarkTickAt', now);
          pillar.takeDamage(1);
          break;
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

  /** ThunderStrike + FireArea combo — passive collision; both stay around, but a
   *  lightning_strike_001 VFX fires once when a strike overlaps a fire area. */
  #updateThunderFireAreaCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    const all = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const strikes = all.filter(
      (s): s is ThunderStrike => s instanceof ThunderStrike && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    const areas = all.filter(
      (s): s is FireArea => s instanceof FireArea && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (strikes.length === 0 || areas.length === 0) return;
    for (const strike of strikes) {
      if (strike.getData('thunderFireAreaCombo')) continue;
      for (const area of areas) {
        if (!this.physics.overlap(strike, area)) continue;
        strike.setData('thunderFireAreaCombo', true);
        const x = (strike.x + area.x) / 2;
        const y = (strike.y + area.y) / 2;
        const fx = new LightningStrikeCombo(this, x, y);
        this.#player.spellCastingComponent.spellGroup.add(fx);
        break;
      }
    }
  }

  /** ThunderStrike + Puddle combo — a strike whose damage body overlaps any active
   *  puddle plays a Pixelart Splash at the strike's centre (the cursor / cast point)
   *  and electrifies every overlapping puddle. Re-striking an already-electrified
   *  puddle refreshes its charge to 100. Each strike triggers at most once. */
  #updateThunderStrikePuddleCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) return;
    if (Puddle.all.size === 0) return;
    const all = [
      ...this.#player.spellCastingComponent.spellGroup.getChildren(),
      ...(this.#remoteSpellGroup?.getChildren() ?? []),
    ];
    const strikes = all.filter(
      (s): s is ThunderStrike =>
        s instanceof ThunderStrike && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
    );
    if (strikes.length === 0) return;

    for (const strike of strikes) {
      if (strike.getData('puddleComboTriggered')) continue;
      const hit: Puddle[] = [];
      for (const p of Puddle.all) {
        if (!p.active) continue;
        if (this.physics.overlap(strike, p)) hit.push(p);
      }
      if (hit.length === 0) continue;
      strike.setData('puddleComboTriggered', true);

      // One splash anchored at the strike's centre (= cursor / cast point), even if
      // multiple puddles got electrified — the splash is the "lightning hit water"
      // feedback, not a per-puddle effect. X/Y offset tunables let you nudge the
      // sprite when the artwork's pivot isn't at the centre of its frame.
      const splashX = strike.x + RUNTIME_CONFIG.THUNDER_PUDDLE_SPLASH_X_OFFSET_PX;
      const splashY = strike.y + RUNTIME_CONFIG.THUNDER_PUDDLE_SPLASH_Y_OFFSET_PX;
      const splash = this.add.sprite(splashX, splashY, ASSET_KEYS.PIXELART_SPLASH, 0);
      // Above puddles (depth 1.5), under most spell VFX (3+).
      splash.setDepth(2.5);
      splash.play(ASSET_KEYS.PIXELART_SPLASH);
      splash.once(`animationcomplete-${ASSET_KEYS.PIXELART_SPLASH}`, () => splash.destroy());

      const localId = this.#safeNetworkManager()?.localPlayerId;
      for (const p of hit) {
        p.electrify(
          RUNTIME_CONFIG.ELEC_PUDDLE_CHARGE_MAX,
          this.#player.spellCastingComponent.spellGroup,
          localId,
        );
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

  #handleDashInput(): void {
    // Respect COUNTDOWN lock and (Plan 03) death lock.
    if (this.#combatLocked) return;
    if (this.#deathLockActive) return;
    if (!this.#controls.isDashKeyJustDown) return;
    if (!this.#player?.active) return;
    this.#player.dash();
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
   * Detects overlaps between EarthBolt projectiles and active FireAreas.
   * When an EarthBolt enters a FireArea, the bolt is consumed and a LavaPool
   * is spawned at the bolt's current position, lasting several seconds.
   */
  #updateEarthBoltFireAreaCombo(): void {
    if (!this.#player?.spellCastingComponent?.spellGroup) {
      return;
    }

    const spellChildren = this.#player.spellCastingComponent.spellGroup.getChildren();
    const remoteChildren = this.#remoteSpellGroup?.getChildren() ?? [];
    const allSpells = [...spellChildren, ...remoteChildren];
    const earthBolts = allSpells.filter(
      (s): s is EarthBolt => s instanceof EarthBolt && s.active && !!(s.body as Phaser.Physics.Arcade.Body)?.enable,
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
          const x = earthBolt.x;
          const y = earthBolt.y;

          // Consume the bolt and leave a lava pool in its wake.
          earthBolt.triggerFireAreaCombo();

          const lavaPool = new LavaPool(this, x, y);
          this.#player.spellCastingComponent.spellGroup.add(lavaPool);
          break;
        }
      }
    }
  }

  /**
   * EarthWall draw flow (3 phases):
   *  1. Press 3 → enters "pending click" state (checks mana, waits for a mouse click to confirm).
   *  2. Left mouse click → begins drawing; pillars are spawned as the cursor moves.
   *  3. Cursor moved ≥ EARTH_WALL_PILLAR_SPACING px from last pillar → new pillar placed.
   * Drawing ends automatically once EARTH_WALL_PILLAR_COUNT pillars have been placed.
   * Pressing 3 again at any phase cancels the spell.
   */
  #updateEarthWallSpell(): void {
    // LFC-06: hard-gate spell input during COUNTDOWN. EarthWall is a multi-phase
    // spell (pending-click → drawing) — locking via isMovementLocked alone would
    // not prevent a pending click from committing, so we gate at the very top.
    if (this.#combatLocked) return;
    // Phase 9.3 (Plan 03): D-11 dead-player input suppression.
    if (this.#deathLockActive) return;
    if (!this.#player?.active) return;
    if (ElementManager.instance.activeElement !== ELEMENT.EARTH) return;

    // Press 3 → toggle / cancel
    if (this.#controls.isSpell3KeyJustDown) {
      if (this.#earthWallPendingClick || this.#earthWallDrawingMode) {
        // Cancel whichever phase is active
        this.#earthWallPendingClick = false;
        this.#earthWallDrawingMode = false;
      } else {
        // Phase 1: check mana then wait for the confirming mouse click
        if (this.#player.manaComponent.mana < EARTH_WALL_MANA_COST) return;
        this.#earthWallPendingClick = true;
      }
      return;
    }

    // Phase 1 → Phase 2: left mouse click commits the spell
    const mouseLeftDown = this.input.activePointer.leftButtonDown();
    const mouseLeftJustDown = mouseLeftDown && !this.#earthWallMouseWasDown;
    this.#earthWallMouseWasDown = mouseLeftDown;

    if (this.#earthWallPendingClick) {
      if (mouseLeftJustDown) {
        this.#earthWallPendingClick = false;
        if (EARTH_WALL_MANA_COST > 0) this.#player.manaComponent.consume(EARTH_WALL_MANA_COST);
        this.#earthWallDrawingMode = true;
        this.#earthWallDrawingPillarCount = 0;
        this.#earthWallLastPlacedX = -Infinity;
        this.#earthWallLastPlacedY = -Infinity;
      }
      return;
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

    // When this local pillar is destroyed, notify other clients
    pillar.once(Phaser.GameObjects.Events.DESTROY, () => {
      try { NetworkManager.getInstance().sendEarthWallPillarDestroy({ x: tx, y: ty }); } catch { /* offline */ }
    });

    try {
      NetworkManager.getInstance().sendEarthWallPillar({ x: tx, y: ty });
    } catch { /* offline */ }

    if (this.#earthWallDrawingPillarCount >= EARTH_WALL_PILLAR_COUNT) {
      this.#earthWallDrawingMode = false;
    }
  }

  // Helper for any physics-enabled object/group that should treat Earth Wall as solid.
  #registerEarthWallSolidCollider(collidable: Phaser.Types.Physics.Arcade.ArcadeColliderType): void {
    this.physics.add.collider(collidable, this.#earthWallGroup);
  }

  #registerColliders(): void {
    // collision between player and map walls
    this.#collisionLayer.setCollision([this.#collisionLayer.tileset[0].firstgid]);
    this.#enemyCollisionLayer.setCollision([this.#collisionLayer.tileset[0].firstgid]);
    this.physics.add.collider(this.#player, this.#collisionLayer);
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

            // DarkBolt — persistent darkness orb. Damage is applied as ticks from inside
            // the orb itself (see DarkBolt.#applyTickDamage); here we just track which
            // enemies are currently overlapping so the tick loop knows who to hit.
            if (spellObj instanceof DarkBolt) {
              spellObj.addEnemyInArea(enemyGameObject);
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
      }
    });

    // Register spell projectile vs walls collider (FireBolt and EarthBolt explode on walls)
    this.physics.add.collider(this.#player.spellCastingComponent.spellGroup, this.#collisionLayer, (spellObj) => {
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
      if (spellObj instanceof DarkBolt) {
        spellObj.explode();
      }
      if (spellObj instanceof WaterBall) {
        spellObj.explode();
      }
    });

    // Remote spells also explode on walls
    this.physics.add.collider(this.#remoteSpellGroup, this.#collisionLayer, (spellObj) => {
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
    });

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
      nm.sendSpellHit({
        spellId,
        spellType,
        casterId,
        targetId: nm.localPlayerId,
        hitX: this.#player.x,
        hitY: this.#player.y,
        damage: spell.baseDamage ?? 0,
      });
      // Local visual feedback only — actual damage still gates on damage:confirmed (PVP-05, D-01).
      spell.explode?.();
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
      // Route through hit() instead of lifeComponent.takeDamage() directly — hit() ALSO
      // calls DataManager.updatePlayerCurrentHealth (→ emits PLAYER_HEALTH_UPDATED → HUD
      // refresh), plays the hurt animation, and runs the post-hit invulnerability gate.
      // Without this, PvP damage silently mutated HP but the HUD never changed and the
      // hurt animation never played, making it look like nothing happened.
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
        // Death is server-authoritative (NETWORK_ELIMINATION) — the local state we set
        // here is a best-guess that will be overridden when the elimination broadcast lands.
        remote.stateMachine.setState(CHARACTER_STATES.DEATH_STATE, DIRECTION.DOWN);
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

    if (isLocal) {
      this.#applyLocalDeath();
      return;
    }
    const remote = this.#remotePlayers.get(payload.playerId);
    if (remote) {
      remote.setTint(0x666666);
    }
  };

  #applyLocalDeath(): void {
    this.#deathLockActive = true;
    this.#player.controls.isMovementLocked = true;
    this.#player.setTint(0x666666);
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
      this.#player.lifeComponent.resetToFull();
      this.#player.clearTint();
      return;
    }
    const remote = this.#remotePlayers.get(payload.playerId);
    if (remote) {
      remote.setPosition(payload.x, payload.y);
      remote.lifeComponent.resetToFull();
      remote.clearTint();
    }
  };

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
    if (payload.state === 'COUNTDOWN') {
      this.#enterCountdownMode();
    } else if (payload.state === 'ACTIVE') {
      this.#exitCountdownMode();
    }
  };

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

    // LFC-07: snap-out → animate-in. Duration matches COUNTDOWN_DURATION_MS = 3000.
    this.cameras.main.setZoom(0.6);
    this.cameras.main.zoomTo(1.0, 3000, 'Sine.easeOut');

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
  }

  /**
   * LFC-08: the overlay text is driven 100% by inbound server ticks. NO
   * client-side setInterval / time.delayedCall — server is authoritative for
   * the digit progression. Defensive early-return if the text wasn't created
   * yet (state-changed COUNTDOWN should have created it first, but a coalesced
   * frame could theoretically deliver the tick before our handler runs).
   */
  #onCountdownTick = (payload: MatchCountdownTickPayload): void => {
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

  #registerCustomEvents(): void {
    EVENT_BUS.on(CUSTOM_EVENTS.OPENED_CHEST, this.#handleOpenChest, this);
    EVENT_BUS.on(CUSTOM_EVENTS.ENEMY_DESTROYED, this.#checkForAllEnemiesAreDefeated, this);
    EVENT_BUS.on(CUSTOM_EVENTS.PLAYER_DEFEATED, this.#handlePlayerDefeatedEvent, this);
    EVENT_BUS.on(CUSTOM_EVENTS.DIALOG_CLOSED, this.#handleDialogClosed, this);
    EVENT_BUS.on(CUSTOM_EVENTS.BOSS_DEFEATED, this.#handleBossDefeated, this);
    EVENT_BUS.on(CUSTOM_EVENTS.DEBUG_SPAWN_FLYING_OBELISK, this.#spawnDebugFlyingObelisk, this);
    // Match FSM + server-driven countdown ticks (LFC-06..09)
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_COUNTDOWN_TICK, this.#onCountdownTick, this);
    // Phase 9.3 (Plan 03) — host-authoritative damage + elimination + respawn + spell-destroy.
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_DAMAGE_CONFIRMED, this.#onDamageConfirmed, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_SPELL_DESTROYED, this.#onSpellDestroyed, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_ELIMINATION, this.#onElimination, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_RESPAWN, this.#onRespawn, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.OPENED_CHEST, this.#handleOpenChest, this);
      EVENT_BUS.off(CUSTOM_EVENTS.ENEMY_DESTROYED, this.#checkForAllEnemiesAreDefeated, this);
      EVENT_BUS.off(CUSTOM_EVENTS.PLAYER_DEFEATED, this.#handlePlayerDefeatedEvent, this);
      EVENT_BUS.off(CUSTOM_EVENTS.DIALOG_CLOSED, this.#handleDialogClosed, this);
      EVENT_BUS.off(CUSTOM_EVENTS.BOSS_DEFEATED, this.#handleBossDefeated, this);
      EVENT_BUS.off(CUSTOM_EVENTS.DEBUG_SPAWN_FLYING_OBELISK, this.#spawnDebugFlyingObelisk, this);
      // Match FSM + countdown listener cleanup (LFC-06..09)
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_COUNTDOWN_TICK, this.#onCountdownTick, this);
      // Phase 9.3 (Plan 03) — damage / elimination / respawn / spell-destroy cleanup.
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DAMAGE_CONFIRMED, this.#onDamageConfirmed, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_SPELL_DESTROYED, this.#onSpellDestroyed, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_ELIMINATION, this.#onElimination, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_RESPAWN, this.#onRespawn, this);
      this.#appliedDamageSpellIds.clear();
      this.#clearLocalDeath();
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
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_PLAYER_DISCONNECTED, this.#onRemotePlayerDisconnected, this);
      EVENT_BUS.off(CUSTOM_EVENTS.SPELL_CAST, this.#onLocalSpellCast, this);
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
    // create main background
    this.add.image(0, 0, ASSET_KEYS[`${this.#levelData.level}_BACKGROUND`], 0).setOrigin(0);
    // create main foreground
    this.add.image(0, 0, ASSET_KEYS[`${this.#levelData.level}_FOREGROUND`], 0).setOrigin(0).setDepth(2);

    // create tilemap from Tiled json data
    const map = this.make.tilemap({
      key: ASSET_KEYS[`${this.#levelData.level}_LEVEL`],
    });

    // The first parameter is the name of the tileset in Tiled and the second parameter is the key
    // of the tileset image used when loading the file in preload.
    const collisionTiles = map.addTilesetImage(TILED_TILESET_NAMES.COLLISION, ASSET_KEYS.COLLISION);
    if (collisionTiles === null) {
      console.log(`encountered error while creating collision tiles from tiled`);
      return;
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
      const localId = NetworkManager.getInstance().localPlayerId;
      if (localId) this.#player.setData('playerId', localId);
    } catch {
      /* offline */
    }
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
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_PLAYER_DISCONNECTED, this.#onRemotePlayerDisconnected, this);
    EVENT_BUS.on(CUSTOM_EVENTS.SPELL_CAST, this.#onLocalSpellCast, this);
  }

  #buildLocalPlayerSnapshot(): PlayerUpdatePayload | null {
    if (!this.#player?.active) return null;
    return {
      x: this.#player.x,
      y: this.#player.y,
      direction: this.#player.direction,
      state: this.#player.stateMachine.currentStateName ?? 'IDLE_STATE',
      element: ElementManager.instance.activeElement,
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

    let remote = this.#remotePlayers.get(payload.playerId);
    if (!remote) {
      const tint = this.#resolveRemotePlayerTint(payload.playerId);
      const ric = new RemoteInputComponent();
      remote = new Player({
        scene: this,
        position: { x: payload.x, y: payload.y },
        controls: ric,
        maxLife: CONFIG.PLAYER_START_MAX_HEALTH,
        currentLife: CONFIG.PLAYER_START_MAX_HEALTH,
        tintColor: tint,
      });
      this.#remotePlayers.set(payload.playerId, remote);
      // Phase 9.3 (Plan 03): tag + register for cross-player overlap (PVP-02).
      remote.setData('playerId', payload.playerId);
      this.#remotePlayerGroup.add(remote);
    }

    // Store network target — per-frame interpolation in #interpolateRemotePlayers handles rendering
    const ric = remote.controls as RemoteInputComponent;
    if (typeof ric.applySnapshot === 'function') {
      ric.applySnapshot({ x: payload.x, y: payload.y, direction: payload.direction, state: payload.state, element: payload.element });
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
        remote.setFlipX(target.direction === DIRECTION.LEFT);
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
  #resolveRemotePlayerTint(playerId: string): number {
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
      const spell = factory(
        this,
        payload.x,
        payload.y,
        payload.targetX as number,
        payload.targetY as number,
        direction,
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

  #onRemoteEarthWallPillar = (payload: EarthWallPillarBroadcast): void => {
    const pillar = new EarthWallPillar(this, payload.x, payload.y);
    this.#earthWallGroup.add(pillar);
  };

  #onRemoteEarthWallPillarDestroy = (payload: EarthWallPillarDestroyBroadcast): void => {
    const children = this.#earthWallGroup.getChildren() as EarthWallPillar[];
    const match = children.find(
      (p) => p.active && !p.isBeingDestroyed && Math.abs(p.x - payload.x) < 2 && Math.abs(p.y - payload.y) < 2,
    );
    if (match) {
      match.takeDamage(99999);
    }
  };

  #onRemotePlayerDisconnected = (payload: PlayerDisconnectedPayload): void => {
    const remote = this.#remotePlayers.get(payload.playerId);
    if (remote) {
      remote.destroy();
      this.#remotePlayers.delete(payload.playerId);
    }
    const msg = this.add
      .bitmapText(this.cameras.main.centerX, this.cameras.main.centerY - 40, 'press_start_2p', 'A PLAYER DISCONNECTED', 8)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(999)
      .setTint(0xff4444);
    this.time.delayedCall(3000, () => msg.destroy());
  };
}
