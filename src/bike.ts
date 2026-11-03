import { World, Vec2, Body, CircleShape, PolygonShape, WheelJoint, Fixture } from 'planck';
import type { BikeSpec } from './catalog';

export interface BikePartData {
  kind: 'wheel' | 'chassis' | 'head' | 'torso';
  lc: { x: number; y: number }; // local center, for one-sided collision tests
}

export const WHEEL_R = 0.42;
const REAR = { x: -0.8, y: -0.45 };
const FRONT = { x: 0.85, y: -0.45 };
const HEAD = { x: 0.05, y: 1.2, r: 0.22 };
const TORSO = [
  { x: -0.42, y: 0.45 },
  { x: -0.18, y: 0.45 },
  { x: 0.12, y: 1.0 },
  { x: -0.12, y: 1.05 },
];

const BRAKE_TORQUE = 14;
const MAX_SPIN = 7.5;
const NITRO_FORCE = 75;
const NITRO_SPEED_MULT = 1.35;
const JUMP_SPEED = 11;

export interface Controls {
  gas: boolean;
  brake: boolean;
  leanBack: boolean;
  leanFwd: boolean;
}

const GROUP = -1; // bike parts never collide with each other

export class Bike {
  chassis: Body;
  rear: Body;
  front: Body;
  rearJ: WheelJoint;
  frontJ: WheelJoint;
  rider: Body | null = null; // set once the rider detaches
  private riderFixtures: Fixture[] = [];
  crashed = false;
  nitro = 0; // seconds of boost remaining

  constructor(private world: World, x: number, y: number, public spec: BikeSpec) {
    const pos = (l: { x: number; y: number }) => new Vec2(x + l.x, y + l.y);

    this.chassis = world.createBody({ type: 'dynamic', position: new Vec2(x, y), linearDamping: 0.12 });
    const chassisPts = [
      { x: -0.75, y: -0.15 },
      { x: 0.55, y: -0.15 },
      { x: 0.7, y: 0.35 },
      { x: -0.6, y: 0.3 },
    ];
    this.chassis.createFixture(new PolygonShape(chassisPts.map((p) => new Vec2(p.x, p.y))), {
      density: 2.2,
      friction: 0.4,
      filterGroupIndex: GROUP,
      userData: { kind: 'chassis', lc: { x: 0, y: 0.08 } } as BikePartData,
    });
    this.addRiderFixtures(this.chassis);

    const wheel = (l: { x: number; y: number }) => {
      const b = world.createBody({ type: 'dynamic', position: pos(l), linearDamping: 0.12 });
      b.createFixture(new CircleShape(WHEEL_R), {
        density: 1.3,
        friction: spec.grip,
        restitution: 0.05,
        filterGroupIndex: GROUP,
        userData: { kind: 'wheel', lc: { x: 0, y: 0 } } as BikePartData,
      });
      b.setBullet(true);
      return b;
    };
    this.rear = wheel(REAR);
    this.front = wheel(FRONT);

    const susp = { frequencyHz: spec.susp, dampingRatio: 0.7, enableMotor: false, maxMotorTorque: spec.torque };
    this.rearJ = world.createJoint(
      new WheelJoint(susp, this.chassis, this.rear, this.rear.getPosition(), new Vec2(0, 1)),
    )!;
    const forkAxis = new Vec2(-0.35, 1);
    forkAxis.normalize();
    this.frontJ = world.createJoint(
      new WheelJoint(susp, this.chassis, this.front, this.front.getPosition(), forkAxis),
    )!;
  }

  private addRiderFixtures(body: Body) {
    const head = body.createFixture(new CircleShape(new Vec2(HEAD.x, HEAD.y), HEAD.r), {
      density: 0.6,
      friction: 0.6,
      filterGroupIndex: GROUP,
      userData: { kind: 'head', lc: { x: HEAD.x, y: HEAD.y } } as BikePartData,
    });
    const torso = body.createFixture(new PolygonShape(TORSO.map((p) => new Vec2(p.x, p.y))), {
      density: 0.8,
      friction: 0.6,
      filterGroupIndex: GROUP,
      userData: { kind: 'torso', lc: { x: -0.15, y: 0.75 } } as BikePartData,
    });
    this.riderFixtures = [head, torso];
  }

  /** Forward speed along the bike's own axis (m/s). */
  forwardSpeed() {
    const v = this.chassis.getLinearVelocity();
    const a = this.chassis.getAngle();
    return v.x * Math.cos(a) + v.y * Math.sin(a);
  }

  speed() {
    return this.chassis.getLinearVelocity().length();
  }

  private bodies() {
    return [this.chassis, this.rear, this.front];
  }

  control(c: Controls, dt: number) {
    const s = this.spec;
    if (this.crashed) {
      this.rearJ.enableMotor(false);
      this.frontJ.enableMotor(false);
      this.nitro = 0;
      return;
    }
    const boosting = this.nitro > 0;
    if (boosting) {
      this.nitro = Math.max(0, this.nitro - dt);
      const a = this.chassis.getAngle();
      this.chassis.applyForceToCenter(new Vec2(Math.cos(a) * NITRO_FORCE, Math.sin(a) * NITRO_FORCE), true);
    }
    if (c.gas || boosting) {
      this.rearJ.enableMotor(true);
      this.rearJ.setMotorSpeed(-s.maxSpeed * (boosting ? NITRO_SPEED_MULT : 1));
      this.rearJ.setMaxMotorTorque(s.torque * (boosting ? 1.3 : 1));
      this.frontJ.enableMotor(false);
    } else if (c.brake) {
      if (this.forwardSpeed() > 0.6) {
        this.rearJ.enableMotor(true);
        this.frontJ.enableMotor(true);
        this.rearJ.setMotorSpeed(0);
        this.frontJ.setMotorSpeed(0);
        this.rearJ.setMaxMotorTorque(BRAKE_TORQUE);
        this.frontJ.setMaxMotorTorque(BRAKE_TORQUE * 0.6);
      } else {
        // Slow reverse
        this.frontJ.enableMotor(false);
        this.rearJ.enableMotor(true);
        this.rearJ.setMotorSpeed(14);
        this.rearJ.setMaxMotorTorque(s.torque * 0.5);
      }
    } else {
      this.rearJ.enableMotor(false);
      this.frontJ.enableMotor(false);
    }

    let lean = 0;
    if (c.leanBack) lean += 1;
    if (c.leanFwd) lean -= 1;
    if (lean !== 0) this.chassis.applyTorque(lean * s.lean, true);
    const w = this.chassis.getAngularVelocity();
    if (Math.abs(w) > MAX_SPIN) this.chassis.setAngularVelocity(Math.sign(w) * MAX_SPIN);
  }

  startNitro(seconds = 1.6) {
    this.nitro = seconds;
  }

  /** Launch upward, mostly world-up with a bit of the bike's own up. */
  superJump() {
    const a = this.chassis.getAngle();
    let dx = -Math.sin(a) * 0.35, dy = 0.65 + Math.cos(a) * 0.35;
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    for (const b of this.bodies()) {
      const v = b.getLinearVelocity();
      b.setLinearVelocity(new Vec2(v.x + dx * JUMP_SPEED * 0.5, Math.max(v.y, 0) + dy * JUMP_SPEED));
    }
  }

  /** Shield rescue: put the bike back upright above where it is, keeping some speed. */
  rescue() {
    const p = this.chassis.getPosition();
    const v = this.chassis.getLinearVelocity();
    const nv = new Vec2(Math.max(4, v.x * 0.7), Math.max(4, v.y));
    const x = p.x, y = p.y + 1.4;
    this.chassis.setTransform(new Vec2(x, y), 0);
    this.rear.setTransform(new Vec2(x + REAR.x, y + REAR.y), this.rear.getAngle());
    this.front.setTransform(new Vec2(x + FRONT.x, y + FRONT.y), this.front.getAngle());
    for (const b of this.bodies()) {
      b.setLinearVelocity(nv);
      b.setAngularVelocity(0);
    }
  }

  /** Detach the rider into its own tumbling body. Call outside of world.step. */
  crash() {
    if (this.crashed) return;
    this.crashed = true;
    this.nitro = 0;
    for (const f of this.riderFixtures) this.chassis.destroyFixture(f);
    this.riderFixtures = [];
    const rider = this.world.createBody({
      type: 'dynamic',
      position: this.chassis.getPosition().clone(),
      angle: this.chassis.getAngle(),
    });
    this.addRiderFixtures(rider);
    for (const f of this.riderFixtures) f.setFilterData({ groupIndex: 0, categoryBits: 1, maskBits: 0xffff });
    const c = this.chassis.getWorldPoint(new Vec2(-0.1, 0.8));
    const v = this.chassis.getLinearVelocityFromWorldPoint(c);
    rider.setLinearVelocity(new Vec2(v.x * 0.8, v.y * 0.8 + 2));
    rider.setAngularVelocity(this.chassis.getAngularVelocity() + 2);
    this.rider = rider;
  }

  destroy() {
    for (const b of [this.rear, this.front, this.chassis, this.rider]) if (b) this.world.destroyBody(b);
  }
}
