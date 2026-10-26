import Phaser from "phaser";
import "./styles.css";
import {
  MAX_LAUGH_CHARGE,
  addLaughCharge,
  canReleaseLaugh,
  distanceScore,
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
  belly: Phaser.GameObjects.Ellipse;
  leftArm: Phaser.GameObjects.Rectangle;
  rightArm: Phaser.GameObjects.Rectangle;
  leftLeg: Phaser.GameObjects.Rectangle;
  rightLeg: Phaser.GameObjects.Rectangle;
  pupils: Phaser.GameObjects.Ellipse[];
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
  private jumpsUsed = 0;
  private rollingUntil = 0;
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
    this.jumpsUsed = 0;
    this.rollingUntil = 0;
    this.rageUntil = 0;
    this.laughCharge = 0;
    this.obstaclesSpawned = 0;
    this.laughPickupsSpawned = 0;
    this.hintVersion = 0;

    this.createBackground();
    this.frog = this.createFrog();
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
      this.moveScenery(dt, 70);
      return;
    }

    this.elapsedSeconds += dt;
    const speed = runnerSpeed(this.elapsedSeconds);
    this.distanceMeters += speed * dt * 0.011;

    this.updatePlayer(dt, time);
    this.moveScenery(dt, speed);
    this.updateWorldObjects(dt, speed, time);
    this.spawnWorldObjects(time);
    this.checkCollisions(time);
    this.updateHud();
  }

  private startRun(): void {
    if (this.running || this.over) return;
    this.audio.unlock();
    this.running = true;
    const now = this.time.now;
    this.nextObstacleAt = now + 4600;
    this.nextPickupAt = now + 600;
    this.nextRageAt = now + 9000;
    this.showHint("空格跳跃 · S翻滚 · X大笑", 3200);
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

    const leftLeg = this.add
      .rectangle(-28, -13, 18, 52, 0xe6b730)
      .setStrokeStyle(5, 0x18262d)
      .setOrigin(0.5, 0.18);
    const rightLeg = this.add
      .rectangle(28, -13, 18, 52, 0xe6b730)
      .setStrokeStyle(5, 0x18262d)
      .setOrigin(0.5, 0.18);
    const leftArm = this.add
      .rectangle(-48, -70, 16, 58, 0xf2c63a)
      .setStrokeStyle(5, 0x18262d)
      .setOrigin(0.5, 0.15);
    const rightArm = this.add
      .rectangle(48, -70, 16, 58, 0xf2c63a)
      .setStrokeStyle(5, 0x18262d)
      .setOrigin(0.5, 0.15);
    const body = this.add
      .ellipse(0, -58, 96, 114, 0xf7ce3e)
      .setStrokeStyle(6, 0x18262d);
    const belly = this.add.ellipse(2, -43, 64, 66, 0xffe26b).setStrokeStyle(3, 0xd49c2f, 0.7);
    const leftEye = this.add
      .ellipse(-24, -119, 37, 42, 0xc6f28f)
      .setStrokeStyle(6, 0x18262d);
    const rightEye = this.add
      .ellipse(23, -119, 37, 42, 0xc6f28f)
      .setStrokeStyle(6, 0x18262d);
    const leftPupil = this.add.ellipse(-19, -116, 10, 14, 0x18262d);
    const rightPupil = this.add.ellipse(28, -116, 10, 14, 0x18262d);

    const mouth = this.add.graphics();
    mouth.lineStyle(5, 0x18262d, 1);
    mouth.beginPath();
    mouth.arc(0, -74, 24, 0.12, Math.PI - 0.12, false);
    mouth.strokePath();

    const cheekLeft = this.add.circle(-31, -78, 7, 0xff8a6f, 0.75);
    const cheekRight = this.add.circle(31, -78, 7, 0xff8a6f, 0.75);
    const highlight = this.add.ellipse(-19, -69, 14, 24, 0xffffff, 0.28).setAngle(18);

    container.add([
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      body,
      belly,
      leftEye,
      rightEye,
      leftPupil,
      rightPupil,
      mouth,
      cheekLeft,
      cheekRight,
      highlight,
    ]);

    return {
      container,
      body,
      belly,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      pupils: [leftPupil, rightPupil],
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
    this.input.keyboard?.on("keydown-SPACE", () => this.jump());
    this.input.keyboard?.on("keydown-UP", () => this.jump());
    this.input.keyboard?.on("keydown-S", () => this.roll());
    this.input.keyboard?.on("keydown-DOWN", () => this.roll());
    this.input.keyboard?.on("keydown-X", () => this.releaseLaugh());
    this.input.keyboard?.on("keydown-K", () => this.releaseLaugh());
    this.input.on("pointerdown", () => {
      if (this.running && !this.over) this.jump();
    });

    const jumpButton = document.querySelector<HTMLButtonElement>("#jumpButton");
    const rollButton = document.querySelector<HTMLButtonElement>("#rollButton");
    const laughButton = document.querySelector<HTMLButtonElement>("#laughButton");
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
    this.frog.container.setScale(1.13, 0.92);
    this.tweens.add({
      targets: this.frog.container,
      scaleX: 1,
      scaleY: 1,
      duration: 440,
      ease: "Bounce.Out",
    });

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

    let destroyed = 0;
    for (const obstacle of [...this.obstacles]) {
      if (obstacle.kind !== "pit" && obstacle.node.x < 980) {
        this.destroyObstacle(obstacle, true);
        destroyed += 1;
      }
    }
    this.bonusScore += destroyed * 180;
    this.showHint(destroyed > 0 ? `齁哈哈哈！震飞 ${destroyed} 个障碍` : "齁哈哈哈！", 850);
    this.updateHud();
  }

  private updatePlayer(dt: number, time: number): void {
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
    const raging = time < this.rageUntil;
    const targetScaleY = rolling ? 0.58 : 1;
    const targetAngle = rolling ? 360 * ((time % 560) / 560) : 0;
    this.frog.container.scaleY = Phaser.Math.Linear(this.frog.container.scaleY, targetScaleY, 0.25);
    this.frog.container.angle = Phaser.Math.Angle.RotateTo(
      Phaser.Math.DegToRad(this.frog.container.angle),
      Phaser.Math.DegToRad(targetAngle),
      0.28,
    ) * (180 / Math.PI);
    this.frog.body.setFillStyle(raging ? 0xff7b42 : 0xf7ce3e);
    this.frog.belly.setFillStyle(raging ? 0xffb146 : 0xffe26b);
  }

  private animateFrog(phase: number, time: number): void {
    const activePace = this.running && !this.over ? 1 : 0.35;
    const swing = Math.sin(phase * activePace);
    const reverseSwing = Math.sin(phase * activePace + Math.PI);
    const rolling = time < this.rollingUntil;

    if (!rolling) {
      this.frog.leftArm.rotation = swing * 0.72;
      this.frog.rightArm.rotation = reverseSwing * 0.72;
      this.frog.leftLeg.rotation = reverseSwing * 0.62;
      this.frog.rightLeg.rotation = swing * 0.62;
      this.frog.belly.scaleX = 1 + Math.abs(swing) * 0.035;
      this.frog.belly.scaleY = 1 - Math.abs(swing) * 0.028;
      this.frog.container.x = PLAYER_X + Math.sin(phase * 0.5) * 2.5;
    }

    this.frog.pupils[0].x = -19 + Math.sin(phase * 0.31) * 2;
    this.frog.pupils[1].x = 28 + Math.sin(phase * 0.31) * 2;
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
    const node = this.add.container(GAME_WIDTH + 100, FLOOR_Y).setDepth(4);
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
    const width = rolling ? 84 : 70;
    const height = rolling ? 55 : 108;
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
        canReleaseLaugh(this.laughCharge) ? "大笑已合成！按 X 释放" : `大笑合成 ${this.laughCharge}/3`,
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
      this.chargeLabel.setText("按 X");
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
