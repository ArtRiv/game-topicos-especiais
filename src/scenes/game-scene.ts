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
import { EarthBump } from '../game-objects/spells/earth-bump';
import { ElementManager } from '../common/element-manager';
import {
  EARTH_WALL_MANA_COST,
  EARTH_WALL_PILLAR_COUNT,
  EARTH_WALL_PILLAR_SPACING,
  EARTH_WALL_FIREBOLT_SPLASH_RADIUS,
} from '../common/config';
import { NetworkManager } from '../networking/network-manager';
import { RemoteInputComponent } from '../components/input/remote-input-component';
import type { PlayerUpdateBroadcast, RoomTransitionPayload, PlayerDisconnectedPayload, PlayerUpdatePayload, SpellCastBroadcast, PlayerInfo, BreathStartBroadcast, BreathUpdateBroadcast, BreathEndBroadcast, EarthWallPillarBroadcast } from '../networking/types';
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
  #remoteFireBreaths = new Map<string, FireBreath>();

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

    this.#registerColliders();
    this.#registerCustomEvents();
    this.#setupNetworking();

    this.scene.launch(SCENE_KEYS.UI_SCENE);
  }

  public update(_time: number, delta: number): void {
    this.#handleHitboxDebugToggle();
    this.#updateFireSpellCombos();
    this.#updateFireBreathChanneling();
    this.#updateFireBreathAreaCombo();
    this.#updateEarthFireCombo();
    this.#updateEarthBoltFireAreaCombo();
    this.#updateEarthWallSpell();
    this.#handleRadialMenuInput();
    this.#interpolateRemotePlayers(delta);
  }

  #handleRadialMenuInput(): void {
    if (!this.#controls.isRadialMenuKeyJustDown) return;
    if (this.scene.isActive(SCENE_KEYS.RADIAL_MENU_SCENE)) return;
    this.scene.launch(SCENE_KEYS.RADIAL_MENU_SCENE);
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
    if (!this.#player?.active) return;
    // When Earth element is active, key 3 casts EarthWall — skip fire breath
    if (ElementManager.instance.activeElement === ELEMENT.EARTH) return;

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
    const fireBolts = allSpells.filter((spell): spell is FireBolt => spell instanceof FireBolt && spell.active);
    const fireAreas = allSpells.filter((spell): spell is FireArea => spell instanceof FireArea && spell.active);

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
    const earthBolts = allSpells.filter((s): s is EarthBolt => s instanceof EarthBolt && s.active);
    const fireBolts = allSpells.filter((s): s is FireBolt => s instanceof FireBolt && s.active);

    if (earthBolts.length === 0 || fireBolts.length === 0) {
      return;
    }

    for (const earthBolt of earthBolts) {
      for (const fireBolt of fireBolts) {
        // physics.overlap returns false once either body is disabled, preventing double-triggers
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
    const earthBolts = allSpells.filter((s): s is EarthBolt => s instanceof EarthBolt && s.active);
    const fireAreas = allSpells.filter((s): s is FireArea => s instanceof FireArea && s.active);

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

    // Phase 2: place a pillar whenever the cursor moves far enough from the last one
    const tx = this.#controls.mouseWorldX;
    const ty = this.#controls.mouseWorldY;

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

            // WaterSpike — damages each enemy once during the active phase
            if (spellObj instanceof WaterSpike) {
              spellObj.hitEnemy(enemyGameObject);
            }

            // EarthBump - heavily knocks back enemies it touches
            if (spellObj instanceof EarthBump) {
              spellObj.hitEnemy(enemyGameObject);
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
    });

    // Remote spells also explode on walls
    this.physics.add.collider(this.#remoteSpellGroup, this.#collisionLayer, (spellObj) => {
      if (spellObj instanceof FireBolt) {
        spellObj.explode();
      }
      if (spellObj instanceof EarthBolt) {
        spellObj.explode();
      }
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
        }
      },
    );
  }

  #registerCustomEvents(): void {
    EVENT_BUS.on(CUSTOM_EVENTS.OPENED_CHEST, this.#handleOpenChest, this);
    EVENT_BUS.on(CUSTOM_EVENTS.ENEMY_DESTROYED, this.#checkForAllEnemiesAreDefeated, this);
    EVENT_BUS.on(CUSTOM_EVENTS.PLAYER_DEFEATED, this.#handlePlayerDefeatedEvent, this);
    EVENT_BUS.on(CUSTOM_EVENTS.DIALOG_CLOSED, this.#handleDialogClosed, this);
    EVENT_BUS.on(CUSTOM_EVENTS.BOSS_DEFEATED, this.#handleBossDefeated, this);
    EVENT_BUS.on(CUSTOM_EVENTS.DEBUG_SPAWN_FLYING_OBELISK, this.#spawnDebugFlyingObelisk, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.OPENED_CHEST, this.#handleOpenChest, this);
      EVENT_BUS.off(CUSTOM_EVENTS.ENEMY_DESTROYED, this.#checkForAllEnemiesAreDefeated, this);
      EVENT_BUS.off(CUSTOM_EVENTS.PLAYER_DEFEATED, this.#handlePlayerDefeatedEvent, this);
      EVENT_BUS.off(CUSTOM_EVENTS.DIALOG_CLOSED, this.#handleDialogClosed, this);
      EVENT_BUS.off(CUSTOM_EVENTS.BOSS_DEFEATED, this.#handleBossDefeated, this);
      EVENT_BUS.off(CUSTOM_EVENTS.DEBUG_SPAWN_FLYING_OBELISK, this.#spawnDebugFlyingObelisk, this);
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
    }

    // Store network target — per-frame interpolation in #interpolateRemotePlayers handles rendering
    const ric = remote.controls as RemoteInputComponent;
    if (typeof ric.applySnapshot === 'function') {
      ric.applySnapshot({ x: payload.x, y: payload.y, direction: payload.direction, state: payload.state, element: payload.element });
    }
  };

  #interpolateRemotePlayers(delta: number): void {
    const lerpSpeed = 10;
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
          remote.stateMachine.setState(target.state);
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

  #onLocalSpellCast = (payload: { spellId: string; slotIndex: number; casterX: number; casterY: number; targetX: number; targetY: number }): void => {
    let nm: NetworkManager | null = null;
    try { nm = NetworkManager.getInstance(); } catch { return; }
    if (!nm?.isConnected || !this.#player?.active) return;
    nm.sendSpellCast({
      spellId: payload.spellId,
      element: ElementManager.instance.activeElement,
      x: payload.casterX,
      y: payload.casterY,
      direction: this.#player.direction,
      targetX: payload.targetX,
      targetY: payload.targetY,
    });
  };

  #onRemoteSpellCast = (payload: SpellCastBroadcast): void => {
    // Spawn the spell visual directly — do NOT re-emit SPELL_CAST (that would
    // trigger #onLocalSpellCast and re-broadcast, creating an infinite loop).
    let spell: { gameObject: Phaser.GameObjects.GameObject } | undefined;
    const { x, y, element, spellId, targetX, targetY } = payload;

    if (spellId === SPELL_ID.FIRE_BOLT) {
      if (element === ELEMENT.EARTH) {
        spell = new EarthBolt(this, x, y, targetX, targetY);
      } else if (element === ELEMENT.WATER) {
        spell = new WaterSpike(this, targetX, targetY);
      } else {
        spell = new FireBolt(this, x, y, targetX, targetY);
      }
    } else if (spellId === SPELL_ID.FIRE_AREA) {
      if (element === ELEMENT.WATER) {
        spell = new WaterTornado(this, targetX, targetY);
      } else if (element === ELEMENT.EARTH) {
        const dir = targetX < x ? DIRECTION.LEFT : DIRECTION.RIGHT;
        spell = new EarthBump(this, targetX, targetY, dir);
      } else {
        spell = new FireArea(this, targetX, targetY);
      }
    }

    if (spell) {
      this.#remoteSpellGroup.add(spell.gameObject);
      spell.gameObject.once(Phaser.GameObjects.Events.DESTROY, () => {
        this.#remoteSpellGroup.remove(spell!.gameObject, true);
      });
    }
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

  #onRemotePlayerDisconnected = (payload: PlayerDisconnectedPayload): void => {
    const remote = this.#remotePlayers.get(payload.playerId);
    if (remote) {
      remote.destroy();
      this.#remotePlayers.delete(payload.playerId);
    }
    const msg = this.add
      .text(this.cameras.main.centerX, this.cameras.main.centerY - 40, 'A player disconnected', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#ff4444',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(999);
    this.time.delayedCall(3000, () => msg.destroy());
  };
}
