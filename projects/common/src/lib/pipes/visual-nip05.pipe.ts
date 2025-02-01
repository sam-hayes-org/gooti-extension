import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'visualNip05',
})
export class VisualNip05Pipe implements PipeTransform {
  transform(value: string | undefined): string {
    if (typeof value === 'undefined') {
      return '';
    }

    if (value.startsWith('_@')) {
      return value.split('_@')[1];
    }

    return value;
  }
}
