import { Component, OnInit } from '@angular/core';
import { NotificationService } from './core/notification.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  constructor(private notifications: NotificationService) {}

  ngOnInit(): void {
    // Always register the service worker (required for installability/offline
    // support regardless of notification permission). Actual permission
    // *requests* only ever happen from an explicit user tap.
    this.notifications.setup();
  }
}
