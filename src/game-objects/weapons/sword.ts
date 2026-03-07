import { BaseWeapon } from './base-weapon';
import { DIRECTION } from '../../common/common';

export class Sword extends BaseWeapon {
  public attackUp(): void {
    this._weaponComponent.body.setSize(20, 12);
    this._weaponComponent.body.position.set(this._sprite.x - 10, this._sprite.y - 16);
    this.attack(DIRECTION.UP);
  }

  public attackDown(): void {
    this._weaponComponent.body.setSize(20, 12);
    if (this._sprite.flipX) {
      this._weaponComponent.body.position.set(this._sprite.x - 12, this._sprite.y + 6);
    } else {
      this._weaponComponent.body.position.set(this._sprite.x - 6, this._sprite.y + 6);
    }
    this.attack(DIRECTION.DOWN);
  }

  public attackRight(): void {
    this._weaponComponent.body.setSize(12, 20);
    this._weaponComponent.body.position.set(this._sprite.x + 6, this._sprite.y - 10);
    this.attack(DIRECTION.RIGHT);
  }

  public attackLeft(): void {
    this._weaponComponent.body.setSize(12, 20);
    this._weaponComponent.body.position.set(this._sprite.x - 18, this._sprite.y - 10);
    this.attack(DIRECTION.LEFT);
  }
}
