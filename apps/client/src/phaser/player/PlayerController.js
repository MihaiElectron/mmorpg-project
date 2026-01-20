export default class PlayerController {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;

    this.cursors = scene.input.keyboard.createCursorKeys();

    // Déplacement souris
    this.mouseActive = false;
    this.target = null;
    this.arrivalThreshold = 4;
  }

  // Début du déplacement souris
  startMouseMove(x, y) {
    this.mouseActive = true;
    this.target = { x, y };
  }

  // Mise à jour de la destination tant que clic maintenu
  updateMouseTarget(x, y) {
    if (this.mouseActive) {
      this.target = { x, y };
    }
  }

  // Arrêt du déplacement souris
  stopMouseMove() {
    this.mouseActive = false;
    this.target = null;
  }

  update() {
    const speed = this.player.speed;
    let vx = 0;
    let vy = 0;

    /**
     * -------------------------------------------------------
     * 1. CLAVIER (prioritaire)
     * -------------------------------------------------------
     */
    if (this.cursors.left.isDown) vx = -speed;
    if (this.cursors.right.isDown) vx = speed;
    if (this.cursors.up.isDown) vy = -speed;
    if (this.cursors.down.isDown) vy = speed;

    if (vx !== 0 || vy !== 0) {
      this.mouseActive = false;
      this.target = null;
      this.player.setVelocity(vx, vy);
      return;
    }

    /**
     * -------------------------------------------------------
     * 2. DÉPLACEMENT SOURIS (maintien du clic)
     * -------------------------------------------------------
     */
    if (this.mouseActive && this.target) {
      const dx = this.target.x - this.player.x;
      const dy = this.target.y - this.player.y;
      const dist = Math.hypot(dx, dy);

      if (dist < this.arrivalThreshold) {
        this.player.setVelocity(0);
        return;
      }

      const nx = dx / dist;
      const ny = dy / dist;

      this.player.setVelocity(nx * speed, ny * speed);
      return;
    }

    /**
     * -------------------------------------------------------
     * 3. AUCUN INPUT
     * -------------------------------------------------------
     */
    this.player.setVelocity(0);
  }
}
