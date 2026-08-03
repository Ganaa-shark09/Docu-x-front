import { NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [
    // NgIf, 
    ReactiveFormsModule],
  templateUrl: './chat-input.component.html',
  styleUrl: './chat-input.component.scss',
})
export class ChatInputComponent {
  private readonly fb = inject(FormBuilder);

  @Input() isSending = false;
  @Output() sendMessage = new EventEmitter<string>();

  readonly form = this.fb.nonNullable.group({
    message: ['', [Validators.required]],
  });

  handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') {
      return;
    }

    if (event.shiftKey) {
      return;
    }

    event.preventDefault();
    this.submit();
  }

  submit(): void {
    if (this.form.invalid || this.isSending) {
      this.form.markAllAsTouched();
      return;
    }

    const message = this.form.controls.message.value.trim();

    if (!message) {
      return;
    }

    this.sendMessage.emit(message);
    this.form.reset({ message: '' });
  }
}
