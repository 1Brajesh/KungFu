import Phaser from "phaser";
import { NetClient } from "../net/NetClient";
import { generateRoomCode, isValidRoomCode } from "../net/Protocol";

type LobbyView = "menu" | "creating" | "joining" | "waiting" | "error";

export class LobbyScene extends Phaser.Scene {
  private menuGroup!: Phaser.GameObjects.Group;
  private statusText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private codeText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private cancelButton!: Phaser.GameObjects.Text;

  private client: NetClient | null = null;
  private view: LobbyView = "menu";

  constructor() {
    super("LobbyScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#1a1a2e");

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add.text(cx, cy - 180, "KUNG FU", {
      fontSize: "72px",
      color: "#ffd700",
      stroke: "#000000",
      strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 120, "two-player browser fighter", {
      fontSize: "16px",
      color: "#cccccc",
    }).setOrigin(0.5);

    this.menuGroup = this.add.group();

    const localBtn = this.makeButton(cx, cy - 30, "Local 2P / vs CPU", () => {
      this.scene.start("GameScene", { mode: "local" });
    });
    const createBtn = this.makeButton(cx, cy + 40, "Create Online Room", () => {
      this.startCreate();
    });
    const joinBtn = this.makeButton(cx, cy + 110, "Join Online Room", () => {
      this.startJoin();
    });

    this.menuGroup.addMultiple([localBtn, createBtn, joinBtn]);

    // Status / waiting elements (hidden until needed)
    this.statusText = this.add.text(cx, cy - 30, "", {
      fontSize: "28px",
      color: "#ffffff",
    }).setOrigin(0.5).setVisible(false);

    this.codeText = this.add.text(cx, cy + 30, "", {
      fontSize: "56px",
      color: "#ffd700",
      stroke: "#000000",
      strokeThickness: 6,
      fontStyle: "bold",
    }).setOrigin(0.5).setVisible(false);

    this.subText = this.add.text(cx, cy + 100, "", {
      fontSize: "16px",
      color: "#cccccc",
    }).setOrigin(0.5).setVisible(false);

    this.hintText = this.add.text(cx, cy + 140, "", {
      fontSize: "14px",
      color: "#888888",
    }).setOrigin(0.5).setVisible(false);

    this.cancelButton = this.makeButton(cx, cy + 200, "Cancel", () => {
      this.cancel();
    });
    this.cancelButton.setVisible(false);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      // Don't auto-close client on shutdown when transitioning to GameScene —
      // it owns the client now. Only close on lobby cancel (handled separately).
    });
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    const txt = this.add.text(x, y, label, {
      fontSize: "22px",
      color: "#ffffff",
      backgroundColor: "#333366",
      padding: { left: 24, right: 24, top: 10, bottom: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    txt.on("pointerover", () => txt.setBackgroundColor("#4d4d99"));
    txt.on("pointerout", () => txt.setBackgroundColor("#333366"));
    txt.on("pointerdown", onClick);
    return txt;
  }

  private setView(v: LobbyView) {
    this.view = v;
    const menuVisible = v === "menu";
    this.menuGroup.setVisible(menuVisible);
    this.statusText.setVisible(!menuVisible);
    this.codeText.setVisible(!menuVisible);
    this.subText.setVisible(!menuVisible);
    this.hintText.setVisible(!menuVisible);
    this.cancelButton.setVisible(!menuVisible);
  }

  private async startCreate() {
    this.setView("creating");
    this.statusText.setText("Creating room...");
    this.codeText.setText("");
    this.subText.setText("");
    this.hintText.setText("");

    const code = generateRoomCode();
    const client = new NetClient();
    this.client = client;

    this.wireClientEvents(client);

    try {
      await client.connect(code);
      // After connect, the server will send 'joined' which sets the view to waiting
    } catch (e) {
      this.showError("Could not reach server. Try again.");
    }
  }

  private async startJoin() {
    const raw = window.prompt("Enter room code (5 letters/digits):");
    if (!raw) return;
    const code = raw.trim().toUpperCase();
    if (!isValidRoomCode(code)) {
      this.showError("Invalid code format");
      return;
    }

    this.setView("joining");
    this.statusText.setText("Connecting...");
    this.codeText.setText(code);
    this.subText.setText("Joining room");
    this.hintText.setText("");

    const client = new NetClient();
    this.client = client;
    this.wireClientEvents(client);

    try {
      await client.connect(code);
    } catch (e) {
      this.showError("Could not reach server. Try again.");
    }
  }

  private wireClientEvents(client: NetClient) {
    client.onJoined = (role) => {
      if (role === "host") {
        this.statusText.setText("Waiting for opponent...");
        this.codeText.setText(client.code ?? "");
        this.subText.setText("Share this code with your friend");
        this.hintText.setText("They click 'Join Online Room' and type the code");
      } else {
        this.statusText.setText("Connected — waiting for host...");
        this.subText.setText(`Joined room ${client.code}`);
      }
      this.setView("waiting");
    };
    client.onReady = () => {
      this.scene.start("GameScene", {
        mode: "online",
        role: client.role!,
        client,
      });
    };
    client.onPeerDisconnected = () => {
      this.statusText.setText("Opponent disconnected");
      this.subText.setText("Waiting for someone to rejoin...");
    };
    client.onError = (msg) => {
      this.showError(msg);
    };
    client.onClose = () => {
      if (this.view !== "menu") {
        this.showError("Connection closed");
      }
    };
  }

  private showError(message: string) {
    this.setView("error");
    this.statusText.setText("Error");
    this.codeText.setText("");
    this.subText.setText(message);
    this.hintText.setText("");
  }

  private cancel() {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.setView("menu");
  }
}
