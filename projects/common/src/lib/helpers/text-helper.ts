export class TextHelper {
  /**
   * Takes a string returns something like "\<first-x-chars>...\<last-y-chars>""
   */
  static split(text: string, first: number, last: number): string {
    return `${text.slice(0, first)}...${text.slice(-last)}`;
  }
}
