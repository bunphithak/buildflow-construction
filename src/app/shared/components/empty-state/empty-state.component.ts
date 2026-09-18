import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  @Input() title = 'ไม่พบข้อมูล';
  @Input() message = 'ยังไม่มีข้อมูลในหน้านี้';
}
