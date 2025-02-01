import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'visualRelay',
})
export class VisualRelayPipe implements PipeTransform {
  transform(value: string): string {
    return value.toLowerCase().replaceAll('wss://', '');
  }
}
