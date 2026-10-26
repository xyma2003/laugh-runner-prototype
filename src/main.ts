import Phaser from "phaser";
import "./styles.css";
import {
  LAUGH_GUARD_MS,
  MAX_LAUGH_CHARGE,
  addLaughCharge,
  canReleaseLaugh,
  distanceScore,
  isLaughProtected,
  movePlayerX,
  postponeObstacleSpawn,
  runnerSpeed,
} from "./gameRules";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const FLOOR_Y = 586;
const PLAYER_X = 210;

type ObstacleKind = "crate" | "spike" | "drone" | "pit";
type PickupKind = "laugh" | "rage";

interface Obstacle {
  node: Phaser.GameObjects.Container;
  kind: ObstacleKind;
  width: number;
  height: number;
  centerOffsetY: number;
}

interface Pickup {
  node: Phaser.GameObjects.Container;
  kind: PickupKind;
  radius: number;
}

interface FrogVisual {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Ellipse;
  head: Phaser.GameObjects.Ellipse;
  belly: Phaser.GameObjects.Ellipse;
  leftArm: Phaser.GameObjects.Container;
  rightArm: Phaser.GameObjects.Container;
  leftLeg: Phaser.GameObjects.Container;
  rightLeg: Phaser.GameObjects.Container;
  eyes: Phaser.GameObjects.Ellipse[];
  pupils: Phaser.GameObjects.Ellipse[];
  normalMouth: Phaser.GameObjects.Rectangle;
  laughMouth: Phaser.GameObjects.Ellipse;
  laughTeeth: Phaser.GameObjects.Rectangle;
  laughTongue: Phaser.GameObjects.Ellipse;
}

class TinyAudio {
  private context: AudioContext | null = null;

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
  }

  tone(
    frequency: number,
    duration = 0.08,
    type: OscillatorType = "sine",
    volume = 0.045,
    delay = 0,
  ): void {
    if (!this.context) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(55, frequency * 0.82),
      start + duration,
    );
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  jump(): void {
    this.tone(420, 0.08, "square", 0.035);
    this.tone(650, 0.06, "square", 0.025, 0.055);
  }

  collect(step: number): void {
    this.tone(550 + step * 120, 0.09, "triangle", 0.04);
  }

  laugh(): void {
    [180, 230, 170, 290].forEach((frequency, index) => {
      this.tone(frequency, 0.12, "sawtooth", 0.045, index * 0.075);
    });
  }

  crash(): void {
    this.tone(100, 0.32, "sawtooth", 0.065);
  }
}

class RunnerScene extends Phaser.Scene {
  private frog!: FrogVisual;
  private obstacles: Obstacle[] = [];
  private pickups: Pickup[] = [];
  private laneMarks: Phaser.GameObjects.Rectangle[] = [];
  private clouds: Phaser.GameObjects.Container[] = [];
  private running = false;
  private over = false;
  private autoStart = false;
  private elapsedSeconds = 0;
  private distanceMeters = 0;
  private bonusScore = 0;
  private verticalVelocity = 0;
  private playerX = PLAYER_X;
  private jumpsUsed = 0;
  private rollingUntil = 0;
  private laughingUntil = 0;
  private laughGuardUntil = 0;
  private rageUntil = 0;
  private laughCharge = 0;
  private nextObstacleAt = 0;
  private nextPickupAt = 0;
  private nextRageAt = 0;
  private obstaclesSpawned = 0;
  private laughPickupsSpawned = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private distanceText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private chargeSlots: Phaser.GameObjects.Arc[] = [];
  private chargeLabel!: Phaser.GameObjects.Text;
  private hintVersion = 0;
  private leftKey?: Phaser.Input.Keyboard.Key;
  private rightKey?: Phaser.Input.Keyboard.Key;
  private touchLeftDown = false;
  private touchRightDown = false;
  private frogSprite?: HTMLImageElement;
  private gameFrame?: HTMLElement;
  private frogSpriteState = "";
  private lastHorizontalDirection = 1;
  private audio = new TinyAudio();

  constructor() {
    super("runner");
  }

  init(data: { autoStart?: boolean }): void {
    this.autoStart = Boolean(data.autoStart);
  }

  create(): void {
    this.obstacles = [];
    this.pickups = [];
    this.laneMarks = [];
    this.clouds = [];
    this.running = false;
    this.over = false;
    this.elapsedSeconds = 0;
    this.distanceMeters = 0;
    this.bonusScore = 0;
    this.verticalVelocity = 0;
    this.playerX = PLAYER_X;
    this.jumpsUsed = 0;
    this.rollingUntil = 0;
    this.laughingUntil = 0;
    this.laughGuardUntil = 0;
    this.rageUntil = 0;
    this.laughCharge = 0;
    this.obstaclesSpawned = 0;
    this.laughPickupsSpawned = 0;
    this.hintVersion = 0;
    this.frogSpriteState = "";
    this.lastHorizontalDirection = 1;

    this.createBackground();
    this.frog = this.createFrog();
    this.frog.container.setVisible(false);
    this.frogSprite = document.querySelector<HTMLImageElement>("#frogSprite") ?? undefined;
    this.gameFrame = document.querySelector<HTMLElement>("#gameFrame") ?? undefined;
    this.setFrogSpriteState("running-right");
    this.syncFrogSprite(0);
    this.syncGameState(0);
    this.createHud();
    this.bindControls();

    const overlay = document.querySelector<HTMLDivElement>("#startOverlay");
    const startButton = document.querySelector<HTMLButtonElement>("#startButton");
    if (startButton) {
      startButton.onclick = () => {
        overlay?.classList.add("is-hidden");
        this.startRun();
      };
    }

    if (this.autoStart) {
      overlay?.classList.add("is-hidden");
      this.startRun();
    } else {
      overlay?.classList.remove("is-hidden");
    }
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.04);
    const animationPhase = time * 0.016;

    this.animateFrog(animationPhase, time);

    if (!this.running || this.over) {
      this.syncFrogSprite(time);
      this.syncGameState(time);
      this.moveScenery(dt, 70);
      return;
    }

    this.elapsedSeconds += dt;
    const speed = runnerSpeed(this.elapsedSeconds);
    this.distanceMeters += speed * dt * 0.011;

    this.updatePlayer(dt, time);
    this.syncFrogSprite(time);
    this.moveScenery(dt, speed);
    this.updateWorldObjects(dt, speed, time);
    this.spawnWorldObjects(time);
    this.checkCollisions(time);
    this.updateHud();
    this.syncGameState(time);
  }

  private startRun(): void {
    if (this.running || this.over) return;
    this.audio.unlock();
    this.running = true;
    this.setFrogSpriteState("running-right");
    const now = this.time.now;
    // Let a new player collect the first three teaching faces before the first obstacle arrives.
    this.nextObstacleAt = now + 10000;
    this.nextPickupAt = now + 600;
    this.nextRageAt = now + 9000;
    this.showHint("A/D移动 · 空格跳跃 · S翻滚 · E大笑", 3200);
  }

  private createBackground(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xa8e5ec).setOrigin(0).setDepth(-20);

    const sun = this.add.circle(1070, 110, 64, 0xffdb55).setDepth(-18);
    sun.setStrokeStyle(7, 0x2b5960, 0.2);

    const farHill = this.add.graphics().setDepth(-16);
    farHill.fillStyle(0x8ecf98, 1);
    farHill.beginPath();
    farHill.moveTo(0, 500);
    farHill.lineTo(0, 390);
    farHill.lineTo(180, 245);
    farHill.lineTo(360, 388);
    farHill.lineTo(560, 210);
    farHill.lineTo(770, 382);
    farHill.lineTo(990, 235);
    farHill.lineTo(1280, 400);
    farHill.lineTo(1280, 500);
    farHill.closePath();
    farHill.fillPath();

    const nearHill = this.add.graphics().setDepth(-14);
    nearHill.fillStyle(0x57a479, 1);
    nearHill.beginPath();
    nearHill.moveTo(0, 540);
    nearHill.lineTo(0, 460);
    nearHill.lineTo(240, 350);
    nearHill.lineTo(480, 475);
    nearHill.lineTo(740, 330);
    nearHill.lineTo(1040, 470);
    nearHill.lineTo(1280, 360);
    nearHill.lineTo(1280, 540);
    nearHill.closePath();
    nearHill.fillPath();

    for (let index = 0; index < 5; index += 1) {
      const cloud = this.add.container(130 + index * 290, 110 + (index % 2) * 68).setDepth(-17);
      cloud.add([
        this.add.ellipse(-34, 4, 82, 38, 0xffffff, 0.75),
        this.add.ellipse(16, 0, 96, 46, 0xffffff, 0.8),
        this.add.circle(0, -19, 32, 0xffffff, 0.8),
      ]);
      this.clouds.push(cloud);
    }

    this.add.rectangle(0, FLOOR_Y, GAME_WIDTH, 134, 0x38524a).setOrigin(0, 0).setDepth(-4);
    this.add.rectangle(0, FLOOR_Y, GAME_WIDTH, 14, 0x243b38).setOrigin(0, 0).setDepth(-3);
    this.add.rectangle(0, FLOOR_Y + 14, GAME_WIDTH, 120, 0x526b59).setOrigin(0, 0).setDepth(-5);

    for (let index = 0; index < 12; index += 1) {
      const mark = this.add
        .rectangle(index * 128, FLOOR_Y + 76, 78, 10, 0xf1dc83, 0.65)
        .setDepth(-2);
      this.laneMarks.push(mark);
    }

    const skyline = this.add.graphics().setDepth(-10);
    skyline.fillStyle(0x2f6d68, 0.58);
    for (let x = 20; x < GAME_WIDTH; x += 82) {
      const height = 45 + ((x * 17) % 90);
      skyline.fillRoundedRect(x, FLOOR_Y - height - 10, 56, height, 7);
      skyline.fillStyle(0xd8f0a3, 0.55);
      skyline.fillRect(x + 12, FLOOR_Y - height + 8, 9, 12);
      skyline.fillRect(x + 35, FLOOR_Y - height + 8, 9, 12);
      skyline.fillStyle(0x2f6d68, 0.58);
    }
  }

  private createFrog(): FrogVisual {
    const container = this.add.container(PLAYER_X, FLOOR_Y).setDepth(5);

    const createLeg = (x: number, footDirection: number): Phaser.GameObjects.Container => {
      const leg = this.add.container(x, -63);
      const shin = this.add.ellipse(0, 29, 27, 68, 0xe0ad2e).setStrokeStyle(5, 0x31382b);
      const foot = this.add
        .ellipse(footDirection * 6, 61, 45, 19, 0x4b4730)
        .setStrokeStyle(4, 0x31382b);
      const toeA = this.add.circle(footDirection * 15, 60, 3, 0x29291f);
      const toeB = this.add.circle(footDirection * 6, 62, 3, 0x29291f);
      leg.add([shin, foot, toeA, toeB]);
      return leg;
    };

    const createArm = (x: number): Phaser.GameObjects.Container => {
      const arm = this.add.container(x, -126);
      const upper = this.add.ellipse(0, 35, 27, 78, 0xefbd38).setStrokeStyle(5, 0x31382b);
      const hand = this.add.ellipse(0, 72, 27, 25, 0x4b4730).setStrokeStyle(4, 0x31382b);
      const fingerA = this.add.rectangle(-5, 75, 3, 12, 0x29291f).setAngle(-10);
      const fingerB = this.add.rectangle(2, 76, 3, 12, 0x29291f).setAngle(4);
      arm.add([upper, hand, fingerA, fingerB]);
      return arm;
    };

    const leftLeg = createLeg(-31, -1);
    const rightLeg = createLeg(31, 1);
    const body = this.add.ellipse(0, -79, 126, 158, 0xefbd38).setStrokeStyle(6, 0x31382b);
    const head = this.add.ellipse(0, -148, 82, 82, 0xf3c447).setStrokeStyle(6, 0x31382b);
    const belly = this.add.ellipse(0, -72, 91, 108, 0xf4d590).setStrokeStyle(3, 0xc7953a, 0.72);
    const leftArm = createArm(-50);
    const rightArm = createArm(50);

    const leftEye = this.add.ellipse(-20, -177, 28, 29, 0xa7c96b).setStrokeStyle(5, 0x31382b);
    const rightEye = this.add.ellipse(20, -177, 28, 29, 0xa7c96b).setStrokeStyle(5, 0x31382b);
    const leftPupil = this.add.ellipse(-18, -176, 8, 10, 0x171914);
    const rightPupil = this.add.ellipse(22, -176, 8, 10, 0x171914);
    const normalMouth = this.add.rectangle(0, -148, 25, 4, 0x31382b).setAngle(2);

    const laughMouth = this.add
      .ellipse(0, -143, 50, 42, 0x171914)
      .setStrokeStyle(5, 0x31382b)
      .setVisible(false);
    const laughTeeth = this.add.rectangle(0, -154, 31, 8, 0xfff7dc).setVisible(false);
    const laughTongue = this.add.ellipse(0, -130, 25, 10, 0xcc5547).setVisible(false);

    container.add([
      leftLeg,
      rightLeg,
      body,
      head,
      belly,
      leftArm,
      rightArm,
      leftEye,
      rightEye,
      leftPupil,
      rightPupil,
      normalMouth,
      laughMouth,
      laughTeeth,
      laughTongue,
    ]);

    return {
      container,
      body,
      head,
      belly,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      eyes: [leftEye, rightEye],
      pupils: [leftPupil, rightPupil],
      normalMouth,
      laughMouth,
      laughTeeth,
      laughTongue,
    };
  }

  private createHud(): void {
    this.scoreText = this.add
      .text(34, 25, "000000", {
        fontFamily: "Nunito, sans-serif",
        fontSize: "34px",
        fontStyle: "900",
        color: "#18262d",
        stroke: "#fff9df",
        strokeThickness: 8,
      })
      .setDepth(20);
    this.distanceText = this.add
      .text(36, 70, "0 m", {
        fontFamily: "Nunito, sans-serif",
        fontSize: "20px",
        color: "#315d5b",
        stroke: "#fff9df",
        strokeThickness: 5,
      })
      .setDepth(20);

    this.add
      .rectangle(GAME_WIDTH - 192, 56, 330, 82, 0xfff9df, 0.92)
      .setStrokeStyle(4, 0x18262d)
      .setDepth(19);
    this.add
      .text(GAME_WIDTH - 333, 26, "大笑合成", {
        fontFamily: "Nunito, sans-serif",
        fontSize: "17px",
        fontStyle: "900",
        color: "#315d5b",
      })
      .setDepth(20);

    for (let index = 0; index < MAX_LAUGH_CHARGE; index += 1) {
      const slot = this.add
        .circle(GAME_WIDTH - 204 + index * 52, 61, 18, 0xe4ddbf)
        .setStrokeStyle(4, 0x18262d)
        .setDepth(20);
      this.chargeSlots.push(slot);
      this.add
        .text(slot.x, slot.y - 1, "笑", {
          fontFamily: "ZCOOL KuaiLe, sans-serif",
          fontSize: "16px",
          color: "#18262d",
        })
        .setOrigin(0.5)
        .setDepth(21);
    }
    this.chargeLabel = this.add
      .text(GAME_WIDTH - 62, 52, "差3只", {
        fontFamily: "Nunito, sans-serif",
        fontSize: "14px",
        fontStyle: "900",
        color: "#ba4f2d",
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.hintText = this.add
      .text(GAME_WIDTH / 2, 124, "", {
        fontFamily: "Nunito, sans-serif",
        fontSize: "22px",
        fontStyle: "900",
        color: "#fff9df",
        backgroundColor: "#18262ddd",
        padding: { x: 14, y: 7 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);
  }

  private bindControls(): void {
    this.leftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.rightKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.input.keyboard?.on("keydown-A", (event: KeyboardEvent) => {
      if (!event.repeat) this.playerX = movePlayerX(this.playerX, -1, 0.035);
    });
    this.input.keyboard?.on("keydown-D", (event: KeyboardEvent) => {
      if (!event.repeat) this.playerX = movePlayerX(this.playerX, 1, 0.035);
    });
    this.input.keyboard?.on("keydown-SPACE", () => this.jump());
    this.input.keyboard?.on("keydown-UP", () => this.jump());
    this.input.keyboard?.on("keydown-S", () => this.roll());
    this.input.keyboard?.on("keydown-DOWN", () => this.roll());
    this.input.keyboard?.on("keydown-E", () => this.releaseLaugh());
    this.input.on("pointerdown", () => {
      if (this.running && !this.over) this.jump();
    });

    const leftButton = document.querySelector<HTMLButtonElement>("#leftButton");
    const rightButton = document.querySelector<HTMLButtonElement>("#rightButton");
    const jumpButton = document.querySelector<HTMLButtonElement>("#jumpButton");
    const rollButton = document.querySelector<HTMLButtonElement>("#rollButton");
    const laughButton = document.querySelector<HTMLButtonElement>("#laughButton");
    if (leftButton) {
      leftButton.onpointerdown = (event) => { event.stopPropagation(); this.touchLeftDown = true; };
      leftButton.onpointerup = () => { this.touchLeftDown = false; };
      leftButton.onpointerleave = () => { this.touchLeftDown = false; };
      leftButton.onpointercancel = () => { this.touchLeftDown = false; };
    }
    if (rightButton) {
      rightButton.onpointerdown = (event) => { event.stopPropagation(); this.touchRightDown = true; };
      rightButton.onpointerup = () => { this.touchRightDown = false; };
      rightButton.onpointerleave = () => { this.touchRightDown = false; };
      rightButton.onpointercancel = () => { this.touchRightDown = false; };
    }
    if (jumpButton) jumpButton.onclick = (event) => { event.stopPropagation(); this.jump(); };
    if (rollButton) rollButton.onclick = (event) => { event.stopPropagation(); this.roll(); };
    if (laughButton) laughButton.onclick = (event) => { event.stopPropagation(); this.releaseLaugh(); };
  }

  private jump(): void {
    if (!this.running || this.over) return;
    this.audio.unlock();
    if (this.jumpsUsed >= 2) return;

    this.verticalVelocity = this.jumpsUsed === 0 ? -885 : -760;
    this.jumpsUsed += 1;
    this.rollingUntil = 0;
    this.audio.jump();
    this.burst(this.frog.container.x, this.frog.container.y - 4, 0xffe56f, 5, 0.6);
  }

  private roll(): void {
    if (!this.running || this.over) return;
    this.audio.unlock();
    const onGround = this.frog.container.y >= FLOOR_Y - 1;
    if (!onGround) return;
    this.rollingUntil = this.time.now + 620;
    this.audio.tone(155, 0.11, "triangle", 0.04);
  }

  private releaseLaugh(): void {
    if (!this.running || this.over) return;
    this.audio.unlock();
    if (!canReleaseLaugh(this.laughCharge)) {
      const missing = MAX_LAUGH_CHARGE - this.laughCharge;
      this.showHint(`还差 ${missing} 只大笑形态`, 700);
      return;
    }

    this.laughCharge = 0;
    this.audio.laugh();
    this.cameras.main.shake(330, 0.013);
    this.laughingUntil = this.time.now + 1250;
    this.laughGuardUntil = this.time.now + LAUGH_GUARD_MS;
    this.nextObstacleAt = postponeObstacleSpawn(this.nextObstacleAt, this.time.now);
    this.setLaughPose(true);
    this.time.delayedCall(1250, () => this.setLaughPose(false));

    const pulse = this.add
      .circle(this.frog.container.x + 22, this.frog.container.y - 64, 34, 0xffe55e, 0.12)
      .setStrokeStyle(9, 0xfff4ad, 0.95)
      .setDepth(12);
    this.tweens.add({
      targets: pulse,
      radius: 520,
      alpha: 0,
      duration: 520,
      ease: "Cubic.Out",
      onComplete: () => pulse.destroy(),
    });

    const destroyed = this.obstacles.length;
    for (const obstacle of [...this.obstacles]) {
      this.destroyObstacle(obstacle, true);
    }
    // A laugh is a complete obstacle-field reset. Do not leave stale collision entries behind.
    this.obstacles = [];
    this.bonusScore += destroyed * 180;
    this.showHint(
      destroyed > 0
        ? `齁哈哈哈！清场 ${destroyed} 个障碍 · 道路刷新 · 3秒无敌`
        : "齁哈哈哈！道路刷新 · 3秒无敌",
      1250,
    );
    this.updateHud();
  }

  private updatePlayer(dt: number, time: number): void {
    const horizontalDirection =
      ((this.rightKey?.isDown || this.touchRightDown) ? 1 : 0) -
      ((this.leftKey?.isDown || this.touchLeftDown) ? 1 : 0);
    if (horizontalDirection !== 0) this.lastHorizontalDirection = horizontalDirection;
    if (time >= this.laughingUntil) {
      this.setFrogSpriteState(this.lastHorizontalDirection < 0 ? "running-left" : "running-right");
    }
    this.playerX = movePlayerX(this.playerX, horizontalDirection, dt);
    this.frog.container.x = this.playerX + Math.sin(time * 0.008) * 2.5;

    const onGround = this.frog.container.y >= FLOOR_Y - 0.5;
    if (!onGround || this.verticalVelocity < 0) {
      this.verticalVelocity += 2150 * dt;
      this.frog.container.y += this.verticalVelocity * dt;
    }

    if (this.frog.container.y >= FLOOR_Y) {
      this.frog.container.y = FLOOR_Y;
      this.verticalVelocity = 0;
      this.jumpsUsed = 0;
    }

    const rolling = time < this.rollingUntil;
    const laughing = time < this.laughingUntil;
    const raging = time < this.rageUntil;
    const targetScaleX = laughing ? 1.08 : 1;
    const targetScaleY = rolling ? 0.58 : laughing ? 0.94 : 1;
    const targetAngle = rolling
      ? 360 * ((time % 560) / 560)
      : laughing
        ? Math.sin(time * 0.075) * 5
        : 0;
    this.frog.container.scaleX = Phaser.Math.Linear(this.frog.container.scaleX, targetScaleX, 0.25);
    this.frog.container.scaleY = Phaser.Math.Linear(this.frog.container.scaleY, targetScaleY, 0.25);
    this.frog.container.angle = Phaser.Math.Angle.RotateTo(
      Phaser.Math.DegToRad(this.frog.container.angle),
      Phaser.Math.DegToRad(targetAngle),
      0.28,
    ) * (180 / Math.PI);
    this.frog.body.setFillStyle(raging ? 0xff7b42 : 0xefbd38);
    this.frog.head.setFillStyle(raging ? 0xff8a4d : 0xf3c447);
    this.frog.belly.setFillStyle(raging ? 0xffb146 : 0xf4d590);
  }

  private animateFrog(phase: number, time: number): void {
    const activePace = this.running && !this.over ? 1 : 0.35;
    const swing = Math.sin(phase * activePace);
    const reverseSwing = Math.sin(phase * activePace + Math.PI);
    const rolling = time < this.rollingUntil;
    const laughing = time < this.laughingUntil;

    if (laughing) {
      this.frog.leftArm.rotation = -0.64 + Math.sin(phase * 2.8) * 0.05;
      this.frog.rightArm.rotation = 0.64 - Math.sin(phase * 2.8) * 0.05;
      this.frog.leftLeg.rotation = -0.1;
      this.frog.rightLeg.rotation = 0.1;
      this.frog.belly.scaleX = 1 + Math.abs(Math.sin(phase * 2.6)) * 0.075;
      this.frog.belly.scaleY = 1 - Math.abs(Math.sin(phase * 2.6)) * 0.04;
    } else if (!rolling) {
      this.frog.leftArm.rotation = swing * 0.72;
      this.frog.rightArm.rotation = reverseSwing * 0.72;
      this.frog.leftLeg.rotation = reverseSwing * 0.62;
      this.frog.rightLeg.rotation = swing * 0.62;
      this.frog.belly.scaleX = 1 + Math.abs(swing) * 0.035;
      this.frog.belly.scaleY = 1 - Math.abs(swing) * 0.028;
    }

    this.frog.pupils[0].x = -18 + Math.sin(phase * 0.31) * 2;
    this.frog.pupils[1].x = 22 + Math.sin(phase * 0.31) * 2;
  }

  private setLaughPose(active: boolean): void {
    this.frog.normalMouth.setVisible(!active);
    this.frog.laughMouth.setVisible(active);
    this.frog.laughTeeth.setVisible(active);
    this.frog.laughTongue.setVisible(active);
    this.frog.pupils.forEach((pupil) => pupil.setVisible(!active));
    this.frog.eyes.forEach((eye) => eye.setScale(1, active ? 0.46 : 1));
    this.setFrogSpriteState(
      active ? "belly-laugh" : this.lastHorizontalDirection < 0 ? "running-left" : "running-right",
    );
  }

  private setFrogSpriteState(state: "running-left" | "running-right" | "belly-laugh"): void {
    if (!this.frogSprite || this.frogSpriteState === state) return;
    this.frogSpriteState = state;
    const sources = {
      "running-left": "/assets/naiwa-running-left.gif",
      "running-right": "/assets/naiwa-running-right.gif",
      "belly-laugh": "/assets/naiwa-belly-laugh.gif",
    } as const;
    this.frogSprite.src = sources[state];
    this.frogSprite.classList.toggle("is-laughing", state === "belly-laugh");
  }

  private syncFrogSprite(time: number): void {
    if (!this.frogSprite) return;
    this.frogSprite.style.left = `${(this.frog.container.x / GAME_WIDTH) * 100}%`;
    this.frogSprite.style.top = `${(this.frog.container.y / GAME_HEIGHT) * 100}%`;
    this.frogSprite.style.transform =
      `translate(-50%, -100%) rotate(${this.frog.container.angle}deg) ` +
      `scale(${this.frog.container.scaleX}, ${this.frog.container.scaleY})`;
    this.frogSprite.classList.toggle("is-protected", isLaughProtected(time, this.laughGuardUntil));
  }

  private syncGameState(time: number): void {
    if (!this.gameFrame) return;
    this.gameFrame.dataset.laughCharge = String(this.laughCharge);
    this.gameFrame.dataset.running = String(this.running && !this.over);
    this.gameFrame.dataset.protected = String(isLaughProtected(time, this.laughGuardUntil));
    this.gameFrame.dataset.spriteState = this.frogSpriteState;
    this.gameFrame.dataset.playerX = String(Math.round(this.playerX));
    this.gameFrame.dataset.obstacleCount = String(this.obstacles.length);
  }

  private moveScenery(dt: number, speed: number): void {
    for (const mark of this.laneMarks) {
      mark.x -= speed * dt;
      if (mark.x < -80) mark.x += GAME_WIDTH + 150;
    }
    for (const cloud of this.clouds) {
      cloud.x -= speed * dt * 0.035;
      if (cloud.x < -130) cloud.x += GAME_WIDTH + 300;
    }
  }

  private spawnWorldObjects(time: number): void {
    if (time >= this.nextObstacleAt) {
      this.spawnObstacle();
      const interval = Phaser.Math.Clamp(1450 - this.elapsedSeconds * 9, 820, 1450);
      this.nextObstacleAt = time + interval + Phaser.Math.Between(-110, 170);
    }
    if (time >= this.nextPickupAt) {
      this.spawnPickup("laugh");
      this.nextPickupAt = time + (this.laughPickupsSpawned < 3 ? 1100 : Phaser.Math.Between(1900, 2850));
    }
    if (time >= this.nextRageAt) {
      this.spawnPickup("rage");
      this.nextRageAt = time + Phaser.Math.Between(12500, 18000);
    }
  }

  private spawnObstacle(): void {
    const roll = Math.random();
    const kind: ObstacleKind = this.obstaclesSpawned === 0
      ? "crate"
      : this.obstaclesSpawned === 1
        ? "spike"
        : roll < 0.35
          ? "crate"
          : roll < 0.6
            ? "spike"
            : roll < 0.82
              ? "drone"
              : "pit";
    this.obstaclesSpawned += 1;
    // Keep enough reaction distance even when the player runs near the right edge.
    const spawnX = Math.max(GAME_WIDTH + 100, this.playerX + 620);
    const node = this.add.container(spawnX, FLOOR_Y).setDepth(4);
    let width = 70;
    let height = 70;
    let centerOffsetY = -35;

    if (kind === "crate") {
      const box = this.add.rectangle(0, -36, 72, 72, 0xe87d3e).setStrokeStyle(6, 0x18262d);
      const stripeA = this.add.rectangle(0, -36, 62, 8, 0xffc75d).setAngle(45);
      const stripeB = this.add.rectangle(0, -36, 62, 8, 0xffc75d).setAngle(-45);
      node.add([box, stripeA, stripeB]);
    } else if (kind === "spike") {
      const graphic = this.add.graphics();
      graphic.fillStyle(0xf45d48, 1);
      graphic.lineStyle(6, 0x18262d, 1);
      graphic.beginPath();
      graphic.moveTo(-39, 0);
      graphic.lineTo(-19, -47);
      graphic.lineTo(0, 0);
      graphic.lineTo(20, -47);
      graphic.lineTo(40, 0);
      graphic.closePath();
      graphic.fillPath();
      graphic.strokePath();
      node.add(graphic);
      width = 76;
      height = 44;
      centerOffsetY = -22;
    } else if (kind === "drone") {
      const leftWing = this.add.rectangle(-50, -110, 60, 8, 0x263d45).setAngle(-8);
      const rightWing = this.add.rectangle(50, -110, 60, 8, 0x263d45).setAngle(8);
      const body = this.add.ellipse(0, -102, 88, 52, 0x6a62d2).setStrokeStyle(6, 0x18262d);
      const eye = this.add.circle(13, -104, 9, 0xffdd55).setStrokeStyle(3, 0x18262d);
      node.add([leftWing, rightWing, body, eye]);
      width = 110;
      height = 54;
      centerOffsetY = -103;
    } else {
      const shadow = this.add.ellipse(0, -2, 104, 30, 0x11191d, 0.9).setStrokeStyle(5, 0x18262d);
      const crackA = this.add.rectangle(-22, -8, 44, 6, 0xffd75a).setAngle(18);
      const crackB = this.add.rectangle(18, 0, 48, 6, 0xffd75a).setAngle(-15);
      node.add([shadow, crackA, crackB]);
      width = 96;
      height = 20;
      centerOffsetY = -8;
    }

    this.obstacles.push({ node, kind, width, height, centerOffsetY });
  }

  private spawnPickup(kind: PickupKind): void {
    const isTeachingLaugh = kind === "laugh" && this.laughPickupsSpawned < 3;
    const high = !isTeachingLaugh && Math.random() > 0.52;
    const y = kind === "rage" ? FLOOR_Y - 120 : high ? FLOOR_Y - 205 : FLOOR_Y - 116;
    const node = this.add.container(GAME_WIDTH + 90, y).setDepth(6);
    const fill = kind === "laugh" ? 0xffda48 : 0xff7448;
    const aura = this.add.circle(0, 0, kind === "laugh" ? 33 : 38, fill, 0.2);
    const face = this.add.circle(0, 0, kind === "laugh" ? 24 : 29, fill).setStrokeStyle(5, 0x18262d);
    const leftEye = this.add.circle(-9, -6, 3.5, 0x18262d);
    const rightEye = this.add.circle(9, -6, 3.5, 0x18262d);
    const mouth = this.add.graphics();
    mouth.lineStyle(4, 0x18262d, 1);
    if (kind === "laugh") {
      mouth.beginPath();
      mouth.arc(0, 2, 11, 0.1, Math.PI - 0.1, false);
      mouth.strokePath();
    } else {
      mouth.beginPath();
      mouth.moveTo(-12, -12);
      mouth.lineTo(-3, -8);
      mouth.moveTo(12, -12);
      mouth.lineTo(3, -8);
      mouth.strokePath();
      mouth.fillStyle(0x18262d, 1);
      mouth.fillRect(-10, 6, 20, 5);
    }
    node.add([aura, face, leftEye, rightEye, mouth]);
    this.tweens.add({
      targets: aura,
      scale: 1.28,
      alpha: 0.02,
      duration: 520,
      yoyo: true,
      repeat: -1,
    });
    this.pickups.push({ node, kind, radius: kind === "laugh" ? 28 : 34 });
    if (kind === "laugh") this.laughPickupsSpawned += 1;
  }

  private updateWorldObjects(dt: number, speed: number, time: number): void {
    for (const obstacle of [...this.obstacles]) {
      obstacle.node.x -= speed * dt;
      if (obstacle.kind === "drone") {
        obstacle.node.y = Math.sin(time * 0.006 + obstacle.node.x * 0.01) * 12;
      }
      if (obstacle.node.x < -140) this.removeObstacle(obstacle);
    }

    for (const pickup of [...this.pickups]) {
      pickup.node.x -= speed * dt;
      pickup.node.angle += dt * 35;
      if (pickup.node.x < -90) this.removePickup(pickup);
    }
  }

  private checkCollisions(time: number): void {
    const playerBounds = this.playerBounds(time);
    const raging = time < this.rageUntil;
    const laughProtected = isLaughProtected(time, this.laughGuardUntil);

    for (const pickup of [...this.pickups]) {
      const pickupBounds = new Phaser.Geom.Rectangle(
        pickup.node.x - pickup.radius,
        pickup.node.y - pickup.radius,
        pickup.radius * 2,
        pickup.radius * 2,
      );
      if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, pickupBounds)) {
        this.collectPickup(pickup, time);
      }
    }

    for (const obstacle of [...this.obstacles]) {
      const obstacleBounds = new Phaser.Geom.Rectangle(
        obstacle.node.x - obstacle.width / 2,
        FLOOR_Y + obstacle.centerOffsetY - obstacle.height / 2,
        obstacle.width,
        obstacle.height,
      );
      if (!Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, obstacleBounds)) continue;

      if (laughProtected) {
        this.destroyObstacle(obstacle, obstacle.kind !== "pit");
        continue;
      }

      if (raging && obstacle.kind !== "pit") {
        this.destroyObstacle(obstacle, true);
        this.bonusScore += 120;
        this.audio.tone(120, 0.08, "square", 0.035);
      } else {
        this.gameOver();
        return;
      }
    }
  }

  private playerBounds(time: number): Phaser.Geom.Rectangle {
    const rolling = time < this.rollingUntil;
    const width = rolling ? 92 : 82;
    const height = rolling ? 72 : 164;
    return new Phaser.Geom.Rectangle(
      this.frog.container.x - width / 2,
      this.frog.container.y - height,
      width,
      height,
    );
  }

  private collectPickup(pickup: Pickup, time: number): void {
    const x = pickup.node.x;
    const y = pickup.node.y;
    if (pickup.kind === "laugh") {
      this.laughCharge = addLaughCharge(this.laughCharge);
      this.bonusScore += 75;
      this.audio.collect(this.laughCharge);
      this.showHint(
        canReleaseLaugh(this.laughCharge) ? "大笑已合成！按 E 释放" : `大笑合成 ${this.laughCharge}/3`,
        canReleaseLaugh(this.laughCharge) ? 1500 : 800,
      );
      this.burst(x, y, 0xffdf56, 9, 1);
    } else {
      this.rageUntil = time + 3100;
      this.bonusScore += 150;
      this.audio.tone(145, 0.28, "sawtooth", 0.06);
      this.showHint("气鼓鼓暴走！撞飞前方障碍", 1500);
      this.burst(x, y, 0xff7448, 13, 1.2);
      this.cameras.main.flash(120, 255, 140, 70, false);
    }
    this.removePickup(pickup);
    this.updateHud();
  }

  private destroyObstacle(obstacle: Obstacle, dramatic: boolean): void {
    if (!this.obstacles.includes(obstacle)) return;
    if (dramatic) {
      const color = obstacle.kind === "drone" ? 0x877ee5 : 0xff8b49;
      this.burst(obstacle.node.x, FLOOR_Y + obstacle.centerOffsetY, color, 8, 1.15);
    }
    this.removeObstacle(obstacle);
  }

  private removeObstacle(obstacle: Obstacle): void {
    const index = this.obstacles.indexOf(obstacle);
    if (index >= 0) this.obstacles.splice(index, 1);
    obstacle.node.destroy(true);
  }

  private removePickup(pickup: Pickup): void {
    const index = this.pickups.indexOf(pickup);
    if (index >= 0) this.pickups.splice(index, 1);
    pickup.node.destroy(true);
  }

  private burst(
    x: number,
    y: number,
    color: number,
    count: number,
    power: number,
  ): void {
    for (let index = 0; index < count; index += 1) {
      const particle = this.add
        .circle(x, y, Phaser.Math.Between(4, 9), color, 0.95)
        .setDepth(15);
      const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
      const distance = Phaser.Math.Between(45, 115) * power;
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.25,
        duration: Phaser.Math.Between(280, 520),
        ease: "Cubic.Out",
        onComplete: () => particle.destroy(),
      });
    }
  }

  private updateHud(): void {
    const score = distanceScore(this.distanceMeters, this.bonusScore);
    this.scoreText.setText(score.toString().padStart(6, "0"));
    this.distanceText.setText(`${Math.floor(this.distanceMeters)} m`);
    this.chargeSlots.forEach((slot, index) => {
      slot.setFillStyle(index < this.laughCharge ? 0xffd744 : 0xe4ddbf);
      if (index < this.laughCharge) slot.setScale(1.08);
      else slot.setScale(1);
    });
    if (canReleaseLaugh(this.laughCharge)) {
      this.chargeLabel.setText("按 E");
      this.chargeLabel.setColor("#d34024");
    } else {
      this.chargeLabel.setText(`差${MAX_LAUGH_CHARGE - this.laughCharge}只`);
      this.chargeLabel.setColor("#ba4f2d");
    }
  }

  private showHint(message: string, duration = 0): void {
    this.hintVersion += 1;
    const version = this.hintVersion;
    this.hintText.setText(message).setVisible(true);
    if (duration > 0) {
      this.time.delayedCall(duration, () => {
        if (!this.over && version === this.hintVersion) {
          this.hintText.setVisible(false);
        }
      });
    }
  }

  private gameOver(): void {
    if (this.over) return;
    this.over = true;
    this.running = false;
    this.audio.crash();
    this.cameras.main.shake(250, 0.018);

    const score = distanceScore(this.distanceMeters, this.bonusScore);
    const previousBest = Number.parseInt(localStorage.getItem("laugh-runner-best") ?? "0", 10);
    const best = Math.max(previousBest, score);
    localStorage.setItem("laugh-runner-best", String(best));

    this.frog.container.setAngle(86);
    this.tweens.add({
      targets: this.frog.container,
      y: FLOOR_Y + 18,
      duration: 300,
      ease: "Bounce.Out",
    });

    this.time.delayedCall(350, () => {
      const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x142d38, 0.68).setOrigin(0).setDepth(50);
      const panel = this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 520, 335, 0xfff9df)
        .setStrokeStyle(7, 0x18262d)
        .setDepth(51);
      const title = this.add
        .text(GAME_WIDTH / 2, 255, "笑着摔出去了", {
          fontFamily: "ZCOOL KuaiLe, sans-serif",
          fontSize: "48px",
          color: "#18262d",
        })
        .setOrigin(0.5)
        .setDepth(52);
      const result = this.add
        .text(GAME_WIDTH / 2, 332, `本次 ${score} 分  ·  最远 ${Math.floor(this.distanceMeters)} m\n最高分 ${best}`, {
          fontFamily: "Nunito, sans-serif",
          fontSize: "24px",
          align: "center",
          color: "#3b625e",
          lineSpacing: 10,
        })
        .setOrigin(0.5)
        .setDepth(52);
      const restart = this.add
        .rectangle(GAME_WIDTH / 2, 450, 236, 64, 0xffd744)
        .setStrokeStyle(5, 0x18262d)
        .setInteractive({ useHandCursor: true })
        .setDepth(52);
      const restartText = this.add
        .text(GAME_WIDTH / 2, 450, "再跑一次", {
          fontFamily: "Nunito, sans-serif",
          fontSize: "24px",
          fontStyle: "900",
          color: "#18262d",
        })
        .setOrigin(0.5)
        .setDepth(53);

      restart.on("pointerover", () => restart.setFillStyle(0xffe96a));
      restart.on("pointerout", () => restart.setFillStyle(0xffd744));
      restart.on("pointerdown", () => {
        shade.destroy();
        panel.destroy();
        title.destroy();
        result.destroy();
        restart.destroy();
        restartText.destroy();
        this.scene.restart({ autoStart: true });
      });
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#a8e5ec",
  scene: [RunnerScene],
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 3,
  },
});
