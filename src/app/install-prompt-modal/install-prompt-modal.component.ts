import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { InstallPromptService } from '../core/install-prompt.service';

@Component({
  selector: 'app-install-prompt-modal',
  templateUrl: 'install-prompt-modal.component.html',
  styleUrls: ['install-prompt-modal.component.scss'],
  standalone: false,
})
export class InstallPromptModalComponent {
  installing = false;

  constructor(private modalCtrl: ModalController, private installPrompt: InstallPromptService) {}

  async install(): Promise<void> {
    this.installing = true;
    await this.installPrompt.triggerInstall();
    this.installing = false;
    this.modalCtrl.dismiss();
  }

  notNow(): void {
    this.installPrompt.dismiss();
    this.modalCtrl.dismiss();
  }
}
