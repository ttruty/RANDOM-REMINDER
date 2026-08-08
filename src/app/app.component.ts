import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { InstallPromptService } from './core/install-prompt.service';
import { InstallPromptModalComponent } from './install-prompt-modal/install-prompt-modal.component';
import { NotificationService } from './core/notification.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  private installModalShown = false;

  constructor(
    private notifications: NotificationService,
    private installPrompt: InstallPromptService,
    private modalCtrl: ModalController
  ) {}

  ngOnInit(): void {
    // Always register the service worker (required for installability/offline
    // support regardless of notification permission). Actual permission
    // *requests* only ever happen from an explicit user tap.
    this.notifications.setup();

    // On Android, once Chrome tells us the app is installable, offer a modal
    // instead of relying on the user to find "Add to Home screen" themselves.
    this.installPrompt.promptAvailable$.subscribe((available) => {
      if (available && this.installPrompt.shouldOfferInstall() && !this.installModalShown) {
        this.installModalShown = true;
        setTimeout(() => this.presentInstallModal(), 1500);
      }
    });
  }

  private async presentInstallModal(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: InstallPromptModalComponent,
      breakpoints: [0, 0.6],
      initialBreakpoint: 0.6,
      handle: true,
    });
    await modal.present();
  }
}
